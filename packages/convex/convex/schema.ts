/**
 * Convex schema.
 *
 * `users` is keyed by Clerk's stable subject claim (`user_xxx`). The row
 * is JIT-created on first authenticated call (see `users.ensureProvisioned`).
 * Everything else (email, name, image) is mirrored from the Clerk identity
 * the first time we see the user; a future webhook can keep them in sync.
 *
 * `roles: string[]` is the only DB-side state for the ABAC system.
 * Role values are constrained to `Role` from `@enterprise-ai/shared` at
 * write time -- the schema can't declare a TS literal union directly
 * because Convex validators are runtime-only.
 */

import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    // Clerk's `sub` claim, e.g. `user_2abcXYZ`. Stable across sessions.
    subject: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    roles: v.array(v.string()),
  })
    .index('by_subject', ['subject'])
    .index('email', ['email']),

  prompts: defineTable({
    authorId: v.id('users'),
    title: v.string(),
    body: v.string(),
    archived: v.boolean(),
  }).index('by_author', ['authorId']),
})
