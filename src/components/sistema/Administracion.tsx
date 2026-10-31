"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useData, useSync } from "@/lib/store";
import { verificar } from "@/lib/verificacion";
import { ddmmaa, hora } from "@/lib/format";
import { useAviso } from "../Shell";

interface Cuenta {
  id: string;
  usuario: string;
  nombre: string;
  activo: boolean;
  creado_por: string | null;
  created_at: string;
  ultimo_acceso: string | null;
}
interface Estado {
  modo: "local" | "nube";
  admin: { id: string; usuario: string; nombre: string } | null;
  cuentas?: Cuenta[];
  intentos?: { tipo: string; usuario: string | null; ip: string; ok: boolean; at: string }[];
  clavePortal?: { actualizado_por: string | null; updated_at: string };
  maxAdmins?: number;
}

/** Estado de la sesión de administrador (compartido por las páginas restringidas). */
export function useAdmin() {
  const [e, setE] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recargar = useCallback(async () => {
    const r = await fetch("/api/admin/estado", { cache: "no-store" }).catch(() => null);
    if (!r) return setError("Sin conexión");
    if (r.status === 401) return location.assign("/entrar");
    setE(await r.json());
  }, []);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { estado: e, error, recargar };
}

async function api(url: string, method: string, body: unknown): Promise<{ ok: boolean; error?: string; salir?: boolean }> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { ok: false, error: "Sin conexión" };
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, error: j.error, salir: j.salir };
}

/** Envuelve una página para que solo la vea un administrador (con base de datos). */
export function SoloAdmin({ children, que }: { children: ReactNode; que: string }) {
  const sync = useSync();
  const { estado } = useAdmin();
  if (sync.modo === "local") return <>{children}</>;
  if (!estado) return <p className="py-16 text-center text-gris">Verificando permisos…</p>;
  if (estado.modo === "local" || estado.admin) return <>{children}</>;
  return (
    <div className="hoja mx-auto max-w-md p-6 text-center">
      <p className="text-lg font-semibold">Requiere administrador</p>
      <p className="mt-1 text-sm text-gris">{que} solo está disponible para cuentas de administrador.</p>
      <a href="/admin" className="btn btn-primario mt-4">
        Ingresar como administrador
      </a>
    </div>
  );
}

function Tarjeta({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="hoja">
      <header className="border-b border-linea px-5 py-3">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        {nota && <p className="text-sm text-gris">{nota}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Campo(p: { label: string; value: string; set: (v: string) => void; tipo?: string; auto?: string }) {
  return (
    <label className="block">
      <span className="rotulo">{p.label}</span>
      <input type={p.tipo ?? "text"} value={p.value} onChange={(e) => p.set(e.target.value)} autoComplete={p.auto ?? "off"} className="campo" />
    </label>
  );
}

export function Administracion() {
  const sync = useSync();
  const { estado, recargar } = useAdmin();

  if (sync.modo === "local")
    return (
      <div className="hoja mx-auto max-w-lg p-6">
        <h1 className="stencil text-[24px]">Cuentas y accesos</h1>
        <p className="mt-2 text-gris">Las cuentas de administrador y la clave del portal se activan al conectar la base de datos (modo prueba: no hay claves).</p>
        <div className="mt-6">
          <Verificacion />
        </div>
      </div>
    );
  if (!estado) return <p className="py-16 text-center text-gris">Cargando…</p>;
  if (!estado.admin) return <IngresoAdmin onOk={recargar} />;
  return <Panel estado={estado} recargar={recargar} />;
}

function IngresoAdmin({ onOk }: { onOk: () => void }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const r = await api("/api/admin/sesion", "POST", { usuario, clave });
    if (r.ok) onOk();
    else setError(r.error ?? "No se pudo ingresar");
  };
  return (
    <form onSubmit={enviar} className="hoja mx-auto max-w-sm space-y-4 p-6">
      <div>
        <h1 className="stencil text-[22px]">Administración</h1>
        <p className="text-sm text-gris">Ingrese con su cuenta de administrador.</p>
      </div>
      <Campo label="Usuario" value={usuario} set={(v) => setUsuario(v.toLowerCase())} auto="username" />
      <Campo label="Contraseña" tipo="password" value={clave} set={setClave} auto="current-password" />
      {error && <p className="text-sm font-medium text-fuji">{error}</p>}
      <button type="submit" disabled={!usuario || !clave} className="btn btn-primario w-full disabled:opacity-50">
        Ingresar
      </button>
    </form>
  );
}

function Panel({ estado, recargar }: { estado: Estado; recargar: () => void }) {
  const avisar = useAviso();
  const admin = estado.admin!;
  const cuentas = estado.cuentas ?? [];
  const activos = cuentas.filter((c) => c.activo).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="stencil text-[24px]">Cuentas y accesos</h1>
          <p className="text-sm text-gris">
            Sesión de administrador: <b className="font-semibold text-grafito">{admin.nombre}</b> ({admin.usuario})
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await api("/api/admin/sesion", "DELETE", {});
            location.assign("/");
          }}
          className="btn btn-secundario"
        >
          Salir de administración
        </button>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <ClavePortal estado={estado} onOk={() => { avisar({ titulo: "Clave del portal cambiada", detalle: "Todos los equipos deberán ingresar con la clave nueva.", tono: "tinta" }); recargar(); }} />
        <MiClave adminId={admin.id} />
      </div>

      <Tarjeta titulo={`Administradores (${activos} de ${estado.maxAdmins} activos)`} nota="Solo los administradores pueden crear cuentas, cambiar la clave del portal, importar planillas y ver la bitácora.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="rotulo py-2 font-semibold">Usuario</th>
                <th className="rotulo py-2 font-semibold">Nombre</th>
                <th className="rotulo py-2 font-semibold">Estado</th>
                <th className="rotulo hidden py-2 font-semibold sm:table-cell">Último acceso</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <FilaCuenta key={c.id} c={c} propia={c.id === admin.id} recargar={recargar} />
              ))}
            </tbody>
          </table>
        </div>
        {activos < (estado.maxAdmins ?? 6) && <NuevaCuenta recargar={recargar} />}
      </Tarjeta>

      <Verificacion />

      <Tarjeta titulo="Intentos de acceso recientes" nota="Después de 8 intentos fallidos en 15 minutos, la IP o el usuario quedan bloqueados por 15 minutos.">
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <tbody>
              {(estado.intentos ?? []).map((i, k) => (
                <tr key={k} className="border-b border-linea last:border-0">
                  <td className="cifra py-1.5 pr-3 text-gris">
                    {ddmmaa(i.at.slice(0, 10))} {hora(i.at)}
                  </td>
                  <td className="pr-3">{i.tipo === "ADMIN" ? `Admin ${i.usuario ?? ""}` : "Portal"}</td>
                  <td className="cifra pr-3 text-gris">{i.ip}</td>
                  <td className={i.ok ? "text-tinta" : "font-medium text-fuji"}>{i.ok ? "Correcto" : "Fallido"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}

function ClavePortal({ estado, onOk }: { estado: Estado; onOk: () => void }) {
  const [nueva, setNueva] = useState("");
  const [rep, setRep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nueva !== rep) return setError("Las claves no coinciden.");
    const r = await api("/api/admin/clave-portal", "POST", { nueva });
    if (!r.ok) return setError(r.error ?? "No se pudo cambiar");
    setNueva("");
    setRep("");
    onOk();
  };
  const cp = estado.clavePortal;
  return (
    <Tarjeta
      titulo="Clave del portal"
      nota={cp ? `Última modificación: ${ddmmaa(cp.updated_at.slice(0, 10))} ${hora(cp.updated_at)}${cp.actualizado_por ? ` por ${cp.actualizado_por}` : ""}.` : undefined}
    >
      <form onSubmit={enviar} className="space-y-3">
        <p className="text-sm text-gris">Es la clave que usa todo el personal para entrar. Al cambiarla se cierran las sesiones de todos los equipos (los administradores siguen dentro).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Clave nueva" tipo="password" value={nueva} set={setNueva} auto="new-password" />
          <Campo label="Repetir" tipo="password" value={rep} set={setRep} auto="new-password" />
        </div>
        {error && <p className="text-sm font-medium text-fuji">{error}</p>}
        <button type="submit" disabled={!nueva} className="btn btn-primario disabled:opacity-50">
          Cambiar clave del portal
        </button>
      </form>
    </Tarjeta>
  );
}

function MiClave({ adminId }: { adminId: string }) {
  const avisar = useAviso();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [rep, setRep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nueva !== rep) return setError("Las contraseñas no coinciden.");
    const r = await api("/api/admin/cuentas", "PATCH", { id: adminId, accion: "clave", actual, clave: nueva });
    if (!r.ok) return setError(r.error ?? "No se pudo cambiar");
    avisar({ titulo: "Contraseña cambiada", detalle: "Ingrese de nuevo con la contraseña nueva.", tono: "tinta" });
    setTimeout(() => location.assign("/entrar?admin=1"), 1200);
  };
  return (
    <Tarjeta titulo="Mi contraseña">
      <form onSubmit={enviar} className="space-y-3">
        <Campo label="Contraseña actual" tipo="password" value={actual} set={setActual} auto="current-password" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nueva" tipo="password" value={nueva} set={setNueva} auto="new-password" />
          <Campo label="Repetir" tipo="password" value={rep} set={setRep} auto="new-password" />
        </div>
        {error && <p className="text-sm font-medium text-fuji">{error}</p>}
        <button type="submit" disabled={!actual || !nueva} className="btn btn-secundario disabled:opacity-50">
          Cambiar mi contraseña
        </button>
      </form>
    </Tarjeta>
  );
}

function FilaCuenta({ c, propia, recargar }: { c: Cuenta; propia: boolean; recargar: () => void }) {
  const avisar = useAviso();
  const [poniendo, setPoniendo] = useState(false);
  const [clave, setClave] = useState("");
  const accion = async (a: "activar" | "desactivar") => {
    if (a === "desactivar" && !confirm(`¿Desactivar la cuenta de ${c.nombre}? No podrá ingresar como administrador.`)) return;
    const r = await api("/api/admin/cuentas", "PATCH", { id: c.id, accion: a });
    if (!r.ok) return avisar({ titulo: "No se pudo", detalle: r.error, tono: "rojo" });
    if (r.salir) return location.assign("/");
    recargar();
  };
  const ponerClave = async (e: FormEvent) => {
    e.preventDefault();
    const r = await api("/api/admin/cuentas", "PATCH", { id: c.id, accion: "clave", clave });
    if (!r.ok) return avisar({ titulo: "No se pudo", detalle: r.error, tono: "rojo" });
    avisar({ titulo: "Contraseña asignada", detalle: `Entréguela a ${c.nombre} en persona.`, tono: "tinta" });
    setPoniendo(false);
    setClave("");
  };
  return (
    <>
      <tr className={`border-t border-linea ${c.activo ? "" : "text-gris"}`}>
        <td className="py-2 pr-2 font-medium">
          {c.usuario}
          {propia && <span className="ml-1 text-xs text-gris">(usted)</span>}
        </td>
        <td className="pr-2">{c.nombre}</td>
        <td className="pr-2">
          <span className="sticker" style={c.activo ? { background: "#ecf5ef", color: "#166534" } : { background: "#f0f2f5", color: "#6b7280" }}>
            {c.activo ? "Activa" : "Desactivada"}
          </span>
        </td>
        <td className="cifra hidden pr-2 text-gris sm:table-cell">{c.ultimo_acceso ? `${ddmmaa(c.ultimo_acceso.slice(0, 10))} ${hora(c.ultimo_acceso)}` : "—"}</td>
        <td className="whitespace-nowrap py-2 text-right">
          {!propia && c.activo && (
            <button type="button" onClick={() => setPoniendo((x) => !x)} className="mr-3 text-sm font-medium text-tinta hover:underline">
              Nueva contraseña
            </button>
          )}
          {!propia &&
            (c.activo ? (
              <button type="button" onClick={() => accion("desactivar")} className="text-sm font-medium text-fuji hover:underline">
                Desactivar
              </button>
            ) : (
              <button type="button" onClick={() => accion("activar")} className="text-sm font-medium text-tinta hover:underline">
                Reactivar
              </button>
            ))}
        </td>
      </tr>
      {poniendo && (
        <tr>
          <td colSpan={5} className="pb-3">
            <form onSubmit={ponerClave} className="flex flex-wrap items-end gap-2">
              <div className="w-64">
                <Campo label={`Contraseña nueva para ${c.usuario}`} tipo="password" value={clave} set={setClave} auto="new-password" />
              </div>
              <button type="submit" disabled={!clave} className="btn btn-primario py-2 disabled:opacity-50">
                Asignar
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function NuevaCuenta({ recargar }: { recargar: () => void }) {
  const avisar = useAviso();
  const [abierta, setAbierta] = useState(false);
  const [f, setF] = useState({ usuario: "", nombre: "", clave: "", rep: "" });
  const [error, setError] = useState<string | null>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.clave !== f.rep) return setError("Las contraseñas no coinciden.");
    const r = await api("/api/admin/cuentas", "POST", { usuario: f.usuario, nombre: f.nombre, clave: f.clave });
    if (!r.ok) return setError(r.error ?? "No se pudo crear");
    avisar({ titulo: "Administrador creado", detalle: f.nombre, tono: "tinta" });
    setF({ usuario: "", nombre: "", clave: "", rep: "" });
    setAbierta(false);
    recargar();
  };
  if (!abierta)
    return (
      <button type="button" onClick={() => setAbierta(true)} className="btn btn-primario mt-4">
        + Nuevo administrador
      </button>
    );
  return (
    <form onSubmit={enviar} className="mt-4 space-y-3 rounded-md border border-linea bg-carton/50 p-4">
      <p className="text-sm font-semibold">Nuevo administrador</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Usuario (minúsculas)" value={f.usuario} set={(v) => setF({ ...f, usuario: v.toLowerCase() })} />
        <Campo label="Nombre" value={f.nombre} set={(v) => setF({ ...f, nombre: v })} />
        <Campo label="Contraseña (mín. 8)" tipo="password" value={f.clave} set={(v) => setF({ ...f, clave: v })} auto="new-password" />
        <Campo label="Repetir" tipo="password" value={f.rep} set={(v) => setF({ ...f, rep: v })} auto="new-password" />
      </div>
      {error && <p className="text-sm font-medium text-fuji">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primario">
          Crear
        </button>
        <button type="button" onClick={() => setAbierta(false)} className="btn btn-secundario">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Cruces de información entre módulos */
function Verificacion() {
  const data = useData();
  const [corrida, setCorrida] = useState(0);
  const chequeos = useMemo(() => (data ? verificar(data.db) : []), [data, corrida]); // eslint-disable-line react-hooks/exhaustive-deps
  const errores = chequeos.filter((c) => c.estado === "error").length;
  const avisos = chequeos.filter((c) => c.estado === "aviso").length;
  const color = { ok: "#166534", aviso: "#b45309", error: "#b42318" };
  return (
    <Tarjeta
      titulo="Verificación de datos"
      nota={`Cruza la información entre vales, abonos, clientes, caja y remuneraciones. ${errores ? `${errores} con error` : "Sin errores"}${avisos ? `, ${avisos} avisos` : ""}.`}
    >
      <ul className="divide-y divide-linea">
        {chequeos.map((c) => (
          <li key={c.titulo} className="flex gap-3 py-2.5">
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: color[c.estado] }} />
            <span className="min-w-0">
              <b className="block text-sm font-semibold">{c.titulo}</b>
              <span className="text-sm text-gris">{c.detalle}</span>
              {c.items && <span className="block text-xs text-gris">{c.items.join(" · ")}</span>}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setCorrida((x) => x + 1)} className="btn btn-secundario mt-3 py-1.5 text-sm">
        Verificar de nuevo
      </button>
    </Tarjeta>
  );
}
