# Dirección visual

## Versión 4: Corporativo (la actual)

Pedido: un diseño más empresarial, menos "familiar".

| Regla | Cómo se aplica |
|---|---|
| Estructura de sistema de gestión | Barra lateral verde oscuro (`#14532D`) con el logo, los módulos y sus atajos; barra superior con búsqueda y estado de conexión. En celular: barra inferior y menú «Más». |
| Logo oficial | El círculo de la imagen del local (`public/logo.png`), también como ícono de la pestaña y en los encabezados impresos. |
| Tipografía | *Inter* en todo, pesos 400–650, cifras tabulares. |
| Colores | Grises fríos (`#F4F5F7` fondo, tarjetas blancas, bordes `#E5E7EB`), verde de marca para acciones, rojo `#B42318` solo para deuda, ámbar para atrasado. |
| Formas | Bordes de 6–8 px, botones rectangulares, etiquetas de estado tipo badge. |
| Íconos | De línea, monocromos, mismo grosor. Se quitaron las frutas ilustradas. |
| Lenguaje | Términos de gestión: Abonos, Remuneraciones, Reportes, Anticipo, Devengado, Saldo por pagar, Cartera. |
| Ayuda | Se mantiene la guía de 4 pasos por pantalla, en un panel sobrio («Ayuda»). |

## Versión 3: Huerto

Pedido: más intuitivo y didáctico, con el ambiente de las frutas y verduras.

| Regla | Cómo se aplica |
|---|---|
| Cada sección es una fruta | Vale = manzana roja, Abono = pera, Clientes = naranja, Caja = cajón, Sueldos = plátano, Resumen = uvas. Se repite en el inicio, el menú y el encabezado de cada pantalla, así se sabe dónde se está sin leer. |
| Inicio con botones grandes | La portada muestra las tareas en tarjetas grandes con una frase simple ("Recibir un pago de alguien que debe"), más cómo va el día y a quién cobrarle. |
| Guía en cada pantalla | «¿Cómo se usa?» con 4 pasos numerados. Aparece abierta la primera vez y luego se oculta. |
| Colores con significado | Verde hoja `#2F7D45` = acciones y "al día". Tomate `#D0402E` = deuda. Plátano `#D9A514` = aviso / atrasado. Fondo crema `#FBF7EE`, tarjetas blancas redondeadas. |
| Letras amables | Títulos en *Fraunces* suave (como letrero pintado de verdulería); texto en *Nunito*, redonda y muy legible, con cifras alineadas. |
| Campos que se ven | Cada campo es una caja clara con borde; al escribir se marca en verde. Los botones son redondos y grandes. |
| Imprimible | Hojas A4 limpias para el cierre: por partes o todo en una hoja. |

## Versión 2: Talonario sobrio

La primera versión de «Talonario y Cajón» tenía demasiados estímulos a la vez: colores de etiqueta en cada fila, timbres, pizarra, letra stencil en todos los títulos y animaciones en cada acción. Esta versión conserva la idea (la pantalla es el vale) y deja que el color solo signifique algo.

| Regla | Cómo se aplica |
|---|---|
| El color significa, no decora | **Rojo ladrillo** `#B4412F` = deuda / fiado. **Verde** `#4B7A37` = al día. **Ámbar** `#B8890F` = atrasado. **Azul tinta** `#2F5D8F` = lo que se puede tocar y lo que escribió la caja. Todo lo demás es grafito y gris. |
| Fondo tranquilo | Papel neutro `#F4F2ED`, hojas `#FCFBF8` con un borde fino. Sin textura ni sombras apiladas. |
| Una sola tipografía para leer | *IBM Plex Sans Condensed* para todo; *IBM Plex Mono* con cifras alineadas para los montos. La *Big Shoulders Stencil* (letra de cajón) queda solo en la marca. |
| Identidad mínima | La perforación del talonario solo en la hoja del vale y del abono; el N° de vale en rojo con la numeradora que rueda; la doble raya contable bajo los totales. |
| Movimiento solo cuando informa | Desaparecieron la hoja que se arranca y los timbres de celebración. Quedan: la numeradora, la deuda que baja al abonar, la colilla que se resalta al guardar y el timbre ANULADO (que sí es información). |
| Responsivo de verdad | Escritorio con pestañas; celular con barra inferior de 5 secciones; tablas que pasan a tarjetas bajo 1024 px; modales que suben desde abajo en el celular. |

## Resumen (tablero)

En vez de la grilla de tarjetas con indicadores, el Resumen se lee de arriba abajo como un informe:

1. **La semana en palabras:** ventas, contado y fiado, cobros, cuánto hay en la calle y cuánto cambió desde el domingo, y cuántos clientes están morosos.
2. **Ventas por semana:** columnas apiladas (contado / fiado), 13 semanas, con la semana en curso más clara.
3. **Fiado en la calle:** una sola línea, al cierre de cada semana.
4. **¿Desde cuándo se debe?:** la deuda separada por antigüedad de los vales impagos, en un solo tono que se oscurece con la edad.
5. **Los que más deben** y **Productos** de las últimas 4 semanas, con el precio del inicio y del final del período.

Los gráficos tienen una sola escala, grilla tenue y leyenda cuando hay dos series. Muestran el detalle al pasar el mouse o tocar, y cada uno tiene «Ver como tabla». La paleta de las series (azul `#3A6EA5` / ladrillo `#C2553F`) pasó el validador de daltonismo y contraste.

## Versión 1 (descartada): Talonario y Cajón

Papel crema con textura, colores de etiqueta de cajón por tipo de movimiento, letra stencil en títulos, timbres de goma, pizarra de precios en tiza y la hoja que se arrancaba al guardar. Se descartó por exceso de estímulos para quien atiende con clientes esperando.
