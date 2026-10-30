"use client";
import { useState } from "react";
import { reiniciarDemo, setConfig, useData } from "@/lib/store";
import { useAviso } from "./Shell";
import { COLOR_SEMAFORO } from "./ui";

export function Ajustes() {
  const data = useData()!;
  const avisar = useAviso();
  const cfg = data.db.config;
  const [confirmar, setConfirmar] = useState(false);

  const num = (k: "dias_amarillo" | "dias_rojo" | "dias_sin_compra", label: string, color?: string) => (
    <label className="flex items-center justify-between gap-4 border-b border-linea py-3">
      <span className="flex items-center gap-2">
        {color && <span className="size-3 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={cfg[k]}
          onChange={(e) => {
            const v = Math.max(1, Number(e.target.value) || 1);
            setConfig({ [k]: v });
          }}
          className="campo w-20 text-right text-lg"
        />
        <span className="text-gris">días</span>
      </span>
    </label>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="stencil text-[28px] sm:text-[32px]">Ajustes</h1>

      <section className="hoja rounded-lg px-6 py-5">
        <h2 className="text-lg font-semibold">Quién atiende la caja</h2>
        <p className="text-sm text-gris">Queda registrado en cada vale, abono, anulación y cierre.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.db.usuarios.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setConfig({ usuario_actual: u.nombre })}
              aria-pressed={cfg.usuario_actual === u.nombre}
              className="opcion"
            >
              {u.nombre} <span className="font-sans text-xs font-normal normal-case">{u.rol === "DUENO" ? "dueño" : "caja"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="hoja rounded-lg px-6 py-5">
        <h2 className="text-lg font-semibold">Clasificación automática</h2>
        <p className="text-sm text-gris">
          Se calcula por días sin pagar (desde el último abono, o desde el vale impago más antiguo si nunca ha pagado). Se puede fijar a mano por cliente.
        </p>
        <div className="mt-2">
          <p className="flex items-center gap-2 border-b border-linea py-3">
            <span className="size-3 rounded-full" style={{ background: COLOR_SEMAFORO.VERDE.bg }} /> Verde: sin deuda o menos de {cfg.dias_amarillo} días
          </p>
          {num("dias_amarillo", "Pasa a amarillo desde", COLOR_SEMAFORO.AMARILLO.bg)}
          {num("dias_rojo", "Pasa a rojo desde", COLOR_SEMAFORO.ROJO.bg)}
          {num("dias_sin_compra", "“Ya no compra” después de")}
        </div>
        <p className="mt-3 text-xs text-gris">Semanas: se numeran como semana ISO (lunes a domingo), igual que el N° de semana de Google Sheets con ISOWEEKNUM.</p>
      </section>

      <section className="hoja rounded-lg px-6 py-5">
        <h2 className="text-lg font-semibold">Datos de ejemplo</h2>
        <p className="text-sm text-gris">
          Este boceto guarda todo en este navegador. Regenerar borra lo que hayas cargado y vuelve a los clientes de ejemplo.
        </p>
        {!confirmar ? (
          <button type="button" onClick={() => setConfirmar(true)} className="btn btn-secundario mt-3 text-fuji">
            Regenerar datos de ejemplo…
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-semibold text-fuji">¿Seguro? Se pierde lo ingresado en este navegador.</span>
            <button
              type="button"
              onClick={() => {
                reiniciarDemo();
                setConfirmar(false);
                avisar({ titulo: "Datos regenerados", tono: "tinta" });
              }}
              className="btn bg-fuji py-1 text-hoja"
            >
              Sí, regenerar
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className="text-gris">
              No
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
