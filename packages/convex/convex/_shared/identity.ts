/**
 * Identity + authorization helpers shared by every public function.
 *
 * Identity is sourced from Clerk via Convex's first-class auth integration:
 * `ctx.auth.getUserIdentity()` returns the verified JWT claims (subject =
 * Clerk's `user_xxx`). We map subject -> Convex `users` row through the
 * `by_subject` index. Rows are JIT-created on first authenticated call by
 * `users.ensureProvisioned`; everything else assumes the row already
 * exists and throws `unauthenticated` if it doesn't (i.e. the FE forgot
 * to call ensureProvisioned, or the row was deleted).
 *
 * Convex doesn't ship a Result-flavored error type to the client, so we
 * use `ConvexError` with the same `reason` discriminant as the rest of
 * the system. The Fastify Bridge converts these into Result tuples on
 * the way out.
 */

import {
  type Action,
  type AuthUser,
  ROLES,
  type ResourceKey,
  type ResourceMap,
  type Role,
  can,
  isRole,
} from '@enterprise-ai/shared/auth'
import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

export type AnyCtx = QueryCtx | MutationCtx

/**
 * Resolve the calling user's Clerk identity. Throws `unauthenticated`
 * when no identity is present on the request.
 */
export async function requireIdentity(
  ctx: AnyCtx,
): Promise<{ subject: string; email?: string; name?: string; image?: string }> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError({ reason: 'unauthenticated' as const })
  }
  return {
    subject: identity.subject,
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.name ? { name: identity.name } : {}),
    ...(identity.pictureUrl ? { image: identity.pictureUrl } : {}),
  }
}

/**
 * Look up the `users` row for the calling identity. Returns null if the
 * row hasn't been provisioned yet -- callers that need to JIT-create it
 * (i.e. `ensureProvisioned`) handle the null branch; everyone else uses
 * `requireUser` and gets `unauthenticated` thrown.
 */
export async function findUserBySubject(
  ctx: AnyCtx,
  subject: string,
): Promise<(Doc<'users'> & { roles: readonly Role[] }) | null> {
  const row = await ctx.db
    .query('users')
    .withIndex('by_subject', (q) => q.eq('subject', subject))
    .unique()
  if (!row) return null
  const roles = ((row.roles ?? []) as readonly string[]).filter(isRole)
  return { ...row, roles } as Doc<'users'> & { roles: readonly Role[] }
}

/**
 * Resolve the calling user's `users` row. Throws `unauthenticated` when
 * either the JWT is missing or the row hasn't been provisioned yet.
 */
export async function requireUser(
  ctx: AnyCtx,
): Promise<Doc<'users'> & { roles: readonly Role[] }> {
  const { subject } = await requireIdentity(ctx)
  const user = await findUserBySubject(ctx, subject)
  if (!user) {
    throw new ConvexError({ reason: 'unauthenticated' as const })
  }
  return user
}

/**
 * Run an ABAC check; throw `forbidden` when denied. Caller passes the
 * resource record so predicate rules can evaluate ownership/state.
 */
export function authorize<R extends ResourceKey, A extends Action>(
  user: AuthUser,
  action: A,
  resource: R,
  data?: ResourceMap[R],
): void {
  if (!can(user, action, resource, data)) {
    throw new ConvexError({
      reason: 'forbidden' as const,
      action,
      resource,
    })
  }
}

/**
 * Convenience: load a doc by id, throw `not_found` if missing.
 */
export async function requireDoc<T extends 'users' | 'prompts'>(
  ctx: AnyCtx,
  table: T,
  id: Id<T>,
): Promise<Doc<T>> {
  const doc = await ctx.db.get(id)
  if (!doc) {
    throw new ConvexError({
      reason: 'not_found' as const,
      resource: table,
    })
  }
  return doc as unknown as Doc<T>
}

/**
 * Project a Convex `users` Doc into the `AuthUser` shape used by the
 * shared `can()` function. Keeps the ABAC config decoupled from
 * Convex's id/branding types.
 */
export function toAuthUser(user: {
  _id: Id<'users'>
  roles: readonly string[]
}): AuthUser {
  return {
    _id: String(user._id),
    roles: user.roles.filter(isRole) as readonly Role[],
  }
}

export { ROLES }
