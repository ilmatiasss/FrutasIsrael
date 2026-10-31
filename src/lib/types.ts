/**
 * Modelo de datos — mismas columnas que las tablas de db/schema.sql.
 * Los nombres van en snake_case para que la migración sea copiar y pegar.
 * Todas las entidades llevan tenant_id desde el día uno (multi-locatario).
 */

export type UUID = string;
/** Fecha de negocio, sin hora: "2026-10-30" */
export type Fecha = string;
/** Timestamp ISO: "2026-10-30T09:41:12.000Z" */
export type Timestamp = string;

export type Unidad = "CAJA" | "ENVASE" | "KG";

export type TipoMovimiento =
  | "VALE_VENTA" // pagado al contado (efectivo o transferencia)
  | "VALE_CREDITO" // fiado: suma deuda
  | "ABONO" // pago / abono crédito: resta deuda
  | "INGRESO" // ingreso de caja (fondo, préstamo, etc.)
  | "EGRESO"; // egreso de caja (flete, colación, bolsas…)

export type FormaPago = "EFECTIVO" | "TRANSFERENCIA" | "CREDITO";

export type Semaforo = "VERDE" | "AMARILLO" | "ROJO";

export interface Tenant {
  id: UUID;
  nombre: string; // "Frutas Israel"
  ubicacion: string; // "La Vega Central · Santiago"
  /** último N° de vale emitido; el siguiente es +1 (correlativo por locatario) */
  ultimo_numero: number;
  created_at: Timestamp;
}

export interface Usuario {
  id: UUID;
  tenant_id: UUID;
  nombre: string;
  rol: "DUENO" | "CAJA";
}

export interface Cliente {
  id: UUID;
  tenant_id: UUID;
  nombre: string;
  /** como lo conocen en el local: "EL FLACO", "LA TÍA NENA" */
  alias: string | null;
  telefono: string | null;
  /** tope de crédito sugerido; null = sin tope */
  limite_credito: number | null;
  /** null = semáforo calculado por días sin pagar */
  semaforo_manual: Semaforo | null;
  /** null = calculado por última compra; true/false = forzado a mano */
  compra_manual: boolean | null;
  notas: string | null;
  created_at: Timestamp;
}

export interface Producto {
  id: UUID;
  tenant_id: UUID;
  nombre: string; // "FUJI"
  /** atajo de tipeo: "FU", "PL", "C34" */
  codigo: string;
  unidad_default: Unidad;
  /** color de la etiqueta del cajón (hex), solo visual */
  color: string;
  activo: boolean;
}

/**
 * Movimiento = una hoja del talonario. Es la unidad contable.
 * NUNCA se borra: se anula con anulado_at / anulado_por / motivo_anulacion.
 */
export interface Movimiento {
  id: UUID;
  tenant_id: UUID;
  numero: number; // correlativo único por tenant (N° de vale)
  tipo: TipoMovimiento;
  fecha: Fecha;
  cliente_id: UUID | null; // null en ingresos/egresos de caja
  forma_pago: FormaPago;
  total: number; // CLP enteros, siempre positivo; el signo lo da el tipo
  glosa: string | null;
  /** vale crédito que originó este abono "al tiro" (abono en el mismo vale) */
  origen_id: UUID | null;
  creado_por: string;
  created_at: Timestamp;
  anulado_at: Timestamp | null;
  anulado_por: string | null;
  motivo_anulacion: string | null;
  /** si vino del importador de Google Sheets */
  importado: boolean;
}

export interface LineaVale {
  id: UUID;
  tenant_id: UUID;
  movimiento_id: UUID;
  orden: number;
  cantidad: number; // puede ser decimal en KG
  unidad: Unidad;
  producto_id: UUID;
  precio_unitario: number;
  subtotal: number;
}

export interface CierreCaja {
  id: UUID;
  tenant_id: UUID;
  fecha: Fecha;
  cerrado_por: string;
  cerrado_at: Timestamp;
  /** foto de los totales al momento del cierre (para auditar diferencias) */
  snapshot: ResumenCaja;
  nota: string | null;
}

/** Cierre semanal (lunes a domingo): con cuánta deuda quedó cada cliente. */
export interface CierreSemana {
  id: UUID;
  tenant_id: UUID;
  lunes: Fecha;
  domingo: Fecha;
  cerrado_por: string;
  cerrado_at: Timestamp;
  total: number;
  saldos: { cliente_id: UUID; saldo: number }[];
}

/* ---------------------------------- sueldos ---------------------------------- */

/** Cómo se le paga: por día trabajado, fijo semanal o fijo mensual */
export type Modalidad = "DIA" | "SEMANA" | "MES";

export interface Trabajador {
  id: UUID;
  tenant_id: UUID;
  nombre: string;
  cargo: string; // "Cargador", "Carretillero", "Caja"…
  modalidad: Modalidad;
  monto: number; // por día, por semana o por mes según modalidad
  telefono: string | null;
  activo: boolean;
  created_at: Timestamp;
}

/** Día trabajado (para los que se pagan por día) */
export interface Asistencia {
  id: UUID;
  tenant_id: UUID;
  trabajador_id: UUID;
  fecha: Fecha;
}

export type TipoPagoSueldo = "PAGO" | "ADELANTO" | "BONO" | "DESCUENTO";

export interface PagoSueldo {
  id: UUID;
  tenant_id: UUID;
  trabajador_id: UUID;
  fecha: Fecha;
  tipo: TipoPagoSueldo;
  monto: number;
  forma: "EFECTIVO" | "TRANSFERENCIA";
  /** egreso de caja que generó (si salió plata del cajón) */
  movimiento_id: UUID | null;
  nota: string | null;
  creado_por: string;
  created_at: Timestamp;
  anulado_at: Timestamp | null;
  anulado_por: string | null;
  motivo_anulacion: string | null;
}

/** Bitácora append-only: todo lo que pasa queda escrito. */
export interface Evento {
  id: UUID;
  tenant_id: UUID;
  at: Timestamp;
  usuario: string;
  accion:
    | "CREAR_MOVIMIENTO"
    | "ANULAR_MOVIMIENTO"
    | "CREAR_CLIENTE"
    | "EDITAR_CLIENTE"
    | "CERRAR_CAJA"
    | "CERRAR_SEMANA"
    | "IMPORTAR_CSV"
    | "SUELDOS"
    | "SEGURIDAD"
    | "REINICIAR_DEMO";
  entidad_id: UUID | null;
  detalle: string;
}

export interface Config {
  /** días sin pagar para pasar a AMARILLO */
  dias_amarillo: number;
  /** días sin pagar para pasar a ROJO */
  dias_rojo: number;
  /** días sin comprar para marcar "ya no compra" */
  dias_sin_compra: number;
  usuario_actual: string;
}

export interface ResumenCaja {
  vale_venta: number;
  vale_credito: number;
  abonos: number;
  ingresos: number;
  egresos: number;
  efectivo: number; // entradas en efectivo (ventas + abonos + ingresos)
  transferencia: number;
  credito: number;
  egresos_efectivo: number;
  efectivo_esperado: number; // lo que debería haber en el cajón
  cantidad: number;
}

/** "Base de datos" local completa: lo que hoy vive en localStorage. */
export interface Db {
  version: 1;
  tenant: Tenant;
  usuarios: Usuario[];
  clientes: Cliente[];
  productos: Producto[];
  movimientos: Movimiento[];
  lineas: LineaVale[];
  cierres: CierreCaja[];
  cierres_semana: CierreSemana[];
  trabajadores: Trabajador[];
  asistencias: Asistencia[];
  pagos_sueldo: PagoSueldo[];
  eventos: Evento[];
  config: Config;
}
