"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cerrarSemana, useData } from "@/lib/store";
import { saldosAl } from "@/lib/calc";
import { clp, ddmmaa, fechaCorta, hora, hoy, lunesDe, semanaISO, sumarDias } from "@/lib/format";
import { useAviso } from "../Shell";
import { MontoGrande, Vacio } from "../ui";

/** Cierre semanal (lunes a domingo): solo con cuánta deuda quedó cada cliente. */
export function CierreSemanal({ pestanas }: { pestanas?: ReactNode }) {
  const data = useData()!;
  const avisar = useAviso();
  const lunesHoy = lunesDe(hoy());
  const [lunes, setLunes] = useState(lunesHoy);
  const domingo = sumarDias(lunes, 6);
  const enCurso = lunes === lunesHoy;
  const { semana } = semanaISO(lunes);

  const cierre = [...data.db.cierres_semana].reverse().find((c) => c.lunes === lunes);
  const actuales = useMemo(() => saldosAl(data.db.movimientos, domingo), [data, domingo]);
  // si la semana está cerrada se muestra lo que quedó registrado al cerrar
  const filas = cierre ? cierre.saldos : actuales;
  const total = filas.reduce((a, f) => a + f.saldo, 0);
  const totalActual = actuales.reduce((a, f) => a + f.saldo, 0);
  const anterior = useMemo(() => saldosAl(data.db.movimientos, sumarDias(lunes, -1)).reduce((a, f) => a + f.saldo, 0), [data, lunes]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === "ArrowLeft") setLunes((l) => sumarDias(l, -7));
      if (e.key === "ArrowRight") setLunes((l) => (l < lunesHoy ? sumarDias(l, 7) : l));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [lunesHoy]);

  const nombre = (id: string) => {
    const c = data.idx.cliente.get(id);
    return c ? (c.alias ?? c.nombre) : "—";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section>
        {pestanas}
        <div className="no-print mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setLunes(sumarDias(lunes, -7))} className="btn btn-secundario px-2.5 py-1" aria-label="Semana anterior">
            ←
          </button>
          <p className="min-w-0 px-1">
            <b>Semana N°{semana}</b>{" "}
            <span className="text-gris">
              · {fechaCorta(lunes)} a {fechaCorta(domingo)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => enCurso || setLunes(sumarDias(lunes, 7))}
            disabled={enCurso}
            className="btn btn-secundario px-2.5 py-1 disabled:opacity-30"
            aria-label="Semana siguiente"
          >
            →
          </button>
          {!enCurso && (
            <button type="button" onClick={() => setLunes(lunesHoy)} className="text-sm text-tinta underline underline-offset-4">
              esta semana
            </button>
          )}
        </div>
      </section>

      <section className="hoja rounded-lg">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linea px-5 py-5">
          <div>
            <span className="rotulo">{enCurso && !cierre ? "Deuda a hoy (semana en curso)" : "Quedaron debiendo"}</span>
            <p className="doble-raya mt-1 text-[40px] leading-none sm:text-[48px]">
              <MontoGrande valor={total} />
            </p>
            <p className="mt-2 text-sm text-gris">
              {filas.length} {filas.length === 1 ? "cliente" : "clientes"} con deuda · la semana anterior cerró en <span className="cifra">{clp(anterior)}</span>
            </p>
          </div>
          <div className="no-print text-sm">
            {cierre ? (
              <p className="text-right">
                <b className="text-pera">Semana cerrada</b>
                <span className="block text-gris">
                  por {cierre.cerrado_por} · {ddmmaa(cierre.cerrado_at.slice(0, 10))} {hora(cierre.cerrado_at)}
                </span>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  cerrarSemana(lunes, domingo, actuales);
                  avisar({ titulo: `Semana N°${semana} cerrada`, detalle: `Quedaron debiendo ${clp(totalActual)}` });
                }}
                disabled={!actuales.length}
                className="btn btn-primario disabled:opacity-30"
              >
                Cerrar semana
              </button>
            )}
          </div>
        </header>

        {cierre && totalActual !== cierre.total && (
          <p className="border-b border-linea bg-limon/10 px-5 py-2 text-sm">
            Después del cierre hubo cambios con fecha de esta semana (anulaciones o vales atrasados). Recalculado hoy daría{" "}
            <b className="cifra">{clp(totalActual)}</b>.
          </p>
        )}

        {filas.length === 0 ? (
          <Vacio>Nadie quedó debiendo esta semana.</Vacio>
        ) : (
          <ol>
            {filas.map((f, i) => (
              <li key={f.cliente_id} className="border-b border-linea last:border-0">
                <Link href={`/clientes/${f.cliente_id}`} className="flex items-baseline gap-3 px-5 py-2.5 hover:bg-carton/50">
                  <span className="cifra w-6 text-right text-xs text-gris">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{nombre(f.cliente_id)}</span>
                  <span className="cifra text-fuji">{clp(f.saldo)}</span>
                </Link>
              </li>
            ))}
            <li className="flex items-baseline justify-between border-t border-grafito/70 px-5 py-3 font-semibold">
              <span>Total</span>
              <span className="cifra doble-raya text-fuji">{clp(total)}</span>
            </li>
          </ol>
        )}
      </section>

      <p className="no-print flex flex-wrap justify-between gap-2 text-sm text-gris">
        <span>La semana va de lunes a domingo. ← → cambia de semana.</span>
        <Link href={`/imprimir/caja?vista=semana&lunes=${lunes}`} target="_blank" className="btn btn-primario py-1.5 text-sm">
          Imprimir o guardar PDF
        </Link>
      </p>
    </div>
  );
}
