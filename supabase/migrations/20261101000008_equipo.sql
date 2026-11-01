-- =============================================================================
-- PAC · Equipo: correo visible en usuarios y cada persona edita su propio nombre
-- =============================================================================

-- 1. Copia del correo (vive en auth.users) para listar al equipo sin la clave de servicio.
alter table public.usuarios add column if not exists email text;

update public.usuarios u set email = a.email from auth.users a where a.id = u.id and u.email is distinct from a.email;

create or replace function public.crear_usuario_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nombre, rol, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1), 'Usuario'),
    case when exists (select 1 from public.usuarios where rol = 'admin') then 'vendedor' else 'admin' end,
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.copiar_correo_de_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usuarios set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists auth_usuario_correo on auth.users;
create trigger auth_usuario_correo
  after update of email on auth.users
  for each row execute function public.copiar_correo_de_auth();

-- 2. Cada usuario puede cambiar su propio nombre (no su rol, estado ni correo).
drop policy if exists usuarios_propio on public.usuarios;
create policy usuarios_propio on public.usuarios
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.usuarios_proteger_campos()
returns trigger
language plpgsql
as $$
begin
  -- Los procesos internos (disparadores de auth, clave de servicio) pasan sin revisión.
  if current_user not in ('postgres', 'supabase_admin', 'service_role') and not public.es_admin() and (
       new.rol is distinct from old.rol
    or new.activo is distinct from old.activo
    or new.email is distinct from old.email
  ) then
    raise exception 'Solo un administrador puede cambiar rol, estado o correo.';
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_proteger_campos on public.usuarios;
create trigger usuarios_proteger_campos
  before update on public.usuarios
  for each row execute function public.usuarios_proteger_campos();
