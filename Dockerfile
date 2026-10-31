# Etapa 1: instalar y compilar web + servidor
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci --no-audit --no-fund
COPY apps apps
COPY marcas marcas

# Las variables VITE_ son públicas y se incrustan en la web al compilar.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Carpeta de marcas/ que se usa (logo, colores, nombre).
ARG MARCA=plantilla
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" \
    || (echo "Faltan los build args VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY" >&2; exit 1)
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# Etapa 2: solo lo necesario para correr
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
