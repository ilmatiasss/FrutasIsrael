import { NextResponse } from "next/server";
import { claveConfigurada, COOKIE, firma, iguales } from "@/lib/sesion";

export async function POST(req: Request) {
  const { clave } = (await req.json().catch(() => ({}))) as { clave?: string };
  if (!claveConfigurada()) return NextResponse.json({ ok: true });
  if (!clave || !iguales(clave, process.env.CLAVE_ACCESO!)) {
    await new Promise((r) => setTimeout(r, 600)); // frena intentos al azar
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await firma(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60, // 60 días: el PC de la caja no pide clave a cada rato
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
