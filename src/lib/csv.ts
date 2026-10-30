/**
 * Importador desde Google Sheets (Archivo → Descargar → CSV).
 * Acepta dos formas de planilla:
 *  A) una columna TIPO + una columna MONTO
 *  B) columnas separadas VALE CRÉDITO / PAGO CRÉDITO / VALE VENTA (como la cuenta cliente)
 */
import type { FormaPago, TipoMovimiento } from "./types";
import { normalizar, parseMonto } from "./format";
import type { ImportFila } from "./store";

export function parseCSV(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : primera.includes("\t") ? "\t" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      if (fila.some((c) => c.trim())) filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  fila.push(celda);
  if (fila.some((c) => c.trim())) filas.push(fila);
  return filas;
}

export type Campo = "fecha" | "numero" | "cliente" | "tipo" | "forma" | "monto" | "glosa" | "credito" | "pago" | "venta" | "ignorar";

export const CAMPOS: { k: Campo; label: string }[] = [
  { k: "fecha", label: "Fecha" },
  { k: "numero", label: "N° vale" },
  { k: "cliente", label: "Cliente" },
  { k: "tipo", label: "Tipo de movimiento" },
  { k: "forma", label: "Forma de pago" },
  { k: "monto", label: "Monto" },
  { k: "credito", label: "Col. Vale crédito" },
  { k: "pago", label: "Col. Pago crédito" },
  { k: "venta", label: "Col. Vale venta" },
  { k: "glosa", label: "Detalle / glosa" },
  { k: "ignorar", label: "— ignorar —" },
];

export function adivinarCampo(header: string): Campo {
  const h = normalizar(header);
  if (/^fecha|^dia$/.test(h)) return "fecha";
  if (/^(n|no|nro|num|numero)( de)? ?vale|^n$|^numero$|^folio/.test(h)) return "numero";
  if (/cliente|nombre|razon/.test(h)) return "cliente";
  if (/vale credito|^credito$|fiado/.test(h)) return "credito";
  if (/pago credito|abono|^pago$/.test(h)) return "pago";
  if (/vale venta|^venta$|contado/.test(h)) return "venta";
  if (/tipo|movimiento/.test(h)) return "tipo";
  if (/forma|medio/.test(h)) return "forma";
  if (/monto|total|valor|importe/.test(h)) return "monto";
  if (/detalle|glosa|obs|producto|nota/.test(h)) return "glosa";
  return "ignorar";
}

export function parseFechaCL(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mes = Number(m[2]), dia = Number(m[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${y}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  return null;
}

export function parseTipo(s: string): TipoMovimiento | null {
  const t = normalizar(s);
  if (!t) return null;
  if (t.includes("egreso") || t.includes("gasto")) return "EGRESO";
  if (t.includes("ingreso")) return "INGRESO";
  if (t.includes("pago") || t.includes("abono")) return "ABONO";
  if (t.includes("credito") || t.includes("fiado")) return "VALE_CREDITO";
  if (t.includes("venta") || t.includes("contado")) return "VALE_VENTA";
  return null;
}

export function parseForma(s: string, tipo: TipoMovimiento): FormaPago {
  if (tipo === "VALE_CREDITO") return "CREDITO";
  const t = normalizar(s);
  if (t.startsWith("transf") || t.includes("banco")) return "TRANSFERENCIA";
  return "EFECTIVO";
}

export interface FilaRevisada {
  linea: number;
  ok: boolean;
  error?: string;
  fila?: ImportFila;
}

export function revisar(filas: string[][], mapa: Campo[]): FilaRevisada[] {
  const col = (f: string[], c: Campo) => {
    const i = mapa.indexOf(c);
    return i >= 0 ? (f[i] ?? "").trim() : "";
  };
  const out: FilaRevisada[] = [];
  filas.forEach((f, i) => {
    const linea = i + 2;
    const fecha = parseFechaCL(col(f, "fecha"));
    if (!fecha) return out.push({ linea, ok: false, error: `fecha inválida “${col(f, "fecha")}”` });
    let tipo: TipoMovimiento | null = null;
    let monto: number | null = null;
    if (mapa.includes("credito") || mapa.includes("pago") || mapa.includes("venta")) {
      for (const [c, t] of [["credito", "VALE_CREDITO"], ["pago", "ABONO"], ["venta", "VALE_VENTA"]] as const) {
        const v = parseMonto(col(f, c));
        if (v) {
          tipo = t;
          monto = v;
          break;
        }
      }
    }
    if (!tipo) {
      tipo = parseTipo(col(f, "tipo"));
      monto = parseMonto(col(f, "monto"));
    }
    if (!tipo) return out.push({ linea, ok: false, error: "no se reconoce el tipo" });
    if (!monto || monto <= 0) return out.push({ linea, ok: false, error: "monto vacío" });
    const cliente = col(f, "cliente");
    if (!cliente && tipo !== "INGRESO" && tipo !== "EGRESO") return out.push({ linea, ok: false, error: "falta cliente" });
    const n = parseInt(col(f, "numero").replace(/\D/g, ""), 10);
    out.push({
      linea,
      ok: true,
      fila: {
        fecha,
        numero: Number.isFinite(n) ? n : null,
        cliente,
        tipo,
        forma: parseForma(col(f, "forma"), tipo),
        monto,
        glosa: col(f, "glosa") || null,
      },
    });
  });
  return out;
}

export const CSV_EJEMPLO = `FECHA;N° VALE;CLIENTE;DETALLE;VALE CREDITO;PAGO CREDITO;VALE VENTA;FORMA
02/03/2026;15020;Don Raúl;8 cj FUJI;120000;;;CREDITO
02/03/2026;15021;Raúl Contreras Soto;;;80000;;EFECTIVO
03/03/2026;15030;Verdulería Los Aromos;3 cj PERA;;;46500;TRANSFERENCIA
04/03/2026;15041;El Flaco;5 cj VERDE;65000;;;CREDITO
`;
