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
import { FORMA, MontoGrande, Numeradora, StickerSemaforo, useCuenta } from "../ui";
import { Colillas } from "../vale/Colillas";

import { Encabezado } from "../Encabezado";

const PASOS = [
  { titulo: "¿Quién paga?", texto: "Escribe el nombre o apodo del cliente y presiona Enter. Verás cuánto debe." },
  { titulo: "¿Cuánto paga?", texto: "Escribe el monto (sirve 50k o 50 lucas). Enter con el campo vacío = paga todo." },
  { titulo: "¿Cómo paga?", texto: "Efectivo o Transferencia (teclas E o T). Puedes anotar el banco en la nota." },
  { titulo: "Registra", texto: "Botón «Registrar abono». Se descuentan primero los vales más antiguos." },
];

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
    <>
    <Encabezado href="/abono" bajada="Recibe un pago de alguien que debe: total o una parte." pasos={PASOS} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="hoja mx-auto w-full max-w-[880px] px-4 pb-6 pt-5 sm:px-7 sm:pt-6" aria-label="Abono">
        <header className="flex items-start justify-between gap-4 border-b border-linea pb-3">
          <div>
            <p className="stencil text-[22px]">Abono nuevo</p>
            <p className="text-sm text-gris">Pago total o parcial de una deuda</p>
          </div>
          <p className="text-right">
            <span className="rotulo block">N°</span>
            <span className="text-[28px] font-semibold leading-none text-fuji sm:text-[32px]">
              <Numeradora numero={data.db.tenant.ultimo_numero + 1} />
            </span>
          </p>
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
              aria-label="Forma: E efectivo, T transferencia"
              onKeyDown={onForma}
              className="mt-5 flex flex-wrap gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-tinta/40 focus-visible:ring-offset-4"
            >
              {(["EFECTIVO", "TRANSFERENCIA"] as Forma[]).map((k) => (
                <button key={k} type="button" tabIndex={-1} role="radio" aria-checked={forma === k} onClick={() => setForma(k)} className="opcion">
                  {FORMA[k].label}
                  <span className="tecla hidden md:inline-flex">{FORMA[k].tecla}</span>
                </button>
              ))}
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
