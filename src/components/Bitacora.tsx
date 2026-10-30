"use client";
import { useMemo, useState } from "react";
import type { Evento } from "@/lib/types";
import { useData } from "@/lib/store";
import { ddmmaa, hora, normalizar } from "@/lib/format";

const COLOR: Record<Evento["accion"], string> = {
  CREAR_MOVIMIENTO: "#1f3c8f",
  ANULAR_MOVIMIENTO: "#c4262e",
  CREAR_CLIENTE: "#4f7f2a",
  EDITAR_CLIENTE: "#8a6a3d",
  CERRAR_CAJA: "#26221d",
  IMPORTAR_CSV: "#dd7420",
  REINICIAR_DEMO: "#6b6255",
};
const ETIQUETA: Record<Evento["accion"], string> = {
  CREAR_MOVIMIENTO: "Emitido",
  ANULAR_MOVIMIENTO: "Anulado",
  CREAR_CLIENTE: "Cliente nuevo",
  EDITAR_CLIENTE: "Ficha editada",
  CERRAR_CAJA: "Cierre",
  IMPORTAR_CSV: "Importación",
  REINICIAR_DEMO: "Demo",
};

/** Registro append-only: nada se borra, todo queda escrito. */
export function Bitacora() {
  const data = useData()!;
  const [q, setQ] = useState("");
  const [solo, setSolo] = useState<Evento["accion"] | null>(null);
  const eventos = useMemo(() => {
    const nq = normalizar(q);
    return [...data.db.eventos]
      .reverse()
      .filter((e) => (!solo || e.accion === solo) && (!nq || normalizar(`${e.detalle} ${e.usuario}`).includes(nq)))
      .slice(0, 400);
  }, [data, q, solo]);
  const anulados = data.db.movimientos.filter((m) => m.anulado_at).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="stencil text-[40px] font-black leading-none sm:text-[52px]">Bitácora</h1>
          <p className="mt-2 max-w-xl text-gris">
            Todo lo que pasa en el sistema queda escrito acá y no se puede borrar. Los movimientos nunca se eliminan: se anulan con motivo, usuario y hora.
          </p>
        </div>
        <p className="text-sm text-gris">
          {data.db.eventos.length} registros · {anulados} movimientos anulados
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-y-2 border-grafito/80 py-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la bitácora (N°, cliente, motivo…)" className="campo max-w-sm font-sans" />
        {(Object.keys(ETIQUETA) as Evento["accion"][]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setSolo(solo === a ? null : a)}
            aria-pressed={solo === a}
            className={`cajon text-[11px] transition ${solo && solo !== a ? "opacity-40" : ""}`}
            style={{ color: COLOR[a] }}
          >
            {ETIQUETA[a]}
          </button>
        ))}
      </div>
      <ol className="hoja renglones rounded-sm font-mono text-[13px]">
        {eventos.map((e) => (
          <li key={e.id} className="grid grid-cols-[5.5rem_3.5rem_7rem_minmax(0,1fr)] items-center gap-2 px-4 leading-9 sm:grid-cols-[5.5rem_3.5rem_7rem_6rem_minmax(0,1fr)]">
            <span className="text-gris">{ddmmaa(e.at.slice(0, 10))}</span>
            <span className="text-gris">{hora(e.at)}</span>
            <span className="cajon w-fit text-[10px] leading-tight" style={{ color: COLOR[e.accion] }}>{ETIQUETA[e.accion]}</span>
            <span className="hidden truncate font-sans font-semibold sm:block">{e.usuario}</span>
            <span className="truncate font-sans">{e.detalle}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
