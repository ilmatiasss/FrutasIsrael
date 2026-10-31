"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import type { FormaPago, Producto, Unidad } from "@/lib/types";
import { crearVale, useData } from "@/lib/store";
import { ultimoPrecio, type EstadoCliente } from "@/lib/calc";
import { clp, ddmm, diasEntre, fechaLarga, haceDias, hoy, miles, parseCantidad, parseMonto, uid } from "@/lib/format";
import { Autocompletar, puntaje } from "../Autocompletar";
import { filtrarClientes, OpcionCliente, useEstados } from "../clientes";
import { NuevoCliente } from "../NuevoCliente";
import { useAviso } from "../Shell";
import { FORMA, MontoGrande, Numeradora, StickerSemaforo } from "../ui";
import { Colillas } from "./Colillas";
import { Encabezado } from "../Encabezado";

const PASOS = [
  { titulo: "Cliente", texto: "Escriba nombre o alias y presione Enter. Si no existe, elija «+ Cliente nuevo»." },
  { titulo: "Detalle", texto: "Cantidad, unidad (C caja, E envase, K kilo), producto y precio; el precio se sugiere solo. Para registrar solo un monto, use «Solo monto»." },
  { titulo: "Forma de pago", texto: "Efectivo, Transferencia o Crédito. Un pago parcial se registra en «Abona ahora»." },
  { titulo: "Guardar", texto: "Botón «Guardar vale» o Ctrl + Enter. El folio avanza automáticamente." },
];

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
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<string | null>(null);
  // "solo monto": vale sin productos, solo la plata (lo más común para fiar rápido)
  const [soloMonto, setSoloMonto] = useState(false);
  const [monto, setMonto] = useState("");
  const [detalle, setDetalle] = useState("");

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
      setTimeout(() => foco(primerCampo()), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, estados]);

  useEffect(() => {
    try {
      if (localStorage.getItem("frutas-israel:solo-monto") === "1") {
        setSoloMonto(true);
        setForma("CREDITO");
      }
    } catch {}
  }, []);

  const primerCampo = () => (soloMonto ? "monto" : `${filas[0].k}-cant`);

  const cambiarModo = (v: boolean) => {
    flushSync(() => {
      setSoloMonto(v);
      setForma(v ? "CREDITO" : "EFECTIVO");
      setConfirmarMoroso(false);
    });
    try {
      localStorage.setItem("frutas-israel:solo-monto", v ? "1" : "0");
    } catch {}
    foco(!cliente ? "cliente" : v ? "monto" : `${filas[0].k}-cant`);
  };

  // el estado del cliente se refresca si cambia la base (p. ej. otro vale)
  const cli = cliente ? (estados.get(cliente.cliente.id) ?? cliente) : null;

  const calc = useMemo(() => filas.map(estadoFila), [filas]);
  const montoSolo = parseMonto(monto) ?? 0;
  const total = soloMonto ? montoSolo : calc.reduce((a, c) => a + c.subtotal, 0);
  const completas = calc.filter((c) => c.completa).length;
  const sucio = !!cliente || calc.some((c) => !c.vacia) || !!monto || !!detalle;
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
    setForma(soloMonto ? "CREDITO" : "EFECTIVO");
    setMonto("");
    setDetalle("");
    setAbono("");
    setErrores(new Set());
    setConfirmarMoroso(false);
    setEscUna(false);
    setFecha(hoy());
    foco("cliente");
  }, [foco, soloMonto]);

  /* ------------------------------- guardar ------------------------------- */

  const guardar = () => {
    if (!cli) {
      sacudir("cliente");
      foco("cliente");
      return;
    }
    if (soloMonto && montoSolo <= 0) {
      sacudir("monto");
      foco("monto");
      return;
    }
    const malas = soloMonto ? [] : filas.filter((f, i) => !calc[i].vacia && !calc[i].completa).map((f) => f.k);
    if (malas.length) {
      setErrores(new Set(malas));
      const f = filas.find((x) => x.k === malas[0])!;
      const e = estadoFila(f);
      foco(`${f.k}-${e.c === null ? "cant" : !f.prod ? "prod" : "precio"}`);
      return;
    }
    if (!soloMonto && !completas) {
      sacudir("lineas");
      foco(`${filas[0].k}-cant`);
      return;
    }
    if (forma === "CREDITO" && (cli.semaforo === "ROJO" || (cli.cliente.limite_credito !== null && cli.saldo + total > cli.cliente.limite_credito)) && !confirmarMoroso) {
      setConfirmarMoroso(true);
      foco("forma");
      return;
    }
    const lineas = soloMonto ? [] : filas
      .map((f, i) => ({ f, e: calc[i] }))
      .filter(({ e }) => e.completa)
      .map(({ f, e }) => ({ cantidad: e.c!, unidad: f.unidad, producto_id: f.prod!.id, precio_unitario: e.p! }));
    const montoAbono = forma === "CREDITO" ? (parseMonto(abono) ?? 0) : 0;
    const mov = crearVale({
      fecha,
      cliente_id: cli.cliente.id,
      forma_pago: forma,
      lineas,
      monto: soloMonto ? montoSolo : undefined,
      glosa: soloMonto ? detalle.trim() || (forma === "CREDITO" ? "Crédito sin detalle" : "Venta sin detalle") : null,
      abono: montoAbono > 0 ? { monto: montoAbono, forma: abonoForma } : null,
    });
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
      } else if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        cambiarModo(!soloMonto);
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
    if (v.trim() === "$" && filas.length === 1) {
      cambiarModo(true);
      return;
    }
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
      foco(soloMonto ? "monto" : `${ult.k}-cant`);
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
    <>
    <Encabezado href="/vale" bajada="Registro de ventas al contado y a crédito. Se puede operar completamente con teclado." pasos={PASOS} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="hoja mx-auto w-full max-w-[880px] px-4 pb-5 pt-5 sm:px-7 sm:pb-7 sm:pt-6" aria-label="Vale">
        {/* encabezado */}
        <header className="flex items-start justify-between gap-4 border-b border-linea pb-3">
          <div>
            <p className="stencil text-[18px]">Nuevo vale</p>
            <label className="mt-1 flex items-center gap-2 text-sm text-gris">
              <input
                type="date"
                value={fecha}
                max={hoy()}
                onChange={(e) => e.target.value && setFecha(e.target.value)}
                className={`bg-transparent p-0 text-sm ${fechaAtrasada ? "font-semibold text-fuji" : "text-gris"}`}
                tabIndex={-1}
                aria-label="Fecha del vale"
              />
            </label>
            {fechaAtrasada && <p className="text-xs font-semibold text-fuji">Fecha atrasada: {fechaLarga(fecha)}</p>}
          </div>
          <p className="text-right">
            <span className="rotulo block">N°</span>
            <span className="text-[28px] font-semibold leading-none text-fuji sm:text-[32px]">
              <Numeradora numero={siguiente} />
            </span>
          </p>
        </header>

        {/* cliente */}
        <div className={`mt-5 ${sacude === "cliente" ? "tiembla" : ""}`}>
          <span className="rotulo">Cliente</span>
          <Autocompletar
            etiqueta="Cliente"
            inputClassName="font-sans text-[22px] font-semibold"
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
              foco(primerCampo());
            }}
            onCrear={(q) => setNuevo(q)}
            placeholder="Escribe el alias o nombre"
          />
          {cli && (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <StickerSemaforo s={cli.semaforo} manual={cli.manual} />
              <span>
                Debe <b className={`cifra ${cli.saldo > 0 ? "text-fuji" : "text-pera"}`}>{clp(cli.saldo)}</b>
              </span>
              {cli.saldo > 0 && <span className="text-gris">último pago {cli.ultimoPago ? haceDias(diasEntre(cli.ultimoPago, hoy())) : "nunca"}</span>}
              {cli.cliente.notas && <span className="w-full text-gris">Nota: {cli.cliente.notas}</span>}
            </p>
          )}
        </div>

        {/* modo: con productos o solo monto */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-md border border-kraft bg-hoja p-0.5" role="tablist" aria-label="Tipo de vale">
            {[
              { v: false, label: "Con productos" },
              { v: true, label: "Solo monto" },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                role="tab"
                tabIndex={-1}
                aria-selected={soloMonto === t.v}
                onClick={() => soloMonto !== t.v && cambiarModo(t.v)}
                className={`rounded px-3 py-1 text-sm font-medium ${soloMonto === t.v ? "bg-tinta text-white" : "text-gris hover:text-grafito"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="hidden text-xs text-gris md:inline">Alt+M cambia · o escribe $ en Cant.</span>
        </div>

        {soloMonto ? (
          <div className={`mt-4 grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] ${sacude === "monto" ? "tiembla" : ""}`}>
            <label className="block">
              <span className="rotulo">Monto</span>
              <input
                ref={r("monto")}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onBlur={() => montoSolo && setMonto(miles(montoSolo))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (montoSolo > 0) {
                      setMonto(miles(montoSolo));
                      foco("forma");
                    } else sacudir("monto");
                  }
                }}
                inputMode="numeric"
                placeholder="$"
                className="campo text-right text-2xl font-semibold"
              />
            </label>
            <label className="block">
              <span className="rotulo">Detalle (opcional)</span>
              <input
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    foco("forma");
                  }
                }}
                placeholder="ej: fruta varia, saldo de la semana"
                className="campo font-sans text-lg"
              />
            </label>
          </div>
        ) : (
          <>
        {/* líneas */}
        <div className={`mt-3 ${sacude === "lineas" ? "tiembla" : ""}`}>
          <div className="fila-vale hidden border-b border-linea pb-1 sm:grid">
            <span className="a-n rotulo">#</span>
            <span className="a-c rotulo text-right">Cant.</span>
            <span className="a-u rotulo">Unidad</span>
            <span className="a-p rotulo">Producto</span>
            <span className="a-pr rotulo text-right">Precio</span>
            <span className="a-st rotulo text-right">Subtotal</span>
          </div>

          {filas.map((f, i) => {
            const e = calc[i];
            const err = errores.has(f.k);
            const on = activa === f.k;
            const hint = on && f.prod ? sugerencia : null;
            return (
              <div
                key={f.k}
                className={`fila-vale relative border-b border-linea py-2 ${sacude === f.k ? "tiembla" : ""}`}
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
                  placeholder="Cant."
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
                  title="C caja · E envase · K kilo"
                  className="campo a-u text-left font-sans text-[15px] font-semibold"
                >
                  {f.unidad === "CAJA" ? "Caja" : f.unidad === "ENVASE" ? "Envase" : "Kg"}
                </button>
                <Autocompletar
                  etiqueta={`Producto línea ${i + 1}`}
                  className="a-p"
                  inputClassName={`font-sans text-lg font-semibold uppercase ${err && !f.prod ? "campo-error" : ""}`}
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
                    <span className="flex items-center justify-between gap-3">
                      <b>{p.nombre}</b>
                      <span className="font-mono text-xs text-gris">{p.codigo}</span>
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
                  placeholder="Producto"
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
                    placeholder="Precio"
                    className={`campo text-right text-lg ${err && !e.p ? "campo-error" : ""}`}
                  />
                  {hint && (hint.general || hint.cliente) && (
                    <p className="z-10 mt-1 text-right text-[12px] leading-snug text-gris sm:absolute sm:right-0 sm:top-full sm:mt-0.5 sm:whitespace-nowrap">
                      {hint.cliente && (
                        <>
                          a este cliente <b className="cifra text-grafito">{clp(hint.cliente.precio)}</b> {ddmm(hint.cliente.fecha)}
                        </>
                      )}
                      {hint.cliente && hint.general && " · "}
                      {hint.general && (
                        <>
                          último <b className="cifra text-grafito">{clp(hint.general.precio)}</b>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <span className={`a-st cifra pb-1.5 text-right text-lg ${e.completa ? "text-grafito" : "text-kraft"}`}>{e.completa ? clp(e.subtotal) : "—"}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    if (filas.length === 1) setFilas([filaVacia()]);
                    else setFilas((fs) => fs.filter((x) => x.k !== f.k));
                  }}
                  className="a-x pb-1.5 text-kraft hover:text-fuji"
                  aria-label={`Borrar línea ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

          </>
        )}

        {/* total */}
        <div className="mt-5 flex items-end justify-between gap-4">
          <span className="text-sm text-gris">
            {soloMonto ? "Sin productos" : `${completas} ${completas === 1 ? "línea" : "líneas"}`}
          </span>
          <p className="flex items-baseline gap-3">
            <span className="rotulo">Total</span>
            <span className="doble-raya text-[34px] leading-none sm:text-[40px]">
              <MontoGrande valor={total} deuda={false} />
            </span>
          </p>
        </div>

        {/* forma de pago */}
        <div className="mt-6 border-t border-linea pt-5">
          <span className="rotulo">Forma de pago</span>
          <div
            ref={r("forma")}
            tabIndex={0}
            role="radiogroup"
            aria-label="Forma de pago: E efectivo, T transferencia, C crédito"
            onKeyDown={onForma}
            className="mt-2 flex flex-wrap gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-tinta/40 focus-visible:ring-offset-4"
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
                  className="opcion"
                  style={on && k === "CREDITO" ? { background: "#b4412f", borderColor: "#b4412f" } : undefined}
                >
                  {FORMA[k].label}
                  <span className="tecla hidden md:inline-flex">{FORMA[k].tecla}</span>
                </button>
              );
            })}
          </div>

          {forma === "CREDITO" && (
            <div className="animate-entra mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
              <label className="flex items-end gap-2">
                <span className="pb-1.5 text-sm text-gris">Abona ahora</span>
                <input
                  value={abono}
                  onChange={(e) => setAbono(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      guardar();
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
                  className="pb-1.5 text-sm text-tinta underline decoration-dotted underline-offset-4"
                >
                  {abonoForma === "EFECTIVO" ? "en efectivo" : "por transferencia"}
                </button>
              </label>
              {cli && (
                <p className="text-sm text-gris">
                  Queda debiendo <b className="cifra text-lg text-fuji">{clp(nuevoSaldo)}</b>
                </p>
              )}
            </div>
          )}

          {alerta && (
            <p className="animate-entra mt-4 border-l-2 border-fuji pl-3 text-sm">
              <b className="text-fuji">{alerta === "MOROSO" ? "Cliente moroso." : "Pasa su tope de crédito."}</b>{" "}
              {confirmarMoroso ? "Presiona Guardar otra vez para fiar igual." : "Se pedirá confirmar al guardar."}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-sm ${escUna ? "font-semibold text-fuji" : "hidden text-gris md:block"}`}>
              {escUna ? "Presiona Esc otra vez para limpiar el vale" : soloMonto ? "Enter avanza · 150k = $150.000" : "Enter avanza · 5c = 5 cajas · 12k = $12.000"}
            </p>
            <button type="button" onClick={guardar} className="btn btn-primario px-6 py-3 text-lg">
              Guardar vale
              <span className="tecla hidden md:inline-flex">Ctrl ↵</span>
            </button>
          </div>
        </div>
      </section>

      <aside className="min-w-0">
        <Colillas data={data} tipos={["VALE_VENTA", "VALE_CREDITO", "ABONO"]} ultimoId={ultimoId} titulo="Hoy" />
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
          setCliente({
            cliente: c, saldo: 0, ultimoPago: null, ultimaCompra: null, diasSinPagar: null, diasSinComprar: null,
            valeMasAntiguo: null, semaforoCalc: "VERDE", semaforo: "VERDE", manual: false, compra: true, compras30: 0,
            pendientes: [], sobreLimite: false,
          });
          avisar({ titulo: "Cliente creado", detalle: c.nombre, tono: "tinta" });
          foco(primerCampo());
        }}
      />
    </div>
    </>
  );
}
