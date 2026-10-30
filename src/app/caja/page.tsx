import { Suspense } from "react";
import { Caja } from "@/components/caja/Caja";

export const metadata = { title: "Cierre de caja · Frutas Israel" };

export default function Page() {
  return (
    <Suspense>
      <Caja />
    </Suspense>
  );
}
