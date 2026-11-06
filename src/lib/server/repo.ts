import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { enTransaccion, pool } from "./pg";
import { BORRABLES, JSONB, ORDEN, SQL_NOMBRE, TABLAS, type Tabla } from "./tablas";
import { anotarHistorial, diferencias, entradaDe, type Entrada, type Quien } from "./historial";

/** Valor si el navegador no manda la columna (p. ej. un equipo con la versión anterior abierta) */
const POR_DEFECTO: Record<string, unknown> = { activo: true, numero_manual: false, importado: false };

/** Talonario de cada tipo (igual que serieDe en src/lib/calc.ts) */
function serie(tipo: string): string {
  if (tipo === "VALE_VENTA" || tipo === "VALE_CREDITO") return "VALE";
  if (tipo === "ABONO") return "ABONO";
  if (tipo === "ENVASE_COBRO" || tipo === "ENVASE_DEVOLUCION") return "ENVASE";
  return "CAJA";
}
const SERIE_SQL = `case when tipo in ('VALE_VENTA', 'VALE_CREDITO') then 'VALE' when tipo = 'ABONO' then 'ABONO'
  when tipo in ('ENVASE_COBRO', 'ENVASE_DEVOLUCION') then 'ENVASE' else 'CAJA' end`;

/** Tablas cuyo historial se anota fila a fila (las líneas van dentro de su vale; la bitácora es aparte) */
const CON_HISTORIAL: Tabla[] = ["usuarios", "clientes", "productos", "trabajadores", "envases", "movimientos", "cierres", "cierres_semana", "asistencias", "pagos_sueldo"];
const SISTEMA: Quien = { tipo: "SISTEMA", id: null, nombre: "Sistema" };

export interface Cambio {
  tabla: Tabla;
  op: "put" | "del";
  fila: Record<string, unknown>;
}

export interface CambiosTenant {
  ultimo_numero?: number;
  config?: Record<string, unknown>;
}

type Fila = Record<string, unknown>;

/* ------------------------------- leer todo ------------------------------- */

export async function leerDb(tenant: string) {
  const db = pool();
  const t = await db.query("select id, nombre, ubicacion, ultimo_numero, config, created_at from tenants where id = $1", [tenant]);
  if (!t.rows[0]) return null;
  const { config, ...tenantRow } = t.rows[0];
  const out: Record<string, unknown> = { version: 1, tenant: tenantRow, config };
  const consultas = ORDEN.map(async (tabla) => {
    const orden = tabla === "movimientos" ? " order by numero" : tabla === "eventos" ? " order by at" : "";
    const r = await db.query(`select ${TABLAS[tabla].join(", ")} from ${SQL_NOMBRE[tabla]} where tenant_id = $1${orden}`, [tenant]);
    out[tabla] = r.rows;
  });
  await Promise.all(consultas);
  return out;
}

/* ------------------------------ escribir ------------------------------ */

async function upsert(c: PoolClient, tabla: Tabla, filas: Fila[], tenant: string) {
  const cols = TABLAS[tabla] as readonly string[];
  const nombre = SQL_NOMBRE[tabla];
  // lo contable solo se agrega; movimientos y pagos pueden pasar a "anulado"; maestros se editan
  const inmutable = tabla === "lineas" || tabla === "lineas_envase" || tabla === "eventos" || tabla === "asistencias" || tabla === "cierres" || tabla === "cierres_semana";
  const actualizables = cols.filter((x) => x !== "id" && x !== "tenant_id");
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400);
    const valores: unknown[] = [];
    const tuplas = lote.map((f) => {
      const ph = cols.map((col) => {
        let v = col === "tenant_id" ? tenant : (f[col] ?? (col in POR_DEFECTO ? POR_DEFECTO[col] : null));
        if (JSONB.has(col) && v !== null) v = JSON.stringify(v);
        valores.push(v);
        return `$${valores.length}`;
      });
      return `(${ph.join(", ")})`;
    });
    const conflicto = inmutable
      ? "on conflict (id) do nothing"
      : `on conflict (id) do update set ${actualizables.map((x) => `${x} = excluded.${x}`).join(", ")} where ${nombre}.tenant_id = excluded.tenant_id`;
    await c.query(`insert into ${nombre} (${cols.join(", ")}) values ${tuplas.join(", ")} ${conflicto}`, valores);
  }
}

/**
 * Aplica los cambios de un PC en una transacción. El N° de vale lo decide el
 * servidor: si otro PC ya usó ese número, se le asigna el siguiente libre y
 * se avisa en `renumerados`.
 */
export async function aplicarCambios(tenant: string, cambios: Cambio[], t: CambiosTenant = {}, quien: Quien = SISTEMA, ip: string | null = null) {
  return enTransaccion(async (c) => {
    const lock = await c.query("select ultimo_numero, config from tenants where id = $1 for update", [tenant]);
    if (!lock.rows[0]) throw new Error("Tenant no existe");
    let ultimo: number = lock.rows[0].ultimo_numero;
    const renumerados: { id: string; numero: number }[] = [];

    const porTabla = new Map<Tabla, { put: Fila[]; del: string[] }>();
    for (const x of cambios) {
      if (!(x.tabla in TABLAS)) throw new Error(`Tabla no permitida: ${x.tabla}`);
      const g = porTabla.get(x.tabla) ?? { put: [], del: [] };
      if (x.op === "del") {
        if (!BORRABLES.includes(x.tabla)) throw new Error(`No se puede borrar en ${x.tabla}`);
        g.del.push(String(x.fila.id));
      } else g.put.push(x.fila);
      porTabla.set(x.tabla, g);
    }

    // movimientos nuevos con N° AUTOMÁTICO: si otro equipo ya usó ese N° en el
    // mismo talonario, se le da el siguiente. Un N° escrito a mano se respeta
    // tal cual (puede ser 0 o repetido).
    const movs = porTabla.get("movimientos")?.put ?? [];
    if (movs.length) {
      const ids = movs.map((m) => String(m.id));
      const existentes = new Set((await c.query("select id from movimientos where id = any($1)", [ids])).rows.map((r) => r.id));
      const nuevos = movs.filter((m) => !existentes.has(String(m.id)));
      const automaticos = nuevos.filter((m) => !m.numero_manual && !(m.tipo === "ABONO" && m.origen_id));
      if (automaticos.length) {
        const r = await c.query(
          `select ${SERIE_SQL} as serie, numero from movimientos
            where tenant_id = $1 and numero > 0 and not (tipo = 'ABONO' and origen_id is not null)`,
          [tenant],
        );
        const usados = new Map<string, Set<number>>();
        const mayor = new Map<string, number>();
        const marcar = (serie: string, n: number) => {
          if (!usados.has(serie)) usados.set(serie, new Set());
          usados.get(serie)!.add(n);
          mayor.set(serie, Math.max(mayor.get(serie) ?? 0, n));
        };
        for (const x of r.rows) marcar(String(x.serie), Number(x.numero));
        // los manuales del mismo lote también ocupan su N°
        for (const m of nuevos) if (m.numero_manual && Number(m.numero) > 0 && !(m.tipo === "ABONO" && m.origen_id)) marcar(serie(String(m.tipo)), Number(m.numero));
        // movimientos del mismo lote con el mismo N° automático son partes de una misma
        // operación (abono combinado): si hay que renumerar, se renumeran juntos
        const asignado = new Map<string, number>();
        for (const m of automaticos.sort((a, b) => Number(a.numero) - Number(b.numero))) {
          const s = serie(String(m.tipo));
          let n = Number(m.numero);
          const clave = `${s}:${n}`;
          if (asignado.has(clave)) {
            const nuevo = asignado.get(clave)!;
            if (nuevo !== n) {
              m.numero = nuevo;
              renumerados.push({ id: String(m.id), numero: nuevo });
            }
            continue;
          }
          if (usados.get(s)?.has(n)) {
            const viejo = n;
            n = (mayor.get(s) ?? 0) + 1;
            m.numero = n;
            renumerados.push({ id: String(m.id), numero: n });
            // lo pagado en el mismo vale sigue al vale
            for (const x of nuevos) if (x.origen_id === m.id && Number(x.numero) === viejo) x.numero = n;
          }
          asignado.set(clave, n);
          marcar(s, n);
          ultimo = Math.max(ultimo, n);
        }
      }
      for (const m of nuevos) ultimo = Math.max(ultimo, Number(m.numero) || 0);
    }

    /* ---------- quién lo hizo: lo pone el servidor según la sesión ---------- */
    const previas = new Map<Tabla, Map<string, Fila>>();
    for (const tabla of CON_HISTORIAL) {
      const g = porTabla.get(tabla);
      const ids = [...(g?.put ?? []).map((f) => String(f.id)), ...(g?.del ?? [])];
      if (!ids.length) continue;
      const r = await c.query(`select ${TABLAS[tabla].join(", ")} from ${SQL_NOMBRE[tabla]} where tenant_id = $1 and id = any($2)`, [tenant, ids]);
      previas.set(tabla, new Map(r.rows.map((x: Fila) => [String(x.id), x])));
    }
    const humano = quien.tipo !== "SISTEMA";
    const estampar = (tabla: Tabla, f: Fila) => {
      const antes = previas.get(tabla)?.get(String(f.id));
      if (tabla === "movimientos" || tabla === "pagos_sueldo") {
        if (antes) f.creado_por = antes.creado_por;
        else if (humano && !f.importado) f.creado_por = quien.nombre;
        if (antes?.anulado_at) f.anulado_por = antes.anulado_por;
        else if (f.anulado_at && humano) f.anulado_por = quien.nombre;
      }
      if ((tabla === "cierres" || tabla === "cierres_semana") && !antes && humano) f.cerrado_por = quien.nombre;
    };
    for (const tabla of CON_HISTORIAL) for (const f of porTabla.get(tabla)?.put ?? []) estampar(tabla, f);
    if (humano) for (const f of porTabla.get("eventos")?.put ?? []) f.usuario = quien.nombre;

    /* ---------- historial ---------- */
    const nombres = async (tabla: "clientes" | "trabajadores", ids: unknown[]) => {
      const m = new Map<string, string>();
      for (const f of porTabla.get(tabla)?.put ?? []) m.set(String(f.id), String((tabla === "clientes" ? f.alias : null) ?? f.nombre));
      const faltan = [...new Set(ids.filter((x) => x && !m.has(String(x))).map(String))];
      if (faltan.length) {
        const r = await c.query(`select id, ${tabla === "clientes" ? "coalesce(alias, nombre)" : "nombre"} as n from ${tabla} where tenant_id = $1 and id = any($2)`, [tenant, faltan]);
        for (const x of r.rows) m.set(String(x.id), String(x.n));
      }
      return (id: unknown) => m.get(String(id)) ?? "—";
    };
    const todas = CON_HISTORIAL.flatMap((tb) => porTabla.get(tb)?.put ?? []);
    const ctx = {
      cliente: await nombres("clientes", todas.map((f) => f.cliente_id)),
      trabajador: await nombres("trabajadores", todas.map((f) => f.trabajador_id)),
    };
    const entradas: Entrada[] = [];
    for (const tabla of CON_HISTORIAL) {
      const g = porTabla.get(tabla);
      if (!g) continue;
      for (const f of g.put) {
        const e = entradaDe(tabla, previas.get(tabla)?.get(String(f.id)) ?? null, f, TABLAS[tabla], ctx);
        if (e) entradas.push(e);
      }
      for (const id of g.del) {
        const antes = previas.get(tabla)?.get(id);
        if (antes) {
          const e = entradaDe(tabla, null, antes, TABLAS[tabla], ctx)!;
          entradas.push({ ...e, accion: "BORRAR", descripcion: `Quitó: ${e.descripcion}` });
        }
      }
    }
    if (t.config) {
      const dif = diferencias((lock.rows[0].config ?? {}) as Fila, t.config as Fila, Object.keys(t.config));
      if (Object.keys(dif).length) entradas.push({ tabla: "ajustes", registro_id: null, accion: "MODIFICAR", descripcion: "Ajustes del local", cambios: dif });
    }

    for (const tabla of ORDEN) {
      const g = porTabla.get(tabla);
      if (!g) continue;
      if (g.put.length) await upsert(c, tabla, g.put, tenant);
      if (g.del.length) await c.query(`delete from ${SQL_NOMBRE[tabla]} where tenant_id = $1 and id = any($2)`, [tenant, g.del]);
    }

    ultimo = Math.max(ultimo, t.ultimo_numero ?? 0);
    await c.query("update tenants set ultimo_numero = $2 where id = $1", [tenant, ultimo]);
    if (t.config) await c.query("update tenants set config = $2 where id = $1", [tenant, JSON.stringify(t.config)]);
    if (humano) await anotarHistorial(c, tenant, quien, ip, resumirMasivos(entradas));
    return { renumerados, ultimo_numero: ultimo };
  });
}

/** Una carga masiva (importar planilla) queda como una entrada por tipo, no miles. */
function resumirMasivos(entradas: Entrada[], limite = 100): Entrada[] {
  const creados = new Map<string, Entrada[]>();
  for (const e of entradas) if (e.accion === "CREAR") creados.set(e.tabla, [...(creados.get(e.tabla) ?? []), e]);
  const masivas = new Set([...creados].filter(([, xs]) => xs.length > limite).map(([t]) => t));
  if (!masivas.size) return entradas;
  const out = entradas.filter((e) => !(e.accion === "CREAR" && masivas.has(e.tabla)));
  for (const t of masivas) {
    const xs = creados.get(t)!;
    out.push({
      tabla: t,
      registro_id: null,
      accion: "CREAR",
      descripcion: `Carga masiva: ${xs.length.toLocaleString("es-CL")} registros nuevos (desde «${xs[0].descripcion}» hasta «${xs[xs.length - 1].descripcion}»)`,
    });
  }
  return out;
}

/* ------------------------------ instalar ------------------------------ */

export async function crearEsquema() {
  const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool().query(sql);
}

export async function crearTenant(t: { id: string; nombre: string; ubicacion: string; ultimo_numero: number; config: Record<string, unknown> }) {
  await pool().query(
    "insert into tenants (id, nombre, ubicacion, ultimo_numero, config) values ($1, $2, $3, $4, $5) on conflict (id) do nothing",
    [t.id, t.nombre, t.ubicacion, t.ultimo_numero, JSON.stringify(t.config)],
  );
}
