-- =============================================================================
-- PAC · Modelo de datos inicial
-- Crea las 9 tablas del CRM, sus reglas automáticas, índices y permisos (RLS).
-- Es genérico: no contiene datos de ningún cliente. Los datos de TECNOCARE
-- (productos) van en supabase/seeds/tecnocare.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

-- Mantiene updated_at al día en cada modificación.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. usuarios: quién entra al panel (1 a 1 con auth.users)
-- -----------------------------------------------------------------------------
create table public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  rol         text not null default 'vendedor' check (rol in ('admin', 'vendedor')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.set_updated_at();

-- Cuando se crea un usuario en el login de Supabase, se crea su fila en usuarios.
-- El nombre sale de los metadatos o, si no hay, del correo.
-- El primer usuario de la instalación queda como admin; los siguientes, vendedor.
create or replace function public.crear_usuario_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nombre, rol)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1), 'Usuario'),
    case when exists (select 1 from public.usuarios where rol = 'admin') then 'vendedor' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_usuario_creado
  after insert on auth.users
  for each row execute function public.crear_usuario_desde_auth();

-- ¿El usuario de la sesión actual está activo? Lo usan los permisos (RLS).
create or replace function public.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and activo);
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and activo and rol = 'admin');
$$;

-- -----------------------------------------------------------------------------
-- 2. etapas (catálogo): Lead, Negociación, Cerrado
-- -----------------------------------------------------------------------------
create table public.etapas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  orden       integer not null unique,
  es_cierre   boolean not null default false,  -- técnica: la etapa que marca venta cerrada
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger etapas_updated_at
  before update on public.etapas
  for each row execute function public.set_updated_at();

insert into public.etapas (nombre, orden, es_cierre) values
  ('Lead', 1, false),
  ('Negociación', 2, false),
  ('Cerrado', 3, true);

-- -----------------------------------------------------------------------------
-- 3. productos (catálogo): equipos, servicios o insumos
-- -----------------------------------------------------------------------------
create table public.productos (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null unique,
  categoria              text not null default 'equipo' check (categoria in ('equipo', 'servicio', 'insumo')),
  especialidad_objetivo  text,
  descripcion            text,
  imagen_url             text,
  mostrar_en_web         boolean not null default false,
  activo                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger productos_updated_at
  before update on public.productos
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 9. prospectos: clínicas que encuentra Ozonar (antes que clientes por la FK)
-- -----------------------------------------------------------------------------
create table public.prospectos (
  id                    uuid primary key default gen_random_uuid(),
  codigo_renipress      text unique,
  nombre                text not null,
  segmento              text,
  distrito              text,
  telefono              text,
  celular               text,
  correo                text,
  web                   text,
  ofrece_ozono          text not null default 'desconocido' check (ofrece_ozono in ('si', 'no', 'desconocido')),
  afinidad              integer check (afinidad between 0 and 100),
  razon                 text,
  producto_sugerido_id  uuid references public.productos (id) on delete set null,
  estado                text not null default 'nuevo' check (estado in ('nuevo', 'descartado', 'convertido')),
  fuente                text not null default 'manual',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger prospectos_updated_at
  before update on public.prospectos
  for each row execute function public.set_updated_at();

create index prospectos_bandeja_idx on public.prospectos (estado, afinidad desc nulls last);

-- -----------------------------------------------------------------------------
-- 4. clientes: el centro del CRM
-- -----------------------------------------------------------------------------
create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(trim(nombre)) > 0),
  institucion   text,
  especialidad  text,
  telefono      text,
  email         text,
  distrito      text,
  etapa_id      uuid not null references public.etapas (id),
  temperatura   text check (temperatura in ('Frio', 'Tibio', 'Caliente')),
  prospecto_id  uuid unique references public.prospectos (id) on delete set null,
  activo        boolean not null default true,
  fecha_cierre  date,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger clientes_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

create index clientes_tablero_idx on public.clientes (activo, etapa_id);
create index clientes_nombre_idx on public.clientes (lower(nombre));

-- Antes de guardar un cliente:
--  · sin etapa → la primera (Lead)
--  · entra a una etapa de cierre → fecha_cierre = hoy en Lima; sale de ella → se limpia
create or replace function public.clientes_antes_de_guardar()
returns trigger
language plpgsql
as $$
declare
  cierre boolean;
begin
  if new.etapa_id is null then
    select id into new.etapa_id from public.etapas where activa order by orden limit 1;
  end if;

  select es_cierre into cierre from public.etapas where id = new.etapa_id;

  if cierre then
    if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
      new.fecha_cierre := coalesce(new.fecha_cierre, (now() at time zone 'America/Lima')::date);
    end if;
  else
    new.fecha_cierre := null;
  end if;

  return new;
end;
$$;

create trigger clientes_antes_de_guardar
  before insert or update of etapa_id on public.clientes
  for each row execute function public.clientes_antes_de_guardar();

-- Si el cliente viene de un prospecto, el prospecto pasa a "convertido".
create or replace function public.marcar_prospecto_convertido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.prospecto_id is not null
     and (tg_op = 'INSERT' or new.prospecto_id is distinct from old.prospecto_id) then
    update public.prospectos set estado = 'convertido' where id = new.prospecto_id;
  end if;
  return new;
end;
$$;

create trigger clientes_marcar_prospecto
  after insert or update of prospecto_id on public.clientes
  for each row execute function public.marcar_prospecto_convertido();

-- -----------------------------------------------------------------------------
-- 8. historial_etapas: se llena sola con cada cambio de etapa
-- -----------------------------------------------------------------------------
create table public.historial_etapas (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes (id) on delete cascade,
  etapa_anterior_id  uuid references public.etapas (id),
  etapa_nueva_id     uuid not null references public.etapas (id),
  created_at         timestamptz not null default now()
);

create index historial_etapas_cliente_idx on public.historial_etapas (cliente_id, created_at);

create or replace function public.registrar_cambio_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historial_etapas (cliente_id, etapa_anterior_id, etapa_nueva_id)
    values (new.id, null, new.etapa_id);
  elsif new.etapa_id is distinct from old.etapa_id then
    insert into public.historial_etapas (cliente_id, etapa_anterior_id, etapa_nueva_id)
    values (new.id, old.etapa_id, new.etapa_id);
  end if;
  return new;
end;
$$;

create trigger clientes_historial_etapas
  after insert or update of etapa_id on public.clientes
  for each row execute function public.registrar_cambio_etapa();

-- -----------------------------------------------------------------------------
-- 5. reuniones: cliente, fecha y transcripción (+ 2 campos técnicos)
-- -----------------------------------------------------------------------------
create table public.reuniones (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid references public.clientes (id) on delete cascade,  -- vacío = por asignar
  fecha            timestamptz not null default now(),
  transcripcion    text check (length(transcripcion) <= 60000),
  granola_id       text unique,                                               -- técnica: evita duplicados
  estado_analisis  text not null default 'pendiente' check (estado_analisis in ('pendiente', 'listo', 'error')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger reuniones_updated_at
  before update on public.reuniones
  for each row execute function public.set_updated_at();

create index reuniones_cliente_idx on public.reuniones (cliente_id, fecha desc);
create index reuniones_por_asignar_idx on public.reuniones (fecha desc) where cliente_id is null;
create index reuniones_pendientes_idx on public.reuniones (estado_analisis) where estado_analisis <> 'listo';

-- -----------------------------------------------------------------------------
-- 6. analisis: lo que la IA recomienda (no cambia nada del cliente)
-- -----------------------------------------------------------------------------
create table public.analisis (
  id                           uuid primary key default gen_random_uuid(),
  reunion_id                   uuid not null references public.reuniones (id) on delete cascade,
  resumen                      text not null,
  objeciones                   text[] not null default '{}',
  acuerdos                     text,
  recomendaciones              text,
  temperatura_sugerida         text check (temperatura_sugerida in ('Frio', 'Tibio', 'Caliente')),
  producto_sugerido_id         uuid references public.productos (id) on delete set null,
  seguimiento_sugerido_fecha   date,
  seguimiento_sugerido_motivo  text,
  borrador_whatsapp            text,
  created_at                   timestamptz not null default now()
);

create index analisis_reunion_idx on public.analisis (reunion_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 7. seguimientos: a quién contactar, cuándo y para qué
-- -----------------------------------------------------------------------------
create table public.seguimientos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes (id) on delete cascade,
  reunion_id     uuid references public.reuniones (id) on delete set null,
  fecha          date not null,
  motivo         text not null check (length(trim(motivo)) > 0),
  hecho          boolean not null default false,
  completado_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index seguimientos_pendientes_idx on public.seguimientos (fecha) where not hecho;
create index seguimientos_cliente_idx on public.seguimientos (cliente_id, fecha);

-- Marca la hora en que se completó (o la limpia si se desmarca).
create or replace function public.seguimientos_antes_de_guardar()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.hecho and new.completado_at is null then
    new.completado_at := now();
  elsif not new.hecho then
    new.completado_at := null;
  end if;
  return new;
end;
$$;

create trigger seguimientos_antes_de_guardar
  before insert or update on public.seguimientos
  for each row execute function public.seguimientos_antes_de_guardar();

-- -----------------------------------------------------------------------------
-- Vista para el panel: cada cliente con su última reunión y próximo seguimiento
-- (se calcula, no se guarda dos veces)
-- -----------------------------------------------------------------------------
create view public.clientes_resumen
with (security_invoker = true)
as
select
  c.*,
  e.nombre as etapa,
  e.orden  as etapa_orden,
  (select max(r.fecha) from public.reuniones r where r.cliente_id = c.id) as ultima_reunion,
  s.fecha  as proximo_seguimiento_fecha,
  s.motivo as proximo_seguimiento_motivo
from public.clientes c
join public.etapas e on e.id = c.etapa_id
left join lateral (
  select fecha, motivo
  from public.seguimientos
  where cliente_id = c.id and not hecho
  order by fecha
  limit 1
) s on true;

-- -----------------------------------------------------------------------------
-- Borrado de transcripciones antiguas (el análisis se queda)
-- Se programa en la migración 20261031000002 con pg_cron.
-- -----------------------------------------------------------------------------
create or replace function public.purgar_transcripciones(meses integer default 8)
returns integer
language sql
security definer
set search_path = public
as $$
  with borradas as (
    update public.reuniones
       set transcripcion = null
     where transcripcion is not null
       and estado_analisis = 'listo'
       and fecha < now() - make_interval(months => meses)
    returning 1
  )
  select count(*)::integer from borradas;
$$;

revoke execute on function public.purgar_transcripciones(integer) from public;

-- -----------------------------------------------------------------------------
-- Permisos (RLS)
--  · Usuarios activos: leen y escriben todo el CRM (todos ven todo).
--  · Solo admin: cambia usuarios y catálogos.
--  · Visitantes de la landing page (anon): solo leen productos activos marcados para la web.
-- -----------------------------------------------------------------------------
alter table public.usuarios         enable row level security;
alter table public.etapas           enable row level security;
alter table public.productos        enable row level security;
alter table public.prospectos       enable row level security;
alter table public.clientes         enable row level security;
alter table public.historial_etapas enable row level security;
alter table public.reuniones        enable row level security;
alter table public.analisis         enable row level security;
alter table public.seguimientos     enable row level security;

-- usuarios
create policy usuarios_leer on public.usuarios
  for select to authenticated using (public.es_usuario_activo() or id = auth.uid());
create policy usuarios_admin on public.usuarios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- catálogos
create policy etapas_leer on public.etapas
  for select to authenticated using (public.es_usuario_activo());
create policy etapas_admin on public.etapas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy productos_leer on public.productos
  for select to authenticated using (public.es_usuario_activo());
create policy productos_web on public.productos
  for select to anon using (activo and mostrar_en_web);
create policy productos_admin on public.productos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- CRM: todo usuario activo lee y escribe
create policy prospectos_crm on public.prospectos
  for all to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo());
create policy clientes_crm on public.clientes
  for all to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo());
create policy reuniones_crm on public.reuniones
  for all to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo());
create policy analisis_crm on public.analisis
  for all to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo());
create policy seguimientos_crm on public.seguimientos
  for all to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo());

-- historial: solo lectura (lo escribe el disparador)
create policy historial_leer on public.historial_etapas
  for select to authenticated using (public.es_usuario_activo());
