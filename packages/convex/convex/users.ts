/**
 * Users -- read access for the FE (`/admin` page) and role assignment.
 *
 * `ensureProvisioned` is the JIT-create entry point: the web app calls
 * it once after Clerk reports `isSignedIn`, and that's how a fresh Clerk
 * user gets a `users` row. `me` is a pure query so the FE can subscribe
 * reactively; it returns null until provisioning has run, which the
 * AppShell handles as a "still loading" state.
 *
 * Role assignment is the ONE runtime mutation we expose for the auth
 * model -- creating new roles or permissions is a code-only change in
 * `packages/shared`. Only an admin can call `setRoles`.
 */

import { ALL_ROLES, DEFAULT_ROLES, isRole } from '@enterprise-ai/shared/auth'
import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  authorize,
  findUserBySubject,
  requireDoc,
  requireIdentity,
  requireUser,
  toAuthUser,
} from './_shared/identity'

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const user = await findUserBySubject(ctx, identity.subject)
    if (!user) return null
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      roles: user.roles,
    }
  },
})

/**
 * JIT-create the `users` row for the calling Clerk identity. Idempotent:
 * returns the existing row if one already exists for this subject.
 */
export const ensureProvisioned = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const existing = await findUserBySubject(ctx, identity.subject)
    if (existing) {
      return {
        _id: existing._id,
        email: existing.email ?? null,
        name: existing.name ?? null,
        roles: existing.roles,
      }
    }
    const _id = await ctx.db.insert('users', {
      subject: identity.subject,
      ...(identity.email ? { email: identity.email } : {}),
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.image ? { image: identity.image } : {}),
      roles: [...DEFAULT_ROLES],
    })
    const inserted = await ctx.db.get(_id)
    return {
      _id,
      email: inserted?.email ?? null,
      name: inserted?.name ?? null,
      roles: (inserted?.roles ?? []).filter(isRole),
    }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireUser(ctx)
    authorize(toAuthUser(caller), 'view', 'user')
    const rows = await ctx.db.query('users').collect()
    return rows.map((u) => ({
      _id: u._id,
      email: u.email ?? null,
      name: u.name ?? null,
      roles: (u.roles ?? []).filter(isRole),
    }))
  },
})

export const setRoles = mutation({
  args: {
    userId: v.id('users'),
    roles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx)
    const target = await requireDoc(ctx, 'users', args.userId)
    // Re-authorize with the target as resource. Only admin can update
    // arbitrary users; a non-admin user can update only themselves
    // (per `permissions.ts` user.user.update predicate).
    authorize(toAuthUser(caller), 'update', 'user', { _id: String(target._id) })

    // Validate role values against the canonical enum -- never trust the
    // wire-level string array.
    const invalid = args.roles.filter((r) => !isRole(r))
    if (invalid.length > 0) {
      throw new ConvexError({
        reason: 'validation_failed' as const,
        issues: invalid.map((r) => `unknown role: ${r}`),
      })
    }

    await ctx.db.patch(args.userId, { roles: args.roles })
    return { _id: args.userId, roles: args.roles }
  },
})

export const allRoles = query({
  args: {},
  handler: async () => ALL_ROLES,
})
