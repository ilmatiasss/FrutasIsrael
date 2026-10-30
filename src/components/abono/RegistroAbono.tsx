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
import { FORMA, MontoGrande, Numeradora, Punto, StickerSemaforo, Tecla, Timbre, useCuenta } from "../ui";
import { Colillas } from "../vale/Colillas";

type Forma = "EFECTIVO" | "TRANSFERENCIA";

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

  // aplicación FIFO en vivo: qué vales quedan pagados con este abono
  const cobertura = useMemo(() => {
    let resto = m;
    return (est?.pendientes ?? []).map((p) => {
      const aplica = Math.min(resto, p.pendiente);
      resto -= aplica;
      return { ...p, aplica, pagado: aplica >= p.pendiente };
    });
  }, [est, m]);

  const morosos = useMemo(
    () =>
      [...estados.values()]
        .filter((e) => e.saldo > 0)
        .sort((a, b) => (b.diasSinPagar ?? 0) * Math.log(b.saldo) - (a.diasSinPagar ?? 0) * Math.log(a.saldo))
        .slice(0, 8),
    [estados],
  );

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
    const mov = registrarAbono({ cliente_id: est.cliente.id, monto: m, forma, glosa: glosa.trim() || null, fecha: hoy() });
    setUltimoId(mov.id);
    if (saldo - m <= 0) setAlDia((x) => x + 1);
    avisar({
      titulo: `Abono N°${mov.numero} registrado`,
      detalle: `${est.cliente.alias ?? est.cliente.nombre} · ${FORMA[forma].label} · ${clp(m)} · queda ${clp(Math.max(0, saldo - m))}`,
      tono: "tinta",
    });
    setMonto("");
    setGlosa("");
    setForma("EFECTIVO");
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
    if (k === "e" || k === "t") {
      e.preventDefault();
      setForma(k === "e" ? "EFECTIVO" : "TRANSFERENCIA");
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setForma((f) => (f === "EFECTIVO" ? "TRANSFERENCIA" : "EFECTIVO"));
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <section className="hoja perforado relative mx-auto w-full max-w-[920px] rounded-b-md px-4 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7" aria-label="Recibo de abono">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-grafito pb-3">
          <div>
            <h1 className="stencil text-[40px] font-black leading-none text-pera sm:text-[52px]">Abono</h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-gris">Pago / abono a crédito</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gris">N°</p>
            <p className="text-[38px] font-bold leading-none text-fuji sm:text-[46px]">
              <Numeradora numero={data.db.tenant.ultimo_numero + 1} />
            </p>
          </div>
        </header>

        <div className="mt-5 flex items-end gap-3">
          <span className="shrink-0 pb-1.5 text-sm text-gris">Recibí de</span>
          <Autocompletar
            etiqueta="Cliente"
            className="flex-1"
            inputClassName="!font-sans text-[22px] font-semibold tracking-wide sm:text-[26px]"
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

        {/* deuda vigente */}
        <div className="relative mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gris">Deuda vigente</p>
            <p className="mt-1 text-[52px] leading-none sm:text-[68px]">
              <MontoGrande valor={est ? animado : 0} />
            </p>
            {est && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StickerSemaforo s={est.semaforo} manual={est.manual} />
                <span className="text-gris">último pago {est.ultimoPago ? haceDias(diasEntre(est.ultimoPago, hoy())) : "nunca"}</span>
                <Link href={`/clientes/${est.cliente.id}`} className="text-tinta underline decoration-dotted underline-offset-4">
                  ver cuenta
                </Link>
              </div>
            )}
            {alDia > 0 && est && est.saldo <= 0 && (
              <div className="pointer-events-none absolute left-4 top-6">
                <Timbre key={alDia} color="#4f7f2a" className="text-4xl">
                  ¡Al día!
                </Timbre>
              </div>
            )}
          </div>

          <div className={sacude ? "tiembla" : ""}>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.2em] text-gris">Monto del abono</span>
              <input
                ref={r("monto")}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onKeyDown={onMonto}
                onBlur={() => m && setMonto(miles(m))}
                inputMode="numeric"
                disabled={!est}
                placeholder={est && saldo > 0 ? `↵ = todo (${clp(saldo)})` : "$"}
                className="campo mt-1 text-right text-[34px] font-semibold placeholder:text-base disabled:opacity-40"
              />
            </label>
            {est && saldo > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[1, 0.5].map((f) => (
                  <button
                    key={f}
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setMonto(miles(Math.round((saldo * f) / 1000) * 1000 || saldo));
                      foco("forma");
                    }}
                    className="cajon text-xs text-tinta hover:bg-tinta hover:text-hoja"
                  >
                    {f === 1 ? `Todo ${clp(saldo)}` : `La mitad`}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div
                ref={r("forma")}
                tabIndex={0}
                role="radiogroup"
                aria-label="Forma: E efectivo, T transferencia"
                onKeyDown={onForma}
                className="flex gap-2 rounded-sm p-1 outline-none focus:bg-resaltador/50"
              >
                {(["EFECTIVO", "TRANSFERENCIA"] as Forma[]).map((k) => {
                  const on = forma === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      tabIndex={-1}
                      role="radio"
                      aria-checked={on}
                      onClick={() => setForma(k)}
                      className={`stencil flex items-center gap-2 rounded-sm border-2 px-3 py-1.5 text-lg font-extrabold transition-all ${on ? "-rotate-1 scale-105 text-hoja" : "opacity-70"}`}
                      style={{ borderColor: FORMA[k].color, background: on ? FORMA[k].color : undefined, color: on ? undefined : FORMA[k].color }}
                    >
                      {FORMA[k].label}
                      <span className="tecla !text-[11px]">{FORMA[k].tecla}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <input
              value={glosa}
              onChange={(e) => setGlosa(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardar();
                }
              }}
              placeholder={forma === "TRANSFERENCIA" ? "Banco / referencia (opcional)" : "Nota (opcional)"}
              className="campo mt-3 font-sans"
            />
          </div>
        </div>

        {/* aplicación a vales pendientes */}
        {est && est.pendientes.length > 0 && (
          <div className="mt-7">
            <div className="flex items-baseline justify-between border-b border-grafito/70 pb-1">
              <h2 className="stencil text-lg font-extrabold">Vales impagos</h2>
              <span className="text-xs text-gris">se pagan del más antiguo al más nuevo</span>
            </div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cobertura.map((c) => (
                <li
                  key={c.mov.id}
                  className={`relative overflow-hidden rounded-sm border px-3 py-2 transition-colors ${c.pagado ? "border-pera/40 bg-pera/5" : c.aplica > 0 ? "border-limon bg-limon/10" : "border-linea bg-papel/40"}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="cifra text-sm font-semibold text-fuji">N°{c.mov.numero}</span>
                    <span className="text-xs text-gris">{c.mov.importado ? "saldo planilla" : ddmm(c.mov.fecha)}</span>
                  </div>
                  <p className={`cifra text-lg ${c.pagado ? "text-gris line-through" : "text-fuji"}`}>{clp(c.pendiente)}</p>
                  {c.aplica > 0 && !c.pagado && <p className="cifra text-xs text-naranjo">abona {clp(c.aplica)} · queda {clp(c.pendiente - c.aplica)}</p>}
                  {c.pagado && (
                    <span className="absolute bottom-1.5 right-2">
                      <Timbre color="#4f7f2a" className="text-sm">
                        Pagado
                      </Timbre>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-dashed border-kraft pt-5">
          <p className="text-sm">
            {est && m > 0 && (
              <>
                <span className="text-gris">Nuevo saldo </span>
                <b className={`cifra text-2xl ${nuevoSaldo > 0 ? "text-fuji" : "text-pera"}`}>{clp(Math.max(0, nuevoSaldo))}</b>
                {nuevoSaldo < 0 && <span className="ml-2 text-naranjo">· paga {clp(-nuevoSaldo)} de más (queda a favor)</span>}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={guardar}
            className="stencil flex items-center gap-3 rounded-sm bg-pera px-6 py-3 text-2xl font-black text-hoja shadow-[0_4px_0_#2f4f17] transition active:translate-y-[3px] active:shadow-[0_1px_0_#2f4f17]"
          >
            Registrar abono
            <span className="tecla">↵</span>
          </button>
        </div>
        <p className="mt-3 hidden text-sm text-gris sm:block">
          <Tecla>↵</Tecla> en monto vacío = paga todo · <Tecla>E</Tecla>/<Tecla>T</Tecla> forma · <Tecla>Ctrl</Tecla>
          <Tecla>↵</Tecla> registra
        </p>
      </section>

      <aside className="flex min-w-0 flex-col gap-7">
        <section className="hoja rounded-sm" aria-label="Por cobrar">
          <header className="border-b-2 border-grafito/80 px-4 pb-2 pt-3">
            <h2 className="stencil text-xl font-extrabold">Por cobrar primero</h2>
            <p className="text-xs text-gris">más días sin pagar × más deuda</p>
          </header>
          <ul>
            {morosos.map((e) => (
              <li key={e.cliente.id}>
                <button
                  type="button"
                  onClick={() => {
                    flushSync(() => {
                      setClienteId(e.cliente.id);
                      setQ(e.cliente.alias ?? e.cliente.nombre);
                      setMonto("");
                    });
                    foco("monto");
                  }}
                  className="corte flex w-full items-center gap-3 bg-bottom px-4 py-2 text-left hover:bg-resaltador/40"
                >
                  <Punto s={e.semaforo} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{e.cliente.alias ?? e.cliente.nombre}</span>
                  <span className="text-xs text-gris">{e.diasSinPagar} d</span>
                  <span className="cifra w-24 text-right text-fuji">{clp(e.saldo)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <Colillas data={data} tipos={["ABONO"]} ultimoId={ultimoId} titulo="Abonos de hoy" />
      </aside>
    </div>
  );
}
