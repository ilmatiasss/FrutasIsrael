import { Importador } from "@/components/importar/Importador";
import { SoloAdmin } from "@/components/sistema/Administracion";

export const metadata = { title: "Importar planilla · Frutas Israel" };

export default function Page() {
  return (
    <SoloAdmin que="Importar planillas">
      <Importador />
    </SoloAdmin>
  );
}
