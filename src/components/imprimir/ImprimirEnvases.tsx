"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useData } from "@/lib/store";
import { envasesPorCliente } from "@/lib/calc";
import { clp, fechaLarga, hoy } from "@/lib/format";
import { Cabecera, useImprimirAlCargar } from "./ImprimirCaja";

/** Listado de envases en poder de clientes, para imprimir o guardar en PDF. */
export function ImprimirEnvases() {
  const data = useData()!;
  const params = useSearchParams();
  useImprimirAlCargar(params.get("auto") !== "0");
  const envases = [...data.db.envases].sort((a, b) => a.orden - b.orden);
  const filas = useMemo(() => {
    const xs: { nombre: string; telefono: string | null; por: Map<string, number>; garantia: number }[] = [];
    envasesPorCliente(data.db, data.idx).forEach((ss, id) => {
      const c = data.idx.cliente.get(id);
      const por = new Map(ss.map((s) => [s.envase_id, s.cantidad]));
      const garantia = ss.reduce((a, s) => a + s.garantia, 0);
      if ([...por.values()].some((n) => n !== 0) || garantia !== 0)
        xs.push({ nombre: c ? (c.alias ?? c.nombre) : "—", telefono: c?.telefono ?? null, por, garantia });
    });
    return xs.sort((a, b) => b.garantia - a.garantia);
  }, [data]);
  const usados = envases.filter((e) => filas.some((f) => f.por.get(e.id)));
  const total = (id: string) => filas.reduce((a, f) => a + (f.por.get(id) ?? 0), 0);
  const garantia = filas.reduce((a, f) => a + f.garantia, 0);

  return (
    <div className="imprimible">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
        <Link href="/envases" className="btn btn-secundario">
          ← Volver
        </Link>
        <span className="flex-1 text-sm text-gris">Para descargar, elija «Guardar como PDF» en la ventana de impresión.</span>
        <button type="button" onClick={() => window.print()} className="btn btn-primario">
          Imprimir o guardar PDF
        </button>
      </div>
      <div className="hoja-a4 mx-auto bg-white shadow-lg">
        <Cabecera db={data.db} titulo="Envases en poder de clientes" sub={`Al ${fechaLarga(hoy())} · ${filas.length} clientes · garantía total ${clp(garantia)}`} />
        <table className="w-full text-[9.5pt] [&_td]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-grafito/60 text-left">
              <th className="py-1 pr-1 font-semibold">#</th>
              <th className="pr-1 font-semibold">Cliente</th>
              <th className="pr-1 font-semibold">Teléfono</th>
              {usados.map((e) => (
                <th key={e.id} className="pr-1 text-right font-semibold">
                  {e.nombre}
                </th>
              ))}
              <th className="text-right font-semibold">Garantía</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="break-inside-avoid border-b border-linea">
                <td className="py-0.5 pr-1 text-gris">{i + 1}</td>
                <td className="max-w-[55mm] truncate pr-1 font-semibold">{f.nombre}</td>
                <td className="pr-1">{f.telefono ?? ""}</td>
                {usados.map((e) => (
                  <td key={e.id} className="cifra pr-1 text-right">
                    {f.por.get(e.id) || ""}
                  </td>
                ))}
                <td className="cifra text-right font-semibold">{clp(f.garantia)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-grafito/60">
              <td colSpan={3} className="pt-2 font-semibold">
                Total
              </td>
              {usados.map((e) => (
                <td key={e.id} className="cifra pt-2 text-right font-semibold">
                  {total(e.id)}
                </td>
              ))}
              <td className="cifra pt-2 text-right font-semibold">
                <span className="doble-raya">{clp(garantia)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
