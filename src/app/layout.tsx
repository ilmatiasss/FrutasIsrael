import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

// Inter: sobria, muy legible en pantallas y con cifras tabulares para los montos
const sans = Inter({ subsets: ["latin", "latin-ext"], variable: "--f-sans" });

export const metadata: Metadata = {
  title: "Frutas Israel · Gestión comercial",
  description: "Gestión de ventas, crédito, cobranza, remuneraciones y caja.",
};

export const viewport: Viewport = {
  themeColor: "#14532d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={sans.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
