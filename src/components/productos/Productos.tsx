"use client";
import { useMemo, useState, type FormEvent } from "react";
import type { Producto, Unidad } from "@/lib/types";
import { guardarProducto, useData } from "@/lib/store";
import { clp, iniciales, normalizar } from "@/lib/format";
import { useAviso } from "../Shell";

const UNIDADES: { k: Unidad; label: string }[] = [
  { k: "CAJA", label: "Caja" },
  { k: "ENVASE", label: "Envase" },
  { k: "KG", label: "Kilo" },
];
const COLORES = ["#C4262E", "#9E1B32", "#D2553A", "#E07B24", "#EE8A1E", "#E39B2D", "#D9B638", "#A8B84A", "#5E8C31", "#9DA83A", "#6B2A55", "#3E2A4F", "#B04A6A", "#8A7A3A", "#A27B4B"];

interface Form {
  id?: string;
  nombre: string;
  codigo: string;
  unidad_default: Unidad;
  color: string;
}
const VACIO: Form = { nombre: "", codigo: "", unidad_default: "CAJA", color: COLORES[0] };

/** Código sugerido a partir del nombre: iniciales, sin repetir otro activo. */
function sugerirCodigo(nombre: string, usados: Set<string>): string {
  const ini = iniciales(nombre).toUpperCase();
  const palabras = normalizar(nombre).toUpperCase().split(" ").filter(Boolean);
  const candidatos = [
    ini.length >= 2 ? ini : (palabras[0] ?? "").slice(0, 2),
    palabras.length > 1 ? palabras[0][0] + palabras[1].slice(0, 2) : (palabras[0] ?? "").slice(0, 3),
    (palabras[0] ?? "").slice(0, 3),
  ].map((c) => c.slice(0, 5)).filter(Boolean);
  for (const c of candidatos) if (!usados.has(c)) return c;
  const base = candidatos[0] ?? "P";
  for (let i = 2; i < 100; i++) if (!usados.has(`${base}${i}`)) return `${base}${i}`.slice(0, 5);
  return base;
}

export function Productos() {
  const data = useData()!;
  const avisar = useAviso();
  const [f, setF] = useState<Form>(VACIO);
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [verOcultos, setVerOcultos] = useState(false);

  // cuántas veces se vendió cada producto y su último precio (para orientar)
  const uso = useMemo(() => {
    const m = new Map<string, { n: number; precio: number | null }>();
    for (const l of data.db.lineas) {
      const x = m.get(l.producto_id) ?? { n: 0, precio: null };
      x.n++;
      x.precio = l.precio_unitario;
      m.set(l.producto_id, x);
    }
    return m;
  }, [data]);

  const usados = useMemo(
    () => new Set(data.db.productos.filter((p) => p.activo && p.id !== f.id).map((p) => p.codigo.toUpperCase())),
    [data, f.id],
  );
  const lista = useMemo(() => {
    const nq = normalizar(q);
    return [...data.db.productos]
      .filter((p) => (verOcultos ? true : p.activo))
      .filter((p) => !nq || normalizar(`${p.nombre} ${p.codigo}`).includes(nq))
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, "es"));
  }, [data, q, verOcultos]);
  const ocultos = data.db.productos.filter((p) => !p.activo).length;

  const editar = (p: Producto) => {
    setF({ id: p.id, nombre: p.nombre, codigo: p.codigo, unidad_default: p.unidad_default, color: p.color });
    setCodigoTocado(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nuevo = () => {
    setF(VACIO);
    setCodigoTocado(false);
    setError(null);
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    const err = guardarProducto(f);
    if (err) return setError(err);
    avisar({ titulo: f.id ? "Producto guardado" : "Producto agregado", detalle: `${f.nombre.trim().toUpperCase()} · código ${f.codigo.trim().toUpperCase()}`, tono: "ok" });
    nuevo();
  };

  const alternar = (p: Producto) => {
    const err = guardarProducto({ ...p, activo: !p.activo });
    if (err) return avisar({ titulo: "No se pudo", detalle: err, tono: "rojo" });
    avisar({ titulo: p.activo ? "Producto oculto" : "Producto visible", detalle: p.activo ? `${p.nombre} ya no aparece al hacer vales (sus vales antiguos se mantienen).` : `${p.nombre} vuelve a aparecer en los vales.`, tono: "tinta" });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="stencil text-[24px]">Productos</h1>
        <p className="mt-1 max-w-2xl text-gris">
          Las frutas que aparecen al hacer un vale. Al buscar basta escribir el comienzo del nombre («du» → duraznos) o el código. El precio no va aquí: se escribe en cada vale y el sistema sugiere el último.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <form onSubmit={guardar} className="hoja space-y-4 self-start p-5 sm:p-6" aria-label="Producto">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">{f.id ? "Editar producto" : "Agregar producto"}</h2>
            {f.id && (
              <button type="button" onClick={nuevo} className="text-sm text-tinta hover:underline">
                + agregar otro
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <label className="block">
              <span className="rotulo">Nombre</span>
              <input
                value={f.nombre}
                onChange={(e) => {
                  const nombre = e.target.value;
                  setF({ ...f, nombre, codigo: codigoTocado ? f.codigo : sugerirCodigo(nombre, usados) });
                }}
                placeholder="ej: DAMASCO"
                className="campo mt-1 w-full uppercase"
                aria-label="Nombre del producto"
              />
            </label>
            <label className="block">
              <span className="rotulo">Código</span>
              <input
                value={f.codigo}
                onChange={(e) => {
                  setCodigoTocado(true);
                  setF({ ...f, codigo: e.target.value.toUpperCase().slice(0, 5) });
                }}
                placeholder="DA"
                className="campo mt-1 w-full font-mono uppercase"
                aria-label="Código del producto"
              />
            </label>
          </div>
          <div>
            <span className="rotulo">Se vende por</span>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Unidad">
              {UNIDADES.map((u) => (
                <button key={u.k} type="button" role="radio" aria-checked={f.unidad_default === u.k} onClick={() => setF({ ...f, unidad_default: u.k })} className="opcion py-1.5 text-sm">
                  {u.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="rotulo">Color de etiqueta</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
              {COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={f.color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setF({ ...f, color: c })}
                  className={`size-7 rounded-full border-2 ${f.color === c ? "border-grafito ring-2 ring-grafito/30" : "border-white"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          {f.nombre.trim() && (
            <p className="flex items-center gap-2 rounded-md bg-carton/60 px-3 py-2 text-sm">
              <span className="size-3 rounded-full" style={{ background: f.color }} />
              Así aparece: <b className="uppercase">{f.nombre.trim()}</b> <span className="font-mono text-xs text-gris">{f.codigo}</span>
            </p>
          )}
          {error && <p className="text-sm font-medium text-fuji">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-linea pt-4">
            {f.id && (
              <button type="button" onClick={nuevo} className="btn btn-secundario">
                Cancelar
              </button>
            )}
            <button type="submit" disabled={!f.nombre.trim() || !f.codigo.trim()} className="btn btn-primario px-6 disabled:opacity-50">
              {f.id ? "Guardar cambios" : "Agregar producto"}
            </button>
          </div>
        </form>

        <section className="hoja" aria-label="Lista de productos">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3">
            <h2 className="font-semibold">
              {data.db.productos.filter((p) => p.activo).length} productos en uso
            </h2>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="campo w-44 py-1.5 text-sm" aria-label="Buscar producto" />
          </header>
          <ul className="divide-y divide-linea">
            {lista.map((p) => {
              const u = uso.get(p.id);
              return (
                <li key={p.id} className={`flex items-center gap-3 px-4 py-2 ${p.activo ? "" : "opacity-55"} ${f.id === p.id ? "bg-verde-suave" : ""}`}>
                  <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
                  <button type="button" onClick={() => editar(p)} className="min-w-0 flex-1 text-left hover:text-tinta">
                    <b className="block truncate font-medium">{p.nombre}</b>
                    <span className="block text-xs text-gris">
                      <span className="font-mono">{p.codigo}</span> · por {UNIDADES.find((x) => x.k === p.unidad_default)?.label.toLowerCase()}
                      {u ? ` · ${u.n} ${u.n === 1 ? "venta" : "ventas"} · último ${clp(u.precio ?? 0)}` : " · sin ventas"}
                      {!p.activo && " · oculto"}
                    </span>
                  </button>
                  <button type="button" onClick={() => editar(p)} className="text-sm font-medium text-tinta hover:underline">
                    Editar
                  </button>
                  <button type="button" onClick={() => alternar(p)} className={`text-sm font-medium hover:underline ${p.activo ? "text-gris" : "text-tinta"}`}>
                    {p.activo ? "Ocultar" : "Mostrar"}
                  </button>
                </li>
              );
            })}
            {!lista.length && <li className="py-8 text-center text-gris">No hay productos con «{q}».</li>}
          </ul>
          {ocultos > 0 && (
            <button type="button" onClick={() => setVerOcultos((x) => !x)} className="w-full border-t border-linea px-4 py-2.5 text-left text-sm text-tinta hover:underline">
              {verOcultos ? "Esconder los ocultos" : `Ver ${ocultos} ${ocultos === 1 ? "oculto" : "ocultos"} (no aparecen en los vales)`}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
