"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CierreCaja } from "./CierreCaja";
import { CierreSemanal } from "./CierreSemanal";
import { Encabezado } from "../Encabezado";

const PASOS = [
  { titulo: "Diario o semanal", texto: "«Diario» detalla los movimientos del día. «Semanal» (lunes a domingo) muestra el saldo de cada cliente al cierre." },
  { titulo: "Arqueo", texto: "Compare el efectivo contado con «Debe haber en caja». Las transferencias se concilian con el banco." },
  { titulo: "Egresos e ingresos", texto: "Registre como Egreso todo dinero que salga de caja (fletes, colaciones, remuneraciones)." },
  { titulo: "Imprimir y cerrar", texto: "Imprima por sección o todo en una hoja; finalice con «Cerrar la caja»." },
];

/** Cierre de caja con dos vistas: el día (detalle) y la semana (solo deuda). */
export function Caja() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const semanal = params.get("vista") === "semanal";

  const pestanas = (
    <div className="no-print inline-flex rounded-md border border-kraft bg-hoja p-0.5" role="tablist" aria-label="Tipo de cierre">
      {[
        { k: false, label: "Diario" },
        { k: true, label: "Semanal" },
      ].map((t) => (
        <button
          key={t.label}
          type="button"
          role="tab"
          aria-selected={semanal === t.k}
          onClick={() => router.replace(t.k ? `${path}?vista=semanal` : path)}
          className={`rounded px-4 py-1.5 text-sm font-medium ${semanal === t.k ? "bg-tinta text-white" : "text-gris hover:text-grafito"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Encabezado href="/caja" bajada="Cuadratura diaria de caja y saldos de cartera al cierre de cada semana." pasos={PASOS} />
      {semanal ? <CierreSemanal pestanas={pestanas} /> : <CierreCaja pestanas={pestanas} />}
    </>
  );
}
