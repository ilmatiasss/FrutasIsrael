"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CierreCaja } from "./CierreCaja";
import { CierreSemanal } from "./CierreSemanal";
import { Encabezado } from "../Encabezado";

const PASOS = [
  { titulo: "Día o semana", texto: "«Diario» muestra toda la plata del día. «Semanal» (lunes a domingo) muestra solo con cuánta deuda quedó cada cliente." },
  { titulo: "Cuenta la plata", texto: "Compara el efectivo del cajón con «Debe haber en caja». Las transferencias se revisan en el banco." },
  { titulo: "Gastos e ingresos", texto: "Si salió plata del cajón (flete, colación, sueldo) anótala como Egreso." },
  { titulo: "Imprime y cierra", texto: "Cada parte tiene su botón Imprimir, o imprime todo en una hoja. Al final, «Cerrar la caja»." },
];

/** Cierre de caja con dos vistas: el día (detalle) y la semana (solo deuda). */
export function Caja() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const semanal = params.get("vista") === "semanal";

  const pestanas = (
    <div className="no-print inline-flex rounded-full border-[1.5px] border-kraft bg-hoja p-1" role="tablist" aria-label="Tipo de cierre">
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
          className={`rounded-full px-5 py-1.5 text-sm font-bold ${semanal === t.k ? "bg-tinta text-white" : "text-gris hover:text-grafito"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Encabezado href="/caja" bajada="Cuadra la plata del día o revisa con cuánta deuda cerró la semana." pasos={PASOS} />
      {semanal ? <CierreSemanal pestanas={pestanas} /> : <CierreCaja pestanas={pestanas} />}
    </>
  );
}
