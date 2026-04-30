# Inspiration & Lineage

This project is being assembled from patterns observed in two reference projects
that live under the top-level `references/` folder (each is its own
independent git clone, not tracked by this repo):

- `references/logisticsPractice` — https://github.com/gggfox/logisticsPractice
- `references/Tavli`             — https://github.com/gggfox/Tavli

The references are read-only inspiration. Code is **adapted**, not copied
verbatim. Always re-implement to fit this project's needs and conventions.

## Reference snapshot

The SHAs below are the upstream commits in effect when this project was first
scaffolded. To inspect the exact state we drew from, run:

```bash
git -C references/logisticsPractice checkout <sha>
git -C references/Tavli              checkout <sha>
```

| Reference          | Pinned commit                                | Subject                                                            |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| logisticsPractice  | `24ea551f7d69910bd82ac3f8dab218b2a2ddec3f`   | remove topbar from dashboard                                       |
| Tavli              | `df29f7e4377271304c6b03faf12dd4411a12b895`   | Enhance order and payments features with localization and UI improvements |

To refresh both clones to upstream `main`, run `./update-refs.sh` from the
repo root. Bump the SHAs above whenever you intentionally adopt a newer
snapshot as the lineage anchor.

## Patterns adopted

### From `logisticsPractice`

- **pnpm + Turborepo monorepo layout** — `apps/`, `packages/`, `infra/`, `scripts/`, `docs/`.
- **Biome** for unified lint + format (`biome.json`).
- **Quality gates**: `jscpd` (copy-paste detection, `.jscpd.json`), `knip` (dead code, `knip.json`), Husky pre-commit hooks (`.husky/`).
- **Convex split into a workspace package** (`packages/convex/`) so multiple apps can share schema/queries/mutations.
- **Bridge API style** — Fastify + Zod schemas, `x-api-key` header auth, REST endpoints versioned under `/api/v1/`.
- **Deploy story** — Docker Compose (`docker-compose.yml`, `docker-compose.dev.yml`) + Dokploy on a Hostinger VPS, with Traefik handling Let's Encrypt TLS. GitHub webhook triggers redeploys.
- **Observability** — OTLP wide-event logs to a self-hosted SigNoz, with a documented field catalog (`docs/observability.md`).
- **Cursor rules** — pre-existing `.cursor/` folder of agent guidance per repo.

### From `Tavli`

- **TanStack Router** with file-based routes (`src/routes/`) and `__root.tsx` layout.
- **TanStack Query + TanStack Store** for data fetching and shared state.
- **Convex env conventions** — `CONVEX_ENV` (`development`/`staging`/`production`) gates dev-only features such as the role switcher; queries return `NOT_AUTHORIZED` when the env is wrong.
- **Stripe + Stripe Connect dual-webhook split** — `POST /stripe/webhook` for standard events, `POST /stripe/connect-webhook` for Connect thin events, each with its own webhook secret.
- **Local Stripe forwarding** — documented `stripe listen` invocations for both surfaces.
- **Testing stack** — Vitest unit/component (`pnpm test`), coverage variant for CI (`pnpm test:coverage`), Playwright E2E (`playwright.config.ts`, `pnpm test:e2e`).
- **Doc hygiene** — `.markdownlint.json`, `.prettierrc.json`, `documentation/runbooks/` for go-live procedures.

### Backend, ABAC, and observability scaffold

- **Convex workspace package** (`packages/convex/`) with package-level `exports` for `_generated/api`, `_generated/server`, `_generated/dataModel`, and `schema.ts` — adapted from `logisticsPractice/packages/convex/`.
- **Fastify Bridge layout** (`apps/api/src/{config,otel,logger,server}.ts`, `apps/api/src/plugins/`, `apps/api/src/routes/`, `apps/api/src/services/`) and the boot-time-logged singleton config pattern — adapted from `logisticsPractice/apps/api/src/`.
- **Pino → OTel log bridge** that bypasses `pino transport` to keep one in-process OTel SDK (`apps/api/src/logger.ts`) — adapted from `logisticsPractice/apps/api/src/logger.ts`.
- **Wide-event per-request logging** with success sampling + slow threshold (`apps/api/src/plugins/wide-event.ts`) — adapted from `logisticsPractice/apps/api/src/plugins/wide-event.ts`.
- **Convention-by-prefix auth plugin**: bypass `/health`, `x-api-key` for `/admin`, `/webhooks`, `/internal`; Bearer JWT verified via Convex JWKS for everything else (`apps/api/src/plugins/auth.ts`) — structurally adapted from `logisticsPractice/apps/api/src/plugins/api-key-auth.ts`, with Convex Auth Bearer verification swapped in for the static API keys logisticsPractice uses.
- **Bruno collection at `apps/api/bruno/`** with one folder per auth surface and a `*-forbidden.bru` variant per ABAC-gated mutation — adapted from `logisticsPractice/apps/api/bruno/`.
- **Convex `auth.config.ts` shape and dedicated `convex/_shared/` helper folder** for `requireUser` / `authorize` / `requireDoc` helpers — adapted from `references/Tavli/convex/auth.config.ts` and `references/Tavli/convex/_shared/`.
- **Convex Auth wiring** in `packages/convex/convex/{auth.ts,http.ts}` (Password + Anonymous providers exposed via `convexAuth` and HTTP routes registered via `auth.addHttpRoutes(http)`) — original to this project; Tavli uses Clerk so the surface is similar but the issuer differs.
- **OpenObserve container** in `infra/docker-compose.yml` (`public.ecr.aws/zinclabs/openobserve`) — original to this project; replaces logisticsPractice's SigNoz stack because of the documented memory issues in the SigNoz collector at hackathon scale.
- **Tuple-shaped `Result<S, E>` + `ok` / `err` utilities** and the **hybrid `AppError` taxonomy** (`packages/shared/src/{result,errors}.ts`) — original to this project, per the spec captured in the planning chat.
- **`useApiQuery` / `useApiMutation` hooks** that throw a marker error inside the TanStack Query `queryFn` to keep retry/cache machinery while exposing a typed `error: AppError | null` (`apps/web/src/lib/api/`) — original to this project.
- **ABAC permission system** in `packages/shared/src/auth/` (`as const` `ROLES` / `PERMISSIONS` / `ResourceMap`, typed `can(user, action, resource, data?)`) plus the **`scripts/no-role-checks.sh` pre-commit lint** that bans raw `user.roles.includes(...)` outside the auth folder — original to this project.

## How to use this doc

When you lift a pattern into this project, append a one-liner here:

```markdown
- <pattern> — adapted from `<reference>/<path>` at SHA `<sha>`
```

That keeps the lineage explicit even after the references drift far from this
project's eventual shape.
