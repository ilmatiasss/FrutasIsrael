import { Suspense } from "react";
import { ImprimirDeudores } from "@/components/imprimir/ImprimirDeudores";

export const metadata = { title: "Listado de deudores · Frutas Israel" };

export default function Page() {
  return (
    <Suspense>
      <ImprimirDeudores />
    </Suspense>
  );
}
