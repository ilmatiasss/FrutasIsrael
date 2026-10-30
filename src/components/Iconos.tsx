/* Íconos planos de frutas: cada sección del sistema tiene su fruta y su color,
   así se reconoce de un vistazo dónde se está. */

type P = { className?: string; size?: number };

export function Manzana({ className, size = 28 }: P) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <path d="M16 9.5c-4.6-2.8-10 .2-9.4 6.6.6 6.8 5 11.8 9.4 9.7 4.4 2.1 8.8-2.9 9.4-9.7.6-6.4-4.8-9.4-9.4-6.6z" fill="#d84a36" />
      <path d="M11 12.5c-1.6.8-2.3 2.6-2.1 4.4" stroke="#f3a08f" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M16 9.5c0-2.6 1-4.6 3-5.8" stroke="#6b4a2b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M17.2 6.8c2.2-2.2 5.2-2.2 6.6-1.4-1 2.4-3.8 3.6-6.6 1.4z" fill="#4c9a4f" />
    </svg>
  );
}

export function Pera({ className, size = 28 }: P) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <path d="M16 6.5c-2.6 0-3.6 2.4-3.6 4.6 0 2-3.9 4.6-3.9 9 0 4.6 3.4 7.4 7.5 7.4s7.5-2.8 7.5-7.4c0-4.4-3.9-7-3.9-9 0-2.2-1-4.6-3.6-4.6z" fill="#8cbf4a" />
      <path d="M12.5 18.5c-.4 1.8.2 3.6 1.6 4.6" stroke="#c6e39a" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M16 6.5c.2-1.8.9-3 2.2-3.8" stroke="#6b4a2b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Naranja({ className, size = 28 }: P) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <circle cx="16" cy="17.5" r="10" fill="#f08a24" />
      <circle cx="12.5" cy="14" r="1" fill="#f7b46a" />
      <circle cx="18.5" cy="21" r="1" fill="#d97614" />
      <circle cx="20" cy="15" r=".8" fill="#d97614" />
      <path d="M16 7.5c1.6-2.6 4.6-3.2 6.6-2.2-1.4 2.6-4.2 3.4-6.6 2.2z" fill="#4c9a4f" />
    </svg>
  );
}

export function Cajon({ className, size = 28 }: P) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <circle cx="11" cy="11.5" r="4" fill="#d84a36" />
      <circle cx="17.5" cy="10.5" r="4" fill="#f08a24" />
      <circle cx="23" cy="12" r="3.6" fill="#8cbf4a" />
      <rect x="4" y="13.5" width="24" height="13" rx="2" fill="#c8955a" />
      <rect x="4" y="13.5" width="24" height="3.4" rx="1.5" fill="#a87640" />
      <path d="M8 20.5h16M8 24h16" stroke="#a87640" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Platano({ className, size = 28 }: P) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <path d="M6.5 13.5c1.6 8.6 9.6 13.2 18.6 10.4 1.4-.4 1.2-1.6-.2-1.8-7.2-.8-12.8-5-14.6-11.4-.4-1.4-4-.2-3.8 2.8z" fill="#f2c230" />
      <path d="M9.4 13.8c1.6 4.6 5.6 8 11.2 9.2" stroke="#d9a514" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M7 11.5l-.8-2.6 2.2-.6.6 2.4" fill="#7a5a22" />
    </svg>
  );
}

export function Uvas({ className, size = 28 }: P) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      {[
        [11, 12], [16.5, 11.5], [22, 12.5], [13.5, 17], [19, 17], [16, 22], [11, 21.5], [21.5, 22],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.3" fill={i % 2 ? "#7d5bb0" : "#6a4a9a"} />
      ))}
      <path d="M16.5 8c0-2 .6-3.4 2-4.4" stroke="#6b4a2b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M17.6 6.4c2-1.6 4.6-1.4 5.8-.4-1.2 2-3.6 2.6-5.8.4z" fill="#4c9a4f" />
    </svg>
  );
}

export function Hoja({ className, size = 20 }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d="M5 19C4 10 10 4 20 4c0 10-6 16-15 15z" fill="#4c9a4f" />
      <path d="M5 19c4-5 8-8 12-11" stroke="#2f7d45" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Casa({ className, size = 28 }: P) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <path d="M5 15L16 6l11 9" stroke="#2f7d45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 13.5V26h16V13.5" fill="#e8f3e6" stroke="#2f7d45" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="13.5" y="18" width="5" height="8" rx="1" fill="#2f7d45" />
    </svg>
  );
}

/* ------------------------------ secciones ------------------------------ */

export interface Seccion {
  href: string;
  label: string;
  corto: string;
  tecla: string;
  Fruta: (p: P) => React.JSX.Element;
  color: string;
  suave: string;
  que: string; // qué se hace acá, en palabras simples
}

export const SECCIONES: Seccion[] = [
  { href: "/vale", label: "Vale", corto: "Vale", tecla: "F1", Fruta: Manzana, color: "#d84a36", suave: "#fce9e4", que: "Anotar una venta: al contado o fiada." },
  { href: "/abono", label: "Abono", corto: "Abono", tecla: "F2", Fruta: Pera, color: "#5e9a2c", suave: "#eef6e2", que: "Recibir un pago de alguien que debe." },
  { href: "/clientes", label: "Clientes", corto: "Clientes", tecla: "F3", Fruta: Naranja, color: "#e07a14", suave: "#fdeedc", que: "Ver quién debe, cuánto y desde cuándo." },
  { href: "/caja", label: "Cierre de caja", corto: "Caja", tecla: "F4", Fruta: Cajon, color: "#a87640", suave: "#f6ecdd", que: "Cuadrar la plata del día o de la semana e imprimirlo." },
  { href: "/sueldos", label: "Sueldos", corto: "Sueldos", tecla: "F7", Fruta: Platano, color: "#c99611", suave: "#fcf3d6", que: "Días trabajados, adelantos y pagos al equipo." },
  { href: "/resumen", label: "Resumen", corto: "Resumen", tecla: "F6", Fruta: Uvas, color: "#6d4f9c", suave: "#efe9f7", que: "Cómo va el negocio: ventas, fiado y productos." },
];

export function seccionDe(path: string): Seccion | null {
  return SECCIONES.find((s) => path === s.href || path.startsWith(s.href + "/")) ?? null;
}
