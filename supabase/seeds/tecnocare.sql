-- =============================================================================
-- Datos de TECNOCARE (solo para su instalación; otro cliente usa su propio seed)
-- Catálogo de equipos SEDECAL según el material del proyecto.
-- Revisar nombres y descripciones con Víctor antes de cargar en producción.
-- =============================================================================

insert into public.productos (nombre, categoria, especialidad_objetivo, descripcion, mostrar_en_web) values
  ('Ozonette',              'equipo', 'General',       'Generador de ozono médico de uso general.',                 true),
  ('Ozonette Dent',         'equipo', 'Odontología',   'Generador de ozono médico para odontología.',               true),
  ('Ozonette Woman Care',   'equipo', 'Ginecología',   'Generador de ozono médico para ginecología.',               true),
  ('Ozonette Vet',          'equipo', 'Veterinaria',   'Generador de ozono médico para veterinaria.',               true),
  ('OM-302 D',              'equipo', 'General',       'Equipo de ozono de mayor capacidad.',                       true),
  ('Ozonobaric P',          'equipo', 'General',       'Equipo de ozono de mayor capacidad.',                       true)
on conflict (nombre) do nothing;
