"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSync } from "@/lib/store";
import { clp, fechaLarga, hora, sumarDias, hoy, toFecha } from "@/lib/format";
import { Bitacora } from "../Bitacora";

interface Fila {
  id: number;
  at: string;
  usuario: string;
  usuario_tipo: "ADMIN" | "PERSONAL" | "SISTEMA";
  ip: string | null;
  tabla: string;
  registro_id: string | null;
  accion: string;
  descripcion: string;
  cambios: Record<string, [unknown, unknown]> | null;
}

const ACCION: Record<string, { label: string; color: string; fondo: string }> = {
  CREAR: { label: "Creó", color: "#166534", fondo: "#ecf5ef" },
  MODIFICAR: { label: "Modificó", color: "#1d4ed8", fondo: "#eef3fe" },
  ANULAR: { label: "Anuló", color: "#b42318", fondo: "#fdeeec" },
  BORRAR: { label: "Quitó", color: "#b42318", fondo: "#fdeeec" },
  ENTRAR: { label: "Entró", color: "#4b5563", fondo: "#f0f2f5" },
  SALIR: { label: "Salió", color: "#4b5563", fondo: "#f0f2f5" },
  SEGURIDAD: { label: "Seguridad", color: "#111827", fondo: "#e5e7eb" },
};

const QUE: Record<string, string> = {
  movimientos: "Vales, abonos y caja",
  clientes: "Clientes",
  envases: "Envases",
  productos: "Productos",
  trabajadores: "Trabajadores",
  pagos_sueldo: "Remuneraciones",
  asistencias: "Asistencia",
  cierres: "Cierres de caja",
  cierres_semana: "Cierres semanales",
  usuarios: "Personal",
  ajustes: "Ajustes",
  sesion: "Entradas y salidas",
  seguridad: "Seguridad y cuentas",
};

const CAMPO: Record<string, string> = {
  nombre: "Nombre",
  alias: "Alias",
  telefono: "Teléfono",
  limite_credito: "Límite de crédito",
  semaforo_manual: "Estado fijado a mano",
  compra_manual: "¿Sigue comprando? (a mano)",
  notas: "Notas",
  numero: "N° de vale",
  anulado_at: "Anulado el",
  anulado_por: "Anulado por",
  motivo_anulacion: "Motivo de anulación",
  precio: "Precio",
  activo: "Activo",
  glosa: "Detalle",
  monto: "Monto",
  total: "Total",
  cargo: "Cargo",
  modalidad: "Modalidad de pago",
  codigo: "Código",
  unidad_default: "Unidad",
  color: "Color",
  fecha: "Fecha",
  forma: "Forma de pago",
  nota: "Nota",
  categoria: "Categoría",
  dias_amarillo: "Días para amarillo",
  dias_rojo: "Días para rojo",
  dias_sin_compra: "Días sin compra",
};
const DINERO = new Set(["precio", "limite_credito", "monto", "total"]);

function valor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (DINERO.has(campo) && !isNaN(Number(v))) return clp(Number(v));
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return `${toFecha(d).split("-").reverse().join("-")} ${hora(v)}`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

interface Filtros {
  desde: string;
  hasta: string;
  usuario: string;
  tabla: string;
  accion: string;
  q: string;
}

/** Historial de cambios del servidor (con base de datos). En modo prueba muestra la bitácora local. */
export function Historial() {
  const sync = useSync();
  if (sync.modo === "local") return <Bitacora />;
  return <HistorialNube />;
}

function HistorialNube() {
  const [f, setF] = useState<Filtros>({ desde: sumarDias(hoy(), -6), hasta: hoy(), usuario: "", tabla: "", accion: "", q: "" });
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const cargar = useCallback(
    async (antes?: number) => {
      setCargando(true);
      setError(null);
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
      if (antes) p.set("antes", String(antes));
      const r = await fetch(`/api/admin/historial?${p}`, { cache: "no-store" }).catch(() => null);
      setCargando(false);
      if (!r || !r.ok) return setError(r?.status === 403 ? "Requiere administrador." : "No se pudo cargar el historial.");
      const j = await r.json();
      setFilas((x) => (antes ? [...x, ...j.filas] : j.filas));
      setUsuarios(j.usuarios);
      setHayMas(j.hayMas);
    },
    [f],
  );
  useEffect(() => {
    void cargar();
  }, [cargar]);
  // buscar al dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q })), 400);
    return () => clearTimeout(t);
  }, [q]);

  const porDia = useMemo(() => {
    const m = new Map<string, Fila[]>();
    for (const x of filas) {
      const d = toFecha(new Date(x.at));
      m.set(d, [...(m.get(d) ?? []), x]);
    }
    return [...m.entries()];
  }, [filas]);

  const set = (k: keyof Filtros) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="stencil text-[24px]">Historial de cambios</h1>
          <p className="mt-1 max-w-2xl text-gris">
            Todo cambio queda registrado con quién lo hizo, cuándo y qué cambió. Lo escribe el servidor y no se puede editar ni borrar.
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className="btn btn-secundario no-print">
          Imprimir
        </button>
      </header>

      <section className="hoja no-print grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filtros">
        <label className="block">
          <span className="rotulo">Desde</span>
          <input type="date" value={f.desde} onChange={set("desde")} className="campo mt-1 w-full" />
        </label>
        <label className="block">
          <span className="rotulo">Hasta</span>
          <input type="date" value={f.hasta} onChange={set("hasta")} className="campo mt-1 w-full" />
        </label>
        <label className="block">
          <span className="rotulo">Persona</span>
          <select value={f.usuario} onChange={set("usuario")} className="campo mt-1 w-full" aria-label="Persona">
            <option value="">Todas</option>
            {usuarios.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Qué</span>
          <select value={f.tabla} onChange={set("tabla")} className="campo mt-1 w-full" aria-label="Qué">
            <option value="">Todo</option>
            {Object.entries(QUE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Acción</span>
          <select value={f.accion} onChange={set("accion")} className="campo mt-1 w-full" aria-label="Acción">
            <option value="">Todas</option>
            {Object.entries(ACCION).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Buscar</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="N°, cliente, envase…" className="campo mt-1 w-full" aria-label="Buscar" />
        </label>
      </section>

      <p className="text-sm text-gris">
        {cargando ? "Cargando…" : `${filas.length}${hayMas ? "+" : ""} registros`}
        {f.desde || f.hasta ? ` · ${f.desde ? f.desde.split("-").reverse().join("-") : "inicio"} a ${f.hasta ? f.hasta.split("-").reverse().join("-") : "hoy"}` : ""}
        {f.usuario && ` · ${f.usuario}`}
      </p>
      {error && <p className="font-medium text-fuji">{error}</p>}

      {porDia.map(([dia, xs]) => (
        <section key={dia} className="hoja">
          <h2 className="border-b border-linea px-4 py-2.5 text-sm font-semibold first-letter:uppercase">{fechaLarga(dia)}</h2>
          <ol className="divide-y divide-linea">
            {xs.map((x) => {
              const a = ACCION[x.accion] ?? { label: x.accion, color: "#4b5563", fondo: "#f0f2f5" };
              const cambios = x.cambios ? Object.entries(x.cambios) : [];
              const abierto = abiertos.has(x.id);
              return (
                <li key={x.id} className="px-4 py-2.5">
                  <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 sm:grid-cols-[3.25rem_9.5rem_5.5rem_minmax(0,1fr)] sm:items-baseline">
                    <span className="cifra text-sm text-gris">{hora(x.at)}</span>
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {x.usuario}
                      {x.usuario_tipo === "ADMIN" && <span className="ml-1.5 text-[11px] font-medium text-gris">admin</span>}
                    </span>
                    <span className="col-start-2 sm:col-start-auto">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: a.color, background: a.fondo }}>
                        {a.label}
                      </span>
                    </span>
                    <span className="col-start-2 min-w-0 text-[14px] sm:col-start-auto">
                      {x.descripcion}
                      {cambios.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setAbiertos((s) => {
                              const n = new Set(s);
                              if (n.has(x.id)) n.delete(x.id);
                              else n.add(x.id);
                              return n;
                            })
                          }
                          className="no-print ml-2 text-xs font-medium text-tinta hover:underline"
                        >
                          {abierto ? "Ocultar" : `Ver ${cambios.length === 1 ? "el cambio" : `${cambios.length} cambios`}`}
                        </button>
                      )}
                    </span>
                  </div>
                  {cambios.length > 0 && (
                    <table className={`mt-2 w-full max-w-2xl text-sm sm:ml-[13.5rem] sm:w-[calc(100%-13.5rem)] ${abierto ? "" : "hidden print:table"}`}>
                      <thead>
                        <tr className="text-left text-xs text-gris">
                          <th className="py-1 pr-3 font-semibold">Campo</th>
                          <th className="py-1 pr-3 font-semibold">Antes</th>
                          <th className="py-1 font-semibold">Después</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cambios.map(([k, [antes, despues]]) => (
                          <tr key={k} className="border-t border-linea">
                            <td className="py-1 pr-3 text-gris">{CAMPO[k] ?? k}</td>
                            <td className="py-1 pr-3 text-fuji line-through decoration-fuji/40">{valor(k, antes)}</td>
                            <td className="py-1 font-medium">{valor(k, despues)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {!cargando && !filas.length && !error && <p className="hoja p-8 text-center text-gris">No hay cambios con estos filtros.</p>}
      {hayMas && (
        <button type="button" onClick={() => cargar(filas[filas.length - 1]?.id)} disabled={cargando} className="btn btn-secundario no-print">
          Cargar más antiguos
        </button>
      )}
    </div>
  );
}
