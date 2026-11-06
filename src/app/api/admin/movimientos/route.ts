import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { enTransaccion } from "@/lib/server/pg";
import { acceso, ipDe, mismoOrigen } from "@/lib/server/auth";
import { anotarHistorial } from "@/lib/server/historial";

export const dynamic = "force-dynamic";

/*
 * Edición y borrado de vales: SOLO administradores.
 * La base no deja editar ni borrar movimientos; aquí, dentro de una
 * transacción, se marca frutas.edicion_admin = 'on' para que los triggers lo
 * permitan, y se deja en el historial una copia completa de cómo estaba.
 */

type Fila = Record<string, unknown>;
const FORMAS = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CREDITO"];
const UNIDADES = ["CAJA", "ENVASE", "KG"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

class ErrorUsuario extends Error {}

async function modoAdmin(c: PoolClient) {
  await c.query("select set_config('frutas.edicion_admin', 'on', true)");
}

const clp = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString("es-CL")}`;

async function textoLineas(c: PoolClient, lineas: Fila[]): Promise<string> {
  if (!lineas.length) return "sin productos";
  const ids = [...new Set(lineas.map((l) => String(l.producto_id)))];
  const r = await c.query("select id, nombre from productos where id = any($1)", [ids]);
  const nom = new Map(r.rows.map((x) => [x.id, x.nombre]));
  return lineas
    .map((l) => `${Number(l.cantidad)} ${String(l.unidad).toLowerCase()} ${nom.get(String(l.producto_id)) ?? "?"} a ${clp(l.precio_unitario)}`)
    .join(" · ");
}

/** Editar un vale (fecha, N°, cliente, forma de pago, productos o monto, detalle). */
export async function PATCH(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.status === 403 ? "Solo un administrador puede editar vales." : a.error }, { status: a.status });
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    motivo?: string;
    numero?: number;
    fecha?: string;
    cliente_id?: string;
    forma_pago?: string;
    glosa?: string | null;
    monto?: number;
    lineas?: { cantidad: number; unidad: string; producto_id: string; precio_unitario: number }[];
  } | null;
  if (!body?.id) return NextResponse.json({ error: "Falta el vale" }, { status: 400 });
  const motivo = (body.motivo ?? "").trim();
  if (motivo.length < 3) return NextResponse.json({ error: "Escriba el motivo del cambio." }, { status: 400 });

  try {
    const r = await enTransaccion(async (c) => {
      const t = await c.query("select ultimo_numero from tenants where id = $1 for update", [a.tenant]);
      const m0 = (await c.query("select * from movimientos where id = $1 and tenant_id = $2", [body.id, a.tenant])).rows[0] as Fila | undefined;
      if (!m0) throw new ErrorUsuario("No se encontró el vale.");
      if (m0.tipo !== "VALE_VENTA" && m0.tipo !== "VALE_CREDITO") throw new ErrorUsuario("Solo se editan vales de venta o crédito. Los demás movimientos se pueden borrar.");
      if (m0.anulado_at) throw new ErrorUsuario("El vale está anulado: no se edita (se puede borrar).");
      const lineas0 = (await c.query("select * from lineas_vale where movimiento_id = $1 order by orden", [m0.id])).rows as Fila[];
      const pagados = (await c.query("select * from movimientos where origen_id = $1 and anulado_at is null", [m0.id])).rows as Fila[];

      // ---- valores nuevos ----
      const numero = body.numero !== undefined ? Number(body.numero) : Number(m0.numero);
      if (!Number.isInteger(numero) || numero < 0) throw new ErrorUsuario("El N° de vale debe ser un número (0 o más).");
      const fecha = body.fecha ?? String(m0.fecha);
      if (!FECHA.test(fecha)) throw new ErrorUsuario("Fecha inválida.");
      const cliente_id = body.cliente_id ?? String(m0.cliente_id);
      if (cliente_id !== m0.cliente_id) {
        const cli = await c.query("select 1 from clientes where id = $1 and tenant_id = $2", [cliente_id, a.tenant]);
        if (!cli.rowCount) throw new ErrorUsuario("Cliente no encontrado.");
      }
      const forma = body.forma_pago ?? String(m0.forma_pago);
      if (!FORMAS.includes(forma)) throw new ErrorUsuario("Forma de pago inválida.");
      if (pagados.length && forma !== m0.forma_pago)
        throw new ErrorUsuario("Este vale tiene pago combinado o abono en el mismo vale: no se le cambia la forma de pago. Bórrelo y hágalo de nuevo.");
      const tipo = forma === "CREDITO" ? "VALE_CREDITO" : "VALE_VENTA";
      const glosa = body.glosa !== undefined ? (body.glosa?.trim() || null) : (m0.glosa as string | null);

      let lineas: Fila[] = lineas0;
      let total = Number(m0.total);
      if (body.lineas) {
        lineas = body.lineas.map((l, i) => {
          const cantidad = Number(l.cantidad), precio = Math.round(Number(l.precio_unitario));
          if (!(cantidad > 0)) throw new ErrorUsuario(`Línea ${i + 1}: la cantidad debe ser mayor a 0.`);
          if (!(precio >= 0)) throw new ErrorUsuario(`Línea ${i + 1}: el precio no puede ser negativo.`);
          if (!UNIDADES.includes(l.unidad)) throw new ErrorUsuario(`Línea ${i + 1}: unidad inválida.`);
          return { id: randomUUID(), tenant_id: a.tenant, movimiento_id: m0.id, orden: i + 1, cantidad, unidad: l.unidad, producto_id: l.producto_id, precio_unitario: precio, subtotal: Math.round(cantidad * precio) };
        });
        if (lineas.length) {
          const ids = [...new Set(lineas.map((l) => String(l.producto_id)))];
          const ok = await c.query("select count(*)::int as n from productos where tenant_id = $1 and id = any($2)", [a.tenant, ids]);
          if (ok.rows[0].n !== ids.length) throw new ErrorUsuario("Hay un producto que no existe.");
          total = lineas.reduce((s, l) => s + Number(l.subtotal), 0);
        }
      }
      if (!body.lineas?.length && body.monto !== undefined) {
        if (lineas.length && !body.lineas) throw new ErrorUsuario("El vale tiene productos: cambie los productos, no el monto.");
        total = Math.round(Number(body.monto));
      }
      if (!(total >= 0)) throw new ErrorUsuario("El total no puede ser negativo.");
      const pagado = pagados.reduce((s, p) => s + Number(p.total), 0);
      if (pagado > total) throw new ErrorUsuario(`Ya se pagaron ${clp(pagado)} en este vale: el total no puede quedar menor.`);

      // ---- aplicar ----
      await modoAdmin(c);
      await c.query(
        "update movimientos set numero = $2, fecha = $3, cliente_id = $4, forma_pago = $5, tipo = $6, total = $7, glosa = $8, numero_manual = (numero_manual or numero <> $2) where id = $1",
        [m0.id, numero, fecha, cliente_id, forma, tipo, total, glosa],
      );
      if (body.lineas) {
        await c.query("delete from lineas_vale where movimiento_id = $1", [m0.id]);
        for (const l of lineas)
          await c.query(
            "insert into lineas_vale (id, tenant_id, movimiento_id, orden, cantidad, unidad, producto_id, precio_unitario, subtotal) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [l.id, l.tenant_id, l.movimiento_id, l.orden, l.cantidad, l.unidad, l.producto_id, l.precio_unitario, l.subtotal],
          );
      }
      // lo pagado en el mismo vale sigue al vale (fecha y cliente)
      if (pagados.length) {
        await c.query("update movimientos set fecha = $2, cliente_id = $3 where origen_id = $1 and anulado_at is null", [m0.id, fecha, cliente_id]);
        // lo pagado en el mismo vale lleva el N° del vale
        await c.query("update movimientos set numero = $2, numero_manual = true where origen_id = $1 and numero = $3", [m0.id, numero, m0.numero]);
      }
      if (numero > Number(t.rows[0].ultimo_numero)) await c.query("update tenants set ultimo_numero = $2 where id = $1", [a.tenant, numero]);

      // ---- historial con el antes y el después ----
      const cambios: Record<string, [unknown, unknown]> = {};
      const comparar = (k: string, antes: unknown, despues: unknown) => {
        if (String(antes ?? "") !== String(despues ?? "")) cambios[k] = [antes ?? null, despues ?? null];
      };
      comparar("numero", m0.numero, numero);
      comparar("fecha", m0.fecha, fecha);
      if (cliente_id !== m0.cliente_id) {
        const nombres = await c.query("select id, coalesce(alias, nombre) as n from clientes where id = any($1)", [[m0.cliente_id, cliente_id]]);
        const n = new Map(nombres.rows.map((x) => [x.id, x.n]));
        cambios.cliente = [n.get(m0.cliente_id) ?? m0.cliente_id, n.get(cliente_id) ?? cliente_id];
      }
      comparar("forma", m0.forma_pago, forma);
      comparar("total", m0.total, total);
      comparar("glosa", m0.glosa, glosa);
      if (body.lineas) {
        const antes = await textoLineas(c, lineas0), despues = await textoLineas(c, lineas);
        if (antes !== despues) cambios.productos = [antes, despues];
      }
      if (!Object.keys(cambios).length) throw new ErrorUsuario("No hay cambios que guardar.");
      await anotarHistorial(c, a.tenant, a.quien, ipDe(req), [
        { tabla: "movimientos", registro_id: String(m0.id), accion: "MODIFICAR", descripcion: `Editó vale N°${m0.numero}${numero !== Number(m0.numero) ? ` (ahora N°${numero})` : ""} · motivo: ${motivo}`, cambios },
      ]);
      await c.query("insert into eventos (id, tenant_id, usuario, accion, entidad_id, detalle) values ($1, $2, $3, 'EDITAR_VALE', $4, $5)", [
        randomUUID(), a.tenant, a.quien.nombre, m0.id, `Vale N°${m0.numero} editado por administrador${numero !== Number(m0.numero) ? ` → N°${numero}` : ""} · ${motivo}`,
      ]);
      return { numero, total };
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErrorUsuario) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** Borrar un movimiento (y lo pagado en el mismo vale, y sus líneas). */
export async function DELETE(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const a = await acceso(req, { soloAdmin: true });
  if (!a.ok) return NextResponse.json({ error: a.status === 403 ? "Solo un administrador puede borrar vales." : a.error }, { status: a.status });
  const body = (await req.json().catch(() => null)) as { id?: string; motivo?: string } | null;
  const motivo = (body?.motivo ?? "").trim();
  if (!body?.id) return NextResponse.json({ error: "Falta el movimiento" }, { status: 400 });
  if (motivo.length < 3) return NextResponse.json({ error: "Escriba el motivo del borrado." }, { status: 400 });
  try {
    const r = await enTransaccion(async (c) => {
      const m0 = (await c.query("select * from movimientos where id = $1 and tenant_id = $2", [body.id, a.tenant])).rows[0] as Fila | undefined;
      if (!m0) throw new ErrorUsuario("No se encontró el movimiento.");
      const sueldo = await c.query("select 1 from pagos_sueldo where movimiento_id = $1", [m0.id]);
      if (sueldo.rowCount) throw new ErrorUsuario("Es el egreso de un pago de sueldo: anúlelo en Remuneraciones.");
      const ligados = (await c.query("select * from movimientos where origen_id = $1", [m0.id])).rows as Fila[];
      const todos = [m0, ...ligados];
      const ids = todos.map((m) => m.id);
      const lineas = (await c.query("select * from lineas_vale where movimiento_id = any($1) order by movimiento_id, orden", [ids])).rows;
      const envases = (await c.query("select * from lineas_envase where movimiento_id = any($1)", [ids])).rows;
      const cli = m0.cliente_id ? (await c.query("select coalesce(alias, nombre) as n from clientes where id = $1", [m0.cliente_id])).rows[0]?.n : null;

      await modoAdmin(c);
      await c.query("delete from lineas_vale where movimiento_id = any($1)", [ids]);
      await c.query("delete from lineas_envase where movimiento_id = any($1)", [ids]);
      await c.query("delete from movimientos where origen_id = $1", [m0.id]);
      await c.query("delete from movimientos where id = $1", [m0.id]);

      const nombreTipo: Record<string, string> = {
        VALE_VENTA: "vale venta", VALE_CREDITO: "vale crédito", ABONO: "abono", INGRESO: "ingreso", EGRESO: "egreso",
        ENVASE_COBRO: "entrega de envases", ENVASE_DEVOLUCION: "devolución de envases",
      };
      const desc = `Borró ${nombreTipo[String(m0.tipo)] ?? m0.tipo} N°${m0.numero}${cli ? ` · ${cli}` : ""} · ${clp(m0.total)}${ligados.length ? ` (y ${ligados.length} pago${ligados.length > 1 ? "s" : ""} del mismo vale)` : ""} · motivo: ${motivo}`;
      // copia completa de lo borrado, para poder reconstruirlo si hiciera falta
      await anotarHistorial(c, a.tenant, a.quien, ipDe(req), [
        { tabla: "movimientos", registro_id: String(m0.id), accion: "BORRAR", descripcion: desc, cambios: { copia: [{ movimientos: todos, lineas, lineas_envase: envases }, null] } },
      ]);
      await c.query("insert into eventos (id, tenant_id, usuario, accion, entidad_id, detalle) values ($1, $2, $3, 'BORRAR_MOVIMIENTO', null, $4)", [
        randomUUID(), a.tenant, a.quien.nombre, desc,
      ]);
      return { borrados: ids.length };
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErrorUsuario) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
