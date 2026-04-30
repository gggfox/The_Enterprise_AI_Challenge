/**
 * Thin wrappers around `ConvexHttpClient` so route handlers don't have to
 * juggle JWT forwarding boilerplate.
 *
 * `userScopedConvex(jwt)` returns a per-request client whose calls run
 * with the user's identity (Convex `ctx.auth.getUserIdentity()` resolves
 * to the same row the Bridge resolved). `adminConvex()` is reserved for
 * seed/cron-style operations that authenticate as the deployment admin.
 */

import { ConvexHttpClient } from 'convex/browser'
import { config } from '../config.js'

export function userScopedConvex(jwt: string): ConvexHttpClient {
  const c = new ConvexHttpClient(config.convex.url)
  c.setAuth(jwt)
  return c
}

export function anonConvex(): ConvexHttpClient {
  return new ConvexHttpClient(config.convex.url)
}

/**
 * Anonymous client used for bootstrap operations like the first-admin
 * promotion. Convex mutations enforce their own gating (e.g. zero-admin
 * rule) so this client doesn't carry credentials.
 */
export function bootstrapConvex(): ConvexHttpClient {
  return new ConvexHttpClient(config.convex.url)
}
