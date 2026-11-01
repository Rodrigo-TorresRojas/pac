-- =============================================================================
-- PAC · Ubicación estandarizada del cliente: país, departamento, provincia, distrito
-- En Perú se elige de la lista oficial (ubigeo INEI); en otros países es texto libre.
-- =============================================================================

alter table public.clientes
  add column if not exists pais          text not null default 'Perú',
  add column if not exists departamento  text,
  add column if not exists provincia     text,
  add column if not exists ubigeo        text check (ubigeo ~ '^[0-9]{6}$');

comment on column public.clientes.departamento is 'Departamento (Perú) o región/estado (otros países)';
comment on column public.clientes.provincia is 'Provincia (Perú); vacío en otros países';
comment on column public.clientes.distrito is 'Distrito (Perú) o ciudad (otros países)';
comment on column public.clientes.ubigeo is 'Código INEI de 6 dígitos del distrito, solo para Perú';

create index if not exists clientes_ubicacion_idx on public.clientes (pais, departamento);

-- La vista usa c.*: se vuelve a crear para que incluya las columnas nuevas.
drop view if exists public.clientes_resumen;
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
