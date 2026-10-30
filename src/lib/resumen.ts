/** Cálculos para la pantalla Resumen (todo derivado, nada guardado). */
import type { Db, Fecha, Producto } from "./types";
import { efectoDeuda, vivo, type EstadoCliente, type Indice } from "./calc";
import { diasEntre, lunesDe, semanaISO, sumarDias } from "./format";

export interface Semana {
  lunes: Fecha;
  semana: number;
  contado: number; // vale venta
  credito: number; // vale crédito
  abonos: number;
  calle: number; // fiado total al cierre de la semana
  vales: number;
}

export function porSemana(db: Db, hoy: Fecha, n = 13): Semana[] {
  const ultimo = lunesDe(hoy);
  const semanas: Semana[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const lunes = sumarDias(ultimo, -7 * i);
    semanas.push({ lunes, semana: semanaISO(lunes).semana, contado: 0, credito: 0, abonos: 0, calle: 0, vales: 0 });
  }
  const primero = semanas[0].lunes;
  const movs = [...db.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let calle = 0;
  let k = 0;
  for (const s of semanas) {
    const domingo = sumarDias(s.lunes, 6);
    while (k < movs.length && movs[k].fecha <= domingo) {
      const m = movs[k++];
      calle += efectoDeuda(m);
      if (m.fecha < primero || !vivo(m) || m.importado) continue;
      if (m.tipo === "VALE_VENTA") { s.contado += m.total; s.vales++; }
      if (m.tipo === "VALE_CREDITO") { s.credito += m.total; s.vales++; }
      if (m.tipo === "ABONO") s.abonos += m.total;
    }
    s.calle = calle;
  }
  return semanas;
}

export interface Tramo {
  label: string;
  desde: number;
  hasta: number | null;
  monto: number;
  clientes: number;
}

/** Antigüedad de la deuda: cuánto de lo fiado tiene X días (según vales impagos) */
export function antiguedad(estados: EstadoCliente[], hoy: Fecha): Tramo[] {
  const tramos: Tramo[] = [
    { label: "Menos de 15 días", desde: 0, hasta: 14, monto: 0, clientes: 0 },
    { label: "15 a 30 días", desde: 15, hasta: 30, monto: 0, clientes: 0 },
    { label: "31 a 60 días", desde: 31, hasta: 60, monto: 0, clientes: 0 },
    { label: "Más de 60 días", desde: 61, hasta: null, monto: 0, clientes: 0 },
  ];
  for (const e of estados) {
    const tocados = new Set<number>();
    for (const p of e.pendientes) {
      const d = diasEntre(p.mov.fecha, hoy);
      const i = tramos.findIndex((t) => d >= t.desde && (t.hasta === null || d <= t.hasta));
      tramos[i].monto += p.pendiente;
      tocados.add(i);
    }
    tocados.forEach((i) => tramos[i].clientes++);
  }
  return tramos;
}

export interface FilaProducto {
  producto: Producto;
  cajas: number;
  kilos: number;
  monto: number;
  ultimo: number | null;
  primero: number | null; // primer precio del período (para ver la tendencia)
}

/** Ventas por producto desde una fecha (contado + crédito) */
export function porProducto(db: Db, idx: Indice, desde: Fecha): FilaProducto[] {
  const m = new Map<string, FilaProducto>();
  const lineas = db.lineas
    .map((l) => ({ l, mov: idx.mov.get(l.movimiento_id) }))
    .filter(({ mov }) => mov && vivo(mov) && mov.fecha >= desde)
    .sort((a, b) => a.mov!.created_at.localeCompare(b.mov!.created_at));
  for (const { l } of lineas) {
    const p = idx.producto.get(l.producto_id);
    if (!p) continue;
    const f = m.get(p.id) ?? { producto: p, cajas: 0, kilos: 0, monto: 0, ultimo: null, primero: null };
    if (l.unidad === "KG") f.kilos += l.cantidad;
    else f.cajas += l.cantidad;
    f.monto += l.subtotal;
    if (l.unidad === p.unidad_default) {
      if (f.primero === null) f.primero = l.precio_unitario;
      f.ultimo = l.precio_unitario;
    }
    m.set(p.id, f);
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto);
}
