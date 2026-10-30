"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Movimiento } from "@/lib/types";
import { anular, useData } from "@/lib/store";
import { ETIQUETA_TIPO } from "@/lib/calc";
import { cant, clp, fechaLarga, hora } from "@/lib/format";
import { FormaChip, Modal, Tecla, Timbre } from "./ui";
import { useAviso } from "./Shell";

export const COLOR_TIPO: Record<Movimiento["tipo"], string> = {
  VALE_VENTA: "#4f7f2a",
  VALE_CREDITO: "#c4262e",
  ABONO: "#1f3c8f",
  INGRESO: "#8a6a3d",
  EGRESO: "#dd7420",
};

export function TipoChip({ tipo, corto = false }: { tipo: Movimiento["tipo"]; corto?: boolean }) {
  const label = corto
    ? { VALE_VENTA: "VENTA", VALE_CREDITO: "CRÉDITO", ABONO: "ABONO", INGRESO: "INGRESO", EGRESO: "EGRESO" }[tipo]
    : ETIQUETA_TIPO[tipo];
  return (
    <span className="cajon whitespace-nowrap text-[11px]" style={{ color: COLOR_TIPO[tipo] }}>
      {label}
    </span>
  );
}

/** Hoja del vale en grande + anulación con motivo */
export function DetalleMovimiento({ movId, onCerrar }: { movId: string | null; onCerrar: () => void }) {
  const data = useData();
  const avisar = useAviso();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [recien, setRecien] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setAnulando(false);
    setMotivo("");
    setRecien(false);
  }, [movId]);
  useEffect(() => {
    if (anulando) ref.current?.focus();
  }, [anulando]);

  const mov = movId ? data?.idx.mov.get(movId) : undefined;
  if (!data || !mov) return null;
  const cli = mov.cliente_id ? data.idx.cliente.get(mov.cliente_id) : null;
  const lineas = data.idx.lineasMov.get(mov.id) ?? [];
  const ligados = data.db.movimientos.filter((m) => m.origen_id === mov.id || m.id === mov.origen_id);

  const confirmar = () => {
    if (motivo.trim().length < 4) return;
    anular(mov.id, motivo.trim());
    setRecien(true);
    setAnulando(false);
    avisar({ titulo: `N°${mov.numero} anulado`, detalle: "Queda registrado en la bitácora.", tono: "rojo" });
  };

  return (
    <Modal abierto={!!movId} onCerrar={onCerrar} ancho="max-w-lg" etiqueta={`Detalle N° ${mov.numero}`}>
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <TipoChip tipo={mov.tipo} />
            <p className="mt-2 text-sm text-gris">
              {fechaLarga(mov.fecha)} · {hora(mov.created_at)} · {mov.creado_por}
            </p>
          </div>
          <p className="cifra text-3xl font-bold text-fuji">
            <span className="text-base">N°</span> {mov.numero}
          </p>
        </div>

        {cli && (
          <Link href={`/clientes/${cli.id}`} onClick={onCerrar} className="mt-3 block border-b border-dashed border-kraft pb-2 hover:text-tinta">
            <span className="text-xs uppercase tracking-widest text-gris">Señor(a) </span>
            <span className="stencil text-2xl font-extrabold">{cli.alias ?? cli.nombre}</span>
            {cli.alias && <span className="ml-2 text-gris">{cli.nombre}</span>}
          </Link>
        )}

        {lineas.length > 0 ? (
          <table className="mt-3 w-full text-[15px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-gris">
                <th className="py-1 font-medium">Cant.</th>
                <th className="font-medium">Detalle</th>
                <th className="text-right font-medium">Precio</th>
                <th className="text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="libro">
              {lineas.map((l) => (
                <tr key={l.id} className="text-tinta">
                  <td className="cifra py-1.5">{cant(l.cantidad)}</td>
                  <td>
                    <span className="text-gris">{l.unidad}</span> <b>{data.idx.producto.get(l.producto_id)?.nombre}</b>
                  </td>
                  <td className="cifra text-right">{clp(l.precio_unitario)}</td>
                  <td className="cifra text-right">{clp(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          mov.glosa && <p className="mt-4 font-mano text-2xl text-tinta">{mov.glosa}</p>
        )}
        {lineas.length > 0 && mov.glosa && <p className="mt-2 text-sm text-gris">{mov.glosa}</p>}

        <div className="mt-4 flex items-end justify-between">
          <FormaChip forma={mov.forma_pago} />
          <p className="text-right">
            <span className="mr-3 text-xs uppercase tracking-widest text-gris">Total</span>
            <span className={`cifra doble-raya text-2xl font-bold ${mov.anulado_at ? "text-gris line-through" : "text-tinta"}`}>{clp(mov.total)}</span>
          </p>
        </div>

        {ligados.length > 0 && (
          <p className="mt-3 text-sm text-gris">
            {ligados.map((l) => (
              <span key={l.id} className="mr-3">
                ↳ {l.tipo === "ABONO" ? "Abono en el mismo vale" : "Vale de origen"} N°{l.numero} · {clp(l.total)}
                {l.anulado_at && " (anulado)"}
              </span>
            ))}
          </p>
        )}

        {mov.importado && <p className="mt-2 text-xs uppercase tracking-wider text-kraft-osc">Importado desde la planilla</p>}

        {mov.anulado_at && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Timbre className="text-5xl" animar={recien}>Anulado</Timbre>
            </div>
            <div className="mt-4 border-l-4 border-fuji bg-fuji/5 px-3 py-2 text-sm">
              <b>Anulado</b> por {mov.anulado_por} el {fechaLarga(mov.anulado_at.slice(0, 10))} a las {hora(mov.anulado_at)}
              <br />
              <span className="text-gris">Motivo:</span> {mov.motivo_anulacion}
            </div>
          </>
        )}

        {!mov.anulado_at && !anulando && (
          <div className="mt-5 flex justify-between gap-2 border-t border-dashed border-kraft pt-4">
            <button type="button" onClick={onCerrar} className="px-3 py-2 text-gris hover:text-grafito">
              Cerrar <Tecla>Esc</Tecla>
            </button>
            <button
              type="button"
              onClick={() => setAnulando(true)}
              className="cajon px-3 py-1.5 text-fuji transition hover:bg-fuji hover:text-hoja"
            >
              Anular…
            </button>
          </div>
        )}

        {anulando && (
          <div className="mt-5 border-t border-dashed border-kraft pt-4">
            <label className="text-sm font-semibold" htmlFor="motivo">
              ¿Por qué se anula? <span className="font-normal text-gris">(queda registrado, no se borra)</span>
            </label>
            <textarea
              id="motivo"
              ref={ref}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  confirmar();
                }
              }}
              rows={2}
              className="campo mt-2 resize-none font-sans"
              placeholder="Ej: error de digitación, se rehízo en el vale siguiente"
            />
            {ligados.some((l) => l.origen_id === mov.id && !l.anulado_at) && (
              <p className="mt-2 text-sm text-naranjo">También se anulará el abono hecho en este mismo vale.</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setAnulando(false)} className="px-3 py-2 text-gris">
                Volver
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={motivo.trim().length < 4}
                className="stencil rounded-sm bg-fuji px-4 py-2 text-lg font-extrabold text-hoja shadow-[0_3px_0_#7d141a] transition active:translate-y-[2px] active:shadow-none disabled:opacity-40"
              >
                Timbrar anulado <Tecla>↵</Tecla>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
