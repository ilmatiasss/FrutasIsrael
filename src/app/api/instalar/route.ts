import { NextResponse } from "next/server";
import { baseInstalada, hayBase } from "@/lib/server/pg";
import { aplicarCambios, crearEsquema, crearTenant, type Cambio } from "@/lib/server/repo";
import { ORDEN, type Tabla } from "@/lib/server/tablas";
import { claveConfigurada } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!hayBase()) return NextResponse.json({ hayBase: false, instalada: false, clave: claveConfigurada() });
  try {
    return NextResponse.json({ hayBase: true, instalada: await baseInstalada(), clave: claveConfigurada() });
  } catch (e) {
    return NextResponse.json({ hayBase: true, instalada: false, clave: claveConfigurada(), error: e instanceof Error ? e.message : String(e) });
  }
}

/** Crea las tablas y carga los datos iniciales. Solo funciona con la base vacía. */
export async function POST(req: Request) {
  if (!hayBase()) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as {
    tenant: { id: string; nombre: string; ubicacion: string; ultimo_numero: number; config: Record<string, unknown> };
    filas: Partial<Record<Tabla, Record<string, unknown>[]>>;
  } | null;
  if (!body?.tenant?.id) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  try {
    await crearEsquema();
    if (await baseInstalada()) return NextResponse.json({ error: "La base ya está instalada" }, { status: 409 });
    await crearTenant(body.tenant);
    const cambios: Cambio[] = [];
    for (const t of ORDEN) for (const fila of body.filas[t] ?? []) cambios.push({ tabla: t, op: "put", fila });
    await aplicarCambios(body.tenant.id, cambios, { ultimo_numero: body.tenant.ultimo_numero });
    return NextResponse.json({ ok: true, filas: cambios.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
