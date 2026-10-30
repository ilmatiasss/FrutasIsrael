"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Semaforo } from "@/lib/types";
import { editarCliente, useData } from "@/lib/store";
import type { EstadoCliente } from "@/lib/calc";
import { clp, haceDias, normalizar } from "@/lib/format";
import { useEstados } from "../clientes";
import { NuevoCliente } from "../NuevoCliente";
import { useAviso } from "../Shell";
import { COLOR_SEMAFORO, MontoGrande, Punto, StickerSemaforo } from "../ui";

import { Encabezado } from "../Encabezado";

const PASOS = [
  { titulo: "Busca", texto: "Escribe parte del nombre o apodo. También puedes filtrar por color." },
  { titulo: "Los colores", texto: "Verde: al día. Amarillo: atrasado (15+ días sin pagar). Rojo: moroso (30+ días)." },
  { titulo: "Abre la cuenta", texto: "Toca un cliente para ver todo su historial, cobrarle o agregarle deuda." },
  { titulo: "¿Sigue comprando?", texto: "Se calcula solo por su última compra. Tócalo si quieres marcarlo a mano." },
];

type Orden = "cliente" | "deuda" | "dias" | "pago" | "compra" | "c30";
const CICLO: (Semaforo | null)[] = [null, "VERDE", "AMARILLO", "ROJO"];

export function ListaClientes() {
  const data = useData()!;
  const estados = useEstados(data);
  const router = useRouter();
  const avisar = useAviso();

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
        const t = normalizar(`${e.cliente.alias ?? ""} ${e.cliente.nombre}`);
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

  const enLaCalle = todos.reduce((a, e) => a + Math.max(0, e.saldo), 0);
  const conDeudaN = todos.filter((e) => e.saldo > 0).length;

  const ciclar = (e: EstadoCliente) => {
    const i = CICLO.indexOf(e.cliente.semaforo_manual);
    const sig = CICLO[(i + 1) % CICLO.length];
    editarCliente(e.cliente.id, { semaforo_manual: sig }, `Clasificación ${sig ? `manual: ${sig}` : "vuelve a automática"}`);
    avisar({
      titulo: e.cliente.alias ?? e.cliente.nombre,
      detalle: sig ? `Estado fijado a mano: ${COLOR_SEMAFORO[sig].label}` : `Estado automático: ${COLOR_SEMAFORO[e.semaforoCalc].label}`,
      tono: "tinta",
    });
  };

  const Th = ({ k, children, className = "" }: { k: Orden; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2.5 font-medium ${className}`} aria-sort={orden.k === k ? (orden.asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => setOrden((o) => ({ k, asc: o.k === k ? !o.asc : k === "cliente" }))}
        className={`rotulo inline-flex items-center gap-1 hover:text-grafito ${orden.k === k ? "!text-grafito" : ""}`}
      >
        {children}
        <span className="text-[9px]">{orden.k === k ? (orden.asc ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <Encabezado href="/clientes" bajada={`${todos.length} clientes · ${conDeudaN} con deuda`} pasos={PASOS} />
      <section className="hoja flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <span className="font-bold text-gris">Fiado en la calle a la fecha</span>
        <span className="text-[32px] leading-none sm:text-[40px]">
          <MontoGrande valor={enLaCalle} />
        </span>
      </section>

      {/* filtros: una sola fila */}
      <section className="no-print flex flex-wrap items-center gap-2 border-y border-linea py-3">
        <input
          ref={buscarRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente"
          className="campo w-full font-sans text-base sm:w-64"
          aria-label="Buscar cliente"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["VERDE", "AMARILLO", "ROJO"] as Semaforo[]).map((sm) => (
            <button
              key={sm}
              type="button"
              aria-pressed={sem.has(sm)}
              onClick={() => {
                const n = new Set(sem);
                if (n.has(sm)) n.delete(sm);
                else n.add(sm);
                setSem(n);
              }}
              className="opcion py-1 text-sm"
            >
              <Punto s={sm} /> {COLOR_SEMAFORO[sm].label}
            </button>
          ))}
          <button type="button" aria-pressed={conDeuda} onClick={() => setConDeuda(!conDeuda)} className="opcion py-1 text-sm">
            Con deuda
          </button>
          <button
            type="button"
            aria-pressed={compra === "no"}
            onClick={() => setCompra(compra === "no" ? "todos" : "no")}
            className="opcion py-1 text-sm"
          >
            Ya no compran
          </button>
        </div>
        <button type="button" onClick={() => setNuevo(true)} className="btn btn-primario ml-auto py-1.5 text-sm">
          + Cliente
        </button>
      </section>

      {/* tabla (escritorio) */}
      <div ref={tablaRef} className="hoja hidden overflow-hidden rounded-lg lg:block">
        <table className="w-full table-fixed text-[15px]">
          <colgroup>
            <col />
            <col className="w-[150px]" />
            <col className="w-[160px]" />
            <col className="w-[130px]" />
            <col className="w-[190px]" />
            <col className="w-[110px]" />
          </colgroup>
          <thead className="border-b border-grafito/70 text-left">
            <tr>
              <Th k="cliente">Cliente</Th>
              <th className="rotulo px-3 py-2.5 text-left font-medium">Estado</th>
              <Th k="deuda" className="text-right">Deuda</Th>
              <Th k="dias" className="text-right">Sin pagar</Th>
              <Th k="compra">Última compra</Th>
              <th className="rotulo px-3 py-2.5 text-center font-medium">¿Compra?</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e, i) => {
              const c = e.cliente;
              return (
                <tr
                  key={c.id}
                  data-fila={i}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => router.push(`/clientes/${c.id}`)}
                  className={`cursor-pointer border-b border-linea last:border-0 ${i === sel ? "bg-carton/60" : ""}`}
                >
                  <td className="truncate px-3 py-2.5">
                    <Link href={`/clientes/${c.id}`} onClick={(ev) => ev.stopPropagation()} className="font-semibold">
                      {c.alias ?? c.nombre}
                    </Link>
                    {c.alias && <span className="ml-2 text-sm text-gris">{c.nombre}</span>}
                  </td>
                  <td className="px-3 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                    <StickerSemaforo
                      s={e.semaforo}
                      manual={e.manual}
                      onClick={() => ciclar(e)}
                      title={e.manual ? "Fijado a mano. Clic para cambiar" : "Calculado por días sin pagar. Clic para fijarlo a mano"}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`cifra ${e.saldo > 0 ? "text-fuji" : "text-gris"}`}>{e.saldo > 0 ? clp(e.saldo) : "—"}</span>
                    {e.sobreLimite && <span className="block text-[11px] text-fuji">sobre el tope</span>}
                  </td>
                  <td className="cifra px-3 py-2.5 text-right text-sm">{e.diasSinPagar !== null ? `${e.diasSinPagar} ${e.diasSinPagar === 1 ? "día" : "días"}` : <span className="text-gris">—</span>}</td>
                  <td className={`px-3 py-2.5 text-sm ${e.compra ? "" : "text-gris"}`}>{e.ultimaCompra ? haceDias(e.diasSinComprar) : "—"}</td>
                  <td className="px-3 py-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => editarCliente(c.id, { compra_manual: c.compra_manual === null ? !e.compra : null }, "Cambio manual de ¿sigue comprando?")}
                      title={c.compra_manual === null ? "Calculado por la última compra. Clic para fijar" : "Fijado a mano. Clic para volver a automático"}
                      className={`text-sm ${e.compra ? "text-grafito" : "text-gris"} ${c.compra_manual !== null ? "underline decoration-dotted underline-offset-4" : ""}`}
                    >
                      {e.compra ? "Sí" : "No"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="py-10 text-center text-gris">Nadie con esos filtros.</p>}
      </div>

      {/* tarjetas (celular y tablet) */}
      <ul className="grid gap-2 sm:grid-cols-2 lg:hidden">
        {lista.map((e) => (
          <li key={e.cliente.id}>
            <Link href={`/clientes/${e.cliente.id}`} className="hoja flex items-center gap-3 rounded-lg px-4 py-3">
              <Punto s={e.semaforo} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.cliente.alias ?? e.cliente.nombre}</p>
                <p className="truncate text-xs text-gris">
                  {e.diasSinPagar !== null ? `${e.diasSinPagar} días sin pagar` : "al día"}
                  {!e.compra && " · ya no compra"}
                </p>
              </div>
              <span className={`cifra ${e.saldo > 0 ? "text-fuji" : "text-gris"}`}>{e.saldo > 0 ? clp(e.saldo) : "—"}</span>
            </Link>
          </li>
        ))}
        {lista.length === 0 && <li className="py-10 text-center text-gris">Nadie con esos filtros.</li>}
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
