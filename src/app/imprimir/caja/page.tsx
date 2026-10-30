import { Suspense } from "react";
import { ImprimirCaja } from "@/components/imprimir/ImprimirCaja";

export const metadata = { title: "Imprimir cierre · Frutas Israel" };

export default function Page() {
  return (
    <Suspense>
      <ImprimirCaja />
    </Suspense>
  );
}
