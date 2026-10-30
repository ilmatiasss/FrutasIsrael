# Dirección visual

Se propusieron dos direcciones inspiradas en La Vega:

- **A · Pizarra de Precios:** fondo verde pizarra, letra de tiza, colores de tiza por tipo de movimiento. Mucha personalidad, pero cansa la vista en jornadas largas, se lee peor con luz de día y la letra de tiza no sirve para tablas densas.
- **B · Talonario y Cajón (elegida):** la pantalla es el talonario de vales que ya usan, con colores de etiquetas de cajón.

## Lo que se construyó (B + el letrero de pizarra)

| Elemento | Decisión |
|---|---|
| Fondo | Papel crema `#F3ECD9` con grano; hojas `#FBF7EC` con hojas apiladas debajo (sombra escalonada) y perforación de talonario. |
| Tinta | Azul calco `#1F3C8F` para lo escrito por la caja; grafito `#26221D` para el texto impreso. |
| Colores de cajón | Rojo Fuji `#C4262E` (deuda, crédito, moroso) · verde pera `#4F7F2A` (al día, venta, abono) · amarillo limón `#E6C238` (atrasado) · naranjo `#DD7420` (egresos, vale) · kraft `#8A6A3D`. |
| Tipografía | *Big Shoulders Stencil* (letra de cajón) en títulos · *IBM Plex Sans Condensed* para datos densos · *IBM Plex Mono* con cifras tabulares para montos · *Caveat* solo en la pizarra y en notas a mano. |
| Pizarra | Un solo lugar: «Precios de hoy» (último precio cobrado por producto, ▲▼ vs. día anterior) y la sugerencia de precio junto al campo. Es donde la pizarra existe de verdad en la feria. |

## Microinteracciones con función

- **Numeradora:** el N° de vale rueda dígito a dígito al avanzar el correlativo.
- **Arrancar la hoja:** al guardar, el vale se desprende por la perforación y queda la colilla en «Colillas de hoy» (resaltada).
- **Resaltador:** el campo con foco se pinta con una pasada de destacador amarillo.
- **Timbres de goma:** ANULADO, PAGADO, ¡AL DÍA!, CERRADO, ¡OJO! MOROSO — con tinta gastada, caen con un golpe.
- **Deuda que corre:** en el abono, la deuda vigente baja contando hasta el nuevo saldo; los vales impagos se timbran PAGADO en vivo mientras se escribe el monto.
- **Doble raya contable** bajo cada total, como en el libro.
- **Boleta térmica** con borde dentado para el cierre de caja (también imprimible).
