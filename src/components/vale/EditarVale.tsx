"use client";
import { useMemo, useState } from "react";
import type { FormaPago, Movimiento, Unidad } from "@/lib/types";
import { cambiosPendientes, recargarDelServidor, useData } from "@/lib/store";
import { clp, miles, parseCantidad, parseMonto } from "@/lib/format";
import { FORMA } from "../ui";

interface Linea {
  k: string;
  cantidad: string;
  unidad: Unidad;
  producto_id: string;
  precio: string;
}

let n = 0;
const k = () => `l${++n}`;

async function llamar(method: "PATCH" | "DELETE", body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch("/api/admin/movimientos", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { ok: false, error: "Sin conexión." };
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, error: j.error };
}

/** Edición completa de un vale (solo administradores; el servidor lo vuelve a validar). */
export function EditarVale({ mov, onListo, onCancelar }: { mov: Movimiento; onListo: (msg: string) => void; onCancelar: () => void }) {
  const data = useData()!;
  const lineas0 = data.idx.lineasMov.get(mov.id) ?? [];
  const pagadoEnVale = data.db.movimientos.filter((m) => m.origen_id === mov.id && !m.anulado_at);
  const [numero, setNumero] = useState(String(mov.numero));
  const [fecha, setFecha] = useState(mov.fecha);
  const [cliente, setCliente] = useState(mov.cliente_id ?? "");
  const [forma, setForma] = useState<FormaPago>(mov.forma_pago);
  const [glosa, setGlosa] = useState(mov.glosa ?? "");
  const [conProductos, setConProductos] = useState(lineas0.length > 0);
  const [lineas, setLineas] = useState<Linea[]>(
    lineas0.length
      ? lineas0.map((l) => ({ k: k(), cantidad: String(l.cantidad).replace(".", ","), unidad: l.unidad, producto_id: l.producto_id, precio: miles(l.precio_unitario) }))
      : [],
  );
  const [monto, setMonto] = useState(lineas0.length ? "" : miles(mov.total));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const clientes = useMemo(() => [...data.db.clientes].sort((a, b) => (a.alias ?? a.nombre).localeCompare(b.alias ?? b.nombre, "es")), [data]);
  const productos = useMemo(
    () => data.db.productos.filter((p) => p.activo || lineas0.some((l) => l.producto_id === p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [data, lineas0],
  );
  const calc = lineas.map((l) => {
    const c = parseCantidad(l.cantidad), p = parseMonto(l.precio);
    return { c, p, sub: c && p ? Math.round(c * p) : 0 };
  });
  const total = conProductos ? calc.reduce((a, x) => a + x.sub, 0) : (parseMonto(monto) ?? 0);
  const pagado = pagadoEnVale.reduce((a, m) => a + m.total, 0);

  const setLinea = (key: string, cambio: Partial<Linea>) => setLineas((xs) => xs.map((x) => (x.k === key ? { ...x, ...cambio } : x)));

  const guardar = async () => {
    setError(null);
    if (cambiosPendientes()) return setError("Hay cambios de este equipo sin enviar. Espere a que diga «Guardado» y vuelva a intentar.");
    if (motivo.trim().length < 3) return setError("Escriba el motivo del cambio.");
    const num = parseInt(numero.replace(/\D/g, ""), 10);
    if (!num) return setError("Escriba el N° de vale.");
    if (conProductos) {
      if (!lineas.length) return setError("Agregue al menos un producto, o cambie a «solo monto».");
      const mala = calc.findIndex((x, i) => !x.c || !x.p || !lineas[i].producto_id);
      if (mala >= 0) return setError(`Revise la línea ${mala + 1}: cantidad, producto y precio.`);
    } else if (!total) return setError("Escriba el monto.");
    setGuardando(true);
    const r = await llamar("PATCH", {
      id: mov.id,
      motivo: motivo.trim(),
      numero: num,
      fecha,
      cliente_id: cliente,
      forma_pago: forma,
      glosa: glosa.trim() || null,
      ...(conProductos
        ? { lineas: lineas.map((l, i) => ({ cantidad: calc[i].c, unidad: l.unidad, producto_id: l.producto_id, precio_unitario: calc[i].p })) }
        : { lineas: [], monto: total }),
    });
    if (!r.ok) {
      setGuardando(false);
      return setError(r.error ?? "No se pudo guardar.");
    }
    await recargarDelServidor();
    setGuardando(false);
    onListo(`Vale N°${num} guardado · ${clp(total)}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold">Editar vale</p>
        <span className="rounded bg-platano-suave px-2 py-0.5 text-xs font-semibold">Solo administrador</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="rotulo">N° de vale</span>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" className="campo mt-1 w-full text-lg font-semibold" aria-label="N° de vale" />
        </label>
        <label className="block">
          <span className="rotulo">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="campo mt-1 w-full" aria-label="Fecha del vale" />
        </label>
      </div>

      <label className="block">
        <span className="rotulo">Cliente</span>
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="campo mt-1 w-full" aria-label="Cliente del vale">
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.alias ?? c.nombre}
              {c.alias && c.alias !== c.nombre ? ` (${c.nombre})` : ""}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="rotulo">Forma de pago</span>
        <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Forma de pago del vale">
          {(Object.keys(FORMA) as FormaPago[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={forma === f}
              disabled={pagadoEnVale.length > 0}
              onClick={() => setForma(f)}
              className="opcion py-1.5 text-sm disabled:opacity-40"
            >
              {FORMA[f].label}
            </button>
          ))}
        </div>
        {pagadoEnVale.length > 0 && (
          <p className="mt-1 text-xs text-gris">
            Tiene pago combinado ({clp(pagado)} pagados en el vale): la forma de pago no se cambia. Para cambiarla, bórrelo y hágalo de nuevo.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="rotulo">{conProductos ? "Productos" : "Monto (sin productos)"}</span>
          <button
            type="button"
            onClick={() => {
              if (conProductos) {
                setMonto(miles(total));
                setConProductos(false);
              } else {
                setConProductos(true);
                if (!lineas.length) setLineas([{ k: k(), cantidad: "1", unidad: "CAJA", producto_id: productos[0]?.id ?? "", precio: "" }]);
              }
            }}
            className="text-xs font-medium text-tinta hover:underline"
          >
            {conProductos ? "cambiar a solo monto" : "detallar productos"}
          </button>
        </div>
        {conProductos ? (
          <div className="mt-1.5 space-y-2">
            {lineas.map((l, i) => (
              <div key={l.k} className="grid grid-cols-[4.5rem_5.5rem_minmax(0,1fr)] gap-1.5 sm:grid-cols-[4.5rem_5.5rem_minmax(0,1fr)_6.5rem_auto]">
                <input value={l.cantidad} onChange={(e) => setLinea(l.k, { cantidad: e.target.value })} inputMode="decimal" className="campo py-1.5 text-right" aria-label={`Cantidad línea ${i + 1}`} />
                <select value={l.unidad} onChange={(e) => setLinea(l.k, { unidad: e.target.value as Unidad })} className="campo py-1.5" aria-label={`Unidad línea ${i + 1}`}>
                  <option value="CAJA">Caja</option>
                  <option value="ENVASE">Bin</option>
                  <option value="KG">Kg</option>
                </select>
                <select
                  value={l.producto_id}
                  onChange={(e) => setLinea(l.k, { producto_id: e.target.value })}
                  className="campo py-1.5"
                  aria-label={`Producto línea ${i + 1}`}
                >
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <input value={l.precio} onChange={(e) => setLinea(l.k, { precio: e.target.value })} inputMode="numeric" placeholder="$ precio" className="campo col-span-2 py-1.5 text-right sm:col-span-1" aria-label={`Precio línea ${i + 1}`} />
                <span className="flex items-center justify-end gap-2">
                  <span className="cifra text-sm">{calc[i].sub ? clp(calc[i].sub) : "—"}</span>
                  <button type="button" onClick={() => setLineas((xs) => xs.filter((x) => x.k !== l.k))} className="text-sm text-gris hover:text-fuji" aria-label={`Quitar línea ${i + 1}`}>
                    ✕
                  </button>
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLineas((xs) => [...xs, { k: k(), cantidad: "1", unidad: "CAJA", producto_id: productos[0]?.id ?? "", precio: "" }])}
              className="text-sm font-medium text-tinta hover:underline"
            >
              + agregar producto
            </button>
          </div>
        ) : (
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" placeholder="$" className="campo mt-1.5 w-48 text-right text-lg font-semibold" aria-label="Monto del vale" />
        )}
        <p className="mt-2 flex items-baseline justify-between border-t border-linea pt-2">
          <span className="text-sm text-gris">
            Antes {clp(mov.total)}
            {pagado > 0 && ` · pagado en el vale ${clp(pagado)}`}
          </span>
          <span>
            <span className="rotulo mr-2">Total</span>
            <b className="cifra text-xl">{clp(total)}</b>
          </span>
        </p>
      </div>

      <label className="block">
        <span className="rotulo">Detalle (opcional)</span>
        <input value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo mt-1 w-full" aria-label="Detalle del vale" />
      </label>
      <label className="block">
        <span className="rotulo">Motivo del cambio (obligatorio)</span>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej: se anotó mal el precio" className="campo mt-1 w-full" aria-label="Motivo del cambio" />
      </label>
      <p className="text-xs text-gris">Queda en el historial con el antes y el después, a su nombre.</p>
      {error && <p className="text-sm font-medium text-fuji">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-linea pt-4">
        <button type="button" onClick={onCancelar} className="btn btn-secundario">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={guardando} className="btn btn-primario disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

/** Borrar definitivamente (solo administradores). Queda copia en el historial. */
export function BorrarMovimiento({ mov, onListo, onCancelar }: { mov: Movimiento; onListo: (msg: string) => void; onCancelar: () => void }) {
  const data = useData()!;
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const ligados = data.db.movimientos.filter((m) => m.origen_id === mov.id);
  const borrar = async () => {
    setError(null);
    if (cambiosPendientes()) return setError("Hay cambios de este equipo sin enviar. Espere a que diga «Guardado» y vuelva a intentar.");
    if (motivo.trim().length < 3) return setError("Escriba el motivo.");
    setBorrando(true);
    const r = await llamar("DELETE", { id: mov.id, motivo: motivo.trim() });
    if (!r.ok) {
      setBorrando(false);
      return setError(r.error ?? "No se pudo borrar.");
    }
    await recargarDelServidor();
    onListo(`N°${mov.numero} borrado`);
  };
  return (
    <div className="mt-5 space-y-3 border-t border-linea pt-4">
      <p className="text-sm font-semibold text-fuji">Borrar N°{mov.numero} definitivamente</p>
      <p className="text-sm text-gris">
        Desaparece de la caja, la cuenta del cliente y los reportes{ligados.length ? `, junto con ${ligados.length} pago${ligados.length > 1 ? "s" : ""} hecho${ligados.length > 1 ? "s" : ""} en este mismo vale` : ""}. Queda una copia completa en el historial a su nombre. Si solo hubo un error, «Anular» deja el vale visible tachado.
      </p>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obligatorio)" className="campo w-full" aria-label="Motivo del borrado" autoFocus />
      {error && <p className="text-sm font-medium text-fuji">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="btn btn-secundario">
          Volver
        </button>
        <button type="button" onClick={borrar} disabled={borrando || motivo.trim().length < 3} className="btn bg-fuji text-hoja disabled:opacity-40">
          {borrando ? "Borrando…" : "Borrar definitivamente"}
        </button>
      </div>
    </div>
  );
}
