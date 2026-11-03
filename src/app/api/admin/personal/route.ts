import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/server/pg";
import { acceso, hashClave, ipDe, mismoOrigen } from "@/lib/server/auth";
import { anotarHistorial } from "@/lib/server/historial";

export const dynamic = "force-dynamic";

const PIN = /^\d{4,8}$/;

/** Personas que atienden (entran con la clave del portal + su nombre y PIN). */
export async function GET(req: Request) {
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const r = await pool().query(
    "select id, nombre, rol, activo, pin_hash is not null as pin, created_at, ultimo_acceso from usuarios where tenant_id = $1 order by activo desc, nombre",
    [a.tenant],
  );
  return NextResponse.json({ personal: r.rows }, { headers: { "cache-control": "no-store" } });
}

/** Crear una persona. */
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { nombre, rol, pin } = (await req.json().catch(() => ({}))) as { nombre?: string; rol?: string; pin?: string };
  const n = (nombre ?? "").trim();
  if (n.length < 2 || n.length > 40) return NextResponse.json({ error: "Escriba el nombre (2 a 40 letras)." }, { status: 400 });
  if (pin && !PIN.test(pin)) return NextResponse.json({ error: "El PIN debe tener de 4 a 8 números." }, { status: 400 });
  const repetido = await pool().query("select 1 from usuarios where tenant_id = $1 and lower(nombre) = lower($2)", [a.tenant, n]);
  if (repetido.rowCount) return NextResponse.json({ error: `Ya existe alguien llamado ${n}.` }, { status: 409 });
  const id = randomUUID();
  await pool().query("insert into usuarios (id, tenant_id, nombre, rol, pin_hash) values ($1, $2, $3, $4, $5)", [
    id, a.tenant, n, rol === "DUENO" ? "DUENO" : "CAJA", pin ? hashClave(pin) : null,
  ]);
  await anotarHistorial(null, a.tenant, a.quien, ipDe(req), [
    { tabla: "usuarios", registro_id: id, accion: "CREAR", descripcion: `Persona nueva: ${n}${pin ? " (con PIN)" : ""}` },
  ]);
  return NextResponse.json({ ok: true });
}

/** activar / desactivar / poner o quitar PIN / cambiar nombre */
export async function PATCH(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const { id, accion, pin, nombre } = (await req.json().catch(() => ({}))) as { id?: string; accion?: string; pin?: string; nombre?: string };
  const r = await pool().query("select id, nombre, activo from usuarios where id = $1 and tenant_id = $2", [id, a.tenant]);
  const u = r.rows[0];
  if (!u) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
  let desc: string;
  if (accion === "activar" || accion === "desactivar") {
    if (accion === "desactivar") {
      const n = await pool().query("select count(*)::int as n from usuarios where tenant_id = $1 and activo", [a.tenant]);
      if (n.rows[0].n <= 1) return NextResponse.json({ error: "Debe quedar al menos una persona activa." }, { status: 400 });
    }
    await pool().query("update usuarios set activo = $2 where id = $1", [u.id, accion === "activar"]);
    desc = `${u.nombre}: ${accion === "activar" ? "reactivado" : "desactivado (ya no puede entrar)"}`;
  } else if (accion === "pin") {
    if (!pin || !PIN.test(pin)) return NextResponse.json({ error: "El PIN debe tener de 4 a 8 números." }, { status: 400 });
    await pool().query("update usuarios set pin_hash = $2 where id = $1", [u.id, hashClave(pin)]);
    desc = `${u.nombre}: PIN asignado`;
  } else if (accion === "quitar_pin") {
    await pool().query("update usuarios set pin_hash = null where id = $1", [u.id]);
    desc = `${u.nombre}: PIN quitado`;
  } else if (accion === "nombre") {
    const n = (nombre ?? "").trim();
    if (n.length < 2 || n.length > 40) return NextResponse.json({ error: "Escriba el nombre (2 a 40 letras)." }, { status: 400 });
    const repetido = await pool().query("select 1 from usuarios where tenant_id = $1 and lower(nombre) = lower($2) and id <> $3", [a.tenant, n, u.id]);
    if (repetido.rowCount) return NextResponse.json({ error: `Ya existe alguien llamado ${n}.` }, { status: 409 });
    await pool().query("update usuarios set nombre = $2 where id = $1", [u.id, n]);
    desc = `${u.nombre} ahora se llama ${n}`;
  } else return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  await anotarHistorial(null, a.tenant, a.quien, ipDe(req), [{ tabla: "usuarios", registro_id: u.id, accion: "MODIFICAR", descripcion: desc }]);
  return NextResponse.json({ ok: true });
}
