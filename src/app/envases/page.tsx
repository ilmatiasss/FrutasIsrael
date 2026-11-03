import { Suspense } from "react";
import { Envases } from "@/components/envases/Envases";

export const metadata = { title: "Envases · Frutas Israel" };

export default function Page() {
  return (
    <Suspense>
      <Envases />
    </Suspense>
  );
}
