"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { resumenCaja } from "@/lib/calc";
import { clp, fechaLarga, hoy } from "@/lib/format";
import { useEstados } from "../clientes";
import { Hoja, SECCIONES } from "../Iconos";
import { Punto } from "../ui";

function saludo(h: number) {
  if (h < 12) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** Portada: qué se puede hacer, en grande, y cómo va el día. */
export function Inicio() {
  const data = useData()!;
  const estados = useEstados(data);
  const [hora, setHora] = useState<number | null>(null);
  useEffect(() => setHora(new Date().getHours()), []);
  const h = hoy();

  const r = useMemo(() => resumenCaja(data.idx.movsFecha.get(h) ?? []), [data, h]);
  const porCobrar = useMemo(
    () =>
      [...estados.values()]
        .filter((e) => e.saldo > 0 && e.semaforo !== "VERDE")
        .sort((a, b) => b.saldo - a.saldo)
        .slice(0, 4),
    [estados],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-bold text-tinta">
            <Hoja size={18} /> {hora !== null ? saludo(hora) : "Hola"}, {data.db.config.usuario_actual}
          </p>
          <h1 className="stencil text-[32px] first-letter:uppercase sm:text-[40px]">{fechaLarga(h)}</h1>
        </div>
        <p className="text-sm text-gris">¿Qué necesitas hacer? Toca una opción.</p>
      </header>

      {/* lo que se puede hacer, en grande */}
      <nav className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" aria-label="Qué hacer">
        {SECCIONES.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border-[1.5px] p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:flex-row sm:items-center sm:p-5 ${i < 2 ? "sm:py-7" : ""}`}
            style={{ background: s.suave, borderColor: s.color + "33" }}
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-hoja shadow-sm transition group-hover:scale-105 sm:size-16">
              <s.Fruta size={40} />
            </span>
            <span className="min-w-0">
              <span className="stencil block text-[22px] sm:text-[26px]">{s.label}</span>
              <span className="block text-sm leading-snug text-gris">{s.que}</span>
            </span>
            <span className="tecla absolute right-3 top-3 hidden text-gris md:inline-flex">{s.tecla}</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* el día en números simples */}
        <section className="hoja p-5">
          <h2 className="stencil text-xl">Hoy en la bodega</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {[
              { t: "Vendido al contado", v: r.vale_venta, c: "" },
              { t: "Fiado hoy", v: r.vale_credito, c: "text-fuji" },
              { t: "Cobrado de deudas", v: r.abonos, c: "text-tinta" },
              { t: "Efectivo en caja", v: r.efectivo_esperado, c: "" },
            ].map((x) => (
              <div key={x.t}>
                <dt className="text-sm font-semibold text-gris">{x.t}</dt>
                <dd className={`cifra text-2xl font-extrabold ${x.c}`}>{clp(x.v)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-gris">
            {r.cantidad} movimientos hoy.{" "}
            <Link href="/caja" className="font-bold text-tinta underline underline-offset-4">
              Ver cierre de caja
            </Link>
          </p>
        </section>

        <section className="hoja p-5">
          <h2 className="stencil text-xl">Para cobrar</h2>
          <p className="text-sm text-gris">Clientes atrasados o morosos que más deben.</p>
          <ul className="mt-3">
            {porCobrar.length === 0 && <li className="py-4 text-gris">Nadie atrasado. ¡Bien!</li>}
            {porCobrar.map((e) => (
              <li key={e.cliente.id} className="border-b border-linea last:border-0">
                <Link href={`/abono?cliente=${e.cliente.id}`} className="flex items-center gap-3 py-2.5 hover:text-tinta">
                  <Punto s={e.semaforo} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{e.cliente.alias ?? e.cliente.nombre}</span>
                    <span className="block text-xs text-gris">{e.diasSinPagar} días sin pagar</span>
                  </span>
                  <span className="cifra font-extrabold text-fuji">{clp(e.saldo)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
