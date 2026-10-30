import { NextResponse, type NextRequest } from "next/server";
import { claveConfigurada, COOKIE, firma, iguales } from "@/lib/sesion";

/* Si el local configuró CLAVE_ACCESO, todo pide entrar con la clave. */
export async function middleware(req: NextRequest) {
  if (!claveConfigurada()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/entrar" || pathname.startsWith("/api/sesion")) return NextResponse.next();
  const cookie = req.cookies.get(COOKIE)?.value ?? "";
  if (cookie && iguales(cookie, await firma())) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = pathname === "/" ? "" : `?volver=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|svg|jpg|ico|woff2?)$).*)"],
};
