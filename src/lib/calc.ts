/**
 * Cálculos de negocio puros (sin React). Todo lo derivado se calcula,
 * no se guarda: saldo, semáforo, "sigue comprando", último precio, cierre.
 * En Postgres hay vistas equivalentes (ver db/schema.sql).
 */
import type {
  Cliente, Config, Db, Fecha, LineaVale, Movimiento, Producto, ResumenCaja, Semaforo,
} from "./types";
import { diasEntre, lunesDe, semanaISO } from "./format";

export const vivo = (m: Movimiento) => !m.anulado_at;

/** Efecto de un movimiento sobre la deuda del cliente */
export function efectoDeuda(m: Movimiento): number {
  if (!vivo(m)) return 0;
  if (m.tipo === "VALE_CREDITO") return m.total;
  if (m.tipo === "ABONO") return -m.total;
  // garantía de envases a crédito suma deuda; la devolución "a cuenta" la descuenta
  if (m.tipo === "ENVASE_COBRO" && m.forma_pago === "CREDITO") return m.total;
  if (m.tipo === "ENVASE_DEVOLUCION" && m.forma_pago === "CREDITO") return -m.total;
  return 0;
}

/** En qué columna de la cuenta cliente va un movimiento */
export function columnaCuenta(m: Movimiento): "credito" | "pago" | "venta" | null {
  const e = efectoDeuda({ ...m, anulado_at: null });
  if (e > 0) return "credito";
  if (e < 0) return "pago";
  if (m.tipo === "VALE_VENTA" || m.tipo === "ENVASE_COBRO") return "venta";
  return null;
}

/** Deuda de cada cliente al final de una fecha (solo los que deben algo) */
export function saldosAl(movs: Movimiento[], fecha: Fecha): { cliente_id: string; saldo: number }[] {
  const m = new Map<string, number>();
  for (const x of movs) {
    if (!x.cliente_id || x.fecha > fecha) continue;
    m.set(x.cliente_id, (m.get(x.cliente_id) ?? 0) + efectoDeuda(x));
  }
  return [...m.entries()].filter(([, s]) => s > 0).map(([cliente_id, saldo]) => ({ cliente_id, saldo })).sort((a, b) => b.saldo - a.saldo);
}

export interface Indice {
  cliente: Map<string, Cliente>;
  producto: Map<string, Producto>;
  movsCliente: Map<string, Movimiento[]>; // orden cronológico
  lineasMov: Map<string, LineaVale[]>;
  movsFecha: Map<Fecha, Movimiento[]>;
  mov: Map<string, Movimiento>;
}

export function indexar(db: Db): Indice {
  const movs = [...db.movimientos].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.numero - b.numero,
  );
  const movsCliente = new Map<string, Movimiento[]>();
  const movsFecha = new Map<Fecha, Movimiento[]>();
  for (const m of movs) {
    if (m.cliente_id) {
      const arr = movsCliente.get(m.cliente_id);
      if (arr) arr.push(m);
      else movsCliente.set(m.cliente_id, [m]);
    }
    const f = movsFecha.get(m.fecha);
    if (f) f.push(m);
    else movsFecha.set(m.fecha, [m]);
  }
  const lineasMov = new Map<string, LineaVale[]>();
  for (const l of db.lineas) {
    const arr = lineasMov.get(l.movimiento_id);
    if (arr) arr.push(l);
    else lineasMov.set(l.movimiento_id, [l]);
  }
  lineasMov.forEach((arr) => arr.sort((a, b) => a.orden - b.orden));
  return {
    cliente: new Map(db.clientes.map((c) => [c.id, c])),
    producto: new Map(db.productos.map((p) => [p.id, p])),
    movsCliente,
    lineasMov,
    movsFecha,
    mov: new Map(movs.map((m) => [m.id, m])),
  };
}

export interface Pendiente {
  mov: Movimiento;
  pendiente: number; // lo que falta pagar de ese vale
}

/** Aplica abonos FIFO sobre vales crédito: qué vales siguen impagos */
export function pendientesFIFO(movs: Movimiento[]): Pendiente[] {
  const vales: Pendiente[] = [];
  let pozo = 0; // abonos sin aplicar
  for (const m of movs) {
    if (!vivo(m)) continue;
    const e = efectoDeuda(m);
    if (e > 0) vales.push({ mov: m, pendiente: e });
    if (e < 0) pozo += -e;
  }
  for (const v of vales) {
    const aplica = Math.min(pozo, v.pendiente);
    v.pendiente -= aplica;
    pozo -= aplica;
  }
  return vales.filter((v) => v.pendiente > 0);
}

export interface EstadoCliente {
  cliente: Cliente;
  saldo: number;
  ultimoPago: Fecha | null;
  ultimaCompra: Fecha | null;
  diasSinPagar: number | null; // null si no debe
  diasSinComprar: number | null;
  valeMasAntiguo: Fecha | null;
  semaforoCalc: Semaforo;
  semaforo: Semaforo;
  manual: boolean;
  compra: boolean; // sigue comprando
  compras30: number; // monto comprado últimos 30 días
  pendientes: Pendiente[];
  sobreLimite: boolean;
}

export function estadoCliente(c: Cliente, idx: Indice, cfg: Config, hoy: Fecha): EstadoCliente {
  const movs = idx.movsCliente.get(c.id) ?? [];
  let saldo = 0;
  let ultimoPago: Fecha | null = null;
  let ultimaCompra: Fecha | null = null;
  let compras30 = 0;
  for (const m of movs) {
    saldo += efectoDeuda(m);
    if (!vivo(m)) continue;
    if (m.tipo === "ABONO" && (!ultimoPago || m.fecha > ultimoPago)) ultimoPago = m.fecha;
    if (m.tipo === "VALE_CREDITO" || m.tipo === "VALE_VENTA") {
      if (m.importado) continue;
      if (!ultimaCompra || m.fecha > ultimaCompra) ultimaCompra = m.fecha;
      if (diasEntre(m.fecha, hoy) <= 30) compras30 += m.total;
    }
  }
  const pendientes = saldo > 0 ? pendientesFIFO(movs) : [];
  const valeMasAntiguo = pendientes[0]?.mov.fecha ?? null;
  const ref = ultimoPago ?? valeMasAntiguo;
  const diasSinPagar = saldo > 0 && ref ? diasEntre(ref, hoy) : null;
  const semaforoCalc: Semaforo =
    diasSinPagar === null || diasSinPagar < cfg.dias_amarillo
      ? "VERDE"
      : diasSinPagar < cfg.dias_rojo
        ? "AMARILLO"
        : "ROJO";
  const diasSinComprar = ultimaCompra ? diasEntre(ultimaCompra, hoy) : null;
  const compraCalc = diasSinComprar !== null && diasSinComprar <= cfg.dias_sin_compra;
  return {
    cliente: c,
    saldo,
    ultimoPago,
    ultimaCompra,
    diasSinPagar,
    diasSinComprar,
    valeMasAntiguo,
    semaforoCalc,
    semaforo: c.semaforo_manual ?? semaforoCalc,
    manual: c.semaforo_manual !== null,
    compra: c.compra_manual ?? compraCalc,
    compras30,
    pendientes,
    sobreLimite: c.limite_credito !== null && saldo > c.limite_credito,
  };
}

/** Último precio cobrado de un producto (general y a este cliente) */
export function ultimoPrecio(
  db: Db,
  idx: Indice,
  productoId: string,
  clienteId?: string | null,
  unidad?: string,
): { general?: { precio: number; fecha: Fecha; unidad: string }; cliente?: { precio: number; fecha: Fecha } } {
  const movPorId = idx.mov;
  let general: { precio: number; fecha: Fecha; unidad: string; at: string } | undefined;
  let cliente: { precio: number; fecha: Fecha; at: string } | undefined;
  for (const l of db.lineas) {
    if (l.producto_id !== productoId) continue;
    const m = movPorId.get(l.movimiento_id);
    if (!m || !vivo(m)) continue;
    if (unidad && l.unidad !== unidad) continue;
    if (!general || m.created_at > general.at)
      general = { precio: l.precio_unitario, fecha: m.fecha, unidad: l.unidad, at: m.created_at };
    if (clienteId && m.cliente_id === clienteId && (!cliente || m.created_at > cliente.at))
      cliente = { precio: l.precio_unitario, fecha: m.fecha, at: m.created_at };
  }
  return { general, cliente };
}

/** Pizarra del día: último precio por producto (hoy o el último día con ventas) */
export function pizarra(db: Db, idx: Indice): { producto: Producto; precio: number; fecha: Fecha; unidad: string; delta: number }[] {
  const out = new Map<string, { precio: number; fecha: Fecha; unidad: string; at: string; previo?: number }>();
  const movPorId = idx.mov;
  const lineas = db.lineas
    .map((l) => ({ l, m: movPorId.get(l.movimiento_id)! }))
    .filter(({ m }) => m && vivo(m))
    .sort((a, b) => a.m.created_at.localeCompare(b.m.created_at));
  for (const { l, m } of lineas) {
    const prev = out.get(l.producto_id);
    const previo = prev && prev.fecha !== m.fecha ? prev.precio : prev?.previo;
    out.set(l.producto_id, { precio: l.precio_unitario, fecha: m.fecha, unidad: l.unidad, at: m.created_at, previo });
  }
  return db.productos
    .filter((p) => p.activo && out.has(p.id))
    .map((p) => {
      const o = out.get(p.id)!;
      return { producto: p, precio: o.precio, fecha: o.fecha, unidad: o.unidad, delta: o.previo ? o.precio - o.previo : 0 };
    });
}

export function resumenCaja(movs: Movimiento[]): ResumenCaja {
  const r: ResumenCaja = {
    vale_venta: 0, vale_credito: 0, abonos: 0, ingresos: 0, egresos: 0,
    efectivo: 0, transferencia: 0, credito: 0, egresos_efectivo: 0, efectivo_esperado: 0, cantidad: 0,
    envases_cobro: 0, envases_devolucion: 0, devolucion_efectivo: 0,
  };
  for (const m of movs) {
    if (!vivo(m)) continue;
    r.cantidad++;
    switch (m.tipo) {
      case "VALE_VENTA": r.vale_venta += m.total; break;
      case "VALE_CREDITO": r.vale_credito += m.total; break;
      case "ABONO": r.abonos += m.total; break;
      case "INGRESO": r.ingresos += m.total; break;
      case "EGRESO": r.egresos += m.total; break;
      case "ENVASE_COBRO": r.envases_cobro! += m.total; break;
      case "ENVASE_DEVOLUCION": r.envases_devolucion! += m.total; break;
    }
    if (m.tipo === "ENVASE_DEVOLUCION") {
      // devolver garantía es plata que SALE: en efectivo baja el cajón
      if (m.forma_pago === "EFECTIVO") r.devolucion_efectivo! += m.total;
      continue;
    }
    if (m.tipo === "EGRESO") {
      if (m.forma_pago === "EFECTIVO") r.egresos_efectivo += m.total;
      continue;
    }
    if (m.forma_pago === "EFECTIVO") r.efectivo += m.total;
    else if (m.forma_pago === "TRANSFERENCIA") r.transferencia += m.total;
    else r.credito += m.total;
  }
  r.efectivo_esperado = r.efectivo - r.egresos_efectivo - r.devolucion_efectivo!;
  return r;
}

/* ----------------------- cuenta cliente: libro mayor ----------------------- */

export interface FilaCuenta {
  mov: Movimiento;
  saldo: number; // saldo acumulado después de este movimiento
}
export interface SemanaCuenta {
  key: string;
  semana: number;
  lunes: Fecha;
  filas: FilaCuenta[];
  credito: number;
  pago: number;
  venta: number;
  saldoFinal: number;
}
export interface MesCuenta {
  key: string; // "2026-10"
  anio: number;
  mes: number;
  semanas: SemanaCuenta[];
  credito: number;
  pago: number;
  venta: number;
  saldoFinal: number;
}

export function libroCuenta(
  movs: Movimiento[],
  desde: Fecha | null,
  hasta: Fecha | null,
): { saldoAnterior: number; meses: MesCuenta[] } {
  let saldo = 0;
  let saldoAnterior = 0;
  const meses: MesCuenta[] = [];
  for (const m of movs) {
    if (desde && m.fecha < desde) {
      saldo += efectoDeuda(m);
      saldoAnterior = saldo;
      continue;
    }
    if (hasta && m.fecha > hasta) continue;
    saldo += efectoDeuda(m);
    const [y, mo] = m.fecha.split("-").map(Number);
    const mkey = `${y}-${String(mo).padStart(2, "0")}`;
    let mes = meses[meses.length - 1];
    if (!mes || mes.key !== mkey) {
      mes = { key: mkey, anio: y, mes: mo, semanas: [], credito: 0, pago: 0, venta: 0, saldoFinal: 0 };
      meses.push(mes);
    }
    const { semana } = semanaISO(m.fecha);
    const skey = `${mkey}-S${semana}`;
    let sem = mes.semanas[mes.semanas.length - 1];
    if (!sem || sem.key !== skey) {
      sem = { key: skey, semana, lunes: lunesDe(m.fecha), filas: [], credito: 0, pago: 0, venta: 0, saldoFinal: 0 };
      mes.semanas.push(sem);
    }
    sem.filas.push({ mov: m, saldo });
    if (vivo(m)) {
      const col = columnaCuenta(m);
      if (col) {
        sem[col] += m.total;
        mes[col] += m.total;
      }
    }
    sem.saldoFinal = saldo;
    mes.saldoFinal = saldo;
  }
  return { saldoAnterior, meses };
}

export const ETIQUETA_TIPO: Record<Movimiento["tipo"], string> = {
  VALE_VENTA: "Vale venta",
  VALE_CREDITO: "Vale crédito",
  ABONO: "Abono crédito",
  INGRESO: "Ingreso caja",
  EGRESO: "Egreso caja",
  ENVASE_COBRO: "Envases: cobro",
  ENVASE_DEVOLUCION: "Envases: devolución",
};

/* --------------------------------- envases --------------------------------- */

export interface SaldoEnvase {
  envase_id: string;
  cantidad: number; // en poder del cliente (entregados − devueltos)
  garantia: number; // plata en garantía (cobrada − devuelta)
}

/** Envases en poder de cada cliente, por tipo (solo movimientos vigentes). */
export function envasesPorCliente(db: Db, idx: Indice): Map<string, SaldoEnvase[]> {
  const m = new Map<string, Map<string, SaldoEnvase>>();
  for (const l of db.lineas_envase) {
    const mov = idx.mov.get(l.movimiento_id);
    if (!mov || !vivo(mov) || !mov.cliente_id) continue;
    const signo = mov.tipo === "ENVASE_COBRO" ? 1 : mov.tipo === "ENVASE_DEVOLUCION" ? -1 : 0;
    if (!signo) continue;
    const porTipo = m.get(mov.cliente_id) ?? new Map<string, SaldoEnvase>();
    const s = porTipo.get(l.envase_id) ?? { envase_id: l.envase_id, cantidad: 0, garantia: 0 };
    s.cantidad += signo * l.cantidad;
    s.garantia += signo * l.subtotal;
    porTipo.set(l.envase_id, s);
    m.set(mov.cliente_id, porTipo);
  }
  const out = new Map<string, SaldoEnvase[]>();
  m.forEach((porTipo, cli) => {
    const xs = [...porTipo.values()].filter((s) => s.cantidad !== 0 || s.garantia !== 0);
    if (xs.length) out.set(cli, xs);
  });
  return out;
}
