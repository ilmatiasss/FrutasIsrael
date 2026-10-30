import { NextResponse } from "next/server";
import { baseInstalada, hayBase, tenantId } from "@/lib/server/pg";
import { leerDb } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

/** Todo lo del locatario. 404 = sin base (modo prueba), 409 = base vacía (instalar). */
export async function GET() {
  if (!hayBase()) return NextResponse.json({ modo: "local" }, { status: 404 });
  try {
    if (!(await baseInstalada())) return NextResponse.json({ modo: "instalar" }, { status: 409 });
    const db = await leerDb((await tenantId())!);
    return NextResponse.json({ modo: "nube", db }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo leer la base de datos" }, { status: 503 });
  }
}
