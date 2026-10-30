"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useData } from "@/lib/store";
import { fechaLarga, hoy } from "@/lib/format";
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

/* -------------------------------- secciones -------------------------------- */

const SECCIONES = [
  { href: "/", label: "Vale", corto: "Vale", tecla: "F1", icono: "vale" },
  { href: "/abono", label: "Abono", corto: "Abono", tecla: "F2", icono: "abono" },
  { href: "/clientes", label: "Clientes", corto: "Clientes", tecla: "F3", icono: "clientes" },
  { href: "/caja", label: "Cierre de caja", corto: "Caja", tecla: "F4", icono: "caja" },
  { href: "/resumen", label: "Resumen", corto: "Resumen", tecla: "F6", icono: "resumen" },
] as const;

const ATAJOS: Record<string, string> = { F1: "/", F2: "/abono", F3: "/clientes", F4: "/caja", F6: "/resumen" };

const MAS = [
  { href: "/importar", label: "Importar planilla" },
  { href: "/bitacora", label: "Bitácora" },
  { href: "/ajustes", label: "Ajustes" },
];

function activa(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

function Icono({ n }: { n: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {n === "vale" && (
        <>
          <path {...p} d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
          <path {...p} d="M9 8h6M9 11.5h6M9 15h3" />
        </>
      )}
      {n === "abono" && (
        <>
          <rect {...p} x="3" y="6" width="18" height="12" rx="2" />
          <circle {...p} cx="12" cy="12" r="2.5" />
        </>
      )}
      {n === "clientes" && (
        <>
          <circle {...p} cx="9" cy="8.5" r="3.2" />
          <path {...p} d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 5.6a3 3 0 0 1 0 5.8M17 14.2c1.9.6 3.2 2.2 3.5 4.8" />
        </>
      )}
      {n === "caja" && (
        <>
          <path {...p} d="M3 9h18l-1.5 11h-15z" />
          <path {...p} d="M3 9l2.5-4.5h13L21 9M9 13h6" />
        </>
      )}
      {n === "resumen" && <path {...p} d="M4 20V10M10 20V4M16 20v-7M21 20H3" />}
    </svg>
  );
}

function Marca() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Frutas Israel — inicio">
      <svg viewBox="0 0 24 24" className="size-6 text-fuji" aria-hidden>
        <path d="M12 7.5C8.7 5.6 5 7.6 5.4 12c.4 4.6 3.5 8.2 6.6 6.8 3.1 1.4 6.2-2.2 6.6-6.8.4-4.4-3.3-6.4-6.6-4.5z" fill="currentColor" />
        <path d="M12 7.5c0-2 .8-3.4 2.5-4.4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className="marca text-[22px] font-black text-grafito">Frutas Israel</span>
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
      if (e.altKey && /^[1-5]$/.test(e.key)) {
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

  return (
    <AvisoCtx.Provider value={avisar}>
      <header className="no-print sticky top-0 z-30 border-b border-linea bg-hoja/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 lg:px-6">
          <Marca />
          <nav className="hidden h-full flex-1 items-stretch gap-1 md:flex" aria-label="Secciones">
            {SECCIONES.map((t) => {
              const on = activa(path, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  title={`${t.label} (${t.tecla})`}
                  className={`flex items-center border-b-2 px-3 text-[15px] font-semibold transition-colors ${on ? "border-tinta text-grafito" : "border-transparent text-gris hover:text-grafito"}`}
                >
                  <span className="lg:hidden">{t.corto}</span>
                  <span className="hidden lg:inline">{t.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {fecha && <span className="hidden text-sm text-gris first-letter:uppercase xl:inline">{fechaLarga(fecha)}</span>}
            <button
              type="button"
              onClick={() => setBuscar(true)}
              className="flex h-9 items-center gap-2 rounded-md border border-linea bg-hoja px-3 text-sm text-gris hover:text-grafito"
              aria-label="Buscar cliente"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="hidden lg:inline">Buscar</span>
              <span className="hidden lg:inline">
                <Tecla>Ctrl K</Tecla>
              </span>
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMas((m) => !m)}
                aria-expanded={mas}
                className="flex size-9 items-center justify-center rounded-md border border-linea bg-hoja text-gris hover:text-grafito"
                aria-label="Más opciones"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
                  <circle cx="4" cy="10" r="1.7" fill="currentColor" />
                  <circle cx="10" cy="10" r="1.7" fill="currentColor" />
                  <circle cx="16" cy="10" r="1.7" fill="currentColor" />
                </svg>
              </button>
              {mas && (
                <div className="hoja animate-entra absolute right-0 top-11 z-40 w-56 rounded-md py-2">
                  <p className="px-4 pb-1 text-xs text-gris">
                    Atiende: <b className="text-grafito">{data?.db.config.usuario_actual ?? "…"}</b>
                  </p>
                  {MAS.map((m) => (
                    <Link key={m.href} href={m.href} className="block px-4 py-2 hover:bg-carton">
                      {m.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-3 pb-28 pt-4 sm:px-5 md:pb-12 lg:px-6 lg:pt-6">{data ? children : <Cargando />}</main>

      {/* navegación celular */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linea bg-hoja/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        {SECCIONES.map((t) => {
          const on = activa(path, t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? "text-tinta" : "text-gris"}`}
            >
              <Icono n={t.icono} />
              {t.corto}
            </Link>
          );
        })}
      </nav>

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

function Cargando() {
  return <p className="py-24 text-center text-gris">Abriendo el talonario…</p>;
}
