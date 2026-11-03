import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./pg";
import type { Tabla } from "./tablas";

/** Quién hace la petición, según su sesión (no según lo que diga el navegador). */
export interface Quien {
  tipo: "ADMIN" | "PERSONAL" | "SISTEMA";
  id: string | null;
  nombre: string;
}

export interface Entrada {
  tabla: string;
  registro_id: string | null;
  accion: "CREAR" | "MODIFICAR" | "ANULAR" | "BORRAR" | "ENTRAR" | "SALIR" | "SEGURIDAD";
  descripcion: string;
  cambios?: Record<string, [unknown, unknown]> | null;
}

type Fila = Record<string, unknown>;
type Ejecutor = Pick<PoolClient, "query">;

/** Anota entradas en el historial (dentro de la transacción si se pasa `c`). */
export async function anotarHistorial(c: Ejecutor | null, tenant: string, quien: Quien, ip: string | null, entradas: Entrada[]) {
  if (!entradas.length) return;
  const ej = c ?? pool();
  for (let i = 0; i < entradas.length; i += 200) {
    const lote = entradas.slice(i, i + 200);
    const valores: unknown[] = [];
    const tuplas = lote.map((e) => {
      valores.push(tenant, quien.nombre, quien.tipo, quien.id, ip, e.tabla, e.registro_id, e.accion, e.descripcion, e.cambios ? JSON.stringify(e.cambios) : null);
      const b = valores.length - 10;
      return `(${Array.from({ length: 10 }, (_, k) => `$${b + k + 1}`).join(", ")})`;
    });
    await ej.query(
      `insert into historial (tenant_id, usuario, usuario_tipo, usuario_id, ip, tabla, registro_id, accion, descripcion, cambios) values ${tuplas.join(", ")}`,
      valores,
    );
  }
}

/* --------------------------- descripciones --------------------------- */

const TIPO: Record<string, string> = {
  VALE_VENTA: "Vale venta",
  VALE_CREDITO: "Vale crédito",
  ABONO: "Abono",
  INGRESO: "Ingreso de caja",
  EGRESO: "Egreso de caja",
  ENVASE_COBRO: "Entrega de envases",
  ENVASE_DEVOLUCION: "Devolución de envases",
};

const clp = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString("es-CL")}`;

/** Columnas que no vale la pena mostrar como "cambio" */
const OCULTAS = new Set(["id", "tenant_id", "created_at", "orden"]);

function norm(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") {
    if (/^-?\d+(\.\d+)?$/.test(v)) return String(Number(v));
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? v : d.toISOString();
    }
    return v;
  }
  return JSON.stringify(v);
}

/** Campos que cambiaron entre la fila guardada y la nueva. */
export function diferencias(antes: Fila, despues: Fila, cols: readonly string[]): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const col of cols) {
    if (OCULTAS.has(col) || !(col in despues)) continue;
    if (norm(antes[col]) !== norm(despues[col])) out[col] = [antes[col] ?? null, despues[col] ?? null];
  }
  return out;
}

export interface Contexto {
  cliente: (id: unknown) => string;
  trabajador: (id: unknown) => string;
}

function nombreDe(tabla: Tabla, f: Fila, ctx: Contexto): string {
  switch (tabla) {
    case "movimientos": {
      const cli = f.cliente_id ? ` · ${ctx.cliente(f.cliente_id)}` : "";
      return `${TIPO[String(f.tipo)] ?? f.tipo} N°${f.numero}${cli} · ${clp(f.total)}`;
    }
    case "clientes":
      return `Cliente ${f.alias ?? f.nombre}`;
    case "productos":
      return `Producto ${f.nombre}`;
    case "envases":
      return `Envase ${f.nombre}`;
    case "trabajadores":
      return `Trabajador ${f.nombre}`;
    case "usuarios":
      return `Usuario ${f.nombre}`;
    case "pagos_sueldo":
      return `Remuneración ${String(f.tipo ?? "").toLowerCase()} · ${ctx.trabajador(f.trabajador_id)} · ${clp(f.monto)}`;
    case "asistencias":
      return `Asistencia de ${ctx.trabajador(f.trabajador_id)} el ${f.fecha}`;
    case "cierres":
      return `Cierre de caja del ${f.fecha}`;
    case "cierres_semana":
      return `Cierre semanal ${f.lunes} a ${f.domingo}`;
    default:
      return tabla;
  }
}

/**
 * Traduce un cambio de una fila en una entrada de historial
 * (null si no cambió nada que importe).
 */
export function entradaDe(tabla: Tabla, antes: Fila | null, despues: Fila, cols: readonly string[], ctx: Contexto): Entrada | null {
  const id = despues.id ? String(despues.id) : null;
  if (!antes) {
    let desc = nombreDe(tabla, despues, ctx);
    if (tabla === "movimientos" && despues.glosa) desc += ` · ${despues.glosa}`;
    return { tabla, registro_id: id, accion: "CREAR", descripcion: desc };
  }
  const cambios = diferencias(antes, despues, cols);
  if (!Object.keys(cambios).length) return null;
  const anula = "anulado_at" in cambios && !antes.anulado_at && despues.anulado_at;
  if (anula) {
    return {
      tabla,
      registro_id: id,
      accion: "ANULAR",
      descripcion: `Anuló ${nombreDe(tabla, despues, ctx)}${despues.motivo_anulacion ? ` · motivo: ${despues.motivo_anulacion}` : ""}`,
      cambios,
    };
  }
  let desc = nombreDe(tabla, despues, ctx);
  if (tabla === "movimientos" && "numero" in cambios) desc = `Corrigió N° ${antes.numero} → ${despues.numero} · ${desc}`;
  if (tabla === "envases" && "precio" in cambios) desc += ` · precio ${clp(antes.precio)} → ${clp(despues.precio)}`;
  return { tabla, registro_id: id, accion: "MODIFICAR", descripcion: desc, cambios };
}
