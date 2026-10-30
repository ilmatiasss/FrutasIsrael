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
import { AgregarDeuda } from "./AgregarDeuda";
import { useAviso } from "../Shell";
import { MontoGrande, Modal, StickerSemaforo, Tecla, Vacio } from "../ui";

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
  const [deuda, setDeuda] = useState(false);

  const movs = useMemo(() => data.idx.movsCliente.get(id) ?? [], [data, id]);
  const [d, h] = rangoDe(periodo, desde, hasta);
  const libro = useMemo(() => libroCuenta(movs, d, h), [movs, d, h]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key.toLowerCase() === "v" && !e.ctrlKey && !e.metaKey) router.push(`/vale?cliente=${id}`);
      if (e.key.toLowerCase() === "a" && !e.ctrlKey && !e.metaKey) router.push(`/abono?cliente=${id}`);
      if (e.key.toLowerCase() === "d" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setDeuda(true);
      }
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

  const detalle = (m: Movimiento) => {
    const ls = data.idx.lineasMov.get(m.id);
    if (ls?.length)
      return ls
        .map((l) => `${cant(l.cantidad)} ${l.unidad === "KG" ? "kg" : l.unidad === "ENVASE" ? "env" : "cj"} ${data.idx.producto.get(l.producto_id)?.nombre ?? ""}`)
        .join(" · ");
    return m.glosa ?? (m.tipo === "ABONO" ? (m.forma_pago === "TRANSFERENCIA" ? "Transferencia" : "Efectivo") : "");
  };

  const meses = nuevoArriba ? [...libro.meses].reverse() : libro.meses;
  const ciclo: (Semaforo | null)[] = [null, "VERDE", "AMARILLO", "ROJO"];
  const totalPeriodo = libro.meses.reduce(
    (a, m) => ({ credito: a.credito + m.credito, pago: a.pago + m.pago, venta: a.venta + m.venta }),
    { credito: 0, pago: 0, venta: 0 },
  );

  return (
    <div className="space-y-6">
      {/* ------------------------------ ficha ------------------------------ */}
      <section className="hoja rounded-lg" aria-label="Ficha del cliente">
        <div className="grid gap-6 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-sm text-gris">
              <Link href="/clientes" className="hover:text-tinta">Clientes</Link> / Cuenta cliente
            </p>
            <h1 className="stencil mt-1 break-words text-[30px] sm:text-[38px]">{c.alias ?? c.nombre}</h1>
            {c.alias && <p className="text-gris">{c.nombre}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <StickerSemaforo
                s={est.semaforo}
                manual={est.manual}
                onClick={() => {
                  const sig = ciclo[(ciclo.indexOf(c.semaforo_manual) + 1) % ciclo.length];
                  editarCliente(c.id, { semaforo_manual: sig }, `Clasificación ${sig ? `manual: ${sig}` : "automática"}`);
                  avisar({ titulo: sig ? "Estado fijado a mano" : "Estado automático", tono: "tinta" });
                }}
                title="Clic para fijar el estado a mano"
              />
              <span className="text-gris">{est.compra ? "Sigue comprando" : "Ya no compra"}</span>
              {c.telefono && (
                <a href={`tel:${c.telefono.replace(/\s/g, "")}`} className="cifra text-tinta">
                  {c.telefono}
                </a>
              )}
              <button type="button" onClick={() => setEditar(true)} className="text-tinta underline underline-offset-4">
                Editar
              </button>
            </div>
            {c.notas && <p className="mt-3 max-w-xl text-sm text-gris">Nota: {c.notas}</p>}

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4 [&>div]:min-w-0">
              <div>
                <dt className="rotulo">Último pago</dt>
                <dd className="mt-0.5 font-semibold">{est.ultimoPago ? haceDias(diasEntre(est.ultimoPago, hoy())) : "nunca"}</dd>
                <dd className="text-xs text-gris">{est.ultimoPago ? ddmmaa(est.ultimoPago) : ""}</dd>
              </div>
              <div>
                <dt className="rotulo">Vales impagos</dt>
                <dd className="mt-0.5 font-semibold">{est.pendientes.length || "ninguno"}</dd>
                <dd className="text-xs text-gris">{est.valeMasAntiguo ? `el más antiguo del ${ddmmaa(est.valeMasAntiguo)}` : ""}</dd>
              </div>
              <div>
                <dt className="rotulo">Compró en 30 días</dt>
                <dd className="cifra mt-0.5 font-semibold">{clp(est.compras30)}</dd>
                <dd className="text-xs text-gris">última compra {haceDias(est.diasSinComprar)}</dd>
              </div>
              <div>
                <dt className="rotulo">Tope de crédito</dt>
                <dd className="cifra mt-0.5 font-semibold">{c.limite_credito !== null ? clp(c.limite_credito) : "sin tope"}</dd>
                {est.sobreLimite && <dd className="text-xs font-semibold text-fuji">lo sobrepasa</dd>}
              </div>
            </dl>
          </div>

          {/* deuda vigente: lo más grande de la pantalla */}
          <div className="flex flex-col items-start border-t border-linea pt-5 lg:items-end lg:border-0 lg:pt-0">
            <span className="rotulo">Deuda vigente</span>
            <p className="doble-raya mt-1 text-[44px] leading-none sm:text-[60px]">
              <MontoGrande valor={est.saldo} />
            </p>
            {est.saldo <= 0 && <p className="mt-2 font-semibold text-pera">Al día</p>}
            <div className="mt-5 flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
              <Link href={`/vale?cliente=${c.id}`} className="btn btn-primario flex-1 whitespace-nowrap px-3 text-sm sm:flex-none sm:px-5 sm:text-base">
                Nuevo vale <span className="tecla hidden md:inline-flex">V</span>
              </Link>
              <Link href={`/abono?cliente=${c.id}`} className="btn btn-secundario flex-1 whitespace-nowrap px-3 text-sm sm:flex-none sm:px-5 sm:text-base">
                Abonar <span className="tecla hidden md:inline-flex">A</span>
              </Link>
              <button type="button" onClick={() => setDeuda(true)} className="btn btn-secundario flex-1 whitespace-nowrap px-3 text-sm sm:flex-none sm:px-5 sm:text-base">
                Agregar deuda <span className="tecla hidden md:inline-flex">D</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ período ------------------------------ */}
      <section className="no-print flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-linea py-3">
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
              className={`px-3 py-1 capitalize ${periodo === k ? "bg-tinta text-white" : "hover:bg-carton"}`}
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
      <section className="hoja overflow-hidden rounded-lg" aria-label="Historial de la cuenta">
        <div className="hidden lg:block">
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
                  <tr className="bg-carton/60">
                    <td colSpan={3} className="px-3 py-2">
                      <span className="font-semibold capitalize">
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
                          <span className="mr-2 font-semibold text-grafito">Semana N°{s.semana}</span>
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
                  <td colSpan={3} className="px-3 py-3 font-semibold">
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
        <div className="lg:hidden">
          {meses.map((mes) => (
            <div key={mes.key}>
              <p className="stencil bg-carton/60 px-3 py-2 text-lg capitalize">
                {MESES[mes.mes - 1]} {mes.anio}
              </p>
              {(nuevoArriba ? [...mes.semanas].reverse() : mes.semanas).map((s) => (
                <div key={s.key} className="border-b border-grafito/20">
                  <p className="flex justify-between px-3 pb-1 pt-2 text-xs text-gris">
                    <span className="font-semibold text-grafito">Semana N°{s.semana}</span>
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

      <p className="hidden text-sm text-gris lg:block">
        <Tecla>V</Tecla> nuevo vale · <Tecla>A</Tecla> abonar · <Tecla>D</Tecla> agregar deuda · clic en una fila para ver el vale o anularlo
      </p>

      <DetalleMovimiento movId={ver} onCerrar={() => setVer(null)} />
      <EditarCliente cliente={c} abierto={editar} onCerrar={() => setEditar(false)} />
      <AgregarDeuda est={est} abierto={deuda} onCerrar={() => setDeuda(false)} />
    </div>
  );
}

function EditarCliente({ cliente, abierto, onCerrar }: { cliente: Cliente; abierto: boolean; onCerrar: () => void }) {
  const avisar = useAviso();
  const [f, setF] = useState({ nombre: "", alias: "", telefono: "", limite: "", notas: "" });
  useEffect(() => {
    if (abierto)
      setF({
        nombre: cliente.nombre,
        alias: cliente.alias ?? "",
        telefono: cliente.telefono ?? "",
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
      limite_credito: parseMonto(f.limite),
      notas: f.notas.trim() || null,
    }, "Ficha editada");
    avisar({ titulo: "Ficha actualizada", tono: "tinta" });
    onCerrar();
  };
  const campo = (k: keyof typeof f, label: string) => (
    <label className="block">
      <span className="rotulo">{label}</span>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="campo font-sans text-lg" />
    </label>
  );
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} etiqueta="Editar ficha">
      <form onSubmit={enviar} className="space-y-3">
        <p className="stencil text-2xl">Editar cliente</p>
        {campo("nombre", "Nombre")}
        <div className="grid grid-cols-2 gap-3">
          {campo("alias", "Alias")}
          {campo("telefono", "Teléfono")}
        </div>
        {campo("limite", "Tope de crédito")}
        <label className="block">
          <span className="rotulo">Nota</span>
          <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2} className="campo resize-none font-sans" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCerrar} className="btn btn-secundario">Cancelar</button>
          <button type="submit" className="btn btn-primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
