import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { baseInstalada, hayBase, pool, tenantId } from "@/lib/server/pg";
import { aplicarCambios, crearEsquema, crearTenant, type Cambio } from "@/lib/server/repo";
import { ORDEN, type Tabla } from "@/lib/server/tablas";
import {
  asegurarEsquema, claveDebil, COOKIE_ADMIN, COOKIE_PORTAL, DURACION_ADMIN, DURACION_PORTAL, hashClave, leerSeguridad, mismoOrigen,
  nuevoSecreto, opcionesCookie, tokenAdmin, tokenPortal,
} from "@/lib/server/auth";
import { eventoServidor } from "@/lib/server/evento";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Estado de la instalación (no expone datos). */
export async function GET() {
  const claveInstalacion = !!process.env.CLAVE_ACCESO;
  if (!hayBase()) return NextResponse.json({ hayBase: false, instalada: false, seguridad: false, claveInstalacion });
  try {
    const instalada = await baseInstalada();
    let seguridad = false;
    if (instalada) {
      await asegurarEsquema();
      seguridad = !!(await leerSeguridad((await tenantId())!));
    }
    return NextResponse.json({ hayBase: true, instalada, seguridad, claveInstalacion });
  } catch (e) {
    return NextResponse.json({ hayBase: true, instalada: false, seguridad: false, claveInstalacion, error: e instanceof Error ? e.message : String(e) });
  }
}

function claveInstalacionOk(dada: string | undefined): boolean {
  const env = process.env.CLAVE_ACCESO;
  if (!env) return true;
  const a = Buffer.from(dada ?? ""), b = Buffer.from(env);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Crea las tablas, carga los datos iniciales, la clave del portal y el primer
 * administrador. Solo funciona una vez: con la base ya protegida responde 409.
 * Si CLAVE_ACCESO está en Vercel, se pide como "clave de instalación"; después
 * de instalar esa variable ya no da acceso a nada.
 */
export async function POST(req: Request) {
  if (!hayBase()) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 400 });
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    claveInstalacion?: string;
    clavePortal?: string;
    admin?: { usuario?: string; nombre?: string; clave?: string };
    tenant?: { id: string; nombre: string; ubicacion: string; ultimo_numero: number; config: Record<string, unknown> };
    filas?: Partial<Record<Tabla, Record<string, unknown>[]>>;
  } | null;
  if (!body) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  if (!claveInstalacionOk(body.claveInstalacion)) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "La clave de instalación no es correcta" }, { status: 401 });
  }
  const usuario = (body.admin?.usuario ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return NextResponse.json({ error: "Usuario: 3 a 30 letras minúsculas, números, punto o guion." }, { status: 400 });
  if (!body.admin?.nombre?.trim()) return NextResponse.json({ error: "Falta el nombre del administrador." }, { status: 400 });
  const d1 = claveDebil(body.admin?.clave ?? "");
  if (d1) return NextResponse.json({ error: `Contraseña del administrador: ${d1}` }, { status: 400 });
  const d2 = claveDebil(body.clavePortal ?? "");
  if (d2) return NextResponse.json({ error: `Clave del portal: ${d2}` }, { status: 400 });
  if (body.clavePortal === body.admin?.clave) return NextResponse.json({ error: "La clave del portal debe ser distinta a la del administrador." }, { status: 400 });

  try {
    await crearEsquema();
    let tenant = await tenantId();
    if (tenant && (await leerSeguridad(tenant))) return NextResponse.json({ error: "El sistema ya está instalado y protegido" }, { status: 409 });
    if (!tenant) {
      if (!body.tenant?.id) return NextResponse.json({ error: "Faltan los datos iniciales" }, { status: 400 });
      await crearTenant(body.tenant);
      const cambios: Cambio[] = [];
      for (const t of ORDEN) for (const fila of body.filas?.[t] ?? []) cambios.push({ tabla: t, op: "put", fila });
      await aplicarCambios(body.tenant.id, cambios, { ultimo_numero: body.tenant.ultimo_numero });
      tenant = body.tenant.id;
    }
    const secreto = nuevoSecreto();
    const adminId = randomUUID();
    const hash = hashClave(body.admin!.clave!);
    // en una sola sentencia: si dos personas instalan a la vez, solo una gana
    const ins = await pool().query(
      `with s as (
         insert into seguridad (tenant_id, clave_hash, secreto, actualizado_por) values ($1, $2, $3, $4)
         on conflict (tenant_id) do nothing returning tenant_id
       )
       insert into admins (id, tenant_id, usuario, nombre, hash, creado_por)
       select $5, $1, $6, $4, $7, 'instalación' from s returning id`,
      [tenant, hashClave(body.clavePortal!), secreto, body.admin!.nombre!.trim(), adminId, usuario, hash],
    );
    if (!ins.rowCount) return NextResponse.json({ error: "El sistema ya está instalado y protegido" }, { status: 409 });
    await eventoServidor(tenant, body.admin!.nombre!.trim(), `Instalación: clave del portal y primer administrador (${usuario})`);
    const seg = (await leerSeguridad(tenant))!;
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_ADMIN, tokenAdmin(seg, { id: adminId, hash }), opcionesCookie(DURACION_ADMIN));
    res.cookies.set(COOKIE_PORTAL, tokenPortal(seg), opcionesCookie(DURACION_PORTAL));
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
