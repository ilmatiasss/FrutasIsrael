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
  // paso 2 del personal: elegir quién es (y su PIN si tiene)
  const [personas, setPersonas] = useState<{ id: string; nombre: string; pin: boolean }[] | null>(null);
  const [persona, setPersona] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const elegida = personas?.find((p) => p.id === persona) ?? null;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const url = modo === "admin" ? "/api/admin/sesion" : "/api/sesion";
    const body = modo === "admin" ? { usuario, clave } : persona ? { clave, usuario_id: persona, pin } : { clave };
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setCargando(false);
    const j0 = r?.ok ? await r.clone().json().catch(() => ({})) : {};
    if (r?.ok && Array.isArray(j0.elegir)) {
      // clave correcta: ahora quién es
      setPersonas(j0.elegir);
      if (j0.elegir.length === 1) setPersona(j0.elegir[0].id);
      return;
    }
    if (r?.ok) {
      const volver = params.get("volver");
      location.assign(volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : modo === "admin" ? "/admin" : "/");
      return;
    }
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.status === 428) setInstalar(true);
    if (r?.status === 401 && persona) setPin("");
    setError(r ? (j.error ?? "No se pudo ingresar.") : "No hay conexión. Revise el internet.");
  };

  if (modo === "portal" && personas)
    return (
      <div className="mx-auto mt-[6vh] max-w-sm">
        <form onSubmit={enviar} className="hoja space-y-4 p-6 text-center">
          <div className="mx-auto flex justify-center">
            <Logo size={80} />
          </div>
          <div>
            <h1 className="stencil text-2xl">¿Quién eres?</h1>
            <p className="text-sm text-gris">Todo lo que hagas quedará registrado a tu nombre.</p>
          </div>
          {personas.length ? (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quién eres">
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={persona === p.id}
                  onClick={() => {
                    setPersona(p.id);
                    setPin("");
                    setError(null);
                  }}
                  className={`rounded-md border px-3 py-3 text-[15px] font-semibold ${persona === p.id ? "border-tinta bg-tinta text-white" : "border-kraft hover:border-tinta"}`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-platano-suave p-3 text-sm">No hay personas habilitadas. Un administrador debe crearlas en «Cuentas y accesos».</p>
          )}
          {elegida?.pin && (
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
              className="campo text-center text-lg tracking-[0.4em]"
              placeholder="PIN"
              aria-label="PIN"
            />
          )}
          {error && <p className="text-sm font-medium text-fuji">{error}</p>}
          <button type="submit" disabled={!persona || (elegida?.pin && pin.length < 4) || cargando} className="btn btn-primario w-full py-2.5 disabled:opacity-50">
            {cargando ? "Ingresando…" : elegida ? `Entrar como ${elegida.nombre}` : "Elija su nombre"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPersonas(null);
              setPersona(null);
              setClave("");
              setError(null);
            }}
            className="text-sm text-gris hover:text-grafito"
          >
            Volver
          </button>
        </form>
      </div>
    );

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
