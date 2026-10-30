"use client";
/**
 * Store de la app. Todas las escrituras pasan por `set()`.
 *
 * Dos modos:
 *  - "local" (modo prueba): sin base de datos configurada; todo vive en el navegador.
 *  - "nube": con Neon. Cada cambio se calcula como diferencia (filas nuevas o
 *    modificadas) y se manda a /api/cambios. Si se corta internet, los cambios
 *    esperan en una cola guardada en el PC y se envían solos al volver.
 *
 * Regla de oro: nunca se borra un movimiento — se anula y queda en la bitácora.
 */
import { useMemo, useSyncExternalStore } from "react";
import type {
  Cliente, Config, Db, Evento, FormaPago, LineaVale, Movimiento, PagoSueldo, TipoMovimiento, TipoPagoSueldo, Trabajador, Unidad,
} from "./types";
import { baseVacia, crearSeed } from "./seed";
import { hoy, lunesDe, sumarDias, uid } from "./format";
import { indexar, resumenCaja, saldosAl, type Indice } from "./calc";

const KEY = "frutas-israel:db:v1"; // modo prueba
const KEY_NUBE = "frutas-israel:nube:v1"; // copia de lo que hay en la base (para trabajar sin internet)
const KEY_COLA = "frutas-israel:cola:v1"; // cambios que faltan por enviar
const KEY_USUARIO = "frutas-israel:usuario"; // quién atiende en ESTE PC

export type Modo = "cargando" | "local" | "nube" | "sin-conexion" | "instalar";

let db: Db | null = null;
let modo: Modo = "cargando";
let errorSync: string | null = null;
const listeners = new Set<() => void>();
const avisar = () => listeners.forEach((l) => l());

const CONFIG_BASE: Config = { dias_amarillo: 15, dias_rojo: 30, dias_sin_compra: 21, usuario_actual: "Caja" };

/** Completa lo que falte (datos guardados por versiones anteriores de la app) */
function normalizar(parsed: Db): Db {
  return {
    ...parsed,
    version: 1,
    config: { ...CONFIG_BASE, ...(parsed.config ?? {}) },
    usuarios: parsed.usuarios ?? [],
    clientes: parsed.clientes ?? [],
    productos: parsed.productos ?? [],
    movimientos: parsed.movimientos ?? [],
    lineas: parsed.lineas ?? [],
    cierres: parsed.cierres ?? [],
    cierres_semana: parsed.cierres_semana ?? [],
    trabajadores: parsed.trabajadores ?? [],
    asistencias: parsed.asistencias ?? [],
    pagos_sueldo: parsed.pagos_sueldo ?? [],
    eventos: parsed.eventos ?? [],
  };
}

function leer<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function escribir(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: la app sigue en memoria */
  }
}

function cargarLocal(): Db {
  const d = leer<Db>(KEY);
  return d && d.version === 1 ? normalizar(d) : sembrar();
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
  // cierres semanales de las semanas ya terminadas
  const lunesHoy = lunesDe(hoyF);
  const primero = [...nueva.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  for (let l = lunesDe(sumarDias(primero.fecha, 7)); l < lunesHoy; l = sumarDias(l, 7)) {
    const domingo = sumarDias(l, 6);
    const saldos = saldosAl(nueva.movimientos, domingo);
    nueva.cierres_semana.push({
      id: uid(),
      tenant_id: nueva.tenant.id,
      lunes: l,
      domingo,
      cerrado_por: "Israel",
      cerrado_at: new Date(domingo + "T13:00:00").toISOString(),
      total: saldos.reduce((a, s) => a + s.saldo, 0),
      saldos,
    });
  }
  return nueva;
}

/** Datos de partida para instalar la base: vacía, de ejemplo o lo que hay en este PC */
export function datosParaInstalar(opcion: "vacia" | "ejemplo" | "este-pc", nombre: string, ubicacion: string, ultimoNumero: number): Db {
  const d = opcion === "vacia" ? baseVacia() : opcion === "ejemplo" ? sembrar() : cargarLocal();
  return {
    ...d,
    tenant: { ...d.tenant, nombre, ubicacion, ultimo_numero: opcion === "vacia" ? ultimoNumero : Math.max(ultimoNumero, d.tenant.ultimo_numero) },
  };
}

/* ------------------------------ sincronización ------------------------------ */

const TABLAS_SYNC = [
  "usuarios", "clientes", "productos", "trabajadores", "movimientos", "lineas",
  "cierres", "cierres_semana", "asistencias", "pagos_sueldo", "eventos",
] as const;
type TablaSync = (typeof TABLAS_SYNC)[number];

interface Cambio {
  tabla: TablaSync;
  op: "put" | "del";
  fila: { id: string } & Record<string, unknown>;
}
interface Lote {
  cambios: Cambio[];
  tenant: { ultimo_numero?: number; config?: Omit<Config, "usuario_actual"> };
}

function diferencias(a: Db, b: Db): Lote {
  const cambios: Cambio[] = [];
  for (const t of TABLAS_SYNC) {
    const xa = a[t] as unknown as { id: string }[];
    const xb = b[t] as unknown as { id: string }[];
    if (xa === xb) continue;
    const previos = new Map(xa.map((r) => [r.id, r]));
    for (const r of xb) if (previos.get(r.id) !== r) cambios.push({ tabla: t, op: "put", fila: r as Cambio["fila"] });
    const actuales = new Set(xb.map((r) => r.id));
    for (const r of xa) if (!actuales.has(r.id)) cambios.push({ tabla: t, op: "del", fila: { id: r.id } });
  }
  const tenant: Lote["tenant"] = {};
  if (a.tenant.ultimo_numero !== b.tenant.ultimo_numero) tenant.ultimo_numero = b.tenant.ultimo_numero;
  const { usuario_actual: ua, ...ca } = a.config;
  const { usuario_actual: ub, ...cb } = b.config;
  if (JSON.stringify(ca) !== JSON.stringify(cb)) tenant.config = cb;
  if (ua !== ub) escribir(KEY_USUARIO, ub);
  return { cambios, tenant };
}

let cola: Lote[] = [];
let enviando = false;
let reintento: ReturnType<typeof setTimeout> | null = null;

function encolar(l: Lote) {
  if (!l.cambios.length && l.tenant.ultimo_numero === undefined && !l.tenant.config) return;
  cola.push(l);
  escribir(KEY_COLA, cola);
}

async function enviar() {
  if (enviando || !cola.length || modo === "local") return;
  enviando = true;
  const lote = cola.slice();
  const cuerpo: Lote = {
    cambios: lote.flatMap((l) => l.cambios),
    tenant: lote.reduce<Lote["tenant"]>((acc, l) => ({ ...acc, ...l.tenant }), {}),
  };
  try {
    const r = await fetch("/api/cambios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    if (r.status === 401) {
      location.assign(`/entrar?volver=${encodeURIComponent(location.pathname)}`);
      return;
    }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      cola = cola.slice(lote.length);
      escribir(KEY_COLA, cola);
      errorSync = null;
      modo = "nube";
      if (j.renumerados?.length && db) {
        const m = new Map<string, number>(j.renumerados.map((x: { id: string; numero: number }) => [x.id, x.numero]));
        db = { ...db, movimientos: db.movimientos.map((x) => (m.has(x.id) ? { ...x, numero: m.get(x.id)! } : x)) };
        window.dispatchEvent(new CustomEvent("frutas:renumerado", { detail: j.renumerados }));
      }
      if (db && j.ultimo_numero > db.tenant.ultimo_numero) db = { ...db, tenant: { ...db.tenant, ultimo_numero: j.ultimo_numero } };
      if (db) escribir(KEY_NUBE, db);
    } else if (r.status === 422) {
      // la base rechazó el cambio (regla de negocio): se descarta y se vuelve a lo que hay en la base
      cola = cola.slice(lote.length);
      escribir(KEY_COLA, cola);
      errorSync = j.error ?? "La base de datos rechazó un cambio";
      await refrescar(true);
    } else throw new Error(j.error ?? `HTTP ${r.status}`);
  } catch {
    modo = "sin-conexion";
    if (reintento) clearTimeout(reintento);
    reintento = setTimeout(() => void enviar(), 10_000);
  } finally {
    enviando = false;
    avisar();
    if (cola.length && modo === "nube") void enviar();
  }
}

/** Trae lo último de la base (lo que hicieron otros PCs). Nunca pisa cambios sin enviar. */
async function refrescar(forzar = false) {
  if (modo === "local" || (!forzar && cola.length)) return;
  try {
    const r = await fetch("/api/datos", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (cola.length && !forzar) return;
    db = conUsuarioLocal(normalizar(j.db));
    escribir(KEY_NUBE, db);
    modo = "nube";
    avisar();
  } catch {
    /* sin internet: se reintenta después */
  }
}

function conUsuarioLocal(d: Db): Db {
  const u = leer<string>(KEY_USUARIO);
  return { ...d, config: { ...d.config, usuario_actual: u ?? d.config.usuario_actual ?? "Caja" } };
}

/** Aplica sobre la base los cambios que todavía no llegan al servidor */
function conPendientes(d: Db): Db {
  if (!cola.length) return d;
  const out = { ...d } as Db;
  for (const t of TABLAS_SYNC) {
    const cambios = cola.flatMap((l) => l.cambios).filter((c) => c.tabla === t);
    if (!cambios.length) continue;
    const m = new Map((out[t] as unknown as { id: string }[]).map((r) => [r.id, r]));
    for (const c of cambios) {
      if (c.op === "del") m.delete(c.fila.id);
      else m.set(c.fila.id, c.fila);
    }
    (out as unknown as Record<string, unknown>)[t] = [...m.values()];
  }
  const n = Math.max(...cola.map((l) => l.tenant.ultimo_numero ?? 0));
  if (n > out.tenant.ultimo_numero) out.tenant = { ...out.tenant, ultimo_numero: n };
  return out;
}

let iniciado = false;
async function iniciar() {
  if (iniciado) return;
  if (location.pathname === "/entrar") return; // sin sesión todavía: no hay nada que cargar
  iniciado = true;
  cola = leer<Lote[]>(KEY_COLA) ?? [];
  let r: Response | null = null;
  try {
    r = await fetch("/api/datos", { cache: "no-store" });
  } catch {
    r = null;
  }
  if (r && r.status === 404) {
    modo = "local";
    db = cargarLocal();
    escribir(KEY, db);
  } else if (r && r.status === 409) {
    modo = "instalar";
    if (!location.pathname.startsWith("/instalar")) location.assign("/instalar");
  } else if (r && r.status === 401) {
    location.assign(`/entrar?volver=${encodeURIComponent(location.pathname)}`);
    return;
  } else if (r && r.ok) {
    const j = await r.json();
    db = conUsuarioLocal(conPendientes(normalizar(j.db)));
    escribir(KEY_NUBE, db);
    modo = "nube";
    void enviar();
  } else {
    // sin internet o la base no responde: se trabaja con la última copia
    const cache = leer<Db>(KEY_NUBE);
    if (cache) {
      db = conUsuarioLocal(conPendientes(normalizar(cache)));
      modo = "sin-conexion";
      reintento = setTimeout(() => void enviar(), 10_000);
    } else {
      modo = "local";
      db = cargarLocal();
    }
  }
  avisar();
  setInterval(() => {
    if (document.hidden) return;
    if (cola.length) void enviar();
    else void refrescar();
  }, 30_000);
  window.addEventListener("focus", () => (cola.length ? void enviar() : void refrescar()));
  window.addEventListener("online", () => void enviar());
}

function set(fn: (d: Db) => Db) {
  if (!db) return;
  const antes = db;
  db = fn(db);
  if (modo === "local") escribir(KEY, db);
  else {
    encolar(diferencias(antes, db));
    escribir(KEY_NUBE, db);
    void enviar();
  }
  avisar();
}

function getSnapshot(): Db | null {
  return db;
}
function getServerSnapshot(): Db | null {
  return null;
}
function subscribe(l: () => void) {
  listeners.add(l);
  if (typeof window !== "undefined") void iniciar();
  const onStorage = (e: StorageEvent) => {
    if (modo === "local" && e.key === KEY && e.newValue) {
      try {
        db = normalizar(JSON.parse(e.newValue));
        avisar();
      } catch {}
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Base completa (null mientras carga) */
export function useDb(): Db | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface EstadoSync {
  modo: Modo;
  pendientes: number;
  error: string | null;
}
let ultimoEstado: EstadoSync = { modo, pendientes: 0, error: null };
function estadoSnapshot(): EstadoSync {
  const pend = cola.reduce((a, l) => a + l.cambios.length, 0);
  if (ultimoEstado.modo !== modo || ultimoEstado.pendientes !== pend || ultimoEstado.error !== errorSync)
    ultimoEstado = { modo, pendientes: pend, error: errorSync };
  return ultimoEstado;
}
const ESTADO_SERVIDOR: EstadoSync = { modo: "cargando", pendientes: 0, error: null };
/** En qué modo está la app y si hay cambios esperando internet */
export function useSync(): EstadoSync {
  return useSyncExternalStore(subscribe, estadoSnapshot, () => ESTADO_SERVIDOR);
}

export function reintentarAhora() {
  void enviar();
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
  /** vale "solo monto": sin productos, se usa este total */
  monto?: number;
  glosa?: string | null;
  abono?: { monto: number; forma: Exclude<FormaPago, "CREDITO"> } | null;
}): Movimiento {
  let creado!: Movimiento;
  set((d) => {
    const numero = d.tenant.ultimo_numero + 1;
    const lineas: LineaVale[] = [];
    const total = p.lineas.length ? p.lineas.reduce((a, l) => a + Math.round(l.cantidad * l.precio_unitario), 0) : Math.round(p.monto ?? 0);
    const mov = nuevoMov(d, numero, {
      tipo: p.forma_pago === "CREDITO" ? "VALE_CREDITO" : "VALE_VENTA",
      fecha: p.fecha,
      cliente_id: p.cliente_id,
      forma_pago: p.forma_pago,
      total,
      glosa: p.glosa ?? null,
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
      telefono: p.telefono ?? null, limite_credito: p.limite_credito ?? null,
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

/** Deuda sin productos: saldo anterior, préstamo, ajuste. Queda como vale crédito con glosa. */
export function cargarDeuda(p: { cliente_id: string; monto: number; glosa: string; fecha: string }): Movimiento {
  let creado!: Movimiento;
  set((d) => {
    const numero = d.tenant.ultimo_numero + 1;
    const mov = nuevoMov(d, numero, {
      tipo: "VALE_CREDITO", fecha: p.fecha, cliente_id: p.cliente_id, forma_pago: "CREDITO", total: p.monto, glosa: p.glosa,
    });
    creado = mov;
    return {
      ...d,
      tenant: { ...d.tenant, ultimo_numero: numero },
      movimientos: [...d.movimientos, mov],
      eventos: [...d.eventos, evento(d, "CREAR_MOVIMIENTO", mov.id, `Deuda agregada N°${numero} · ${p.glosa} · $${p.monto}`)],
    };
  });
  return creado;
}

export function cerrarSemana(lunes: string, domingo: string, saldos: { cliente_id: string; saldo: number }[]) {
  set((d) => {
    const total = saldos.reduce((a, s) => a + s.saldo, 0);
    return {
      ...d,
      cierres_semana: [
        ...d.cierres_semana,
        { id: uid(), tenant_id: d.tenant.id, lunes, domingo, cerrado_por: d.config.usuario_actual, cerrado_at: new Date().toISOString(), total, saldos },
      ],
      eventos: [...d.eventos, evento(d, "CERRAR_SEMANA", null, `Cierre semana ${lunes} a ${domingo} · deuda total $${total}`)],
    };
  });
}

/* ---------------------------------- sueldos ---------------------------------- */

export function guardarTrabajador(p: Omit<Trabajador, "id" | "tenant_id" | "created_at" | "activo"> & { id?: string; activo?: boolean }): Trabajador {
  let t!: Trabajador;
  set((d) => {
    const previo = p.id ? d.trabajadores.find((x) => x.id === p.id) : undefined;
    t = previo
      ? { ...previo, ...p, id: previo.id }
      : { ...p, id: uid(), tenant_id: d.tenant.id, activo: p.activo ?? true, created_at: new Date().toISOString() };
    return {
      ...d,
      trabajadores: previo ? d.trabajadores.map((x) => (x.id === t.id ? t : x)) : [...d.trabajadores, t],
      eventos: [...d.eventos, evento(d, "SUELDOS", t.id, previo ? `Trabajador editado: ${t.nombre}` : `Trabajador nuevo: ${t.nombre} (${t.cargo})`)],
    };
  });
  return t;
}

/** Marca o desmarca un día trabajado */
export function marcarDia(trabajador_id: string, fecha: string, trabajo: boolean) {
  set((d) => {
    const ya = d.asistencias.some((a) => a.trabajador_id === trabajador_id && a.fecha === fecha);
    if (ya === trabajo) return d;
    return {
      ...d,
      asistencias: trabajo
        ? [...d.asistencias, { id: uid(), tenant_id: d.tenant.id, trabajador_id, fecha }]
        : d.asistencias.filter((a) => !(a.trabajador_id === trabajador_id && a.fecha === fecha)),
    };
  });
}

/** Pago, adelanto, bono o descuento. Si es en efectivo y sale del cajón, queda también como egreso de caja. */
export function registrarPagoSueldo(p: {
  trabajador_id: string; fecha: string; tipo: TipoPagoSueldo; monto: number; forma: "EFECTIVO" | "TRANSFERENCIA"; nota: string | null; desdeCaja: boolean;
}): PagoSueldo {
  let pago!: PagoSueldo;
  set((d) => {
    const t = d.trabajadores.find((x) => x.id === p.trabajador_id);
    const mueveCaja = p.desdeCaja && p.forma === "EFECTIVO" && (p.tipo === "PAGO" || p.tipo === "ADELANTO");
    let numero = d.tenant.ultimo_numero;
    let mov: Movimiento | null = null;
    if (mueveCaja) {
      numero++;
      mov = nuevoMov(d, numero, {
        tipo: "EGRESO", fecha: p.fecha, cliente_id: null, forma_pago: "EFECTIVO", total: p.monto,
        glosa: `Sueldo · ${t?.nombre ?? ""}${p.tipo === "ADELANTO" ? " (adelanto)" : ""}`,
      });
    }
    pago = {
      id: uid(), tenant_id: d.tenant.id, trabajador_id: p.trabajador_id, fecha: p.fecha, tipo: p.tipo, monto: Math.round(p.monto), forma: p.forma,
      movimiento_id: mov?.id ?? null, nota: p.nota, creado_por: d.config.usuario_actual, created_at: new Date().toISOString(),
      anulado_at: null, anulado_por: null, motivo_anulacion: null,
    };
    return {
      ...d,
      tenant: { ...d.tenant, ultimo_numero: numero },
      movimientos: mov ? [...d.movimientos, mov] : d.movimientos,
      pagos_sueldo: [...d.pagos_sueldo, pago],
      eventos: [...d.eventos, evento(d, "SUELDOS", pago.id, `${p.tipo} a ${t?.nombre}: $${p.monto}${mov ? ` (egreso N°${mov.numero})` : ""}`)],
    };
  });
  return pago;
}

export function anularPagoSueldo(id: string, motivo: string) {
  set((d) => {
    const p = d.pagos_sueldo.find((x) => x.id === id);
    if (!p || p.anulado_at) return d;
    const at = new Date().toISOString();
    const por = d.config.usuario_actual;
    return {
      ...d,
      pagos_sueldo: d.pagos_sueldo.map((x) => (x.id === id ? { ...x, anulado_at: at, anulado_por: por, motivo_anulacion: motivo } : x)),
      movimientos: d.movimientos.map((m) =>
        m.id === p.movimiento_id && !m.anulado_at ? { ...m, anulado_at: at, anulado_por: por, motivo_anulacion: `${motivo} (pago de sueldo anulado)` } : m,
      ),
      eventos: [...d.eventos, evento(d, "SUELDOS", id, `Pago de sueldo anulado: ${motivo}`)],
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
            id: uid(), tenant_id: d.tenant.id, nombre: f.cliente, alias: null, telefono: null,
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
  if (modo !== "local") return; // en la base real nunca se regeneran datos
  set(() => {
    const d = sembrar();
    return { ...d, eventos: [...d.eventos, evento(d, "REINICIAR_DEMO", null, "Datos de ejemplo regenerados")] };
  });
}
