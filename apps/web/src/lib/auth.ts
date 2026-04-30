/**
 * Bridge JWT helper. Convex Auth stores the access token in
 * `localStorage` under a fixed key (`__convexAuthJWT`). Reading it lets us
 * forward the same token as `Authorization: Bearer ...` to Fastify so
 * Convex and the Bridge agree on the calling user.
 *
 * On the server during SSR there is no localStorage; calls return null
 * and the Bridge fetch returns `unauthenticated`, which the FE treats
 * as "show sign-in".
 */

const STORAGE_KEY = '__convexAuthJWT'

export function readAuthJwt(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
