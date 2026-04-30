# syntax=docker/dockerfile:1.7
# Multi-stage build for the Fastify Bridge API, deployed as a Node container.
# Adapted from references/logisticsPractice/apps/api/Dockerfile.

FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/convex/package.json packages/convex/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/convex/ packages/convex/
COPY apps/api/ apps/api/

RUN pnpm --filter @enterprise-ai/shared build \
 && pnpm --filter @enterprise-ai/api build


FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/api/package.json apps/api/
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/src packages/shared/src
COPY --from=builder /app/packages/convex/package.json packages/convex/
COPY --from=builder /app/packages/convex/convex packages/convex/convex

RUN pnpm install --frozen-lockfile --prod

EXPOSE 3111

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3111/api/v1/health || exit 1

CMD ["node", "--enable-source-maps", "apps/api/dist/server.js"]

LABEL org.opencontainers.image.title="Enterprise AI Bridge API" \
      org.opencontainers.image.description="Fastify Bridge between the FE and Convex for the Enterprise AI Challenge"
