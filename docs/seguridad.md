# Seguridad y verificación de datos

## Cómo se entra

| Quién | Cómo entra | Qué puede hacer |
|---|---|---|
| **Personal** (caja, vendedores) | Clave global del portal | Vales, abonos, clientes, cierre de caja, remuneraciones, reportes |
| **Administradores** (hasta 6 activos) | Usuario + contraseña propios | Todo lo anterior, más: crear y desactivar administradores, asignar contraseñas, cambiar la clave del portal, importar planillas, ver la bitácora y la verificación de datos |

- Las claves se guardan **cifradas con scrypt** (no se pueden leer, ni siquiera mirando la base).
- Las sesiones van firmadas con un **secreto aleatorio que se crea al instalar y vive solo en la base**. Ni las variables de Vercel ni el código fuente permiten fabricar una sesión.
- **Cambiar la clave del portal** cierra al instante la sesión de todos los equipos del personal. Los administradores siguen dentro.
- **Desactivar a un administrador** o cambiarle la contraseña invalida su sesión al instante.
- **Siempre queda al menos un administrador activo:** el sistema no deja desactivar al último.
- `CLAVE_ACCESO` (en Vercel) solo sirve para **instalar** una vez. Después no da acceso a nada.

## Revisión (31-10-2026): qué se encontró y qué se hizo

| # | Hallazgo | Riesgo | Corrección |
|---|---|---|---|
| 1 | La clave estaba en las variables de Vercel | Quien administre Vercel entraba siempre; cambiarla obligaba a volver a publicar | Clave del portal y administradores en la base, cifrados, y se cambian desde la app |
| 2 | Sesión = firma fija de la clave, sin vencimiento real | Una cookie copiada servía para siempre; cerrar sesión no la invalidaba | Tokens firmados con vencimiento (60 días personal, 12 h administrador), versión de la clave y huella de la contraseña |
| 3 | Firma con `SESION_SECRETO` de Vercel | Quien viera esa variable podía falsificar sesiones | Secreto aleatorio que se genera al instalar y queda solo en la base |
| 4 | Sin límite de intentos | Se podía probar la clave sin parar | 8 fallos en 15 min por IP o por usuario = 15 min de bloqueo; cada intento queda registrado |
| 5 | Instalación abierta si no había clave | El primero en abrir /instalar se quedaba con el sistema | Pide la clave de instalación; solo funciona una vez (en una sola operación atómica) |
| 6 | Copia de los datos en el navegador | Quedaba en el equipo después de cerrar sesión | «Cerrar sesión» borra la copia local (no cierra si hay cambios sin enviar) |
| 7 | Sin cabeceras de protección | La app podía incrustarse en otro sitio (clickjacking) | `X-Frame-Options`, CSP `frame-ancestors`, `nosniff`, HSTS, `Referrer-Policy`; se oculta `X-Powered-By` |
| 8 | Peticiones desde otros sitios | Riesgo de CSRF | Cookies `SameSite=Lax` + verificación de `Origin` en todo lo que escribe |
| 9 | La bitácora de seguridad la podía escribir el navegador | Se podían falsificar entradas de seguridad | Las entradas de seguridad solo las escribe el servidor |
| 10 | Importar y Bitácora a la vista de todos | Información sensible | Solo para administradores |

Estas son pruebas automáticas que se corrieron contra Postgres (todas pasan):
- API y páginas sin sesión: rechazadas.
- Clave de Vercel después de instalar: no sirve.
- Reinstalar para tomar control: rechazado.
- Cookies falsificadas: rechazadas.
- Personal: no puede crear administradores ni cambiar claves.
- Cambio de clave del portal: cierra las sesiones.
- Administrador desactivado: pierde el acceso.
- Último administrador: no se puede desactivar.
- CSRF: rechazado.
- Fuerza bruta: bloqueada.
- Cabeceras de seguridad: presentes.
- En la base no aparece ninguna clave legible.

## Lo que el código NO puede impedir (importante)

Quien sea **dueño de las cuentas de Neon, Vercel o GitHub** siempre puede llegar a los datos o cambiar el código. Para que **ni el desarrollador** tenga acceso:

1. Crear las cuentas de Neon y Vercel **a nombre del negocio** (correo del dueño), o transferir los proyectos (Neon: *Settings → Transfer project*; Vercel: *Settings → Transfer*).
2. Sacar al desarrollador de esos equipos y del repositorio de GitHub (o transferir el repositorio).
3. En Neon, **cambiar la contraseña de la base** (*Roles → Reset password*) y actualizar `DATABASE_URL` en Vercel.
4. Ingresar como administrador y **cambiar la clave del portal**. Si el desarrollador creó o conoció alguna cuenta, **desactivarla**.

Hecho eso, las claves existen solo en la cabeza de los administradores.

## Pendiente para una versión siguiente

- Una cuenta por persona del personal (hoy el personal comparte la clave del portal y el «quién atiende» lo elige cada equipo).
- Permisos finos en el servidor por acción. Hoy, quien tiene la clave del portal puede escribir cualquier dato operativo por la API. Importar y Bitácora se restringen en pantalla, pero no en el servidor.

## Verificación de datos (cruces de información)

En **Administración → Cuentas y accesos → Verificación de datos** se cruzan los módulos:

- **Folios de vales:** únicos, y el correlativo siempre por delante del último usado.
- **Vales:** el total de cada vale es igual a la suma de sus líneas.
- **Referencias:** clientes, productos, vales y trabajadores existen.
- **Abonos:** no hay abonos vigentes que dependan de vales anulados.
- **Remuneraciones:** cada pago en efectivo desde caja tiene un egreso por el mismo monto y en el mismo estado.
- **Fiado en la calle:** igual en Clientes, Inicio, Reportes y Cierre semanal.
- **Cartera:** la suma de las cuentas de clientes es igual a créditos menos abonos.
- **Cierres:** los cierres diarios y semanales no cambiaron después de cerrarse (si cambiaron, avisa).
- **Fechas:** no hay movimientos con fecha futura.
- **Saldo a favor:** muestra los clientes que pagaron de más.

En esta revisión los cruces encontraron dos cosas, ya corregidas:

- **Reportes y Clientes daban montos distintos** de «fiado en la calle». Reportes restaba los saldos a favor; ahora se usa el mismo criterio en todos lados.
- **Al anular un vale crédito ya pagado**, el cliente quedaba con saldo a favor sin aviso. Ahora se advierte antes de anular.
