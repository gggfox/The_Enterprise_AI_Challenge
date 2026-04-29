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

## How to use this doc

When you lift a pattern into this project, append a one-liner here:

```markdown
- <pattern> — adapted from `<reference>/<path>` at SHA `<sha>`
```

That keeps the lineage explicit even after the references drift far from this
project's eventual shape.
