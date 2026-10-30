"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Cliente, Movimiento, Semaforo } from "@/lib/types";
import { editarCliente, useData } from "@/lib/store";
import { libroCuenta, vivo } from "@/lib/calc";
import {
  cant, clp, ddmm, ddmmaa, diasEntre, fechaCorta, haceDias, hoy, MESES, miles, parseMonto, sumarDias,
} from "@/lib/format";
import { useEstados } from "../clientes";
import { DetalleMovimiento } from "../DetalleMovimiento";
import { useAviso } from "../Shell";
import { COLOR_SEMAFORO, MontoGrande, Modal, StickerSemaforo, Tecla, Timbre, Vacio } from "../ui";

type Periodo = "mes" | "anterior" | "3m" | "todo" | "rango";

function rangoDe(p: Periodo, desde: string, hasta: string): [string | null, string | null] {
  const h = hoy();
  const [y, m] = h.split("-").map(Number);
  const ini = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  switch (p) {
    case "mes": return [ini(y, m), null];
    case "anterior": {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return [ini(py, pm), sumarDias(ini(y, m), -1)];
    }
    case "3m": return [sumarDias(h, -90), null];
    case "todo": return [null, null];
    case "rango": return [desde || null, hasta || null];
  }
}

export function CuentaCliente({ id }: { id: string }) {
  const data = useData()!;
  const estados = useEstados(data);
  const avisar = useAviso();
  const router = useRouter();
  const est = estados.get(id);
  const [periodo, setPeriodo] = useState<Periodo>("3m");
  const [desde, setDesde] = useState(sumarDias(hoy(), -30));
  const [hasta, setHasta] = useState(hoy());
  const [nuevoArriba, setNuevoArriba] = useState(true);
  const [ver, setVer] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);

  const movs = useMemo(() => data.idx.movsCliente.get(id) ?? [], [data, id]);
  const [d, h] = rangoDe(periodo, desde, hasta);
  const libro = useMemo(() => libroCuenta(movs, d, h), [movs, d, h]);

  // curva de deuda semanal (todo el historial)
  const curva = useMemo(() => {
    const full = libroCuenta(movs, null, null);
    const pts: { lunes: string; saldo: number; semana: number }[] = [];
    for (const m of full.meses)
      for (const s of m.semanas) {
        const prev = pts[pts.length - 1];
        if (prev && prev.lunes === s.lunes) prev.saldo = s.saldoFinal;
        else pts.push({ lunes: s.lunes, saldo: s.saldoFinal, semana: s.semana });
      }
    return pts.slice(-16);
  }, [movs]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key.toLowerCase() === "v" && !e.ctrlKey && !e.metaKey) router.push(`/?cliente=${id}`);
      if (e.key.toLowerCase() === "a" && !e.ctrlKey && !e.metaKey) router.push(`/abono?cliente=${id}`);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [id, router]);

  if (!est) {
    return (
      <div className="hoja mx-auto max-w-lg rounded-sm p-8 text-center">
        <Vacio>No encontramos ese cliente.</Vacio>
        <Link href="/clientes" className="text-tinta underline">Volver a clientes</Link>
      </div>
    );
  }
  const c = est.cliente;
  const sc = COLOR_SEMAFORO[est.semaforo];

  const detalle = (m: Movimiento) => {
    const ls = data.idx.lineasMov.get(m.id);
    if (ls?.length)
      return ls
        .map((l) => `${cant(l.cantidad)} ${l.unidad === "KG" ? "kg" : l.unidad === "ENVASE" ? "env" : "cj"} ${data.idx.producto.get(l.producto_id)?.nombre ?? ""}`)
        .join(" · ");
    return m.glosa ?? (m.tipo === "ABONO" ? (m.forma_pago === "TRANSFERENCIA" ? "Transferencia" : "Efectivo") : "");
  };

  const maxCurva = Math.max(1, ...curva.map((p) => p.saldo));
  const meses = nuevoArriba ? [...libro.meses].reverse() : libro.meses;
  const ciclo: (Semaforo | null)[] = [null, "VERDE", "AMARILLO", "ROJO"];
  const totalPeriodo = libro.meses.reduce(
    (a, m) => ({ credito: a.credito + m.credito, pago: a.pago + m.pago, venta: a.venta + m.venta }),
    { credito: 0, pago: 0, venta: 0 },
  );

  return (
    <div className="space-y-6">
      {/* ------------------------------ ficha ------------------------------ */}
      <section className="hoja perforado relative overflow-hidden rounded-b-md" aria-label="Ficha del cliente">
        <div className="absolute inset-y-0 left-0 w-2" style={{ background: sc.bg }} aria-hidden />
        <div className="grid gap-6 px-5 pb-6 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.25em] text-gris">
              <Link href="/clientes" className="hover:text-tinta">Clientes</Link> / Cuenta cliente
            </p>
            <h1 className="stencil mt-1 break-words text-[44px] font-black leading-[0.9] sm:text-[64px]">{c.alias ?? c.nombre}</h1>
            <p className="mt-2 text-lg">
              {c.alias && <span className="font-semibold">{c.nombre}</span>}
              {c.procedencia && <span className="text-gris"> · {c.procedencia}</span>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <StickerSemaforo
                s={est.semaforo}
                manual={est.manual}
                onClick={() => {
                  const sig = ciclo[(ciclo.indexOf(c.semaforo_manual) + 1) % ciclo.length];
                  editarCliente(c.id, { semaforo_manual: sig }, `Clasificación ${sig ? `manual: ${sig}` : "automática"}`);
                  avisar({ titulo: sig ? `Fijado en ${sig}` : "Clasificación automática", tono: "tinta" });
                }}
                title="Clic para fijar la clasificación a mano"
              />
              <span className={`cajon text-[11px] ${est.compra ? "text-pera" : "text-gris"}`}>{est.compra ? "Sigue comprando" : "Ya no compra"}</span>
              {c.telefono && (
                <a href={`tel:${c.telefono.replace(/\s/g, "")}`} className="cifra text-tinta underline decoration-dotted underline-offset-4">
                  {c.telefono}
                </a>
              )}
              <button type="button" onClick={() => setEditar(true)} className="text-gris underline decoration-dotted underline-offset-4 hover:text-grafito">
                editar ficha
              </button>
            </div>
            {c.notas && <p className="mt-3 max-w-xl font-mano text-[22px] leading-tight text-tinta">“{c.notas}”</p>}

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4 [&>div]:min-w-0">
              <div>
                <dt className="text-[11px] uppercase tracking-widest text-gris">Último pago</dt>
                <dd className="font-semibold">{est.ultimoPago ? ddmmaa(est.ultimoPago) : "nunca"}</dd>
                <dd className="text-xs text-gris">{est.ultimoPago ? haceDias(diasEntre(est.ultimoPago, hoy())) : ""}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-widest text-gris">Vale impago más antiguo</dt>
                <dd className="font-semibold">{est.valeMasAntiguo ? ddmmaa(est.valeMasAntiguo) : "—"}</dd>
                <dd className="text-xs text-gris">{est.valeMasAntiguo ? `${est.pendientes.length} vales impagos` : "sin vales impagos"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-widest text-gris">Compró últimos 30 d</dt>
                <dd className="cifra font-semibold text-tinta">{clp(est.compras30)}</dd>
                <dd className="text-xs text-gris">última compra {haceDias(est.diasSinComprar)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-widest text-gris">Tope de crédito</dt>
                {c.limite_credito !== null ? (
                  <>
                    <dd className="cifra font-semibold">{clp(c.limite_credito)}</dd>
                    <dd className="mt-1 h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-linea">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.min(100, (est.saldo / c.limite_credito) * 100)}%`, background: est.sobreLimite ? "#c4262e" : "#1f3c8f" }}
                      />
                    </dd>
                  </>
                ) : (
                  <dd className="text-gris">sin tope</dd>
                )}
              </div>
            </dl>
          </div>

          {/* deuda vigente: lo más grande de la pantalla */}
          <div className="flex flex-col items-start lg:items-end">
            <p className="text-[11px] uppercase tracking-[0.25em] text-gris">Deuda vigente</p>
            <p className="doble-raya mt-1 text-[48px] leading-none text-fuji sm:text-[72px] xl:text-[88px]">
              <MontoGrande valor={est.saldo} />
            </p>
            {est.saldo <= 0 && (
              <span className="mt-3">
                <Timbre color="#4f7f2a" className="text-2xl" animar={false}>
                  Al día
                </Timbre>
              </span>
            )}
            {/* curva de deuda por semana */}
            {curva.length > 1 && (
              <figure className="mt-4 w-full max-w-[340px]">
                <svg viewBox={`0 0 ${curva.length * 20} 56`} className="h-14 w-full" role="img" aria-label="Deuda al cierre de cada semana">
                  {curva.map((p, i) => {
                    const hh = (Math.max(0, p.saldo) / maxCurva) * 48;
                    return (
                      <g key={p.lunes}>
                        <title>{`Semana N°${p.semana}: ${clp(p.saldo)}`}</title>
                        <rect x={i * 20 + 3} y={52 - hh} width={14} height={Math.max(hh, 1)} rx={1.5} fill={i === curva.length - 1 ? "#c4262e" : "#c4262e55"} />
                      </g>
                    );
                  })}
                  <line x1="0" x2={curva.length * 20} y1="52.5" y2="52.5" stroke="#8a6a3d" strokeWidth="1" />
                </svg>
                <figcaption className="flex justify-between text-[10px] uppercase tracking-wider text-gris">
                  <span>N°{curva[0].semana}</span>
                  <span>deuda al cierre de cada semana</span>
                  <span>N°{curva[curva.length - 1].semana}</span>
                </figcaption>
              </figure>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/?cliente=${c.id}`}
                className="stencil flex items-center gap-2 rounded-sm bg-grafito px-4 py-2 text-lg font-extrabold text-hoja shadow-[0_3px_0_#000] active:translate-y-[2px] active:shadow-none"
              >
                Nuevo vale <span className="tecla">V</span>
              </Link>
              <Link
                href={`/abono?cliente=${c.id}`}
                className="stencil flex items-center gap-2 rounded-sm bg-pera px-4 py-2 text-lg font-extrabold text-hoja shadow-[0_3px_0_#2f4f17] active:translate-y-[2px] active:shadow-none"
              >
                Abonar <span className="tecla">A</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ período ------------------------------ */}
      <section className="no-print flex flex-wrap items-center gap-x-4 gap-y-3 border-y-2 border-grafito/80 py-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-gris">Período</span>
        <div className="flex flex-wrap overflow-hidden rounded-sm border border-kraft-osc/60 text-sm" role="group" aria-label="Período">
          {(
            [
              ["mes", MESES[Number(hoy().slice(5, 7)) - 1]],
              ["anterior", "Mes anterior"],
              ["3m", "Últimos 3 meses"],
              ["todo", "Todo"],
              ["rango", "Fechas…"],
            ] as [Periodo, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPeriodo(k)}
              aria-pressed={periodo === k}
              className={`px-3 py-1 capitalize ${periodo === k ? "bg-grafito text-hoja" : "hover:bg-carton"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {periodo === "rango" && (
          <span className="flex items-center gap-2 text-sm">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="campo w-auto font-sans" aria-label="Desde" />
            <span className="text-gris">a</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="campo w-auto font-sans" aria-label="Hasta" />
          </span>
        )}
        <button type="button" onClick={() => setNuevoArriba((x) => !x)} className="ml-auto text-sm text-gris hover:text-grafito">
          {nuevoArriba ? "↑ Lo más nuevo arriba" : "↓ Orden de planilla"}
        </button>
        <button type="button" onClick={() => window.print()} className="text-sm text-gris hover:text-grafito">
          Imprimir
        </button>
      </section>

      {/* ------------------------------ libro ------------------------------ */}
      <section className="hoja overflow-hidden rounded-sm" aria-label="Historial de la cuenta">
        <div className="hidden md:block">
          <table className="w-full table-fixed text-[15px]">
            <colgroup>
              <col className="w-[92px]" />
              <col className="w-[78px]" />
              <col />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[140px]" />
            </colgroup>
            <thead className="border-b-2 border-grafito text-left text-[11px] uppercase tracking-[0.14em] text-gris">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-2 py-2 font-medium">N° vale</th>
                <th className="px-2 py-2 font-medium">Detalle</th>
                <th className="px-2 py-2 text-right font-medium text-fuji">Vale crédito</th>
                <th className="px-2 py-2 text-right font-medium text-tinta">Pago crédito</th>
                <th className="px-2 py-2 text-right font-medium text-pera">Vale venta</th>
                <th className="px-3 py-2 text-right font-medium text-grafito">Saldo</th>
              </tr>
            </thead>
            {(d || libro.saldoAnterior !== 0) && (
              <tbody>
                <tr className="border-b border-linea bg-papel/50 text-sm italic text-gris">
                  <td colSpan={6} className="px-3 py-1.5">
                    Saldo anterior al {d ? ddmmaa(d) : "inicio"}
                  </td>
                  <td className={`cifra px-3 py-1.5 text-right not-italic ${libro.saldoAnterior > 0 ? "text-fuji" : ""}`}>{clp(libro.saldoAnterior)}</td>
                </tr>
              </tbody>
            )}
            {meses.map((mes) => {
              const semanas = nuevoArriba ? [...mes.semanas].reverse() : mes.semanas;
              return (
                <tbody key={mes.key}>
                  <tr className="bg-carton/70" style={{ backgroundImage: "var(--grano)" }}>
                    <td colSpan={3} className="px-3 py-2">
                      <span className="stencil text-[22px] font-black">
                        {MESES[mes.mes - 1]} {mes.anio}
                      </span>
                    </td>
                    <td className="cifra px-2 text-right font-semibold text-fuji">{mes.credito ? clp(mes.credito) : ""}</td>
                    <td className="cifra px-2 text-right font-semibold text-tinta">{mes.pago ? clp(mes.pago) : ""}</td>
                    <td className="cifra px-2 text-right font-semibold text-pera">{mes.venta ? clp(mes.venta) : ""}</td>
                    <td className={`cifra px-3 text-right font-bold ${mes.saldoFinal > 0 ? "text-fuji" : "text-pera"}`}>{clp(mes.saldoFinal)}</td>
                  </tr>
                  {semanas.map((s) => {
                    const filas = nuevoArriba ? [...s.filas].reverse() : s.filas;
                    return [
                      <tr key={s.key} className="border-b border-grafito/25 bg-hoja text-[13px]">
                        <td colSpan={3} className="px-3 pb-1 pt-3">
                          <span className="cajon mr-2 text-[12px] text-kraft-osc">Semana N°{s.semana}</span>
                          <span className="text-gris">
                            {fechaCorta(s.lunes)} – {fechaCorta(sumarDias(s.lunes, 6))}
                          </span>
                        </td>
                        <td className="cifra px-2 pt-3 text-right text-fuji/80">{s.credito ? clp(s.credito) : ""}</td>
                        <td className="cifra px-2 pt-3 text-right text-tinta/80">{s.pago ? clp(s.pago) : ""}</td>
                        <td className="cifra px-2 pt-3 text-right text-pera/80">{s.venta ? clp(s.venta) : ""}</td>
                        <td className="cifra px-3 pt-3 text-right text-gris">{clp(s.saldoFinal)}</td>
                      </tr>,
                      ...filas.map(({ mov: m, saldo }) => {
                        const anulado = !vivo(m);
                        const col = (t: Movimiento["tipo"]) => (m.tipo === t ? m.total : 0);
                        return (
                          <tr
                            key={m.id}
                            onClick={() => setVer(m.id)}
                            className={`group relative cursor-pointer border-b border-linea transition-colors hover:bg-resaltador/40 ${anulado ? "text-gris" : ""}`}
                          >
                            <td className="cifra px-3 py-1.5 text-sm">{ddmm(m.fecha)}</td>
                            <td className="cifra px-2 py-1.5 text-sm font-semibold text-fuji/90">{m.numero}</td>
                            <td className="truncate px-2 py-1.5 text-sm">
                              {anulado && <span className="timbre mr-2 !rotate-[-3deg] text-[10px] text-fuji">Anulado</span>}
                              <span className={anulado ? "line-through" : m.importado ? "italic text-kraft-osc" : "text-grafito/85"}>{detalle(m)}</span>
                            </td>
                            {(["VALE_CREDITO", "ABONO", "VALE_VENTA"] as const).map((t) => (
                              <td
                                key={t}
                                className={`cifra px-2 py-1.5 text-right ${anulado ? "line-through" : ""} ${t === "VALE_CREDITO" ? "text-fuji" : t === "ABONO" ? "text-tinta" : "text-pera"}`}
                              >
                                {col(t) ? miles(col(t)) : ""}
                              </td>
                            ))}
                            <td className={`cifra px-3 py-1.5 text-right font-semibold ${saldo > 0 ? "text-fuji" : "text-pera"}`}>{clp(saldo)}</td>
                          </tr>
                        );
                      }),
                    ];
                  })}
                </tbody>
              );
            })}
            {libro.meses.length > 0 && (
              <tfoot className="border-t-2 border-grafito">
                <tr>
                  <td colSpan={3} className="stencil px-3 py-3 text-lg font-extrabold">
                    Total del período
                  </td>
                  <td className="cifra px-2 text-right font-bold text-fuji">{clp(totalPeriodo.credito)}</td>
                  <td className="cifra px-2 text-right font-bold text-tinta">{clp(totalPeriodo.pago)}</td>
                  <td className="cifra px-2 text-right font-bold text-pera">{clp(totalPeriodo.venta)}</td>
                  <td className="px-3 text-right">
                    <span className={`cifra doble-raya font-bold ${est.saldo > 0 ? "text-fuji" : "text-pera"}`}>
                      {clp(libro.meses[libro.meses.length - 1].saldoFinal)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* celular: tarjetas por semana */}
        <div className="md:hidden">
          {meses.map((mes) => (
            <div key={mes.key}>
              <p className="stencil sticky top-[60px] z-10 bg-carton px-3 py-1.5 text-xl font-black">
                {MESES[mes.mes - 1]} {mes.anio}
              </p>
              {(nuevoArriba ? [...mes.semanas].reverse() : mes.semanas).map((s) => (
                <div key={s.key} className="border-b border-grafito/20">
                  <p className="flex justify-between px-3 pb-1 pt-2 text-xs text-gris">
                    <span className="cajon text-[11px] text-kraft-osc">N°{s.semana}</span>
                    <span className="cifra">saldo {clp(s.saldoFinal)}</span>
                  </p>
                  {(nuevoArriba ? [...s.filas].reverse() : s.filas).map(({ mov: m, saldo }) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setVer(m.id)}
                      className={`grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] gap-x-2 px-3 py-1.5 text-left text-sm ${!vivo(m) ? "text-gris line-through" : ""}`}
                    >
                      <span className="cifra">{ddmm(m.fecha)}</span>
                      <span className="truncate">{detalle(m)}</span>
                      <span className={`cifra text-right ${m.tipo === "VALE_CREDITO" ? "text-fuji" : m.tipo === "ABONO" ? "text-tinta" : "text-pera"}`}>
                        {m.tipo === "ABONO" ? "−" : m.tipo === "VALE_CREDITO" ? "+" : ""}
                        {miles(m.total)}
                      </span>
                      <span />
                      <span className="text-[11px] text-gris">N°{m.numero}</span>
                      <span className="cifra text-right text-[11px] text-gris">{clp(saldo)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {libro.meses.length === 0 && <Vacio>Sin movimientos en este período.</Vacio>}
      </section>

      <p className="hidden text-sm text-gris md:block">
        <Tecla>V</Tecla> nuevo vale · <Tecla>A</Tecla> abonar · clic en una fila para ver el vale o anularlo
      </p>

      <DetalleMovimiento movId={ver} onCerrar={() => setVer(null)} />
      <EditarCliente cliente={c} abierto={editar} onCerrar={() => setEditar(false)} />
    </div>
  );
}

function EditarCliente({ cliente, abierto, onCerrar }: { cliente: Cliente; abierto: boolean; onCerrar: () => void }) {
  const avisar = useAviso();
  const [f, setF] = useState({ nombre: "", alias: "", telefono: "", procedencia: "", limite: "", notas: "" });
  useEffect(() => {
    if (abierto)
      setF({
        nombre: cliente.nombre,
        alias: cliente.alias ?? "",
        telefono: cliente.telefono ?? "",
        procedencia: cliente.procedencia ?? "",
        limite: cliente.limite_credito ? miles(cliente.limite_credito) : "",
        notas: cliente.notas ?? "",
      });
  }, [abierto, cliente]);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    editarCliente(cliente.id, {
      nombre: f.nombre.trim() || cliente.nombre,
      alias: f.alias.trim().toUpperCase() || null,
      telefono: f.telefono.trim() || null,
      procedencia: f.procedencia.trim() || null,
      limite_credito: parseMonto(f.limite),
      notas: f.notas.trim() || null,
    }, "Ficha editada");
    avisar({ titulo: "Ficha actualizada", tono: "tinta" });
    onCerrar();
  };
  const campo = (k: keyof typeof f, label: string) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-gris">{label}</span>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="campo font-sans text-lg" />
    </label>
  );
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} etiqueta="Editar ficha">
      <form onSubmit={enviar} className="space-y-3">
        <p className="stencil text-2xl font-extrabold">Editar ficha</p>
        {campo("nombre", "Nombre")}
        <div className="grid grid-cols-2 gap-3">
          {campo("alias", "Alias")}
          {campo("telefono", "Teléfono")}
        </div>
        {campo("procedencia", "Feria / local")}
        {campo("limite", "Tope de crédito")}
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-gris">Nota</span>
          <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2} className="campo resize-none font-mano text-xl" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCerrar} className="px-3 py-2 text-gris">Cancelar</button>
          <button type="submit" className="stencil rounded-sm bg-tinta px-4 py-2 text-lg font-extrabold text-hoja">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
