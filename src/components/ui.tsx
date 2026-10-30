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
  if (valor === 0 && cero) return <span className={`text-gris/70 ${className}`}>{cero}</span>;
  const rojo = deuda && valor > 0;
  return (
    <span className={`cifra ${rojo ? "deuda" : ""} ${className}`}>
      {signo && valor > 0 ? "+" : ""}
      {clp(valor)}
    </span>
  );
}

/** Monto grande con el "$" chico */
export function MontoGrande({ valor, className = "", deuda = true }: { valor: number; className?: string; deuda?: boolean }) {
  const rojo = deuda && valor > 0;
  return (
    <span className={`cifra font-semibold tracking-tight ${rojo ? "deuda" : valor < 0 ? "text-pera" : ""} ${className}`}>
      <span className="mr-[0.06em] align-[0.42em] text-[0.45em] font-medium">$</span>
      {miles(Math.abs(valor))}
      {valor < 0 && <span className="ml-2 align-middle font-sans text-[0.3em] uppercase tracking-wider">a favor</span>}
    </span>
  );
}

/** Número que corre de un valor a otro (deuda que baja al abonar) */
export function useCuenta(objetivo: number, ms = 700): number {
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

export const COLOR_SEMAFORO: Record<Semaforo, { bg: string; suave: string; txt: string; label: string; corto: string }> = {
  VERDE: { bg: "#4b7a37", suave: "#e8efe2", txt: "#33561f", label: "Al día", corto: "Al día" },
  AMARILLO: { bg: "#c99a1c", suave: "#f6eed3", txt: "#7a5a06", label: "Atrasado", corto: "Atrasado" },
  ROJO: { bg: "#b4412f", suave: "#f6e3df", txt: "#8f3123", label: "Moroso", corto: "Moroso" },
};

export function StickerSemaforo({
  s,
  manual = false,
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
      <span className="size-2 rounded-full" style={{ background: c.bg }} />
      {c.label}
      {manual && <span className="font-normal opacity-70">· fijo</span>}
    </>
  );
  const style = { background: c.suave, color: c.txt };
  if (onClick)
    return (
      <button type="button" onClick={onClick} title={title} className="sticker cursor-pointer hover:brightness-95" style={style}>
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
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: COLOR_SEMAFORO[s].bg }} aria-label={COLOR_SEMAFORO[s].label} />;
}

/* --------------------------------- timbre --------------------------------- */

export function Timbre({
  children,
  color = "#b4412f",
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
    <span className={`timbre ${animar ? "animate-timbre" : ""} ${className}`} style={{ color, ...(rot !== undefined ? { transform: `rotate(${rot}deg)` } : {}) }}>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#23211d]/35 sm:items-start sm:px-4 sm:pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
    >
      <div className={`hoja animate-entra max-h-[92dvh] w-full overflow-auto rounded-t-xl p-5 sm:rounded-lg ${ancho}`}>{children}</div>
    </div>
  );
}

/* ------------------------------ forma de pago ------------------------------ */

export const FORMA: Record<string, { label: string; tecla: string; color: string }> = {
  EFECTIVO: { label: "Efectivo", tecla: "E", color: "#4b7a37" },
  TRANSFERENCIA: { label: "Transferencia", tecla: "T", color: "#2f5d8f" },
  CREDITO: { label: "Crédito", tecla: "C", color: "#b4412f" },
};

export function FormaChip({ forma }: { forma: string }) {
  return <span className="text-xs text-gris">{forma === "TRANSFERENCIA" ? "Transf." : FORMA[forma].label}</span>;
}

/* ------------------------------- vacío ------------------------------- */

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-gris">{children}</p>;
}
