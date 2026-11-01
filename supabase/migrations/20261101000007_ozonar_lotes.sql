-- =============================================================================
-- PAC · Ozonar: lote mensual de prospectos descubiertos con Google Maps
--
-- Google solo permite guardar el identificador del lugar (place_id). El nombre,
-- teléfono y web se piden a Google cada vez que se muestran. Aquí se guarda lo
-- nuestro: la puntuación, la razón, lo que se leyó en la web del prospecto
-- (con sus enlaces), el estado y la opinión del vendedor.
-- =============================================================================

-- 1. Lotes: uno por mes (más los extra que se pidan si se termina antes).
create table if not exists public.ozonar_lotes (
  id           uuid primary key default gen_random_uuid(),
  mes          date not null,                       -- primer día del mes
  numero       integer not null default 1,          -- 1 = lote del mes; 2, 3… = pedidos extra
  estado       text not null default 'generando' check (estado in ('generando', 'listo', 'error')),
  error        text,
  candidatos   integer,                             -- cuántos lugares se evaluaron
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (mes, numero)
);

drop trigger if exists ozonar_lotes_updated_at on public.ozonar_lotes;
create trigger ozonar_lotes_updated_at
  before update on public.ozonar_lotes
  for each row execute function public.set_updated_at();

alter table public.ozonar_lotes enable row level security;
drop policy if exists ozonar_lotes_crm on public.ozonar_lotes;
create policy ozonar_lotes_crm on public.ozonar_lotes
  for all to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo());

-- 2. Prospectos: ahora vienen de Google Maps (place_id) y pertenecen a un lote.
alter table public.prospectos alter column nombre drop not null;
alter table public.prospectos
  add column if not exists place_id         text unique,
  add column if not exists lote_id          uuid references public.ozonar_lotes (id) on delete set null,
  add column if not exists exploracion      boolean not null default false,  -- elegido para dar variedad
  add column if not exists zona             text,                             -- zona buscada (por ejemplo «Miraflores, Lima»)
  add column if not exists servicios        text,                             -- lo que ofrece, según su web
  add column if not exists fuentes          jsonb not null default '[]'::jsonb, -- [{titulo, url}] de donde salió la información
  add column if not exists opinion          smallint check (opinion in (-1, 1)), -- 👎 / 👍 del vendedor
  add column if not exists motivo_descarte  text,
  add column if not exists contactado_at    timestamptz;

alter table public.prospectos drop constraint if exists prospectos_estado_check;
alter table public.prospectos add constraint prospectos_estado_check
  check (estado in ('nuevo', 'contactado', 'descartado', 'convertido'));

create index if not exists prospectos_lote_idx on public.prospectos (lote_id, afinidad desc nulls last);
