# Default Root Dockerfile for Railway & Render
# Builds and runs the ClaimBoard Production API backend.
# (For Web frontend deployment, use Dockerfile.web)

FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# --- Builder Stage ---
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/auth/package.json ./packages/auth/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY packages/auth ./packages/auth
COPY apps/api ./apps/api

RUN pnpm --filter @claimboard/config build
RUN pnpm --filter @claimboard/shared build
RUN pnpm --filter @claimboard/database build
RUN pnpm --filter @claimboard/auth build
RUN pnpm --filter @claimboard/api build

# --- Runner Stage ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 claimboard

COPY --from=builder --chown=claimboard:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=claimboard:nodejs /app/package.json ./package.json
COPY --from=builder --chown=claimboard:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=claimboard:nodejs /app/packages ./packages
COPY --from=builder --chown=claimboard:nodejs /app/apps/api ./apps/api

USER claimboard

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]

