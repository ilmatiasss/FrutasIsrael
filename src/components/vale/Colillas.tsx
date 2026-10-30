"use client";
import { useState } from "react";
import type { Db, Movimiento } from "@/lib/types";
import type { Indice } from "@/lib/calc";
import { clp, hoy, hora } from "@/lib/format";
import { DetalleMovimiento, TipoChip } from "../DetalleMovimiento";

/** Las colillas que quedan en el talonario: lo emitido hoy, lo último arriba */
export function Colillas({
  data,
  tipos,
  ultimoId,
  titulo = "Colillas de hoy",
}: {
  data: { db: Db; idx: Indice };
  tipos: Movimiento["tipo"][];
  ultimoId: string | null;
  titulo?: string;
}) {
  const [ver, setVer] = useState<string | null>(null);
  const movs = (data.idx.movsFecha.get(hoy()) ?? []).filter((m) => tipos.includes(m.tipo)).sort((a, b) => b.numero - a.numero);
  const vivos = movs.filter((m) => !m.anulado_at);
  const total = vivos.reduce((a, m) => a + m.total, 0);

  return (
    <section className="hoja perforado-abajo relative rounded-t-sm" aria-label={titulo}>
      <header className="flex items-baseline justify-between border-b-2 border-grafito/80 px-4 pb-2 pt-3">
        <h2 className="stencil text-xl font-extrabold">{titulo}</h2>
        <span className="text-sm text-gris">
          {vivos.length} · <b className="cifra text-grafito">{clp(total)}</b>
        </span>
      </header>
      <ol className="max-h-[46vh] overflow-auto">
        {movs.length === 0 && <li className="px-4 py-6 text-center font-mano text-xl text-gris">Todavía nada hoy.</li>}
        {movs.map((m) => {
          const cli = m.cliente_id ? data.idx.cliente.get(m.cliente_id) : null;
          const anulado = !!m.anulado_at;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setVer(m.id)}
                className={`corte grid w-full grid-cols-[3.6rem_minmax(0,1fr)_auto] items-center gap-x-2 bg-bottom px-4 py-1.5 text-left transition-colors hover:bg-resaltador/40 ${m.id === ultimoId ? "animate-resalta" : ""}`}
              >
                <span className="cifra text-[13px] font-semibold text-fuji">{m.numero}</span>
                <span className={`min-w-0 truncate ${anulado ? "text-gris line-through" : ""}`}>
                  <span className="font-semibold">{cli ? (cli.alias ?? cli.nombre) : m.glosa}</span>
                  <span className="ml-1.5 text-xs text-gris">{hora(m.created_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {anulado ? (
                    <span className="timbre !rotate-[-4deg] text-[10px] text-fuji">Anulado</span>
                  ) : (
                    <TipoChip tipo={m.tipo} corto />
                  )}
                  <span className={`cifra w-[5.6rem] text-right text-[14px] ${anulado ? "text-gris line-through" : m.tipo === "VALE_CREDITO" ? "text-fuji" : "text-tinta"}`}>
                    {clp(m.total)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <DetalleMovimiento movId={ver} onCerrar={() => setVer(null)} />
    </section>
  );
}
