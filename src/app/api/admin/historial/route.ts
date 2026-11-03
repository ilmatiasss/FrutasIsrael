import { NextResponse } from "next/server";
import { pool } from "@/lib/server/pg";
import { acceso } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const POR_PAGINA = 300;

/**
 * Historial de cambios (solo administradores). Filtros opcionales:
 * desde, hasta (AAAA-MM-DD, hora de Chile), usuario, tabla, accion, q (texto), antes (id para paginar).
 */
export async function GET(req: Request) {
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const p = new URL(req.url).searchParams;
  const cond: string[] = ["tenant_id = $1"];
  const val: unknown[] = [a.tenant];
  const add = (sql: string, v: unknown) => {
    val.push(v);
    cond.push(sql.replace("?", `$${val.length}`));
  };
  const desde = p.get("desde"), hasta = p.get("hasta");
  if (desde && FECHA.test(desde)) add("(at at time zone 'America/Santiago')::date >= ?::date", desde);
  if (hasta && FECHA.test(hasta)) add("(at at time zone 'America/Santiago')::date <= ?::date", hasta);
  if (p.get("usuario")) add("usuario = ?", p.get("usuario"));
  if (p.get("tabla")) add("tabla = ?", p.get("tabla"));
  if (p.get("accion")) add("accion = ?", p.get("accion"));
  const q = (p.get("q") ?? "").trim();
  if (q) {
    val.push(`%${q}%`);
    cond.push(`(descripcion ilike $${val.length} or usuario ilike $${val.length} or cambios::text ilike $${val.length})`);
  }
  const antes = Number(p.get("antes"));
  if (antes > 0) add("id < ?", antes);
  const r = await pool().query(
    `select id, at, usuario, usuario_tipo, ip, tabla, registro_id, accion, descripcion, cambios
       from historial where ${cond.join(" and ")} order by id desc limit ${POR_PAGINA + 1}`,
    val,
  );
  const usuarios = await pool().query("select distinct usuario from historial where tenant_id = $1 order by usuario", [a.tenant]);
  const filas = r.rows.slice(0, POR_PAGINA);
  return NextResponse.json(
    { filas, hayMas: r.rows.length > POR_PAGINA, usuarios: usuarios.rows.map((x) => x.usuario) },
    { headers: { "cache-control": "no-store" } },
  );
}
