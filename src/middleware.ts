import { NextResponse, type NextRequest } from "next/server";

/*
 * Con base de datos, las páginas piden haber entrado. La validación real de
 * la sesión (firma, vigencia, clave vigente) la hace cada API en el servidor
 * con el secreto guardado en la base: las páginas no traen datos por sí solas.
 */
const LIBRES = ["/entrar", "/instalar", "/api/sesion", "/api/admin/sesion", "/api/instalar"];

export function middleware(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.next(); // modo prueba
  const { pathname } = req.nextUrl;
  if (LIBRES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const tiene = (n: string) => (req.cookies.get(n)?.value ?? "").includes(".");
  if (tiene("fi_sesion") || tiene("fi_admin")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = pathname === "/" ? "" : `?volver=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.png|apple-icon.png|logo.*\\.png).*)"],
};
