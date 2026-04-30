# syntax=docker/dockerfile:1.7
# Multi-stage build for the TanStack Start web app, deployed as a Node SSR
# container. Adapted from references/logisticsPractice/apps/dashboard/Dockerfile,
# but the runner uses node:22-alpine to host Nitro's server output instead of
# nginx serving a static dist/.

FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# Copy workspace manifests first so the dependency layer caches well.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# Copy sources after install so source edits don't bust the install layer.
COPY apps/web/ apps/web/

# VITE_* values are baked into the client bundle at build time, so they
# must arrive as Docker build args (Dokploy "Build-time Arguments") and
# be promoted to ENV before `vite build` runs.
ARG VITE_CONVEX_URL
ARG VITE_API_BASE
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL} \
    VITE_API_BASE=${VITE_API_BASE} \
    VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}

RUN pnpm --filter @enterprise-ai/web build


FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Nitro's Node preset writes a self-contained server bundle to .output/.
# We only need the .output tree at runtime; node_modules are bundled in.
COPY --from=builder /app/apps/web/.output ./.output

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", ".output/server/index.mjs"]

LABEL org.opencontainers.image.title="Enterprise AI Web" \
      org.opencontainers.image.description="TanStack Start SSR app for the Enterprise AI Challenge"
