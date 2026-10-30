"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import type { FormaPago, Producto, Unidad } from "@/lib/types";
import { crearVale, useData } from "@/lib/store";
import { ultimoPrecio, type EstadoCliente } from "@/lib/calc";
import { cant as fmtCant, clp, ddmm, fechaLarga, haceDias, hoy, miles, parseCantidad, parseMonto, uid } from "@/lib/format";
import { Autocompletar, puntaje } from "../Autocompletar";
import { filtrarClientes, OpcionCliente, useEstados } from "../clientes";
import { NuevoCliente } from "../NuevoCliente";
import { useAviso } from "../Shell";
import { FORMA, MontoGrande, Numeradora, StickerSemaforo, Tecla, Timbre } from "../ui";
import { Colillas } from "./Colillas";
import { Pizarra } from "./Pizarra";

interface Fila {
  k: string;
  cant: string;
  unidad: Unidad;
  unidadTocada: boolean;
  prodQ: string;
  prod: Producto | null;
  precio: string;
}

const UNIDADES: Unidad[] = ["CAJA", "ENVASE", "KG"];
const TECLA_UNIDAD: Record<string, Unidad> = { c: "CAJA", e: "ENVASE", k: "KG" };

const filaVacia = (unidad: Unidad = "CAJA"): Fila => ({
  k: uid(), cant: "", unidad, unidadTocada: false, prodQ: "", prod: null, precio: "",
});

function estadoFila(f: Fila) {
  const c = parseCantidad(f.cant);
  const p = parseMonto(f.precio);
  const vacia = !f.cant.trim() && !f.prodQ.trim() && !f.precio.trim();
  const completa = c !== null && !!f.prod && p !== null && p > 0;
  return { c, p, vacia, completa, subtotal: completa ? Math.round(c! * p!) : 0 };
}

interface Fantasma {
  numero: number;
  cliente: string;
  lineas: { txt: string; sub: number }[];
  total: number;
  forma: FormaPago;
}

export function RegistroVale() {
  const data = useData()!;
  const estados = useEstados(data);
  const avisar = useAviso();
  const params = useSearchParams();

  const [fecha, setFecha] = useState(hoy());
  const [clienteQ, setClienteQ] = useState("");
  const [cliente, setCliente] = useState<EstadoCliente | null>(null);
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [activa, setActiva] = useState<string | null>(null);
  const [forma, setForma] = useState<FormaPago>("EFECTIVO");
  const [abono, setAbono] = useState("");
  const [abonoForma, setAbonoForma] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [errores, setErrores] = useState<Set<string>>(new Set());
  const [sacude, setSacude] = useState<string | null>(null);
  const [confirmarMoroso, setConfirmarMoroso] = useState(false);
  const [escUna, setEscUna] = useState(false);
  const [fantasma, setFantasma] = useState<Fantasma | null>(null);
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<string | null>(null);

  const refs = useRef(new Map<string, HTMLElement | null>());
  const r = (k: string) => (el: HTMLElement | null) => {
    refs.current.set(k, el);
  };
  // foco sincrónico: quien tipea rápido no puede perder teclas entre campos
  const foco = useCallback((k: string) => {
    const el = refs.current.get(k);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);
  const sacudir = (k: string) => {
    setSacude(k);
    setTimeout(() => setSacude(null), 340);
  };

  // cliente desde la URL (?cliente=id), p. ej. desde la cuenta cliente
  useEffect(() => {
    const id = params.get("cliente");
    if (id && estados.has(id) && !cliente) {
      const e = estados.get(id)!;
      setCliente(e);
      setClienteQ(e.cliente.alias ?? e.cliente.nombre);
      foco(`${filas[0].k}-cant`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, estados]);

  // el estado del cliente se refresca si cambia la base (p. ej. otro vale)
  const cli = cliente ? (estados.get(cliente.cliente.id) ?? cliente) : null;

  const calc = useMemo(() => filas.map(estadoFila), [filas]);
  const total = calc.reduce((a, c) => a + c.subtotal, 0);
  const completas = calc.filter((c) => c.completa).length;
  const sucio = !!cliente || calc.some((c) => !c.vacia);
  const siguiente = data.db.tenant.ultimo_numero + 1;
  const productos = data.db.productos.filter((p) => p.activo);

  const filaActiva = filas.find((f) => f.k === activa) ?? null;
  const sugerencia = useMemo(
    () => (filaActiva?.prod ? ultimoPrecio(data.db, data.idx, filaActiva.prod.id, cli?.cliente.id, filaActiva.unidad) : null),
    [filaActiva?.prod, filaActiva?.unidad, data, cli?.cliente.id],
  );

  const setFila = (k: string, patch: Partial<Fila>) => {
    setFilas((fs) => fs.map((f) => (f.k === k ? { ...f, ...patch } : f)));
    setErrores((e) => {
      if (!e.has(k)) return e;
      const n = new Set(e);
      n.delete(k);
      return n;
    });
  };

  const limpiar = useCallback(() => {
    setCliente(null);
    setClienteQ("");
    setFilas([filaVacia()]);
    setForma("EFECTIVO");
    setAbono("");
    setErrores(new Set());
    setConfirmarMoroso(false);
    setEscUna(false);
    setFecha(hoy());
    foco("cliente");
  }, [foco]);

  /* ------------------------------- guardar ------------------------------- */

  const guardar = () => {
    if (!cli) {
      sacudir("cliente");
      foco("cliente");
      return;
    }
    const malas = filas.filter((f, i) => !calc[i].vacia && !calc[i].completa).map((f) => f.k);
    if (malas.length) {
      setErrores(new Set(malas));
      const f = filas.find((x) => x.k === malas[0])!;
      const e = estadoFila(f);
      foco(`${f.k}-${e.c === null ? "cant" : !f.prod ? "prod" : "precio"}`);
      return;
    }
    if (!completas) {
      sacudir("lineas");
      foco(`${filas[0].k}-cant`);
      return;
    }
    if (forma === "CREDITO" && (cli.semaforo === "ROJO" || (cli.cliente.limite_credito !== null && cli.saldo + total > cli.cliente.limite_credito)) && !confirmarMoroso) {
      setConfirmarMoroso(true);
      foco("forma");
      return;
    }
    const lineas = filas
      .map((f, i) => ({ f, e: calc[i] }))
      .filter(({ e }) => e.completa)
      .map(({ f, e }) => ({ cantidad: e.c!, unidad: f.unidad, producto_id: f.prod!.id, precio_unitario: e.p! }));
    const montoAbono = forma === "CREDITO" ? (parseMonto(abono) ?? 0) : 0;
    const mov = crearVale({
      fecha,
      cliente_id: cli.cliente.id,
      forma_pago: forma,
      lineas,
      abono: montoAbono > 0 ? { monto: montoAbono, forma: abonoForma } : null,
    });
    setFantasma({
      numero: mov.numero,
      cliente: cli.cliente.alias ?? cli.cliente.nombre,
      lineas: lineas.map((l) => ({
        txt: `${fmtCant(l.cantidad)} ${l.unidad} ${data.idx.producto.get(l.producto_id)?.nombre ?? ""}`,
        sub: Math.round(l.cantidad * l.precio_unitario),
      })),
      total: mov.total,
      forma,
    });
    setTimeout(() => setFantasma(null), 560);
    setUltimoId(mov.id);
    avisar({
      titulo: `Vale N°${mov.numero} guardado`,
      detalle: `${cli.cliente.alias ?? cli.cliente.nombre} · ${FORMA[forma].label} · ${clp(mov.total)}${montoAbono ? ` · abonó ${clp(Math.min(montoAbono, mov.total))}` : ""}`,
      tono: forma === "CREDITO" ? "rojo" : "ok",
    });
    limpiar();
  };

  // atajos globales de la pantalla
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      if (nuevo !== null || document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        guardar();
      } else if (e.key === "Escape") {
        if (!sucio) return;
        if (escUna) limpiar();
        else {
          setEscUna(true);
          setTimeout(() => setEscUna(false), 1800);
        }
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  /* ---------------------------- teclado por campo ---------------------------- */

  const irSiguienteFila = (k: string) => {
    const i = filas.findIndex((f) => f.k === k);
    if (i === filas.length - 1) {
      const n = filaVacia(filas[i].unidad);
      flushSync(() => setFilas((fs) => [...fs, n]));
      foco(`${n.k}-cant`);
    } else foco(`${filas[i + 1].k}-cant`);
  };

  const onCant = (f: Fila, i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (calc[i].vacia) {
        if (completas) foco("forma");
        else sacudir(f.k);
        return;
      }
      if (calc[i].c === null) return sacudir(f.k);
      foco(`${f.k}-unidad`);
    } else if (e.key === "Backspace" && !f.cant && calc[i].vacia && filas.length > 1) {
      e.preventDefault();
      setFilas((fs) => fs.filter((x) => x.k !== f.k));
      foco(`${filas[Math.max(0, i - 1)].k}-precio`);
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      foco(`${filas[i - 1].k}-cant`);
    } else if (e.key === "ArrowDown" && i < filas.length - 1) {
      e.preventDefault();
      foco(`${filas[i + 1].k}-cant`);
    }
  };

  // "5c" → 5 cajas y salta a producto; "20k" → 20 kg
  const onCantChange = (f: Fila, v: string) => {
    const m = v.match(/^\s*(\d+(?:[.,]\d+)?)\s*([cekCEK])$/);
    if (m) {
      flushSync(() => setFila(f.k, { cant: m[1], unidad: TECLA_UNIDAD[m[2].toLowerCase()], unidadTocada: true }));
      foco(`${f.k}-prod`);
      return;
    }
    setFila(f.k, { cant: v });
  };

  const onUnidad = (f: Fila) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const t = TECLA_UNIDAD[e.key.toLowerCase()];
    if (t) {
      e.preventDefault();
      setFila(f.k, { unidad: t, unidadTocada: true });
      foco(`${f.k}-prod`);
    } else if (e.key === "Enter") {
      e.preventDefault();
      foco(`${f.k}-prod`);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ") {
      e.preventDefault();
      const d = e.key === "ArrowUp" ? -1 : 1;
      const idx = (UNIDADES.indexOf(f.unidad) + d + UNIDADES.length) % UNIDADES.length;
      setFila(f.k, { unidad: UNIDADES[idx], unidadTocada: true });
    } else if (e.key === "Backspace") {
      e.preventDefault();
      foco(`${f.k}-cant`);
    }
  };

  const elegirProducto = (f: Fila, p: Producto) => {
    const unidad = f.unidadTocada ? f.unidad : p.unidad_default;
    const sug = ultimoPrecio(data.db, data.idx, p.id, cli?.cliente.id, unidad);
    const precio = sug.cliente?.precio ?? sug.general?.precio;
    flushSync(() =>
      setFila(f.k, {
        prod: p,
        prodQ: p.nombre,
        unidad,
        precio: f.precio || (precio ? miles(precio) : ""),
      }),
    );
    foco(`${f.k}-precio`);
  };

  const onPrecio = (f: Fila, i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const p = parseMonto(f.precio);
      if (!p) return sacudir(f.k);
      setFila(f.k, { precio: miles(p) });
      irSiguienteFila(f.k);
    } else if (e.key === "Backspace" && !f.precio) {
      e.preventDefault();
      foco(`${f.k}-prod`);
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      foco(`${filas[i - 1].k}-precio`);
    } else if (e.key === "ArrowDown" && i < filas.length - 1) {
      e.preventDefault();
      foco(`${filas[i + 1].k}-precio`);
    }
  };

  const onForma = (e: KeyboardEvent<HTMLDivElement>) => {
    const mapa: Record<string, FormaPago> = { e: "EFECTIVO", t: "TRANSFERENCIA", c: "CREDITO" };
    const t = mapa[e.key.toLowerCase()];
    const orden: FormaPago[] = ["EFECTIVO", "TRANSFERENCIA", "CREDITO"];
    if (t) {
      e.preventDefault();
      setForma(t);
      setConfirmarMoroso(false);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setForma((f) => orden[(orden.indexOf(f) + d + 3) % 3]);
      setConfirmarMoroso(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      guardar();
    } else if (e.key === "Backspace" || e.key === "ArrowUp") {
      e.preventDefault();
      const ult = filas[filas.length - 1];
      foco(`${ult.k}-cant`);
    }
  };

  /* --------------------------------- vista --------------------------------- */

  const fechaAtrasada = fecha !== hoy();
  const nuevoSaldo = cli ? cli.saldo + (forma === "CREDITO" ? total - Math.min(parseMonto(abono) ?? 0, total) : 0) : 0;
  const alerta =
    forma === "CREDITO" && cli
      ? cli.semaforo === "ROJO"
        ? "MOROSO"
        : cli.cliente.limite_credito !== null && cli.saldo + total > cli.cliente.limite_credito
          ? "SOBRE EL TOPE"
          : null
      : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="min-w-0">
        <div className="relative mx-auto max-w-[920px]">
          {/* ------------------------------- la hoja ------------------------------- */}
          <section className="hoja perforado margen-rojo rounded-b-md px-4 pb-5 pt-5 sm:px-8 sm:pb-7 sm:pt-7" aria-label="Vale">
            {/* encabezado del vale */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-grafito pb-3">
              <div>
                <h1 className="stencil text-[40px] font-black leading-none sm:text-[52px]">Vale</h1>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-gris">Frutas Israel · La Vega Central</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.2em] text-gris">N°</p>
                <p className="text-[38px] font-bold leading-none text-fuji sm:text-[46px]" style={{ textShadow: "0.5px 0.5px 0 rgba(150,20,30,.3)" }}>
                  <Numeradora numero={siguiente} />
                </p>
                <label className="mt-1 flex items-center justify-end gap-2 text-sm">
                  <span className="text-gris">Fecha</span>
                  <input
                    type="date"
                    value={fecha}
                    max={hoy()}
                    onChange={(e) => e.target.value && setFecha(e.target.value)}
                    className={`cifra rounded-sm border-0 bg-transparent p-0 text-right text-sm ${fechaAtrasada ? "font-bold text-naranjo" : "text-tinta"}`}
                    tabIndex={-1}
                    aria-label="Fecha del vale"
                  />
                </label>
                {fechaAtrasada && <p className="text-[11px] font-bold uppercase tracking-wider text-naranjo">Vale con fecha atrasada · {fechaLarga(fecha)}</p>}
              </div>
            </header>

            {/* cliente */}
            <div className={`mt-4 ${sacude === "cliente" ? "tiembla" : ""}`}>
              <div className="flex items-end gap-3">
                <span className="shrink-0 pb-1.5 text-sm text-gris">Señor(a)</span>
                <Autocompletar
                  etiqueta="Cliente"
                  className="flex-1"
                  inputClassName="!font-sans text-[22px] font-semibold tracking-wide sm:text-[26px]"
                  inputRef={r("cliente")}
                  autoFocus
                  items={[...estados.values()]}
                  clave={(e) => e.cliente.id}
                  filtrar={(q) => filtrarClientes(q, estados)}
                  render={(e) => <OpcionCliente e={e} />}
                  query={clienteQ}
                  setQuery={(q) => {
                    setClienteQ(q);
                    if (cliente && q !== (cliente.cliente.alias ?? cliente.cliente.nombre)) setCliente(null);
                  }}
                  onElegir={(e) => {
                    setCliente(e);
                    setClienteQ(e.cliente.alias ?? e.cliente.nombre);
                    setConfirmarMoroso(false);
                    foco(`${filas[0].k}-cant`);
                  }}
                  onCrear={(q) => setNuevo(q)}
                  placeholder="Escribe alias o nombre…"
                />
              </div>

              {cli && (
                <div className="animate-entra mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-0 text-sm sm:pl-[4.5rem]">
                  <StickerSemaforo s={cli.semaforo} manual={cli.manual} />
                  {cli.cliente.alias && <span className="text-gris">{cli.cliente.nombre}</span>}
                  <span>
                    Debe <b className={`cifra ${cli.saldo > 0 ? "text-fuji" : "text-pera"}`}>{clp(cli.saldo)}</b>
                  </span>
                  {cli.saldo > 0 && <span className="text-gris">último pago {haceDias(cli.ultimoPago ? cli.diasSinPagar : null)}</span>}
                  {cli.cliente.limite_credito !== null && (
                    <span className="text-gris">
                      tope <span className="cifra">{clp(cli.cliente.limite_credito)}</span>
                    </span>
                  )}
                  {cli.cliente.notas && <span className="w-full font-mano text-lg leading-tight text-tinta">“{cli.cliente.notas}”</span>}
                </div>
              )}
            </div>

            {/* líneas */}
            <div className={`mt-5 ${sacude === "lineas" ? "tiembla" : ""}`}>
              <div className="fila-vale border-b border-grafito/70 pb-1 text-[11px] uppercase tracking-[0.18em] text-gris">
                <span className="a-n hidden sm:block">#</span>
                <span className="a-c">Cant.</span>
                <span className="a-u">Unidad</span>
                <span className="a-p">Producto</span>
                <span className="a-pr hidden text-right sm:block">Precio</span>
                <span className="a-st hidden text-right sm:block">Subtotal</span>
              </div>

              {filas.map((f, i) => {
                const e = calc[i];
                const err = errores.has(f.k);
                const on = activa === f.k;
                const hint = on && f.prod ? sugerencia : null;
                return (
                  <div
                    key={f.k}
                    className={`fila-vale relative border-b border-linea py-1.5 ${sacude === f.k ? "tiembla" : ""} ${on ? "bg-resaltador/[0.12]" : ""}`}
                    onFocus={() => setActiva(f.k)}
                  >
                    <span className="a-n cifra hidden pb-1.5 text-sm text-gris sm:block">{i + 1}</span>
                    <input
                      ref={r(`${f.k}-cant`)}
                      value={f.cant}
                      onChange={(ev) => onCantChange(f, ev.target.value)}
                      onKeyDown={onCant(f, i)}
                      onFocus={(ev) => ev.target.select()}
                      inputMode="decimal"
                      aria-label={`Cantidad línea ${i + 1}`}
                      placeholder={i === 0 ? "5" : ""}
                      className={`campo a-c text-right text-lg ${err && e.c === null ? "campo-error" : ""}`}
                    />
                    <button
                      type="button"
                      ref={r(`${f.k}-unidad`)}
                      onKeyDown={onUnidad(f)}
                      onClick={() => {
                        const idx = (UNIDADES.indexOf(f.unidad) + 1) % UNIDADES.length;
                        setFila(f.k, { unidad: UNIDADES[idx], unidadTocada: true });
                      }}
                      aria-label={`Unidad: ${f.unidad}. Teclas C, E o K`}
                      className="campo a-u group flex items-center justify-between !font-sans text-[15px] font-semibold tracking-wider focus:bg-[length:100%_72%]"
                    >
                      {f.unidad}
                      <span className="text-[10px] text-gris opacity-0 transition group-focus:opacity-100">C·E·K</span>
                    </button>
                    <Autocompletar
                      etiqueta={`Producto línea ${i + 1}`}
                      className="a-p"
                      inputClassName={`!font-sans text-lg font-semibold uppercase tracking-wide ${err && !f.prod ? "campo-error" : ""}`}
                      inputRef={r(`${f.k}-prod`)}
                      items={productos}
                      clave={(p) => p.id}
                      filtrar={(q) =>
                        productos
                          .map((p) => ({ p, s: puntaje(q, [p.nombre], p.codigo) }))
                          .filter((x) => x.s > 0)
                          .sort((a, b) => b.s - a.s)
                          .map((x) => x.p)
                      }
                      render={(p) => (
                        <span className="flex items-center gap-2.5">
                          <span className="size-3 rounded-full" style={{ background: p.color }} />
                          <b className="tracking-wide">{p.nombre}</b>
                          <span className="ml-auto rounded-sm border border-kraft px-1 font-mono text-[11px] text-gris">{p.codigo}</span>
                        </span>
                      )}
                      query={f.prodQ}
                      setQuery={(q) => setFila(f.k, { prodQ: q, prod: f.prod && q === f.prod.nombre ? f.prod : null })}
                      onElegir={(p) => elegirProducto(f, p)}
                      onKeyDownExtra={(ev) => {
                        if (ev.key === "Backspace" && !f.prodQ) {
                          ev.preventDefault();
                          foco(`${f.k}-unidad`);
                        }
                      }}
                      placeholder={i === 0 ? "fuji, pl, pera…" : ""}
                    />
                    <div className="a-pr relative">
                      <input
                        ref={r(`${f.k}-precio`)}
                        value={f.precio}
                        onChange={(ev) => setFila(f.k, { precio: ev.target.value })}
                        onKeyDown={onPrecio(f, i)}
                        onFocus={(ev) => ev.target.select()}
                        onBlur={() => {
                          const p = parseMonto(f.precio);
                          if (p) setFila(f.k, { precio: miles(p) });
                        }}
                        inputMode="numeric"
                        aria-label={`Precio unitario línea ${i + 1}`}
                        placeholder="$"
                        className={`campo text-right text-lg ${err && !e.p ? "campo-error" : ""}`}
                      />
                      {hint && (hint.general || hint.cliente) && (
                        <div className="pizarra animate-entra absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap sm:right-full sm:top-1/2 sm:mr-3 sm:mt-0 sm:-translate-y-1/2 rounded-[2px] !border-[4px] px-2.5 py-1 [animation-duration:180ms]">
                          {hint.cliente && (
                            <p className="tiza text-[17px] leading-tight">
                              a este cliente <b className="text-resaltador">${miles(hint.cliente.precio)}</b>{" "}
                              <span className="opacity-60">{ddmm(hint.cliente.fecha)}</span>
                            </p>
                          )}
                          {hint.general && (
                            <p className="tiza text-[17px] leading-tight">
                              último <b>${miles(hint.general.precio)}</b> <span className="opacity-60">{ddmm(hint.general.fecha)}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`a-st cifra pb-1.5 text-right text-lg ${e.completa ? "text-tinta" : "text-linea"}`}>
                      {e.completa ? clp(e.subtotal) : "—"}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        if (filas.length === 1) setFilas([filaVacia()]);
                        else setFilas((fs) => fs.filter((x) => x.k !== f.k));
                      }}
                      className="a-x hidden pb-1.5 text-gris/50 transition hover:text-fuji sm:block"
                      aria-label={`Borrar línea ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            {/* total */}
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <p className="text-sm text-gris">
                {completas} {completas === 1 ? "línea" : "líneas"}
              </p>
              <p className="flex items-baseline gap-3">
                <span className="stencil text-2xl font-extrabold text-gris">Total</span>
                <span className="doble-raya text-[40px] leading-none text-tinta sm:text-[48px]">
                  <MontoGrande valor={total} deuda={false} />
                </span>
              </p>
            </div>

            {/* forma de pago */}
            <div className="mt-6 border-t border-dashed border-kraft pt-5">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-[11px] uppercase tracking-[0.2em] text-gris">Forma de pago</span>
                <div
                  ref={r("forma")}
                  tabIndex={0}
                  role="radiogroup"
                  aria-label="Forma de pago: E efectivo, T transferencia, C crédito"
                  onKeyDown={onForma}
                  className="foco group flex flex-wrap gap-2 rounded-sm p-1 outline-none focus:bg-resaltador/50"
                >
                  {(Object.keys(FORMA) as FormaPago[]).map((k) => {
                    const on = forma === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        tabIndex={-1}
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setForma(k);
                          setConfirmarMoroso(false);
                        }}
                        className={`stencil flex items-center gap-2 rounded-sm border-2 px-3 py-1.5 text-lg font-extrabold transition-all ${on ? "-rotate-1 scale-105 text-hoja shadow-[0_3px_0_rgba(0,0,0,.25)]" : "bg-transparent opacity-70 hover:opacity-100"}`}
                        style={{ borderColor: FORMA[k].color, background: on ? FORMA[k].color : undefined, color: on ? undefined : FORMA[k].color }}
                      >
                        {FORMA[k].label}
                        <span className="tecla !text-[11px]">{FORMA[k].tecla}</span>
                      </button>
                    );
                  })}
                </div>
                {alerta && (
                  <span className="ml-1">
                    <Timbre key={alerta} className="text-lg" rot={-6}>
                      ¡Ojo! {alerta}
                    </Timbre>
                  </span>
                )}
              </div>

              {forma === "CREDITO" && (
                <div className="animate-entra mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
                  <label className="flex items-end gap-2">
                    <span className="pb-1.5 text-sm text-gris">Abona ahora</span>
                    <input
                      ref={r("abono")}
                      value={abono}
                      onChange={(e) => setAbono(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          guardar();
                        } else if (e.key.toLowerCase() === "t" && !abono.match(/\d$/)) {
                          e.preventDefault();
                          setAbonoForma((f) => (f === "EFECTIVO" ? "TRANSFERENCIA" : "EFECTIVO"));
                        }
                      }}
                      inputMode="numeric"
                      placeholder="opcional"
                      className="campo w-32 text-right"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setAbonoForma((f) => (f === "EFECTIVO" ? "TRANSFERENCIA" : "EFECTIVO"))}
                      className="cajon mb-1 text-[11px]"
                      style={{ color: FORMA[abonoForma].color }}
                    >
                      {abonoForma === "EFECTIVO" ? "Efectivo" : "Transf."}
                    </button>
                  </label>
                  {cli && (
                    <p className="text-sm">
                      <span className="text-gris">Queda debiendo </span>
                      <b className="cifra text-xl text-fuji">{clp(nuevoSaldo)}</b>
                    </p>
                  )}
                </div>
              )}

              {confirmarMoroso && (
                <p className="animate-entra mt-3 border-l-4 border-fuji bg-fuji/5 px-3 py-2 text-sm">
                  {alerta === "MOROSO" ? "Este cliente está en rojo." : "Con este vale pasa su tope de crédito."} ¿Fiar igual? Presiona <Tecla>↵</Tecla> otra vez para confirmar, o cambia la forma de pago.
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className={`text-sm transition ${escUna ? "font-semibold text-fuji" : "text-gris"}`}>
                  {escUna ? (
                    <>
                      Presiona <Tecla>Esc</Tecla> otra vez para limpiar el vale
                    </>
                  ) : (
                    <span className="hidden sm:inline">
                      <Tecla>↵</Tecla> avanza · <Tecla>5c</Tecla> 5 cajas · <Tecla>12k</Tecla> $12.000 · <Tecla>Esc</Tecla><Tecla>Esc</Tecla> limpia
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={guardar}
                  className="stencil group flex items-center gap-3 rounded-sm bg-grafito px-6 py-3 text-2xl font-black text-hoja shadow-[0_4px_0_#000] transition active:translate-y-[3px] active:shadow-[0_1px_0_#000]"
                >
                  Guardar vale
                  <span className="hidden gap-0.5 sm:flex">
                    <span className="tecla">Ctrl</span>
                    <span className="tecla">↵</span>
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* la hoja que se arranca */}
          {fantasma && (
            <div className="hoja perforado pointer-events-none absolute inset-x-0 top-0 z-20 animate-arranque rounded-b-md px-8 pb-7 pt-7" aria-hidden>
              <div className="flex justify-between border-b-2 border-grafito pb-3">
                <p className="stencil text-[52px] font-black leading-none">Vale</p>
                <p className="cifra text-[46px] font-bold text-fuji">{fantasma.numero}</p>
              </div>
              <p className="mt-4 text-[26px] font-semibold text-tinta">{fantasma.cliente}</p>
              {fantasma.lineas.map((l, i) => (
                <p key={i} className="cifra flex justify-between border-b border-linea py-2 text-lg text-tinta">
                  <span>{l.txt}</span>
                  <span>{clp(l.sub)}</span>
                </p>
              ))}
              <div className="mt-4 flex items-center justify-between">
                <Timbre color={FORMA[fantasma.forma].color} className="text-2xl" animar={false}>
                  {fantasma.forma === "CREDITO" ? "Crédito" : "Pagado"}
                </Timbre>
                <p className="cifra doble-raya text-4xl font-bold text-tinta">{clp(fantasma.total)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------- columna derecha ---------------------------- */}
      <aside className="flex min-w-0 flex-col gap-7">
        <Pizarra data={data} resaltado={filaActiva?.prod?.id ?? null} />
        <Colillas data={data} tipos={["VALE_VENTA", "VALE_CREDITO", "ABONO"]} ultimoId={ultimoId} />
      </aside>

      <NuevoCliente
        abierto={nuevo !== null}
        nombreInicial={nuevo ?? ""}
        onCerrar={() => {
          setNuevo(null);
          foco("cliente");
        }}
        onCreado={(c) => {
          setNuevo(null);
          setClienteQ(c.alias ?? c.nombre);
          // el estado aparece en el próximo render; lo construimos al vuelo
          setCliente({
            cliente: c, saldo: 0, ultimoPago: null, ultimaCompra: null, diasSinPagar: null, diasSinComprar: null,
            valeMasAntiguo: null, semaforoCalc: "VERDE", semaforo: "VERDE", manual: false, compra: true, compras30: 0,
            pendientes: [], sobreLimite: false,
          });
          avisar({ titulo: "Cliente creado", detalle: c.nombre, tono: "tinta" });
          foco(`${filas[0].k}-cant`);
        }}
      />
    </div>
  );
}
