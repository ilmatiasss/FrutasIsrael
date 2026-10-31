import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pool, tenantId } from "./pg";

/*
 * Acceso al portal:
 *  - Clave global del portal (todo el personal). Hash scrypt en la tabla `seguridad`.
 *  - Cuentas de administrador (usuario + contraseña), las únicas que pueden
 *    crear administradores y cambiar la clave del portal.
 * Las sesiones son tokens firmados con un secreto aleatorio que se genera al
 * instalar y vive solo en la base: ni las variables de Vercel ni el código
 * permiten fabricar una sesión.
 */

export const COOKIE_PORTAL = "fi_sesion";
export const COOKIE_ADMIN = "fi_admin";
export const DURACION_PORTAL = 60 * 24 * 3600; // 60 días: el PC de caja no pide clave a cada rato
export const DURACION_ADMIN = 12 * 3600; // 12 horas
export const MAX_ADMINS = 6;
export const LARGO_MINIMO = 8;

/* ------------------------------ claves ------------------------------ */

export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  const h = scryptSync(clave.normalize("NFKC"), sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${sal.toString("base64")}$${h.toString("base64")}`;
}

export function verificarClave(clave: string, guardado: string): boolean {
  const [alg, n, sal, h] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !h) return false;
  const esperado = Buffer.from(h, "base64");
  const calculado = scryptSync(clave.normalize("NFKC"), Buffer.from(sal, "base64"), esperado.length, { N: Number(n), r: 8, p: 1 });
  return timingSafeEqual(esperado, calculado);
}

export function claveDebil(clave: string): string | null {
  if (clave.length < LARGO_MINIMO) return `Debe tener al menos ${LARGO_MINIMO} caracteres.`;
  if (/^(.)\1+$/.test(clave) || /^(12345678|password|contraseña|frutasisrael)/i.test(clave)) return "Es demasiado fácil de adivinar.";
  return null;
}

/* ------------------------------ esquema ------------------------------ */

let esquemaListo = false;
/** Crea las tablas nuevas si la base es de una versión anterior (idempotente). */
export async function asegurarEsquema() {
  if (esquemaListo) {
    // si alguien recreó la base mientras el servidor corría, volver a crear las tablas
    const r = await pool().query("select to_regclass('public.seguridad') is not null as ok");
    if (r.rows[0]?.ok) return;
  }
  const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool().query(sql);
  esquemaListo = true;
}

/* ------------------------------ seguridad ------------------------------ */

export interface Seguridad {
  tenant_id: string;
  clave_hash: string;
  clave_version: number;
  secreto: string;
}

export async function leerSeguridad(tenant: string): Promise<Seguridad | null> {
  const r = await pool().query("select tenant_id, clave_hash, clave_version, secreto from seguridad where tenant_id = $1", [tenant]);
  return r.rows[0] ?? null;
}

export function nuevoSecreto(): string {
  return randomBytes(32).toString("base64");
}

/* ------------------------------ tokens ------------------------------ */

interface Carga {
  t: "p" | "a"; // portal | admin
  v?: number; // versión de la clave del portal
  a?: string; // id del admin
  h?: string; // huella del hash del admin (cambia si cambia su contraseña)
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function firmar(carga: Carga, secreto: string): string {
  const cuerpo = b64(JSON.stringify(carga));
  const sig = createHmac("sha256", secreto).update(cuerpo).digest("base64url");
  return `${cuerpo}.${sig}`;
}

function leerToken(token: string | undefined, secreto: string): Carga | null {
  if (!token || !token.includes(".")) return null;
  const [cuerpo, sig] = token.split(".");
  const esperado = createHmac("sha256", secreto).update(cuerpo).digest();
  const dado = Buffer.from(sig, "base64url");
  if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return null;
  try {
    const c = JSON.parse(Buffer.from(cuerpo, "base64url").toString()) as Carga;
    return c.exp > Date.now() ? c : null;
  } catch {
    return null;
  }
}

export function huella(hash: string): string {
  return createHmac("sha256", "huella").update(hash).digest("base64url").slice(0, 12);
}

export function tokenPortal(seg: Seguridad): string {
  return firmar({ t: "p", v: seg.clave_version, exp: Date.now() + DURACION_PORTAL * 1000 }, seg.secreto);
}

export function tokenAdmin(seg: Seguridad, admin: { id: string; hash: string }): string {
  return firmar({ t: "a", a: admin.id, h: huella(admin.hash), exp: Date.now() + DURACION_ADMIN * 1000 }, seg.secreto);
}

function cookie(req: Request, nombre: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const parte of raw.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export interface AdminSesion {
  id: string;
  usuario: string;
  nombre: string;
}

/** Admin con sesión vigente (o null). */
export async function adminDeSesion(req: Request, seg: Seguridad): Promise<AdminSesion | null> {
  const c = leerToken(cookie(req, COOKIE_ADMIN), seg.secreto);
  if (!c || c.t !== "a" || !c.a) return null;
  const r = await pool().query("select id, usuario, nombre, hash, activo from admins where id = $1 and tenant_id = $2", [c.a, seg.tenant_id]);
  const a = r.rows[0];
  if (!a || !a.activo || huella(a.hash) !== c.h) return null;
  return { id: a.id, usuario: a.usuario, nombre: a.nombre };
}

export type Acceso =
  | { ok: true; tenant: string; seg: Seguridad; admin: AdminSesion | null }
  | { ok: false; status: number; error: string };

/**
 * Valida la sesión de una petición a la API. Un admin con sesión también
 * tiene acceso al portal. Al cambiar la clave del portal se cierran todas
 * las sesiones de portal (la versión del token deja de coincidir).
 */
export async function acceso(req: Request, { soloAdmin = false } = {}): Promise<Acceso> {
  await asegurarEsquema();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, status: 409, error: "Base sin instalar" };
  const seg = await leerSeguridad(tenant);
  if (!seg) return { ok: false, status: 428, error: "Falta crear el primer administrador" };
  const admin = await adminDeSesion(req, seg);
  if (soloAdmin) return admin ? { ok: true, tenant, seg, admin } : { ok: false, status: 403, error: "Requiere administrador" };
  if (admin) return { ok: true, tenant, seg, admin };
  const c = leerToken(cookie(req, COOKIE_PORTAL), seg.secreto);
  if (!c || c.t !== "p" || c.v !== seg.clave_version) return { ok: false, status: 401, error: "Sin sesión" };
  return { ok: true, tenant, seg, admin: null };
}

/* ------------------------------ intentos ------------------------------ */

export function ipDe(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "desconocida";
}

const VENTANA_MIN = 15;
const MAX_FALLOS = 8;

/** Bloquea después de varios intentos fallidos desde la misma IP (o al mismo usuario). */
export async function bloqueado(ip: string, usuario?: string): Promise<boolean> {
  const r = await pool().query(
    `select count(*)::int as n from intentos_acceso
     where not ok and at > now() - interval '${VENTANA_MIN} minutes' and (ip = $1 or ($2::text is not null and usuario = $2))`,
    [ip, usuario ?? null],
  );
  return r.rows[0].n >= MAX_FALLOS;
}

export async function anotarIntento(p: { tenant: string | null; ip: string; tipo: "PORTAL" | "ADMIN"; usuario?: string; ok: boolean }) {
  await pool().query("insert into intentos_acceso (tenant_id, ip, tipo, usuario, ok) values ($1, $2, $3, $4, $5)", [
    p.tenant, p.ip, p.tipo, p.usuario ?? null, p.ok,
  ]);
}

/** Rechaza peticiones que cambian datos si vienen de otro sitio (CSRF). */
export function mismoOrigen(req: Request): boolean {
  const origen = req.headers.get("origin");
  if (!origen) return true; // navegadores sin Origin en mismo sitio, o herramientas
  try {
    return new URL(origen).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export const opcionesCookie = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});
