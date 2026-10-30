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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {s && (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl sm:size-14" style={{ background: s.suave }}>
            <s.Fruta size={34} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="stencil text-[28px] sm:text-[34px]">{titulo ?? s?.label}</h1>
          <p className="text-[15px] text-gris">{bajada ?? s?.que}</p>
        </div>
        <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
          {derecha}
          {pasos && (
            <button type="button" onClick={() => (abierta ? cerrar() : setAbierta(true))} className="btn btn-secundario py-2 text-sm" aria-expanded={abierta}>
              <span className="flex size-5 items-center justify-center rounded-full bg-tinta text-xs text-white">?</span>
              {abierta ? "Ocultar ayuda" : "¿Cómo se usa?"}
            </button>
          )}
        </div>
      </div>
      {pasos && abierta && (
        <section className="animate-entra mt-4 rounded-2xl border-[1.5px] border-dashed p-4 sm:p-5" style={{ borderColor: (s?.color ?? "#2f7d45") + "66", background: (s?.suave ?? "#e8f3e6") + "99" }}>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pasos.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-hoja text-base font-black shadow-sm" style={{ color: s?.color }}>
                  {i + 1}
                </span>
                <span>
                  <b className="block">{p.titulo}</b>
                  <span className="text-sm text-gris">{p.texto}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 text-right">
            <button type="button" onClick={cerrar} className="btn btn-primario py-1.5 text-sm">
              Entendido
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
