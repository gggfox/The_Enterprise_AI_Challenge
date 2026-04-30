/**
 * Bootstrap helpers for the hackathon demo.
 *
 * `promoteAdminByEmail` is a *public* mutation guarded by a zero-admin
 * rule: anyone can call it while the deployment has no admin yet. Once
 * an admin exists, callers must be an admin themselves. The Bridge
 * exposes this behind ADMIN_API_KEY so Bruno can drive it; locally you
 * can also call:
 *
 *     npx convex run seed:promoteAdminByEmail '{"email":"you@example.com"}'
 *
 * Note: the target user must have signed in to Clerk at least once so
 * the JIT-create has populated their `users` row. Until then the email
 * lookup returns `not_found`.
 */

import { ROLES, isRole } from '@enterprise-ai/shared/auth'
import { ConvexError, v } from 'convex/values'
import { mutation } from './_generated/server'
import { authorize, requireUser, toAuthUser } from './_shared/identity'

export const promoteAdminByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const adminCount = await countAdmins(ctx)
    if (adminCount > 0) {
      const caller = await requireUser(ctx)
      // Bootstrap path: once an admin exists, only admins may run this.
      // Calling `authorize` with no data argument means predicate rules
      // (e.g. user.user.update for self-edit) cannot satisfy the check;
      // only admin's unconditional `true` rule passes.
      authorize(toAuthUser(caller), 'update', 'user')
    }

    const target = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', args.email))
      .unique()
    if (!target) {
      throw new ConvexError({
        reason: 'not_found' as const,
        resource: 'users',
      })
    }
    const existing = ((target.roles ?? []) as readonly string[]).filter(isRole)
    if (existing.includes(ROLES.admin)) {
      return { _id: target._id, roles: existing, changed: false }
    }
    const next = [...existing, ROLES.admin]
    await ctx.db.patch(target._id, { roles: next })
    return { _id: target._id, roles: next, changed: true }
  },
})

export const backfillDefaultRoles = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    // A different shape on purpose: this one requires a Convex env-var
    // secret to discourage casual invocation. Set with:
    //   npx convex env set SEED_SECRET <random>
    const expected = process.env.SEED_SECRET
    if (!expected || args.secret !== expected) {
      throw new ConvexError({
        reason: 'forbidden' as const,
        action: 'update',
        resource: 'users',
      })
    }
    const all = await ctx.db.query('users').collect()
    let changed = 0
    for (const u of all) {
      if (!Array.isArray(u.roles)) {
        await ctx.db.patch(u._id, { roles: [ROLES.user] })
        changed += 1
      }
    }
    return { scanned: all.length, changed }
  },
})

async function countAdmins(ctx: {
  db: {
    query: (table: 'users') => {
      collect: () => Promise<{ roles?: string[] }[]>
    }
  }
}): Promise<number> {
  const all = await ctx.db.query('users').collect()
  let n = 0
  for (const u of all) {
    if ((u.roles ?? []).includes(ROLES.admin)) n += 1
  }
  return n
}
