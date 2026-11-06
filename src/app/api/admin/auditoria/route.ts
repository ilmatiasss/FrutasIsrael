import { NextResponse } from "next/server";
import { pool } from "@/lib/server/pg";
import { acceso } from "@/lib/server/auth";
import { leerDb } from "@/lib/server/repo";
import { verificar, type Chequeo } from "@/lib/verificacion";
import { estadoCliente, indexar, resumenCaja } from "@/lib/calc";
import type { Config, Db } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Auditoría de la base REAL (no la copia de un computador): solo administradores.
 * 1) Las mismas verificaciones de la app, corridas sobre lo que está en la base.
 * 2) Chequeos SQL directos (cruces, huérfanos, anulaciones a medias…).
 * 3) Dos cálculos independientes comparados: saldos y caja según las vistas SQL
 *    vs. según la app. Si no coinciden, hay algo raro en los datos.
 * No modifica nada.
 */

const CONFIG_BASE: Config = { dias_amarillo: 15, dias_rojo: 30, dias_sin_compra: 21, usuario_actual: "Auditoría" };
const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

interface Regla {
  titulo: string;
  estado: "error" | "aviso";
  sql: string; // devuelve filas con una columna "item"
  ok: string;
  mal: (n: number) => string;
}

const REGLAS: Regla[] = [
  {
    titulo: "Vales: total = suma de sus líneas (SQL)",
    estado: "error",
    sql: `select 'N°' || m.numero || ': total ' || m.total || ' vs líneas ' || sum(l.subtotal) as item
            from movimientos m join lineas_vale l on l.movimiento_id = m.id
           where m.tenant_id = $1 group by m.id having sum(l.subtotal) <> m.total`,
    ok: "Cada vale con productos suma exactamente sus líneas.",
    mal: (n) => `${n} vales no suman sus líneas.`,
  },
  {
    titulo: "Líneas: subtotal = cantidad × precio",
    estado: "error",
    sql: `select 'N°' || m.numero || ': ' || l.cantidad || ' × ' || l.precio_unitario || ' ≠ ' || l.subtotal as item
            from lineas_vale l join movimientos m on m.id = l.movimiento_id
           where l.tenant_id = $1 and round(l.cantidad * l.precio_unitario) <> l.subtotal`,
    ok: "Todas las líneas están bien multiplicadas.",
    mal: (n) => `${n} líneas mal calculadas.`,
  },
  {
    titulo: "Líneas en el lugar correcto",
    estado: "error",
    sql: `select 'Línea de producto en N°' || m.numero || ' (' || m.tipo || ')' as item
            from lineas_vale l join movimientos m on m.id = l.movimiento_id
           where l.tenant_id = $1 and m.tipo not in ('VALE_VENTA', 'VALE_CREDITO')
          union all
          select 'Línea de envase en N°' || m.numero || ' (' || m.tipo || ')'
            from lineas_envase l join movimientos m on m.id = l.movimiento_id
           where l.tenant_id = $1 and m.tipo not in ('ENVASE_COBRO', 'ENVASE_DEVOLUCION')
          union all
          select 'Envases N°' || m.numero || ' sin detalle'
            from movimientos m
           where m.tenant_id = $1 and m.tipo in ('ENVASE_COBRO', 'ENVASE_DEVOLUCION')
             and not exists (select 1 from lineas_envase l where l.movimiento_id = m.id)`,
    ok: "Productos solo en vales, envases solo en entregas/devoluciones, y ninguna entrega sin detalle.",
    mal: (n) => `${n} líneas o movimientos fuera de lugar.`,
  },
  {
    titulo: "Pagos dentro de un vale (combinado / abona ahora)",
    estado: "error",
    sql: `select 'Pago N°' || a.numero || ': ' ||
                 case when v.id is null then 'su vale no existe'
                      when v.tipo <> 'VALE_CREDITO' then 'su vale no es crédito'
                      when v.cliente_id is distinct from a.cliente_id then 'cliente distinto al del vale'
                      when v.fecha <> a.fecha then 'fecha distinta a la del vale'
                      else 'vigente aunque el vale está anulado' end as item
            from movimientos a left join movimientos v on v.id = a.origen_id
           where a.tenant_id = $1 and a.origen_id is not null and a.anulado_at is null
             and (v.id is null or v.tipo <> 'VALE_CREDITO' or v.cliente_id is distinct from a.cliente_id or v.fecha <> a.fecha or v.anulado_at is not null)
          union all
          select 'Vale N°' || v.numero || ': pagado ' || sum(a.total) || ' de ' || v.total
            from movimientos v join movimientos a on a.origen_id = v.id and a.anulado_at is null
           where v.tenant_id = $1 and v.anulado_at is null
           group by v.id having sum(a.total) > v.total`,
    ok: "Cada pago hecho en un vale apunta a su vale, mismo cliente y fecha, y no supera el total.",
    mal: (n) => `${n} pagos dentro de vales con problemas.`,
  },
  {
    titulo: "Abonos combinados completos",
    estado: "error",
    sql: `select 'Abono N°' || numero || ' del ' || fecha || ': una parte anulada y otra vigente' as item
            from movimientos
           where tenant_id = $1 and tipo = 'ABONO' and origen_id is null and glosa like '%Abono combinado:%'
           group by numero, cliente_id, fecha, glosa
          having bool_or(anulado_at is null) and bool_or(anulado_at is not null)`,
    ok: "Ningún abono combinado quedó anulado a medias.",
    mal: (n) => `${n} abonos combinados anulados a medias.`,
  },
  {
    titulo: "Remuneraciones vs egresos de caja (SQL)",
    estado: "error",
    sql: `select t.nombre || ' ' || p.fecha || ': ' ||
                 case when m.id is null then 'el egreso no existe'
                      when m.total <> p.monto then 'pago ' || p.monto || ' ≠ egreso ' || m.total
                      when m.tipo <> 'EGRESO' then 'no es un egreso'
                      else 'pago y egreso con distinto estado de anulación' end as item
            from pagos_sueldo p join trabajadores t on t.id = p.trabajador_id
            left join movimientos m on m.id = p.movimiento_id
           where p.tenant_id = $1 and p.movimiento_id is not null
             and (m.id is null or m.total <> p.monto or m.tipo <> 'EGRESO' or (p.anulado_at is null) <> (m.anulado_at is null))`,
    ok: "Cada sueldo pagado del cajón tiene su egreso, por el mismo monto y en el mismo estado.",
    mal: (n) => `${n} remuneraciones no cuadran con su egreso.`,
  },
  {
    titulo: "Anulaciones con motivo y responsable",
    estado: "aviso",
    sql: `select 'N°' || numero || ' (' || tipo || ')' as item from movimientos
           where tenant_id = $1 and anulado_at is not null and (coalesce(trim(motivo_anulacion), '') = '' or coalesce(anulado_por, '') = '')`,
    ok: "Todas las anulaciones tienen motivo y quién las hizo.",
    mal: (n) => `${n} anulaciones sin motivo o sin responsable.`,
  },
  {
    titulo: "Sin cruces entre locales",
    estado: "error",
    sql: `select 'N°' || m.numero || ': cliente de otro local' as item from movimientos m join clientes c on c.id = m.cliente_id
           where m.tenant_id = $1 and c.tenant_id <> m.tenant_id
          union all
          select 'Línea de N°' || m.numero || ': producto de otro local' from lineas_vale l join movimientos m on m.id = l.movimiento_id join productos p on p.id = l.producto_id
           where l.tenant_id = $1 and (p.tenant_id <> l.tenant_id or m.tenant_id <> l.tenant_id)
          union all
          select 'Pago de sueldo: trabajador de otro local' from pagos_sueldo p join trabajadores t on t.id = p.trabajador_id
           where p.tenant_id = $1 and t.tenant_id <> p.tenant_id`,
    ok: "Todos los registros apuntan a clientes, productos y trabajadores del mismo local.",
    mal: (n) => `${n} registros cruzados con otro local.`,
  },
  {
    titulo: "Lo borrado no reapareció",
    estado: "error",
    sql: `select 'N°' || m.numero || ' (' || m.tipo || ') fue borrado por un administrador y volvió' as item
            from movimientos m join borrados b on b.id = m.id where m.tenant_id = $1`,
    ok: "Nada de lo que borró un administrador volvió a aparecer.",
    mal: (n) => `${n} movimientos borrados reaparecieron.`,
  },
  {
    titulo: "Autor registrado",
    estado: "aviso",
    sql: `select 'N°' || numero || ' (' || tipo || ') sin creado_por' as item from movimientos where tenant_id = $1 and coalesce(trim(creado_por), '') = ''`,
    ok: "Cada movimiento tiene quién lo creó.",
    mal: (n) => `${n} movimientos sin autor.`,
  },
  {
    titulo: "Clientes duplicados",
    estado: "aviso",
    sql: `select string_agg(coalesce(alias, nombre), ' = ') as item from clientes where tenant_id = $1
           group by lower(regexp_replace(translate(coalesce(alias, nombre), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), '\\s+', ' ', 'g'))
          having count(*) > 1`,
    ok: "No hay clientes con el mismo nombre o alias.",
    mal: (n) => `${n} grupos de clientes con el mismo nombre (revisar que no sea la misma persona dos veces).`,
  },
  {
    titulo: "Productos con código repetido",
    estado: "aviso",
    sql: `select upper(codigo) || ': ' || string_agg(nombre, ', ') as item from productos where tenant_id = $1 and activo group by upper(codigo) having count(*) > 1`,
    ok: "Cada producto en uso tiene su propio código.",
    mal: (n) => `${n} códigos usados por más de un producto.`,
  },
  {
    titulo: "Fechas fuera de rango",
    estado: "aviso",
    sql: `select 'N°' || numero || ' (' || tipo || ') ' || fecha as item from movimientos
           where tenant_id = $1 and (fecha < current_date - interval '5 years' or fecha > current_date + interval '1 year')`,
    ok: "No hay fechas de hace más de 5 años ni de más de un año adelante.",
    mal: (n) => `${n} movimientos con fechas muy lejanas (¿error de tipeo?).`,
  },
];

export async function GET(req: Request) {
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const out: Chequeo[] = [];
  const max = (xs: string[]) => xs.slice(0, 10);

  // ---- 1) chequeos SQL ----
  for (const r of REGLAS) {
    try {
      const filas = (await pool().query(r.sql, [a.tenant])).rows.map((x) => String(x.item));
      out.push(filas.length ? { titulo: r.titulo, estado: r.estado, detalle: r.mal(filas.length), items: max(filas) } : { titulo: r.titulo, estado: "ok", detalle: r.ok });
    } catch (e) {
      out.push({ titulo: r.titulo, estado: "error", detalle: `No se pudo revisar: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // ---- 2) las verificaciones de la app, sobre la base real ----
  const crudo = (await leerDb(a.tenant)) as unknown as Db & { config: Partial<Config> };
  if (!crudo) return NextResponse.json({ error: "Sin datos" }, { status: 404 });
  const db: Db = {
    ...crudo,
    config: { ...CONFIG_BASE, ...(crudo.config ?? {}) },
  };
  const h = hoyChile();
  const app = verificar(db, h).map((c) => ({ ...c, titulo: `${c.titulo} (app)` }));

  // ---- 3) dos cálculos independientes deben coincidir ----
  const idx = indexar(db);
  const sqlSaldos = new Map(
    (await pool().query("select cliente_id, saldo from v_saldos_clientes where tenant_id = $1", [a.tenant])).rows.map((x) => [String(x.cliente_id), Number(x.saldo)]),
  );
  const difSaldos: string[] = [];
  for (const c of db.clientes) {
    const s = estadoCliente(c, idx, db.config, h).saldo;
    const q = sqlSaldos.get(c.id) ?? 0;
    if (s !== q) difSaldos.push(`${c.alias ?? c.nombre}: app ${clp(s)} vs base ${clp(q)}`);
  }
  out.push(
    difSaldos.length
      ? { titulo: "Saldos de clientes: app = base", estado: "error", detalle: `${difSaldos.length} clientes con saldo distinto según cómo se calcule.`, items: max(difSaldos) }
      : { titulo: "Saldos de clientes: app = base", estado: "ok", detalle: `Los ${db.clientes.length} saldos coinciden calculados de dos formas distintas.` },
  );
  const sqlCaja = (await pool().query("select fecha, efectivo_esperado, transferencia, tarjeta from v_caja_diaria where tenant_id = $1", [a.tenant])).rows;
  const difCaja: string[] = [];
  for (const x of sqlCaja) {
    const r = resumenCaja(idx.movsFecha.get(String(x.fecha)) ?? []);
    const transf = r.transferencia;
    if (r.efectivo_esperado !== Number(x.efectivo_esperado)) difCaja.push(`${x.fecha}: efectivo app ${clp(r.efectivo_esperado)} vs base ${clp(Number(x.efectivo_esperado))}`);
    else if ((r.tarjeta ?? 0) !== Number(x.tarjeta)) difCaja.push(`${x.fecha}: tarjeta app ${clp(r.tarjeta ?? 0)} vs base ${clp(Number(x.tarjeta))}`);
    else if (transf !== Number(x.transferencia)) difCaja.push(`${x.fecha}: transferencias app ${clp(transf)} vs base ${clp(Number(x.transferencia))}`);
  }
  out.push(
    difCaja.length
      ? { titulo: "Caja diaria: app = base", estado: "error", detalle: `${difCaja.length} días con caja distinta según cómo se calcule.`, items: max(difCaja) }
      : { titulo: "Caja diaria: app = base", estado: "ok", detalle: `Efectivo, transferencias y tarjeta coinciden en los ${sqlCaja.length} días con movimientos.` },
  );

  const conteo = (await pool().query(
    `select (select count(*) from movimientos where tenant_id = $1)::int as movimientos,
            (select count(*) from clientes where tenant_id = $1)::int as clientes,
            (select count(*) from historial where tenant_id = $1)::int as historial,
            (select count(*) from borrados where tenant_id = $1)::int as borrados`,
    [a.tenant],
  )).rows[0];

  return NextResponse.json(
    { chequeos: [...out, ...app], conteo, at: new Date().toISOString(), hoy: h },
    { headers: { "cache-control": "no-store" } },
  );
}
