/** Sueldos: cuánto le corresponde a cada trabajador en un período y cuánto falta pagarle. */
import type { Asistencia, Db, Fecha, Modalidad, PagoSueldo, Trabajador } from "./types";
import { fromFecha, MESES, sumarDias, toFecha, uid } from "./format";

export const MODALIDAD: Record<Modalidad, { label: string; por: string; periodo: string }> = {
  DIA: { label: "Por día trabajado", por: "por día", periodo: "semana" },
  SEMANA: { label: "Sueldo semanal", por: "a la semana", periodo: "semana" },
  MES: { label: "Sueldo mensual", por: "al mes", periodo: "mes" },
};

export const TIPO_PAGO: Record<PagoSueldo["tipo"], { label: string; signo: 1 | -1; ayuda: string }> = {
  PAGO: { label: "Pago", signo: 1, ayuda: "Pago del sueldo (total o parte)" },
  ADELANTO: { label: "Adelanto", signo: 1, ayuda: "Plata que se le pasa antes del día de pago" },
  BONO: { label: "Bono", signo: 1, ayuda: "Plata extra que se suma a lo que le corresponde" },
  DESCUENTO: { label: "Descuento", signo: -1, ayuda: "Se resta de lo que le corresponde (ej: faltante)" },
};

export interface Periodo {
  desde: Fecha;
  hasta: Fecha;
  nombre: string;
}

export function periodoSemana(lunes: Fecha): Periodo {
  return { desde: lunes, hasta: sumarDias(lunes, 6), nombre: "semana" };
}

export function periodoMes(fecha: Fecha): Periodo {
  const d = fromFecha(fecha);
  const ini = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
  return { desde: toFecha(ini), hasta: toFecha(fin), nombre: `${MESES[d.getMonth()]} ${d.getFullYear()}` };
}

export interface CuentaTrabajador {
  t: Trabajador;
  periodo: Periodo;
  dias: Fecha[]; // días trabajados en el período (modalidad DIA)
  base: number; // lo que corresponde por días o sueldo fijo
  bonos: number;
  descuentos: number;
  corresponde: number; // base + bonos − descuentos
  adelantos: number;
  pagado: number; // pagos + adelantos
  falta: number; // corresponde − pagado
  pagos: PagoSueldo[];
}

export function cuentaTrabajador(db: Db, t: Trabajador, periodo: Periodo): CuentaTrabajador {
  const dentro = (f: Fecha) => f >= periodo.desde && f <= periodo.hasta;
  const dias = db.asistencias.filter((a) => a.trabajador_id === t.id && dentro(a.fecha)).map((a) => a.fecha).sort();
  const base = t.modalidad === "DIA" ? dias.length * t.monto : t.monto;
  const pagos = db.pagos_sueldo.filter((p) => p.trabajador_id === t.id && dentro(p.fecha)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  let bonos = 0, descuentos = 0, adelantos = 0, pagado = 0;
  for (const p of pagos) {
    if (p.anulado_at) continue;
    if (p.tipo === "BONO") bonos += p.monto;
    else if (p.tipo === "DESCUENTO") descuentos += p.monto;
    else {
      pagado += p.monto;
      if (p.tipo === "ADELANTO") adelantos += p.monto;
    }
  }
  const corresponde = base + bonos - descuentos;
  return { t, periodo, dias, base, bonos, descuentos, corresponde, adelantos, pagado, falta: corresponde - pagado, pagos };
}

/* --------------------------- datos de ejemplo --------------------------- */

export function sueldosEjemplo(tenant: string, anclaje: Fecha, lunesDe: (f: Fecha) => Fecha) {
  const now = new Date().toISOString();
  const mk = (nombre: string, cargo: string, modalidad: Modalidad, monto: number, telefono: string): Trabajador => ({
    id: uid(), tenant_id: tenant, nombre, cargo, modalidad, monto, telefono, activo: true, created_at: now,
  });
  const trabajadores = [
    mk("Pedro Carrasco", "Cargador", "DIA", 25000, "+56 9 7123 4410"),
    mk("Luis «Chico» Soto", "Carretillero", "DIA", 20000, "+56 9 6611 2093"),
    mk("Marisol Fuentes", "Caja", "SEMANA", 160000, "+56 9 8844 1270"),
    mk("Jorge Ibarra", "Vendedor", "SEMANA", 180000, "+56 9 5532 9087"),
    mk("Rosa Medina", "Administración", "MES", 680000, "+56 9 9012 3345"),
  ];
  const asistencias: Asistencia[] = [];
  const pagos: PagoSueldo[] = [];
  const pago = (t: Trabajador, fecha: Fecha, tipo: PagoSueldo["tipo"], monto: number, forma: PagoSueldo["forma"], nota: string | null = null) =>
    pagos.push({
      id: uid(), tenant_id: tenant, trabajador_id: t.id, fecha, tipo, monto, forma, movimiento_id: null, nota,
      creado_por: "Israel", created_at: new Date(fecha + "T17:00:00").toISOString(), anulado_at: null, anulado_por: null, motivo_anulacion: null,
    });

  const lunesHoy = lunesDe(anclaje);
  for (let w = 5; w >= 0; w--) {
    const lunes = sumarDias(lunesHoy, -7 * w);
    trabajadores.forEach((t, ti) => {
      if (t.modalidad !== "DIA") return;
      for (let d = 0; d < 6; d++) {
        const f = sumarDias(lunes, d);
        if (f > anclaje) break;
        if ((w + d + ti) % 7 === 3) continue; // algún día que faltó
        asistencias.push({ id: uid(), tenant_id: tenant, trabajador_id: t.id, fecha: f });
      }
    });
    const sabado = sumarDias(lunes, 5);
    const miercoles = sumarDias(lunes, 2);
    if (w > 0) {
      // semanas pasadas: pagadas el sábado (con algún adelanto a mitad de semana)
      for (const t of trabajadores) {
        if (t.modalidad === "MES") continue;
        const dias = asistencias.filter((a) => a.trabajador_id === t.id && a.fecha >= lunes && a.fecha <= sumarDias(lunes, 6)).length;
        const total = t.modalidad === "DIA" ? dias * t.monto : t.monto;
        const adelanto = w % 2 === 0 && t.modalidad === "SEMANA" ? 40000 : 0;
        if (adelanto) pago(t, miercoles, "ADELANTO", adelanto, "EFECTIVO", "Para la micro y colación");
        pago(t, sabado, "PAGO", total - adelanto, t.modalidad === "DIA" ? "EFECTIVO" : "TRANSFERENCIA");
      }
    } else if (miercoles <= anclaje) {
      // semana en curso: solo adelantos
      pago(trabajadores[3], miercoles, "ADELANTO", 50000, "EFECTIVO");
      pago(trabajadores[0], miercoles, "ADELANTO", 30000, "EFECTIVO");
    }
  }
  // mensual: adelanto a mitad de mes y pago del mes anterior
  const rosa = trabajadores[4];
  const mes = periodoMes(anclaje);
  const quince = sumarDias(mes.desde, 14);
  if (quince <= anclaje) pago(rosa, quince, "ADELANTO", 200000, "TRANSFERENCIA", "Quincena");
  const anterior = periodoMes(sumarDias(mes.desde, -1));
  pago(rosa, sumarDias(anterior.desde, 14), "ADELANTO", 200000, "TRANSFERENCIA", "Quincena");
  pago(rosa, anterior.hasta, "PAGO", 510000, "TRANSFERENCIA");
  pago(rosa, anterior.hasta, "BONO", 30000, "TRANSFERENCIA", "Bono fiestas");
  return { trabajadores, asistencias, pagos_sueldo: pagos };
}
