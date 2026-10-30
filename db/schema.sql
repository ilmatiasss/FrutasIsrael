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
  tipo             text not null check (tipo in ('VALE_VENTA', 'VALE_CREDITO', 'ABONO', 'INGRESO', 'EGRESO')),
  fecha            date not null,
  cliente_id       text references clientes(id) deferrable initially deferred,
  forma_pago       text not null check (forma_pago in ('EFECTIVO', 'TRANSFERENCIA', 'CREDITO')),
  total            bigint not null check (total > 0),
  glosa            text,
  origen_id        text references movimientos(id) deferrable initially deferred,
  creado_por       text not null,
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      text,
  motivo_anulacion text,
  importado        boolean not null default false,
  unique (tenant_id, numero),
  check ((tipo in ('INGRESO', 'EGRESO')) = (cliente_id is null)),
  check ((tipo = 'VALE_CREDITO') = (forma_pago = 'CREDITO'))
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
  precio_unitario bigint not null check (precio_unitario > 0),
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
-- Inmutabilidad: lo contable no se borra; un movimiento solo puede anularse
-- -----------------------------------------------------------------------------
create or replace function prohibir_borrado() returns trigger language plpgsql as $$
begin
  raise exception 'No se borran registros de %: se anulan', tg_table_name;
end $$;

create or replace function solo_anular() returns trigger language plpgsql as $$
begin
  if (new.numero, new.tipo, new.fecha, new.cliente_id, new.forma_pago, new.total, new.origen_id, new.creado_por)
     is distinct from
     (old.numero, old.tipo, old.fecha, old.cliente_id, old.forma_pago, old.total, old.origen_id, old.creado_por) then
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
