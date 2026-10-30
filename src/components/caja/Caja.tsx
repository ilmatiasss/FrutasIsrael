"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CierreCaja } from "./CierreCaja";
import { CierreSemanal } from "./CierreSemanal";

/** Cierre de caja con dos vistas: el día (detalle) y la semana (solo deuda). */
export function Caja() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const semanal = params.get("vista") === "semanal";

  const pestanas = (
    <div className="no-print mt-3 inline-flex rounded-md border border-kraft p-0.5" role="tablist" aria-label="Tipo de cierre">
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
          className={`rounded px-4 py-1.5 text-sm font-semibold ${semanal === t.k ? "bg-grafito text-hoja" : "text-gris hover:text-grafito"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return semanal ? <CierreSemanal pestanas={pestanas} /> : <CierreCaja pestanas={pestanas} />;
}
