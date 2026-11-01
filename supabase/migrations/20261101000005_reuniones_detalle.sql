-- =============================================================================
-- PAC · Reuniones: lo necesario para reconocerlas en la bandeja y analizarlas
-- =============================================================================

-- Datos que trae Granola (o que se escriben a mano) para saber de quién es la reunión.
alter table public.reuniones
  add column if not exists titulo           text check (length(titulo) <= 300),
  add column if not exists duracion_min     integer check (duracion_min >= 0),
  add column if not exists asistentes       jsonb not null default '[]'::jsonb,   -- [{nombre, email}]
  add column if not exists resumen_granola  text check (length(resumen_granola) <= 20000),
  add column if not exists error_analisis   text;                                 -- último error de la IA, para mostrarlo

comment on column public.reuniones.asistentes is 'Invitados del calendario según Granola: [{"nombre": ..., "email": ...}]';

-- Una reunión de Granola que se elimina no debe volver a importarse.
create table if not exists public.reuniones_descartadas (
  granola_id  text primary key,
  created_at  timestamptz not null default now()
);
alter table public.reuniones_descartadas enable row level security;
drop policy if exists descartadas_crm on public.reuniones_descartadas;
create policy descartadas_crm on public.reuniones_descartadas
  for select to authenticated using (public.es_usuario_activo());

create or replace function public.recordar_reunion_descartada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.granola_id is not null then
    insert into public.reuniones_descartadas (granola_id) values (old.granola_id)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists reuniones_recordar_descartada on public.reuniones;
create trigger reuniones_recordar_descartada
  after delete on public.reuniones
  for each row execute function public.recordar_reunion_descartada();

-- Un solo análisis por reunión (al reanalizar se reemplaza).
delete from public.analisis a
 using public.analisis b
 where a.reunion_id = b.reunion_id and a.created_at < b.created_at;
drop index if exists public.analisis_reunion_idx;
create unique index if not exists analisis_reunion_unico on public.analisis (reunion_id);

-- El seguimiento creado desde una sugerencia queda ligado a su reunión (ya existe reunion_id).
create index if not exists seguimientos_reunion_idx on public.seguimientos (reunion_id) where reunion_id is not null;
