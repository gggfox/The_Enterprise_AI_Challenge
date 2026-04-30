# Enterprise AI Challenge

pnpm + Turborepo monorepo with:

- `apps/web` — TanStack Start FE (React 19, Vite, React Compiler)
- `apps/api` — Fastify Bridge with OTLP wide-event observability
- `packages/convex` — Convex schema + functions, exported as a workspace package
- `packages/shared` — Tuple-shaped `Result`, `AppError` taxonomy, ABAC permissions
- `infra/docker-compose.yml` — `web`, `api`, `openobserve`

## Architecture

- **Reactive reads** stream from Convex's websocket directly to the browser.
- **All writes** go FE → Fastify Bridge → Convex. The Bridge enforces
  ABAC, emits an OTLP wide event, and forwards the user's Convex Auth
  JWT so Convex re-checks the same predicate (defense-in-depth).
- **Convention-by-prefix auth** on the Bridge:
  `/api/v1/health` bypass, `/admin/**` and `/webhooks/**` require
  `x-api-key`, everything else requires `Authorization: Bearer
  <convexJWT>`.
- **ABAC** lives in `packages/shared/src/auth/permissions.ts` as
  `as const` config. One typed `can(user, action, resource, data?)`
  API. Direct role checks are forbidden by `pnpm
  lint:no-role-checks` (pre-commit hook).

See [docs/inspiration.md](docs/inspiration.md) for the full lineage of
patterns adapted from `references/logisticsPractice` and
`references/Tavli`.

## First-run setup

```bash
cp .env.example .env
# Fill BRIDGE_API_KEY and ADMIN_API_KEY (openssl rand -hex 32 each)

pnpm install
pnpm -F @enterprise-ai/convex dev
# Copy the deployment URL the CLI prints into CONVEX_URL and
# VITE_CONVEX_URL in .env.

docker compose -f infra/docker-compose.yml up -d openobserve
pnpm -F @enterprise-ai/api dev    # in one terminal
pnpm -F @enterprise-ai/web dev    # in another
```

Walk through [docs/smoke-test.md](docs/smoke-test.md) to exercise the
end-to-end flow (reactive read, ABAC denial, role assignment,
observability).

## Workspace scripts

```bash
pnpm typecheck            # turbo run typecheck across all packages
pnpm test                 # turbo run test across all packages
pnpm lint                 # biome check per-package
pnpm lint:no-role-checks  # forbid raw role checks outside auth/
pnpm format               # biome format --write .
```
