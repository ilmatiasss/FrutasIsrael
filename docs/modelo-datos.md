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

**usuarios** — el personal (`DUENO` / `CAJA`), con `activo` y `pin_hash` opcional. Cada sesión va a nombre de una persona; el servidor la pone en `creado_por`, `anulado_por` y `cerrado_por`.

**historial** — lo escribe solo el servidor: `at`, `usuario` (y `usuario_tipo` ADMIN / PERSONAL), `ip`, `tabla`, `registro_id`, `accion` (CREAR · MODIFICAR · ANULAR · BORRAR · ENTRAR · SALIR · SEGURIDAD), `descripcion` y `cambios` (`{campo: [antes, después]}`). No se edita ni se borra (trigger).

**trabajadores / asistencias / pagos_sueldo** — sueldos: modalidad (por día, semanal o mensual) y monto; los días trabajados; y cada pago, adelanto, bono o descuento. Un pago en efectivo que sale del cajón crea además un `EGRESO` en `movimientos`. Los pagos no se borran, se anulan (y anulan su egreso).

**clientes** — `nombre`, `alias` (como lo conocen: «EL FLACO»), `telefono`, `limite_credito` opcional, `semaforo_manual` (null = automático), `compra_manual` (null = automático), `notas`.

**productos** — `nombre` (FUJI, PINK LADY, VERDE, PERA, KIWI, NARANJA, MANCAQUI, CAJONES 3/4…), `codigo` de tipeo (FU, PL…), `unidad_default` (CAJA / ENVASE / KG), `color` de etiqueta. El precio **no** vive en el producto: cambia a diario y se escribe en cada línea.

**movimientos** — una hoja del talonario, la unidad contable.

| campo | nota |
|---|---|
| `numero` | correlativo único por tenant (N° de vale); se puede escribir a mano o corregir después (bitácora `CORREGIR_FOLIO`) |
| `tipo` | `VALE_VENTA` · `VALE_CREDITO` · `ABONO` · `INGRESO` · `EGRESO` · `ENVASE_COBRO` · `ENVASE_DEVOLUCION` |
| `forma_pago` | `EFECTIVO` · `TRANSFERENCIA` · `TARJETA` · `CREDITO` (vale crédito y envases) |
| `categoria` | egresos: categoría del gasto de bodega |
| `total` | CLP enteros, siempre positivo; el signo lo da el tipo |
| `origen_id` | abono hecho en el mismo vale crédito («abona ahora») |
| `anulado_at / anulado_por / motivo_anulacion` | anulación auditable; nunca se borra |
| `importado` | vino del CSV de la planilla |

**Deuda sin productos** (saldo anterior, préstamo, ajuste): es un `VALE_CREDITO` sin líneas; la `glosa` es opcional (por defecto «Crédito sin detalle»). Lo mismo un vale venta «solo monto». Toma N° del talonario y se anula igual que cualquier vale.

**envases** — catálogo: `nombre` (Caja cosechera, Bins plástico, Cajón de madera, Toro, Totem…), `precio` de garantía, `activo`, `orden`. Se edita en «Precios de envases» (pantalla Envases); cada cambio queda en la bitácora (`PRECIO_ENVASE`). La tabla `migraciones` registra los ajustes de datos que corren una sola vez (ej. Pallet → Toro).

**lineas_envase** — detalle de una entrega o devolución: `envase_id`, `cantidad`, `precio_unitario`, `subtotal`. Inmutables como las líneas de vale.

**Envases (garantía):** `ENVASE_COBRO` = el cliente se lleva envases y paga la garantía; en efectivo entra al cajón, con `CREDITO` suma a su deuda. `ENVASE_DEVOLUCION` = devuelve envases y se le paga; en efectivo sale del cajón, con `CREDITO` se descuenta de su deuda.

**Pago combinado:** el vale queda como `VALE_CREDITO` por el total y cada parte pagada (efectivo, transferencia, tarjeta) es un `ABONO` con `origen_id` = el vale. Lo que va a crédito queda como deuda. En el cierre esas partes van en la fila del vale (no como cobro de deuda) y «Fiado nuevo» es solo lo que quedó debiendo.

**cierres_caja.snapshot.arqueo** — `{cantidades: {denominación: n}, contado, esperado, diferencia}`.

**lineas_vale** — `cantidad` (decimal para KG), `unidad`, `producto_id`, `precio_unitario`, `subtotal`.

**cierres_caja** — fecha, quién cerró, cuándo, y `snapshot` de totales para detectar movimientos posteriores al cierre.

**cierres_semana** — lunes, domingo, quién cerró, `total` y `saldos` (deuda de cada cliente al domingo). Es lo que muestra el cierre semanal.

**eventos** — bitácora: crear/anular movimiento, crear/editar cliente, cerrar caja, importar.

## Lo que se calcula (no se guarda)

| dato | regla |
|---|---|
| Deuda | Σ vale crédito − Σ abonos ± envases a cuenta, sin anulados |
| Envases en su poder | Σ entregados − Σ devueltos por tipo; garantía = cantidad × precio cobrado |
| Vales impagos | abonos aplicados FIFO sobre los vales crédito |
| Días sin pagar | desde el último abono; si nunca pagó, desde el vale impago más antiguo |
| Semáforo | VERDE < 15 días ≤ AMARILLO < 30 días ≤ ROJO (configurable); `semaforo_manual` lo pisa |
| ¿Sigue comprando? | compró en los últimos 21 días; `compra_manual` lo pisa |
| Último precio | última línea viva del producto en la misma unidad (general y para ese cliente) |
| Efectivo en caja | ventas + abonos + ingresos + garantías cobradas en efectivo − egresos − garantías devueltas en efectivo |

En Postgres: vistas `v_saldos_clientes`, `v_caja_diaria` y `v_envases_clientes`, para consultar directo en el SQL Editor de Neon.

## Garantías en la base

- Sin `DELETE` en movimientos, líneas ni eventos (trigger `prohibir_borrado`).
- `UPDATE` de un movimiento solo puede anularlo (motivo obligatorio) o corregir su N°; tipo, fecha, cliente, forma de pago y total no cambian (trigger `solo_anular`).
- **Excepción, solo administradores:** desde el detalle de un vale pueden editarlo (N°, fecha, cliente, forma de pago, productos o monto, detalle) o borrar un movimiento. Lo hace el servidor (`/api/admin/movimientos`) en una transacción que activa `frutas.edicion_admin`; exige motivo y deja en `historial` el antes y el después (al borrar, copia completa del movimiento y sus líneas). Fuera de eso, la base sigue sin permitir editar ni borrar.
- El servidor filtra todo por `tenant_id` y solo acepta tablas y columnas de una lista blanca (`src/lib/server/tablas.ts`).
- El N° de vale lo confirma el servidor dentro de una transacción con la fila del locatario bloqueada: si dos cajas usan el mismo, a una se le asigna el siguiente.

## Migración desde la planilla

`/importar` acepta el CSV de Google Sheets en dos formas:

1. Columna TIPO + columna MONTO.
2. Columnas VALE CRÉDITO / PAGO CRÉDITO / VALE VENTA, como la cuenta cliente de la planilla.

Detecta las columnas por nombre (editable), valida fila por fila (fecha, tipo, monto, cliente), empareja clientes por alias o nombre y crea los que no existan. Respeta el N° de vale de la planilla si no choca con uno existente. Todo queda marcado como `importado`. Para clientes con años de historia conviene importar solo el **saldo arrastrado** a una fecha de corte y las últimas semanas en detalle.
