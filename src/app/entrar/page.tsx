import { Suspense } from "react";
import { Entrar } from "@/components/sistema/Entrar";

export const metadata = { title: "Entrar · Frutas Israel" };

export default function Page() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  );
}
