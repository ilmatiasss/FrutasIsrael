import { Suspense } from "react";
import { RegistroVale } from "@/components/vale/RegistroVale";

export default function Page() {
  return (
    <Suspense>
      <RegistroVale />
    </Suspense>
  );
}
