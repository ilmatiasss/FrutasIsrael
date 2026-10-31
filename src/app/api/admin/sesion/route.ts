import { NextResponse } from "next/server";
import { pool, tenantId } from "@/lib/server/pg";
import {
  anotarIntento, asegurarEsquema, bloqueado, COOKIE_ADMIN, COOKIE_PORTAL, DURACION_ADMIN, DURACION_PORTAL, ipDe, leerSeguridad, mismoOrigen,
  opcionesCookie, tokenAdmin, tokenPortal, verificarClave,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Entrar como administrador (usuario + contraseña). También abre el portal. */
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const { usuario, clave } = (await req.json().catch(() => ({}))) as { usuario?: string; clave?: string };
  await asegurarEsquema();
  const tenant = await tenantId();
  const seg = tenant ? await leerSeguridad(tenant) : null;
  if (!tenant || !seg) return NextResponse.json({ error: "El sistema todavía no está instalado" }, { status: 428 });
  const u = (usuario ?? "").trim().toLowerCase();
  const ip = ipDe(req);
  if (await bloqueado(ip, u)) return NextResponse.json({ error: "Demasiados intentos fallidos. Espere 15 minutos." }, { status: 429 });
  const r = await pool().query("select id, usuario, nombre, hash, activo from admins where tenant_id = $1 and usuario = $2", [tenant, u]);
  const a = r.rows[0];
  const ok = !!a && a.activo && !!clave && verificarClave(clave, a.hash);
  await anotarIntento({ tenant, ip, tipo: "ADMIN", usuario: u, ok });
  if (!ok) {
    await new Promise((x) => setTimeout(x, 500));
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }
  await pool().query("update admins set ultimo_acceso = now() where id = $1", [a.id]);
  const res = NextResponse.json({ ok: true, admin: { usuario: a.usuario, nombre: a.nombre } });
  res.cookies.set(COOKIE_ADMIN, tokenAdmin(seg, a), opcionesCookie(DURACION_ADMIN));
  res.cookies.set(COOKIE_PORTAL, tokenPortal(seg), opcionesCookie(DURACION_PORTAL));
  return res;
}

/** Salir del modo administrador (el portal sigue abierto). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_ADMIN, "", opcionesCookie(0));
  return res;
}
