"use client";
/**
 * Store local (localStorage). Todas las escrituras pasan por acá, así que
 * migrar a Supabase es reemplazar estas funciones por inserts/rpc.
 * Regla de oro: nunca se borra un movimiento — se anula y queda en la bitácora.
 */
import { useMemo, useSyncExternalStore } from "react";
import type {
  Cliente, Config, Db, Evento, FormaPago, LineaVale, Movimiento, TipoMovimiento, Unidad,
} from "./types";
import { crearSeed } from "./seed";
import { hoy, uid } from "./format";
import { indexar, resumenCaja, type Indice } from "./calc";

const KEY = "frutas-israel:db:v1";

let db: Db | null = null;
const listeners = new Set<() => void>();

function cargar(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    /* almacenamiento bloqueado o corrupto: partimos de cero */
  }
  return sembrar();
}

function sembrar(): Db {
  const nueva = crearSeed();
  // cierres de caja de días anteriores (como si se hubieran hecho cada tarde)
  const idx = indexar(nueva);
  const hoyF = hoy();
  idx.movsFecha.forEach((movs, fecha) => {
    if (fecha >= hoyF) return;
    if (!movs.some((m) => !m.importado)) return;
    const d = new Date(fecha + "T18:30:00");
    nueva.cierres.push({
      id: uid(),
      tenant_id: nueva.tenant.id,
      fecha,
      cerrado_por: "Israel",
      cerrado_at: d.toISOString(),
      snapshot: resumenCaja(movs),
      nota: null,
    });
  });
  return nueva;
}

function guardar() {
  try {
    if (db) localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* sin almacenamiento: la app sigue funcionando en memoria */
  }
}

function set(fn: (d: Db) => Db) {
  if (!db) db = cargar();
  db = fn(db);
  guardar();
  listeners.forEach((l) => l());
}

function getSnapshot(): Db | null {
  return db;
}
function getServerSnapshot(): Db | null {
  return null;
}
function subscribe(l: () => void) {
  listeners.add(l);
  if (!db && typeof window !== "undefined") {
    db = cargar();
    guardar();
    queueMicrotask(() => listeners.forEach((x) => x()));
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue) {
      try {
        db = JSON.parse(e.newValue);
        listeners.forEach((x) => x());
      } catch {}
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Base completa (null mientras hidrata en el cliente) */
export function useDb(): Db | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Base + índices memoizados */
export function useData(): { db: Db; idx: Indice } | null {
  const d = useDb();
  return useMemo(() => (d ? { db: d, idx: indexar(d) } : null), [d]);
}

/* -------------------------------- acciones -------------------------------- */

function evento(d: Db, accion: Evento["accion"], entidad_id: string | null, detalle: string): Evento {
  return { id: uid(), tenant_id: d.tenant.id, at: new Date().toISOString(), usuario: d.config.usuario_actual, accion, entidad_id, detalle };
}

function nuevoMov(d: Db, numero: number, p: {
  tipo: TipoMovimiento; fecha: string; cliente_id: string | null; forma_pago: FormaPago;
  total: number; glosa?: string | null; origen_id?: string | null; importado?: boolean; created_at?: string;
}): Movimiento {
  return {
    id: uid(),
    tenant_id: d.tenant.id,
    numero,
    tipo: p.tipo,
    fecha: p.fecha,
    cliente_id: p.cliente_id,
    forma_pago: p.forma_pago,
    total: Math.round(p.total),
    glosa: p.glosa ?? null,
    origen_id: p.origen_id ?? null,
    creado_por: d.config.usuario_actual,
    created_at: p.created_at ?? new Date().toISOString(),
    anulado_at: null,
    anulado_por: null,
    motivo_anulacion: null,
    importado: p.importado ?? false,
  };
}

export interface LineaInput {
  cantidad: number;
  unidad: Unidad;
  producto_id: string;
  precio_unitario: number;
}

export function crearVale(p: {
  fecha: string;
  cliente_id: string;
  forma_pago: FormaPago;
  lineas: LineaInput[];
  abono?: { monto: number; forma: Exclude<FormaPago, "CREDITO"> } | null;
}): Movimiento {
  let creado!: Movimiento;
  set((d) => {
    const numero = d.tenant.ultimo_numero + 1;
    const lineas: LineaVale[] = [];
    const total = p.lineas.reduce((a, l) => a + Math.round(l.cantidad * l.precio_unitario), 0);
    const mov = nuevoMov(d, numero, {
      tipo: p.forma_pago === "CREDITO" ? "VALE_CREDITO" : "VALE_VENTA",
      fecha: p.fecha,
      cliente_id: p.cliente_id,
      forma_pago: p.forma_pago,
      total,
    });
    p.lineas.forEach((l, i) =>
      lineas.push({
        id: uid(), tenant_id: d.tenant.id, movimiento_id: mov.id, orden: i + 1,
        cantidad: l.cantidad, unidad: l.unidad, producto_id: l.producto_id,
        precio_unitario: l.precio_unitario, subtotal: Math.round(l.cantidad * l.precio_unitario),
      }),
    );
    const movs = [mov];
    let ultimo = numero;
    if (p.forma_pago === "CREDITO" && p.abono && p.abono.monto > 0) {
      ultimo++;
      movs.push(nuevoMov(d, ultimo, {
        tipo: "ABONO", fecha: p.fecha, cliente_id: p.cliente_id, forma_pago: p.abono.forma,
        total: Math.min(p.abono.monto, total), glosa: `Abono en el mismo vale N°${numero}`, origen_id: mov.id,
      }));
    }
    creado = mov;
    return {
      ...d,
      tenant: { ...d.tenant, ultimo_numero: ultimo },
      movimientos: [...d.movimientos, ...movs],
      lineas: [...d.lineas, ...lineas],
      eventos: [...d.eventos, evento(d, "CREAR_MOVIMIENTO", mov.id, `Vale N°${numero} · ${mov.tipo} · $${total}`)],
    };
  });
  return creado;
}

export function registrarAbono(p: {
  cliente_id: string; monto: number; forma: Exclude<FormaPago, "CREDITO">; glosa: string | null; fecha: string;
}): Movimiento {
  let creado!: Movimiento;
  set((d) => {
    const numero = d.tenant.ultimo_numero + 1;
    const mov = nuevoMov(d, numero, {
      tipo: "ABONO", fecha: p.fecha, cliente_id: p.cliente_id, forma_pago: p.forma, total: p.monto, glosa: p.glosa,
    });
    creado = mov;
    return {
      ...d,
      tenant: { ...d.tenant, ultimo_numero: numero },
      movimientos: [...d.movimientos, mov],
      eventos: [...d.eventos, evento(d, "CREAR_MOVIMIENTO", mov.id, `Abono N°${numero} · $${p.monto}`)],
    };
  });
  return creado;
}

export function registrarCaja(p: {
  tipo: "INGRESO" | "EGRESO"; monto: number; forma: Exclude<FormaPago, "CREDITO">; glosa: string; fecha: string;
}): Movimiento {
  let creado!: Movimiento;
  set((d) => {
    const numero = d.tenant.ultimo_numero + 1;
    const mov = nuevoMov(d, numero, {
      tipo: p.tipo, fecha: p.fecha, cliente_id: null, forma_pago: p.forma, total: p.monto, glosa: p.glosa,
    });
    creado = mov;
    return {
      ...d,
      tenant: { ...d.tenant, ultimo_numero: numero },
      movimientos: [...d.movimientos, mov],
      eventos: [...d.eventos, evento(d, "CREAR_MOVIMIENTO", mov.id, `${p.tipo} N°${numero} · ${p.glosa} · $${p.monto}`)],
    };
  });
  return creado;
}

/** Anula (no borra). Si es un vale con abono en el mismo vale, anula ambos. */
export function anular(id: string, motivo: string) {
  set((d) => {
    const at = new Date().toISOString();
    const objetivo = d.movimientos.find((m) => m.id === id);
    if (!objetivo || objetivo.anulado_at) return d;
    const ids = new Set([id, ...d.movimientos.filter((m) => m.origen_id === id && !m.anulado_at).map((m) => m.id)]);
    return {
      ...d,
      movimientos: d.movimientos.map((m) =>
        ids.has(m.id)
          ? { ...m, anulado_at: at, anulado_por: d.config.usuario_actual, motivo_anulacion: m.id === id ? motivo : `${motivo} (junto al vale N°${objetivo.numero})` }
          : m,
      ),
      eventos: [...d.eventos, evento(d, "ANULAR_MOVIMIENTO", id, `N°${objetivo.numero} anulado: ${motivo}`)],
    };
  });
}

export function crearCliente(p: Partial<Cliente> & { nombre: string }): Cliente {
  let creado!: Cliente;
  set((d) => {
    creado = {
      id: uid(), tenant_id: d.tenant.id, nombre: p.nombre.trim(), alias: p.alias?.trim().toUpperCase() || null,
      telefono: p.telefono ?? null, procedencia: p.procedencia ?? null, limite_credito: p.limite_credito ?? null,
      semaforo_manual: null, compra_manual: null, notas: p.notas ?? null, created_at: new Date().toISOString(),
    };
    return {
      ...d,
      clientes: [...d.clientes, creado],
      eventos: [...d.eventos, evento(d, "CREAR_CLIENTE", creado.id, `Cliente nuevo: ${creado.nombre}`)],
    };
  });
  return creado;
}

export function editarCliente(id: string, patch: Partial<Cliente>, detalle?: string) {
  set((d) => ({
    ...d,
    clientes: d.clientes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    eventos: [...d.eventos, evento(d, "EDITAR_CLIENTE", id, detalle ?? `Editado: ${Object.keys(patch).join(", ")}`)],
  }));
}

export function cerrarCaja(fecha: string, nota: string | null) {
  set((d) => {
    const movs = d.movimientos.filter((m) => m.fecha === fecha);
    const snap = resumenCaja(movs);
    return {
      ...d,
      cierres: [
        ...d.cierres,
        { id: uid(), tenant_id: d.tenant.id, fecha, cerrado_por: d.config.usuario_actual, cerrado_at: new Date().toISOString(), snapshot: snap, nota },
      ],
      eventos: [...d.eventos, evento(d, "CERRAR_CAJA", null, `Cierre ${fecha} · efectivo esperado $${snap.efectivo_esperado}`)],
    };
  });
}

export function setConfig(patch: Partial<Config>) {
  set((d) => ({ ...d, config: { ...d.config, ...patch } }));
}

export interface ImportFila {
  fecha: string;
  numero: number | null;
  cliente: string;
  tipo: TipoMovimiento;
  forma: FormaPago;
  monto: number;
  glosa: string | null;
}

/** Importa movimientos del CSV de la planilla. Crea clientes que no existan. */
export function importar(filas: ImportFila[], resolverCliente: (nombre: string) => string | null): { creados: number; clientesNuevos: number } {
  let creados = 0;
  let clientesNuevos = 0;
  set((d) => {
    const clientes = [...d.clientes];
    const porNombre = new Map<string, string>();
    const movs: Movimiento[] = [];
    let ultimo = d.tenant.ultimo_numero;
    const usados = new Set(d.movimientos.map((m) => m.numero));
    for (const f of filas) {
      let cliente_id: string | null = null;
      if (f.tipo !== "INGRESO" && f.tipo !== "EGRESO") {
        cliente_id = resolverCliente(f.cliente) ?? porNombre.get(f.cliente.toLowerCase()) ?? null;
        if (!cliente_id) {
          const c: Cliente = {
            id: uid(), tenant_id: d.tenant.id, nombre: f.cliente, alias: null, telefono: null, procedencia: null,
            limite_credito: null, semaforo_manual: null, compra_manual: null, notas: "Creado por el importador",
            created_at: new Date().toISOString(),
          };
          clientes.push(c);
          porNombre.set(f.cliente.toLowerCase(), c.id);
          cliente_id = c.id;
          clientesNuevos++;
        }
      }
      // respeta el N° de la planilla si no choca; si no, correlativo nuevo
      const numero = f.numero && !usados.has(f.numero) ? f.numero : ++ultimo;
      usados.add(numero);
      if (numero > ultimo) ultimo = numero;
      movs.push(
        nuevoMov(d, numero, {
          tipo: f.tipo, fecha: f.fecha, cliente_id, forma_pago: f.forma, total: f.monto, glosa: f.glosa,
          importado: true, created_at: new Date(f.fecha + "T12:00:00").toISOString(),
        }),
      );
      creados++;
    }
    return {
      ...d,
      tenant: { ...d.tenant, ultimo_numero: ultimo },
      clientes,
      movimientos: [...d.movimientos, ...movs],
      eventos: [...d.eventos, evento(d, "IMPORTAR_CSV", null, `CSV importado: ${creados} movimientos, ${clientesNuevos} clientes nuevos`)],
    };
  });
  return { creados, clientesNuevos };
}

export function reiniciarDemo() {
  set(() => {
    const d = sembrar();
    return { ...d, eventos: [...d.eventos, evento(d, "REINICIAR_DEMO", null, "Datos de ejemplo regenerados")] };
  });
}
