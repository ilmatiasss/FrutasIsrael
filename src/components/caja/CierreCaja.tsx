"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Movimiento, TipoMovimiento } from "@/lib/types";
import { cerrarCaja, registrarCaja, useData } from "@/lib/store";
import { resumenCaja, vivo } from "@/lib/calc";
import { clp, fechaLarga, hora, hoy, miles, parseMonto, sumarDias } from "@/lib/format";
import { COLOR_TIPO, DetalleMovimiento } from "../DetalleMovimiento";
import { useAviso } from "../Shell";
import { FormaChip, MontoGrande, Tecla, Vacio } from "../ui";

const SECCIONES: { tipo: TipoMovimiento; titulo: string; nota: string }[] = [
  { tipo: "VALE_VENTA", titulo: "Vales venta", nota: "pagados al contado" },
  { tipo: "VALE_CREDITO", titulo: "Vales crédito", nota: "fiado, suma deuda" },
  { tipo: "ABONO", titulo: "Abonos a crédito", nota: "pagos de deuda" },
  { tipo: "INGRESO", titulo: "Ingresos de caja", nota: "fondo, otros" },
  { tipo: "EGRESO", titulo: "Egresos de caja", nota: "gastos pagados del cajón" },
];

const CORTO: Record<TipoMovimiento, string> = {
  VALE_VENTA: "Venta", VALE_CREDITO: "Crédito", ABONO: "Abonos", INGRESO: "Ingresos", EGRESO: "Egresos",
};

/** Línea de boleta térmica con puntos guía */
function Renglon({ label, valor, signo, fuerte = false, color }: { label: string; valor: number; signo?: string; fuerte?: boolean; color?: string }) {
  return (
    <p className={`flex items-baseline gap-1 ${fuerte ? "text-[17px] font-bold" : "text-[14px]"}`}>
      <span className="w-3 shrink-0 text-gris">{signo}</span>
      <span className="shrink-0">{label}</span>
      <span className="mx-1 flex-1 translate-y-[-3px] border-b-2 border-dotted border-grafito/25" />
      <span className="cifra shrink-0" style={{ color }}>{clp(valor)}</span>
    </p>
  );
}

export function CierreCaja() {
  const data = useData()!;
  const avisar = useAviso();
  const [fecha, setFecha] = useState(hoy());
  const [ver, setVer] = useState<string | null>(null);
  const [form, setForm] = useState<null | "EGRESO" | "INGRESO">(null);
  const [cerrando, setCerrando] = useState(false);
  const [nota, setNota] = useState("");

  const movs = useMemo(() => data.idx.movsFecha.get(fecha) ?? [], [data, fecha]);
  const r = useMemo(() => resumenCaja(movs), [movs]);
  const cierre = [...data.db.cierres].reverse().find((c) => c.fecha === fecha);
  const posteriores = cierre ? movs.filter((m) => m.created_at > cierre.cerrado_at && vivo(m)) : [];
  const anulados = movs.filter((m) => !vivo(m)).length;
  const esHoy = fecha === hoy();

  // ← → cambian de día
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === "ArrowLeft") setFecha((f) => sumarDias(f, -1));
      if (e.key === "ArrowRight") setFecha((f) => (f < hoy() ? sumarDias(f, 1) : f));
      if (e.key.toLowerCase() === "g") setForm("EGRESO");
      if (e.key.toLowerCase() === "i") setForm("INGRESO");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // matriz tipo × forma de pago
  const matriz = SECCIONES.map(({ tipo, titulo }) => {
    const xs = movs.filter((m) => m.tipo === tipo && vivo(m));
    const s = (f: string) => xs.filter((m) => m.forma_pago === f).reduce((a, m) => a + m.total, 0);
    return { tipo, titulo, ef: s("EFECTIVO"), tr: s("TRANSFERENCIA"), cr: s("CREDITO") };
  });

  const ventasEf = matriz[0].ef, abonosEf = matriz[2].ef, ingresosEf = matriz[3].ef;

  return (
    <div className="space-y-6">
      {/* ------------------------------ cabecera ------------------------------ */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="stencil text-[28px] sm:text-[32px]">Cierre de caja</h1>
          <div className="no-print mt-3 flex items-center gap-2">
            <button type="button" onClick={() => setFecha(sumarDias(fecha, -1))} className="btn btn-secundario px-2.5 py-1" aria-label="Día anterior">
              ←
            </button>
            <input
              type="date"
              value={fecha}
              max={hoy()}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
              className="campo w-auto font-sans text-lg"
              aria-label="Fecha del cierre"
            />
            <button
              type="button"
              onClick={() => esHoy || setFecha(sumarDias(fecha, 1))}
              disabled={esHoy}
              className="btn btn-secundario px-2.5 py-1 disabled:opacity-30"
              aria-label="Día siguiente"
            >
              →
            </button>
            {!esHoy && (
              <button type="button" onClick={() => setFecha(hoy())} className="text-sm text-tinta underline decoration-dotted underline-offset-4">
                volver a hoy
              </button>
            )}
          </div>
          <p className="mt-1 text-lg text-gris first-letter:uppercase">{fechaLarga(fecha)}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" onClick={() => setForm("EGRESO")} className="btn btn-secundario">
            − Egreso <span className="tecla">G</span>
          </button>
          <button type="button" onClick={() => setForm("INGRESO")} className="btn btn-secundario">
            + Ingreso <span className="tecla">I</span>
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn-secundario hidden sm:inline-flex">
            Imprimir
          </button>
        </div>
      </section>

      {form && <FormCaja tipo={form} fecha={fecha} onCerrar={() => setForm(null)} />}

      {/* ------------------------- totales por tipo (franja) ------------------------- */}
      <section className="grid grid-cols-2 border-y-2 border-grafito sm:grid-cols-3 lg:grid-cols-5" aria-label="Totales por tipo">
        {SECCIONES.map(({ tipo, titulo }) => {
          const xs = movs.filter((m) => m.tipo === tipo && vivo(m));
          const total = xs.reduce((a, m) => a + m.total, 0);
          return (
            <a
              key={tipo}
              href={`#${tipo}`}
              className="group border-b border-r border-linea px-4 py-3 last:border-r-0 hover:bg-resaltador/30 lg:border-b-0"
            >
              <span className="rotulo">{titulo}</span>
              <p className="mt-1.5 text-[24px] leading-none" style={{ color: tipo === "VALE_CREDITO" ? COLOR_TIPO[tipo] : undefined }}>
                <MontoGrande valor={total} deuda={false} />
              </p>
              <p className="mt-1 text-xs text-gris">{xs.length} {xs.length === 1 ? "movimiento" : "movimientos"}</p>
            </a>
          );
        })}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ------------------------------ detalle ------------------------------ */}
        <div className="space-y-6">
          {movs.length === 0 && (
            <div className="hoja rounded-sm">
              <Vacio>No hay movimientos este día.</Vacio>
            </div>
          )}
          {SECCIONES.map(({ tipo, titulo, nota }) => {
            const xs = movs.filter((m) => m.tipo === tipo);
            if (!xs.length) return null;
            const total = xs.filter(vivo).reduce((a, m) => a + m.total, 0);
            return (
              <section key={tipo} id={tipo} className="hoja scroll-mt-20 overflow-hidden rounded-lg">
                <header className="flex items-baseline justify-between border-b-2 border-grafito/80 px-4 pb-2 pt-4">
                  <h2 className="font-semibold">
                    {titulo} <span className="ml-1 font-sans text-sm font-normal normal-case tracking-normal text-gris">{nota}</span>
                  </h2>
                  <span className="cifra doble-raya text-xl font-bold" style={{ color: COLOR_TIPO[tipo] }}>{clp(total)}</span>
                </header>
                <table className="w-full text-[15px]">
                  <tbody>
                    {xs.map((m) => (
                      <FilaMov key={m.id} m={m} onVer={() => setVer(m.id)} nombre={nombre(m)} />
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>

        {/* ------------------------------ la boleta ------------------------------ */}
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="relative bg-[#fffdf7] px-6 pb-10 pt-6 font-mono text-grafito shadow-[0_18px_30px_-18px_rgba(60,40,10,.45)]" >
            {/* borde dentado de boleta */}
            <div
              aria-hidden
              className="absolute inset-x-0 -bottom-[9px] h-[10px]"
              style={{ background: "linear-gradient(-45deg, transparent 6px, #fffdf7 6px) 0 0/12px 10px repeat-x, linear-gradient(45deg, transparent 6px, #fffdf7 6px) 0 0/12px 10px repeat-x" }}
            />
            <p className="text-center text-[13px] uppercase tracking-[0.3em]">Frutas Israel</p>
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-gris">Cierre de caja · {fecha.split("-").reverse().join("/")}</p>
            <p className="my-3 border-t-2 border-dashed border-grafito/40" />

            <p className="mb-1 text-[11px] uppercase tracking-[0.25em] text-gris">Efectivo en el cajón</p>
            <Renglon signo="+" label="Ventas" valor={ventasEf} />
            <Renglon signo="+" label="Abonos" valor={abonosEf} />
            <Renglon signo="+" label="Ingresos" valor={ingresosEf} />
            <Renglon signo="−" label="Egresos" valor={r.egresos_efectivo} />
            <p className="my-2 border-t border-grafito/50" />
            <p className="flex items-baseline justify-between">
              <span className="text-[12px] font-bold uppercase leading-tight tracking-wider">
                Debe haber
                <br />
                en caja
              </span>
              <span className="cifra doble-raya text-[28px] font-bold">{clp(r.efectivo_esperado)}</span>
            </p>

            <p className="my-3 border-t-2 border-dashed border-grafito/40" />
            <p className="mb-1 text-[11px] uppercase tracking-[0.25em] text-gris">Por forma de pago</p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gris">
                  <th className="py-1 text-left font-medium" />
                  <th className="text-right font-medium">Efect.</th>
                  <th className="text-right font-medium">Transf.</th>
                  <th className="text-right font-medium">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {matriz.map((x) => (
                  <tr key={x.tipo} className="border-t border-dotted border-grafito/20">
                    <td className="py-1 font-sans text-[13px]" style={{ color: COLOR_TIPO[x.tipo] }}>{CORTO[x.tipo]}</td>
                    <td className="cifra text-right">{x.ef ? (x.tipo === "EGRESO" ? "−" : "") + miles(x.ef) : "·"}</td>
                    <td className="cifra text-right">{x.tr ? miles(x.tr) : "·"}</td>
                    <td className="cifra text-right">{x.cr ? miles(x.cr) : "·"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-grafito/60 font-bold">
                  <td className="py-1 font-sans">Total</td>
                  <td className="cifra text-right">{miles(r.efectivo - r.egresos_efectivo)}</td>
                  <td className="cifra text-right">{miles(r.transferencia)}</td>
                  <td className="cifra text-right text-fuji">{miles(r.credito)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 font-sans text-[11px] leading-snug text-gris">Efectivo neto de egresos. Transferencias: revisar en la cartola del banco.</p>

            <p className="my-3 border-t-2 border-dashed border-grafito/40" />
            <Renglon label="Vendido en el día" valor={r.vale_venta + r.vale_credito} fuerte />
            <Renglon label="Fiado nuevo" valor={r.vale_credito} color="#c4262e" />
            <Renglon label="Cobrado de deudas" valor={r.abonos} color="#1f3c8f" />
            <Renglon label="Variación de la calle" valor={r.vale_credito - r.abonos} color={r.vale_credito - r.abonos > 0 ? "#c4262e" : "#4f7f2a"} />
            <p className="mt-2 font-sans text-[12px] text-gris">
              {r.cantidad} movimientos válidos{anulados ? ` · ${anulados} anulados (no suman)` : ""}
            </p>

            {/* estado del cierre */}
            <div className="no-print mt-5 border-t-2 border-dashed border-grafito/40 pt-4 font-sans">
              {cierre ? (
                <div className="relative">
                  <p className="text-sm">
                    <b className="text-pera">Caja cerrada</b> por {cierre.cerrado_por} a las {hora(cierre.cerrado_at)}
                    {cierre.nota && <span className="block text-gris">Nota: {cierre.nota}</span>}
                  </p>
                  {cierre.snapshot.efectivo_esperado !== r.efectivo_esperado && (
                    <p className="mt-2 border-l-4 border-naranjo bg-naranjo/10 px-2 py-1 text-sm">
                      Al cerrar había {clp(cierre.snapshot.efectivo_esperado)} en efectivo; ahora {clp(r.efectivo_esperado)}.
                      {posteriores.length > 0 && ` ${posteriores.length} movimientos después del cierre.`}
                    </p>
                  )}
                  <button type="button" onClick={() => setCerrando(true)} className="mt-2 text-sm text-gris underline decoration-dotted">
                    volver a cerrar
                  </button>
                </div>
              ) : !cerrando ? (
                <button
                  type="button"
                  onClick={() => setCerrando(true)}
                  disabled={!movs.length}
                  className="btn btn-primario w-full py-3 text-lg disabled:opacity-30"
                >
                  Cerrar la caja
                </button>
              ) : null}
              {cerrando && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    cerrarCaja(fecha, nota.trim() || null);
                    setCerrando(false);
                    setNota("");
                    avisar({ titulo: "Caja cerrada", detalle: `Efectivo esperado ${clp(r.efectivo_esperado)}` });
                  }}
                  className="mt-3"
                >
                  <input autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota del cierre (opcional)" className="campo font-sans" />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setCerrando(false)} className="px-2 text-gris">Cancelar</button>
                    <button type="submit" className="btn btn-primario">
                      Confirmar <Tecla>↵</Tecla>
                    </button>
                  </div>
                </form>
              )}
            </div>

          </div>
        </aside>
      </div>

      <DetalleMovimiento movId={ver} onCerrar={() => setVer(null)} />
    </div>
  );

  function nombre(m: Movimiento) {
    const c = m.cliente_id ? data.idx.cliente.get(m.cliente_id) : null;
    return c ? (c.alias ?? c.nombre) : (m.glosa ?? "—");
  }
}

function FilaMov({ m, onVer, nombre }: { m: Movimiento; onVer: () => void; nombre: string }) {
  const anulado = !vivo(m);
  return (
    <tr onClick={onVer} className={`cursor-pointer border-b border-linea hover:bg-resaltador/40 ${anulado ? "text-gris" : ""}`}>
      <td className="cifra w-[76px] py-1.5 pl-4 text-sm font-semibold text-fuji/90">{m.numero}</td>
      <td className="cifra w-[56px] text-sm text-gris">{hora(m.created_at)}</td>
      <td className="max-w-0 truncate pr-2">
        {anulado && <span className="timbre mr-2 !rotate-[-3deg] text-[10px] text-fuji">Anulado</span>}
        {m.cliente_id ? (
          <Link href={`/clientes/${m.cliente_id}`} onClick={(e) => e.stopPropagation()} className={`font-semibold hover:text-tinta ${anulado ? "line-through" : ""}`}>
            {nombre}
          </Link>
        ) : (
          <span className={anulado ? "line-through" : ""}>{nombre}</span>
        )}
        {m.cliente_id && m.glosa && <span className="ml-2 text-xs text-gris">{m.glosa}</span>}
      </td>
      <td className="hidden w-[110px] sm:table-cell">
        <FormaChip forma={m.forma_pago} />
      </td>
      <td className={`cifra w-[120px] pr-4 text-right ${anulado ? "line-through" : ""}`}>{clp(m.total)}</td>
    </tr>
  );
}

function FormCaja({ tipo, fecha, onCerrar }: { tipo: "EGRESO" | "INGRESO"; fecha: string; onCerrar: () => void }) {
  const avisar = useAviso();
  const [glosa, setGlosa] = useState("");
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), [tipo]);
  const sugerencias = tipo === "EGRESO" ? ["Pago carretillero", "Colación equipo", "Flete", "Bolsas y cinta", "Cuidador estacionamiento"] : ["Fondo de caja", "Préstamo", "Devolución"];
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const m = parseMonto(monto);
    if (!glosa.trim() || !m) return;
    const mov = registrarCaja({ tipo, monto: m, forma, glosa: glosa.trim(), fecha });
    avisar({ titulo: `${tipo === "EGRESO" ? "Egreso" : "Ingreso"} N°${mov.numero}`, detalle: `${glosa} · ${clp(m)}`, tono: tipo === "EGRESO" ? "rojo" : "ok" });
    onCerrar();
  };
  return (
    <form
      onSubmit={enviar}
      onKeyDown={(e) => e.key === "Escape" && onCerrar()}
      className="hoja animate-entra flex flex-wrap items-end gap-4 rounded-lg px-5 py-4"
      
    >
      <p className="w-full font-semibold sm:w-auto">{tipo === "EGRESO" ? "Egreso de caja" : "Ingreso de caja"}</p>
      <label className="min-w-[220px] flex-1">
        <span className="text-[11px] uppercase tracking-widest text-gris">Detalle</span>
        <input ref={ref} value={glosa} onChange={(e) => setGlosa(e.target.value)} list="glosas" className="campo font-sans text-lg" placeholder={sugerencias[0]} />
        <datalist id="glosas">
          {sugerencias.map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>
      <label className="w-40">
        <span className="text-[11px] uppercase tracking-widest text-gris">Monto</span>
        <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" className="campo text-right text-lg" placeholder="$" />
      </label>
      <button type="button" onClick={() => setForma((f) => (f === "EFECTIVO" ? "TRANSFERENCIA" : "EFECTIVO"))} className="mb-1.5 text-sm text-tinta underline decoration-dotted underline-offset-4">
        {forma === "EFECTIVO" ? "Efectivo" : "Transf."}
      </button>
      <button type="submit" className="btn btn-primario">
        Registrar <Tecla>↵</Tecla>
      </button>
      <button type="button" onClick={onCerrar} className="text-gris">Cancelar</button>
    </form>
  );
}
