"use client";
import { useMemo } from "react";
import type { Db } from "@/lib/types";
import { pizarra, type Indice } from "@/lib/calc";
import { ddmm, hoy, miles } from "@/lib/format";

/** La pizarra de precios: último precio cobrado de cada producto */
export function Pizarra({ data, resaltado }: { data: { db: Db; idx: Indice }; resaltado: string | null }) {
  const filas = useMemo(() => pizarra(data.db, data.idx), [data]);
  const h = hoy();
  return (
    <section className="pizarra relative rounded-[3px] px-4 pb-4 pt-3" aria-label="Pizarra de precios">
      <div className="flex items-baseline justify-between">
        <h2 className="tiza text-[28px] font-bold leading-none">Precios de hoy</h2>
        <span className="tiza text-lg opacity-70">últ. cobrado</span>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {filas.map(({ producto, precio, fecha, unidad, delta }) => {
          const on = resaltado === producto.id;
          return (
            <li
              key={producto.id}
              className={`flex items-baseline gap-2 border-b border-dashed border-tiza/15 py-[3px] transition-colors ${on ? "rounded-sm bg-tiza/10" : ""}`}
            >
              <span className="size-2.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: producto.color, boxShadow: "0 0 0 1.5px rgba(239,235,221,.5)" }} />
              <span className={`tiza truncate text-[21px] leading-tight ${on ? "text-resaltador" : ""}`}>{producto.nombre.toLowerCase()}</span>
              <span className="tiza text-sm opacity-50">{unidad === "KG" ? "kg" : unidad === "ENVASE" ? "env" : "cj"}</span>
              <span className="flex-1" />
              {delta !== 0 && (
                <span className={`tiza text-base ${delta > 0 ? "text-[#ffb4a8]" : "text-[#bfe6a0]"}`} title={delta > 0 ? "Subió" : "Bajó"}>
                  {delta > 0 ? "▲" : "▼"}
                </span>
              )}
              <span className={`tiza text-[23px] font-bold leading-tight ${on ? "text-resaltador" : ""}`}>${miles(precio)}</span>
              {fecha !== h && <span className="tiza w-9 text-right text-sm opacity-50">{ddmm(fecha)}</span>}
            </li>
          );
        })}
      </ul>
      {/* tiza y borrador en la repisa */}
      <div aria-hidden className="absolute -bottom-[11px] right-8 flex items-end gap-3">
        <span className="block h-[5px] w-9 rounded-full bg-tiza/90 shadow" />
        <span className="block h-[9px] w-14 rounded-[2px] bg-[#3b3b3b] shadow-[inset_0_-3px_0_#c9b48a]" />
      </div>
    </section>
  );
}
