import { NextResponse } from "next/server";
import { hayBase, tenantId } from "@/lib/server/pg";
import { aplicarCambios, type Cambio, type CambiosTenant } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hayBase()) return NextResponse.json({ error: "Sin base de datos" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { cambios?: Cambio[]; tenant?: CambiosTenant } | null;
  if (!body || !Array.isArray(body.cambios)) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  try {
    const t = await tenantId();
    if (!t) return NextResponse.json({ error: "Base sin instalar" }, { status: 409 });
    const r = await aplicarCambios(t, body.cambios, body.tenant ?? {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    // error de datos (regla de negocio, restricción): no reintentar igual
    const datos = /violates|No se borran|no se editan|desanular|no permitida|invalid input/i.test(msg);
    return NextResponse.json({ error: msg }, { status: datos ? 422 : 503 });
  }
}
