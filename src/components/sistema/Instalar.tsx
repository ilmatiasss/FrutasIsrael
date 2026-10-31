"use client";
import { useEffect, useState } from "react";
import { datosParaInstalar } from "@/lib/store";
import { IconoAbono } from "../Iconos";

type Estado = { hayBase: boolean; instalada: boolean; seguridad: boolean; claveInstalacion: boolean; error?: string } | null;
type Opcion = "vacia" | "este-pc" | "ejemplo";

const OPCIONES: { k: Opcion; t: string; d: string }[] = [
  { k: "vacia", t: "Empezar de cero", d: "Solo los productos. Los clientes se agregan o se importan desde la planilla." },
  { k: "este-pc", t: "Traer lo de este computador", d: "Sube lo que se cargó en modo prueba en este equipo." },
  { k: "ejemplo", t: "Datos de ejemplo", d: "Para practicar. Después se puede crear otra base limpia." },
];

function Campo(p: { label: string; value: string; set: (v: string) => void; tipo?: string; ayuda?: string; auto?: string }) {
  return (
    <label className="block">
      <span className="rotulo">{p.label}</span>
      <input type={p.tipo ?? "text"} value={p.value} onChange={(e) => p.set(e.target.value)} autoComplete={p.auto ?? "off"} className="campo" />
      {p.ayuda && <span className="mt-1 block text-xs text-gris">{p.ayuda}</span>}
    </label>
  );
}

/** Primera vez con Neon: crea las tablas, la clave del portal y el primer administrador. */
export function Instalar() {
  const [estado, setEstado] = useState<Estado>(null);
  const [nombre, setNombre] = useState("Frutas Israel");
  const [ubicacion, setUbicacion] = useState("La Vega Central · Santiago");
  const [numero, setNumero] = useState("");
  const [opcion, setOpcion] = useState<Opcion>("vacia");
  const [claveInst, setClaveInst] = useState("");
  const [adminUsuario, setAdminUsuario] = useState("");
  const [adminNombre, setAdminNombre] = useState("");
  const [adminClave, setAdminClave] = useState("");
  const [adminClave2, setAdminClave2] = useState("");
  const [portal, setPortal] = useState("");
  const [portal2, setPortal2] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/instalar", { cache: "no-store" })
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => setEstado({ hayBase: false, instalada: false, seguridad: false, claveInstalacion: false }));
  }, []);

  const instalar = async () => {
    setError(null);
    if (adminClave !== adminClave2) return setError("Las contraseñas del administrador no coinciden.");
    if (portal !== portal2) return setError("Las claves del portal no coinciden.");
    setTrabajando(true);
    const body: Record<string, unknown> = {
      claveInstalacion: claveInst,
      clavePortal: portal,
      admin: { usuario: adminUsuario, nombre: adminNombre, clave: adminClave },
    };
    if (!estado?.instalada) {
      const d = datosParaInstalar(opcion, nombre.trim() || "Frutas Israel", ubicacion.trim(), Math.max(0, (parseInt(numero.replace(/\D/g, ""), 10) || 1) - 1));
      const { tenant, config, version: _v, ...filas } = d;
      void _v;
      const { usuario_actual: _u, ...cfg } = config;
      void _u;
      body.tenant = { ...tenant, config: cfg };
      body.filas = filas;
    }
    const r = await fetch("/api/instalar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setTrabajando(false);
    if (r?.ok) location.assign("/admin");
    else setError(j.error ?? "No se pudo conectar con el servidor.");
  };

  if (!estado) return <p className="py-24 text-center text-gris">Revisando la conexión…</p>;
  const listo = estado.hayBase && estado.instalada && estado.seguridad;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-tinta">
          <IconoAbono size={16} /> Base de datos
        </p>
        <h1 className="stencil text-[26px]">Instalación</h1>
      </header>

      {!estado.hayBase && (
        <section className="hoja space-y-3 p-6">
          <h2 className="text-lg font-semibold">Falta conectar la base de datos</h2>
          <p className="text-gris">La app está en modo prueba: los datos se guardan solo en este navegador. Para usarla de verdad:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Cree un proyecto en <b>neon.tech</b> (región São Paulo).
            </li>
            <li>
              Copie la <b>connection string</b> «Pooled connection».
            </li>
            <li>
              En Vercel agregue <code>DATABASE_URL</code> con ese texto y <code>CLAVE_ACCESO</code> con una clave de instalación de un solo uso.
            </li>
            <li>Vuelva a abrir esta página.</li>
          </ol>
        </section>
      )}

      {listo && (
        <section className="hoja space-y-3 p-6">
          <h2 className="text-lg font-semibold text-tinta">El sistema ya está instalado y protegido</h2>
          <p className="text-gris">Las cuentas y la clave del portal se administran en Administración → Cuentas y accesos.</p>
          <a href="/" className="btn btn-primario">
            Ir al inicio
          </a>
        </section>
      )}

      {estado.hayBase && !listo && (
        <section className="hoja space-y-6 p-6">
          <div>
            <h2 className="text-lg font-semibold">{estado.instalada ? "Proteger el sistema" : "Crear la base"}</h2>
            <p className="text-sm text-gris">
              {estado.instalada
                ? "La base ya tiene datos. Falta crear el primer administrador y la clave del portal."
                : "Se crean las tablas, la clave del portal y el primer administrador. Se hace una sola vez."}
            </p>
            {estado.error && <p className="mt-2 text-sm text-fuji">Aviso de la base: {estado.error}</p>}
          </div>

          {estado.claveInstalacion && (
            <Campo label="Clave de instalación" tipo="password" value={claveInst} set={setClaveInst} ayuda="La que está en CLAVE_ACCESO en Vercel. Después de instalar ya no sirve para entrar." />
          )}

          {!estado.instalada && (
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">Datos del local</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nombre del local" value={nombre} set={setNombre} />
                <Campo label="Ubicación" value={ubicacion} set={setUbicacion} />
              </div>
              <Campo label="N° del próximo vale del talonario" value={numero} set={setNumero} ayuda="Para seguir la numeración que ya usan (ej: 20308). Vacío = parte en 1." />
              <div className="grid gap-2">
                {OPCIONES.map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    role="radio"
                    aria-checked={opcion === o.k}
                    onClick={() => setOpcion(o.k)}
                    className={`rounded-md border p-3 text-left ${opcion === o.k ? "border-tinta bg-verde-suave" : "border-kraft"}`}
                  >
                    <b className="font-semibold">{o.t}</b>
                    <span className="block text-sm text-gris">{o.d}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Primer administrador</legend>
            <p className="text-xs text-gris">Los administradores crean las demás cuentas y cambian la clave del portal. Use datos que solo conozca el dueño.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Usuario" value={adminUsuario} set={(v) => setAdminUsuario(v.toLowerCase())} ayuda="ej: israel" auto="username" />
              <Campo label="Nombre" value={adminNombre} set={setAdminNombre} />
              <Campo label="Contraseña" tipo="password" value={adminClave} set={setAdminClave} ayuda="Mínimo 8 caracteres." auto="new-password" />
              <Campo label="Repetir contraseña" tipo="password" value={adminClave2} set={setAdminClave2} auto="new-password" />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Clave del portal (para todo el personal)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Clave del portal" tipo="password" value={portal} set={setPortal} ayuda="Mínimo 8 caracteres, distinta a la del administrador." auto="new-password" />
              <Campo label="Repetir clave" tipo="password" value={portal2} set={setPortal2} auto="new-password" />
            </div>
          </fieldset>

          {!estado.claveInstalacion && (
            <p className="rounded-md bg-platano-suave p-3 text-sm">
              <b>Aviso:</b> no hay <code>CLAVE_ACCESO</code> en Vercel, así que cualquiera que abra esta página antes que ustedes podría instalar. Instale apenas publique.
            </p>
          )}
          {error && <p className="font-medium text-fuji">{error}</p>}
          <button type="button" onClick={instalar} disabled={trabajando} className="btn btn-primario px-6 py-2.5 disabled:opacity-50">
            {trabajando ? "Instalando…" : estado.instalada ? "Proteger el sistema" : "Crear la base"}
          </button>
        </section>
      )}
    </div>
  );
}
