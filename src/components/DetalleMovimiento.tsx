"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Movimiento } from "@/lib/types";
import { anular, corregirNumero, mismaOperacion, useData } from "@/lib/store";
import { efectoDeuda, ETIQUETA_TIPO } from "@/lib/calc";
import { cant, clp, fechaLarga, hora } from "@/lib/format";
import { FORMA, FormaChip, Modal, Timbre } from "./ui";
import { useAviso } from "./Shell";
import { useEsAdmin } from "./sistema/useEsAdmin";
import { BorrarMovimiento, EditarVale } from "./vale/EditarVale";

export const COLOR_TIPO: Record<Movimiento["tipo"], string> = {
  VALE_VENTA: "#6c665d",
  VALE_CREDITO: "#b4412f",
  ABONO: "#2f5d8f",
  INGRESO: "#6c665d",
  EGRESO: "#6c665d",
  ENVASE_COBRO: "#166534",
  ENVASE_DEVOLUCION: "#b45309",
};

export function TipoChip({ tipo, corto = false }: { tipo: Movimiento["tipo"]; corto?: boolean }) {
  const label = corto
    ? { VALE_VENTA: "VENTA", VALE_CREDITO: "CRÉDITO", ABONO: "ABONO", INGRESO: "INGRESO", EGRESO: "EGRESO", ENVASE_COBRO: "ENVASES", ENVASE_DEVOLUCION: "DEVOL. ENV." }[tipo]
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
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [nuevoN, setNuevoN] = useState("");
  const [errN, setErrN] = useState<string | null>(null);
  const [admin, setAdmin] = useState<null | "editar" | "borrar">(null);
  const esAdmin = useEsAdmin(!!movId);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setAnulando(false);
    setMotivo("");
    setRecien(false);
    setCorrigiendo(false);
    setErrN(null);
    setAdmin(null);
  }, [movId]);
  useEffect(() => {
    if (anulando) ref.current?.focus();
  }, [anulando]);

  const mov = movId ? data?.idx.mov.get(movId) : undefined;
  if (!data || !mov) return null;
  const cli = mov.cliente_id ? data.idx.cliente.get(mov.cliente_id) : null;
  const lineas = data.idx.lineasMov.get(mov.id) ?? [];
  const lineasEnv = data.db.lineas_envase.filter((l) => l.movimiento_id === mov.id);
  const nombreEnvase = (id: string) => data.db.envases.find((e) => e.id === id)?.nombre ?? "Envase";
  const ligados = data.db.movimientos.filter(
    (m) => m.origen_id === mov.id || m.id === mov.origen_id || (m.id !== mov.id && mov.tipo === "ABONO" && !!mov.glosa?.includes("Abono combinado:") && mismaOperacion(m, mov)),
  );
  // cruce: cómo queda la cuenta del cliente si se anula este movimiento
  const saldoTras = (() => {
    if (!mov.cliente_id || mov.anulado_at) return null;
    const actual = (data.idx.movsCliente.get(mov.cliente_id) ?? []).reduce((a, m) => a + efectoDeuda(m), 0);
    const quita = efectoDeuda(mov) + ligados.filter((l) => l.origen_id === mov.id).reduce((a, l) => a + efectoDeuda(l), 0);
    return actual - quita;
  })();

  const confirmar = () => {
    if (motivo.trim().length < 4) return;
    anular(mov.id, motivo.trim());
    setRecien(true);
    setAnulando(false);
    avisar({ titulo: `N°${mov.numero} anulado`, detalle: "Queda registrado en la bitácora.", tono: "rojo" });
  };

  const esVale = mov.tipo === "VALE_VENTA" || mov.tipo === "VALE_CREDITO";
  if (admin === "editar")
    return (
      <Modal abierto={!!movId} onCerrar={onCerrar} ancho="max-w-2xl" etiqueta={`Editar N° ${mov.numero}`}>
        <EditarVale
          mov={mov}
          onCancelar={() => setAdmin(null)}
          onListo={(msg) => {
            setAdmin(null);
            avisar({ titulo: "Vale editado", detalle: `${msg}. Queda en el historial.`, tono: "tinta" });
          }}
        />
      </Modal>
    );

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
          <div className="text-right">
          {corrigiendo ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseInt(nuevoN.replace(/\D/g, ""), 10);
                const err = corregirNumero(mov.id, n);
                if (err) return setErrN(err);
                avisar({ titulo: `Folio corregido: N°${mov.numero} → N°${n}`, detalle: "Queda registrado en la bitácora.", tono: "tinta" });
                setCorrigiendo(false);
              }}
            >
              <input autoFocus value={nuevoN} onChange={(e) => { setNuevoN(e.target.value); setErrN(null); }} inputMode="numeric" className="campo w-28 py-1 text-right" aria-label="Nuevo N° de vale" />
              <button type="submit" className="btn btn-primario py-1.5 text-sm">OK</button>
            </form>
          ) : (
          <p className="cifra text-2xl font-semibold text-fuji">
            <span className="text-base">N°</span> {mov.numero}
          </p>
          )}
          {errN && <p className="mt-1 text-xs text-fuji">{errN}</p>}
          {!corrigiendo && !mov.anulado_at && (
            <button type="button" onClick={() => { setNuevoN(String(mov.numero)); setCorrigiendo(true); }} className="text-xs font-medium text-tinta hover:underline">
              Corregir N°
            </button>
          )}
          </div>
        </div>

        {cli && (
          <Link href={`/clientes/${cli.id}`} onClick={onCerrar} className="mt-3 block border-b border-dashed border-kraft pb-2 hover:text-tinta">
            <span className="stencil text-xl">{cli.alias ?? cli.nombre}</span>
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
                <tr key={l.id}>
                  <td className="cifra py-1.5">{cant(l.cantidad)}</td>
                  <td>
                    <span className="text-gris">{l.unidad === "ENVASE" ? "BIN" : l.unidad}</span> <b>{data.idx.producto.get(l.producto_id)?.nombre}</b>
                  </td>
                  <td className="cifra text-right">{clp(l.precio_unitario)}</td>
                  <td className="cifra text-right">{clp(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : lineasEnv.length > 0 ? (
          <table className="mt-3 w-full text-[15px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-gris">
                <th className="py-1 font-medium">Cant.</th>
                <th className="font-medium">Envase</th>
                <th className="text-right font-medium">Garantía</th>
                <th className="text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="libro">
              {lineasEnv.map((l) => (
                <tr key={l.id}>
                  <td className="cifra py-1.5">{l.cantidad}</td>
                  <td>
                    <b>{nombreEnvase(l.envase_id)}</b> <span className="text-gris">{mov.tipo === "ENVASE_COBRO" ? "entregados" : "devueltos"}</span>
                  </td>
                  <td className="cifra text-right">{clp(l.precio_unitario)}</td>
                  <td className="cifra text-right">{clp(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          mov.glosa && <p className="mt-4 text-lg">{mov.glosa}</p>
        )}
        {(lineas.length > 0 || lineasEnv.length > 0) && mov.glosa && <p className="mt-2 text-sm text-gris">{mov.glosa}</p>}

        <div className="mt-4 flex items-end justify-between">
          {mov.tipo === "ENVASE_DEVOLUCION" && mov.forma_pago === "CREDITO" ? <span className="text-xs text-gris">Descontado de la deuda</span> : <FormaChip forma={mov.forma_pago} />}
          <p className="text-right">
            <span className="rotulo mr-3">Total</span>
            <span className={`cifra doble-raya text-2xl font-semibold ${mov.anulado_at ? "text-gris line-through" : ""}`}>{clp(mov.total)}</span>
          </p>
        </div>

        {ligados.length > 0 && (
          <p className="mt-3 text-sm text-gris">
            {ligados.map((l) => (
              <span key={l.id} className="mr-3">
                ↳ {l.origen_id === mov.id
                  ? `Pagado en el vale (${FORMA[l.forma_pago]?.label.toLowerCase() ?? l.forma_pago})`
                  : l.id === mov.origen_id
                    ? "Vale de origen"
                    : `Otra parte del abono (${FORMA[l.forma_pago]?.label.toLowerCase() ?? l.forma_pago})`}{" "}
                N°{l.numero} · {clp(l.total)}
                {l.anulado_at && " (anulado)"}
              </span>
            ))}
          </p>
        )}

        {mov.importado && <p className="mt-2 text-xs text-gris">Importado desde la planilla</p>}

        {mov.anulado_at && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Timbre className="text-4xl" animar={recien}>Anulado</Timbre>
            </div>
            <div className="mt-4 border-l-2 border-fuji bg-fuji/5 px-3 py-2 text-sm">
              <b>Anulado</b> por {mov.anulado_por} el {fechaLarga(mov.anulado_at.slice(0, 10))} a las {hora(mov.anulado_at)}
              <br />
              <span className="text-gris">Motivo:</span> {mov.motivo_anulacion}
            </div>
          </>
        )}

        {!mov.anulado_at && !anulando && admin !== "borrar" && (
          <div className="mt-5 flex justify-between gap-2 border-t border-linea pt-4">
            <button type="button" onClick={onCerrar} className="btn btn-secundario">
              Cerrar
            </button>
            <button type="button" onClick={() => setAnulando(true)} className="btn text-fuji hover:bg-fuji/10">
              Anular…
            </button>
          </div>
        )}

        {esAdmin && !anulando && admin !== "borrar" && !mov.origen_id && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-carton/60 px-3 py-2">
            <span className="text-xs font-semibold text-gris">Administrador</span>
            <span className="flex gap-2">
              {esVale && !mov.anulado_at && (
                <button type="button" onClick={() => setAdmin("editar")} className="btn btn-secundario py-1.5 text-sm">
                  Editar vale
                </button>
              )}
              <button type="button" onClick={() => setAdmin("borrar")} className="btn py-1.5 text-sm text-fuji hover:bg-fuji/10">
                Borrar…
              </button>
            </span>
          </div>
        )}

        {admin === "borrar" && (
          <BorrarMovimiento
            mov={mov}
            onCancelar={() => setAdmin(null)}
            onListo={(msg) => {
              avisar({ titulo: msg, detalle: "Queda una copia en el historial.", tono: "rojo" });
              onCerrar();
            }}
          />
        )}

        {anulando && (
          <div className="mt-5 border-t border-linea pt-4">
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
            {saldoTras !== null && saldoTras < 0 && (
              <p className="mt-2 text-sm text-fuji">
                Ojo: este vale ya está pagado. Al anularlo, {cli?.alias ?? cli?.nombre} quedará con {clp(-saldoTras)} a favor.
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setAnulando(false)} className="btn btn-secundario">
                Volver
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={motivo.trim().length < 4}
                className="btn bg-fuji text-hoja disabled:opacity-40"
              >
                Anular vale
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
