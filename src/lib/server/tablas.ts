import "server-only";

/* Qué tablas y columnas acepta el servidor (lista blanca). El orden importa:
   primero lo que otros referencian. */

export const TABLAS = {
  usuarios: ["id", "tenant_id", "nombre", "rol"],
  clientes: ["id", "tenant_id", "nombre", "alias", "telefono", "limite_credito", "semaforo_manual", "compra_manual", "notas", "created_at"],
  productos: ["id", "tenant_id", "nombre", "codigo", "unidad_default", "color", "activo"],
  trabajadores: ["id", "tenant_id", "nombre", "cargo", "modalidad", "monto", "telefono", "activo", "created_at"],
  movimientos: [
    "id", "tenant_id", "numero", "tipo", "fecha", "cliente_id", "forma_pago", "total", "glosa", "origen_id",
    "creado_por", "created_at", "anulado_at", "anulado_por", "motivo_anulacion", "importado",
  ],
  lineas: ["id", "tenant_id", "movimiento_id", "orden", "cantidad", "unidad", "producto_id", "precio_unitario", "subtotal"],
  cierres: ["id", "tenant_id", "fecha", "cerrado_por", "cerrado_at", "snapshot", "nota"],
  cierres_semana: ["id", "tenant_id", "lunes", "domingo", "cerrado_por", "cerrado_at", "total", "saldos"],
  asistencias: ["id", "tenant_id", "trabajador_id", "fecha"],
  pagos_sueldo: [
    "id", "tenant_id", "trabajador_id", "fecha", "tipo", "monto", "forma", "movimiento_id", "nota", "creado_por",
    "created_at", "anulado_at", "anulado_por", "motivo_anulacion",
  ],
  eventos: ["id", "tenant_id", "at", "usuario", "accion", "entidad_id", "detalle"],
} as const;

export type Tabla = keyof typeof TABLAS;

/** nombre en la app → nombre en Postgres */
export const SQL_NOMBRE: Record<Tabla, string> = {
  usuarios: "usuarios",
  clientes: "clientes",
  productos: "productos",
  trabajadores: "trabajadores",
  movimientos: "movimientos",
  lineas: "lineas_vale",
  cierres: "cierres_caja",
  cierres_semana: "cierres_semana",
  asistencias: "asistencias",
  pagos_sueldo: "pagos_sueldo",
  eventos: "eventos",
};

export const ORDEN: Tabla[] = Object.keys(TABLAS) as Tabla[];

/** Tablas donde se permite borrar filas (todo lo demás es solo agregar / actualizar) */
export const BORRABLES: Tabla[] = ["asistencias"];

export const JSONB = new Set(["snapshot", "saldos"]);
