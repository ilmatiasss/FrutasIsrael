import { Suspense } from "react";
import { ImprimirEnvases } from "@/components/imprimir/ImprimirEnvases";

export const metadata = { title: "Envases en la calle · Frutas Israel" };

export default function Page() {
  return (
    <Suspense>
      <ImprimirEnvases />
    </Suspense>
  );
}
