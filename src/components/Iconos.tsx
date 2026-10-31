/* Íconos de línea, sobrios y del mismo grosor, para el menú y los encabezados. */

type P = { className?: string; size?: number };

function Base({ size = 20, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconoInicio = (p: P) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M10 20v-6h4v6" />
  </Base>
);
export const IconoVale = (p: P) => (
  <Base {...p}>
    <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
    <path d="M9 8h6M9 11.5h6M9 15h3" />
  </Base>
);
export const IconoAbono = (p: P) => (
  <Base {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v5M18 9.5v5" />
  </Base>
);
export const IconoClientes = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17 14.2c1.9.6 3.2 2.2 3.5 4.8" />
  </Base>
);
export const IconoCaja = (p: P) => (
  <Base {...p}>
    <rect x="3" y="10" width="18" height="10" rx="1.5" />
    <path d="M7 10V5h10v5M7 14h2M11 14h2M15 14h2M7 17h10" />
  </Base>
);
export const IconoSueldos = (p: P) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <circle cx="9" cy="10" r="2.2" />
    <path d="M5.8 16.5c.5-1.8 1.7-2.8 3.2-2.8s2.7 1 3.2 2.8M14.5 9h4M14.5 12.5h4" />
  </Base>
);
export const IconoResumen = (p: P) => (
  <Base {...p}>
    <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" />
  </Base>
);

/** Logo del local (el círculo de la imagen oficial) */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={size > 96 ? "/logo.png" : "/logo-128.png"}
      width={size}
      height={size}
      alt=""
      className="shrink-0 rounded-full ring-1 ring-black/10"
      style={{ width: size, height: size }}
    />
  );
}

/* ------------------------------ secciones ------------------------------ */

export interface Seccion {
  href: string;
  label: string;
  corto: string;
  tecla: string;
  Fruta: (p: P) => React.JSX.Element; // ícono de la sección
  color: string;
  suave: string;
  que: string; // qué se hace acá, en palabras simples
}

const VERDE = "#166534";
const TINTE = "#eef5f0";

export const SECCIONES: Seccion[] = [
  { href: "/vale", label: "Vale", corto: "Vale", tecla: "F1", Fruta: IconoVale, color: VERDE, suave: TINTE, que: "Registrar una venta al contado o a crédito." },
  { href: "/abono", label: "Abonos", corto: "Abonos", tecla: "F2", Fruta: IconoAbono, color: VERDE, suave: TINTE, que: "Registrar el pago total o parcial de una deuda." },
  { href: "/clientes", label: "Clientes", corto: "Clientes", tecla: "F3", Fruta: IconoClientes, color: VERDE, suave: TINTE, que: "Deuda, estado e historial de cada cliente." },
  { href: "/caja", label: "Cierre de caja", corto: "Caja", tecla: "F4", Fruta: IconoCaja, color: VERDE, suave: TINTE, que: "Cuadratura diaria y semanal, con impresión." },
  { href: "/sueldos", label: "Remuneraciones", corto: "Sueldos", tecla: "F7", Fruta: IconoSueldos, color: VERDE, suave: TINTE, que: "Asistencia, anticipos y pagos del personal." },
  { href: "/resumen", label: "Reportes", corto: "Reportes", tecla: "F6", Fruta: IconoResumen, color: VERDE, suave: TINTE, que: "Ventas, cartera de crédito y productos." },
];
