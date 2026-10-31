# PAC · Plataforma de Apoyo Comercial

CRM con IA para equipos de venta pequeños. Web en React + Vite, servidor en Node + Express, base de datos y login en Supabase.

```
apps/web       Panel (React + Vite)
apps/server    Servidor y API (/api), sirve la web en producción
supabase/      Migraciones de la base de datos y datos iniciales por cliente
```

## Correrlo en tu computadora

1. Copia `.env.example` como `.env` y completa los valores de tu proyecto Supabase.
2. `npm install`
3. `npm run dev` y abre http://localhost:5173

Los usuarios se crean en Supabase → Authentication → Add user. El primero queda como admin.
