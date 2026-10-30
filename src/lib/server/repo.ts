import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { enTransaccion, pool } from "./pg";
import { BORRABLES, JSONB, ORDEN, SQL_NOMBRE, TABLAS, type Tabla } from "./tablas";

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
  const inmutable = tabla === "lineas" || tabla === "eventos" || tabla === "asistencias" || tabla === "cierres" || tabla === "cierres_semana";
  const actualizables = cols.filter((x) => x !== "id" && x !== "tenant_id");
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400);
    const valores: unknown[] = [];
    const tuplas = lote.map((f) => {
      const ph = cols.map((col) => {
        let v = col === "tenant_id" ? tenant : (f[col] ?? null);
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
export async function aplicarCambios(tenant: string, cambios: Cambio[], t: CambiosTenant = {}) {
  return enTransaccion(async (c) => {
    const lock = await c.query("select ultimo_numero from tenants where id = $1 for update", [tenant]);
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

    // movimientos nuevos: asegurar N° único
    const movs = porTabla.get("movimientos")?.put ?? [];
    if (movs.length) {
      const ids = movs.map((m) => String(m.id));
      const existentes = new Set((await c.query("select id from movimientos where id = any($1)", [ids])).rows.map((r) => r.id));
      const nuevos = movs.filter((m) => !existentes.has(String(m.id)));
      if (nuevos.length) {
        const usados = new Set(
          (await c.query("select numero from movimientos where tenant_id = $1 and numero = any($2)", [tenant, nuevos.map((m) => Number(m.numero))])).rows.map((r) => Number(r.numero)),
        );
        const enLote = new Set<number>();
        for (const m of nuevos.sort((a, b) => Number(a.numero) - Number(b.numero))) {
          let n = Number(m.numero);
          if (usados.has(n) || enLote.has(n)) {
            n = Math.max(ultimo, ...enLote) + 1;
            m.numero = n;
            renumerados.push({ id: String(m.id), numero: n });
          }
          enLote.add(n);
          ultimo = Math.max(ultimo, n);
        }
      }
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
    return { renumerados, ultimo_numero: ultimo };
  });
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
