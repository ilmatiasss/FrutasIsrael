"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Cliente } from "@/lib/types";
import { cargarDeuda, crearCliente } from "@/lib/store";
import { hoy, parseMonto } from "@/lib/format";
import { Modal, Tecla } from "./ui";

export function NuevoCliente({
  nombreInicial,
  abierto,
  onCerrar,
  onCreado,
}: {
  nombreInicial: string;
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (c: Cliente) => void;
}) {
  const [f, setF] = useState({ nombre: "", alias: "", telefono: "", limite: "", deuda: "" });
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (abierto) {
      setF({ nombre: nombreInicial, alias: "", telefono: "", limite: "", deuda: "" });
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [abierto, nombreInicial]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (f.nombre.trim().length < 2) return;
    const c = crearCliente({
      nombre: f.nombre,
      alias: f.alias || null,
      telefono: f.telefono || null,
      limite_credito: parseMonto(f.limite),
    });
    const deuda = parseMonto(f.deuda);
    if (deuda && deuda > 0) cargarDeuda({ cliente_id: c.id, monto: deuda, glosa: "Saldo anterior", fecha: hoy() });
    onCreado(c);
  };

  const campo = (k: keyof typeof f, label: string, ph: string, extra?: object) => (
    <label className="block">
      <span className="rotulo">{label}</span>
      <input
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        placeholder={ph}
        className="campo font-sans text-lg"
        {...extra}
      />
    </label>
  );

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} etiqueta="Cliente nuevo">
      <form onSubmit={enviar} className="space-y-3">
        <p className="stencil text-2xl">Cliente nuevo</p>
        <p className="-mt-2 text-sm text-gris">Solo el nombre es obligatorio. Lo demás se puede completar después.</p>
        {campo("nombre", "Nombre", "Nombre y apellido o razón social", { ref, required: true })}
        <div className="grid grid-cols-2 gap-3">
          {campo("alias", "Cómo le dicen", "EL FLACO")}
          {campo("telefono", "Teléfono", "+56 9 …", { inputMode: "tel" })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {campo("deuda", "Deuda que ya tiene", "ej: 350k", { inputMode: "numeric" })}
          {campo("limite", "Tope de crédito", "opcional", { inputMode: "numeric" })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCerrar} className="btn text-gris">
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario">
            Crear y usar <Tecla>↵</Tecla>
          </button>
        </div>
      </form>
    </Modal>
  );
}
