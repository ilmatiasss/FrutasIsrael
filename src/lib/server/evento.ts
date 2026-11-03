import "server-only";
import { randomUUID } from "node:crypto";
import { pool } from "./pg";
import { anotarHistorial, type Quien } from "./historial";

/** Anota una acción hecha en el servidor (seguridad, cuentas) en la bitácora y en el historial. */
export async function eventoServidor(tenant: string, usuario: string, detalle: string, quien?: Quien, ip?: string) {
  await pool().query("insert into eventos (id, tenant_id, usuario, accion, entidad_id, detalle) values ($1, $2, $3, 'SEGURIDAD', null, $4)", [
    randomUUID(), tenant, usuario, detalle,
  ]);
  await anotarHistorial(null, tenant, quien ?? { tipo: "ADMIN", id: null, nombre: usuario }, ip ?? null, [
    { tabla: "seguridad", registro_id: null, accion: "SEGURIDAD", descripcion: detalle },
  ]);
}
