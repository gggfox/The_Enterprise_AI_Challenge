# Bruno collection -- enterprise-ai-api

Open this folder in [Bruno](https://www.usebruno.com/) for an
auth-pre-configured client against the Bridge API.

## Layout

Folders mirror the Fastify auth-by-prefix policy:

| Folder       | Auth                  | Path prefix             |
| ------------ | --------------------- | ----------------------- |
| `Health`     | none (bypass)         | `/api/v1/health`        |
| `Users`      | Bearer (Clerk JWT)    | `/api/v1/users/**`      |
| `Prompts`    | Bearer (Clerk JWT)    | `/api/v1/prompts/**`    |
| `Admin`      | `x-api-key` admin     | `/api/v1/admin/**`      |
| `Webhooks`   | `x-api-key` bridge    | `/api/v1/webhooks/**`   |
| `Telemetry`  | none (CORS-gated)     | `/api/v1/telemetry/**`  |

## Environment

Edit `environments/local.bru` and fill the secrets:

- `bridgeApiKey`  -- value of `BRIDGE_API_KEY` in `.env`
- `adminApiKey`   -- value of `ADMIN_API_KEY` in `.env`
- `bearerJwt`     -- a Clerk-issued JWT (template: `convex`) for an
  authenticated user. Easiest way to grab one: open the FE in a browser,
  sign in via Clerk, then in the devtools console run
  `await window.Clerk.session.getToken({ template: 'convex' })` and copy
  the result.

## Demonstrating ABAC denials

Each `Prompts` request has a sibling `*-forbidden.bru` variant intended
to be run with a `bearerJwt` belonging to a non-author non-admin user.
Expect `403 forbidden` with `{ error: { reason: "forbidden", action,
resource } }`.
