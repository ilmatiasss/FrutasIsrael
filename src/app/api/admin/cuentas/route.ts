import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/server/pg";
import { acceso, claveDebil, hashClave, MAX_ADMINS, mismoOrigen, verificarClave } from "@/lib/server/auth";
import { eventoServidor } from "@/lib/server/evento";

export const dynamic = "force-dynamic";

const USUARIO = /^[a-z0-9._-]{3,30}$/;

/** Crear una cuenta de administrador (solo admins). */
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { usuario, nombre, clave } = (await req.json().catch(() => ({}))) as { usuario?: string; nombre?: string; clave?: string };
  const u = (usuario ?? "").trim().toLowerCase();
  if (!USUARIO.test(u)) return NextResponse.json({ error: "Usuario: 3 a 30 letras minúsculas, números, punto o guion." }, { status: 400 });
  if (!nombre?.trim()) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  const debil = claveDebil(clave ?? "");
  if (debil) return NextResponse.json({ error: `Contraseña: ${debil}` }, { status: 400 });
  const n = await pool().query("select count(*)::int as n from admins where tenant_id = $1 and activo", [a.tenant]);
  if (n.rows[0].n >= MAX_ADMINS) return NextResponse.json({ error: `Máximo ${MAX_ADMINS} administradores activos.` }, { status: 400 });
  try {
    await pool().query("insert into admins (id, tenant_id, usuario, nombre, hash, creado_por) values ($1, $2, $3, $4, $5, $6)", [
      randomUUID(), a.tenant, u, nombre.trim(), hashClave(clave!), a.admin!.usuario,
    ]);
  } catch {
    return NextResponse.json({ error: "Ese usuario ya existe." }, { status: 409 });
  }
  await eventoServidor(a.tenant, a.admin!.nombre, `Administrador creado: ${u}`);
  return NextResponse.json({ ok: true });
}

/**
 * Cambios a una cuenta: activar / desactivar o poner contraseña nueva.
 * Para cambiar la PROPIA contraseña se pide la actual.
 * Nunca puede quedar el sistema sin administradores activos.
 */
export async function PATCH(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { id, accion, clave, actual } = (await req.json().catch(() => ({}))) as { id?: string; accion?: string; clave?: string; actual?: string };
  const r = await pool().query("select id, usuario, hash, activo from admins where id = $1 and tenant_id = $2", [id, a.tenant]);
  const obj = r.rows[0];
  if (!obj) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  const propia = obj.id === a.admin!.id;

  if (accion === "desactivar" || accion === "activar") {
    if (accion === "desactivar") {
      const n = await pool().query("select count(*)::int as n from admins where tenant_id = $1 and activo", [a.tenant]);
      if (n.rows[0].n <= 1) return NextResponse.json({ error: "Debe quedar al menos un administrador activo." }, { status: 400 });
    } else {
      const n = await pool().query("select count(*)::int as n from admins where tenant_id = $1 and activo", [a.tenant]);
      if (n.rows[0].n >= MAX_ADMINS) return NextResponse.json({ error: `Máximo ${MAX_ADMINS} administradores activos.` }, { status: 400 });
    }
    await pool().query("update admins set activo = $2 where id = $1", [obj.id, accion === "activar"]);
    await eventoServidor(a.tenant, a.admin!.nombre, `Administrador ${obj.usuario} ${accion === "activar" ? "reactivado" : "desactivado"}`);
    return NextResponse.json({ ok: true, salir: propia && accion === "desactivar" });
  }

  if (accion === "clave") {
    if (propia && !(actual && verificarClave(actual, obj.hash))) return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 });
    const debil = claveDebil(clave ?? "");
    if (debil) return NextResponse.json({ error: `Contraseña: ${debil}` }, { status: 400 });
    await pool().query("update admins set hash = $2 where id = $1", [obj.id, hashClave(clave!)]);
    await eventoServidor(a.tenant, a.admin!.nombre, `Contraseña cambiada: ${obj.usuario}`);
    return NextResponse.json({ ok: true, salir: propia });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
