"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Modalidad, PagoSueldo, Trabajador } from "@/lib/types";
import { anularPagoSueldo, guardarTrabajador, marcarDia, registrarPagoSueldo, useData } from "@/lib/store";
import { cuentaTrabajador, MODALIDAD, periodoMes, periodoSemana, TIPO_PAGO, type CuentaTrabajador } from "@/lib/sueldos";
import { clp, ddmm, fechaCorta, hoy, lunesDe, miles, parseMonto, semanaISO, sumarDias } from "@/lib/format";
import { Encabezado } from "../Encabezado";
import { useAviso } from "../Shell";
import { Modal } from "../ui";

const PASOS = [
  { titulo: "Personal", texto: "Con «+ Trabajador» registre nombre, cargo y modalidad de pago (diaria, semanal o mensual)." },
  { titulo: "Asistencia", texto: "Para pago diario, marque los días trabajados. El monto se calcula automáticamente." },
  { titulo: "Anticipos y pagos", texto: "Registre anticipos y pagos. Los pagos en efectivo desde caja se reflejan como egreso en el cierre." },
  { titulo: "Saldo", texto: "Cada ficha indica el monto devengado, lo pagado y el saldo por pagar." },
];

const DIAS_CORTOS = ["L", "M", "M", "J", "V", "S", "D"];
const CARGOS = ["Cargador", "Carretillero", "Caja", "Vendedor", "Chofer", "Administración"];

function iniciales(n: string) {
  return n
    .replace(/[«»"]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Sueldos() {
  const data = useData()!;
  const [lunes, setLunes] = useState(lunesDe(hoy()));
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Trabajador | "nuevo" | null>(null);
  const [pagando, setPagando] = useState<{ c: CuentaTrabajador; tipo: PagoSueldo["tipo"] } | null>(null);
  const lunesHoy = lunesDe(hoy());
  const semana = periodoSemana(lunes);
  const mes = periodoMes(lunes);

  const cuentas = useMemo(
    () =>
      data.db.trabajadores
        .filter((t) => t.activo || verInactivos)
        .map((t) => cuentaTrabajador(data.db, t, t.modalidad === "MES" ? mes : semana)),
    [data, semana, mes, verInactivos],
  );
  const semanales = cuentas.filter((c) => c.t.modalidad !== "MES");
  const mensuales = cuentas.filter((c) => c.t.modalidad === "MES");
  const sum = (xs: CuentaTrabajador[], k: "corresponde" | "pagado" | "falta") => xs.reduce((a, c) => a + c[k], 0);

  return (
    <div>
      <Encabezado
        href="/sueldos"
        bajada="Asistencia, anticipos, bonos, descuentos y pagos del personal."
        pasos={PASOS}
        derecha={
          <button type="button" onClick={() => setEditando("nuevo")} className="btn btn-primario">
            + Trabajador
          </button>
        }
      />

      {/* semana */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setLunes(sumarDias(lunes, -7))} className="btn btn-secundario px-3 py-1.5" aria-label="Semana anterior">
          ←
        </button>
        <p className="px-1 font-semibold">
          Semana N°{semanaISO(lunes).semana}{" "}
          <span className="font-semibold text-gris">
            <span className="sm:hidden">· {ddmm(lunes)} al {ddmm(semana.hasta)}</span>
            <span className="hidden sm:inline">· {fechaCorta(lunes)} a {fechaCorta(semana.hasta)}</span>
          </span>
        </p>
        <button
          type="button"
          onClick={() => lunes < lunesHoy && setLunes(sumarDias(lunes, 7))}
          disabled={lunes >= lunesHoy}
          className="btn btn-secundario px-3 py-1.5 disabled:opacity-30"
          aria-label="Semana siguiente"
        >
          →
        </button>
        {lunes !== lunesHoy && (
          <button type="button" onClick={() => setLunes(lunesHoy)} className="text-sm font-semibold text-tinta underline underline-offset-4">
            esta semana
          </button>
        )}
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-sm font-semibold text-gris">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="size-4 accent-[#2f7d45]" />
          Ver inactivos
        </label>
        <button type="button" onClick={() => window.print()} className="btn btn-secundario py-1.5 text-sm">
          Imprimir
        </button>
      </div>

      {data.db.trabajadores.length === 0 ? (
        <div className="hoja p-10 text-center">
          <p className="stencil text-xl">Sin personal registrado</p>
          <p className="mt-2 text-gris">Agrega al primero con el botón «+ Trabajador».</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Grupo
            titulo="Pago semanal y diario"
            nota={`Semana del ${ddmm(semana.desde)} al ${ddmm(semana.hasta)}`}
            cuentas={semanales}
            totales={{ corresponde: sum(semanales, "corresponde"), pagado: sum(semanales, "pagado"), falta: sum(semanales, "falta") }}
            onPagar={(c, tipo) => setPagando({ c, tipo })}
            onEditar={(t) => setEditando(t)}
          />
          <Grupo
            titulo="Pago mensual"
            nota={`Mes de ${mes.nombre}`}
            cuentas={mensuales}
            totales={{ corresponde: sum(mensuales, "corresponde"), pagado: sum(mensuales, "pagado"), falta: sum(mensuales, "falta") }}
            onPagar={(c, tipo) => setPagando({ c, tipo })}
            onEditar={(t) => setEditando(t)}
          />
        </div>
      )}

      <EditarTrabajador t={editando} onCerrar={() => setEditando(null)} />
      <RegistrarPago p={pagando} onCerrar={() => setPagando(null)} />
    </div>
  );
}

function Grupo({
  titulo,
  nota,
  cuentas,
  totales,
  onPagar,
  onEditar,
}: {
  titulo: string;
  nota: string;
  cuentas: CuentaTrabajador[];
  totales: { corresponde: number; pagado: number; falta: number };
  onPagar: (c: CuentaTrabajador, tipo: PagoSueldo["tipo"]) => void;
  onEditar: (t: Trabajador) => void;
}) {
  if (!cuentas.length) return null;
  return (
    <section>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="stencil text-lg">{titulo}</h2>
          <p className="text-sm text-gris first-letter:uppercase">{nota}</p>
        </div>
        <p className="text-sm text-gris">
          Corresponde <b className="cifra text-grafito">{clp(totales.corresponde)}</b> · pagado <b className="cifra text-grafito">{clp(totales.pagado)}</b> ·{" "}
          {totales.falta > 0 ? (
            <>
              falta <b className="cifra text-fuji">{clp(totales.falta)}</b>
            </>
          ) : (
            <b className="text-tinta">todo pagado</b>
          )}
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {cuentas.map((c) => (
          <Tarjeta key={c.t.id} c={c} onPagar={onPagar} onEditar={onEditar} />
        ))}
      </div>
    </section>
  );
}

function Tarjeta({ c, onPagar, onEditar }: { c: CuentaTrabajador; onPagar: (c: CuentaTrabajador, tipo: PagoSueldo["tipo"]) => void; onEditar: (t: Trabajador) => void }) {
  const [verPagos, setVerPagos] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const avisar = useAviso();
  const t = c.t;
  const h = hoy();
  const pct = c.corresponde > 0 ? Math.min(100, (c.pagado / c.corresponde) * 100) : c.pagado > 0 ? 100 : 0;

  return (
    <article className={`hoja p-4 sm:p-5 ${t.activo ? "" : "opacity-60"}`}>
      <header className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-verde-suave text-base font-semibold text-tinta">{iniciales(t.nombre)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{t.nombre}</p>
          <p className="text-sm text-gris">
            {t.cargo} · <span className="cifra">{clp(t.monto)}</span> {MODALIDAD[t.modalidad].por}
            {!t.activo && " · inactivo"}
          </p>
        </div>
        <button type="button" onClick={() => onEditar(t)} className="no-print text-sm font-semibold text-tinta underline underline-offset-4">
          Editar
        </button>
      </header>

      {/* días trabajados */}
      {t.modalidad === "DIA" && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-semibold text-gris">Asistencia de la semana</p>
          <div className="grid grid-cols-7 gap-1.5">
            {DIAS_CORTOS.map((d, i) => {
              const f = sumarDias(c.periodo.desde, i);
              const on = c.dias.includes(f);
              const futuro = f > h;
              return (
                <button
                  key={f}
                  type="button"
                  disabled={futuro}
                  aria-pressed={on}
                  onClick={() => marcarDia(t.id, f, !on)}
                  className={`flex flex-col items-center rounded-md border py-1.5 text-sm font-semibold transition disabled:opacity-30 ${on ? "border-tinta bg-tinta text-white" : "border-kraft bg-hoja text-gris hover:border-tinta"}`}
                  title={on ? "Trabajó (toca para quitar)" : "No trabajó (toca para marcar)"}
                >
                  {d}
                  <span className={`text-[11px] font-semibold ${on ? "text-white/80" : ""}`}>{ddmm(f).slice(0, 2)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* la cuenta */}
      <dl className="mt-4 space-y-1 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-gris">{t.modalidad === "DIA" ? `${c.dias.length} ${c.dias.length === 1 ? "día" : "días"} × ${clp(t.monto)}` : t.modalidad === "SEMANA" ? "Sueldo de la semana" : "Sueldo del mes"}</dt>
          <dd className="cifra font-semibold">{clp(c.base)}</dd>
        </div>
        {c.bonos > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-gris">+ Bonos</dt>
            <dd className="cifra font-semibold">{clp(c.bonos)}</dd>
          </div>
        )}
        {c.descuentos > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-gris">− Descuentos</dt>
            <dd className="cifra font-semibold">−{clp(c.descuentos)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 border-t border-linea pt-1">
          <dt className="font-semibold">Devengado</dt>
          <dd className="cifra font-semibold">{clp(c.corresponde)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gris">Pagado{c.adelantos > 0 ? ` (incluye ${clp(c.adelantos)} en anticipos)` : ""}</dt>
          <dd className="cifra font-semibold">{clp(c.pagado)}</dd>
        </div>
      </dl>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-linea">
        <div className="h-full rounded-full bg-tinta transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 flex items-baseline justify-between gap-3">
        {c.falta > 0 ? (
          <>
            <span className="font-semibold">Saldo por pagar</span>
            <span className="cifra text-2xl font-semibold text-fuji">{clp(c.falta)}</span>
          </>
        ) : c.falta < 0 ? (
          <>
            <span className="font-semibold text-limon">Se le pagó de más</span>
            <span className="cifra text-2xl font-semibold text-limon">{clp(-c.falta)}</span>
          </>
        ) : (
          <span className="font-semibold text-tinta">Pagado</span>
        )}
      </p>

      <div className="no-print mt-4 flex flex-wrap gap-2">
        {c.falta > 0 && (
          <button type="button" onClick={() => onPagar(c, "PAGO")} className="btn btn-primario flex-1 whitespace-nowrap sm:flex-none">
            Pagar {clp(c.falta)}
          </button>
        )}
        <button type="button" onClick={() => onPagar(c, "ADELANTO")} className="btn btn-secundario flex-1 sm:flex-none">
          Anticipo
        </button>
        <button type="button" onClick={() => onPagar(c, "BONO")} className="btn btn-secundario">
          Bono / descuento
        </button>
      </div>

      {c.pagos.length > 0 && (
        <div className="mt-3 border-t border-linea pt-2">
          <button type="button" onClick={() => setVerPagos((v) => !v)} className="no-print text-sm font-semibold text-tinta" aria-expanded={verPagos}>
            {verPagos ? "▾" : "▸"} Movimientos de este período ({c.pagos.length})
          </button>
          {verPagos && (
            <ul className="mt-2 space-y-1 text-sm">
              {c.pagos.map((p) => (
                <li key={p.id} className={`rounded-lg px-2 py-1.5 ${p.anulado_at ? "text-gris line-through" : "bg-carton/50"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      <b>{TIPO_PAGO[p.tipo].label}</b> · {ddmm(p.fecha)} · {p.forma === "EFECTIVO" ? "efectivo" : "transferencia"}
                      {p.movimiento_id && " · salió del cajón"}
                      {p.nota && <span className="text-gris"> · {p.nota}</span>}
                    </span>
                    <span className="cifra font-semibold">
                      {p.tipo === "DESCUENTO" ? "−" : ""}
                      {clp(p.monto)}
                    </span>
                  </div>
                  {p.anulado_at ? (
                    <span className="text-xs no-underline">Anulado: {p.motivo_anulacion}</span>
                  ) : anulando === p.id ? (
                    <form
                      className="mt-1 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (motivo.trim().length < 3) return;
                        anularPagoSueldo(p.id, motivo.trim());
                        setAnulando(null);
                        setMotivo("");
                        avisar({ titulo: "Pago anulado", detalle: "Queda registrado en la bitácora.", tono: "rojo" });
                      }}
                    >
                      <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué se anula?" className="campo py-1 text-sm" />
                      <button type="submit" className="btn btn-peligro py-1 text-sm">
                        Anular
                      </button>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setAnulando(p.id)} className="no-print text-xs font-semibold text-fuji">
                      anular
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------------ registrar pago ------------------------------ */

function RegistrarPago({ p, onCerrar }: { p: { c: CuentaTrabajador; tipo: PagoSueldo["tipo"] } | null; onCerrar: () => void }) {
  const avisar = useAviso();
  const [tipo, setTipo] = useState<PagoSueldo["tipo"]>("PAGO");
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [desdeCaja, setDesdeCaja] = useState(true);
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!p) return;
    setTipo(p.tipo);
    setMonto(p.tipo === "PAGO" && p.c.falta > 0 ? miles(p.c.falta) : "");
    setForma("EFECTIVO");
    setDesdeCaja(true);
    const h = hoy();
    setFecha(h >= p.c.periodo.desde && h <= p.c.periodo.hasta ? h : p.c.periodo.hasta);
    setNota("");
    setTimeout(() => ref.current?.select(), 40);
  }, [p]);

  if (!p) return null;
  const m = parseMonto(monto) ?? 0;
  const despues = p.c.falta + (tipo === "BONO" ? m : tipo === "DESCUENTO" ? -m : -m);
  const mueveCaja = forma === "EFECTIVO" && (tipo === "PAGO" || tipo === "ADELANTO");

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (m <= 0) return;
    registrarPagoSueldo({ trabajador_id: p.c.t.id, fecha, tipo, monto: m, forma, nota: nota.trim() || null, desdeCaja: mueveCaja && desdeCaja });
    avisar({ titulo: `${TIPO_PAGO[tipo].label} registrado`, detalle: `${p.c.t.nombre} · ${clp(m)}`, tono: "ok" });
    onCerrar();
  };

  return (
    <Modal abierto onCerrar={onCerrar} etiqueta="Registrar pago de sueldo">
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <p className="stencil text-2xl">{p.c.t.nombre}</p>
          <p className="text-sm text-gris">
            Le corresponde {clp(p.c.corresponde)} · pagado {clp(p.c.pagado)} · falta <b className="text-grafito">{clp(Math.max(0, p.c.falta))}</b>
          </p>
        </div>
        <div>
          <span className="rotulo">¿Qué es?</span>
          <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup">
            {(Object.keys(TIPO_PAGO) as PagoSueldo["tipo"][]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={tipo === k} onClick={() => setTipo(k)} className="opcion py-1.5 text-sm">
                {TIPO_PAGO[k].label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-gris">{TIPO_PAGO[tipo].ayuda}.</p>
        </div>
        <label className="block">
          <span className="rotulo">Monto</span>
          <input ref={ref} value={monto} onChange={(e) => setMonto(e.target.value)} onBlur={() => m && setMonto(miles(m))} inputMode="numeric" placeholder="$" className="campo text-right text-2xl font-semibold" />
        </label>
        {tipo !== "BONO" && tipo !== "DESCUENTO" && (
          <div>
            <span className="rotulo">¿Cómo se le paga?</span>
            <div className="mt-1.5 flex gap-2">
              {(["EFECTIVO", "TRANSFERENCIA"] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={forma === f} onClick={() => setForma(f)} className="opcion py-1.5 text-sm">
                  {f === "EFECTIVO" ? "Efectivo" : "Transferencia"}
                </button>
              ))}
            </div>
            {mueveCaja && (
              <label className="mt-2 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={desdeCaja} onChange={(e) => setDesdeCaja(e.target.checked)} className="mt-0.5 size-4 accent-[#2f7d45]" />
                <span>
                  <b>Sale del cajón de hoy</b>
                  <span className="block text-gris">Se anota como egreso en el cierre de caja, para que la plata cuadre.</span>
                </span>
              </label>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="rotulo">Fecha</span>
            <input type="date" value={fecha} max={hoy()} onChange={(e) => e.target.value && setFecha(e.target.value)} className="campo" />
          </label>
          <label className="block">
            <span className="rotulo">Nota (opcional)</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej: quincena" className="campo" />
          </label>
        </div>
        {m > 0 && (
          <p className="rounded-md bg-carton/60 px-3 py-2 text-sm">
            Después de esto {despues > 0 ? <>faltará pagar <b className="cifra">{clp(despues)}</b></> : despues === 0 ? <b className="text-tinta">queda pagado completo</b> : <>quedará pagado de más <b className="cifra">{clp(-despues)}</b></>}.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" disabled={m <= 0} className="btn btn-primario disabled:opacity-40">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ trabajador ------------------------------ */

function EditarTrabajador({ t, onCerrar }: { t: Trabajador | "nuevo" | null; onCerrar: () => void }) {
  const avisar = useAviso();
  const [f, setF] = useState({ nombre: "", cargo: "", modalidad: "DIA" as Modalidad, monto: "", telefono: "", activo: true });
  useEffect(() => {
    if (!t) return;
    if (t === "nuevo") setF({ nombre: "", cargo: "", modalidad: "DIA", monto: "", telefono: "", activo: true });
    else setF({ nombre: t.nombre, cargo: t.cargo, modalidad: t.modalidad, monto: miles(t.monto), telefono: t.telefono ?? "", activo: t.activo });
  }, [t]);
  if (!t) return null;
  const m = parseMonto(f.monto) ?? 0;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (f.nombre.trim().length < 2 || m <= 0) return;
    const g = guardarTrabajador({
      id: t === "nuevo" ? undefined : t.id,
      nombre: f.nombre.trim(),
      cargo: f.cargo.trim() || "Ayudante",
      modalidad: f.modalidad,
      monto: m,
      telefono: f.telefono.trim() || null,
      activo: f.activo,
    });
    avisar({ titulo: t === "nuevo" ? "Trabajador agregado" : "Datos guardados", detalle: g.nombre, tono: "tinta" });
    onCerrar();
  };

  return (
    <Modal abierto onCerrar={onCerrar} etiqueta="Trabajador">
      <form onSubmit={enviar} className="space-y-4">
        <p className="stencil text-2xl">{t === "nuevo" ? "Nuevo trabajador" : "Editar trabajador"}</p>
        <label className="block">
          <span className="rotulo">Nombre</span>
          <input autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="campo text-lg" placeholder="Nombre y apellido" />
        </label>
        <div>
          <span className="rotulo">¿Qué hace?</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CARGOS.map((c) => (
              <button key={c} type="button" aria-pressed={f.cargo === c} onClick={() => setF({ ...f, cargo: c })} className="opcion py-1 text-sm">
                {c}
              </button>
            ))}
          </div>
          <input value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} className="campo mt-2" placeholder="u otro cargo" />
        </div>
        <div>
          <span className="rotulo">¿Cómo se le paga?</span>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {(Object.keys(MODALIDAD) as Modalidad[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={f.modalidad === k}
                onClick={() => setF({ ...f, modalidad: k })}
                className={`rounded-md border px-3 py-2 text-left text-sm font-semibold ${f.modalidad === k ? "border-tinta bg-verde-suave" : "border-kraft"}`}
              >
                {MODALIDAD[k].label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="rotulo">Monto {MODALIDAD[f.modalidad].por}</span>
            <input value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} onBlur={() => m && setF({ ...f, monto: miles(m) })} inputMode="numeric" className="campo text-right text-lg font-semibold" placeholder="$" />
          </label>
          <label className="block">
            <span className="rotulo">Teléfono (opcional)</span>
            <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} inputMode="tel" className="campo" placeholder="+56 9 …" />
          </label>
        </div>
        {t !== "nuevo" && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} className="size-4 accent-[#2f7d45]" />
            Sigue trabajando (si lo desmarcas, se oculta pero no se borra su historial)
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
