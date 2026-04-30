/**
 * Retail seed: dumb-loader mutations driven by `scripts/run-seed.ts`.
 *
 * Why this is shaped as public mutations gated by `SEED_SECRET` rather
 * than a single big `action` that imports JSON: our fixtures total
 * ~60MB, well above Convex's per-request payload limits, and bundling
 * 60MB of JSON imports into the deployment bundle is not great either.
 * Instead, the CLI reads the JSON locally and pages chunks of ~500
 * docs through `insertChunk`. Foreign keys are rewritten *client-side*
 * by the CLI (synthetic id -> real Convex id) before each chunk lands
 * here, so this file stays oblivious to topology.
 *
 * Auth: same pattern as `seed.ts` -- a `SEED_SECRET` env var on the
 * Convex deployment must match the secret arg. Set it once with
 *   npx convex env set SEED_SECRET <random-string>
 * and put the same value in `.env` so the CLI can read it.
 */

import { ConvexError, v } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import { type MutationCtx, mutation } from './_generated/server'

const RETAIL_TABLES = [
  'categories',
  'products',
  'stores',
  'customers',
  'promotions',
  'transactions',
  'transaction_items',
  'inventory_movements',
  'rollup_daily_store_sales',
  'rollup_daily_store_category_sales',
  'rollup_hourly_store_sales',
  'rollup_product_monthly',
  'rollup_services_monthly',
  'rollup_geo_monthly',
] as const
type RetailTable = (typeof RETAIL_TABLES)[number]

const tableValidator = v.union(
  ...RETAIL_TABLES.map((t) => v.literal(t)),
) as ReturnType<typeof v.union>

function checkSecret(secret: string): void {
  const expected = process.env.SEED_SECRET
  if (!expected || secret !== expected) {
    throw new ConvexError({
      reason: 'forbidden' as const,
      action: 'create',
      resource: 'system',
    })
  }
}

function isRetailTable(table: string): table is RetailTable {
  return (RETAIL_TABLES as readonly string[]).includes(table)
}

/**
 * Delete up to `limit` rows from a single retail table. Convex
 * mutations have a write/time budget, so wiping 80k+ rows requires
 * the CLI to loop until `remaining === 0`.
 */
export const clearChunk = mutation({
  args: {
    secret: v.string(),
    table: tableValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret)
    if (!isRetailTable(args.table)) {
      throw new ConvexError({
        reason: 'validation_failed' as const,
        issues: [`unknown table: ${args.table}`],
      })
    }
    const limit = args.limit ?? 500
    const rows = await ctx.db
      .query(args.table as keyof DataModel)
      .take(limit)
    for (const row of rows) {
      await ctx.db.delete(row._id)
    }
    // Cheap "remaining" probe -- one extra read after deletion. Caller
    // loops until this is 0.
    const probe = await ctx.db
      .query(args.table as keyof DataModel)
      .take(1)
    return { deleted: rows.length, remaining: probe.length }
  },
})

/**
 * Insert a chunk of rows into a retail table. The schema validates
 * each row at insert time, so a structurally bad fixture trips here
 * with a Convex schema error. The CLI is responsible for rewriting
 * foreign keys (synthetic id -> real Convex id) before sending.
 *
 * Returns the inserted ids in order so the CLI can build its
 * synthetic-id -> real-id map.
 */
export const insertChunk = mutation({
  args: {
    secret: v.string(),
    table: tableValidator,
    rows: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret)
    if (!isRetailTable(args.table)) {
      throw new ConvexError({
        reason: 'validation_failed' as const,
        issues: [`unknown table: ${args.table}`],
      })
    }
    const ids: string[] = []
    for (const row of args.rows as Array<Record<string, unknown>>) {
      // Strip any synthetic `id` field; Convex assigns its own _id.
      const { id: _id, ...rest } = row
      void _id
      const newId = await (
        ctx as MutationCtx
      ).db.insert(args.table as keyof DataModel, rest as never)
      ids.push(newId as unknown as string)
    }
    return { ids }
  },
})

/**
 * Quick read-only summary used by the smoke-test script. Cheap and
 * idempotent. Counts are computed by `take()` until empty so they
 * can be off if a table has hundreds of thousands of rows -- but
 * Convex's `count` is via index walk anyway.
 */
export const counts = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    checkSecret(args.secret)
    const out: Record<string, number> = {}
    for (const t of RETAIL_TABLES) {
      // Walk the table in pages to count. Capped at 200k to avoid
      // accidental abuse; we only seed ~80k transactions max.
      let total = 0
      let cursor: string | null = null
      const pageSize = 5000
      while (total < 200_000) {
        const page = await ctx.db
          .query(t as keyof DataModel)
          .paginate({ cursor, numItems: pageSize })
        total += page.page.length
        if (page.isDone) break
        cursor = page.continueCursor
      }
      out[t] = total
    }
    return out
  },
})
