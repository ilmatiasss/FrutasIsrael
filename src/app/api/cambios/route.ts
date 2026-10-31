import { NextResponse } from "next/server";
import { hayBase } from "@/lib/server/pg";
import { aplicarCambios, type Cambio, type CambiosTenant } from "@/lib/server/repo";
import { acceso, mismoOrigen } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hayBase()) return NextResponse.json({ error: "Sin base de datos" }, { status: 404 });
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { cambios?: Cambio[]; tenant?: CambiosTenant } | null;
  if (!body || !Array.isArray(body.cambios)) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  try {
    const a = await acceso(req);
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
    // la bitácora de seguridad solo la escribe el servidor
    const cambios = body.cambios.filter((c) => !(c.tabla === "eventos" && c.fila?.accion === "SEGURIDAD"));
    const r = await aplicarCambios(a.tenant, cambios, body.tenant ?? {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    // error de datos (regla de negocio, restricción): no reintentar igual
    const datos = /violates|No se borran|no se editan|desanular|no permitida|invalid input/i.test(msg);
    return NextResponse.json({ error: msg }, { status: datos ? 422 : 503 });
  }
}
