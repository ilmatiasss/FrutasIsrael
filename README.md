# Frutas Israel · Cuentas y crédito

Boceto funcional del sistema de clientes, vales, créditos, abonos y cierre de caja para la bodega mayorista de frutas en **La Vega Central (Santiago)**. Reemplaza la planilla de Google Sheets. Es el piloto de un producto para otros locatarios: el modelo ya es multi-locatario (`tenant_id` en todo) y está listo para migrar a Supabase con RLS.

Sin boleta, factura, SII ni WhatsApp: solo clientes, ventas, créditos y deudas.

## Correr

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de producción
```

Los datos viven en el `localStorage` del navegador. Al abrir por primera vez se generan ~13 semanas de historia de ejemplo (28 clientes, vales hasta el N° 20307). En **··· → Ajustes** se pueden regenerar.

## Pantallas

| Atajo | Pantalla | Qué hace |
|---|---|---|
| `F1` | **Vale** (`/`) | Registro rápido: cliente → líneas → forma de pago → guardar. Correlativo automático, pizarra de precios del día y colillas de hoy. |
| `F2` | **Abono** (`/abono`) | Pago parcial o total. Muestra qué vales impagos quedan saldados (del más antiguo al más nuevo) mientras se escribe el monto. |
| `F3` | **Clientes** (`/clientes`) | Deuda a la fecha, estado Al día / Atrasado / Moroso (automático o fijado a mano), si sigue comprando. Ordenable y filtrable. |
| — | **Cuenta cliente** (`/clientes/[id]`) | **Agregar deuda** (`D`) sin productos: saldo anterior, préstamo o ajuste. Deuda vigente grande arriba; historial por mes y semana N° con columnas Vale crédito / Pago crédito / Vale venta y saldo acumulado; filtro por período. |
| `F4` | **Cierre de caja** (`/caja`) | **Diario:** totales del día por tipo y forma de pago, efectivo que debe haber en el cajón, detalle con N° de vale y cliente, egresos/ingresos. **Semanal** (lunes a domingo): solo con cuánta deuda quedó cada cliente y el total; se cierra y queda registrado. |
| `F6` | **Resumen** (`/resumen`) | La semana en palabras, ventas por semana, fiado en la calle, antigüedad de la deuda, los que más deben y productos. |
| | Importar planilla (`/importar`) | CSV de Google Sheets con vista previa, mapeo de columnas y validación por fila. |
| | Bitácora (`/bitacora`) | Registro append-only de todo lo que pasa. |

Además: `Ctrl+K` busca un cliente desde cualquier pantalla y `Alt+1…5` recorre las secciones. En el celular hay una barra inferior con las 5 secciones.

Para crear un cliente solo se pide el nombre; el alias, el teléfono, la deuda que ya trae y el tope de crédito son opcionales.

### Cargar un vale sin mouse

```
flaco ↵        → elige cliente (alias, nombre o feria; también iniciales)
5c             → 5 CAJAS y salta solo a producto   (c = caja, e = envase, k = kg)
pl ↵           → PINK LADY; el precio se sugiere con el último cobrado (a este cliente o general)
↵              → acepta el precio y abre la línea siguiente  (12k, 12 mil o 12 lucas = $12.000)
↵ (línea vacía) → pasa a forma de pago
c ↵            → CRÉDITO y guarda   (e = efectivo, t = transferencia; Ctrl+↵ guarda desde cualquier campo)
Esc Esc        → limpia el vale
```

**Vale solo monto** (sin productos): en la hoja del vale, pestaña «Solo monto» (`Alt+M`, o escribir `$` en Cant.). Queda solo cliente → monto → forma de pago; por defecto Crédito, así que sirve para fiar plata rápido. El detalle es opcional y el modo elegido se recuerda en ese PC.

Si el cliente está moroso o el vale lo pasa de su tope, aparece un aviso y pide confirmar guardando por segunda vez.

## Reglas que respeta

- Montos en CLP con separador de miles y sin decimales; las deudas van en rojo.
- **Nunca se borran movimientos.** Se anulan con motivo, usuario y hora (timbre ANULADO). En Supabase lo garantizan triggers (`supabase/schema.sql`).
- Las semanas son ISO (lunes a domingo), igual que `ISOWEEKNUM` en Sheets.
- El estado del cliente se calcula por días sin pagar (15 / 30 días por defecto, configurable) y se puede fijar a mano por cliente.

## Estructura

```
src/lib/types.ts      modelo de datos (espejo 1:1 de las tablas SQL)
src/lib/calc.ts       cálculos puros: saldos, FIFO de vales impagos, semáforo, libro por semana, cierre
src/lib/store.ts      única puerta de escritura (hoy localStorage; mañana Supabase)
src/lib/seed.ts       datos de ejemplo realistas y determinísticos
src/lib/csv.ts        importador de Google Sheets
src/lib/resumen.ts    cálculos del Resumen (semanas, antigüedad de la deuda, productos)
src/components/       pantallas y piezas del sistema visual «Talonario sobrio»
supabase/schema.sql   tablas, RLS multi-locatario, inmutabilidad, emitir_vale() atómico, vistas
docs/                 dirección visual, modelo de datos y lista para v2
```

Ver [`docs/modelo-datos.md`](docs/modelo-datos.md), [`docs/v2.md`](docs/v2.md) y [`docs/direccion-visual.md`](docs/direccion-visual.md).
