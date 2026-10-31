# Frutas Israel · Cuentas, crédito y sueldos

Sistema de clientes, vales, créditos, abonos, sueldos y cierre de caja para la bodega mayorista de frutas en **La Vega Central (Santiago)**. Reemplaza la planilla de Google Sheets.

Sin boleta, factura, SII ni WhatsApp: solo clientes, ventas, créditos, deudas y sueldos.

- **Base de datos:** Postgres en **Neon**. Ver [`docs/puesta-en-marcha.md`](docs/puesta-en-marcha.md).
- **Sin base configurada:** funciona en **modo prueba**, con datos de ejemplo guardados solo en el navegador.

## Correr

```bash
npm install
cp .env.example .env.local   # opcional: DATABASE_URL de Neon y CLAVE_ACCESO
npm run dev                  # http://localhost:3000
npm run build                # build de producción
```

## Pantallas

Diseño corporativo: barra lateral con el logo del local, íconos de línea y tipografía Inter. Cada pantalla tiene una frase que explica para qué sirve y un botón **«Ayuda»** con los pasos; la guía aparece abierta la primera vez.

| Atajo | Pantalla | Qué hace |
|---|---|---|
| | **Inicio** (`/`) | Indicadores del día, accesos a los módulos y cobranza pendiente. |
| `F1` | **Vale** (`/vale`) | Anotar una venta, con productos o **solo monto**: al contado o fiada. Número correlativo automático. |
| `F2` | **Abonos** (`/abono`) | Recibir un pago total o parcial. Muestra qué vales quedan pagados. |
| `F3` | **Clientes** (`/clientes`) | Quién debe, cuánto y desde cuándo. Estado Al día / Atrasado / Moroso. **Imprimir deudores**: listado completo de clientes con deuda (respeta el filtro de estado), con teléfono, último pago, días y saldo; también en `/imprimir/deudores`. Cada cliente tiene su **cuenta** con historial por mes y semana, **Agregar deuda**, abonar y nuevo vale. |
| `F4` | **Cierre de caja** (`/caja`) | Ver detalle abajo. |
| `F7` | **Remuneraciones** (`/sueldos`) | Trabajadores por día, semana o mes: asistencia, anticipos, bonos, descuentos, pagos y lo que falta pagar. Si el pago sale del cajón, queda como egreso en el cierre. |
| `F6` | **Reportes** (`/resumen`) | La semana en palabras, ventas por semana, fiado en la calle, antigüedad de la deuda, los que más deben y productos. |

**Cierre de caja (`F4`):**
- **Diario:** totales por tipo y forma de pago, y el efectivo que debe haber en el cajón.
- **Semanal** (lunes a domingo): solo con cuánta deuda quedó cada cliente.
- **Impresión:** cada parte tiene su botón **Imprimir** y hay uno para **imprimir todo en una hoja** (A4). En la ventana de impresión se puede elegir «Guardar como PDF».

También hay **Importar planilla** (CSV de Google Sheets), **Bitácora** y **Ajustes** en el menú «···».

### Cargar un vale sin mouse

```
flaco ↵         → elige cliente (alias o nombre)
5c              → 5 CAJAS y salta a producto   (c = caja, e = envase, k = kg)
pl ↵            → PINK LADY; el precio se sugiere con el último cobrado
↵               → acepta el precio y abre otra línea   (12k, 12 mil o 12 lucas = $12.000)
↵ (línea vacía) → forma de pago
c ↵             → CRÉDITO y guarda   (e = efectivo, t = transferencia; Ctrl+↵ guarda desde cualquier campo)
```

**Solo monto:** pestaña «Solo monto» (`Alt+M`, o escribir `$` en Cant.). El flujo queda en cliente → monto → Enter → Enter, con Crédito por defecto.

## Reglas

- Montos en CLP con separador de miles, sin decimales. Las deudas van en rojo.
- **Nunca se borran movimientos ni pagos de sueldo:** se anulan con motivo, usuario y hora. En Postgres lo aseguran triggers (`db/schema.sql`).
- Semanas ISO, de lunes a domingo.
- El estado del cliente se calcula por días sin pagar: 15 días = atrasado, 30 = moroso. Se puede cambiar en Ajustes o fijar a mano por cliente.

## Cómo se guardan los datos

- `src/lib/store.ts` es la única puerta de escritura. Cada cambio se calcula como diferencia (filas nuevas o modificadas) y se envía a `POST /api/cambios`.
- Si no hay internet, los cambios esperan en una cola guardada en el PC y se envían solos al volver.
- El **N° de vale** lo confirma el servidor: si dos cajas usan el mismo, a una se le asigna el siguiente y se avisa en pantalla.
- Acceso con una **clave del local** (`CLAVE_ACCESO`). La sesión dura 60 días por equipo.

```
db/schema.sql           tablas Postgres (Neon), triggers de inmutabilidad, vistas
src/app/api/            datos (leer todo), cambios (guardar), instalar, sesion
src/lib/server/         conexión a Postgres y lógica de escritura del servidor
src/lib/types.ts        modelo de datos (mismas columnas que las tablas)
src/lib/calc.ts         saldos, vales impagos, estado del cliente, libro por semana, cierre
src/lib/sueldos.ts      lo que le corresponde a cada trabajador y lo que falta
src/lib/resumen.ts      cálculos del Resumen
src/components/         pantallas
docs/                   puesta en marcha, modelo de datos, diseño, pendientes v2
```
