-- =============================================================================
-- PAC · Clientes: se puede registrar a una persona, a una institución o a ambas
-- y se avisa si el teléfono o el correo ya pertenecen a otro cliente.
-- =============================================================================

-- 1. El nombre de la persona deja de ser obligatorio: basta con nombre o institución.
alter table public.clientes alter column nombre drop not null;
alter table public.clientes drop constraint if exists clientes_nombre_check;
alter table public.clientes drop constraint if exists clientes_nombre_o_institucion;
alter table public.clientes add constraint clientes_nombre_o_institucion check (
  length(trim(coalesce(nombre, ''))) > 0 or length(trim(coalesce(institucion, ''))) > 0
);

-- 2. Teléfono comparable: solo los últimos 9 dígitos (celular peruano sin +51 ni espacios).
create or replace function public.telefono_normalizado(valor text)
returns text
language sql
immutable
as $$
  select nullif(right(regexp_replace(coalesce(valor, ''), '\D', '', 'g'), 9), '');
$$;

create index if not exists clientes_telefono_idx on public.clientes (public.telefono_normalizado(telefono));
create index if not exists clientes_email_idx on public.clientes (lower(trim(email)));

-- 3. Clientes con el mismo teléfono o correo (para avisar antes de guardar).
--    security invoker: respeta los permisos de quien pregunta.
create or replace function public.buscar_duplicados(
  p_telefono text,
  p_email text,
  p_excluir uuid default null
)
returns table (id uuid, nombre text, institucion text, activo boolean, coincide text)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.nombre, c.institucion, c.activo,
         case when public.telefono_normalizado(c.telefono) = public.telefono_normalizado(p_telefono)
              then 'teléfono' else 'correo' end
  from public.clientes c
  where (p_excluir is null or c.id <> p_excluir)
    and (
      (public.telefono_normalizado(p_telefono) is not null
        and public.telefono_normalizado(c.telefono) = public.telefono_normalizado(p_telefono))
      or (nullif(lower(trim(p_email)), '') is not null
        and lower(trim(c.email)) = lower(trim(p_email)))
    )
  limit 5;
$$;

revoke execute on function public.buscar_duplicados(text, text, uuid) from anon;
