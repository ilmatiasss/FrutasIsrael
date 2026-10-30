"use client";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useData } from "@/lib/store";
import { antiguedad, porProducto, porSemana } from "@/lib/resumen";
import { cant, clp, diasEntre, fechaCorta, hoy, sumarDias } from "@/lib/format";
import { useEstados } from "../clientes";
import { BarraFila, ColumnasApiladas, Leyenda, Linea, SERIE } from "./Graficos";

// antigüedad: un solo tono, más oscuro = más viejo
const TRAMO = ["#e3ad9f", "#d1806c", "#b9533e", "#86301f"];

function Bloque({ titulo, nota, children, className = "" }: { titulo: string; nota?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`hoja min-w-0 rounded-lg px-4 py-4 sm:px-5 ${className}`}>
      <header className="mb-3">
        <h2 className="font-semibold">{titulo}</h2>
        {nota && <p className="text-sm text-gris">{nota}</p>}
      </header>
      {children}
    </section>
  );
}

function Tabla({ cols, filas }: { cols: string[]; filas: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-gris">Ver como tabla</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c} className={`rotulo py-1 font-medium ${i ? "text-right" : "text-left"}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-linea">
                {f.map((v, j) => (
                  <td key={j} className={`py-1 ${j ? "cifra text-right" : ""}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Cambio({ ahora, antes, invertir = false }: { ahora: number; antes: number; invertir?: boolean }) {
  const d = ahora - antes;
  if (!antes || d === 0) return null;
  const sube = d > 0;
  const bueno = invertir ? !sube : sube;
  return (
    <span className={bueno ? "text-pera" : "text-fuji"}>
      {sube ? "▲" : "▼"} {clp(Math.abs(d))}
    </span>
  );
}

export function Resumen() {
  const data = useData()!;
  const estados = useEstados(data);
  const h = hoy();

  const semanas = useMemo(() => porSemana(data.db, h, 13), [data, h]);
  const lista = useMemo(() => [...estados.values()], [estados]);
  const tramos = useMemo(() => antiguedad(lista, h), [lista, h]);
  const productos = useMemo(() => porProducto(data.db, data.idx, sumarDias(h, -27)), [data, h]);

  const actual = semanas[semanas.length - 1];
  const pasada = semanas[semanas.length - 2];
  const diasSemana = diasEntre(actual.lunes, h) + 1;
  const ventas = actual.contado + actual.credito;
  const ventasPasada = pasada.contado + pasada.credito;

  const deudores = lista.filter((e) => e.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const enLaCalle = deudores.reduce((a, e) => a + e.saldo, 0);
  const morosos = deudores.filter((e) => e.semaforo === "ROJO");
  const perdidos = deudores.filter((e) => !e.compra);
  const top = deudores.slice(0, 6);
  const maxTramo = Math.max(...tramos.map((t) => t.monto));
  const maxProd = Math.max(1, ...productos.map((p) => p.monto));
  const viejo = tramos[2].monto + tramos[3].monto;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="stencil text-[28px] sm:text-[32px]">Resumen</h1>
        <p className="text-sm text-gris">
          Semana N°{actual.semana} · {fechaCorta(actual.lunes)} a hoy ({diasSemana} {diasSemana === 1 ? "día" : "días"})
        </p>
      </header>

      {/* la semana contada en palabras: lo primero que se lee */}
      <section className="hoja rounded-lg px-5 py-5 sm:px-7 sm:py-6">
        <div className="max-w-3xl space-y-3 text-[17px] leading-relaxed sm:text-[19px]">
          <p>
            Esta semana van <b className="cifra">{clp(ventas)}</b> en ventas, en {actual.vales} vales: <b className="cifra">{clp(actual.contado)}</b> pagados al contado y{" "}
            <b className="cifra text-fuji">{clp(actual.credito)}</b> fiados. La semana pasada completa fue <span className="cifra">{clp(ventasPasada)}</span>.
          </p>
          <p>
            Se cobraron <b className="cifra">{clp(actual.abonos)}</b> de deudas. Lo fiado en la calle está en <b className="cifra text-fuji">{clp(enLaCalle)}</b>{" "}
            <span className="text-base whitespace-nowrap">
              (<Cambio ahora={actual.calle} antes={pasada.calle} invertir /> desde el domingo)
            </span>
            .
          </p>
          <p className="text-gris">
            {morosos.length > 0 ? (
              <>
                <Link href="/clientes" className="font-semibold text-grafito underline decoration-linea underline-offset-4">
                  {morosos.length} {morosos.length === 1 ? "cliente está moroso" : "clientes están morosos"}
                </Link>{" "}
                y {perdidos.length} {perdidos.length === 1 ? "dejó" : "dejaron"} de comprar debiendo {clp(perdidos.reduce((a, e) => a + e.saldo, 0))}.
              </>
            ) : (
              "Nadie está moroso."
            )}
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Bloque titulo="Ventas por semana" nota="Últimas 13 semanas. La semana actual va en curso (más clara).">
          <Leyenda
            items={[
              { color: SERIE.contado, label: "Contado" },
              { color: SERIE.credito, label: "Fiado" },
            ]}
          />
          <div className="mt-2">
            <ColumnasApiladas
              datos={semanas.map((s, i) => ({
                etiqueta: `N°${s.semana}`,
                detalle: `Semana N°${s.semana} · desde ${fechaCorta(s.lunes)}`,
                parcial: i === semanas.length - 1,
                partes: [
                  { valor: s.contado, color: SERIE.contado, label: "Contado" },
                  { valor: s.credito, color: SERIE.credito, label: "Fiado" },
                ],
              }))}
            />
          </div>
          <Tabla cols={["Semana", "Contado", "Fiado", "Total"]} filas={semanas.map((s) => [`N°${s.semana}`, clp(s.contado), clp(s.credito), clp(s.contado + s.credito)])} />
        </Bloque>

        <Bloque titulo="Fiado en la calle" nota="Total que deben los clientes al cierre de cada semana.">
          <Linea
            etiqueta="Fiado en la calle por semana"
            color={SERIE.credito}
            datos={semanas.map((s) => ({ etiqueta: `N°${s.semana}`, detalle: `Semana N°${s.semana}`, valor: s.calle }))}
          />
          <Tabla cols={["Semana", "Fiado nuevo", "Cobrado", "En la calle"]} filas={semanas.map((s) => [`N°${s.semana}`, clp(s.credito), clp(s.abonos), clp(s.calle)])} />
        </Bloque>

        <Bloque
          titulo="¿Desde cuándo se debe?"
          nota={viejo > 0 ? `${clp(viejo)} (${Math.round((viejo / Math.max(1, enLaCalle)) * 100)}%) tiene más de un mes.` : "Nada tiene más de un mes."}
        >
          <ul className="space-y-3">
            {tramos.map((t, i) => (
              <li key={t.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span>{t.label}</span>
                <span className="block h-3 w-full">
                  <span
                    className="block h-full rounded-r"
                    style={{ width: `${maxTramo ? Math.max(t.monto ? 2 : 0, (t.monto / maxTramo) * 100) : 0}%`, background: TRAMO[i] }}
                  />
                </span>
                <span className="text-right">
                  <span className="cifra font-semibold">{clp(t.monto)}</span>
                  <span className="block text-xs text-gris">{t.clientes} clientes</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gris">Según la fecha de cada vale que sigue impago.</p>
        </Bloque>

        <Bloque titulo="Los que más deben" nota={`Los 6 primeros suman ${clp(top.reduce((a, e) => a + e.saldo, 0))} de ${clp(enLaCalle)}.`}>
          <ul>
            {top.map((e) => (
              <li key={e.cliente.id}>
                <Link href={`/clientes/${e.cliente.id}`} className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-1 border-b border-linea py-2 last:border-0 hover:bg-carton/50 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_6.5rem]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.cliente.alias ?? e.cliente.nombre}</span>
                    <span className="block text-xs text-gris">{e.diasSinPagar} días sin pagar</span>
                  </span>
                  <span className="order-last col-span-2 sm:order-none sm:col-span-1">
                    <BarraFila valor={e.saldo} max={top[0]?.saldo ?? 1} color={SERIE.credito} />
                  </span>
                  <span className="cifra text-right text-fuji">{clp(e.saldo)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo="Productos" nota="Últimas 4 semanas, contado y fiado. Precio: primero y último cobrado en el período." className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="rotulo py-2 font-medium">Producto</th>
                  <th className="rotulo py-2 text-right font-medium">Vendido</th>
                  <th className="rotulo w-[34%] py-2 pl-4 font-medium">Monto</th>
                  <th className="rotulo py-2 text-right font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => {
                  const d = p.primero && p.ultimo ? p.ultimo - p.primero : 0;
                  return (
                    <tr key={p.producto.id} className="border-t border-linea">
                      <td className="py-2 font-medium">{p.producto.nombre}</td>
                      <td className="cifra py-2 text-right text-gris">
                        {p.cajas > 0 && `${cant(p.cajas)} cj`}
                        {p.cajas > 0 && p.kilos > 0 && " · "}
                        {p.kilos > 0 && `${cant(p.kilos)} kg`}
                      </td>
                      <td className="py-2 pl-4">
                        <span className="flex items-center gap-3">
                          <span className="flex-1">
                            <BarraFila valor={p.monto} max={maxProd} color={SERIE.contado} />
                          </span>
                          <span className="cifra w-24 text-right">{clp(p.monto)}</span>
                        </span>
                      </td>
                      <td className="cifra py-2 text-right whitespace-nowrap">
                        {p.ultimo ? clp(p.ultimo) : "—"}
                        {d !== 0 && <span className="ml-2 text-xs text-gris">{d > 0 ? "▲" : "▼"}</span>}
                        {p.primero && d !== 0 && <span className="block text-xs text-gris">antes {clp(p.primero)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Bloque>
      </div>
    </div>
  );
}
