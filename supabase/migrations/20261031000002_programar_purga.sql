-- =============================================================================
-- PAC · Borrado automático de transcripciones con más de 8 meses
-- Requiere la extensión pg_cron. En Supabase en la nube se activa en
-- Database → Extensions → pg_cron (o con la línea de abajo).
-- Corre todos los días a las 3:00 a. m. hora de Lima (08:00 UTC).
-- =============================================================================

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'pac-purgar-transcripciones',
  '0 8 * * *',
  $$ select public.purgar_transcripciones(8); $$
);
