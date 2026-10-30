import { Suspense } from "react";
import { RegistroAbono } from "@/components/abono/RegistroAbono";

export const metadata = { title: "Abono · Frutas Israel" };

export default function Page() {
  return (
    <Suspense>
      <RegistroAbono />
    </Suspense>
  );
}
