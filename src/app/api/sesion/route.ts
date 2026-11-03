import { NextResponse } from "next/server";
import { hayBase, pool, tenantId } from "@/lib/server/pg";
import {
  acceso, anotarIntento, asegurarEsquema, bloqueado, COOKIE_ADMIN, COOKIE_PORTAL, DURACION_PORTAL, ipDe, leerSeguridad, mismoOrigen, opcionesCookie,
  tokenPortal, verificarClave,
} from "@/lib/server/auth";
import { anotarHistorial } from "@/lib/server/historial";

export const dynamic = "force-dynamic";

const espera = () => new Promise((r) => setTimeout(r, 500));

/**
 * Entrar al portal, en dos pasos:
 *  1. { clave } → si es la clave del local, responde la lista de personas.
 *  2. { clave, usuario_id, pin? } → abre la sesión a nombre de esa persona.
 * Así cada cambio queda registrado con quién lo hizo.
 */
export async function POST(req: Request) {
  if (!hayBase()) return NextResponse.json({ ok: true, modo: "local" });
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const { clave, usuario_id, pin } = (await req.json().catch(() => ({}))) as { clave?: string; usuario_id?: string; pin?: string };
  await asegurarEsquema();
  const tenant = await tenantId();
  const seg = tenant ? await leerSeguridad(tenant) : null;
  if (!tenant || !seg) return NextResponse.json({ error: "El sistema todavía no está instalado", instalar: true }, { status: 428 });
  const ip = ipDe(req);
  if (await bloqueado(ip, usuario_id)) {
    return NextResponse.json({ error: "Demasiados intentos fallidos. Espere 15 minutos." }, { status: 429 });
  }
  const ok = !!clave && verificarClave(clave, seg.clave_hash);
  if (!ok) {
    await anotarIntento({ tenant, ip, tipo: "PORTAL", ok: false });
    await espera();
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });
  }

  const personas = await pool().query(
    "select id, nombre, rol, pin_hash from usuarios where tenant_id = $1 and activo order by rol desc, nombre",
    [tenant],
  );
  if (!usuario_id) {
    await anotarIntento({ tenant, ip, tipo: "PORTAL", ok: true });
    return NextResponse.json({
      elegir: personas.rows.map((p) => ({ id: p.id, nombre: p.nombre, pin: !!p.pin_hash })),
    });
  }
  const p = personas.rows.find((x) => x.id === usuario_id);
  if (!p) return NextResponse.json({ error: "Esa persona no está habilitada. Pida a un administrador que la active." }, { status: 400 });
  if (p.pin_hash && !(pin && verificarClave(pin, p.pin_hash))) {
    await anotarIntento({ tenant, ip, tipo: "PORTAL", usuario: usuario_id, ok: false });
    await espera();
    return NextResponse.json({ error: `PIN incorrecto para ${p.nombre}` }, { status: 401 });
  }
  await anotarIntento({ tenant, ip, tipo: "PORTAL", usuario: usuario_id, ok: true });
  await pool().query("update usuarios set ultimo_acceso = now() where id = $1", [p.id]);
  await anotarHistorial(null, tenant, { tipo: "PERSONAL", id: p.id, nombre: p.nombre }, ip, [
    { tabla: "sesion", registro_id: p.id, accion: "ENTRAR", descripcion: `${p.nombre} entró al sistema` },
  ]);
  const res = NextResponse.json({ ok: true, nombre: p.nombre });
  res.cookies.set(COOKIE_PORTAL, tokenPortal(seg, { u: p.id, pin_hash: p.pin_hash }), opcionesCookie(DURACION_PORTAL));
  return res;
}

/** Cerrar sesión en este equipo (portal y administración). */
export async function DELETE(req: Request) {
  if (hayBase()) {
    const a = await acceso(req).catch(() => null);
    if (a?.ok)
      await anotarHistorial(null, a.tenant, a.quien, ipDe(req), [
        { tabla: "sesion", registro_id: a.quien.id, accion: "SALIR", descripcion: `${a.quien.nombre} cerró sesión` },
      ]).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PORTAL, "", opcionesCookie(0));
  res.cookies.set(COOKIE_ADMIN, "", opcionesCookie(0));
  return res;
}
