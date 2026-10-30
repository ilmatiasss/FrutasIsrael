-- =============================================================================
-- Frutas Israel · esquema para Supabase (Postgres)
-- Multi-locatario desde el día uno: todas las tablas llevan tenant_id y RLS.
-- Regla de negocio: los movimientos NUNCA se borran ni se editan; solo se anulan.
-- Aún no está conectado: el boceto usa localStorage con este mismo modelo
-- (src/lib/types.ts es espejo 1:1 de estas tablas).
-- =============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Locatarios y usuarios
-- ----------------------------------------------------------------------------
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,                        -- "Frutas Israel"
  ubicacion     text,                                 -- "La Vega Central · Santiago"
  ultimo_numero bigint not null default 0,            -- correlativo de vales
  dias_amarillo int not null default 15,
  dias_rojo     int not null default 30,
  dias_sin_compra int not null default 21,
  created_at    timestamptz not null default now()
);

create table tenant_miembros (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  nombre    text not null,                            -- como aparece en "creado_por"
  rol       text not null check (rol in ('DUENO', 'CAJA')),
  primary key (tenant_id, user_id)
);

-- helper para las políticas: ¿el usuario actual pertenece al tenant?
create or replace function es_miembro(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_miembros m where m.tenant_id = t and m.user_id = auth.uid());
$$;

create or replace function es_dueno(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_miembros m where m.tenant_id = t and m.user_id = auth.uid() and m.rol = 'DUENO');
$$;

-- ----------------------------------------------------------------------------
-- Maestros
-- ----------------------------------------------------------------------------
create table clientes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  nombre          text not null,
  alias           text,                               -- "EL FLACO"
  telefono        text,
  procedencia     text,                               -- feria / local
  limite_credito  bigint check (limite_credito is null or limite_credito >= 0),
  semaforo_manual text check (semaforo_manual in ('VERDE', 'AMARILLO', 'ROJO')),
  compra_manual   boolean,
  notas           text,
  created_at      timestamptz not null default now()
);
create index clientes_tenant_idx on clientes (tenant_id);
create index clientes_busqueda_idx on clientes using gin (to_tsvector('spanish', coalesce(alias, '') || ' ' || nombre));

create table productos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  nombre         text not null,                       -- "PINK LADY"
  codigo         text not null,                       -- "PL"
  unidad_default text not null check (unidad_default in ('CAJA', 'ENVASE', 'KG')),
  color          text not null default '#8a6a3d',
  activo         boolean not null default true,
  unique (tenant_id, codigo)
);

-- ----------------------------------------------------------------------------
-- Movimientos (hojas del talonario) y líneas de vale
-- ----------------------------------------------------------------------------
create table movimientos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  numero           bigint not null,                    -- N° de vale correlativo
  tipo             text not null check (tipo in ('VALE_VENTA', 'VALE_CREDITO', 'ABONO', 'INGRESO', 'EGRESO')),
  fecha            date not null,
  cliente_id       uuid references clientes(id),
  forma_pago       text not null check (forma_pago in ('EFECTIVO', 'TRANSFERENCIA', 'CREDITO')),
  total            bigint not null check (total > 0),  -- CLP, sin decimales
  glosa            text,
  origen_id        uuid references movimientos(id),    -- abono hecho en el mismo vale
  creado_por       text not null,
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      text,
  motivo_anulacion text,
  importado        boolean not null default false,
  unique (tenant_id, numero),
  -- coherencia de negocio
  check ((tipo in ('INGRESO', 'EGRESO')) = (cliente_id is null)),
  check ((tipo = 'VALE_CREDITO') = (forma_pago = 'CREDITO')),
  check ((anulado_at is null) = (motivo_anulacion is null))
);
create index movimientos_cliente_idx on movimientos (tenant_id, cliente_id, fecha);
create index movimientos_fecha_idx on movimientos (tenant_id, fecha);

create table lineas_vale (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  movimiento_id   uuid not null references movimientos(id),
  orden           int not null,
  cantidad        numeric(10, 2) not null check (cantidad > 0),
  unidad          text not null check (unidad in ('CAJA', 'ENVASE', 'KG')),
  producto_id     uuid not null references productos(id),
  precio_unitario bigint not null check (precio_unitario > 0),
  subtotal        bigint not null
);
create index lineas_mov_idx on lineas_vale (movimiento_id);
create index lineas_producto_idx on lineas_vale (tenant_id, producto_id);

create table cierres_caja (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  fecha       date not null,
  cerrado_por text not null,
  cerrado_at  timestamptz not null default now(),
  snapshot    jsonb not null,                          -- totales al momento del cierre
  nota        text
);

-- bitácora append-only
create table eventos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  at         timestamptz not null default now(),
  usuario    text not null,
  accion     text not null,
  entidad_id uuid,
  detalle    text not null
);
create index eventos_tenant_idx on eventos (tenant_id, at desc);

-- ----------------------------------------------------------------------------
-- Inmutabilidad: nada se borra; un movimiento solo puede pasar a "anulado"
-- ----------------------------------------------------------------------------
create or replace function prohibir_borrado() returns trigger language plpgsql as $$
begin
  raise exception 'No se borran registros en %: se anulan', tg_table_name;
end $$;

create trigger movimientos_sin_borrar before delete on movimientos for each row execute function prohibir_borrado();
create trigger lineas_sin_borrar      before delete on lineas_vale  for each row execute function prohibir_borrado();
create trigger eventos_sin_borrar     before delete on eventos      for each row execute function prohibir_borrado();

create or replace function solo_anular() returns trigger language plpgsql as $$
begin
  if old.anulado_at is not null then
    raise exception 'El movimiento N°% ya está anulado', old.numero;
  end if;
  if (new.numero, new.tipo, new.fecha, new.cliente_id, new.forma_pago, new.total, new.glosa, new.origen_id, new.creado_por, new.created_at)
     is distinct from
     (old.numero, old.tipo, old.fecha, old.cliente_id, old.forma_pago, old.total, old.glosa, old.origen_id, old.creado_por, old.created_at) then
    raise exception 'Los movimientos no se editan: anula y emite uno nuevo';
  end if;
  if new.anulado_at is null or coalesce(trim(new.motivo_anulacion), '') = '' then
    raise exception 'Para anular hay que indicar el motivo';
  end if;
  insert into eventos (tenant_id, usuario, accion, entidad_id, detalle)
  values (new.tenant_id, new.anulado_por, 'ANULAR_MOVIMIENTO', new.id, format('N°%s anulado: %s', new.numero, new.motivo_anulacion));
  return new;
end $$;

create trigger movimientos_solo_anular before update on movimientos for each row execute function solo_anular();
create trigger lineas_sin_editar before update on lineas_vale for each row execute function prohibir_borrado();

-- ----------------------------------------------------------------------------
-- Emitir un vale de forma atómica (correlativo sin huecos ni duplicados)
-- ----------------------------------------------------------------------------
create or replace function emitir_vale(
  p_tenant uuid,
  p_tipo text,
  p_fecha date,
  p_cliente uuid,
  p_forma text,
  p_lineas jsonb,           -- [{cantidad, unidad, producto_id, precio_unitario}]
  p_glosa text default null,
  p_abono bigint default 0,
  p_abono_forma text default 'EFECTIVO'
) returns movimientos
language plpgsql security invoker as $$
declare
  v_num bigint;
  v_total bigint := 0;
  v_mov movimientos;
  v_usuario text;
  l jsonb;
  i int := 0;
begin
  if not es_miembro(p_tenant) then raise exception 'Sin acceso'; end if;
  select nombre into v_usuario from tenant_miembros where tenant_id = p_tenant and user_id = auth.uid();

  -- bloquea la fila del tenant: dos cajas no pueden sacar el mismo número
  update tenants set ultimo_numero = ultimo_numero + 1 where id = p_tenant returning ultimo_numero into v_num;

  if p_lineas is not null then
    select coalesce(sum(round((x->>'cantidad')::numeric * (x->>'precio_unitario')::bigint)), 0)
      into v_total from jsonb_array_elements(p_lineas) x;
  end if;

  insert into movimientos (tenant_id, numero, tipo, fecha, cliente_id, forma_pago, total, glosa, creado_por)
  values (p_tenant, v_num, p_tipo, p_fecha, p_cliente, p_forma, v_total, p_glosa, v_usuario)
  returning * into v_mov;

  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    i := i + 1;
    insert into lineas_vale (tenant_id, movimiento_id, orden, cantidad, unidad, producto_id, precio_unitario, subtotal)
    values (p_tenant, v_mov.id, i, (l->>'cantidad')::numeric, l->>'unidad', (l->>'producto_id')::uuid,
            (l->>'precio_unitario')::bigint, round((l->>'cantidad')::numeric * (l->>'precio_unitario')::bigint));
  end loop;

  if p_tipo = 'VALE_CREDITO' and p_abono > 0 then
    update tenants set ultimo_numero = ultimo_numero + 1 where id = p_tenant returning ultimo_numero into v_num;
    insert into movimientos (tenant_id, numero, tipo, fecha, cliente_id, forma_pago, total, glosa, origen_id, creado_por)
    values (p_tenant, v_num, 'ABONO', p_fecha, p_cliente, p_abono_forma, least(p_abono, v_total),
            format('Abono en el mismo vale N°%s', v_mov.numero), v_mov.id, v_usuario);
  end if;

  insert into eventos (tenant_id, usuario, accion, entidad_id, detalle)
  values (p_tenant, v_usuario, 'CREAR_MOVIMIENTO', v_mov.id, format('Vale N°%s · %s · $%s', v_mov.numero, p_tipo, v_total));
  return v_mov;
end $$;

-- ----------------------------------------------------------------------------
-- Vistas derivadas (lo calculado no se guarda)
-- ----------------------------------------------------------------------------
create or replace view v_saldos_clientes with (security_invoker = true) as
select
  c.id as cliente_id,
  c.tenant_id,
  coalesce(sum(case when m.tipo = 'VALE_CREDITO' then m.total when m.tipo = 'ABONO' then -m.total else 0 end)
           filter (where m.anulado_at is null), 0) as saldo,
  max(m.fecha) filter (where m.tipo = 'ABONO' and m.anulado_at is null) as ultimo_pago,
  max(m.fecha) filter (where m.tipo in ('VALE_VENTA', 'VALE_CREDITO') and m.anulado_at is null and not m.importado) as ultima_compra,
  coalesce(sum(m.total) filter (where m.tipo in ('VALE_VENTA', 'VALE_CREDITO') and m.anulado_at is null
                                and m.fecha >= current_date - 30), 0) as compras_30d
from clientes c
left join movimientos m on m.cliente_id = c.id
group by c.id, c.tenant_id;

create or replace view v_caja_diaria with (security_invoker = true) as
select
  tenant_id,
  fecha,
  sum(total) filter (where tipo = 'VALE_VENTA')   as vale_venta,
  sum(total) filter (where tipo = 'VALE_CREDITO') as vale_credito,
  sum(total) filter (where tipo = 'ABONO')        as abonos,
  sum(total) filter (where tipo = 'INGRESO')      as ingresos,
  sum(total) filter (where tipo = 'EGRESO')       as egresos,
  sum(total) filter (where forma_pago = 'EFECTIVO' and tipo <> 'EGRESO')
    - coalesce(sum(total) filter (where forma_pago = 'EFECTIVO' and tipo = 'EGRESO'), 0) as efectivo_esperado,
  sum(total) filter (where forma_pago = 'TRANSFERENCIA' and tipo <> 'EGRESO') as transferencia
from movimientos
where anulado_at is null
group by tenant_id, fecha;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table tenants          enable row level security;
alter table tenant_miembros  enable row level security;
alter table clientes         enable row level security;
alter table productos        enable row level security;
alter table movimientos      enable row level security;
alter table lineas_vale      enable row level security;
alter table cierres_caja     enable row level security;
alter table eventos          enable row level security;

create policy tenant_lectura on tenants for select using (es_miembro(id));
create policy tenant_config  on tenants for update using (es_dueno(id));

create policy miembros_lectura on tenant_miembros for select using (es_miembro(tenant_id));
create policy miembros_admin   on tenant_miembros for all using (es_dueno(tenant_id)) with check (es_dueno(tenant_id));

create policy clientes_rw on clientes for all using (es_miembro(tenant_id)) with check (es_miembro(tenant_id));
create policy productos_lectura on productos for select using (es_miembro(tenant_id));
create policy productos_admin on productos for all using (es_dueno(tenant_id)) with check (es_dueno(tenant_id));

-- movimientos: leer, insertar y anular (el trigger impide cualquier otra edición); sin delete
create policy movimientos_lectura on movimientos for select using (es_miembro(tenant_id));
create policy movimientos_insert  on movimientos for insert with check (es_miembro(tenant_id));
create policy movimientos_anular  on movimientos for update using (es_miembro(tenant_id)) with check (es_miembro(tenant_id));

create policy lineas_lectura on lineas_vale for select using (es_miembro(tenant_id));
create policy lineas_insert  on lineas_vale for insert with check (es_miembro(tenant_id));

create policy cierres_lectura on cierres_caja for select using (es_miembro(tenant_id));
create policy cierres_insert  on cierres_caja for insert with check (es_miembro(tenant_id));

create policy eventos_lectura on eventos for select using (es_miembro(tenant_id));
create policy eventos_insert  on eventos for insert with check (es_miembro(tenant_id));
