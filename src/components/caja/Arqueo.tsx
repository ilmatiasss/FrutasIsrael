"use client";
import { useEffect, useState } from "react";
import type { Arqueo as TArqueo } from "@/lib/types";
import { clp, miles } from "@/lib/format";

/** Billetes y monedas chilenos en circulación */
export const BILLETES = [20000, 10000, 5000, 2000, 1000];
export const MONEDAS = [500, 100, 50, 10];
const TODAS = [...BILLETES, ...MONEDAS];

const clave = (fecha: string) => `frutas-israel:arqueo:${fecha}`;

export function totalArqueo(cant: Record<string, number>): number {
  return TODAS.reduce((a, d) => a + d * (cant[d] ?? 0), 0);
}

/**
 * Arqueo de billetes: se cuenta cuántos hay de cada uno y se compara con lo
 * que "debe haber en caja". El borrador queda en este equipo hasta cerrar.
 */
export function Arqueo({
  fecha,
  esperado,
  guardado,
  onCambio,
}: {
  fecha: string;
  esperado: number;
  guardado: TArqueo | null;
  onCambio: (a: TArqueo | null) => void;
}) {
  const [cant, setCant] = useState<Record<string, string>>({});

  // borrador local por fecha; si la caja ya se cerró con arqueo, parte de ese
  useEffect(() => {
    let inicial: Record<string, string> = {};
    try {
      const b = localStorage.getItem(clave(fecha));
      if (b) inicial = JSON.parse(b);
    } catch {}
    if (!Object.keys(inicial).length && guardado) inicial = Object.fromEntries(Object.entries(guardado.cantidades).map(([k, v]) => [k, String(v)]));
    setCant(inicial);
  }, [fecha, guardado]);

  const numeros = Object.fromEntries(TODAS.map((d) => [d, parseInt((cant[d] ?? "").replace(/\D/g, ""), 10) || 0]));
  const contado = totalArqueo(numeros);
  const hayAlgo = TODAS.some((d) => numeros[d] > 0);
  const diferencia = contado - esperado;

  useEffect(() => {
    onCambio(hayAlgo ? { cantidades: Object.fromEntries(TODAS.filter((d) => numeros[d] > 0).map((d) => [d, numeros[d]])), contado, esperado, diferencia } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contado, esperado, hayAlgo, JSON.stringify(numeros)]);

  const cambiar = (d: number, v: string) => {
    const n = { ...cant, [d]: v.replace(/\D/g, "").slice(0, 5) };
    setCant(n);
    try {
      localStorage.setItem(clave(fecha), JSON.stringify(n));
    } catch {}
  };

  const fila = (d: number) => (
    <label key={d} className="grid grid-cols-[4.5rem_4.25rem_minmax(0,1fr)] items-center gap-2 py-0.5">
      <span className="cifra text-[13px]">{clp(d)}</span>
      <input
        value={cant[d] ?? ""}
        onChange={(e) => cambiar(d, e.target.value)}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        placeholder="0"
        aria-label={`Cantidad de ${d >= 1000 ? "billetes" : "monedas"} de ${clp(d)}`}
        className="campo py-1 text-right font-sans text-sm"
      />
      <span className="cifra text-right text-[13px] text-gris">{numeros[d] ? miles(numeros[d] * d) : "·"}</span>
    </label>
  );

  return (
    <div className="font-sans" aria-label="Arqueo de billetes">
      <p className="mb-1 text-[11px] uppercase tracking-[0.25em] text-gris">Arqueo de billetes</p>
      <p className="mb-2 text-[12px] text-gris">Escriba cuántos hay de cada uno.</p>
      <div className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gris">Billetes</p>
          {BILLETES.map(fila)}
        </div>
        <div>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gris sm:mt-0 xl:mt-2 2xl:mt-0">Monedas</p>
          {MONEDAS.map(fila)}
        </div>
      </div>
      <div className="mt-2 space-y-0.5 border-t border-grafito/50 pt-2 text-[14px]">
        <p className="flex justify-between">
          <span>Contado</span>
          <b className="cifra">{clp(contado)}</b>
        </p>
        <p className="flex justify-between text-gris">
          <span>Debe haber</span>
          <span className="cifra">{clp(esperado)}</span>
        </p>
        {hayAlgo && (
          <p
            className={`flex justify-between rounded px-1.5 py-0.5 font-semibold ${diferencia === 0 ? "bg-[#ecf5ef] text-[#166534]" : diferencia > 0 ? "bg-[#eef3fe] text-[#1d4ed8]" : "bg-[#fdeeec] text-fuji"}`}
            role="status"
          >
            <span>{diferencia === 0 ? "Cuadra" : diferencia > 0 ? "Sobra" : "Falta"}</span>
            <span className="cifra">{clp(Math.abs(diferencia))}</span>
          </p>
        )}
        {hayAlgo && (
          <button
            type="button"
            onClick={() => {
              setCant({});
              try {
                localStorage.removeItem(clave(fecha));
              } catch {}
            }}
            className="no-print text-xs text-gris underline decoration-dotted"
          >
            borrar conteo
          </button>
        )}
      </div>
    </div>
  );
}
