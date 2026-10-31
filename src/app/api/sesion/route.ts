import { NextResponse } from "next/server";
import { hayBase, tenantId } from "@/lib/server/pg";
import {
  anotarIntento, asegurarEsquema, bloqueado, COOKIE_ADMIN, COOKIE_PORTAL, DURACION_PORTAL, ipDe, leerSeguridad, mismoOrigen, opcionesCookie,
  tokenPortal, verificarClave,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Entrar al portal con la clave global del local. */
export async function POST(req: Request) {
  if (!hayBase()) return NextResponse.json({ ok: true, modo: "local" });
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const { clave } = (await req.json().catch(() => ({}))) as { clave?: string };
  await asegurarEsquema();
  const tenant = await tenantId();
  const seg = tenant ? await leerSeguridad(tenant) : null;
  if (!tenant || !seg) return NextResponse.json({ error: "El sistema todavía no está instalado", instalar: true }, { status: 428 });
  const ip = ipDe(req);
  if (await bloqueado(ip)) {
    return NextResponse.json({ error: "Demasiados intentos fallidos. Espere 15 minutos." }, { status: 429 });
  }
  const ok = !!clave && verificarClave(clave, seg.clave_hash);
  await anotarIntento({ tenant, ip, tipo: "PORTAL", ok });
  if (!ok) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PORTAL, tokenPortal(seg), opcionesCookie(DURACION_PORTAL));
  return res;
}

/** Cerrar sesión en este equipo (portal y administración). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PORTAL, "", opcionesCookie(0));
  res.cookies.set(COOKIE_ADMIN, "", opcionesCookie(0));
  return res;
}
