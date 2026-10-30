# Modelo de datos

Fuente de verdad: [`src/lib/types.ts`](../src/lib/types.ts) (TypeScript) y [`db/schema.sql`](../db/schema.sql) (Postgres en Neon). Usan las mismas columnas, en snake_case. Los ids son texto (UUID generados en el equipo) para poder trabajar sin internet.

```
tenants ─┬─< usuarios
         ├─< clientes ──────┐
         ├─< productos ──┐  │
         ├─< movimientos ┼──┘ (cliente_id, null en ingresos/egresos)
         │      └─< lineas_vale >── productos
         ├─< cierres_caja
         ├─< cierres_semana
         ├─< trabajadores ─┬─< asistencias
         │                 └─< pagos_sueldo ──> movimientos (egreso, si salió del cajón)
         └─< eventos   (bitácora append-only)
```

## Tablas

**tenants** — un locatario (bodega). `ultimo_numero` es el correlativo de vales; también guarda los umbrales del semáforo.

**usuarios** — quién atiende (`DUENO` / `CAJA`); queda en cada vale como `creado_por`. El acceso al sistema es con la clave del local (`CLAVE_ACCESO`).

**trabajadores / asistencias / pagos_sueldo** — sueldos: modalidad (por día, semanal o mensual) y monto; los días trabajados; y cada pago, adelanto, bono o descuento. Un pago en efectivo que sale del cajón crea además un `EGRESO` en `movimientos`. Los pagos no se borran, se anulan (y anulan su egreso).

**clientes** — `nombre`, `alias` (como lo conocen: «EL FLACO»), `telefono`, `limite_credito` opcional, `semaforo_manual` (null = automático), `compra_manual` (null = automático), `notas`.

**productos** — `nombre` (FUJI, PINK LADY, VERDE, PERA, KIWI, NARANJA, MANCAQUI, CAJONES 3/4…), `codigo` de tipeo (FU, PL…), `unidad_default` (CAJA / ENVASE / KG), `color` de etiqueta. El precio **no** vive en el producto: cambia a diario y se escribe en cada línea.

**movimientos** — una hoja del talonario, la unidad contable.

| campo | nota |
|---|---|
| `numero` | correlativo único por tenant (N° de vale) |
| `tipo` | `VALE_VENTA` · `VALE_CREDITO` · `ABONO` · `INGRESO` · `EGRESO` |
| `forma_pago` | `EFECTIVO` · `TRANSFERENCIA` · `CREDITO` (solo vale crédito) |
| `total` | CLP enteros, siempre positivo; el signo lo da el tipo |
| `origen_id` | abono hecho en el mismo vale crédito («abona ahora») |
| `anulado_at / anulado_por / motivo_anulacion` | anulación auditable; nunca se borra |
| `importado` | vino del CSV de la planilla |

**Deuda sin productos** (saldo anterior, préstamo, ajuste): es un `VALE_CREDITO` sin líneas; la `glosa` es opcional (por defecto «Crédito sin detalle»). Lo mismo un vale venta «solo monto». Toma N° del talonario y se anula igual que cualquier vale.

**lineas_vale** — `cantidad` (decimal para KG), `unidad`, `producto_id`, `precio_unitario`, `subtotal`.

**cierres_caja** — fecha, quién cerró, cuándo, y `snapshot` de totales para detectar movimientos posteriores al cierre.

**cierres_semana** — lunes, domingo, quién cerró, `total` y `saldos` (deuda de cada cliente al domingo). Es lo que muestra el cierre semanal.

**eventos** — bitácora: crear/anular movimiento, crear/editar cliente, cerrar caja, importar.

## Lo que se calcula (no se guarda)

| dato | regla |
|---|---|
| Deuda | Σ vale crédito − Σ abonos, sin anulados |
| Vales impagos | abonos aplicados FIFO sobre los vales crédito |
| Días sin pagar | desde el último abono; si nunca pagó, desde el vale impago más antiguo |
| Semáforo | VERDE < 15 días ≤ AMARILLO < 30 días ≤ ROJO (configurable); `semaforo_manual` lo pisa |
| ¿Sigue comprando? | compró en los últimos 21 días; `compra_manual` lo pisa |
| Último precio | última línea viva del producto en la misma unidad (general y para ese cliente) |
| Efectivo en caja | ventas + abonos + ingresos en efectivo − egresos en efectivo |

En Postgres: vistas `v_saldos_clientes` y `v_caja_diaria`, para consultar directo en el SQL Editor de Neon.

## Garantías en la base

- Sin `DELETE` en movimientos, líneas ni eventos (trigger `prohibir_borrado`).
- `UPDATE` de un movimiento solo puede anularlo, con motivo obligatorio, y lo anota en la bitácora (trigger `solo_anular`).
- El servidor filtra todo por `tenant_id` y solo acepta tablas y columnas de una lista blanca (`src/lib/server/tablas.ts`).
- El N° de vale lo confirma el servidor dentro de una transacción con la fila del locatario bloqueada: si dos cajas usan el mismo, a una se le asigna el siguiente.

## Migración desde la planilla

`/importar` acepta el CSV de Google Sheets en dos formas:

1. Columna TIPO + columna MONTO.
2. Columnas VALE CRÉDITO / PAGO CRÉDITO / VALE VENTA, como la cuenta cliente de la planilla.

Detecta las columnas por nombre (editable), valida fila por fila (fecha, tipo, monto, cliente), empareja clientes por alias o nombre y crea los que no existan. Respeta el N° de vale de la planilla si no choca con uno existente. Todo queda marcado como `importado`. Para clientes con años de historia conviene importar solo el **saldo arrastrado** a una fecha de corte y las últimas semanas en detalle.
