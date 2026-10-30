import { CuentaCliente } from "@/components/clientes/CuentaCliente";

export const metadata = { title: "Cuenta cliente · Frutas Israel" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CuentaCliente id={id} />;
}
