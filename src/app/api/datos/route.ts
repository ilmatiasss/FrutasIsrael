import { NextResponse } from "next/server";
import { hayBase } from "@/lib/server/pg";
import { leerDb } from "@/lib/server/repo";
import { acceso } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/**
 * Todo lo del locatario. 404 = sin base (modo prueba), 409/428 = falta instalar
 * o crear el primer administrador, 401 = sin sesión.
 */
export async function GET(req: Request) {
  if (!hayBase()) return NextResponse.json({ modo: "local" }, { status: 404 });
  try {
    const a = await acceso(req);
    if (!a.ok) return NextResponse.json({ modo: a.status === 409 || a.status === 428 ? "instalar" : undefined, error: a.error }, { status: a.status });
    const db = await leerDb(a.tenant);
    return NextResponse.json({ modo: "nube", db, admin: a.admin }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo leer la base de datos" }, { status: 503 });
  }
}
