"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { Semaforo } from "@/lib/types";
import { useData } from "@/lib/store";
import { clp, ddmmaa, fechaLarga, hoy } from "@/lib/format";
import { useEstados } from "../clientes";
import { COLOR_SEMAFORO } from "../ui";
import { Cabecera, useImprimirAlCargar } from "./ImprimirCaja";

const ORDEN = { deuda: "mayor deuda", nombre: "nombre", dias: "días sin pago" } as const;

/** Listado completo de clientes con deuda, para imprimir o guardar en PDF. */
export function ImprimirDeudores() {
  const data = useData()!;
  const estados = useEstados(data);
  const params = useSearchParams();
  const filtro = (params.get("estado") ?? "").split(",").filter(Boolean) as Semaforo[];
  const orden = (params.get("orden") ?? "deuda") as keyof typeof ORDEN;
  useImprimirAlCargar(params.get("auto") !== "0");

  const lista = useMemo(() => {
    const xs = [...estados.values()].filter((e) => e.saldo > 0 && (!filtro.length || filtro.includes(e.semaforo)));
    return xs.sort((a, b) =>
      orden === "nombre"
        ? (a.cliente.alias ?? a.cliente.nombre).localeCompare(b.cliente.alias ?? b.cliente.nombre, "es")
        : orden === "dias"
          ? (b.diasSinPagar ?? 0) - (a.diasSinPagar ?? 0)
          : b.saldo - a.saldo,
    );
  }, [estados, filtro, orden]);
  const total = lista.reduce((a, e) => a + e.saldo, 0);
  const porEstado = (["ROJO", "AMARILLO", "VERDE"] as Semaforo[]).map((s) => {
    const xs = lista.filter((e) => e.semaforo === s);
    return { s, n: xs.length, monto: xs.reduce((a, e) => a + e.saldo, 0) };
  });

  return (
    <div className="imprimible">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
        <Link href="/clientes" className="btn btn-secundario">
          ← Volver
        </Link>
        <span className="flex-1 text-sm text-gris">Para descargar, elija «Guardar como PDF» en la ventana de impresión.</span>
        <button type="button" onClick={() => window.print()} className="btn btn-primario">
          Imprimir o guardar PDF
        </button>
      </div>
      <div className="hoja-a4 mx-auto bg-white shadow-lg">
        <Cabecera
          db={data.db}
          titulo="Listado de deudores"
          sub={`Al ${fechaLarga(hoy())} · ${lista.length} clientes · ordenado por ${ORDEN[orden] ?? ORDEN.deuda}${filtro.length ? ` · solo ${filtro.map((f) => COLOR_SEMAFORO[f].label.toLowerCase()).join(", ")}` : ""}`}
        />
        <table className="w-full text-[9pt] [&_td]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-grafito/60 text-left">
              <th className="py-1 pr-1 font-semibold">#</th>
              <th className="pr-1 font-semibold">Cliente</th>
              <th className="hidden pr-1 font-semibold sm:table-cell">Teléfono</th>
              <th className="pr-1 font-semibold">Estado</th>
              <th className="pr-1 text-right font-semibold">Últ. pago</th>
              <th className="pr-1 text-right font-semibold">Días</th>
              <th className="hidden pr-1 text-right font-semibold sm:table-cell">Más antiguo</th>
              <th className="text-right font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e, i) => (
              <tr key={e.cliente.id} className="break-inside-avoid border-b border-linea">
                <td className="py-0.5 pr-1 text-gris">{i + 1}</td>
                <td className="max-w-[62mm] truncate pr-1">
                  <b className="font-semibold">{e.cliente.alias ?? e.cliente.nombre}</b>
                  {e.cliente.alias && <span className="text-gris"> · {e.cliente.nombre}</span>}
                </td>
                <td className="hidden pr-1 sm:table-cell">{e.cliente.telefono ?? ""}</td>
                <td className="pr-1">{COLOR_SEMAFORO[e.semaforo].label}</td>
                <td className="cifra pr-1 text-right">{e.ultimoPago ? ddmmaa(e.ultimoPago) : "nunca"}</td>
                <td className="cifra pr-1 text-right">{e.diasSinPagar ?? ""}</td>
                <td className="cifra hidden pr-1 text-right sm:table-cell">{e.valeMasAntiguo ? ddmmaa(e.valeMasAntiguo) : ""}</td>
                <td className="cifra text-right font-semibold">{clp(e.saldo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-2 font-semibold">
                Total cartera ({lista.length} clientes)
              </td>
              <td colSpan={4} className="cifra pt-2 text-right font-semibold">
                <span className="doble-raya">{clp(total)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-4 grid grid-cols-3 gap-3 text-[9pt]">
          {porEstado.map((x) => (
            <div key={x.s} className="border-t border-grafito/40 pt-1">
              <p className="text-gris">
                {COLOR_SEMAFORO[x.s].label} · {x.n} clientes
              </p>
              <p className="cifra font-semibold">{clp(x.monto)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
