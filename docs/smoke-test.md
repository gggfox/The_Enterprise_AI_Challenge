# End-to-end smoke test

A scripted walk that exercises every load-bearing piece of the stack
(reactive read, Bridge write with ABAC, role mutation, OpenObserve wide
event). Run this after first checkout and after any change that touches
auth, the Bridge, or Convex.

## 0 -- Prereqs

```bash
# From repo root
cp .env.example .env
# Fill in:
#   BRIDGE_API_KEY, ADMIN_API_KEY (openssl rand -hex 32 each)
#   CLERK_ISSUER_URL          (Clerk Dashboard -> API keys -> Frontend API URL)
#   VITE_CLERK_PUBLISHABLE_KEY (same dashboard page; pk_test_...)
# Leave CONVEX_URL and VITE_CONVEX_URL blank for now -- step 1 fills them.
#
# In the Clerk dashboard you also need to:
#   - Enable Google + Microsoft (Entra multi-tenant) + Microsoft (consumer)
#     under Social Connections.
#   - Enable Email-code (OTP) under Email, phone, username.
#   - Create a JWT template named "convex" (Convex preset, audience=convex)
#     under JWT Templates.

pnpm install
```

## 1 -- Provision Convex (one-time)

```bash
pnpm -F @enterprise-ai/convex dev
```

This logs you into Convex, creates a deployment, runs codegen (replacing
the stub `_generated/` files), and starts the dev push loop. Copy the
deployment URL it prints into `CONVEX_URL` and `VITE_CONVEX_URL` in
`.env`. Leave the command running in another terminal.

## 2 -- Boot the Bridge + observability stack

```bash
docker compose -f infra/docker-compose.yml up -d openobserve
pnpm -F @enterprise-ai/api dev
```

OpenObserve UI: <http://localhost:5080> (login with
`ZO_ROOT_USER_EMAIL` / `ZO_ROOT_USER_PASSWORD` from `.env`).

Bridge health: `curl -s http://localhost:3111/api/v1/health` should
return `{"status":"ok",...}`.

## 3 -- Boot the FE

```bash
pnpm -F @enterprise-ai/web dev
```

Open <http://localhost:3000>.

## 4 -- Sign-in flow

- Sign in via the prebuilt Clerk card (Google, Microsoft, or email
  code). On success, AppShell calls `users.ensureProvisioned` which
  JIT-creates the Convex `users` row with `roles: ['user']`.
- Top bar should show your email and `roles: user`.

## 5 -- Bootstrap the first admin

Either via Bruno (open `apps/api/bruno/Admin/promote-admin.bru`, set
`{{userEmail}}`, send) or CLI:

```bash
curl -s -X POST http://localhost:3111/api/v1/admin/seed/promote-admin \
  -H "x-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"YOUR_EMAIL"}'
```

(The target email must have signed in to Clerk at least once -- the
mutation looks up `users` by email, and the row is only created on
first authenticated call.)

The Convex public mutation `seed.promoteAdminByEmail` has a zero-admin
gate: while no admin exists, anyone can call it; once an admin is set,
subsequent promotions require a Bearer JWT belonging to an existing
admin.

After this, refresh the FE -- the **Admin** nav link appears and the
top bar shows `roles: admin`.

## 6 -- Reactive read (no Bridge involved)

- Navigate to `/prompts`.
- Open the page in a second browser (or incognito) and sign in as
  another user.
- In window A, click **New prompt**, fill in title/body, submit.
- Window B's list updates **without a refresh** -- this proves the
  Convex websocket subscription is alive.

## 7 -- Authoring + ABAC predicate

- In window A (the author), the prompt row shows **Edit / Archive /
  Delete** buttons.
- In window B (non-author, non-admin role `user`), the same prompt row
  shows **none** of those buttons -- the FE called `can(user,
  'update', 'prompt', prompt)` and got `false` because `authorId !==
  user._id`.
- In Bruno, open `Prompts/update-forbidden.bru`, set `bearerJwt` to
  window B's user, set `promptId` to window A's prompt, send.
  Expect `403` with body
  `{"error":{"reason":"forbidden","action":"update","resource":"prompt"}}`.

## 8 -- Role assignment via Bridge

- In window A (admin), navigate to `/admin`.
- Toggle the `moderator` role on window B's user.
- The mutation goes through the Bridge:
  `apiFetch('/api/v1/users/roles', ..., { jwt })` →
  `api.users.setRoles` (Convex re-checks `can(admin, 'update',
  'user')`).
- Window B refreshes (Convex reactive read): top bar updates to show
  `roles: user, moderator`.
- The Bruno **Update prompt (forbidden)** request now succeeds with
  `200` because moderators have `prompt.update = true` in the
  permissions matrix.

## 9 -- Observability check

- Open <http://localhost:5080>, navigate to **Logs** stream `default`.
- Filter on `kind=http_request`. Each prompt write should appear as one
  row with `route`, `status`, `duration_ms`, `user_id`, `user_roles`.
- Filter on `kind=web_vital`. After interacting with the FE for a few
  seconds, `LCP` / `INP` rows should be present (only if you've
  manually wired the FE web-vitals beacon -- otherwise this stays
  empty, which is expected for the bridge-only observability scope).
- Filter on `level=error` to confirm error-path wide events fire on
  `403` / `401` requests.

## 10 -- Tear down

```bash
docker compose -f infra/docker-compose.yml down
# leave OpenObserve volume to keep history between runs
```

## Failure-mode checklist

If any step fails, check in this order:

1. `pnpm typecheck` -- all four packages green?
2. `pnpm lint:no-role-checks` -- any drift outside `packages/shared/src/auth/`?
3. Bridge logs (`pnpm -F @enterprise-ai/api dev` terminal) -- look for
   `jwt verification failed` (issuer/audience mismatch -- verify
   `CLERK_ISSUER_URL` matches Clerk Dashboard -> API keys, and that the
   "convex" JWT template exists with audience `convex`).
4. Browser devtools network tab -- the Bridge fetch should send
   `Authorization: Bearer <jwt>`. If missing, `useAuthedFetch`'s
   `getToken({ template: 'convex' })` returned null (the template
   doesn't exist in the Clerk dashboard, or Clerk hasn't loaded yet --
   reload the page).
5. Convex dashboard logs -- `forbidden` from `_shared/identity.ts` →
   the Bridge passed the predicate but Convex disagreed. Usually means
   the user row's `roles` is stale, or `ensureProvisioned` hasn't run
   yet for a brand-new Clerk user.
