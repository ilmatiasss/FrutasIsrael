# Puesta en marcha con Neon

Quedan unos 15 minutos de trabajo. La app ya está lista: cuando ve una base vacía, crea las tablas sola.

## 1. Crear la base en Neon

1. Entra a <https://neon.tech> y crea una cuenta (el plan gratis alcanza para el piloto).
2. **Create project**:
   - Nombre: `frutas-israel`
   - Postgres: 16 o 17
   - Región: **AWS São Paulo (sa-east-1)**, la más cercana a Santiago.
3. En el panel del proyecto, presiona **Connect** y copia la connection string que dice **Pooled connection**. Se ve así:
   `postgresql://neondb_owner:...@ep-...-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require`

No hace falta crear tablas a mano. Si prefieres hacerlo igual, pega `db/schema.sql` en el **SQL Editor** de Neon.

## 2. Publicar la app en Vercel

1. Entra a <https://vercel.com> con la cuenta de GitHub y elige **Add New → Project → FrutasIsrael**.
2. En **Environment Variables** agrega estas tres (hay un ejemplo en `.env.example`):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la connection string de Neon |
| `CLAVE_ACCESO` | una **clave de instalación** de un solo uso: protege la página /instalar. Después de instalar no da acceso a nada |

3. Presiona **Deploy**. Al terminar, Vercel da un link del tipo `https://frutas-israel.vercel.app`.

## 3. Primera vez

1. Abre `https://…/instalar`. Ahí se completa:
   - la **clave de instalación** (la de `CLAVE_ACCESO`);
   - el nombre del local y el **N° del próximo vale** del talonario (por ejemplo 20308);
   - con qué datos parte: **de cero**, **lo que se cargó en este computador** o **datos de ejemplo**;
   - el **primer administrador** (usuario y contraseña del dueño);
   - la **clave del portal**, que usa todo el personal para entrar.
2. Presiona **Crear la base**. Entras como administrador. En **Cuentas y accesos** se crean los demás administradores (hasta 6) y se cambia la clave del portal cuando haga falta.

Para que **ni quien instaló** conserve acceso, sigue los pasos de [`docs/seguridad.md`](seguridad.md#lo-que-el-código-no-puede-impedir-importante): transferir las cuentas de Neon y Vercel, cambiar la contraseña de la base y la clave del portal.

Para traer el historial de la planilla, usa **··· → Importar planilla**.

## 4. En el local

- **PC de caja:** abre el link en Chrome y elige **⋮ → Guardar y compartir → Instalar página como app**. Así queda como un programa con ícono propio.
- **Celulares:** abre el mismo link. En el iPhone, **Compartir → Agregar a pantalla de inicio**.
- **Quién atiende:** se elige en **Ajustes** de cada equipo y queda registrado en cada vale.
- **Personal:** entra con la clave del portal (pestaña «Personal»). **Administradores:** pestaña «Administrador», con usuario y contraseña.
- **Si se corta internet:** se puede seguir trabajando. Arriba aparece «Sin internet · N por enviar» y los cambios se mandan solos cuando vuelve.
- **Dos cajas a la vez:** si dos equipos sacan el mismo N° de vale, el sistema le da el siguiente a uno de ellos y avisa en pantalla.

## Probar en un PC sin Vercel

```bash
cp .env.example .env.local   # y completa los datos
npm install
npm run dev                  # http://localhost:3000
```

Sin `DATABASE_URL` la app funciona en **modo prueba** (aviso amarillo arriba): los datos quedan solo en ese navegador.

## Respaldos

Neon guarda el historial de la base y permite volver a un momento anterior (**Branches → Restore**). Para una copia propia:

```bash
pg_dump "$DATABASE_URL" > respaldo-$(date +%F).sql
```
