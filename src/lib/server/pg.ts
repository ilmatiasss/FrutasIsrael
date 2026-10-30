import "server-only";
import { Pool, types, type PoolClient } from "pg";

/* Conexión a Postgres (Neon). Si no hay DATABASE_URL la app funciona en
   "modo prueba": los datos viven en el navegador. */

// bigint y numeric como número; fechas tal cual ("2026-10-30"); timestamps en ISO
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1114, (v) => new Date(v + "Z").toISOString());

const g = globalThis as unknown as { __pool?: Pool };

export function hayBase(): boolean {
  return !!process.env.DATABASE_URL;
}

export function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL");
    const local = /localhost|127\.0\.0\.1|\/tmp|host=\//.test(url);
    g.__pool = new Pool({
      connectionString: url,
      ssl: local ? undefined : { rejectUnauthorized: true },
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  return g.__pool;
}

export async function enTransaccion<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** El locatario de esta instalación (piloto: uno solo). */
export async function tenantId(): Promise<string | null> {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;
  const r = await pool().query("select id from tenants order by created_at limit 1");
  return r.rows[0]?.id ?? null;
}

export async function baseInstalada(): Promise<boolean> {
  const r = await pool().query("select to_regclass('public.tenants') is not null as ok");
  if (!r.rows[0]?.ok) return false;
  return (await tenantId()) !== null;
}
