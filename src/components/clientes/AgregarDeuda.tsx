"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { EstadoCliente } from "@/lib/calc";
import { cargarDeuda } from "@/lib/store";
import { clp, hoy, miles, parseMonto } from "@/lib/format";
import { useAviso } from "../Shell";
import { Modal } from "../ui";

const MOTIVOS = ["Saldo anterior", "Préstamo", "Ajuste de cuenta"];

/** Suma deuda a un cliente sin productos (saldo de antes, préstamo, ajuste). */
export function AgregarDeuda({ est, abierto, onCerrar }: { est: EstadoCliente; abierto: boolean; onCerrar: () => void }) {
  const avisar = useAviso();
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [fecha, setFecha] = useState(hoy());
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setMonto("");
    setMotivo(MOTIVOS[0]);
    setFecha(hoy());
    setTimeout(() => ref.current?.focus(), 30);
  }, [abierto]);

  const m = parseMonto(monto) ?? 0;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (m <= 0 || !motivo.trim()) return;
    const mov = cargarDeuda({ cliente_id: est.cliente.id, monto: m, glosa: motivo.trim(), fecha });
    avisar({ titulo: `Deuda agregada · N°${mov.numero}`, detalle: `${est.cliente.alias ?? est.cliente.nombre} · ${clp(m)} · ${motivo.trim()}`, tono: "rojo" });
    onCerrar();
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} etiqueta="Agregar deuda">
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <p className="stencil text-2xl">Agregar deuda</p>
          <p className="text-sm text-gris">
            A {est.cliente.alias ?? est.cliente.nombre}, sin productos. Para una venta fiada usa un vale con forma de pago Crédito.
          </p>
        </div>
        <label className="block">
          <span className="rotulo">Monto</span>
          <input
            ref={ref}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onBlur={() => m && setMonto(miles(m))}
            inputMode="numeric"
            placeholder="$"
            className="campo text-right text-2xl font-semibold"
          />
        </label>
        <div>
          <span className="rotulo">Motivo</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {MOTIVOS.map((x) => (
              <button key={x} type="button" aria-pressed={motivo === x} onClick={() => setMotivo(x)} className="opcion py-1 text-sm">
                {x}
              </button>
            ))}
          </div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo mt-2 font-sans" aria-label="Motivo" placeholder="Otro motivo" />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <span className="rotulo">Fecha</span>
          <input type="date" value={fecha} max={hoy()} onChange={(e) => e.target.value && setFecha(e.target.value)} className="bg-transparent text-sm" />
        </label>
        <p className="border-t border-linea pt-3 text-sm text-gris">
          Debe hoy <span className="cifra text-grafito">{clp(est.saldo)}</span>
          {m > 0 && (
            <>
              {" "}
              → quedará en <b className="cifra text-fuji">{clp(est.saldo + m)}</b>
            </>
          )}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" disabled={m <= 0 || !motivo.trim()} className="btn btn-primario disabled:opacity-40">
            Agregar deuda
          </button>
        </div>
      </form>
    </Modal>
  );
}
