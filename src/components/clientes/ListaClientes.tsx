"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Semaforo } from "@/lib/types";
import { editarCliente, useData } from "@/lib/store";
import type { EstadoCliente } from "@/lib/calc";
import { clp, ddmmaa, haceDias, normalizar } from "@/lib/format";
import { useEstados } from "../clientes";
import { NuevoCliente } from "../NuevoCliente";
import { useAviso } from "../Shell";
import { COLOR_SEMAFORO, MontoGrande, StickerSemaforo, Tecla } from "../ui";

type Orden = "cliente" | "deuda" | "dias" | "pago" | "compra" | "c30";
const CICLO: (Semaforo | null)[] = [null, "VERDE", "AMARILLO", "ROJO"];

export function ListaClientes() {
  const data = useData()!;
  const estados = useEstados(data);
  const router = useRouter();
  const avisar = useAviso();
  const cfg = data.db.config;

  const [q, setQ] = useState("");
  const [sem, setSem] = useState<Set<Semaforo>>(new Set());
  const [conDeuda, setConDeuda] = useState(false);
  const [compra, setCompra] = useState<"todos" | "si" | "no">("todos");
  const [orden, setOrden] = useState<{ k: Orden; asc: boolean }>({ k: "deuda", asc: false });
  const [sel, setSel] = useState(0);
  const [nuevo, setNuevo] = useState(false);
  const buscarRef = useRef<HTMLInputElement>(null);
  const tablaRef = useRef<HTMLDivElement>(null);

  const todos = useMemo(() => [...estados.values()], [estados]);

  const lista = useMemo(() => {
    const nq = normalizar(q);
    const f = todos.filter((e) => {
      if (sem.size && !sem.has(e.semaforo)) return false;
      if (conDeuda && e.saldo <= 0) return false;
      if (compra === "si" && !e.compra) return false;
      if (compra === "no" && e.compra) return false;
      if (nq) {
        const t = normalizar(`${e.cliente.alias ?? ""} ${e.cliente.nombre} ${e.cliente.procedencia ?? ""}`);
        if (!nq.split(" ").every((p) => t.includes(p))) return false;
      }
      return true;
    });
    const val = (e: EstadoCliente): number | string => {
      switch (orden.k) {
        case "cliente": return normalizar(e.cliente.alias ?? e.cliente.nombre);
        case "deuda": return e.saldo;
        case "dias": return e.diasSinPagar ?? -1;
        case "pago": return e.ultimoPago ?? "";
        case "compra": return e.ultimaCompra ?? "";
        case "c30": return e.compras30;
      }
    };
    return f.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return orden.asc ? c : -c;
    });
  }, [todos, q, sem, conDeuda, compra, orden]);

  useEffect(() => setSel(0), [q, sem, conDeuda, compra, orden]);
  useEffect(() => {
    tablaRef.current?.querySelector(`[data-fila="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  // teclado: / busca, ↑↓ o j/k mueven, Enter abre cuenta
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const enInput = (e.target as HTMLElement).tagName === "INPUT";
      if (e.key === "/" && !enInput) {
        e.preventDefault();
        buscarRef.current?.focus();
      } else if (e.key === "ArrowDown" || (e.key === "j" && !enInput)) {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, lista.length - 1));
      } else if (e.key === "ArrowUp" || (e.key === "k" && !enInput)) {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && lista[sel] && (!enInput || e.target === buscarRef.current)) {
        e.preventDefault();
        router.push(`/clientes/${lista[sel].cliente.id}`);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [lista, sel, router]);

  // totales
  const enLaCalle = todos.reduce((a, e) => a + Math.max(0, e.saldo), 0);
  const porSem = (["VERDE", "AMARILLO", "ROJO"] as Semaforo[]).map((s) => {
    const xs = todos.filter((e) => e.semaforo === s && e.saldo > 0);
    return { s, n: todos.filter((e) => e.semaforo === s).length, monto: xs.reduce((a, e) => a + e.saldo, 0) };
  });
  const perdidos = todos.filter((e) => !e.compra && e.saldo > 0);
  const montoPerdidos = perdidos.reduce((a, e) => a + e.saldo, 0);

  const ciclar = (e: EstadoCliente) => {
    const i = CICLO.indexOf(e.cliente.semaforo_manual);
    const sig = CICLO[(i + 1) % CICLO.length];
    editarCliente(e.cliente.id, { semaforo_manual: sig }, `Clasificación ${sig ? `manual: ${sig}` : "vuelve a automática"}`);
    avisar({
      titulo: e.cliente.alias ?? e.cliente.nombre,
      detalle: sig ? `Clasificación fijada a mano en ${sig}` : `Clasificación automática (${e.semaforoCalc})`,
      tono: "tinta",
    });
  };

  const Th = ({ k, children, className = "" }: { k: Orden; children: React.ReactNode; className?: string }) => (
    <th className={`px-2 py-2 font-medium ${className}`} aria-sort={orden.k === k ? (orden.asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => setOrden((o) => ({ k, asc: o.k === k ? !o.asc : k === "cliente" }))}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-grafito ${orden.k === k ? "text-grafito" : ""}`}
      >
        {children}
        <span className="text-[9px]">{orden.k === k ? (orden.asc ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  const chipSem = (s: Semaforo) => {
    const on = sem.has(s);
    const c = COLOR_SEMAFORO[s];
    return (
      <button
        key={s}
        type="button"
        onClick={() => {
          const n = new Set(sem);
          if (on) n.delete(s);
          else n.add(s);
          setSem(n);
        }}
        aria-pressed={on}
        className={`sticker transition ${on ? "scale-105" : "opacity-45 grayscale-[.4] hover:opacity-80"}`}
        style={{ background: c.bg, color: c.txt }}
      >
        {c.corto}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* -------------------------- resumen arriba -------------------------- */}
      <section className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
        <div>
          <h1 className="stencil text-[40px] font-black leading-none sm:text-[52px]">Clientes</h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-gris">Fiado en la calle a la fecha</p>
          <p className="text-[46px] leading-none sm:text-[60px]">
            <MontoGrande valor={enLaCalle} />
          </p>
        </div>
        <div className="min-w-0 lg:pl-8">
          {/* barra apilada por semáforo, como etiquetas de cajón pegadas */}
          <div className="flex h-9 overflow-hidden rounded-sm shadow-[inset_0_0_0_1.5px_rgba(0,0,0,.08)]" role="img" aria-label="Deuda por clasificación">
            {porSem.map(({ s, monto }) =>
              monto > 0 ? (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSem(new Set([s]))}
                  className="stencil flex items-center justify-center overflow-hidden whitespace-nowrap px-2 text-sm font-extrabold transition hover:brightness-110"
                  style={{ width: `${(monto / enLaCalle) * 100}%`, background: COLOR_SEMAFORO[s].bg, color: COLOR_SEMAFORO[s].txt }}
                  title={`${COLOR_SEMAFORO[s].label}: ${clp(monto)}`}
                >
                  {((monto / enLaCalle) * 100).toFixed(0)}%
                </button>
              ) : null,
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {porSem.map(({ s, n, monto }) => (
              <div key={s} className="border-l-4 pl-2" style={{ borderColor: COLOR_SEMAFORO[s].bg }}>
                <dt className="text-gris">
                  {COLOR_SEMAFORO[s].label} · {n}
                </dt>
                <dd className="cifra font-semibold">{clp(monto)}</dd>
              </div>
            ))}
            <div className="border-l-4 border-dashed border-grafito/50 pl-2">
              <dt className="text-gris">Ya no compran y deben · {perdidos.length}</dt>
              <dd className="cifra font-semibold text-fuji">{clp(montoPerdidos)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* -------------------------------- filtros -------------------------------- */}
      <section className="no-print flex flex-wrap items-center gap-x-5 gap-y-3 border-y-2 border-grafito/80 py-3">
        <label className="flex min-w-[220px] flex-1 items-center gap-2">
          <Tecla>/</Tecla>
          <input
            ref={buscarRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por alias, nombre o feria"
            className="campo font-sans text-lg"
            aria-label="Buscar cliente"
          />
        </label>
        <div className="flex items-center gap-1.5">{(["VERDE", "AMARILLO", "ROJO"] as Semaforo[]).map(chipSem)}</div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={conDeuda} onChange={(e) => setConDeuda(e.target.checked)} className="size-4 accent-fuji" />
          Solo con deuda
        </label>
        <div className="flex overflow-hidden rounded-sm border border-kraft-osc/60 text-sm" role="group" aria-label="¿Sigue comprando?">
          {(["todos", "si", "no"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCompra(v)}
              aria-pressed={compra === v}
              className={`px-3 py-1 ${compra === v ? "bg-grafito text-hoja" : "hover:bg-carton"}`}
            >
              {v === "todos" ? "Todos" : v === "si" ? "Compran" : "Ya no compran"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setNuevo(true)}
          className="stencil ml-auto rounded-sm bg-tinta px-4 py-1.5 text-lg font-extrabold text-hoja shadow-[0_3px_0_#132760] active:translate-y-[2px] active:shadow-none"
        >
          + Cliente
        </button>
      </section>

      {/* -------------------------------- tabla -------------------------------- */}
      <div ref={tablaRef} className="hoja hidden overflow-hidden rounded-sm md:block">
        <table className="w-full table-fixed text-[15px]">
          <colgroup>
            <col className="w-[118px]" />
            <col />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="hidden w-[112px] lg:table-column" />
            <col className="w-[180px]" />
            <col className="hidden w-[130px] xl:table-column" />
            <col className="w-[92px]" />
          </colgroup>
          <thead className="sticky top-0 border-b-2 border-grafito bg-hoja text-left text-[11px] text-gris">
            <tr>
              <th className="w-[120px] px-3 py-2 font-medium uppercase tracking-[0.14em]">Clasif.</th>
              <Th k="cliente">Cliente</Th>
              <Th k="deuda" className="text-right">Deuda</Th>
              <Th k="dias">Sin pagar</Th>
              <Th k="pago" className="hidden lg:table-cell">Último pago</Th>
              <Th k="compra">Última compra</Th>
              <Th k="c30" className="hidden text-right xl:table-cell">Compró 30 d</Th>
              <th className="px-2 py-2 text-center font-medium uppercase tracking-[0.14em]">¿Compra?</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e, i) => {
              const c = e.cliente;
              const on = i === sel;
              const dias = e.diasSinPagar;
              const pct = dias === null ? 0 : Math.min(100, (dias / (cfg.dias_rojo * 2)) * 100);
              return (
                <tr
                  key={c.id}
                  data-fila={i}
                  onMouseEnter={() => setSel(i)}
                  className={`group cursor-pointer border-b border-linea transition-colors ${on ? "bg-resaltador/45" : i % 2 ? "bg-papel/30" : ""}`}
                  onClick={() => router.push(`/clientes/${c.id}`)}
                  style={{ boxShadow: `inset 5px 0 0 ${COLOR_SEMAFORO[e.semaforo].bg}` }}
                >
                  <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                    <StickerSemaforo
                      s={e.semaforo}
                      manual={e.manual}
                      compacto
                      onClick={() => ciclar(e)}
                      title={e.manual ? `Fijado a mano (automático diría ${e.semaforoCalc}). Clic para cambiar` : "Automático por días sin pagar. Clic para fijar a mano"}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/clientes/${c.id}`} className="block truncate" onClick={(ev) => ev.stopPropagation()}>
                      <b className="tracking-wide">{c.alias ?? c.nombre}</b>
                      {c.alias && <span className="ml-2 text-gris">{c.nombre}</span>}
                    </Link>
                    <span className="block truncate text-xs text-gris">{c.procedencia}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <span className={`cifra text-[17px] font-semibold ${e.saldo > 0 ? "text-fuji" : "text-pera"}`}>
                      {e.saldo > 0 ? clp(e.saldo) : e.saldo < 0 ? `${clp(-e.saldo)} a favor` : "al día"}
                    </span>
                    {e.sobreLimite && <span className="block text-[10px] font-bold uppercase tracking-wider text-fuji">sobre tope</span>}
                  </td>
                  <td className="px-2 py-2">
                    {dias !== null ? (
                      <div className="flex items-center gap-2">
                        <span className="cifra w-9 text-right text-sm">{dias} d</span>
                        <span className="relative h-2 w-20 overflow-hidden rounded-full bg-linea/60">
                          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: COLOR_SEMAFORO[e.semaforoCalc].bg }} />
                          <span className="absolute inset-y-0 w-px bg-grafito/30" style={{ left: `${(cfg.dias_amarillo / (cfg.dias_rojo * 2)) * 100}%` }} />
                          <span className="absolute inset-y-0 w-px bg-grafito/30" style={{ left: "50%" }} />
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gris/60">—</span>
                    )}
                  </td>
                  <td className="hidden px-2 py-2 text-sm lg:table-cell">
                    {e.ultimoPago ? (
                      <>
                        <span className="cifra">{ddmmaa(e.ultimoPago)}</span>
                      </>
                    ) : (
                      <span className="text-gris/60">nunca</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-sm">
                    {e.ultimaCompra ? (
                      <span className={e.compra ? "" : "text-gris"}>
                        <span className="cifra">{ddmmaa(e.ultimaCompra)}</span>
                        <span className="ml-1.5 text-xs text-gris">{haceDias(e.diasSinComprar)}</span>
                      </span>
                    ) : (
                      <span className="text-gris/60">—</span>
                    )}
                  </td>
                  <td className="hidden px-2 py-2 text-right xl:table-cell">
                    <span className="cifra text-sm text-tinta">{e.compras30 ? clp(e.compras30) : "—"}</span>
                  </td>
                  <td className="px-2 py-2 text-center" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        editarCliente(c.id, { compra_manual: c.compra_manual === null ? !e.compra : null }, "Cambio manual de ¿sigue comprando?")
                      }
                      title={c.compra_manual === null ? "Calculado por última compra. Clic para fijar" : "Fijado a mano. Clic para volver a automático"}
                      className={`cajon text-[11px] transition hover:-rotate-2 ${e.compra ? "text-pera" : "text-gris"} ${c.compra_manual !== null ? "border-dashed" : ""}`}
                    >
                      {e.compra ? "Sí" : "No"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="py-10 text-center font-mano text-2xl text-gris">Nadie con esos filtros.</p>}
        <p className="border-t border-linea px-4 py-2 text-xs text-gris">
          {lista.length} clientes · <Tecla>↑</Tecla>
          <Tecla>↓</Tecla> moverse · <Tecla>↵</Tecla> abrir cuenta · clic en la etiqueta para fijar la clasificación a mano (
          <span className="cifra">○</span> = manual)
        </p>
      </div>

      {/* ------------------------------- celular ------------------------------- */}
      <ul className="space-y-2 md:hidden">
        {lista.map((e) => (
          <li key={e.cliente.id}>
            <Link
              href={`/clientes/${e.cliente.id}`}
              className="hoja flex items-center gap-3 rounded-sm px-3 py-2.5"
              style={{ boxShadow: `inset 5px 0 0 ${COLOR_SEMAFORO[e.semaforo].bg}` }}
            >
              <div className="min-w-0 flex-1 pl-1">
                <p className="truncate font-semibold tracking-wide">{e.cliente.alias ?? e.cliente.nombre}</p>
                <p className="truncate text-xs text-gris">
                  {e.diasSinPagar !== null ? `${e.diasSinPagar} días sin pagar` : "al día"} · {e.compra ? "compra" : "ya no compra"}
                </p>
              </div>
              <span className={`cifra text-lg font-semibold ${e.saldo > 0 ? "text-fuji" : "text-pera"}`}>{e.saldo > 0 ? clp(e.saldo) : "al día"}</span>
            </Link>
          </li>
        ))}
      </ul>

      <NuevoCliente
        abierto={nuevo}
        nombreInicial=""
        onCerrar={() => setNuevo(false)}
        onCreado={(c) => {
          setNuevo(false);
          router.push(`/clientes/${c.id}`);
        }}
      />
    </div>
  );
}
