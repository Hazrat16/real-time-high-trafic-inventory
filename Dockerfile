# syntax=docker/dockerfile:1

# ---------- base: Node + pnpm + openssl (required by Prisma) ----------
FROM node:20-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@9.15.0
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------- build: install deps, typecheck, build every workspace ----------
# Also used by CI as the integration-test runner image.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
 && pnpm --filter @inventory/web run typecheck

# ---------- server: API + Socket.io ----------
FROM base AS server
ENV NODE_ENV=production
COPY --from=build /app /app
COPY deploy/server-entrypoint.sh /usr/local/bin/server-entrypoint.sh
RUN chmod +x /usr/local/bin/server-entrypoint.sh
WORKDIR /app/apps/server
EXPOSE 5000
ENTRYPOINT ["server-entrypoint.sh"]
CMD ["node", "dist/index.js"]

# ---------- web: static build served by nginx, proxies API to server ----------
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
