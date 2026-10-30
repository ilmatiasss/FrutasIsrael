"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* Gráficos SVG livianos para el Resumen.
   Reglas: un solo eje, marcas delgadas, grilla tenue, leyenda con ≥2 series,
   tooltip al pasar el mouse (o tocar), etiquetas solo donde aportan. */

export const SERIE = { contado: "#3a6ea5", credito: "#c2553f" };
const GRILLA = "#e4dfd5";
const TEXTO = "#6c665d";

export function compacto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000).toLocaleString("es-CL")} mil`;
  return `$${v}`;
}

function ticksLindos(max: number, n = 4): number[] {
  if (max <= 0) return [0];
  const paso0 = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(paso0)));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= paso0) ?? 10 * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + paso * 0.001; v += paso) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + paso);
  return out;
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Tooltip({ x, y, ancho, children }: { x: number; y: number; ancho: number; children: ReactNode }) {
  const izq = x > ancho - 170;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[200px] rounded-md border border-linea bg-hoja px-3 py-2 text-xs shadow-md"
      style={{ left: izq ? undefined : x + 12, right: izq ? ancho - x + 12 : undefined, top: Math.max(0, y - 10) }}
    >
      {children}
    </div>
  );
}

export function Leyenda({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm text-gris">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------- columnas apiladas ---------------------------- */

export interface Columna {
  etiqueta: string;
  detalle: string;
  partes: { valor: number; color: string; label: string }[];
  parcial?: boolean;
}

export function ColumnasApiladas({ datos, alto = 220 }: { datos: Columna[]; alto?: number }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pl = 52, pr = 8, pt = 22, pb = 24;
  const totales = datos.map((d) => d.partes.reduce((a, p) => a + p.valor, 0));
  const ticks = ticksLindos(Math.max(1, ...totales));
  const max = ticks[ticks.length - 1];
  const plotW = Math.max(0, ancho - pl - pr);
  const plotH = alto - pt - pb;
  const banda = datos.length ? plotW / datos.length : 0;
  const barra = Math.min(24, banda * 0.62);
  const y = (v: number) => pt + plotH - (v / max) * plotH;
  const cadaCuanto = banda < 34 ? 2 : 1;

  return (
    <div ref={ref} className="relative">
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="img" aria-label="Ventas por semana" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pl} x2={ancho - pr} y1={y(t)} y2={y(t)} stroke={GRILLA} strokeWidth={1} />
              <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={TEXTO}>
                {compacto(t)}
              </text>
            </g>
          ))}
          {datos.map((d, i) => {
            const cx = pl + banda * i + banda / 2;
            let acum = 0;
            const visibles = d.partes.filter((p) => p.valor > 0);
            return (
              <g key={d.etiqueta} opacity={hover === null || hover === i ? 1 : 0.45}>
                {visibles.map((p, j) => {
                  const y0 = y(acum);
                  acum += p.valor;
                  const y1 = y(acum);
                  const h = Math.max(0, y0 - y1 - (j < visibles.length - 1 ? 2 : 0)); // 2px de aire entre segmentos
                  const arriba = j === visibles.length - 1;
                  const r = arriba ? Math.min(4, h) : 0;
                  const x = cx - barra / 2;
                  const top = y0 - h;
                  return (
                    <path
                      key={p.label}
                      d={`M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + barra - r} Q${x + barra},${top} ${x + barra},${top + r} V${y0} Z`}
                      fill={p.color}
                      opacity={d.parcial ? 0.55 : 1}
                    />
                  );
                })}
                {i % cadaCuanto === (datos.length - 1) % cadaCuanto && (
                  <text x={cx} y={alto - 6} textAnchor="middle" fontSize={11} fill={TEXTO}>
                    {d.etiqueta}
                  </text>
                )}
                {i === datos.length - 1 && totales[i] > 0 && (
                  <text x={cx} y={y(totales[i]) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#23211d">
                    {compacto(totales[i])}
                  </text>
                )}
                <rect x={pl + banda * i} y={pt} width={banda} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && ancho > 0 && (
        <Tooltip x={pl + banda * hover + banda / 2} y={y(totales[hover])} ancho={ancho}>
          <p className="font-semibold text-grafito">{datos[hover].detalle}</p>
          {datos[hover].partes.map((p) => (
            <p key={p.label} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-gris">
                <span className="size-2 rounded-sm" style={{ background: p.color }} />
                {p.label}
              </span>
              <span className="cifra text-grafito">${p.valor.toLocaleString("es-CL")}</span>
            </p>
          ))}
          <p className="mt-1 flex justify-between gap-4 border-t border-linea pt-1 font-semibold text-grafito">
            <span>Total</span>
            <span className="cifra">${totales[hover].toLocaleString("es-CL")}</span>
          </p>
        </Tooltip>
      )}
    </div>
  );
}

/* --------------------------------- línea --------------------------------- */

export function Linea({
  datos,
  color,
  alto = 200,
  etiqueta,
}: {
  datos: { etiqueta: string; detalle: string; valor: number }[];
  color: string;
  alto?: number;
  etiqueta: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pl = 52, pr = 64, pt = 14, pb = 24;
  const ticks = ticksLindos(Math.max(1, ...datos.map((d) => d.valor)));
  const max = ticks[ticks.length - 1];
  const plotW = Math.max(0, ancho - pl - pr);
  const plotH = alto - pt - pb;
  const x = (i: number) => pl + (datos.length > 1 ? (plotW * i) / (datos.length - 1) : plotW / 2);
  const y = (v: number) => pt + plotH - (v / max) * plotH;
  const pts = datos.map((d, i) => `${x(i)},${y(d.valor)}`).join(" ");
  const ult = datos.length - 1;
  const paso = plotW / Math.max(1, datos.length - 1);
  const cadaCuanto = paso < 34 ? 2 : 1;

  return (
    <div ref={ref} className="relative">
      {ancho > 0 && datos.length > 0 && (
        <svg
          width={ancho}
          height={alto}
          role="img"
          aria-label={etiqueta}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round((e.clientX - r.left - pl) / paso);
            setHover(Math.max(0, Math.min(ult, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pl} x2={ancho - pr} y1={y(t)} y2={y(t)} stroke={GRILLA} strokeWidth={1} />
              <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={TEXTO}>
                {compacto(t)}
              </text>
            </g>
          ))}
          <polygon points={`${x(0)},${y(0)} ${pts} ${x(ult)},${y(0)}`} fill={color} opacity={0.1} />
          <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {datos.map((d, i) =>
            i % cadaCuanto === ult % cadaCuanto ? (
              <text key={d.etiqueta} x={x(i)} y={alto - 6} textAnchor="middle" fontSize={11} fill={TEXTO}>
                {d.etiqueta}
              </text>
            ) : null,
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + plotH} stroke="#b9b1a3" strokeWidth={1} />}
          <circle cx={x(hover ?? ult)} cy={y(datos[hover ?? ult].valor)} r={4.5} fill={color} stroke="#fcfbf8" strokeWidth={2} />
          <text x={x(ult) + 10} y={y(datos[ult].valor) + 4} fontSize={12} fontWeight={600} fill="#23211d">
            {compacto(datos[ult].valor)}
          </text>
        </svg>
      )}
      {hover !== null && ancho > 0 && (
        <Tooltip x={x(hover)} y={y(datos[hover].valor)} ancho={ancho}>
          <p className="font-semibold text-grafito">{datos[hover].detalle}</p>
          <p className="cifra text-grafito">${datos[hover].valor.toLocaleString("es-CL")}</p>
        </Tooltip>
      )}
    </div>
  );
}

/** Barra horizontal simple para listas (una serie: sin leyenda) */
export function BarraFila({ valor, max, color }: { valor: number; max: number; color: string }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-linea/60">
      <span className="block h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (valor / max) * 100) : 0}%`, background: color }} />
    </span>
  );
}
