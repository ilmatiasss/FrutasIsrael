import { NextResponse } from "next/server";
import { pool } from "@/lib/server/pg";
import { acceso, claveDebil, hashClave, mismoOrigen } from "@/lib/server/auth";
import { eventoServidor } from "@/lib/server/evento";

export const dynamic = "force-dynamic";

/** Cambia la clave global del portal. Todos los equipos deberán volver a entrar. */
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { nueva } = (await req.json().catch(() => ({}))) as { nueva?: string };
  const debil = claveDebil(nueva ?? "");
  if (debil) return NextResponse.json({ error: `Clave: ${debil}` }, { status: 400 });
  await pool().query(
    "update seguridad set clave_hash = $2, clave_version = clave_version + 1, actualizado_por = $3, updated_at = now() where tenant_id = $1",
    [a.tenant, hashClave(nueva!), a.admin!.nombre],
  );
  await eventoServidor(a.tenant, a.admin!.nombre, "Clave del portal cambiada: todas las sesiones de portal se cerraron");
  return NextResponse.json({ ok: true });
}
