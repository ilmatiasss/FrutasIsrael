"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { iniciales, normalizar } from "@/lib/format";

/** Puntaje de coincidencia: código exacto > empieza con > iniciales > palabra > contiene */
export function puntaje(q: string, campos: (string | null | undefined)[], codigo?: string): number {
  const nq = normalizar(q);
  if (!nq) return 1;
  let best = 0;
  if (codigo && normalizar(codigo) === nq) return 120;
  for (const c of campos) {
    if (!c) continue;
    const n = normalizar(c);
    if (n === nq) best = Math.max(best, 110);
    else if (n.startsWith(nq)) best = Math.max(best, 95);
    else if (iniciales(c).startsWith(nq.replace(/ /g, ""))) best = Math.max(best, 85);
    else if (n.split(" ").some((w) => w.startsWith(nq))) best = Math.max(best, 75);
    else if (nq.split(" ").every((p) => n.includes(p))) best = Math.max(best, 55);
  }
  if (codigo && normalizar(codigo).startsWith(nq)) best = Math.max(best, 100);
  return best;
}

export interface AutocompletarProps<T> {
  items: T[];
  clave: (t: T) => string;
  filtrar: (q: string) => T[];
  render: (t: T, activo: boolean) => ReactNode;
  query: string;
  setQuery: (q: string) => void;
  onElegir: (t: T) => void;
  onCrear?: (q: string) => void;
  /** Enter con el campo vacío */
  onEnterVacio?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  etiqueta: string;
  max?: number;
  abrirSinTexto?: boolean;
  onKeyDownExtra?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function Autocompletar<T>(p: AutocompletarProps<T>) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const listaRef = useRef<HTMLUListElement>(null);
  const resultados = abierto && (p.query.trim() || p.abrirSinTexto) ? p.filtrar(p.query).slice(0, p.max ?? 8) : [];
  const conCrear = abierto && !!p.onCrear && p.query.trim().length > 1;
  const total = resultados.length + (conCrear ? 1 : 0);

  useEffect(() => setActivo(0), [p.query]);
  useEffect(() => {
    listaRef.current?.querySelector(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const elegir = (i: number) => {
    if (i < resultados.length) p.onElegir(resultados[i]);
    else if (conCrear) p.onCrear!(p.query.trim());
    setAbierto(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    p.onKeyDownExtra?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(a + 1, Math.max(total - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (e.ctrlKey || e.metaKey) return; // Ctrl+Enter = guardar, lo maneja la pantalla
      if (!p.query.trim() && p.onEnterVacio) {
        e.preventDefault();
        p.onEnterVacio();
        return;
      }
      if (total > 0) {
        e.preventDefault();
        elegir(activo);
      }
    } else if (e.key === "Tab" && !e.shiftKey) {
      if (total > 0 && p.query.trim()) {
        e.preventDefault(); // quien elige decide dónde sigue el foco
        elegir(activo);
      }
    } else if (e.key === "Escape") {
      if (abierto && total > 0) {
        e.preventDefault();
        e.stopPropagation();
        setAbierto(false);
      }
    }
  };

  return (
    <div className={`relative ${p.className ?? ""}`}>
      <input
        ref={p.inputRef}
        value={p.query}
        onChange={(e) => {
          p.setQuery(e.target.value);
          setAbierto(true);
        }}
        onFocus={(e) => {
          setAbierto(true);
          e.target.select();
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={onKeyDown}
        placeholder={p.placeholder}
        autoFocus={p.autoFocus}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={total > 0}
        aria-controls={listaId}
        aria-label={p.etiqueta}
        aria-activedescendant={total > 0 ? `${listaId}-${activo}` : undefined}
        className={`campo ${p.inputClassName ?? ""}`}
      />
      {total > 0 && (
        <ul
          ref={listaRef}
          id={listaId}
          role="listbox"
          className="animate-entra absolute left-0 z-40 mt-1 max-h-80 min-w-full overflow-auto rounded-sm border border-kraft bg-hoja py-1 shadow-[0_14px_30px_-12px_rgba(60,40,10,.45)] [animation-duration:160ms]"
        >
          {resultados.map((r, i) => (
            <li
              key={p.clave(r)}
              id={`${listaId}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(i);
              }}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === activo ? "bg-resaltador/80" : ""}`}
            >
              {p.render(r, i === activo)}
            </li>
          ))}
          {conCrear && (
            <li
              id={`${listaId}-${resultados.length}`}
              data-i={resultados.length}
              role="option"
              aria-selected={activo === resultados.length}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(resultados.length);
              }}
              onMouseEnter={() => setActivo(resultados.length)}
              className={`corte-top cursor-pointer border-t border-dashed border-kraft px-3 py-1.5 text-tinta ${activo === resultados.length ? "bg-resaltador/80" : ""}`}
            >
              <span className="font-semibold">+ Cliente nuevo:</span> “{p.query.trim()}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
