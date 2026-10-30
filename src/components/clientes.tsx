"use client";
import { useMemo } from "react";
import type { Db } from "@/lib/types";
import { estadoCliente, type EstadoCliente, type Indice } from "@/lib/calc";
import { hoy } from "@/lib/format";
import { puntaje } from "./Autocompletar";
import { Monto, Punto } from "./ui";

export function useEstados(data: { db: Db; idx: Indice } | null): Map<string, EstadoCliente> {
  return useMemo(() => {
    const m = new Map<string, EstadoCliente>();
    if (!data) return m;
    const h = hoy();
    for (const c of data.db.clientes) m.set(c.id, estadoCliente(c, data.idx, data.db.config, h));
    return m;
  }, [data]);
}

/** Busca por alias, nombre o procedencia; desempata por quien compró más reciente */
export function filtrarClientes(q: string, estados: Map<string, EstadoCliente>): EstadoCliente[] {
  const lista = [...estados.values()];
  return lista
    .map((e) => ({ e, s: puntaje(q, [e.cliente.alias, e.cliente.nombre, e.cliente.procedencia]) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.e.ultimaCompra ?? "").localeCompare(a.e.ultimaCompra ?? ""))
    .map((x) => x.e);
}

export function nombreCliente(e: { alias: string | null; nombre: string }): string {
  return e.alias ?? e.nombre;
}

export function OpcionCliente({ e }: { e: EstadoCliente }) {
  return (
    <div className="flex items-center gap-3">
      <Punto s={e.semaforo} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-semibold tracking-wide text-grafito">
          {e.cliente.alias ?? e.cliente.nombre}
          {e.cliente.alias && <span className="ml-2 font-normal text-gris">{e.cliente.nombre}</span>}
        </div>
        {e.cliente.procedencia && <div className="truncate text-xs text-gris">{e.cliente.procedencia}</div>}
      </div>
      <Monto valor={e.saldo} deuda className="text-sm" cero="al día" />
    </div>
  );
}
