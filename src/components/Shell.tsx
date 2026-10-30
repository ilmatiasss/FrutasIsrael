"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { reintentarAhora, useData, useSync } from "@/lib/store";
import { fechaLarga, hoy } from "@/lib/format";
import { Autocompletar } from "./Autocompletar";
import { filtrarClientes, OpcionCliente, useEstados } from "./clientes";
import { Modal } from "./ui";
import { Casa, Manzana, SECCIONES } from "./Iconos";

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
  { href: "/importar", label: "Importar planilla" },
  { href: "/bitacora", label: "Bitácora (historial)" },
  { href: "/ajustes", label: "Ajustes" },
];

function activa(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

function Marca() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Frutas Israel — inicio">
      <Manzana size={30} />
      <span className="leading-none">
        <span className="marca block text-[21px] text-grafito">Frutas Israel</span>
        <span className="hidden text-[11px] font-bold text-gris sm:block">La Vega Central</span>
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

  return (
    <AvisoCtx.Provider value={avisar}>
      <header className="no-print sticky top-0 z-30 border-b border-linea bg-papel/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 lg:px-6">
          <Marca />
          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Secciones">
            {SECCIONES.map((t) => {
              const on = activa(path, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  title={`${t.label} (${t.tecla})`}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[15px] font-bold transition-colors ${on ? "text-grafito" : "text-gris hover:bg-carton hover:text-grafito"}`}
                  style={on ? { background: t.suave, boxShadow: `inset 0 0 0 1.5px ${t.color}55` } : undefined}
                >
                  <t.Fruta size={20} />
                  <span className="lg:hidden">{t.corto}</span>
                  <span className="hidden lg:inline">{t.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <EstadoConexion />
            {fecha && <span className="hidden text-sm font-semibold text-gris first-letter:uppercase 2xl:inline">{fechaLarga(fecha)}</span>}
            <button
              type="button"
              onClick={() => setBuscar(true)}
              className="flex h-10 items-center gap-2 rounded-full border-[1.5px] border-kraft bg-hoja px-3.5 text-sm font-bold text-gris hover:text-grafito"
              aria-label="Buscar cliente"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2.2" fill="none" />
                <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <span className="hidden xl:inline">Buscar cliente</span>
            </button>
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setMas((m) => !m)}
                aria-expanded={mas}
                className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-kraft bg-hoja text-gris hover:text-grafito"
                aria-label="Más opciones"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
                  <circle cx="4" cy="10" r="1.8" fill="currentColor" />
                  <circle cx="10" cy="10" r="1.8" fill="currentColor" />
                  <circle cx="16" cy="10" r="1.8" fill="currentColor" />
                </svg>
              </button>
              {mas && <MenuMas usuario={data?.db.config.usuario_actual} />}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-3 pb-28 pt-4 sm:px-5 md:pb-12 lg:px-6 lg:pt-6">{data || sinDatos ? children : <Cargando />}</main>

      {/* navegación celular: lo de todos los días a un toque, el resto en "Más" */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linea bg-hoja/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        {[{ href: "/", corto: "Inicio", Fruta: Casa }, ...SECCIONES.slice(0, 3)].map((t) => {
          const on = t.href === "/" ? path === "/" : activa(path, t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${on ? "text-grafito" : "text-gris"}`}>
              <span className={`flex size-8 items-center justify-center rounded-full ${on ? "bg-verde-suave" : ""}`}>
                <t.Fruta size={22} />
              </span>
              {t.corto}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMas((m) => !m)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${mas ? "text-grafito" : "text-gris"}`}>
          <span className="flex size-8 items-center justify-center rounded-full">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
              <circle cx="4" cy="10" r="2" fill="currentColor" />
              <circle cx="10" cy="10" r="2" fill="currentColor" />
              <circle cx="16" cy="10" r="2" fill="currentColor" />
            </svg>
          </span>
          Más
        </button>
      </nav>
      {mas && (
        <div className="fixed inset-0 z-40 bg-grafito/30 md:hidden" onClick={() => setMas(false)}>
          <div className="hoja animate-entra absolute inset-x-2 bottom-20 rounded-2xl p-2" onClick={(e) => e.stopPropagation()}>
            {SECCIONES.slice(3).map((t) => (
              <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-xl px-3 py-3 font-bold hover:bg-carton">
                <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: t.suave }}>
                  <t.Fruta size={24} />
                </span>
                <span>
                  {t.label}
                  <span className="block text-xs font-semibold text-gris">{t.que}</span>
                </span>
              </Link>
            ))}
            <div className="my-1 border-t border-linea" />
            {MAS.map((m) => (
              <Link key={m.href} href={m.href} className="block rounded-xl px-3 py-2.5 font-semibold text-gris hover:bg-carton">
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
    <div className="hoja animate-entra absolute right-0 top-12 z-40 w-60 rounded-2xl p-2">
      <p className="px-3 pb-1 pt-1 text-xs font-semibold text-gris">
        Atiende: <b className="text-grafito">{usuario ?? "…"}</b>
      </p>
      {MAS.map((m) => (
        <Link key={m.href} href={m.href} className="block rounded-xl px-3 py-2 font-semibold hover:bg-carton">
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
      className="flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold"
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
