"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "../Iconos";

/** Ingreso al portal con la clave del local, o como administrador. */
export function Entrar() {
  const params = useSearchParams();
  const [modo, setModo] = useState<"portal" | "admin">(params.get("admin") ? "admin" : "portal");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [instalar, setInstalar] = useState(false);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const url = modo === "admin" ? "/api/admin/sesion" : "/api/sesion";
    const body = modo === "admin" ? { usuario, clave } : { clave };
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setCargando(false);
    if (r?.ok) {
      const volver = params.get("volver");
      location.assign(volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : modo === "admin" ? "/admin" : "/");
      return;
    }
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.status === 428) setInstalar(true);
    setError(r ? (j.error ?? "No se pudo ingresar.") : "No hay conexión. Revise el internet.");
  };

  return (
    <div className="mx-auto mt-[6vh] max-w-sm">
      <form onSubmit={enviar} className="hoja space-y-4 p-6 text-center">
        <div className="mx-auto flex justify-center">
          <Logo size={110} />
        </div>
        <div>
          <h1 className="stencil text-2xl">Frutas Israel</h1>
          <p className="text-sm text-gris">{modo === "admin" ? "Ingreso de administrador" : "Gestión comercial · Ingrese la clave de acceso"}</p>
        </div>
        <div className="flex rounded-md border border-kraft p-0.5 text-sm" role="tablist">
          {(["portal", "admin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => {
                setModo(m);
                setError(null);
              }}
              className={`flex-1 rounded px-3 py-1.5 font-medium ${modo === m ? "bg-tinta text-white" : "text-gris"}`}
            >
              {m === "portal" ? "Personal" : "Administrador"}
            </button>
          ))}
        </div>
        {modo === "admin" && (
          <input
            autoFocus
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            className="campo text-center"
            placeholder="Usuario"
            aria-label="Usuario"
          />
        )}
        <input
          autoFocus={modo === "portal"}
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete={modo === "admin" ? "current-password" : "off"}
          className="campo text-center text-lg"
          placeholder={modo === "admin" ? "Contraseña" : "Clave de acceso"}
          aria-label={modo === "admin" ? "Contraseña" : "Clave de acceso"}
        />
        {error && <p className="text-sm font-medium text-fuji">{error}</p>}
        {instalar && (
          <Link href="/instalar" className="block text-sm font-medium text-tinta underline">
            Ir a la instalación
          </Link>
        )}
        <button type="submit" disabled={!clave || (modo === "admin" && !usuario) || cargando} className="btn btn-primario w-full py-2.5 disabled:opacity-50">
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="text-xs text-gris">
          {modo === "portal" ? "Este equipo queda con la sesión abierta por 60 días." : "La sesión de administrador dura 12 horas."}
        </p>
      </form>
    </div>
  );
}
