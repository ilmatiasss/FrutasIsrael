/**
 * Verificación de datos: cruza la información entre módulos para detectar
 * descuadres (vales vs líneas, abonos vs vales, sueldos vs caja, cierres vs
 * movimientos, cartera vs cuentas de clientes). No modifica nada.
 */
import type { Db } from "./types";
import { efectoDeuda, estadoCliente, indexar, resumenCaja, saldosAl, vivo } from "./calc";
import { clp, hoy } from "./format";

export interface Chequeo {
  titulo: string;
  estado: "ok" | "aviso" | "error";
  detalle: string;
  items?: string[];
}

export function verificar(db: Db): Chequeo[] {
  const idx = indexar(db);
  const h = hoy();
  const out: Chequeo[] = [];
  const max = (xs: string[]) => xs.slice(0, 8);

  // 1. numeración del talonario
  const nums = db.movimientos.map((m) => m.numero);
  const vistos = new Set<number>();
  const dup = nums.filter((n) => (vistos.has(n) ? true : (vistos.add(n), false)));
  const mayor = Math.max(0, ...nums);
  out.push(
    dup.length
      ? { titulo: "Folios de vales únicos", estado: "error", detalle: `${dup.length} números repetidos.`, items: max(dup.map((n) => `N°${n}`)) }
      : mayor > db.tenant.ultimo_numero
        ? { titulo: "Folios de vales únicos", estado: "error", detalle: `El correlativo (${db.tenant.ultimo_numero}) es menor que el último folio usado (${mayor}).` }
        : { titulo: "Folios de vales únicos", estado: "ok", detalle: `${nums.length} folios sin repetir; próximo N°${db.tenant.ultimo_numero + 1}.` },
  );

  // 2. total de cada vale = suma de sus líneas
  const malos = db.movimientos.filter((m) => {
    const ls = idx.lineasMov.get(m.id);
    if (!ls?.length) return false;
    return ls.reduce((a, l) => a + l.subtotal, 0) !== m.total || ls.some((l) => Math.round(l.cantidad * l.precio_unitario) !== l.subtotal);
  });
  out.push(
    malos.length
      ? { titulo: "Total de vales = suma de líneas", estado: "error", detalle: `${malos.length} vales no cuadran con su detalle.`, items: max(malos.map((m) => `N°${m.numero}`)) }
      : { titulo: "Total de vales = suma de líneas", estado: "ok", detalle: "Todos los vales cuadran con su detalle." },
  );

  // 3. referencias rotas
  const rotos = [
    ...db.movimientos.filter((m) => m.cliente_id && !idx.cliente.has(m.cliente_id)).map((m) => `N°${m.numero}: cliente inexistente`),
    ...db.lineas.filter((l) => !idx.producto.has(l.producto_id)).map((l) => `Línea de N°${idx.mov.get(l.movimiento_id)?.numero}: producto inexistente`),
    ...db.lineas.filter((l) => !idx.mov.has(l.movimiento_id)).map(() => "Línea sin vale"),
    ...db.pagos_sueldo.filter((p) => !db.trabajadores.some((t) => t.id === p.trabajador_id)).map(() => "Pago de sueldo sin trabajador"),
  ];
  out.push(
    rotos.length
      ? { titulo: "Referencias entre registros", estado: "error", detalle: `${rotos.length} registros apuntan a algo que no existe.`, items: max(rotos) }
      : { titulo: "Referencias entre registros", estado: "ok", detalle: "Clientes, productos, vales y trabajadores enlazados correctamente." },
  );

  // 4. abonos hechos en el mismo vale vs su vale de origen
  const huerfanos = db.movimientos.filter((m) => m.origen_id && vivo(m) && !vivo(idx.mov.get(m.origen_id) ?? m));
  out.push(
    huerfanos.length
      ? { titulo: "Abonos en vales anulados", estado: "error", detalle: `${huerfanos.length} abonos siguen vigentes aunque su vale fue anulado.`, items: max(huerfanos.map((m) => `Abono N°${m.numero}`)) }
      : { titulo: "Abonos en vales anulados", estado: "ok", detalle: "Ningún abono depende de un vale anulado." },
  );

  // 5. sueldos pagados desde caja = egresos de caja
  const descuadres: string[] = [];
  for (const p of db.pagos_sueldo) {
    if (!p.movimiento_id) continue;
    const e = idx.mov.get(p.movimiento_id);
    const t = db.trabajadores.find((x) => x.id === p.trabajador_id)?.nombre ?? "?";
    if (!e) descuadres.push(`${t}: egreso inexistente`);
    else if (!!p.anulado_at !== !!e.anulado_at) descuadres.push(`${t}: pago ${p.anulado_at ? "anulado" : "vigente"} y egreso N°${e.numero} ${e.anulado_at ? "anulado" : "vigente"}`);
    else if (e.total !== p.monto) descuadres.push(`${t}: pago ${clp(p.monto)} ≠ egreso ${clp(e.total)}`);
  }
  out.push(
    descuadres.length
      ? { titulo: "Remuneraciones vs egresos de caja", estado: "error", detalle: `${descuadres.length} pagos no cuadran con su egreso.`, items: max(descuadres) }
      : { titulo: "Remuneraciones vs egresos de caja", estado: "ok", detalle: "Cada pago en efectivo desde caja tiene su egreso por el mismo monto." },
  );

  // 6. cartera: suma de cuentas de clientes = créditos − abonos (y = cierre semanal de hoy)
  const porCuentas = db.clientes.reduce((a, c) => a + estadoCliente(c, idx, db.config, h).saldo, 0);
  const porMovs = db.movimientos.reduce((a, m) => a + efectoDeuda(m), 0);
  const deudores = db.clientes.reduce((a, c) => a + Math.max(0, estadoCliente(c, idx, db.config, h).saldo), 0);
  const semanal = saldosAl(db.movimientos, h).reduce((a, s) => a + s.saldo, 0);
  if (deudores !== semanal)
    out.push({ titulo: "Fiado en la calle: Clientes = Cierre semanal", estado: "error", detalle: `Clientes ${clp(deudores)} vs cierre semanal ${clp(semanal)}.` });
  else out.push({ titulo: "Fiado en la calle: Clientes = Cierre semanal", estado: "ok", detalle: `Ambos muestran ${clp(deudores)}.` });
  out.push(
    porCuentas === porMovs
      ? { titulo: "Cartera = suma de cuentas de clientes", estado: "ok", detalle: `Cartera neta ${clp(porMovs)}.` }
      : { titulo: "Cartera = suma de cuentas de clientes", estado: "error", detalle: `Cuentas suman ${clp(porCuentas)} y movimientos ${clp(porMovs)}.` },
  );

  // 7. cierres de caja que cambiaron después de cerrar
  const ultimoCierre = new Map<string, (typeof db.cierres)[number]>();
  for (const c of db.cierres) if (!ultimoCierre.has(c.fecha) || c.cerrado_at > ultimoCierre.get(c.fecha)!.cerrado_at) ultimoCierre.set(c.fecha, c);
  const cambiados: string[] = [];
  ultimoCierre.forEach((c, fecha) => {
    const r = resumenCaja(idx.movsFecha.get(fecha) ?? []);
    if (r.efectivo_esperado !== c.snapshot.efectivo_esperado) cambiados.push(`${fecha}: cerrado con ${clp(c.snapshot.efectivo_esperado)}, hoy ${clp(r.efectivo_esperado)}`);
  });
  out.push(
    cambiados.length
      ? { titulo: "Cierres de caja sin cambios posteriores", estado: "aviso", detalle: `${cambiados.length} días cambiaron después del cierre (anulaciones o vales con fecha atrasada).`, items: max(cambiados) }
      : { titulo: "Cierres de caja sin cambios posteriores", estado: "ok", detalle: `${ultimoCierre.size} cierres coinciden con los movimientos.` },
  );

  // 8. cierres semanales
  const semCambiados = db.cierres_semana.filter((c) => saldosAl(db.movimientos, c.domingo).reduce((a, s) => a + s.saldo, 0) !== c.total);
  out.push(
    semCambiados.length
      ? { titulo: "Cierres semanales sin cambios posteriores", estado: "aviso", detalle: `${semCambiados.length} semanas cambiaron después de cerrarlas.`, items: max(semCambiados.map((c) => `Semana del ${c.lunes}`)) }
      : { titulo: "Cierres semanales sin cambios posteriores", estado: "ok", detalle: `${db.cierres_semana.length} cierres semanales coinciden.` },
  );

  // 9. fechas futuras
  const futuros = db.movimientos.filter((m) => m.fecha > h);
  out.push(
    futuros.length
      ? { titulo: "Fechas válidas", estado: "error", detalle: `${futuros.length} movimientos con fecha futura.`, items: max(futuros.map((m) => `N°${m.numero} (${m.fecha})`)) }
      : { titulo: "Fechas válidas", estado: "ok", detalle: "No hay movimientos con fecha futura." },
  );

  // 10. saldos a favor (informativo)
  const aFavor = db.clientes.map((c) => estadoCliente(c, idx, db.config, h)).filter((e) => e.saldo < 0);
  out.push(
    aFavor.length
      ? { titulo: "Clientes con saldo a favor", estado: "aviso", detalle: `${aFavor.length} clientes pagaron de más.`, items: max(aFavor.map((e) => `${e.cliente.alias ?? e.cliente.nombre}: ${clp(-e.saldo)}`)) }
      : { titulo: "Clientes con saldo a favor", estado: "ok", detalle: "Ningún cliente pagó de más." },
  );

  return out;
}
