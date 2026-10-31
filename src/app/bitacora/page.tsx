import { Bitacora } from "@/components/Bitacora";
import { SoloAdmin } from "@/components/sistema/Administracion";

export const metadata = { title: "Bitácora · Frutas Israel" };

export default function Page() {
  return (
    <SoloAdmin que="La bitácora">
      <Bitacora />
    </SoloAdmin>
  );
}
