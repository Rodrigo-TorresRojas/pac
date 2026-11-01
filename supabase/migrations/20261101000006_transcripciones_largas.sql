-- =============================================================================
-- PAC · Transcripciones largas: de 60 000 a 200 000 caracteres (unas 3 horas de reunión)
-- =============================================================================
alter table public.reuniones drop constraint if exists reuniones_transcripcion_check;
alter table public.reuniones add constraint reuniones_transcripcion_check
  check (length(transcripcion) <= 200000);
