"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { registrarAbono, useData } from "@/lib/store";
import { clp, ddmm, diasEntre, haceDias, hoy, miles, parseMonto } from "@/lib/format";
import { Autocompletar } from "../Autocompletar";
import { filtrarClientes, OpcionCliente, useEstados } from "../clientes";
import { useAviso } from "../Shell";
import { CampoNumero, leerNumero } from "../CampoNumero";
import { FORMA, MontoGrande, StickerSemaforo, useCuenta } from "../ui";
import { Colillas } from "../vale/Colillas";

import { Encabezado } from "../Encabezado";

const PASOS = [
  { titulo: "Cliente", texto: "Escriba nombre o alias y presione Enter. Se muestra la deuda vigente." },
  { titulo: "Monto", texto: "Ingrese el monto (acepta 50k). Enter con el campo vacío registra el pago total." },
  { titulo: "Forma de pago", texto: "Efectivo o Transferencia (teclas E o T). El banco puede indicarse en la nota." },
  { titulo: "Registrar", texto: "El abono se aplica primero a los vales más antiguos." },
];

type Forma = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA";

const PARTES_INICIALES: { monto: string; forma: Forma }[] = [
  { monto: "", forma: "EFECTIVO" },
  { monto: "", forma: "TRANSFERENCIA" },
];
const COMBOS_ABONO: Forma[][] = [
  ["EFECTIVO", "TRANSFERENCIA"],
  ["EFECTIVO", "TARJETA"],
  ["TRANSFERENCIA", "TARJETA"],
];

/** Reparte el abono entre las formas: la última sin monto toma el resto. */
function repartirAbono(partes: { monto: string; forma: Forma }[], total: number) {
  const valores = partes.map((x) => (x.monto.trim() ? parseMonto(x.monto) : null));
  const vacias = valores.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const auto = vacias.length ? vacias[vacias.length - 1] : -1;
  const puesto = valores.reduce<number>((a, v) => a + (v ?? 0), 0);
  const resto = total - puesto;
  const lista = partes
    .map((x, i) => ({ forma: x.forma, monto: i === auto ? Math.max(0, resto) : (valores[i] ?? 0) }))
    .filter((x) => x.monto > 0);
  const suma = lista.reduce((a, x) => a + x.monto, 0);
  let error: string | null = null;
  if (total <= 0) error = "Primero escriba el monto del abono.";
  else if (valores.some((v, i) => partes[i].monto.trim() && v === null)) error = "Hay un monto mal escrito.";
  else if (suma > total) error = `Sobran ${clp(suma - total)}: suman más que el abono.`;
  else if (suma < total) error = `Faltan ${clp(total - suma)} para completar el abono.`;
  else if (lista.length < 2) error = "Para una sola forma de pago elíjala arriba.";
  return { lista, auto, resto, error };
}

export function RegistroAbono() {
  const data = useData()!;
  const estados = useEstados(data);
  const avisar = useAviso();
  const params = useSearchParams();

  const [q, setQ] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState<Forma>("EFECTIVO");
  const [glosa, setGlosa] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [numero, setNumero] = useState<string | null>(null);
  // abono combinado: efectivo + transferencia, efectivo + tarjeta, transferencia + tarjeta
  const [combinado, setCombinado] = useState(false);
  const [partes, setPartes] = useState<{ monto: string; forma: Forma }[]>(PARTES_INICIALES);
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  const [alDia, setAlDia] = useState(0); // cambia para re-animar el timbre
  const [sacude, setSacude] = useState(false);

  const refs = useRef(new Map<string, HTMLElement | null>());
  const r = (k: string) => (el: HTMLElement | null) => {
    refs.current.set(k, el);
  };
  const foco = useCallback((k: string) => {
    const el = refs.current.get(k);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  useEffect(() => {
    const id = params.get("cliente");
    if (id && estados.has(id) && !clienteId) {
      const e = estados.get(id)!;
      setClienteId(id);
      setQ(e.cliente.alias ?? e.cliente.nombre);
      setTimeout(() => foco("monto"), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, estados]);

  const est = clienteId ? estados.get(clienteId) ?? null : null;
  const saldo = est?.saldo ?? 0;
  const animado = useCuenta(saldo, 1100);
  const m = parseMonto(monto) ?? 0;
  const nuevoSaldo = saldo - m;
  const reparto = repartirAbono(partes, m);

  // aplicación FIFO en vivo: qué vales quedan pagados con este abono
  const cobertura = useMemo(() => {
    let resto = m;
    return (est?.pendientes ?? []).map((p) => {
      const aplica = Math.min(resto, p.pendiente);
      resto -= aplica;
      return { ...p, aplica, pagado: aplica >= p.pendiente };
    });
  }, [est, m]);

  const guardar = () => {
    if (!est) {
      foco("cliente");
      return;
    }
    if (m <= 0) {
      setSacude(true);
      setTimeout(() => setSacude(false), 340);
      foco("monto");
      return;
    }
    if (combinado && reparto.error) {
      setSacude(true);
      setTimeout(() => setSacude(false), 340);
      foco("parte-0");
      return;
    }
    const mov = registrarAbono({
      cliente_id: est.cliente.id, monto: m, forma, glosa: glosa.trim() || null, fecha, numero: leerNumero(numero),
      pagos: combinado ? reparto.lista : null,
    });
    setUltimoId(mov.id);
    if (saldo - m <= 0) setAlDia((x) => x + 1);
    avisar({
      titulo: `Abono N°${mov.numero} registrado`,
      detalle: `${est.cliente.alias ?? est.cliente.nombre} · ${combinado ? reparto.lista.map((x) => `${FORMA[x.forma].label} ${clp(x.monto)}`).join(" + ") : FORMA[forma].label} · ${clp(m)} · queda ${clp(Math.max(0, saldo - m))}`,
      tono: "tinta",
    });
    setMonto("");
    setGlosa("");
    setForma("EFECTIVO");
    setCombinado(false);
    setPartes(PARTES_INICIALES);
    setFecha(hoy());
    setNumero(null);
    foco("cliente");
  };

  const onMonto = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!monto.trim() && saldo > 0) setMonto(miles(saldo)); // Enter vacío = paga todo
      foco("forma");
    }
  };
  const onForma = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key.toLowerCase();
    if (k === "m") {
      e.preventDefault();
      setCombinado(true);
      setTimeout(() => foco("parte-0"), 0);
    } else if (k === "e" || k === "t" || k === "r") {
      e.preventDefault();
      setCombinado(false);
      setForma(k === "e" ? "EFECTIVO" : k === "t" ? "TRANSFERENCIA" : "TARJETA");
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const orden: Forma[] = ["EFECTIVO", "TRANSFERENCIA", "TARJETA"];
      const d = e.key === "ArrowRight" ? 1 : -1;
      setCombinado(false);
      setForma((f) => orden[(orden.indexOf(f) + d + 3) % 3]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      guardar();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      foco("monto");
    }
  };

  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        guardar();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <>
    <Encabezado href="/abono" bajada="Registro de pagos totales o parciales de deuda." pasos={PASOS} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="hoja mx-auto w-full max-w-[880px] px-4 pb-6 pt-5 sm:px-7 sm:pt-6" aria-label="Abono">
        <header className="flex items-start justify-between gap-4 border-b border-linea pb-3">
          <div>
            <p className="stencil text-[18px]">Nuevo abono</p>
            <p className="text-sm text-gris">Pago total o parcial de una deuda</p>
            <label className="mt-1 flex items-center gap-1.5 text-sm">
              <span className="text-gris">Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => e.target.value && setFecha(e.target.value)}
                aria-label="Fecha"
                className={`bg-transparent p-0 text-sm ${fecha !== hoy() ? "font-semibold text-fuji" : "text-gris"}`}
              />
            </label>
            {fecha !== hoy() && <p className="text-xs font-semibold text-fuji">{fecha < hoy() ? "Fecha atrasada" : "Fecha adelantada"}</p>}
          </div>
          <CampoNumero serie="ABONO" valor={numero} setValor={setNumero} />
        </header>

        <div className="mt-5">
          <span className="rotulo">Cliente</span>
          <Autocompletar
            etiqueta="Cliente"
            inputClassName="font-sans text-[22px] font-semibold"
            inputRef={r("cliente")}
            autoFocus
            items={[...estados.values()]}
            clave={(e) => e.cliente.id}
            filtrar={(t) => filtrarClientes(t, estados)}
            render={(e) => <OpcionCliente e={e} />}
            query={q}
            setQuery={(t) => {
              setQ(t);
              if (est && t !== (est.cliente.alias ?? est.cliente.nombre)) setClienteId(null);
            }}
            onElegir={(e) => {
              flushSync(() => {
                setClienteId(e.cliente.id);
                setQ(e.cliente.alias ?? e.cliente.nombre);
                setMonto("");
              });
              foco("monto");
            }}
            placeholder="¿Quién viene a pagar?"
          />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <span className="rotulo">Deuda vigente</span>
            <p className="mt-1 text-[44px] leading-none sm:text-[56px]">
              <MontoGrande valor={est ? animado : 0} />
            </p>
            {est && (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StickerSemaforo s={est.semaforo} manual={est.manual} />
                <span className="text-gris">último pago {est.ultimoPago ? haceDias(diasEntre(est.ultimoPago, hoy())) : "nunca"}</span>
                <Link href={`/clientes/${est.cliente.id}`} className="text-tinta underline underline-offset-4">
                  ver cuenta
                </Link>
              </p>
            )}
            {alDia > 0 && est && est.saldo <= 0 && <p className="animate-entra mt-3 font-semibold text-pera">Quedó al día.</p>}
          </div>

          <div className={sacude ? "tiembla" : ""}>
            <label className="block">
              <span className="rotulo">Monto del abono</span>
              <input
                ref={r("monto")}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onKeyDown={onMonto}
                onBlur={() => m && setMonto(miles(m))}
                inputMode="numeric"
                disabled={!est}
                placeholder={est && saldo > 0 ? `Enter = todo (${clp(saldo)})` : "$"}
                className="campo mt-1 text-right text-[30px] font-semibold placeholder:text-base"
              />
            </label>
            {est && saldo > 0 && (
              <div className="mt-2 flex gap-3 text-sm">
                {[1, 0.5].map((f) => (
                  <button
                    key={f}
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setMonto(miles(Math.round((saldo * f) / 1000) * 1000 || saldo));
                      foco("forma");
                    }}
                    className="text-tinta underline decoration-dotted underline-offset-4"
                  >
                    {f === 1 ? "Todo" : "La mitad"}
                  </button>
                ))}
              </div>
            )}

            <div
              ref={r("forma")}
              tabIndex={0}
              role="radiogroup"
              aria-label="Forma: E efectivo, T transferencia, R tarjeta, M combinado"
              onKeyDown={onForma}
              className="mt-5 flex flex-wrap gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-tinta/40 focus-visible:ring-offset-4"
            >
              {(["EFECTIVO", "TRANSFERENCIA", "TARJETA"] as Forma[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  tabIndex={-1}
                  role="radio"
                  aria-checked={!combinado && forma === k}
                  onClick={() => {
                    setCombinado(false);
                    setForma(k);
                  }}
                  className="opcion"
                >
                  {FORMA[k].label}
                  <span className="tecla hidden md:inline-flex">{FORMA[k].tecla}</span>
                </button>
              ))}
              <button
                type="button"
                tabIndex={-1}
                role="radio"
                aria-checked={combinado}
                onClick={() => {
                  setCombinado(true);
                  setTimeout(() => foco("parte-0"), 0);
                }}
                className="opcion"
              >
                Combinado
                <span className="tecla hidden md:inline-flex">M</span>
              </button>
            </div>

            {combinado && (
              <div className={`animate-entra mt-3 rounded-md border border-linea bg-carton/40 p-3 ${sacude ? "tiembla" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gris">Paga con:</span>
                  {COMBOS_ABONO.map((c) => (
                    <button
                      key={c.join("+")}
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setPartes(c.map((f) => ({ monto: "", forma: f })));
                        setTimeout(() => foco("parte-0"), 0);
                      }}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        partes.length === c.length && partes.every((x, i) => x.forma === c[i]) ? "border-tinta bg-tinta text-white" : "border-kraft text-gris hover:text-grafito"
                      }`}
                    >
                      {c.map((f) => FORMA[f].label).join(" + ")}
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {partes.map((x, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        ref={r(`parte-${i}`)}
                        value={x.monto}
                        onChange={(e) => setPartes(partes.map((y, j) => (j === i ? { ...y, monto: e.target.value } : y)))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (i < partes.length - 1) foco(`parte-${i + 1}`);
                            else guardar();
                          }
                        }}
                        inputMode="numeric"
                        placeholder={i === reparto.auto ? `resto ${clp(Math.max(0, reparto.resto))}` : "$"}
                        aria-label={`Abono en ${FORMA[x.forma].label.toLowerCase()}`}
                        className="campo w-40 text-right text-lg font-semibold"
                      />
                      <select
                        value={x.forma}
                        onChange={(e) => setPartes(partes.map((y, j) => (j === i ? { ...y, forma: e.target.value as Forma } : y)))}
                        className="campo w-40"
                        aria-label={`Forma de pago ${i + 1}`}
                      >
                        {(["EFECTIVO", "TRANSFERENCIA", "TARJETA"] as Forma[]).map((f) => (
                          <option key={f} value={f}>
                            {FORMA[f].label}
                          </option>
                        ))}
                      </select>
                      {partes.length > 2 && (
                        <button type="button" tabIndex={-1} onClick={() => setPartes(partes.filter((_, j) => j !== i))} className="text-sm text-gris hover:text-fuji">
                          quitar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  {partes.length < 3 ? (
                    <button type="button" tabIndex={-1} onClick={() => setPartes([...partes, { monto: "", forma: "TARJETA" }])} className="font-medium text-tinta hover:underline">
                      + otra forma
                    </button>
                  ) : (
                    <span />
                  )}
                  {reparto.error ? (
                    <b className="text-fuji">{reparto.error}</b>
                  ) : (
                    <span className="text-gris">
                      {reparto.lista.map((y) => `${FORMA[y.forma].label} ${clp(y.monto)}`).join(" + ")} = <b className="text-grafito">{clp(m)}</b>
                    </span>
                  )}
                </div>
              </div>
            )}
            <input
              value={glosa}
              onChange={(e) => setGlosa(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardar();
                }
              }}
              placeholder={forma === "TRANSFERENCIA" ? "Banco o referencia (opcional)" : "Nota (opcional)"}
              className="campo mt-3 font-sans"
            />
          </div>
        </div>

        {est && est.pendientes.length > 0 && (
          <details className="mt-7 border-t border-linea pt-4" open={m > 0}>
            <summary className="cursor-pointer text-sm font-semibold">
              {est.pendientes.length} vales impagos <span className="font-normal text-gris">· el abono paga primero los más antiguos</span>
            </summary>
            <ul className="mt-2 text-sm">
              {cobertura.map((c) => (
                <li key={c.mov.id} className="flex items-baseline justify-between gap-3 border-b border-linea py-1.5">
                  <span className="text-gris">
                    N°{c.mov.numero} · {c.mov.importado ? "saldo planilla" : ddmm(c.mov.fecha)}
                  </span>
                  <span className="flex items-baseline gap-3">
                    {c.pagado ? (
                      <span className="text-xs font-semibold text-pera">queda pagado</span>
                    ) : c.aplica > 0 ? (
                      <span className="text-xs text-gris">abona {clp(c.aplica)}</span>
                    ) : null}
                    <span className={`cifra ${c.pagado ? "text-gris line-through" : "text-fuji"}`}>{clp(c.pendiente)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-6 flex flex-col-reverse items-stretch gap-3 border-t border-linea pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {est && m > 0 && (
              <>
                <span className="text-gris">Nuevo saldo </span>
                <b className={`cifra text-xl ${nuevoSaldo > 0 ? "text-fuji" : "text-pera"}`}>{clp(Math.max(0, nuevoSaldo))}</b>
                {nuevoSaldo < 0 && <span className="ml-2 text-gris">· paga {clp(-nuevoSaldo)} de más (queda a favor)</span>}
              </>
            )}
          </p>
          <button type="button" onClick={guardar} className="btn btn-primario px-6 py-3 text-lg">
            Registrar abono
          </button>
        </div>
      </section>

      <aside className="min-w-0">
        <Colillas data={data} tipos={["ABONO"]} ultimoId={ultimoId} titulo="Abonos de hoy" />
      </aside>
    </div>
    </>
  );
}
