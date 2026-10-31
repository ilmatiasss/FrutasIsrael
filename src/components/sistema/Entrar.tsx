"use client";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "../Iconos";

export function Entrar() {
  const params = useSearchParams();
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const r = await fetch("/api/sesion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clave }) }).catch(() => null);
    setCargando(false);
    if (r?.ok) location.assign(params.get("volver") || "/");
    else setError(r ? "La clave no es correcta." : "No hay conexión. Revisa el internet.");
  };

  return (
    <div className="mx-auto mt-[8vh] max-w-sm">
      <form onSubmit={enviar} className="hoja space-y-4 p-6 text-center">
        <div className="mx-auto flex justify-center">
          <Logo size={120} />
        </div>
        <div>
          <h1 className="stencil text-2xl">Frutas Israel</h1>
          <p className="text-gris">Gestión comercial · Ingresa la clave de acceso.</p>
        </div>
        <input
          autoFocus
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="campo text-center text-xl"
          placeholder="Clave de acceso"
          aria-label="Clave del local"
        />
        {error && <p className="font-semibold text-fuji">{error}</p>}
        <button type="submit" disabled={!clave || cargando} className="btn btn-primario w-full py-2.5 disabled:opacity-50">
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="text-xs text-gris">Este computador queda con la sesión abierta por 60 días.</p>
      </form>
    </div>
  );
}
