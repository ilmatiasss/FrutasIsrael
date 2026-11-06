"use client";
import { NOMBRE_SERIE, numeroRepetido, proximoNumero, type Serie } from "@/lib/calc";
import { useData } from "@/lib/store";

/** Lee lo escrito: null = usar el automático; 0 o cualquier número = ese. */
export function leerNumero(valor: string | null): number | null {
  if (valor === null) return null;
  const d = valor.replace(/\D/g, "");
  return d ? parseInt(d, 10) : null;
}

/**
 * N° del talonario: muestra el próximo y permite escribir otro (también 0 o
 * uno repetido; en ese caso solo avisa).
 */
export function CampoNumero({
  serie,
  valor,
  setValor,
  etiqueta = "N°",
  alinear = "right",
}: {
  serie: Serie;
  valor: string | null;
  setValor: (v: string | null) => void;
  etiqueta?: string;
  alinear?: "left" | "right";
}) {
  const data = useData()!;
  const siguiente = proximoNumero(data.db.movimientos, serie);
  const n = leerNumero(valor);
  const repetido = n !== null && n > 0 ? numeroRepetido(data.db.movimientos, serie, n) : null;
  const lado = alinear === "right" ? "text-right" : "text-left";
  return (
    <div className={lado}>
      <span className="rotulo block">{etiqueta}</span>
      {valor === null ? (
        <>
          <span className="cifra block text-[26px] font-semibold leading-none text-fuji">{siguiente}</span>
          <button type="button" tabIndex={-1} onClick={() => setValor(String(siguiente))} className={`block w-full text-xs font-medium text-tinta hover:underline ${lado}`}>
            Cambiar N°
          </button>
        </>
      ) : (
        <>
          <input
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setValor(null);
            }}
            inputMode="numeric"
            aria-label={`N° de ${NOMBRE_SERIE[serie]}`}
            className={`campo w-32 py-1 text-[22px] font-semibold text-fuji ${lado}`}
          />
          {repetido ? (
            <span className="block max-w-[14rem] text-xs font-medium text-limon">Ya existe el N°{n}: quedará repetido.</span>
          ) : n === 0 ? (
            <span className="block text-xs text-gris">Sin número (N° 0).</span>
          ) : null}
          <button type="button" tabIndex={-1} onClick={() => setValor(null)} className={`block w-full text-xs text-gris hover:underline ${lado}`}>
            Usar el siguiente ({siguiente})
          </button>
        </>
      )}
    </div>
  );
}
