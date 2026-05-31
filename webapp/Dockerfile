# syntax=docker/dockerfile:1
# Multi-stage build. Build context is the REPO ROOT (so the baseline /data CSVs — the
# single source of truth — are available to scripts/sync-data.mjs). See docker-compose.yml.

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
# Bring in the baseline catalog (source of truth) and the webapp sources.
COPY data ./data
COPY webapp ./webapp
WORKDIR /app/webapp
RUN npm ci
RUN npm run build   # runs sync-data (copies ../data/*.csv) then vite build → dist/

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime
# Static files only — there is no backend and no database, so user data has nowhere to
# live on the server. Everything the user creates stays in their browser (localStorage).
COPY webapp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/webapp/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
