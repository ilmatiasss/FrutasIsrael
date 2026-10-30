import type { Metadata, Viewport } from "next";
import { Big_Shoulders_Stencil, IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const stencil = Big_Shoulders_Stencil({ subsets: ["latin", "latin-ext"], variable: "--f-stencil", axes: ["opsz"], adjustFontFallback: false });
const sans = IBM_Plex_Sans_Condensed({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--f-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Frutas Israel · Cuentas y crédito",
  description: "Vales, créditos, abonos y cierre de caja de la bodega en La Vega Central.",
};

export const viewport: Viewport = {
  themeColor: "#fcfbf8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${stencil.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
