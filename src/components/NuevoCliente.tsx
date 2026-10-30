"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Cliente } from "@/lib/types";
import { crearCliente } from "@/lib/store";
import { parseMonto } from "@/lib/format";
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
  const [f, setF] = useState({ nombre: "", alias: "", procedencia: "", telefono: "", limite: "" });
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (abierto) {
      setF({ nombre: nombreInicial, alias: "", procedencia: "", telefono: "", limite: "" });
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [abierto, nombreInicial]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (f.nombre.trim().length < 2) return;
    const c = crearCliente({
      nombre: f.nombre,
      alias: f.alias || null,
      procedencia: f.procedencia || null,
      telefono: f.telefono || null,
      limite_credito: parseMonto(f.limite),
    });
    onCreado(c);
  };

  const campo = (k: keyof typeof f, label: string, ph: string, extra?: object) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-gris">{label}</span>
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
        <p className="stencil text-2xl font-extrabold">Cliente nuevo</p>
        {campo("nombre", "Nombre", "Nombre y apellido o razón social", { ref, required: true })}
        <div className="grid grid-cols-2 gap-3">
          {campo("alias", "Alias en el local", "EL FLACO")}
          {campo("telefono", "Teléfono", "+56 9 …", { inputMode: "tel" })}
        </div>
        {campo("procedencia", "Feria / local", "Feria Av. Matta")}
        {campo("limite", "Tope de crédito (opcional)", "ej: 800k", { inputMode: "numeric" })}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCerrar} className="px-3 py-2 text-gris">
            Cancelar
          </button>
          <button type="submit" className="stencil rounded-sm bg-tinta px-4 py-2 text-lg font-extrabold text-hoja shadow-[0_3px_0_#132760] active:translate-y-[2px] active:shadow-none">
            Crear y usar <Tecla>↵</Tecla>
          </button>
        </div>
      </form>
    </Modal>
  );
}
