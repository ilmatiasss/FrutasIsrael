"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { reintentarAhora, useData, useSync } from "@/lib/store";
import { fechaLarga, hoy } from "@/lib/format";
import { Autocompletar } from "./Autocompletar";
import { filtrarClientes, OpcionCliente, useEstados } from "./clientes";
import { Modal } from "./ui";
import { IconoInicio, Logo, SECCIONES } from "./Iconos";

/* --------------------------------- avisos --------------------------------- */

interface Aviso {
  id: number;
  titulo: string;
  detalle?: string;
  tono?: "ok" | "rojo" | "tinta";
}
const AvisoCtx = createContext<(a: Omit<Aviso, "id">) => void>(() => {});
export const useAviso = () => useContext(AvisoCtx);

/* -------------------------------- secciones -------------------------------- */

const ATAJOS: Record<string, string> = Object.fromEntries(SECCIONES.map((x) => [x.tecla, x.href]));

const MAS = [
  { href: "/admin", label: "Cuentas y accesos" },
  { href: "/importar", label: "Importar planilla" },
  { href: "/bitacora", label: "Bitácora (historial)" },
  { href: "/ajustes", label: "Ajustes" },
];

function activa(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

function Marca({ oscuro = false }: { oscuro?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Frutas Israel — inicio">
      <Logo size={oscuro ? 40 : 34} />
      <span className="leading-tight">
        <span className={`marca block text-[16px] ${oscuro ? "text-white" : "text-grafito"}`}>Frutas Israel</span>
        <span className={`block text-[11px] font-medium ${oscuro ? "text-white/60" : "text-gris"}`}>Gestión comercial</span>
      </span>
    </Link>
  );
}

/* ------------------------------ buscador global ------------------------------ */

function Buscador({ abierto, cerrar }: { abierto: boolean; cerrar: () => void }) {
  const data = useData();
  const estados = useEstados(data);
  const router = useRouter();
  const [q, setQ] = useState("");
  useEffect(() => {
    if (abierto) setQ("");
  }, [abierto]);
  return (
    <Modal abierto={abierto} onCerrar={cerrar} ancho="sm:max-w-xl" etiqueta="Buscar cliente">
      <p className="stencil mb-3 text-xl">Buscar cliente</p>
      <Autocompletar
        etiqueta="Buscar cliente"
        autoFocus
        abrirSinTexto
        max={8}
        items={[...estados.values()]}
        clave={(e) => e.cliente.id}
        filtrar={(t) => filtrarClientes(t, estados)}
        render={(e) => <OpcionCliente e={e} />}
        query={q}
        setQuery={setQ}
        onElegir={(e) => {
          cerrar();
          router.push(`/clientes/${e.cliente.id}`);
        }}
        placeholder="Alias o nombre"
        inputClassName="font-sans text-xl py-2"
      />
    </Modal>
  );
}

/* --------------------------------- shell --------------------------------- */

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const data = useData();
  const [buscar, setBuscar] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [mas, setMas] = useState(false);
  const [fecha, setFecha] = useState<string | null>(null);
  const n = useRef(0);

  useEffect(() => setFecha(hoy()), []);

  const avisar = useCallback((a: Omit<Aviso, "id">) => {
    const id = ++n.current;
    setAvisos((x) => [...x.slice(-1), { ...a, id }]);
    setTimeout(() => setAvisos((x) => x.filter((y) => y.id !== id)), 3500);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (ATAJOS[e.key]) {
        e.preventDefault();
        router.push(ATAJOS[e.key]);
        return;
      }
      if (e.altKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        router.push(SECCIONES[Number(e.key) - 1].href);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscar(true);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [router]);

  useEffect(() => setMas(false), [path]);

  // si otro PC usó el mismo N° de vale, el servidor asigna el siguiente: se avisa
  useEffect(() => {
    const k = (e: Event) => {
      const xs = (e as CustomEvent<{ id: string; numero: number }[]>).detail;
      avisar({ titulo: "N° de vale ajustado", detalle: `Otro computador usó el número. Quedó como N°${xs.map((x) => x.numero).join(", N°")}.`, tono: "tinta" });
    };
    window.addEventListener("frutas:renumerado", k);
    return () => window.removeEventListener("frutas:renumerado", k);
  }, [avisar]);

  const sinDatos = path === "/instalar" || path === "/entrar";

  // ingreso e instalación: sin menú (todavía no hay sesión ni base)
  if (sinDatos)
    return (
      <AvisoCtx.Provider value={avisar}>
        <main className="mx-auto max-w-[1400px] px-4 py-10">{children}</main>
      </AvisoCtx.Provider>
    );

  return (
    <AvisoCtx.Provider value={avisar}>
      {/* barra lateral (escritorio) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-marca text-white lg:flex">
        <div className="px-5 pb-5 pt-5">
          <Marca oscuro />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Secciones">
          {[{ href: "/", label: "Inicio", tecla: "", Fruta: IconoInicio }, ...SECCIONES].map((t) => {
            const on = t.href === "/" ? path === "/" : activa(path, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-medium transition-colors ${on ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"}`}
              >
                <t.Fruta size={18} />
                <span className="flex-1">{t.label}</span>
                {t.tecla && <span className="text-[11px] font-medium text-white/40">{t.tecla}</span>}
              </Link>
            );
          })}
          <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Administración</p>
          {MAS.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              aria-current={activa(path, m.href) ? "page" : undefined}
              className={`block rounded-md px-3 py-1.5 text-[14px] ${activa(path, m.href) ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/8 hover:text-white"}`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-[12px] text-white/60">
          <p>
            Atiende: <b className="font-semibold text-white">{data?.db.config.usuario_actual ?? "…"}</b>
          </p>
          {fecha && <p className="first-letter:uppercase">{fechaLarga(fecha)}</p>}
        </div>
      </aside>

      {/* barra superior */}
      <header className="no-print sticky top-0 z-20 border-b border-linea bg-hoja/95 backdrop-blur lg:pl-60">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 lg:px-8">
          <div className="lg:hidden">
            <Marca />
          </div>
          <nav className="hidden flex-1 items-center gap-0.5 md:flex lg:hidden" aria-label="Secciones">
            {SECCIONES.map((t) => {
              const on = activa(path, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-[14px] font-medium ${on ? "bg-verde-suave text-tinta" : "text-gris hover:bg-carton hover:text-grafito"}`}
                >
                  {t.corto}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <EstadoConexion />
            <button
              type="button"
              onClick={() => setBuscar(true)}
              className="flex h-9 items-center gap-2 rounded-md border border-kraft bg-hoja px-3 text-sm text-gris hover:text-grafito lg:w-72"
              aria-label="Buscar cliente"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="hidden flex-1 text-left lg:inline">Buscar cliente…</span>
              <span className="tecla hidden lg:inline-flex">Ctrl K</span>
            </button>
            <div className="relative hidden md:block lg:hidden">
              <button
                type="button"
                onClick={() => setMas((m) => !m)}
                aria-expanded={mas}
                className="flex size-9 items-center justify-center rounded-md border border-kraft bg-hoja text-gris hover:text-grafito"
                aria-label="Más opciones"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
                  <circle cx="4" cy="10" r="1.7" fill="currentColor" />
                  <circle cx="10" cy="10" r="1.7" fill="currentColor" />
                  <circle cx="16" cy="10" r="1.7" fill="currentColor" />
                </svg>
              </button>
              {mas && <MenuMas usuario={data?.db.config.usuario_actual} />}
            </div>
          </div>
        </div>
      </header>

      <div className="lg:pl-60">
        <main className="mx-auto max-w-[1400px] px-3 pb-28 pt-4 sm:px-5 md:pb-12 lg:px-8 lg:pt-6">{data || sinDatos ? children : <Cargando />}</main>
      </div>

      {/* navegación celular */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linea bg-hoja/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        {[{ href: "/", corto: "Inicio", Fruta: IconoInicio }, ...SECCIONES.slice(0, 3)].map((t) => {
          const on = t.href === "/" ? path === "/" : activa(path, t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${on ? "text-tinta" : "text-gris"}`}>
              <t.Fruta size={22} />
              {t.corto}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMas((m) => !m)} className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${mas ? "text-tinta" : "text-gris"}`}>
          <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden>
            <circle cx="4" cy="10" r="1.6" fill="currentColor" />
            <circle cx="10" cy="10" r="1.6" fill="currentColor" />
            <circle cx="16" cy="10" r="1.6" fill="currentColor" />
          </svg>
          Más
        </button>
      </nav>
      {mas && (
        <div className="fixed inset-0 z-40 bg-grafito/30 md:hidden" onClick={() => setMas(false)}>
          <div className="hoja animate-entra absolute inset-x-2 bottom-20 p-2" onClick={(e) => e.stopPropagation()}>
            {SECCIONES.slice(3).map((t) => (
              <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-md px-3 py-3 font-medium hover:bg-carton">
                <span className="flex size-9 items-center justify-center rounded-md bg-verde-suave text-tinta">
                  <t.Fruta size={20} />
                </span>
                <span>
                  {t.label}
                  <span className="block text-xs font-normal text-gris">{t.que}</span>
                </span>
              </Link>
            ))}
            <div className="my-1 border-t border-linea" />
            {MAS.map((m) => (
              <Link key={m.href} href={m.href} className="block rounded-md px-3 py-2.5 text-gris hover:bg-carton">
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Buscador abierto={buscar} cerrar={() => setBuscar(false)} />

      <div className="no-print pointer-events-none fixed inset-x-3 bottom-20 z-50 flex flex-col items-end gap-2 md:inset-x-auto md:bottom-5 md:right-5" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className="hoja animate-entra w-full max-w-sm rounded-md border-l-4 px-4 py-3 shadow-lg"
            style={{ borderLeftColor: a.tono === "rojo" ? "#b4412f" : a.tono === "tinta" ? "#2f5d8f" : "#4b7a37" }}
          >
            <p className="font-semibold">{a.titulo}</p>
            {a.detalle && <p className="text-sm text-gris">{a.detalle}</p>}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

function MenuMas({ usuario }: { usuario?: string }) {
  return (
    <div className="hoja animate-entra absolute right-0 top-11 z-40 w-60 p-2">
      <p className="px-3 pb-1 pt-1 text-xs font-semibold text-gris">
        Atiende: <b className="text-grafito">{usuario ?? "…"}</b>
      </p>
      {MAS.map((m) => (
        <Link key={m.href} href={m.href} className="block rounded-md px-3 py-2 hover:bg-carton">
          {m.label}
        </Link>
      ))}
    </div>
  );
}

/** Pastilla que dice si los datos están guardados en la base, en espera o solo en este PC */
function EstadoConexion() {
  const s = useSync();
  if (s.modo === "cargando" || s.modo === "instalar") return null;
  const cfg =
    s.modo === "local"
      ? { color: "#c99611", bg: "#fcf3d6", txt: "Modo prueba", det: "Los datos se guardan solo en este computador. Conecta la base de datos para usarlo de verdad." }
      : s.modo === "sin-conexion"
        ? { color: "#d0402e", bg: "#fce9e4", txt: s.pendientes ? `Sin internet · ${s.pendientes} por enviar` : "Sin internet", det: "Puedes seguir trabajando: los cambios se guardan en este PC y se envían solos cuando vuelva internet." }
        : s.pendientes
          ? { color: "#c99611", bg: "#fcf3d6", txt: "Guardando…", det: "Enviando cambios a la base de datos." }
          : { color: "#2f7d45", bg: "#e8f3e6", txt: "Guardado", det: "Todo está guardado en la base de datos." };
  return (
    <button
      type="button"
      onClick={() => reintentarAhora()}
      title={s.error ? `${cfg.det} Último error: ${s.error}` : cfg.det}
      className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span className="size-2 rounded-full" style={{ background: cfg.color }} />
      <span className="hidden sm:inline">{cfg.txt}</span>
    </button>
  );
}

function Cargando() {
  return <p className="py-24 text-center text-gris">Abriendo el talonario…</p>;
}
