/**
 * Prompts -- demo resource for the ABAC pattern.
 *
 * The reactive read (`list`) is consumed directly by the FE via Convex's
 * websocket. All writes go through the Fastify Bridge, which forwards
 * the user JWT so `ctx.auth.getUserIdentity()` resolves the same user
 * here. Each public mutation re-checks `can(...)` for defense in depth.
 */

import { canMaybe } from '@enterprise-ai/shared/auth'
import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  authorize,
  requireDoc,
  requireUser,
  toAuthUser,
} from './_shared/identity'

const TITLE_MAX = 200
const BODY_MAX = 10_000

function validatePromptInput(args: {
  title: string
  body: string
}): string[] {
  const issues: string[] = []
  if (args.title.trim().length === 0) issues.push('title must not be empty')
  if (args.title.length > TITLE_MAX)
    issues.push(`title must be <= ${TITLE_MAX} chars`)
  if (args.body.length > BODY_MAX)
    issues.push(`body must be <= ${BODY_MAX} chars`)
  return issues
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireUser(ctx)
    if (!canMaybe(toAuthUser(caller), 'view', 'prompt')) {
      throw new ConvexError({
        reason: 'forbidden' as const,
        action: 'view',
        resource: 'prompt',
      })
    }
    const rows = await ctx.db.query('prompts').order('desc').take(100)
    // Hydrate author names so the FE can render without an extra round trip.
    const authorIds = Array.from(new Set(rows.map((r) => r.authorId)))
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)))
    const authorMap = new Map(
      authors
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => [a._id, a.name ?? a.email ?? 'unknown']),
    )
    return rows.map((r) => ({
      _id: r._id,
      authorId: r.authorId,
      authorName: authorMap.get(r.authorId) ?? 'unknown',
      title: r.title,
      body: r.body,
      archived: r.archived,
      _creationTime: r._creationTime,
    }))
  },
})

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx)
    const issues = validatePromptInput(args)
    if (issues.length > 0) {
      throw new ConvexError({ reason: 'validation_failed' as const, issues })
    }
    authorize(toAuthUser(caller), 'create', 'prompt')
    const id = await ctx.db.insert('prompts', {
      authorId: caller._id,
      title: args.title.trim(),
      body: args.body,
      archived: false,
    })
    return { _id: id }
  },
})

export const update = mutation({
  args: {
    id: v.id('prompts'),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx)
    const prompt = await requireDoc(ctx, 'prompts', args.id)
    authorize(toAuthUser(caller), 'update', 'prompt', {
      _id: String(prompt._id),
      authorId: String(prompt.authorId),
      archived: prompt.archived,
    })
    const next = {
      title: args.title ?? prompt.title,
      body: args.body ?? prompt.body,
      archived: args.archived ?? prompt.archived,
    }
    const issues = validatePromptInput(next)
    if (issues.length > 0) {
      throw new ConvexError({ reason: 'validation_failed' as const, issues })
    }
    await ctx.db.patch(args.id, next)
    return { _id: args.id }
  },
})

export const remove = mutation({
  args: { id: v.id('prompts') },
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx)
    const prompt = await requireDoc(ctx, 'prompts', args.id)
    authorize(toAuthUser(caller), 'delete', 'prompt', {
      _id: String(prompt._id),
      authorId: String(prompt.authorId),
      archived: prompt.archived,
    })
    await ctx.db.delete(args.id)
    return { _id: args.id }
  },
})
