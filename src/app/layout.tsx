import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

// títulos con aire de letrero pintado de verdulería; texto redondo y fácil de leer
const titulo = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--f-titulo", axes: ["SOFT", "opsz"] });
const sans = Nunito({ subsets: ["latin", "latin-ext"], variable: "--f-sans" });

export const metadata: Metadata = {
  title: "Frutas Israel · Cuentas y crédito",
  description: "Vales, créditos, abonos, sueldos y cierre de caja de la bodega en La Vega Central.",
};

export const viewport: Viewport = {
  themeColor: "#fbf7ee",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${titulo.variable} ${sans.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
