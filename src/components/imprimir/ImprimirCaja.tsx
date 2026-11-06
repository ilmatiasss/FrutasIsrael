"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Arqueo, Db, Movimiento, TipoMovimiento } from "@/lib/types";
import { useData } from "@/lib/store";
import { matrizCaja, resumenCaja, saldosAl, vivo, type Indice } from "@/lib/calc";
import { Logo } from "../Iconos";
import { clp, ddmmaa, fechaCorta, fechaLarga, hora, hoy, lunesDe, semanaISO, sumarDias } from "@/lib/format";

/* Hojas para imprimir o guardar como PDF: el cierre diario por partes,
   el cierre diario completo en UNA hoja, y el cierre semanal de deudas. */

export const MODULOS = {
  resumen: "Totales del día",
  efectivo: "Efectivo en caja y formas de pago",
  ventas: "Vales venta",
  creditos: "Vales crédito",
  abonos: "Abonos",
  gastos: "Ingresos y egresos de caja",
  envases: "Envases (garantías)",
} as const;
export type Modulo = keyof typeof MODULOS;

const TIPOS: Record<Exclude<Modulo, "resumen" | "efectivo">, TipoMovimiento[]> = {
  ventas: ["VALE_VENTA"],
  creditos: ["VALE_CREDITO"],
  abonos: ["ABONO"],
  gastos: ["INGRESO", "EGRESO"],
  envases: ["ENVASE_COBRO", "ENVASE_DEVOLUCION"],
};

function datos(db: Db, idx: Indice, fecha: string) {
  const movs = idx.movsFecha.get(fecha) ?? [];
  const r = resumenCaja(movs);
  const etiqueta: Record<TipoMovimiento, string> = {
    VALE_VENTA: "Ventas", VALE_CREDITO: "Créditos y combinados", ABONO: "Abonos de deuda", INGRESO: "Ingresos", EGRESO: "Egresos",
    ENVASE_COBRO: "Garantía envases", ENVASE_DEVOLUCION: "Devol. envases",
  };
  const matriz = matrizCaja(movs).map((x) => ({ ...x, label: etiqueta[x.tipo], t: x.tipo }));
  const cierre = [...db.cierres].reverse().find((c) => c.fecha === fecha) ?? null;
  const sueldos = db.pagos_sueldo
    .filter((p) => p.fecha === fecha)
    .map((p) => ({ p, t: db.trabajadores.find((x) => x.id === p.trabajador_id) }));
  return { movs, r, matriz, cierre, sueldos };
}

/* ------------------------------ piezas de la hoja ------------------------------ */

export function Cabecera({ titulo, sub, db }: { titulo: string; sub: string; db: Db }) {
  return (
    <header className="mb-3 flex items-end justify-between gap-3 border-b-2 border-grafito pb-2">
      <Logo size={44} />
      <div className="flex-1">
        <p className="text-[10pt] font-semibold text-gris">
          {db.tenant.nombre} · {db.tenant.ubicacion}
        </p>
        <h1 className="stencil text-[18pt] leading-tight">{titulo}</h1>
        <p className="text-[10pt] first-letter:uppercase">{sub}</p>
      </div>
      <p className="text-right text-[8pt] text-gris">
        Impreso {ddmmaa(hoy())} {hora(new Date().toISOString())}
        <br />
        por {db.config.usuario_actual}
      </p>
    </header>
  );
}

function Bloque({ titulo, total, children }: { titulo: string; total?: number; children: ReactNode }) {
  return (
    <section className="mb-3 break-inside-avoid">
      <h2 className="mb-1 flex items-baseline justify-between border-b border-grafito/60 text-[10.5pt] font-semibold">
        <span>{titulo}</span>
        {total !== undefined && <span className="cifra">{clp(total)}</span>}
      </h2>
      {children}
    </section>
  );
}

function Totales({ r }: { r: ReturnType<typeof resumenCaja> }) {
  const items = [
    ["Vales venta", r.vale_venta],
    ["Vales crédito", r.vale_credito],
    ["Abonos", r.abonos],
    ["Ingresos", r.ingresos],
    ["Egresos", r.egresos],
    ["Garantía de envases cobrada", r.envases_cobro ?? 0],
    ["Garantía de envases devuelta", r.envases_devolucion ?? 0],
  ] as const;
  return (
    <table className="w-full text-[10pt]">
      <tbody>
        {items.map(([l, v]) => (
          <tr key={l} className="border-b border-linea">
            <td className="py-0.5">{l}</td>
            <td className="cifra py-0.5 text-right font-semibold">{clp(v)}</td>
          </tr>
        ))}
        <tr>
          <td className="pt-1 font-semibold">Debe haber en caja (efectivo)</td>
          <td className="cifra pt-1 text-right font-semibold">
            <span className="doble-raya">{clp(r.efectivo_esperado)}</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Efectivo({ d }: { d: ReturnType<typeof datos> }) {
  const { r, matriz } = d;
  const linea = (s: string, l: string, v: number) => (
    <tr className="border-b border-linea">
      <td className="w-4 py-0.5 text-gris">{s}</td>
      <td className="py-0.5">{l}</td>
      <td className="cifra py-0.5 text-right">{clp(v)}</td>
    </tr>
  );
  return (
    <>
      <table className="w-full text-[10pt]">
        <tbody>
          {linea("+", "Ventas en efectivo", matriz[0].ef + matriz[1].ef)}
          {linea("+", "Abonos en efectivo", matriz[2].ef)}
          {linea("+", "Ingresos en efectivo", matriz[3].ef)}
          {matriz[5].ef > 0 && linea("+", "Garantía de envases", matriz[5].ef)}
          {linea("−", "Egresos en efectivo", r.egresos_efectivo)}
          {(r.devolucion_efectivo ?? 0) > 0 && linea("−", "Devolución de envases", r.devolucion_efectivo ?? 0)}
          <tr>
            <td />
            <td className="pt-1 font-semibold">Debe haber en caja</td>
            <td className="cifra pt-1 text-right font-semibold">
              <span className="doble-raya">{clp(r.efectivo_esperado)}</span>
            </td>
          </tr>
          <tr>
            <td />
            <td className="pt-1 text-gris">Crédito dado hoy (fiado, no entra a la caja)</td>
            <td className="cifra pt-1 text-right">{clp(r.vale_credito - (r.pagado_en_vale ?? 0))}</td>
          </tr>
        </tbody>
      </table>
      <ArqueoHoja arqueo={d.cierre?.snapshot.arqueo ?? null} esperado={r.efectivo_esperado} />
      <table className="mt-2 w-full text-[9.5pt]">
        <thead>
          <tr className="border-b border-grafito/60 text-left">
            <th className="py-0.5 font-semibold">Por forma de pago</th>
            <th className="text-right font-semibold">Efectivo</th>
            <th className="text-right font-semibold">Transf.</th>
            <th className="text-right font-semibold">Tarjeta</th>
            <th className="text-right font-semibold">Crédito</th>
          </tr>
        </thead>
        <tbody>
          {matriz.map((x) => (
            <tr key={x.label} className="border-b border-linea">
              <td className="py-0.5">{x.label}</td>
              <td className="cifra text-right">{x.ef ? clp(x.ef) : "·"}</td>
              <td className="cifra text-right">{x.tr ? clp(x.tr) : "·"}</td>
              <td className="cifra text-right">{x.tj ? clp(x.tj) : "·"}</td>
              <td className="cifra text-right">{x.cr ? clp(x.cr) : "·"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Remuneraciones del día en la hoja impresa */
function TablaSueldos({ sueldos }: { sueldos: ReturnType<typeof datos>["sueldos"] }) {
  if (!sueldos.length) return <p className="text-[9pt] text-gris">Sin remuneraciones.</p>;
  const total = sueldos.filter(({ p }) => !p.anulado_at && (p.tipo === "PAGO" || p.tipo === "ADELANTO")).reduce((a, { p }) => a + p.monto, 0);
  return (
    <table className="w-full text-[9pt]">
      <tbody>
        {sueldos.map(({ p, t }) => (
          <tr key={p.id} className={`border-b border-linea ${p.anulado_at ? "text-gris line-through" : ""}`}>
            <td className="py-px pr-1">{t?.nombre ?? "—"}</td>
            <td className="pr-1">{p.tipo === "PAGO" ? "Pago" : p.tipo === "ADELANTO" ? "Anticipo" : p.tipo === "BONO" ? "Bono" : "Descuento"}</td>
            <td className="pr-1">{p.movimiento_id ? "Cajón" : p.forma === "EFECTIVO" ? "Efectivo" : "Transf."}</td>
            <td className="cifra text-right">
              {p.tipo === "DESCUENTO" ? "−" : ""}
              {clp(p.monto)}
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={3} className="pt-1 font-semibold">Total pagado</td>
          <td className="cifra pt-1 text-right font-semibold">{clp(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

const DENOMINACIONES = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 10];

/** Arqueo de billetes: el guardado al cerrar, o en blanco para contar a mano */
function ArqueoHoja({ arqueo, esperado }: { arqueo: Arqueo | null; esperado: number }) {
  return (
    <table className="mt-2 w-full text-[9pt]">
      <thead>
        <tr className="border-b border-grafito/60 text-left">
          <th className="py-0.5 font-semibold">Arqueo</th>
          {DENOMINACIONES.map((d) => (
            <th key={d} className="text-right font-semibold">
              {d >= 1000 ? `${d / 1000} mil` : `$${d}`}
            </th>
          ))}
          <th className="text-right font-semibold">Contado</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-linea">
          <td className="py-1 text-gris">Cantidad</td>
          {DENOMINACIONES.map((d) => (
            <td key={d} className="cifra text-right">
              {arqueo ? (arqueo.cantidades[d] ?? "·") : "____"}
            </td>
          ))}
          <td className="cifra text-right font-semibold">{arqueo ? clp(arqueo.contado) : "________"}</td>
        </tr>
        <tr>
          <td className="pt-1 text-gris" colSpan={DENOMINACIONES.length}>
            Debe haber {clp(esperado)}
          </td>
          <td className="cifra pt-1 text-right font-semibold">
            {arqueo ? (arqueo.diferencia === 0 ? "Cuadra" : `${arqueo.diferencia > 0 ? "Sobra" : "Falta"} ${clp(Math.abs(arqueo.diferencia))}`) : "Dif.: ______"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Detalle({ movs, idx, compacto = false }: { movs: Movimiento[]; idx: Indice; compacto?: boolean }) {
  if (!movs.length) return <p className="text-[9pt] text-gris">Sin movimientos.</p>;
  return (
    <table className={`w-full ${compacto ? "text-[8.5pt]" : "text-[10pt]"}`}>
      <thead>
        <tr className="text-left text-gris">
          <th className="font-semibold">N°</th>
          {!compacto && <th className="font-semibold">Hora</th>}
          <th className="font-semibold">Cliente / detalle</th>
          <th className="font-semibold">Forma</th>
          <th className="text-right font-semibold">Monto</th>
        </tr>
      </thead>
      <tbody>
        {movs.map((m) => {
          const c = m.cliente_id ? idx.cliente.get(m.cliente_id) : null;
          const anulado = !vivo(m);
          return (
            <tr key={m.id} className={`border-b border-linea ${anulado ? "text-gris line-through" : ""}`}>
              <td className="cifra py-px pr-1">{m.numero}</td>
              {!compacto && <td className="cifra pr-1">{hora(m.created_at)}</td>}
              <td className="max-w-0 truncate pr-1">
                {m.tipo === "ENVASE_COBRO" ? "Entrega · " : m.tipo === "ENVASE_DEVOLUCION" ? "Devolución · " : ""}
                {c ? (c.alias ?? c.nombre) : m.glosa}
                {anulado && " (anulado)"}
              </td>
              <td className="pr-1">
                {m.forma_pago === "TRANSFERENCIA" ? "Transf." : m.forma_pago === "TARJETA" ? "Tarjeta" : m.forma_pago === "CREDITO" ? (m.tipo === "ENVASE_DEVOLUCION" ? "A deuda" : "Crédito") : "Efectivo"}
              </td>
              <td className="cifra text-right">
                {m.tipo === "ENVASE_DEVOLUCION" || m.tipo === "EGRESO" ? "−" : ""}
                {clp(m.total)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------ la página ------------------------------ */

export function useImprimirAlCargar(listo: boolean) {
  const hecho = useRef(false);
  useEffect(() => {
    if (!listo || hecho.current) return;
    hecho.current = true;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [listo]);
}

/** Ajusta el contenido para que quepa en una sola hoja A4 */
function useCaberEnUnaHoja(ref: React.RefObject<HTMLDivElement | null>, activo: boolean, dep: unknown) {
  const [escala, setEscala] = useState(1);
  useLayoutEffect(() => {
    if (!activo || !ref.current) return;
    const alto = ref.current.scrollHeight;
    const disponible = 1035; // A4 a 96 dpi menos márgenes de 10 mm
    setEscala(alto > disponible ? Math.max(0.45, disponible / alto) : 1);
  }, [activo, ref, dep]);
  return escala;
}

export function ImprimirCaja() {
  const data = useData()!;
  const params = useSearchParams();
  const vista = params.get("vista") ?? "dia"; // dia | semana
  const modulo = (params.get("modulo") ?? "todo") as Modulo | "todo";
  const fecha = params.get("fecha") ?? hoy();
  const auto = params.get("auto") !== "0";
  const cont = useRef<HTMLDivElement>(null);
  const unaHoja = vista === "dia" && modulo === "todo";
  const d = useMemo(() => datos(data.db, data.idx, fecha), [data, fecha]);
  const escala = useCaberEnUnaHoja(cont, unaHoja, d);
  useImprimirAlCargar(auto);

  const lista = (m: Exclude<Modulo, "resumen" | "efectivo">) => d.movs.filter((x) => TIPOS[m].includes(x.tipo));
  const total = (m: Exclude<Modulo, "resumen" | "efectivo">) => lista(m).filter(vivo).reduce((a, x) => a + x.total, 0);

  let contenido: ReactNode;
  if (vista === "semana") {
    const lunes = params.get("lunes") ?? lunesDe(hoy());
    const domingo = sumarDias(lunes, 6);
    const cierre = [...data.db.cierres_semana].reverse().find((c) => c.lunes === lunes);
    const filas = cierre ? cierre.saldos : saldosAl(data.db.movimientos, domingo);
    const tot = filas.reduce((a, f) => a + f.saldo, 0);
    contenido = (
      <>
        <Cabecera db={data.db} titulo={`Cierre semanal · Semana N°${semanaISO(lunes).semana}`} sub={`${fechaCorta(lunes)} a ${fechaCorta(domingo)} · con cuánta deuda quedó cada cliente`} />
        <table className="w-full text-[10.5pt]">
          <tbody>
            {filas.map((f, i) => {
              const c = data.idx.cliente.get(f.cliente_id);
              return (
                <tr key={f.cliente_id} className="border-b border-linea">
                  <td className="w-8 py-0.5 text-gris">{i + 1}</td>
                  <td className="py-0.5">{c ? (c.alias ?? c.nombre) : "—"}</td>
                  <td className="cifra py-0.5 text-right">{clp(f.saldo)}</td>
                </tr>
              );
            })}
            <tr>
              <td />
              <td className="pt-2 font-semibold">Total ({filas.length} clientes)</td>
              <td className="cifra pt-2 text-right font-semibold">
                <span className="doble-raya">{clp(tot)}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[9pt] text-gris">{cierre ? `Semana cerrada por ${cierre.cerrado_por} el ${ddmmaa(cierre.cerrado_at.slice(0, 10))}.` : "Semana sin cerrar: montos a la fecha de impresión."}</p>
      </>
    );
  } else if (modulo === "todo") {
    contenido = (
      <>
        <Cabecera db={data.db} titulo="Cierre de caja" sub={fechaLarga(fecha)} />
        <div className="grid gap-x-6 sm:grid-cols-2">
          <Bloque titulo="Totales del día">
            <Totales r={d.r} />
          </Bloque>
          <Bloque titulo="Efectivo en caja">
            <Efectivo d={d} />
          </Bloque>
        </div>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {(["ventas", "creditos", "abonos", "gastos", "envases"] as const).map((m) => (
            <Bloque key={m} titulo={MODULOS[m]} total={m === "gastos" || m === "envases" ? undefined : total(m)}>
              <Detalle movs={lista(m)} idx={data.idx} compacto />
            </Bloque>
          ))}
          {d.sueldos.length > 0 && (
            <Bloque titulo="Remuneraciones">
              <TablaSueldos sueldos={d.sueldos} />
            </Bloque>
          )}
        </div>
        <Firmas cierre={d.cierre} />
      </>
    );
  } else {
    contenido = (
      <>
        <Cabecera db={data.db} titulo={`Cierre de caja · ${MODULOS[modulo]}`} sub={fechaLarga(fecha)} />
        {modulo === "resumen" && <Totales r={d.r} />}
        {modulo === "efectivo" && <Efectivo d={d} />}
        {modulo !== "resumen" && modulo !== "efectivo" && (
          <Bloque titulo={MODULOS[modulo]} total={modulo === "gastos" || modulo === "envases" ? undefined : total(modulo)}>
            <Detalle movs={lista(modulo)} idx={data.idx} />
          </Bloque>
        )}
        {modulo === "gastos" && d.sueldos.length > 0 && (
          <Bloque titulo="Remuneraciones">
            <TablaSueldos sueldos={d.sueldos} />
          </Bloque>
        )}
        {(modulo === "resumen" || modulo === "efectivo") && <Firmas cierre={d.cierre} />}
      </>
    );
  }

  return (
    <div className="imprimible">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
        <Link href={vista === "semana" ? "/caja?vista=semanal" : "/caja"} className="btn btn-secundario">
          ← Volver
        </Link>
        <span className="flex-1 text-sm text-gris">Para descargar, elige «Guardar como PDF» en la ventana de impresión.</span>
        <button type="button" onClick={() => window.print()} className="btn btn-primario">
          Imprimir o guardar PDF
        </button>
      </div>
      <div className="hoja-a4 mx-auto bg-white shadow-lg">
        <div ref={cont} style={unaHoja && escala < 1 ? { zoom: escala } : undefined}>
          {contenido}
        </div>
      </div>
    </div>
  );
}

function Firmas({ cierre }: { cierre: { cerrado_por: string; cerrado_at: string } | null }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-10 text-[9pt] text-gris">
      <p className="border-t border-grafito/60 pt-1">Firma cajero{cierre ? ` (cerró ${cierre.cerrado_por} a las ${hora(cierre.cerrado_at)})` : ""}</p>
      <p className="border-t border-grafito/60 pt-1">Firma encargado</p>
    </div>
  );
}
