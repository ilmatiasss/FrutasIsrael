import "server-only";
import { randomUUID } from "node:crypto";
import { pool } from "./pg";

/** Anota en la bitácora una acción hecha en el servidor (seguridad, cuentas). */
export async function eventoServidor(tenant: string, usuario: string, detalle: string) {
  await pool().query("insert into eventos (id, tenant_id, usuario, accion, entidad_id, detalle) values ($1, $2, $3, 'SEGURIDAD', null, $4)", [
    randomUUID(), tenant, usuario, detalle,
  ]);
}
