# syntax=docker/dockerfile:1

# ── Dependencias completas + build ───────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# `prisma generate` (postinstall) solo necesita el schema, no la base de datos.
RUN npm ci

COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

# ── Dependencias de producción ───────────────────────────────────────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# prisma CLI y typescript son peer deps opcionales de @prisma/client: no hacen
# falta en ejecución porque el cliente generado ya está empaquetado en dist.
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

# ── Imagen final ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health/ready || exit 1

CMD ["node", "--enable-source-maps", "dist/server.js"]
