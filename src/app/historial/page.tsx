import { Historial } from "@/components/sistema/Historial";
import { SoloAdmin } from "@/components/sistema/Administracion";

export const metadata = { title: "Historial de cambios · Frutas Israel" };

export default function Page() {
  return (
    <SoloAdmin que="El historial de cambios">
      <Historial />
    </SoloAdmin>
  );
}
