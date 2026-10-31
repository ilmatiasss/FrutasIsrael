import { NextResponse } from "next/server";
import { hayBase, pool } from "@/lib/server/pg";
import { acceso, MAX_ADMINS } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** ¿Quién está como administrador? Si es admin: cuentas y accesos recientes. */
export async function GET(req: Request) {
  if (!hayBase()) return NextResponse.json({ modo: "local", admin: null });
  const a = await acceso(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!a.admin) return NextResponse.json({ modo: "nube", admin: null });
  const cuentas = await pool().query(
    "select id, usuario, nombre, activo, creado_por, created_at, ultimo_acceso from admins where tenant_id = $1 order by created_at",
    [a.tenant],
  );
  const intentos = await pool().query(
    "select tipo, usuario, ip, ok, at from intentos_acceso where tenant_id = $1 order by at desc limit 30",
    [a.tenant],
  );
  const seg = await pool().query("select actualizado_por, updated_at from seguridad where tenant_id = $1", [a.tenant]);
  return NextResponse.json(
    { modo: "nube", admin: a.admin, cuentas: cuentas.rows, intentos: intentos.rows, clavePortal: seg.rows[0], maxAdmins: MAX_ADMINS },
    { headers: { "cache-control": "no-store" } },
  );
}
