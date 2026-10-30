"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useData } from "@/lib/store";
import { DIAS_LARGO, MESES, fromFecha, hoy } from "@/lib/format";
import { Autocompletar } from "./Autocompletar";
import { filtrarClientes, OpcionCliente, useEstados } from "./clientes";
import { Modal, Tecla } from "./ui";

/* --------------------------------- avisos --------------------------------- */

interface Aviso {
  id: number;
  titulo: string;
  detalle?: string;
  tono?: "ok" | "rojo" | "tinta";
}
const AvisoCtx = createContext<(a: Omit<Aviso, "id">) => void>(() => {});
export const useAviso = () => useContext(AvisoCtx);

/* -------------------------------- pestañas -------------------------------- */

const PESTANAS = [
  { href: "/", label: "Vale", tecla: "F1", color: "#dd7420", icono: "vale" },
  { href: "/abono", label: "Abono", tecla: "F2", color: "#4f7f2a", icono: "abono" },
  { href: "/clientes", label: "Clientes", tecla: "F3", color: "#1f3c8f", icono: "clientes" },
  { href: "/caja", label: "Cierre de caja", tecla: "F4", color: "#8a6a3d", icono: "caja" },
] as const;

const MAS = [
  { href: "/importar", label: "Importar planilla" },
  { href: "/bitacora", label: "Bitácora" },
  { href: "/ajustes", label: "Ajustes" },
];

function activa(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

function Icono({ n, className = "" }: { n: string; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={className} aria-hidden>
      {n === "vale" && (
        <>
          <path {...p} d="M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6L5 21z" />
          <path {...p} d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
        </>
      )}
      {n === "abono" && (
        <>
          <rect {...p} x="3" y="6" width="18" height="12" rx="1.5" />
          <circle {...p} cx="12" cy="12" r="2.6" />
          <path {...p} d="M6.5 9.5v5M17.5 9.5v5" />
        </>
      )}
      {n === "clientes" && (
        <>
          <circle {...p} cx="9" cy="8.5" r="3.2" />
          <path {...p} d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
          <path {...p} d="M15.5 5.6a3 3 0 0 1 0 5.8M17 14.2c1.9.6 3.2 2.2 3.5 4.8" />
        </>
      )}
      {n === "caja" && (
        <>
          <path {...p} d="M3 9h18l-1.6 11H4.6z" />
          <path {...p} d="M3 9l2.5-4.5h13L21 9M8 13h8M7.5 16.5h9" />
        </>
      )}
    </svg>
  );
}

/** Logo: timbre redondo de bodega */
function Logo() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Frutas Israel — inicio">
      <svg viewBox="0 0 64 64" className="size-11 -rotate-6 text-fuji transition-transform group-hover:rotate-0" aria-hidden>
        <defs>
          <path id="arco" d="M32 32 m-22 0 a22 22 0 1 1 44 0 a22 22 0 1 1 -44 0" />
        </defs>
        <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text fontSize="8.4" fontWeight="800" fill="currentColor" letterSpacing="1.6" style={{ fontFamily: "var(--f-stencil)" }}>
          <textPath href="#arco">FRUTAS ISRAEL · LA VEGA ·</textPath>
        </text>
        <path d="M32 24c-5.5-2.8-10 1-9.4 6.6.6 6 5 10.6 9.4 8.6 4.4 2 8.8-2.6 9.4-8.6.6-5.6-3.9-9.4-9.4-6.6z" fill="currentColor" />
        <path d="M32 24c0-3 1.2-5 3.6-6.4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <span className="hidden whitespace-nowrap leading-none sm:block">
        <span className="stencil block text-[26px] font-black text-grafito">Frutas Israel</span>
        <span className="block text-[11px] uppercase tracking-[0.22em] text-gris">La Vega Central · Santiago</span>
      </span>
    </Link>
  );
}

/** Fecha como timbre fechador azul */
function TimbreFecha() {
  const [f, setF] = useState<string | null>(null);
  useEffect(() => setF(hoy()), []);
  if (!f) return <span className="w-24" />;
  const d = fromFecha(f);
  return (
    <span className="timbre hidden !rotate-[-3deg] text-[13px] leading-tight !opacity-90 lg:inline-block" style={{ color: "#1f3c8f" }}>
      <span className="block text-[10px] tracking-[0.25em]">{DIAS_LARGO[d.getDay()]}</span>
      <span className="cifra block text-[15px] font-bold tracking-wider">
        {String(d.getDate()).padStart(2, "0")} {MESES[d.getMonth()].slice(0, 3).toUpperCase()} {d.getFullYear()}
      </span>
    </span>
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
    <Modal abierto={abierto} onCerrar={cerrar} ancho="max-w-xl" etiqueta="Buscar cliente">
      <p className="stencil mb-3 text-xl text-gris">Buscar cliente</p>
      <Autocompletar
        etiqueta="Buscar cliente"
        autoFocus
        abrirSinTexto
        max={9}
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
        placeholder="Alias, nombre o feria… (ej: flaco, saavedra, matta)"
        inputClassName="text-xl py-2"
      />
      <p className="mt-4 flex gap-4 text-xs text-gris">
        <span><Tecla>↑</Tecla><Tecla>↓</Tecla> moverse</span>
        <span><Tecla>Enter</Tecla> abrir cuenta</span>
        <span><Tecla>Esc</Tecla> cerrar</span>
      </p>
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
  const n = useRef(0);

  const avisar = useCallback((a: Omit<Aviso, "id">) => {
    const id = ++n.current;
    setAvisos((x) => [...x.slice(-2), { ...a, id }]);
    setTimeout(() => setAvisos((x) => x.filter((y) => y.id !== id)), 4200);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const map: Record<string, string> = { F1: "/", F2: "/abono", F3: "/clientes", F4: "/caja" };
      if (map[e.key]) {
        e.preventDefault();
        router.push(map[e.key]);
        return;
      }
      if (e.altKey && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        router.push(PESTANAS[Number(e.key) - 1].href);
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

  return (
    <AvisoCtx.Provider value={avisar}>
      <header className="no-print sticky top-0 z-30 border-b-2 border-kraft-osc/70 bg-carton/95 backdrop-blur-sm" style={{ backgroundImage: "var(--grano)" }}>
        <div className="mx-auto flex max-w-[1500px] items-end gap-4 px-4 pt-2 lg:gap-6 lg:px-6">
          <div className="pb-2">
            <Logo />
          </div>
          <nav className="hidden flex-1 items-end gap-1.5 md:flex lg:pl-2" aria-label="Secciones">
            {PESTANAS.map((t) => {
              const on = activa(path, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  data-activa={on}
                  aria-current={on ? "page" : undefined}
                  className={`pestana flex items-center gap-2 px-4 pb-2.5 pt-2 ${on ? "bg-hoja" : "bg-[#efe3c6]"}`}
                  style={{ boxShadow: `inset 0 4px 0 ${t.color}`, marginBottom: on ? "-2px" : 0 }}
                >
                  <Icono n={t.icono} className="opacity-80" />
                  <span className="stencil whitespace-nowrap text-[19px] font-extrabold" style={{ color: on ? t.color : "#4a4136" }}>
                    {t.label === "Cierre de caja" ? (
                      <>
                        <span className="hidden xl:inline">Cierre de </span>
                        <span className="xl:hidden">Caja</span>
                        <span className="hidden xl:inline">caja</span>
                      </>
                    ) : (
                      t.label
                    )}
                  </span>
                  <span className="tecla ml-0.5 hidden xl:inline-flex">{t.tecla}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 pb-2 md:ml-0">
            <button
              type="button"
              onClick={() => setBuscar(true)}
              className="flex items-center gap-2 rounded-sm border border-kraft-osc/50 bg-hoja/80 px-3 py-1.5 text-sm text-gris transition hover:bg-hoja"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="hidden whitespace-nowrap xl:inline">Buscar cliente</span>
              <span className="hidden gap-0.5 xl:inline-flex"><Tecla>Ctrl</Tecla><Tecla>K</Tecla></span>
            </button>
            <TimbreFecha />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMas((m) => !m)}
                aria-expanded={mas}
                className="flex size-9 items-center justify-center rounded-full border border-kraft-osc/50 bg-hoja/70 hover:bg-hoja"
                aria-label="Más opciones"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
                  <circle cx="4" cy="10" r="1.8" fill="currentColor" />
                  <circle cx="10" cy="10" r="1.8" fill="currentColor" />
                  <circle cx="16" cy="10" r="1.8" fill="currentColor" />
                </svg>
              </button>
              {mas && (
                <div className="hoja animate-entra absolute right-0 top-11 z-40 w-56 rounded-sm py-2 [animation-duration:150ms]">
                  <p className="px-4 pb-1 text-[11px] uppercase tracking-widest text-gris">
                    Atiende: <b className="text-tinta">{data?.db.config.usuario_actual ?? "…"}</b>
                  </p>
                  {MAS.map((m) => (
                    <Link key={m.href} href={m.href} className="block px-4 py-1.5 font-medium hover:bg-resaltador/70">
                      {m.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-3 pb-28 pt-4 sm:px-4 md:pb-10 lg:px-6 lg:pt-6">
        {data ? children : <Cargando />}
      </main>

      {/* navegación celular */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t-2 border-kraft-osc/60 bg-carton/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        {PESTANAS.map((t) => {
          const on = activa(path, t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 pb-2 pt-2"
              style={{ color: on ? t.color : "#5c5144", boxShadow: on ? `inset 0 3px 0 ${t.color}` : undefined }}
            >
              <Icono n={t.icono} />
              <span className="stencil text-[13px] font-extrabold">{t.label === "Cierre de caja" ? "Caja" : t.label}</span>
            </Link>
          );
        })}
      </nav>

      <Buscador abierto={buscar} cerrar={() => setBuscar(false)} />

      {/* avisos: colillas de papel */}
      <div className="no-print pointer-events-none fixed bottom-20 right-3 z-50 flex flex-col items-end gap-2 md:bottom-5 md:right-5" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className="hoja perforado animate-entra w-72 rounded-b-sm px-4 pb-3 pt-3"
            style={{ borderLeft: `5px solid ${a.tono === "rojo" ? "#c4262e" : a.tono === "tinta" ? "#1f3c8f" : "#4f7f2a"}` }}
          >
            <p className="stencil text-lg font-extrabold">{a.titulo}</p>
            {a.detalle && <p className="text-sm text-gris">{a.detalle}</p>}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

function Cargando() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-gris">
      <div className="hoja perforado w-40 animate-pulse rounded-b-sm p-4">
        <div className="mb-2 h-3 w-16 bg-linea" />
        <div className="mb-1.5 h-2 w-full bg-linea/70" />
        <div className="h-2 w-3/4 bg-linea/70" />
      </div>
      <p className="font-mano text-2xl">Abriendo el talonario…</p>
    </div>
  );
}
