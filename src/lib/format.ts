import type { Fecha } from "./types";

const clpFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/** 1234567 → "1.234.567" */
export function miles(n: number): string {
  return clpFmt.format(Math.round(n));
}

/** 1234567 → "$1.234.567"; negativos como "-$1.234" */
export function clp(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + clpFmt.format(Math.abs(r));
}

/** Cantidad: 5 → "5", 12.5 → "12,5" */
export function cant(n: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(n);
}

/**
 * Lee montos como los escribe la gente de caja:
 * "12000", "12.000", "12k", "12 mil", "12 lucas", "12,5k", "$ 12.000"
 */
export function parseMonto(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/\$/g, "").replace(/\s+/g, "");
  if (!s) return null;
  let mult = 1;
  const suf = s.match(/(k|mil|lucas?|luka?s?)$/);
  if (suf) {
    mult = 1000;
    s = s.slice(0, -suf[0].length);
    // en sufijos la coma/punto es decimal: "12,5k"
    s = s.replace(",", ".");
  } else {
    // sin sufijo: el punto es separador de miles, la coma decimal
    s = s.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s) * mult;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Cantidades: "5", "12,5", "12.5" */
export function parseCantidad(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  return n > 0 ? n : null;
}

/* ----------------------------- fechas ----------------------------- */

export function hoy(): Fecha {
  return toFecha(new Date());
}

export function toFecha(d: Date): Fecha {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromFecha(f: Fecha): Date {
  const [y, m, d] = f.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // mediodía: evita saltos por horario de verano
}

export function sumarDias(f: Fecha, n: number): Fecha {
  const d = fromFecha(f);
  d.setDate(d.getDate() + n);
  return toFecha(d);
}

export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((fromFecha(hasta).getTime() - fromFecha(desde).getTime()) / 86400000);
}

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "30/10" */
export function ddmm(f: Fecha): string {
  const [, m, d] = f.split("-");
  return `${d}/${m}`;
}

/** "30/10/26" */
export function ddmmaa(f: Fecha): string {
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** "vie 30 oct" */
export function fechaCorta(f: Fecha): string {
  const d = fromFecha(f);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** "viernes 30 de octubre" */
export function fechaLarga(f: Fecha): string {
  const d = fromFecha(f);
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function hora(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Semana ISO (lunes a domingo), la que usan en la planilla: N°40, N°41… */
export function semanaISO(f: Fecha): { semana: number; anio: number } {
  const d = fromFecha(f);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((t.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
  return { semana, anio: t.getUTCFullYear() };
}

/** Lunes de la semana de f */
export function lunesDe(f: Fecha): Fecha {
  const d = fromFecha(f);
  const dia = d.getDay() || 7;
  return sumarDias(f, 1 - dia);
}

/** "hace 3 días", "hoy", "ayer" */
export function haceDias(n: number | null): string {
  if (n === null) return "nunca";
  if (n <= 0) return "hoy";
  if (n === 1) return "ayer";
  if (n < 60) return `hace ${n} días`;
  const meses = Math.floor(n / 30);
  return `hace ${meses} meses`;
}

/* ----------------------------- texto ----------------------------- */

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Iniciales: "PINK LADY" → "pl" */
export function iniciales(s: string): string {
  return normalizar(s)
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
}

/** UUID v4. randomUUID no existe en http sin TLS (ej. IP de la red local), así que hay respaldo. */
export function uid(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
