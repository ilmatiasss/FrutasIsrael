"use client";
import { useState } from "react";
import type { Db, Movimiento } from "@/lib/types";
import type { Indice } from "@/lib/calc";
import { clp, hoy, hora } from "@/lib/format";
import { DetalleMovimiento, TipoChip } from "../DetalleMovimiento";

/** Lo emitido hoy, lo último arriba (las colillas que quedan en el talonario) */
export function Colillas({
  data,
  tipos,
  ultimoId,
  titulo = "Hoy",
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
    <section className="hoja rounded-lg" aria-label={titulo}>
      <header className="flex items-baseline justify-between border-b border-linea px-4 py-3">
        <h2 className="font-semibold">{titulo}</h2>
        <span className="text-sm text-gris">
          {vivos.length} · <span className="cifra text-grafito">{clp(total)}</span>
        </span>
      </header>
      <ol className="max-h-[60vh] overflow-auto">
        {movs.length === 0 && <li className="px-4 py-6 text-center text-gris">Todavía nada hoy.</li>}
        {movs.map((m) => {
          const cli = m.cliente_id ? data.idx.cliente.get(m.cliente_id) : null;
          const anulado = !!m.anulado_at;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setVer(m.id)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-linea px-4 py-2 text-left last:border-0 hover:bg-carton/60 ${m.id === ultimoId ? "animate-resalta" : ""}`}
              >
                <span className={`min-w-0 truncate ${anulado ? "text-gris line-through" : ""}`}>
                  <span className="font-medium">{cli ? (cli.alias ?? cli.nombre) : m.glosa}</span>
                </span>
                <span className={`cifra text-right ${anulado ? "text-gris line-through" : m.tipo === "VALE_CREDITO" ? "text-fuji" : ""}`}>{clp(m.total)}</span>
                <span className="text-xs text-gris">
                  N°{m.numero} · {hora(m.created_at)}
                </span>
                <span className="text-right">{anulado ? <span className="cajon text-fuji">Anulado</span> : <TipoChip tipo={m.tipo} corto />}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <DetalleMovimiento movId={ver} onCerrar={() => setVer(null)} />
    </section>
  );
}
