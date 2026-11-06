"use client";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { FormaPago, Movimiento } from "@/lib/types";
import { registrarCaja, useData } from "@/lib/store";
import { vivo } from "@/lib/calc";
import { clp, ddmm, hoy, hora, miles, normalizar, parseMonto } from "@/lib/format";
import { DetalleMovimiento } from "../DetalleMovimiento";
import { Encabezado } from "../Encabezado";
import { useAviso } from "../Shell";
import { CampoNumero, leerNumero } from "../CampoNumero";
import { FORMA } from "../ui";

const PASOS = [
  { titulo: "Categoría", texto: "Toque una categoría (compra de envases, gas de la grúa…) o escriba una nueva. Queda guardada para la próxima vez." },
  { titulo: "Detalle y monto", texto: "Escriba libremente el detalle (a quién, qué, factura) y el monto." },
  { titulo: "Cómo se pagó", texto: "Efectivo sale del cajón y aparece en el cierre de caja. Transferencia o tarjeta no tocan el cajón." },
  { titulo: "Resumen", texto: "A la derecha: cuánto se gastó en el mes por categoría. Para anular un gasto, tóquelo en la lista." },
];

/** Categorías que vienen de fábrica; las que se escriban se suman solas. */
const BASE = ["Compra de envases", "Gas grúa horquilla", "Flete", "Mantención grúa", "Carretillero", "Colación", "Luz, agua e internet", "Arriendo", "Bolsas y cinta", "Aseo"];
const FORMAS: Exclude<FormaPago, "CREDITO">[] = ["EFECTIVO", "TRANSFERENCIA", "TARJETA"];
const SIN = "Sin categoría";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function Gastos() {
  const data = useData()!;
  const avisar = useAviso();
  const [categoria, setCategoria] = useState("");
  const [detalle, setDetalle] = useState("");
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState<Exclude<FormaPago, "CREDITO">>("EFECTIVO");
  const [fecha, setFecha] = useState(hoy());
  const [numero, setNumero] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [filtro, setFiltro] = useState<string | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const detalleRef = useRef<HTMLInputElement>(null);
  const montoRef = useRef<HTMLInputElement>(null);

  const egresos = useMemo(() => data.db.movimientos.filter((m) => m.tipo === "EGRESO"), [data]);
  const categorias = useMemo(() => {
    const usadas = new Map<string, number>();
    for (const m of egresos) if (m.categoria) usadas.set(m.categoria, (usadas.get(m.categoria) ?? 0) + 1);
    const extra = [...usadas.keys()].filter((c) => !BASE.some((b) => normalizar(b) === normalizar(c))).sort((a, b) => (usadas.get(b) ?? 0) - (usadas.get(a) ?? 0));
    return [...BASE, ...extra];
  }, [egresos]);

  const delMes = useMemo(
    () => egresos.filter((m) => m.fecha.startsWith(mes)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [egresos, mes],
  );
  const porCategoria = useMemo(() => {
    const m = new Map<string, { total: number; n: number; efectivo: number }>();
    for (const x of delMes) {
      if (!vivo(x)) continue;
      const k = x.categoria ?? SIN;
      const t = m.get(k) ?? { total: 0, n: 0, efectivo: 0 };
      t.total += x.total;
      t.n++;
      if (x.forma_pago === "EFECTIVO") t.efectivo += x.total;
      m.set(k, t);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [delMes]);
  const totalMes = porCategoria.reduce((a, [, t]) => a + t.total, 0);
  const lista = filtro ? delMes.filter((m) => (m.categoria ?? SIN) === filtro) : delMes;

  const meses = useMemo(() => {
    const s = new Set(egresos.map((m) => m.fecha.slice(0, 7)));
    s.add(hoy().slice(0, 7));
    return [...s].sort().reverse();
  }, [egresos]);

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cat = categoria.trim();
    const m = parseMonto(monto);
    if (!cat) return setError("Elija o escriba la categoría del gasto.");
    if (!m || m <= 0) {
      montoRef.current?.focus();
      return setError("Escriba el monto.");
    }
    const existente = categorias.find((c) => normalizar(c) === normalizar(cat)) ?? cat;
    const mov = registrarCaja({ tipo: "EGRESO", monto: m, forma, glosa: detalle.trim() ? `${existente} · ${detalle.trim()}` : existente, fecha, categoria: existente, numero: leerNumero(numero) });
    avisar({
      titulo: `Gasto N°${mov.numero} registrado`,
      detalle: `${existente} · ${clp(m)} · ${forma === "EFECTIVO" ? "salió del cajón" : FORMA[forma].label.toLowerCase()}`,
      tono: "rojo",
    });
    setDetalle("");
    setMonto("");
    setNumero(null);
    setMes(fecha.slice(0, 7));
  };

  const [anio, mm] = mes.split("-").map(Number);

  return (
    <>
      <Encabezado href="/gastos" bajada="Gastos de la bodega: compra de envases, gas de la grúa, fletes… con categoría y detalle libre." pasos={PASOS} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={guardar} className="hoja w-full space-y-5 px-4 py-5 sm:px-7 sm:py-6">
          <div>
            <span className="rotulo">Categoría</span>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Categoría">
              {categorias.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={normalizar(categoria) === normalizar(c)}
                  onClick={() => {
                    setCategoria(c);
                    setTimeout(() => detalleRef.current?.focus(), 0);
                  }}
                  className="opcion py-1.5 text-sm"
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="…o escriba otra categoría"
              aria-label="Categoría del gasto"
              className="campo mt-2 w-full sm:w-80"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="block">
              <span className="rotulo">Detalle (libre)</span>
              <input
                ref={detalleRef}
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    montoRef.current?.focus();
                  }
                }}
                placeholder="ej: 2 balones de gas, Abastible, boleta 4512"
                className="campo mt-1 w-full"
                aria-label="Detalle del gasto"
              />
            </label>
            <label className="block">
              <span className="rotulo">Monto</span>
              <input
                ref={montoRef}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onBlur={() => {
                  const m = parseMonto(monto);
                  if (m) setMonto(miles(m));
                }}
                inputMode="numeric"
                placeholder="$"
                className="campo mt-1 w-full text-right text-xl font-semibold"
                aria-label="Monto del gasto"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="rotulo">¿Cómo se pagó?</span>
              <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Cómo se pagó">
                {FORMAS.map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={forma === f} onClick={() => setForma(f)} className="opcion flex-col items-start py-1.5 text-left">
                    <span>{FORMA[f].label}</span>
                    <span className={`text-[11px] font-normal ${forma === f ? "text-white/80" : "text-gris"}`}>{f === "EFECTIVO" ? "Sale del cajón" : "No toca el cajón"}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="rotulo">Fecha</span>
              <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="campo mt-1" />
            </label>
            <CampoNumero serie="CAJA" valor={numero} setValor={setNumero} etiqueta="N° del gasto" />
          </div>
          {error && <p className="text-sm font-medium text-fuji">{error}</p>}
          <div className="flex justify-end border-t border-linea pt-4">
            <button type="submit" className="btn btn-primario px-6 py-2.5">
              Registrar gasto
            </button>
          </div>
        </form>

        <aside className="min-w-0 space-y-6">
          <section className="hoja" aria-label="Gastos del mes">
            <header className="flex items-center justify-between gap-2 border-b border-linea px-4 py-3">
              <h2 className="font-semibold">Gastos del mes</h2>
              <select value={mes} onChange={(e) => { setMes(e.target.value); setFiltro(null); }} className="campo w-auto py-1 text-sm" aria-label="Mes">
                {meses.map((m) => {
                  const [a, n] = m.split("-").map(Number);
                  return (
                    <option key={m} value={m}>
                      {MESES[n - 1]} {a}
                    </option>
                  );
                })}
              </select>
            </header>
            <ul className="divide-y divide-linea px-4 text-sm">
              {porCategoria.map(([c, t]) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setFiltro(filtro === c ? null : c)}
                    aria-pressed={filtro === c}
                    className={`flex w-full items-baseline justify-between gap-2 py-2 text-left hover:text-tinta ${filtro === c ? "font-semibold text-tinta" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{c}</span>
                      <span className="text-xs text-gris">
                        {t.n} {t.n === 1 ? "gasto" : "gastos"}
                        {t.efectivo > 0 && t.efectivo < t.total ? ` · ${clp(t.efectivo)} en efectivo` : t.efectivo === t.total ? " · efectivo" : ""}
                      </span>
                    </span>
                    <span className="cifra shrink-0">{clp(t.total)}</span>
                  </button>
                </li>
              ))}
              {!porCategoria.length && <li className="py-6 text-center text-gris">Sin gastos en {MESES[mm - 1]} {anio}.</li>}
              {porCategoria.length > 0 && (
                <li className="flex justify-between py-2 font-semibold">
                  <span>Total del mes</span>
                  <span className="cifra">{clp(totalMes)}</span>
                </li>
              )}
            </ul>
          </section>

          <section className="hoja" aria-label="Lista de gastos">
            <header className="flex items-baseline justify-between border-b border-linea px-4 py-3">
              <h2 className="font-semibold">{filtro ?? "Todos los gastos"}</h2>
              {filtro && (
                <button type="button" onClick={() => setFiltro(null)} className="text-sm text-tinta hover:underline">
                  ver todos
                </button>
              )}
            </header>
            <ul className="max-h-[28rem] divide-y divide-linea overflow-auto px-4 text-sm">
              {lista.map((m) => (
                <FilaGasto key={m.id} m={m} onVer={() => setVer(m.id)} />
              ))}
              {!lista.length && <li className="py-6 text-center text-gris">No hay gastos.</li>}
            </ul>
          </section>
        </aside>
      </div>
      <DetalleMovimiento movId={ver} onCerrar={() => setVer(null)} />
    </>
  );
}

function FilaGasto({ m, onVer }: { m: Movimiento; onVer: () => void }) {
  const anulado = !vivo(m);
  const detalle = m.categoria && m.glosa?.startsWith(m.categoria) ? m.glosa.slice(m.categoria.length).replace(/^ · /, "") : m.glosa;
  return (
    <li>
      <button type="button" onClick={onVer} className={`flex w-full items-baseline justify-between gap-3 py-2 text-left hover:text-tinta ${anulado ? "text-gris line-through" : ""}`}>
        <span className="min-w-0">
          <b className="block truncate font-medium">{m.categoria ?? SIN}</b>
          <span className="block truncate text-xs text-gris">
            N°{m.numero} · {ddmm(m.fecha)} {hora(m.created_at)} · {FORMA[m.forma_pago]?.label ?? m.forma_pago}
            {detalle ? ` · ${detalle}` : ""}
          </span>
        </span>
        <span className="cifra shrink-0">{clp(m.total)}</span>
      </button>
    </li>
  );
}
