/**
 * Read-only analytics queries that back the Voice Agent's tool calls.
 *
 * The Deepgram agent emits `query_sales` tool calls; the FE forwards
 * them to `querySales` here. Everything reads from the precomputed
 * `rollup_*` tables -- raw `transactions` are reserved for drill-downs.
 *
 * No role gate: signed-in is enforced upstream because Convex queries
 * from the browser carry the Clerk JWT, but we don't restrict by role.
 * The data is fictional retail data; tightening this is a follow-up.
 */

import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { type QueryCtx, query } from './_generated/server'

export const listStores = query({
  args: {},
  handler: async (ctx) => {
    const stores = await ctx.db.query('stores').collect()
    return stores
      .map((s) => ({
        code: s.code,
        name: s.name_es,
        city: s.city,
        region: s.region,
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
  },
})

export const listRegions = query({
  args: {},
  handler: async (ctx) => {
    const stores = await ctx.db.query('stores').collect()
    return Array.from(new Set(stores.map((s) => s.region))).sort()
  },
})

/**
 * Most recent dateKey present in `rollup_daily_store_sales`. Used as
 * the anchor for "last N days" so demos against the seeded fixtures
 * (which end somewhere in the past) still show populated charts.
 */
export const latestDate = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('rollup_daily_store_sales').take(1000)
    let max: string | null = null
    for (const r of rows) if (max === null || r.dateKey > max) max = r.dateKey
    return max
  },
})

function dateKeysBack(latest: string, days: number): string[] {
  const [yStr, mStr, dStr] = latest.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const d = Number(dStr)
  const base = new Date(Date.UTC(y, m - 1, d))
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(base)
    dt.setUTCDate(dt.getUTCDate() - i)
    const yy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    out.push(`${yy}-${mm}-${dd}`)
  }
  return out
}

type SalesSeriesRow = {
  date: string
  revenue: number
  transactions: number
  units: number
}

type QuerySalesResult =
  | {
      ok: true
      scope_label: string
      date_range: string
      total_revenue_mxn: number
      total_transactions: number
      total_units: number
      series: SalesSeriesRow[]
    }
  | { ok: false; error: string; scope_label: string }

type StoreDoc = {
  _id: Id<'stores'>
  code: string
  name_es: string
  region: string
}

function resolveScope(
  scope: string,
  allStores: StoreDoc[],
): { storeIds: Id<'stores'>[]; label: string } {
  const trimmed = scope.trim()
  if (trimmed === '' || trimmed === 'all') {
    return { storeIds: allStores.map((s) => s._id), label: 'all stores' }
  }
  if (trimmed.startsWith('store:')) {
    const code = trimmed.slice('store:'.length)
    const matched = allStores.filter((s) => s.code === code)
    return {
      storeIds: matched.map((s) => s._id),
      label: matched[0]?.name_es ?? code,
    }
  }
  if (trimmed.startsWith('region:')) {
    const region = trimmed.slice('region:'.length)
    const matched = allStores.filter((s) => s.region === region)
    return { storeIds: matched.map((s) => s._id), label: `region ${region}` }
  }
  const byCode = allStores.filter((s) => s.code === trimmed)
  if (byCode.length > 0) {
    return {
      storeIds: byCode.map((s) => s._id),
      label: byCode[0]?.name_es ?? trimmed,
    }
  }
  const byRegion = allStores.filter((s) => s.region === trimmed)
  if (byRegion.length > 0) {
    return {
      storeIds: byRegion.map((s) => s._id),
      label: `region ${trimmed}`,
    }
  }
  return { storeIds: [], label: trimmed }
}

type Bucket = { revenue: number; transactions: number; units: number }

async function aggregateSales(
  ctx: QueryCtx,
  storeIds: Id<'stores'>[],
  dates: string[],
  from: string,
  to: string,
): Promise<Record<string, Bucket>> {
  const acc: Record<string, Bucket> = {}
  for (const d of dates) acc[d] = { revenue: 0, transactions: 0, units: 0 }
  for (const sid of storeIds) {
    const rows = await ctx.db
      .query('rollup_daily_store_sales')
      .withIndex('by_store_date', (q) =>
        q.eq('storeId', sid).gte('dateKey', from).lte('dateKey', to),
      )
      .collect()
    for (const r of rows) {
      const cell = acc[r.dateKey]
      if (!cell) continue
      cell.revenue += r.revenueMxn
      cell.transactions += r.transactions
      cell.units += r.units
    }
  }
  return acc
}

export const querySales = query({
  args: {
    // "all" | "region:CDMX" | "store:CDMX-POL" | bare region/code as fallback
    scope: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { scope, days }): Promise<QuerySalesResult> => {
    const D = Math.max(1, Math.min(days ?? 7, 365))

    const probe = await ctx.db.query('rollup_daily_store_sales').take(1000)
    let latest: string | null = null
    for (const r of probe) {
      if (latest === null || r.dateKey > latest) latest = r.dateKey
    }
    if (latest === null) {
      return { ok: false, error: 'no_data', scope_label: scope }
    }
    const dates = dateKeysBack(latest, D)
    const from = dates[0]
    const to = dates[dates.length - 1]
    if (from === undefined || to === undefined) {
      return { ok: false, error: 'no_data', scope_label: scope }
    }

    const allStores = (await ctx.db.query('stores').collect()) as StoreDoc[]
    const { storeIds, label: scope_label } = resolveScope(scope, allStores)
    if (storeIds.length === 0) {
      return { ok: false, error: 'unknown_scope', scope_label }
    }

    const acc = await aggregateSales(ctx, storeIds, dates, from, to)

    const series: SalesSeriesRow[] = dates.map((d) => {
      const cell = acc[d] ?? { revenue: 0, transactions: 0, units: 0 }
      return {
        date: d,
        revenue: cell.revenue,
        transactions: cell.transactions,
        units: cell.units,
      }
    })

    return {
      ok: true,
      scope_label,
      date_range: `${from}..${to}`,
      total_revenue_mxn: series.reduce((a, b) => a + b.revenue, 0),
      total_transactions: series.reduce((a, b) => a + b.transactions, 0),
      total_units: series.reduce((a, b) => a + b.units, 0),
      series,
    }
  },
})
