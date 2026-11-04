"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Envase, FormaPago } from "@/lib/types";
import { guardarEnvase, registrarEnvases, useData } from "@/lib/store";
import { envasesPorCliente } from "@/lib/calc";
import { clp, hoy, miles, parseMonto } from "@/lib/format";
import { Autocompletar } from "../Autocompletar";
import { filtrarClientes, OpcionCliente, useEstados } from "../clientes";
import { Encabezado } from "../Encabezado";
import { useAviso } from "../Shell";
import { Colillas } from "../vale/Colillas";

const PASOS = [
  { titulo: "Entrega o devolución", texto: "«Entrega»: el cliente se lleva envases y paga su valor. «Devolución»: los trae de vuelta y se le devuelve esa plata." },
  { titulo: "Cliente", texto: "Escriba nombre o alias. Se muestran los envases que tiene en su poder." },
  { titulo: "Cantidades", texto: "Escriba cuántos de cada tipo. El valor de cada envase se fija en la pestaña «Precios»." },
  { titulo: "Pago", texto: "Entrega: efectivo, transferencia o a crédito (suma a su deuda). Devolución: efectivo (sale de caja), transferencia o descontar de su deuda." },
];

type Tipo = "ENVASE_COBRO" | "ENVASE_DEVOLUCION";

const FORMAS: Record<Tipo, { k: FormaPago; label: string; ayuda: string }[]> = {
  ENVASE_COBRO: [
    { k: "EFECTIVO", label: "Efectivo", ayuda: "Entra al cajón" },
    { k: "TRANSFERENCIA", label: "Transferencia", ayuda: "Revisar en el banco" },
    { k: "CREDITO", label: "A crédito", ayuda: "Se suma a su deuda" },
  ],
  ENVASE_DEVOLUCION: [
    { k: "EFECTIVO", label: "Efectivo", ayuda: "Sale del cajón" },
    { k: "TRANSFERENCIA", label: "Transferencia", ayuda: "Se le transfiere" },
    { k: "CREDITO", label: "Descontar de su deuda", ayuda: "Rebaja lo que debe" },
  ],
};

export function Envases() {
  const data = useData()!;
  const estados = useEstados(data);
  const avisar = useAviso();
  const params = useSearchParams();
  const activos = useMemo(() => data.db.envases.filter((e) => e.activo).sort((a, b) => a.orden - b.orden), [data]);
  const porCliente = useMemo(() => envasesPorCliente(data.db, data.idx), [data]);

  const [tipo, setTipo] = useState<Tipo>("ENVASE_COBRO");
  const [vista, setVista] = useState<"mov" | "precios">(() => (params.get("vista") === "precios" ? "precios" : "mov"));
  const [q, setQ] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [cant, setCant] = useState<Record<string, string>>({});
  const [forma, setForma] = useState<FormaPago>("EFECTIVO");
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const primerCant = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = params.get("cliente");
    if (id && estados.has(id) && !clienteId) {
      const e = estados.get(id)!;
      setClienteId(id);
      setQ(e.cliente.alias ?? e.cliente.nombre);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, estados]);

  const est = clienteId ? estados.get(clienteId) ?? null : null;
  const tiene = new Map((clienteId ? porCliente.get(clienteId) ?? [] : []).map((s) => [s.envase_id, s]));
  const lineas = activos
    .map((e) => ({ e, n: parseInt((cant[e.id] ?? "").replace(/\D/g, ""), 10) || 0 }))
    .filter((x) => x.n > 0)
    .map((x) => ({ envase_id: x.e.id, cantidad: x.n, precio_unitario: x.e.precio, nombre: x.e.nombre }));
  const total = lineas.reduce((a, l) => a + l.cantidad * l.precio_unitario, 0);
  const excede = tipo === "ENVASE_DEVOLUCION" ? lineas.filter((l) => l.cantidad > (tiene.get(l.envase_id)?.cantidad ?? 0)) : [];

  const cambiarTipo = (t: Tipo) => {
    setVista("mov");
    setTipo(t);
    setForma("EFECTIVO");
    setError(null);
  };

  const guardar = (ev?: FormEvent) => {
    ev?.preventDefault();
    setError(null);
    if (!est) return setError("Elija el cliente.");
    if (!lineas.length) return setError("Indique la cantidad de al menos un tipo de envase.");
    const sinPrecio = lineas.filter((l) => l.precio_unitario <= 0);
    if (sinPrecio.length)
      return setError(`Falta la garantía de ${sinPrecio.map((l) => l.nombre).join(", ")}: póngaselo en la pestaña «Precios».`);
    const mov = registrarEnvases({
      tipo,
      cliente_id: est.cliente.id,
      fecha,
      forma,
      lineas: lineas.map(({ envase_id, cantidad, precio_unitario }) => ({ envase_id, cantidad, precio_unitario })),
      glosa: nota.trim() || (tipo === "ENVASE_DEVOLUCION" && forma === "CREDITO" ? "Descontado de su deuda" : null),
    });
    setUltimoId(mov.id);
    const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
    avisar({
      titulo: `${tipo === "ENVASE_COBRO" ? "Entrega" : "Devolución"} N°${mov.numero} registrada`,
      detalle: `${est.cliente.alias ?? est.cliente.nombre} · ${unidades} envases · ${clp(total)}`,
      tono: tipo === "ENVASE_COBRO" ? "ok" : "tinta",
    });
    setCant({});
    setNota("");
    setFecha(hoy());
  };

  // envases en la calle (todos los clientes)
  const enLaCalle = useMemo(() => {
    const porTipo = new Map<string, { cantidad: number; garantia: number }>();
    const clientes: { id: string; nombre: string; unidades: number; garantia: number; detalle: string }[] = [];
    porCliente.forEach((xs, id) => {
      const c = data.idx.cliente.get(id);
      let u = 0, g = 0;
      for (const s of xs) {
        const t = porTipo.get(s.envase_id) ?? { cantidad: 0, garantia: 0 };
        t.cantidad += s.cantidad;
        t.garantia += s.garantia;
        porTipo.set(s.envase_id, t);
        u += s.cantidad;
        g += s.garantia;
      }
      if (u !== 0 || g !== 0)
        clientes.push({
          id,
          nombre: c ? (c.alias ?? c.nombre) : "—",
          unidades: u,
          garantia: g,
          detalle: xs.filter((s) => s.cantidad).map((s) => `${s.cantidad} ${data.db.envases.find((e) => e.id === s.envase_id)?.nombre ?? ""}`).join(" · "),
        });
    });
    clientes.sort((a, b) => b.garantia - a.garantia);
    return { porTipo, clientes };
  }, [porCliente, data]);
  const garantiaTotal = enLaCalle.clientes.reduce((a, c) => a + c.garantia, 0);

  const sinPrecio = activos.filter((e) => e.precio <= 0);
  const pestanas = (
    <div className="flex w-full rounded-md border border-kraft bg-hoja p-0.5 sm:inline-flex sm:w-auto" role="tablist" aria-label="Envases">
      {(
        [
          ["ENVASE_COBRO", "Entrega", " de envases"],
          ["ENVASE_DEVOLUCION", "Devolución", " de envases"],
          ["PRECIOS", "Precios", " de envases"],
        ] as const
      ).map(([k, l, extra]) => {
        const activa = k === "PRECIOS" ? vista === "precios" : vista === "mov" && tipo === k;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => (k === "PRECIOS" ? setVista("precios") : cambiarTipo(k))}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium sm:flex-none sm:px-4 ${activa ? "bg-tinta text-white" : "text-gris hover:text-grafito"}`}
          >
            {l}
            <span className="hidden md:inline">{extra}</span>
            {k === "PRECIOS" && sinPrecio.length > 0 && <span className={`ml-1.5 inline-block size-2 rounded-full ${activa ? "bg-white" : "bg-limon"}`} aria-label="falta precio" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <Encabezado href="/envases" bajada="El cliente paga los envases que se lleva y se le devuelve esa plata cuando los trae." pasos={PASOS} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {vista === "precios" ? (
          <div className="hoja mx-auto w-full max-w-[880px] space-y-5 px-4 py-5 sm:px-7 sm:py-6">
            {pestanas}
            <PreciosEnvases />
          </div>
        ) : (
        <form onSubmit={guardar} className="hoja mx-auto w-full max-w-[880px] space-y-5 px-4 py-5 sm:px-7 sm:py-6">
          {pestanas}
          <div>
            <label className="flex items-center gap-1.5 text-sm">
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

          <div>
            <span className="rotulo">Cliente</span>
            <Autocompletar
              etiqueta="Cliente"
              inputClassName="font-sans text-[20px] font-semibold"
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
                setClienteId(e.cliente.id);
                setQ(e.cliente.alias ?? e.cliente.nombre);
                setTimeout(() => primerCant.current?.focus(), 0);
              }}
              placeholder="Nombre o alias del cliente"
            />
            {est && (
              <p className="mt-2 text-sm text-gris">
                {tiene.size ? (
                  <>
                    En su poder:{" "}
                    <b className="text-grafito">
                      {[...tiene.values()]
                        .filter((s) => s.cantidad)
                        .map((s) => `${s.cantidad} ${data.db.envases.find((e) => e.id === s.envase_id)?.nombre ?? ""}`)
                        .join(" · ") || "ninguno"}
                    </b>{" "}
                    · pagó {clp([...tiene.values()].reduce((a, s) => a + s.garantia, 0))}
                  </>
                ) : (
                  "No tiene envases registrados."
                )}
                {est.saldo > 0 && <span> · debe {clp(est.saldo)}</span>}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm text-gris">
              {tipo === "ENVASE_COBRO"
                ? "Escriba cuántos envases se lleva el cliente. Se le cobra el valor de cada envase y se le devuelve cuando los traiga."
                : "Escriba cuántos envases trae de vuelta. Se le devuelve el valor que pagó por ellos."}
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-end gap-x-3 border-b border-linea pb-1 text-xs font-semibold text-gris">
              <span>Envase</span>
              <span className="text-right">Cantidad</span>
              <span className="text-right">{tipo === "ENVASE_COBRO" ? "A cobrar" : "A devolver"}</span>
            </div>
            {activos.map((e, i) => {
              const n = parseInt((cant[e.id] ?? "").replace(/\D/g, ""), 10) || 0;
              const t = tiene.get(e.id)?.cantidad ?? 0;
              return (
                <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-x-3 border-b border-linea py-2">
                  <span className="min-w-0">
                    <b className="block font-medium leading-tight">{e.nombre}</b>
                    <span className="block text-xs text-gris">
                      {e.precio > 0 ? (
                        <>{clp(e.precio)} c/u</>
                      ) : (
                        <button type="button" tabIndex={-1} onClick={() => setVista("precios")} className="font-semibold text-limon hover:underline">
                          sin precio: ponerle precio
                        </button>
                      )}
                      {est && <> · tiene {t}</>}
                    </span>
                  </span>
                  <input
                    ref={i === 0 ? primerCant : undefined}
                    value={cant[e.id] ?? ""}
                    onChange={(ev) => setCant({ ...cant, [e.id]: ev.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={`Cantidad de ${e.nombre}`}
                    className="campo py-1.5 text-right text-lg font-semibold"
                  />
                  <span className="cifra text-right">{n ? clp(n * e.precio) : "—"}</span>
                </div>
              );
            })}
            {!activos.length && <p className="py-4 text-gris">No hay tipos de envase. Agréguelos en la pestaña «Precios».</p>}
            <p className="mt-3 flex items-baseline justify-end gap-3">
              <span className="rotulo">{tipo === "ENVASE_COBRO" ? "Total a cobrar" : "Total a devolverle"}</span>
              <span className={`cifra doble-raya text-[28px] font-semibold ${tipo === "ENVASE_DEVOLUCION" ? "text-limon" : ""}`}>{clp(total)}</span>
            </p>
            {excede.length > 0 && (
              <p className="mt-2 rounded-md bg-platano-suave px-3 py-2 text-sm">
                Devuelve más de lo registrado: {excede.map((l) => `${l.nombre} (tiene ${tiene.get(l.envase_id)?.cantidad ?? 0})`).join(", ")}. Se puede guardar igual (p. ej. envases de antes del sistema).
              </p>
            )}
          </div>

          <div>
            <span className="rotulo">{tipo === "ENVASE_COBRO" ? "¿Cómo paga los envases?" : "¿Cómo se le devuelve la plata?"}</span>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup">
              {FORMAS[tipo].map((f) => (
                <button key={f.k} type="button" role="radio" aria-checked={forma === f.k} onClick={() => setForma(f.k)} className="opcion flex-col items-start py-1.5 text-left">
                  <span>{f.label}</span>
                  <span className={`text-[11px] font-normal ${forma === f.k ? "text-white/80" : "text-gris"}`}>{f.ayuda}</span>
                </button>
              ))}
            </div>
          </div>

          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" className="campo" />
          {error && <p className="text-sm font-medium text-fuji">{error}</p>}
          <div className="flex justify-end border-t border-linea pt-4">
            <button type="submit" className="btn btn-primario px-6 py-2.5">
              {tipo === "ENVASE_COBRO" ? "Registrar entrega" : "Registrar devolución"}
            </button>
          </div>
        </form>
        )}

        <aside className="min-w-0 space-y-6">
          <section className="hoja" aria-label="Envases en la calle">
            <header className="flex items-baseline justify-between border-b border-linea px-4 py-3">
              <h2 className="font-semibold">Envases en la calle</h2>
              <Link href="/imprimir/envases" target="_blank" className="text-sm font-medium text-tinta hover:underline">
                Imprimir
              </Link>
            </header>
            <ul className="divide-y divide-linea px-4 text-sm">
              {activos.map((e) => {
                const t = enLaCalle.porTipo.get(e.id);
                return (
                  <li key={e.id} className="flex justify-between py-2">
                    <span>{e.nombre}</span>
                    <span className="cifra">
                      <b className="font-semibold">{t?.cantidad ?? 0}</b> <span className="text-gris">· {clp(t?.garantia ?? 0)}</span>
                    </span>
                  </li>
                );
              })}
              <li className="flex justify-between py-2 font-semibold">
                <span>Valor de envases en la calle</span>
                <span className="cifra">{clp(garantiaTotal)}</span>
              </li>
            </ul>
            <div className="border-t border-linea">
              <p className="px-4 pt-3 text-xs font-semibold text-gris">Clientes con envases</p>
              <ul className="max-h-72 overflow-auto px-4 pb-2 text-sm">
                {enLaCalle.clientes.slice(0, 40).map((c) => (
                  <li key={c.id} className="border-b border-linea py-1.5 last:border-0">
                    <button
                      type="button"
                      onClick={() => {
                        setClienteId(c.id);
                        setQ(c.nombre);
                      }}
                      className="flex w-full justify-between gap-2 text-left hover:text-tinta"
                    >
                      <span className="min-w-0">
                        <b className="block truncate font-medium">{c.nombre}</b>
                        <span className="block truncate text-xs text-gris">{c.detalle}</span>
                      </span>
                      <span className="cifra shrink-0">{clp(c.garantia)}</span>
                    </button>
                  </li>
                ))}
                {!enLaCalle.clientes.length && <li className="py-4 text-center text-gris">Ningún cliente tiene envases.</li>}
              </ul>
            </div>
          </section>
          <Colillas data={data} tipos={["ENVASE_COBRO", "ENVASE_DEVOLUCION"]} ultimoId={ultimoId} titulo="Envases de hoy" />
        </aside>
      </div>
    </>
  );
}

const NUEVO = "__nuevo__";

/** Precios (garantía) de cada tipo de envase: se elige de la lista y se cambia. */
function PreciosEnvases() {
  const data = useData()!;
  const avisar = useAviso();
  const envases = useMemo(
    () => [...data.db.envases].sort((a, b) => Number(b.activo) - Number(a.activo) || a.orden - b.orden),
    [data],
  );
  const [sel, setSel] = useState<string>(() => envases[0]?.id ?? NUEVO);
  const actual = envases.find((e) => e.id === sel) ?? null;
  const [nombre, setNombre] = useState(actual?.nombre ?? "");
  const [precio, setPrecio] = useState(actual && actual.precio > 0 ? miles(actual.precio) : "");
  const [error, setError] = useState<string | null>(null);
  const precioRef = useRef<HTMLInputElement | null>(null);

  const elegir = (id: string, enfocar = false) => {
    const e = envases.find((x) => x.id === id) ?? null;
    setSel(id);
    setNombre(e?.nombre ?? "");
    setPrecio(e && e.precio > 0 ? miles(e.precio) : "");
    setError(null);
    if (enfocar) setTimeout(() => precioRef.current?.focus(), 0);
  };

  const nuevoPrecio = parseMonto(precio);
  const cambiado = actual ? nombre.trim() !== actual.nombre || (nuevoPrecio ?? -1) !== actual.precio : true;
  const faltan = envases.filter((e) => e.activo && e.precio <= 0);

  const guardar = (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    const n = nombre.trim();
    if (!n) return setError("Escriba el nombre del envase.");
    if (nuevoPrecio === null || nuevoPrecio <= 0) return setError("Escriba el precio por envase (mayor a $0).");
    const repetido = envases.find((e) => e.id !== actual?.id && normalizarNombre(e.nombre) === normalizarNombre(n));
    if (repetido) return setError(`Ya existe un envase llamado ${repetido.nombre}.`);
    const e = guardarEnvase({ id: actual?.id, nombre: n, precio: nuevoPrecio, activo: actual?.activo ?? true });
    avisar({
      titulo: actual ? "Precio guardado" : "Envase agregado",
      detalle: `${e.nombre} · ${clp(e.precio)} por envase`,
      tono: "ok",
    });
    setSel(e.id);
    setNombre(e.nombre);
    setPrecio(miles(e.precio));
  };

  return (
    <section aria-label="Precios de envases">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linea pb-3">
        <span>
          <h2 className="font-semibold">Precios de envases</h2>
          <span className="block text-sm text-gris">Lo que se cobra por cada envase al entregarlo (y se devuelve cuando lo traen). Elija uno para cambiar su precio.</span>
        </span>
        {faltan.length > 0 && (
          <span className="rounded-md bg-platano-suave px-2.5 py-1 text-sm">
            Falta precio: <b className="font-semibold">{faltan.map((e) => e.nombre).join(", ")}</b>
          </span>
        )}
      </header>
      <div className="grid gap-6 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={guardar} className="space-y-3">
          <label className="block">
            <span className="rotulo">Envase</span>
            <select value={sel} onChange={(e) => elegir(e.target.value, true)} className="campo mt-1 w-full" aria-label="Elegir envase">
              {envases.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} — {e.precio > 0 ? clp(e.precio) : "sin precio"}
                  {e.activo ? "" : " (oculto)"}
                </option>
              ))}
              <option value={NUEVO}>＋ Agregar un envase nuevo…</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <label className="block">
              <span className="rotulo">Nombre</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej: Caja plástica 20 kg" className="campo mt-1 w-full" aria-label="Nombre del envase" />
            </label>
            <label className="block">
              <span className="rotulo">Precio por envase</span>
              <input
                ref={precioRef}
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                placeholder="$"
                className="campo mt-1 w-full text-right text-lg font-semibold"
                aria-label="Precio por envase"
              />
            </label>
          </div>
          {actual && (
            <p className="text-sm text-gris">
              Precio actual: <b className="text-grafito">{actual.precio > 0 ? clp(actual.precio) : "sin precio"}</b>
              {nuevoPrecio !== null && nuevoPrecio !== actual.precio && nuevoPrecio > 0 && (
                <>
                  {" "}
                  → nuevo: <b className="text-tinta">{clp(nuevoPrecio)}</b>
                </>
              )}
              . Rige para las próximas entregas; lo ya cobrado no cambia.
            </p>
          )}
          {error && <p className="text-sm font-medium text-fuji">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!cambiado} className="btn btn-primario px-5 disabled:opacity-50">
              {actual ? "Guardar precio" : "Agregar envase"}
            </button>
            {actual && (
              <button
                type="button"
                onClick={() => {
                  guardarEnvase({ id: actual.id, nombre: actual.nombre, precio: actual.precio, activo: !actual.activo });
                  avisar({ titulo: actual.activo ? "Envase oculto" : "Envase en uso", detalle: actual.nombre, tono: "tinta" });
                }}
                className="text-sm font-medium text-gris hover:text-grafito"
              >
                {actual.activo ? "Ocultar de la entrega" : "Volver a usar"}
              </button>
            )}
          </div>
        </form>

        <div>
          <span className="rotulo">Lista de precios</span>
          <ul className="mt-1 divide-y divide-linea rounded-md border border-linea">
            {envases.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => elegir(e.id, true)}
                  aria-current={e.id === sel}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-verde-suave ${e.id === sel ? "bg-verde-suave" : ""} ${e.activo ? "" : "opacity-50"}`}
                >
                  <span className="min-w-0 truncate font-medium">
                    {e.nombre}
                    {!e.activo && <span className="ml-2 text-xs font-normal text-gris">oculto</span>}
                  </span>
                  {e.precio > 0 ? <span className="cifra shrink-0">{clp(e.precio)}</span> : <span className="shrink-0 text-sm font-semibold text-limon">sin precio</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gris">Los cambios de precio quedan en la bitácora.</p>
        </div>
      </div>
    </section>
  );
}

function normalizarNombre(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
