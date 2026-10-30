"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Semaforo } from "@/lib/types";
import { clp, miles } from "@/lib/format";

/* ------------------------------ montos ------------------------------ */

export function Monto({
  valor,
  deuda = false,
  className = "",
  signo = false,
  cero = "—",
}: {
  valor: number;
  deuda?: boolean;
  className?: string;
  signo?: boolean;
  cero?: string;
}) {
  if (valor === 0 && cero) return <span className={`cifra text-gris/60 ${className}`}>{cero}</span>;
  const rojo = deuda && valor > 0;
  return (
    <span className={`cifra ${rojo ? "deuda" : ""} ${className}`}>
      {signo && valor > 0 ? "+" : ""}
      {clp(valor)}
    </span>
  );
}

/** Monto grande con el "$" chico, como en la pizarra */
export function MontoGrande({ valor, className = "", deuda = true }: { valor: number; className?: string; deuda?: boolean }) {
  const rojo = deuda && valor > 0;
  return (
    <span className={`cifra font-semibold tracking-tight ${rojo ? "deuda" : valor < 0 ? "text-pera" : ""} ${className}`}>
      <span className="mr-[0.08em] align-[0.42em] text-[0.45em] font-medium">$</span>
      {miles(Math.abs(valor))}
      {valor < 0 && <span className="ml-2 align-middle text-[0.3em] font-sans uppercase tracking-wider">a favor</span>}
    </span>
  );
}

/** Número que corre de un valor a otro (deuda que baja al abonar) */
export function useCuenta(objetivo: number, ms = 900): number {
  const [v, setV] = useState(objetivo);
  const desde = useRef(objetivo);
  useEffect(() => {
    const ini = desde.current;
    if (ini === objetivo) return;
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(ini + (objetivo - ini) * e));
      if (k < 1) raf = requestAnimationFrame(paso);
      else desde.current = objetivo;
    };
    raf = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(raf);
      desde.current = objetivo;
    };
  }, [objetivo, ms]);
  return v;
}

/* --------------------------- numeradora (N° de vale) --------------------------- */

export function Numeradora({ numero, className = "" }: { numero: number; className?: string }) {
  const digitos = String(numero).split("");
  return (
    <span className={`cifra inline-flex ${className}`} aria-label={`Número ${numero}`}>
      {digitos.map((d, i) => (
        <span key={digitos.length - i} className="rodillo">
          <span style={{ transform: `translateY(-${Number(d) * 10}%)` }}>
            {Array.from({ length: 10 }, (_, k) => (
              <span key={k} className="block h-[1em]">
                {k}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/* ------------------------------- semáforo ------------------------------- */

export const COLOR_SEMAFORO: Record<Semaforo, { bg: string; txt: string; label: string; corto: string }> = {
  VERDE: { bg: "#4f7f2a", txt: "#fff", label: "Al día", corto: "VERDE" },
  AMARILLO: { bg: "#e6c238", txt: "#3b2f05", label: "Atrasado", corto: "AMARILLO" },
  ROJO: { bg: "#c4262e", txt: "#fff", label: "Moroso", corto: "ROJO" },
};

export function StickerSemaforo({
  s,
  manual = false,
  compacto = false,
  onClick,
  title,
}: {
  s: Semaforo;
  manual?: boolean;
  compacto?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const c = COLOR_SEMAFORO[s];
  const contenido = (
    <>
      {manual && (
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className="-ml-0.5">
          <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="5" cy="5" r="1.4" fill="currentColor" />
        </svg>
      )}
      {compacto ? c.corto : c.label}
    </>
  );
  const style = { background: c.bg, color: c.txt };
  if (onClick)
    return (
      <button type="button" onClick={onClick} title={title} className="sticker foco cursor-pointer transition-transform hover:-rotate-3 active:scale-95" style={style}>
        {contenido}
      </button>
    );
  return (
    <span className="sticker" style={style} title={title}>
      {contenido}
    </span>
  );
}

/** Puntito de color para listas densas */
export function Punto({ s }: { s: Semaforo }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full ring-2 ring-white/70"
      style={{ background: COLOR_SEMAFORO[s].bg }}
      aria-label={COLOR_SEMAFORO[s].label}
    />
  );
}

/* --------------------------------- timbre --------------------------------- */

export function Timbre({
  children,
  color = "#c4262e",
  className = "",
  animar = true,
  rot,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  animar?: boolean;
  rot?: number;
}) {
  return (
    <span
      className={`timbre ${animar ? "animate-timbre" : ""} ${className}`}
      style={{ color, ...(rot !== undefined ? { transform: `rotate(${rot}deg)` } : {}) }}
    >
      {children}
    </span>
  );
}

export function Tecla({ children }: { children: ReactNode }) {
  return <kbd className="tecla">{children}</kbd>;
}

/* --------------------------------- modal --------------------------------- */

export function Modal({
  abierto,
  onCerrar,
  children,
  ancho = "max-w-md",
  etiqueta,
}: {
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: string;
  etiqueta: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrar();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#2a2013]/45 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
    >
      <div className={`hoja perforado animate-entra w-full ${ancho} rounded-b-md p-5`}>{children}</div>
    </div>
  );
}

/* ------------------------------ forma de pago ------------------------------ */

export const FORMA: Record<string, { label: string; tecla: string; color: string }> = {
  EFECTIVO: { label: "Efectivo", tecla: "E", color: "#4f7f2a" },
  TRANSFERENCIA: { label: "Transferencia", tecla: "T", color: "#1f3c8f" },
  CREDITO: { label: "Crédito", tecla: "C", color: "#c4262e" },
};

export function FormaChip({ forma }: { forma: string }) {
  const f = FORMA[forma];
  return (
    <span className="cajon text-[11px]" style={{ color: f.color }}>
      {forma === "TRANSFERENCIA" ? "TRANSF." : f.label}
    </span>
  );
}

/* ------------------------------- vacío ------------------------------- */

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-gris">
      <svg width="54" height="40" viewBox="0 0 54 40" aria-hidden className="opacity-60">
        <path d="M3 12h48l-4 26H7z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M3 12l6-9h36l6 9M14 20h26M12 28h30" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
      <p className="font-mano text-xl">{children}</p>
    </div>
  );
}
