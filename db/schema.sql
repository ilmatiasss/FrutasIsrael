-- =============================================================================
-- Frutas Israel · esquema Postgres (Neon)
-- Multi-locatario: todas las tablas llevan tenant_id. El servidor de la app
-- filtra siempre por el tenant de la sesión.
-- Regla de negocio: los movimientos y la bitácora NUNCA se borran; los
-- movimientos solo se anulan (con motivo, usuario y hora).
--
-- Se puede ejecutar varias veces: todo usa "if not exists".
-- La app lo corre sola desde /instalar; también se puede pegar en el
-- SQL Editor de Neon.
-- =============================================================================

create table if not exists tenants (
  id            text primary key,
  nombre        text not null,
  ubicacion     text not null default '',
  ultimo_numero bigint not null default 0,          -- correlativo de vales
  config        jsonb not null default '{}'::jsonb, -- umbrales del semáforo, etc.
  created_at    timestamptz not null default now()
);

create table if not exists usuarios (
  id        text primary key,
  tenant_id text not null references tenants(id),
  nombre    text not null,
  rol       text not null check (rol in ('DUENO', 'CAJA'))
);

create table if not exists clientes (
  id              text primary key,
  tenant_id       text not null references tenants(id),
  nombre          text not null,
  alias           text,
  telefono        text,
  limite_credito  bigint check (limite_credito is null or limite_credito >= 0),
  semaforo_manual text check (semaforo_manual in ('VERDE', 'AMARILLO', 'ROJO')),
  compra_manual   boolean,
  notas           text,
  created_at      timestamptz not null default now()
);
create index if not exists clientes_tenant_idx on clientes (tenant_id);

create table if not exists productos (
  id             text primary key,
  tenant_id      text not null references tenants(id),
  nombre         text not null,
  codigo         text not null,
  unidad_default text not null check (unidad_default in ('CAJA', 'ENVASE', 'KG')),
  color          text not null default '#8a7350',
  activo         boolean not null default true
);
create index if not exists productos_tenant_idx on productos (tenant_id);

-- una hoja del talonario: vale venta, vale crédito, abono, ingreso o egreso
create table if not exists movimientos (
  id               text primary key,
  tenant_id        text not null references tenants(id),
  numero           bigint not null,
  tipo             text not null,
  fecha            date not null,
  cliente_id       text references clientes(id) deferrable initially deferred,
  forma_pago       text not null,
  total            bigint not null,
  glosa            text,
  origen_id        text references movimientos(id) deferrable initially deferred,
  creado_por       text not null,
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      text,
  motivo_anulacion text,
  importado        boolean not null default false
);
create index if not exists movimientos_cliente_idx on movimientos (tenant_id, cliente_id, fecha);
create index if not exists movimientos_fecha_idx on movimientos (tenant_id, fecha);

create table if not exists lineas_vale (
  id              text primary key,
  tenant_id       text not null references tenants(id),
  movimiento_id   text not null references movimientos(id) deferrable initially deferred,
  orden           int not null,
  cantidad        numeric(10, 2) not null check (cantidad > 0),
  unidad          text not null check (unidad in ('CAJA', 'ENVASE', 'KG')),
  producto_id     text not null references productos(id) deferrable initially deferred,
  precio_unitario bigint not null,
  subtotal        bigint not null
);
create index if not exists lineas_mov_idx on lineas_vale (movimiento_id);
create index if not exists lineas_tenant_idx on lineas_vale (tenant_id);

create table if not exists cierres_caja (
  id          text primary key,
  tenant_id   text not null references tenants(id),
  fecha       date not null,
  cerrado_por text not null,
  cerrado_at  timestamptz not null default now(),
  snapshot    jsonb not null,
  nota        text
);

create table if not exists cierres_semana (
  id          text primary key,
  tenant_id   text not null references tenants(id),
  lunes       date not null,
  domingo     date not null,
  cerrado_por text not null,
  cerrado_at  timestamptz not null default now(),
  total       bigint not null,
  saldos      jsonb not null
);

-- sueldos
create table if not exists trabajadores (
  id         text primary key,
  tenant_id  text not null references tenants(id),
  nombre     text not null,
  cargo      text not null,
  modalidad  text not null check (modalidad in ('DIA', 'SEMANA', 'MES')),
  monto      bigint not null check (monto >= 0),
  telefono   text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists asistencias (
  id            text primary key,
  tenant_id     text not null references tenants(id),
  trabajador_id text not null references trabajadores(id) deferrable initially deferred,
  fecha         date not null,
  unique (trabajador_id, fecha)
);

create table if not exists pagos_sueldo (
  id               text primary key,
  tenant_id        text not null references tenants(id),
  trabajador_id    text not null references trabajadores(id) deferrable initially deferred,
  fecha            date not null,
  tipo             text not null check (tipo in ('PAGO', 'ADELANTO', 'BONO', 'DESCUENTO')),
  monto            bigint not null check (monto > 0),
  forma            text not null check (forma in ('EFECTIVO', 'TRANSFERENCIA')),
  movimiento_id    text references movimientos(id) deferrable initially deferred,
  nota             text,
  creado_por       text not null,
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      text,
  motivo_anulacion text
);

-- bitácora append-only
create table if not exists eventos (
  id         text primary key,
  tenant_id  text not null references tenants(id),
  at         timestamptz not null default now(),
  usuario    text not null,
  accion     text not null,
  entidad_id text,
  detalle    text not null
);
create index if not exists eventos_tenant_idx on eventos (tenant_id, at desc);

-- -----------------------------------------------------------------------------
-- Inmutabilidad: lo contable no se borra; un movimiento solo puede anularse.
-- Excepción: un ADMINISTRADOR puede editar o borrar un vale desde la app. Esa
-- operación la hace el servidor (api/admin/movimientos) dentro de una
-- transacción que marca frutas.edicion_admin = 'on' y deja copia completa en
-- el historial. Nada más puede saltarse estas reglas.
-- -----------------------------------------------------------------------------
create or replace function prohibir_borrado() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('frutas.edicion_admin', true), '') = 'on' and tg_table_name <> 'eventos' then
    return old;
  end if;
  raise exception 'No se borran registros de %: se anulan', tg_table_name;
end $$;

create or replace function solo_anular() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('frutas.edicion_admin', true), '') = 'on' then
    return new;
  end if;
  if (new.tipo, new.fecha, new.cliente_id, new.forma_pago, new.total, new.origen_id, new.creado_por)
     is distinct from
     (old.tipo, old.fecha, old.cliente_id, old.forma_pago, old.total, old.origen_id, old.creado_por) then
    raise exception 'Los movimientos no se editan: se anulan y se emite uno nuevo (N°%)', old.numero;
  end if;
  if old.anulado_at is not null and new.anulado_at is null then
    raise exception 'Un movimiento anulado no se puede "desanular" (N°%)', old.numero;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'movimientos_sin_borrar') then
    create trigger movimientos_sin_borrar before delete on movimientos for each row execute function prohibir_borrado();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'lineas_sin_borrar') then
    create trigger lineas_sin_borrar before delete on lineas_vale for each row execute function prohibir_borrado();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'eventos_sin_borrar') then
    create trigger eventos_sin_borrar before delete on eventos for each row execute function prohibir_borrado();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'pagos_sueldo_sin_borrar') then
    create trigger pagos_sueldo_sin_borrar before delete on pagos_sueldo for each row execute function prohibir_borrado();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'movimientos_solo_anular') then
    create trigger movimientos_solo_anular before update on movimientos for each row execute function solo_anular();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Vistas útiles para consultar directo en Neon
-- -----------------------------------------------------------------------------
create or replace view v_saldos_clientes as
select c.tenant_id, c.id as cliente_id, coalesce(c.alias, c.nombre) as cliente,
       coalesce(sum(case when m.tipo = 'VALE_CREDITO' then m.total when m.tipo = 'ABONO' then -m.total else 0 end)
                filter (where m.anulado_at is null), 0) as saldo,
       max(m.fecha) filter (where m.tipo = 'ABONO' and m.anulado_at is null) as ultimo_pago
from clientes c
left join movimientos m on m.cliente_id = c.id
group by c.tenant_id, c.id;

create or replace view v_caja_diaria as
select tenant_id, fecha,
       sum(total) filter (where tipo = 'VALE_VENTA')   as vale_venta,
       sum(total) filter (where tipo = 'VALE_CREDITO') as vale_credito,
       sum(total) filter (where tipo = 'ABONO')        as abonos,
       sum(total) filter (where tipo = 'INGRESO')      as ingresos,
       sum(total) filter (where tipo = 'EGRESO')       as egresos,
       coalesce(sum(total) filter (where forma_pago = 'EFECTIVO' and tipo <> 'EGRESO'), 0)
         - coalesce(sum(total) filter (where forma_pago = 'EFECTIVO' and tipo = 'EGRESO'), 0) as efectivo_esperado
from movimientos
where anulado_at is null
group by tenant_id, fecha;

-- -----------------------------------------------------------------------------
-- Acceso: clave del portal (para todo el personal) y cuentas de administrador
-- Las claves se guardan como hash scrypt; nunca en texto. El secreto que firma
-- las sesiones se genera al instalar y vive solo en la base (no en Vercel).
-- -----------------------------------------------------------------------------
create table if not exists seguridad (
  tenant_id        text primary key references tenants(id),
  clave_hash       text not null,          -- clave global del portal
  clave_version    int not null default 1, -- sube al cambiarla: cierra todas las sesiones
  secreto          text not null,          -- firma de sesiones
  actualizado_por  text,
  updated_at       timestamptz not null default now()
);

create table if not exists admins (
  id            text primary key,
  tenant_id     text not null references tenants(id),
  usuario       text not null,
  nombre        text not null,
  hash          text not null,
  activo        boolean not null default true,
  creado_por    text,
  created_at    timestamptz not null default now(),
  ultimo_acceso timestamptz,
  unique (tenant_id, usuario)
);

create table if not exists intentos_acceso (
  id      bigserial primary key,
  tenant_id text,
  ip      text not null,
  tipo    text not null check (tipo in ('PORTAL', 'ADMIN')),
  usuario text,
  ok      boolean not null,
  at      timestamptz not null default now()
);
create index if not exists intentos_ip_idx on intentos_acceso (ip, at desc);

-- -----------------------------------------------------------------------------
-- Personal: cada persona entra con su nombre (y PIN opcional) después de la
-- clave del portal; así cada cambio queda con quién lo hizo.
-- -----------------------------------------------------------------------------
alter table usuarios add column if not exists activo boolean not null default true;
alter table usuarios add column if not exists pin_hash text;
alter table usuarios add column if not exists created_at timestamptz not null default now();
alter table usuarios add column if not exists ultimo_acceso timestamptz;

-- -----------------------------------------------------------------------------
-- Historial de cambios: lo escribe solo el servidor, con el usuario de la
-- sesión. No se edita ni se borra.
-- -----------------------------------------------------------------------------
create table if not exists historial (
  id           bigserial primary key,
  tenant_id    text not null references tenants(id),
  at           timestamptz not null default now(),
  usuario      text not null,              -- nombre de quien lo hizo
  usuario_tipo text not null,              -- ADMIN · PERSONAL · SISTEMA
  usuario_id   text,
  ip           text,
  tabla        text not null,              -- qué: movimientos, clientes, envases, sesion…
  registro_id  text,
  accion       text not null,              -- CREAR · MODIFICAR · ANULAR · BORRAR · ENTRAR · SALIR · SEGURIDAD
  descripcion  text not null,
  cambios      jsonb                       -- { campo: [antes, después] }
);
create index if not exists historial_tenant_at_idx on historial (tenant_id, at desc);
create index if not exists historial_registro_idx on historial (tenant_id, registro_id);

create or replace function historial_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'El historial no se edita ni se borra';
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'historial_sin_cambios') then
    create trigger historial_sin_cambios before update or delete on historial for each row execute function historial_inmutable();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Envases: garantía que se cobra al entregar y se paga al devolver
-- -----------------------------------------------------------------------------
create table if not exists envases (
  id        text primary key,
  tenant_id text not null references tenants(id),
  nombre    text not null,
  precio    bigint not null check (precio >= 0),
  activo    boolean not null default true,
  orden     int not null default 0
);

create table if not exists lineas_envase (
  id              text primary key,
  tenant_id       text not null references tenants(id),
  movimiento_id   text not null references movimientos(id) deferrable initially deferred,
  envase_id       text not null references envases(id) deferrable initially deferred,
  cantidad        int not null check (cantidad > 0),
  precio_unitario bigint not null check (precio_unitario >= 0),
  subtotal        bigint not null
);
create index if not exists lineas_envase_mov_idx on lineas_envase (movimiento_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'lineas_envase_sin_borrar') then
    create trigger lineas_envase_sin_borrar before delete on lineas_envase for each row execute function prohibir_borrado();
  end if;
end $$;

-- Precio $0 permitido en las líneas de vale
alter table lineas_vale drop constraint if exists lineas_vale_precio_unitario_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lineas_vale_precio_chk') then
    alter table lineas_vale add constraint lineas_vale_precio_chk check (precio_unitario >= 0);
  end if;
end $$;

-- Talonarios: cada tipo lleva su numeración y un N° escrito a mano puede ser
-- 0 o repetirse. El servidor solo corrige choques de números automáticos.
alter table movimientos drop constraint if exists movimientos_tenant_id_numero_key;
alter table movimientos add column if not exists numero_manual boolean not null default false;
create index if not exists movimientos_numero_idx on movimientos (tenant_id, numero);

-- Gastos de bodega: categoría del egreso (compra de envases, gas grúa horquilla…)
alter table movimientos add column if not exists categoria text;

-- Reglas de movimientos con nombre fijo (se recrean igual en bases antiguas)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'movimientos'::regclass and contype = 'c'
      and conname not in ('movimientos_tipo_chk', 'movimientos_cliente_chk', 'movimientos_credito_chk', 'movimientos_total_chk', 'movimientos_forma_chk')
  loop
    execute format('alter table movimientos drop constraint %I', r.conname);
  end loop;
  -- precios en $0 permitidos (regalo, muestra, envase sin garantía): total >= 0
  if not exists (select 1 from pg_constraint where conname = 'movimientos_total_chk') then
    alter table movimientos add constraint movimientos_total_chk check (total >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'movimientos_forma_chk') then
    alter table movimientos add constraint movimientos_forma_chk
      check (forma_pago in ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'movimientos_tipo_chk') then
    alter table movimientos add constraint movimientos_tipo_chk
      check (tipo in ('VALE_VENTA', 'VALE_CREDITO', 'ABONO', 'INGRESO', 'EGRESO', 'ENVASE_COBRO', 'ENVASE_DEVOLUCION'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'movimientos_cliente_chk') then
    alter table movimientos add constraint movimientos_cliente_chk
      check ((tipo in ('INGRESO', 'EGRESO')) = (cliente_id is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'movimientos_credito_chk') then
    alter table movimientos add constraint movimientos_credito_chk
      check ((tipo <> 'VALE_CREDITO' or forma_pago = 'CREDITO')
         and (forma_pago <> 'CREDITO' or tipo in ('VALE_CREDITO', 'ENVASE_COBRO', 'ENVASE_DEVOLUCION')));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Migraciones de datos que corren una sola vez por base
-- -----------------------------------------------------------------------------
create table if not exists migraciones (
  id          text primary key,
  aplicada_at timestamptz not null default now()
);

do $$
begin
  perform pg_advisory_xact_lock(727001);
  if not exists (select 1 from migraciones where id = '2026-11-envases-toro-totem') then
    update envases e set nombre = 'Toro'
     where e.nombre = 'Pallet'
       and not exists (select 1 from envases x where x.tenant_id = e.tenant_id and lower(x.nombre) = 'toro');
    insert into envases (id, tenant_id, nombre, precio, activo, orden)
    select gen_random_uuid()::text, t.id, 'Totem', 0, true,
           (select coalesce(max(orden), -1) + 1 from envases x where x.tenant_id = t.id)
      from tenants t
     where exists (select 1 from envases x where x.tenant_id = t.id)
       and not exists (select 1 from envases x where x.tenant_id = t.id and lower(x.nombre) = 'totem');
    insert into migraciones (id) values ('2026-11-envases-toro-totem') on conflict do nothing;
  end if;
end $$;

-- 2026-11: catálogo de frutas del local (renombra las de antes, agrega las nuevas, oculta las que no venden)
do $$
begin
  perform pg_advisory_xact_lock(727002);
  if not exists (select 1 from migraciones where id = '2026-11-catalogo-frutas') then
    update productos p set nombre = r.nuevo
      from (values ('FUJI', 'MANZANA FUJI'), ('ROYAL GALA', 'MANZANA ROYAL GALA'), ('VERDE', 'MANZANA VERDE'),
                   ('NARANJA', 'NARANJAS'), ('LIMÓN', 'LIMONES')) as r(viejo, nuevo)
     where p.nombre = r.viejo
       and not exists (select 1 from productos x where x.tenant_id = p.tenant_id and upper(x.nombre) = r.nuevo);
    update productos set activo = false where nombre in ('PINK LADY', 'ROJA', 'PERA', 'KIWI', 'CAJONES 3/4');
    insert into productos (id, tenant_id, nombre, codigo, unidad_default, color, activo)
    select gen_random_uuid()::text, t.id, f.nombre, f.codigo, f.unidad, f.color, true
      from tenants t
      cross join (values
      ('MANZANA FUJI', 'FU', 'CAJA', '#C4262E'),
      ('MANZANA ROYAL GALA', 'RG', 'CAJA', '#B8452B'),
      ('MANZANA VERDE', 'VE', 'CAJA', '#5E8C31'),
      ('PERA PACKHAMS', 'PP', 'CAJA', '#9DA83A'),
      ('PERA WINTER NELLYS', 'PW', 'CAJA', '#8A7A3A'),
      ('PERA FORELLE', 'PF', 'CAJA', '#B5A13A'),
      ('MEMBRILLO', 'ME', 'CAJA', '#C9A227'),
      ('MANCAQUI', 'MQ', 'CAJA', '#E39B2D'),
      ('DURAZNO BLANQUILLO', 'DB', 'CAJA', '#E8A27C'),
      ('DURAZNO CURACATA', 'DC', 'CAJA', '#E08A5C'),
      ('DURAZNO CONSERVERO', 'DCO', 'CAJA', '#D9803F'),
      ('DURAZNO PRISCO', 'DPR', 'CAJA', '#E39467'),
      ('NECTARIN', 'NE', 'CAJA', '#D2553A'),
      ('NECTARIN PLÁTANO', 'NP', 'CAJA', '#D8B03A'),
      ('CIRUELAS', 'CI', 'CAJA', '#6B2A55'),
      ('CEREZAS', 'CE', 'CAJA', '#9E1B32'),
      ('UVA BLANCA', 'UB', 'CAJA', '#A8B84A'),
      ('UVA NEGRA', 'UN', 'CAJA', '#3E2A4F'),
      ('UVA ROSADA', 'UR', 'CAJA', '#B04A6A'),
      ('CLEMENTINAS', 'CL', 'CAJA', '#EE8A1E'),
      ('NARANJAS', 'NA', 'KG', '#E07B24'),
      ('POMELO', 'PO', 'CAJA', '#E86A5A'),
      ('LIMONES', 'LI', 'KG', '#D9B638')) as f(nombre, codigo, unidad, color)
     where exists (select 1 from productos x where x.tenant_id = t.id)
       and not exists (select 1 from productos x where x.tenant_id = t.id and upper(x.nombre) = f.nombre);
    insert into migraciones (id) values ('2026-11-catalogo-frutas') on conflict do nothing;
  end if;
end $$;

-- deuda por cliente incluyendo garantías a crédito
create or replace view v_saldos_clientes as
select c.tenant_id, c.id as cliente_id, coalesce(c.alias, c.nombre) as cliente,
       coalesce(sum(case
         when m.tipo = 'VALE_CREDITO' then m.total
         when m.tipo = 'ABONO' then -m.total
         when m.tipo = 'ENVASE_COBRO' and m.forma_pago = 'CREDITO' then m.total
         when m.tipo = 'ENVASE_DEVOLUCION' and m.forma_pago = 'CREDITO' then -m.total
         else 0 end) filter (where m.anulado_at is null), 0) as saldo,
       max(m.fecha) filter (where m.tipo = 'ABONO' and m.anulado_at is null) as ultimo_pago
from clientes c
left join movimientos m on m.cliente_id = c.id
group by c.tenant_id, c.id;

-- envases en poder de cada cliente
create or replace view v_envases_clientes as
select m.tenant_id, m.cliente_id, l.envase_id,
       sum(case when m.tipo = 'ENVASE_COBRO' then l.cantidad else -l.cantidad end) as cantidad,
       sum(case when m.tipo = 'ENVASE_COBRO' then l.subtotal else -l.subtotal end) as garantia
from lineas_envase l
join movimientos m on m.id = l.movimiento_id and m.anulado_at is null
group by m.tenant_id, m.cliente_id, l.envase_id;
