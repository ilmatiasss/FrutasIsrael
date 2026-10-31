"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useData } from "@/lib/store";
import { resumenCaja } from "@/lib/calc";
import { clp, fechaLarga, hoy } from "@/lib/format";
import { useEstados } from "../clientes";
import { SECCIONES } from "../Iconos";
import { COLOR_SEMAFORO } from "../ui";

/** Portada: indicadores del día, accesos y cobranza pendiente. */
export function Inicio() {
  const data = useData()!;
  const estados = useEstados(data);
  const h = hoy();

  const r = useMemo(() => resumenCaja(data.idx.movsFecha.get(h) ?? []), [data, h]);
  const cartera = useMemo(() => [...estados.values()].filter((e) => e.saldo > 0), [estados]);
  const totalCartera = cartera.reduce((a, e) => a + e.saldo, 0);
  const porCobrar = useMemo(
    () => cartera.filter((e) => e.semaforo !== "VERDE").sort((a, b) => b.saldo - a.saldo).slice(0, 6),
    [cartera],
  );

  const kpis = [
    { t: "Ventas al contado", v: r.vale_venta, sub: "efectivo y transferencia", c: "" },
    { t: "Crédito otorgado", v: r.vale_credito, sub: "vales a crédito de hoy", c: "text-fuji" },
    { t: "Cobranza", v: r.abonos, sub: "abonos recibidos hoy", c: "" },
    { t: "Efectivo en caja", v: r.efectivo_esperado, sub: "según movimientos", c: "" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="stencil text-[26px]">Inicio</h1>
          <p className="text-sm text-gris first-letter:uppercase">
            {fechaLarga(h)} · {data.db.tenant.nombre}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/abono" className="btn btn-secundario">
            Registrar abono
          </Link>
          <Link href="/vale" className="btn btn-primario">
            Nuevo vale
          </Link>
        </div>
      </header>

      {/* indicadores del día */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores del día">
        {kpis.map((k) => (
          <div key={k.t} className="hoja px-4 py-4">
            <p className="text-[13px] font-medium text-gris">{k.t}</p>
            <p className={`cifra mt-1 text-[22px] font-semibold sm:text-[26px] ${k.c}`}>{clp(k.v)}</p>
            <p className="text-xs text-gris">{k.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* módulos */}
        <section className="hoja min-w-0" aria-label="Módulos">
          <h2 className="border-b border-linea px-5 py-3 text-[15px] font-semibold">Módulos</h2>
          <ul>
            {SECCIONES.map((s) => (
              <li key={s.href} className="border-b border-linea last:border-0">
                <Link href={s.href} className="flex items-center gap-3 px-5 py-3 hover:bg-carton">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-verde-suave text-tinta">
                    <s.Fruta size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.label}</span>
                    <span className="block truncate text-sm text-gris">{s.que}</span>
                  </span>
                  <span className="tecla hidden text-gris md:inline-flex">{s.tecla}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* cobranza */}
        <section className="hoja min-w-0 overflow-hidden" aria-label="Cobranza pendiente">
          <header className="flex items-baseline justify-between border-b border-linea px-5 py-3">
            <h2 className="text-[15px] font-semibold">Cobranza pendiente</h2>
            <span className="text-sm text-gris">
              Cartera total <b className="cifra font-semibold text-grafito">{clp(totalCartera)}</b>
            </span>
          </header>
          {porCobrar.length === 0 ? (
            <p className="px-5 py-8 text-center text-gris">No hay clientes atrasados ni morosos.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="rotulo px-5 py-2 font-semibold">Cliente</th>
                  <th className="rotulo px-2 py-2 font-semibold">Estado</th>
                  <th className="rotulo hidden px-2 py-2 text-right font-semibold sm:table-cell">Días sin pago</th>
                  <th className="rotulo px-5 py-2 text-right font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {porCobrar.map((e) => (
                  <tr key={e.cliente.id} className="border-t border-linea hover:bg-carton">
                    <td className="px-5 py-2.5">
                      <Link href={`/clientes/${e.cliente.id}`} className="font-medium hover:text-tinta">
                        {e.cliente.alias ?? e.cliente.nombre}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="sticker" style={{ background: COLOR_SEMAFORO[e.semaforo].suave, color: COLOR_SEMAFORO[e.semaforo].txt }}>
                        {COLOR_SEMAFORO[e.semaforo].label}
                      </span>
                    </td>
                    <td className="cifra hidden px-2 py-2.5 text-right sm:table-cell">{e.diasSinPagar}</td>
                    <td className="cifra px-5 py-2.5 text-right font-semibold text-fuji">{clp(e.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex justify-between border-t border-linea px-5 py-2.5 text-sm">
            <Link href="/imprimir/deudores" target="_blank" className="font-medium text-tinta hover:underline">
              Imprimir listado de deudores
            </Link>
            <Link href="/clientes" className="font-medium text-tinta hover:underline">
              Ver todos los clientes →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
