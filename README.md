# PAC · Plataforma de Apoyo Comercial

CRM con IA para equipos de venta pequeños. Web en React + Vite, servidor en Node + Express, base de datos y login en Supabase.

```
apps/web       Panel (React + Vite)
apps/server    Servidor y API (/api), sirve la web en producción
supabase/      Migraciones de la base de datos y datos iniciales por cliente
marcas/        Logo, colores y nombre de cada empresa (se elige con MARCA)
```

## Correrlo en tu computadora

1. Copia `.env.example` como `.env` y completa los valores de tu proyecto Supabase.
2. `npm install`
3. `npm run dev` y abre http://localhost:5173

Los usuarios se crean en Supabase → Authentication → Add user. El primero queda como admin.

## Base de datos (Supabase CLI)

Los cambios de la base de datos viven en `supabase/migrations/` y se aplican con la CLI, nunca a mano:

1. `npx supabase login` (una vez por computadora)
2. `npm run db:vincular -- --project-ref <ref>` (una vez por proyecto; `<ref>` es lo que va antes de `.supabase.co`)
3. `npm run db:estado` muestra qué migraciones faltan y `npm run db:subir` las aplica en orden.

Los datos iniciales de cada empresa (`supabase/seeds/<empresa>.sql`) se cargan una sola vez al instalar.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `MARCA` | build y servidor | Carpeta de `marcas/` (logo, colores, Ozonar) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | build (públicas) | Conexión a Supabase desde la web; el servidor las reutiliza |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor (privada) | Solo para gestionar el equipo (crear, editar, eliminar usuarios) |
| `GEMINI_API_KEY` | servidor (privada) | Copiloto de reuniones, Asistente y puntuación de Ozonar |
| `GRANOLA_API_KEY` | servidor (privada) | Bandeja de reuniones grabadas |
| `GOOGLE_PLACES_API_KEY`, `TAVILY_API_KEY` | servidor (privadas) | Ozonar |
| `GEMINI_MODEL`, `GEMINI_MODEL_RESPALDO`, `GEMINI_MODEL_ASISTENTE` | servidor (opcionales) | Cambiar de modelo sin tocar código |

## Publicar con Docker (EasyPanel)

1. Crear la app desde este repositorio con el `Dockerfile` de la raíz.
2. Build args: `MARCA`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Variables de entorno del contenedor: las privadas de la tabla (nunca como build args).
4. Puerto 3000. Salud: `/api/healthz`.
5. Base de datos: `npm run db:vincular -- --project-ref <ref>` y `npm run db:subir`; luego cargar `supabase/seeds/<empresa>.sql` una vez.
