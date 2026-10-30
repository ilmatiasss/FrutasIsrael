"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { importar, useData } from "@/lib/store";
import { CAMPOS, CSV_EJEMPLO, adivinarCampo, parseCSV, revisar, type Campo } from "@/lib/csv";
import { clp, ddmmaa, normalizar } from "@/lib/format";
import { TipoChip } from "../DetalleMovimiento";
import { useAviso } from "../Shell";

export function Importador() {
  const data = useData()!;
  const avisar = useAviso();
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [mapa, setMapa] = useState<Campo[] | null>(null);
  const [hecho, setHecho] = useState<{ creados: number; clientesNuevos: number } | null>(null);

  const tabla = useMemo(() => (texto.trim() ? parseCSV(texto) : []), [texto]);
  const headers = useMemo(() => tabla[0] ?? [], [tabla]);
  const cuerpo = useMemo(() => tabla.slice(1), [tabla]);
  const mapaEf = useMemo(() => (mapa && mapa.length === headers.length ? mapa : headers.map(adivinarCampo)), [mapa, headers]);
  const revisadas = useMemo(() => revisar(cuerpo, mapaEf), [cuerpo, mapaEf]);
  const buenas = revisadas.filter((r) => r.ok);

  // emparejar nombres de la planilla con clientes existentes (alias o nombre)
  const indice = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.db.clientes) {
      m.set(normalizar(c.nombre), c.id);
      if (c.alias) m.set(normalizar(c.alias), c.id);
    }
    return m;
  }, [data]);
  const resolver = (n: string) => indice.get(normalizar(n)) ?? null;
  const nombres = [...new Set(buenas.map((r) => r.fila!.cliente).filter(Boolean))];
  const nuevos = nombres.filter((n) => !resolver(n));

  const cargar = async (f: File) => {
    setArchivo(f.name);
    setTexto(await f.text());
    setMapa(null);
    setHecho(null);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="stencil text-[28px] sm:text-[32px]">Importar planilla</h1>
        <p className="mt-2 max-w-2xl text-gris">
          Trae el historial desde Google Sheets: <b>Archivo → Descargar → Valores separados por comas (.csv)</b>. Se reconocen columnas como FECHA, N° VALE,
          CLIENTE, TIPO, MONTO o las columnas VALE CRÉDITO / PAGO CRÉDITO / VALE VENTA. Lo importado queda marcado y se puede anular como cualquier movimiento.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <label
            className="hoja flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-kraft px-4 py-8 text-center hover:bg-resaltador/20"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) cargar(f);
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-kraft-osc" aria-hidden>
              <path d="M6 3h9l4 4v14H6z" />
              <path d="M15 3v4h4M9 12h7M9 15h7M9 18h4" />
            </svg>
            <span className="text-lg font-semibold">{archivo ?? "Suelta el CSV acá"}</span>
            <span className="text-sm text-gris">o haz clic para elegirlo</span>
            <input type="file" accept=".csv,text/csv,.tsv,.txt" className="sr-only" onChange={(e) => e.target.files?.[0] && cargar(e.target.files[0])} />
          </label>
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setMapa(null);
              setHecho(null);
            }}
            rows={6}
            placeholder="…o pega aquí las celdas copiadas desde la planilla"
            className="campo w-full resize-y rounded-sm border border-linea bg-hoja/70 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => {
              setTexto(CSV_EJEMPLO);
              setArchivo("ejemplo.csv");
              setMapa(null);
              setHecho(null);
            }}
            className="text-sm text-tinta underline decoration-dotted underline-offset-4"
          >
            Probar con un CSV de ejemplo
          </button>
        </div>

        <div className="min-w-0 space-y-4">
          {headers.length === 0 ? (
            <div className="hoja flex min-h-[240px] items-center justify-center rounded-lg p-8 text-center text-gris">
              Acá aparece la vista previa antes de importar nada.
            </div>
          ) : (
            <>
              <div className="hoja overflow-x-auto rounded-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-grafito">
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-2 text-left align-bottom">
                          <span className="block truncate text-[11px] uppercase tracking-wider text-gris">{h || `col ${i + 1}`}</span>
                          <select
                            value={mapaEf[i]}
                            onChange={(e) => {
                              const n = [...mapaEf];
                              n[i] = e.target.value as Campo;
                              setMapa(n);
                            }}
                            className={`mt-1 w-full rounded-sm border bg-hoja px-1 py-0.5 text-[13px] font-semibold ${mapaEf[i] === "ignorar" ? "border-linea text-gris" : "border-tinta text-tinta"}`}
                          >
                            {CAMPOS.map((c) => (
                              <option key={c.k} value={c.k}>{c.label}</option>
                            ))}
                          </select>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left text-[11px] uppercase tracking-wider text-gris">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuerpo.slice(0, 40).map((f, i) => {
                      const r = revisadas[i];
                      return (
                        <tr key={i} className={`border-b border-linea ${r.ok ? "" : "bg-fuji/5"}`}>
                          {headers.map((_, j) => (
                            <td key={j} className={`max-w-[180px] truncate px-2 py-1 ${mapaEf[j] === "ignorar" ? "text-gris/50" : ""}`}>{f[j]}</td>
                          ))}
                          <td className="whitespace-nowrap px-2 py-1">
                            {r.ok ? (
                              <span className="flex items-center gap-2">
                                <TipoChip tipo={r.fila!.tipo} corto />
                                <span className="cifra">{clp(r.fila!.monto)}</span>
                                <span className="text-xs text-gris">{ddmmaa(r.fila!.fecha)}</span>
                              </span>
                            ) : (
                              <span className="text-fuji">línea {r.linea}: {r.error}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {cuerpo.length > 40 && <p className="px-3 py-2 text-xs text-gris">…y {cuerpo.length - 40} filas más</p>}
              </div>

              <div className="hoja relative flex flex-wrap items-center gap-x-8 gap-y-3 rounded-sm px-5 py-4">
                <p>
                  <b className="cifra text-2xl text-pera">{buenas.length}</b> <span className="text-gris">filas listas</span>
                </p>
                <p>
                  <b className="cifra text-2xl text-fuji">{revisadas.length - buenas.length}</b> <span className="text-gris">con error (se saltan)</span>
                </p>
                <p>
                  <b className="cifra text-2xl text-tinta">{nombres.length - nuevos.length}</b> <span className="text-gris">clientes ya existen</span> ·{" "}
                  <b className="cifra text-2xl text-naranjo">{nuevos.length}</b> <span className="text-gris">se crearán</span>
                </p>
                {nuevos.length > 0 && <p className="w-full truncate text-sm text-gris">Nuevos: {nuevos.slice(0, 12).join(", ")}{nuevos.length > 12 ? "…" : ""}</p>}
                <button
                  type="button"
                  disabled={!buenas.length || !!hecho}
                  onClick={() => {
                    const r = importar(buenas.map((b) => b.fila!), resolver);
                    setHecho(r);
                    avisar({ titulo: "Planilla importada", detalle: `${r.creados} movimientos · ${r.clientesNuevos} clientes nuevos` });
                  }}
                  className="btn btn-primario ml-auto disabled:opacity-40"
                >
                  Importar {buenas.length} movimientos
                </button>
              </div>
              {hecho && (
                <p className="text-sm">
                  Listo. Revisa los saldos en <Link href="/clientes" className="text-tinta underline">Clientes</Link> o el registro en la{" "}
                  <Link href="/bitacora" className="text-tinta underline">Bitácora</Link>.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
