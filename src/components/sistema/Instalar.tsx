"use client";
import { useEffect, useState } from "react";
import { datosParaInstalar } from "@/lib/store";
import { IconoAbono } from "../Iconos";

type Estado = { hayBase: boolean; instalada: boolean; clave: boolean; error?: string } | null;
type Opcion = "vacia" | "este-pc" | "ejemplo";

const OPCIONES: { k: Opcion; t: string; d: string }[] = [
  { k: "vacia", t: "Empezar de cero", d: "Solo los productos. Los clientes se agregan o se importan desde la planilla." },
  { k: "este-pc", t: "Traer lo de este computador", d: "Sube lo que se cargó en modo prueba en este PC." },
  { k: "ejemplo", t: "Datos de ejemplo", d: "Para practicar. Después se puede crear otra base limpia." },
];

/** Primera vez con Neon: crea las tablas y deja la base lista. */
export function Instalar() {
  const [estado, setEstado] = useState<Estado>(null);
  const [nombre, setNombre] = useState("Frutas Israel");
  const [ubicacion, setUbicacion] = useState("La Vega Central · Santiago");
  const [numero, setNumero] = useState("");
  const [opcion, setOpcion] = useState<Opcion>("vacia");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/instalar", { cache: "no-store" })
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => setEstado({ hayBase: false, instalada: false, clave: false }));
  }, []);

  const instalar = async () => {
    setTrabajando(true);
    setError(null);
    const d = datosParaInstalar(opcion, nombre.trim() || "Frutas Israel", ubicacion.trim(), Math.max(0, (parseInt(numero.replace(/\D/g, ""), 10) || 1) - 1));
    const { tenant, config, version: _v, ...filas } = d;
    void _v;
    const { usuario_actual: _u, ...cfg } = config;
    void _u;
    const r = await fetch("/api/instalar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant: { ...tenant, config: cfg }, filas }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setTrabajando(false);
    if (r?.ok) location.assign("/");
    else setError(j.error ?? "No se pudo conectar con el servidor.");
  };

  if (!estado) return <p className="py-24 text-center text-gris">Revisando la conexión…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-tinta">
          <IconoAbono size={16} /> Base de datos
        </p>
        <h1 className="stencil text-[32px]">Conectar con Neon</h1>
      </header>

      {!estado.hayBase && (
        <section className="hoja space-y-3 p-6">
          <h2 className="stencil text-xl">Falta conectar la base de datos</h2>
          <p className="text-gris">La app está en modo prueba: los datos se guardan solo en este navegador. Para usarla de verdad:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Crea un proyecto gratis en <b>neon.tech</b> (región São Paulo o la más cercana).
            </li>
            <li>
              Copia la <b>connection string</b> (la que dice <i>Pooled connection</i>).
            </li>
            <li>
              En Vercel (o en el archivo <code>.env.local</code>) agrega <code>DATABASE_URL</code> con ese texto, y <code>CLAVE_ACCESO</code> con la clave del local.
            </li>
            <li>Vuelve a abrir esta página y presiona «Crear la base».</li>
          </ol>
          <p className="text-sm text-gris">Los pasos con más detalle están en el archivo docs/puesta-en-marcha.md del proyecto.</p>
        </section>
      )}

      {estado.hayBase && estado.instalada && (
        <section className="hoja space-y-3 p-6">
          <h2 className="stencil text-xl text-tinta">La base de datos ya está lista ✓</h2>
          <p className="text-gris">Todo lo que se anota queda guardado en Neon y se ve desde cualquier computador o celular.</p>
          <a href="/" className="btn btn-primario">
            Ir al inicio
          </a>
        </section>
      )}

      {estado.hayBase && !estado.instalada && (
        <section className="hoja space-y-5 p-6">
          <div>
            <h2 className="stencil text-xl">La base está conectada pero vacía</h2>
            <p className="text-gris">Completa estos datos y se crean las tablas. Se hace una sola vez.</p>
            {estado.error && <p className="mt-2 text-sm text-fuji">Aviso de la base: {estado.error}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="rotulo">Nombre del local</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo" />
            </label>
            <label className="block">
              <span className="rotulo">Ubicación</span>
              <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} className="campo" />
            </label>
          </div>
          <label className="block">
            <span className="rotulo">N° del próximo vale del talonario</span>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" className="campo max-w-[12rem] text-lg font-semibold" placeholder="ej: 20308" />
            <span className="mt-1 block text-sm text-gris">Para seguir la numeración que ya usan. Si lo dejas vacío parte en 1.</span>
          </label>
          <div>
            <span className="rotulo">¿Con qué datos parte?</span>
            <div className="mt-2 grid gap-2">
              {OPCIONES.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  role="radio"
                  aria-checked={opcion === o.k}
                  onClick={() => setOpcion(o.k)}
                  className={`rounded-md border p-3 text-left ${opcion === o.k ? "border-tinta bg-verde-suave" : "border-kraft"}`}
                >
                  <b>{o.t}</b>
                  <span className="block text-sm text-gris">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
          {!estado.clave && (
            <p className="rounded-md bg-platano-suave p-3 text-sm">
              <b>Ojo:</b> no hay <code>CLAVE_ACCESO</code> configurada. Cualquiera con el link podría entrar. Agrégala en Vercel antes de usarla con clientes reales.
            </p>
          )}
          {error && <p className="font-semibold text-fuji">{error}</p>}
          <button type="button" onClick={instalar} disabled={trabajando} className="btn btn-primario px-6 py-3 text-lg disabled:opacity-50">
            {trabajando ? "Creando…" : "Crear la base"}
          </button>
        </section>
      )}
    </div>
  );
}
