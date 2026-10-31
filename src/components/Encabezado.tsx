"use client";
import { useEffect, useState, type ReactNode } from "react";
import { SECCIONES } from "./Iconos";

export interface Paso {
  titulo: string;
  texto: ReactNode;
}

/**
 * Encabezado de cada sección: su fruta, qué se hace acá en una frase,
 * y una guía paso a paso que aparece abierta la primera vez.
 */
export function Encabezado({
  href,
  titulo,
  bajada,
  pasos,
  derecha,
}: {
  href: string;
  titulo?: string;
  bajada?: ReactNode;
  pasos?: Paso[];
  derecha?: ReactNode;
}) {
  const s = SECCIONES.find((x) => x.href === href);
  const clave = `frutas-israel:guia:${href}`;
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    try {
      setAbierta(localStorage.getItem(clave) !== "vista");
    } catch {
      setAbierta(true);
    }
  }, [clave]);

  const cerrar = () => {
    setAbierta(false);
    try {
      localStorage.setItem(clave, "vista");
    } catch {}
  };

  return (
    <div className="no-print mb-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        {s && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-verde-suave text-tinta">
            <s.Fruta size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="stencil text-[22px] sm:text-[24px]">{titulo ?? s?.label}</h1>
          <p className="text-sm text-gris">{bajada ?? s?.que}</p>
        </div>
        <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
          {derecha}
          {pasos && (
            <button type="button" onClick={() => (abierta ? cerrar() : setAbierta(true))} className="btn btn-secundario py-1.5 text-sm" aria-expanded={abierta}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01" />
              </svg>
              {abierta ? "Ocultar ayuda" : "Ayuda"}
            </button>
          )}
        </div>
      </div>
      {pasos && abierta && (
        <section className="animate-entra mt-4 rounded-lg border border-linea bg-hoja p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Cómo se usa</p>
            <button type="button" onClick={cerrar} className="text-sm font-medium text-tinta hover:underline">
              Entendido, ocultar
            </button>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pasos.map((p, i) => (
              <li key={i} className="flex gap-3 border-l-2 border-tinta/30 pl-3">
                <span className="text-sm font-semibold text-tinta">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <b className="block text-sm font-semibold">{p.titulo}</b>
                  <span className="text-sm text-gris">{p.texto}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
