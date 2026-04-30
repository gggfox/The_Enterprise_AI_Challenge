/**
 * Seed CLI for the Mexican retail demo data.
 *
 * Usage:
 *   pnpm --filter @enterprise-ai/convex seed-retail            # seed if empty
 *   pnpm --filter @enterprise-ai/convex seed-retail -- --reset # wipe & seed
 *
 * Reads JSON fixtures from `packages/convex/fixtures/`, opens a
 * ConvexHttpClient against `$CONVEX_URL`, and pages chunks into
 * `seedRetail.insertChunk`. Foreign keys are rewritten *here* (synthetic
 * id like `cat_bebidas` -> the real Convex id returned by the previous
 * insert chunk) before each chunk lands on the server.
 *
 * Auth: `$SEED_SECRET` must match `process.env.SEED_SECRET` on the
 * Convex deployment. Set both:
 *   npx convex env set SEED_SECRET <random>           # in deployment
 *   echo 'SEED_SECRET=<random>' >> .env                # for the CLI
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api.js'

// ---- Config ------------------------------------------------------------

const FIXTURES_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', 'fixtures')
})()

const INSERT_CHUNK = 500
const CLEAR_CHUNK = 500

// Topological insert order. Tables earlier in the list are inserted
// first; later tables can reference them via foreign keys.
interface TableSpec {
  table: RetailTable
  fixtureFile: string
  // Which fields on each row are foreign keys, mapped to the synthetic
  // table whose id-map we use to rewrite them. `optional: true` skips
  // missing/undefined values rather than throwing.
  foreignKeys?: ReadonlyArray<{
    field: string
    sourceTable: RetailTable
    optional?: boolean
  }>
}

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

const INSERT_PLAN: ReadonlyArray<TableSpec> = [
  { table: 'categories', fixtureFile: 'categories.json' },
  {
    table: 'products',
    fixtureFile: 'products.json',
    foreignKeys: [{ field: 'categoryId', sourceTable: 'categories' }],
  },
  { table: 'stores', fixtureFile: 'stores.json' },
  { table: 'customers', fixtureFile: 'customers.json' },
  {
    table: 'promotions',
    fixtureFile: 'promotions.json',
    foreignKeys: [
      { field: 'scopeCategoryId', sourceTable: 'categories', optional: true },
    ],
  },
  {
    table: 'transactions',
    fixtureFile: 'transactions.json',
    foreignKeys: [
      { field: 'storeId', sourceTable: 'stores' },
      { field: 'customerId', sourceTable: 'customers', optional: true },
      { field: 'promoId', sourceTable: 'promotions', optional: true },
    ],
  },
  {
    table: 'transaction_items',
    fixtureFile: 'transaction_items.json',
    foreignKeys: [
      { field: 'transactionId', sourceTable: 'transactions' },
      { field: 'productId', sourceTable: 'products' },
    ],
  },
  {
    table: 'inventory_movements',
    fixtureFile: 'inventory_movements.json',
    foreignKeys: [
      { field: 'storeId', sourceTable: 'stores' },
      { field: 'productId', sourceTable: 'products' },
    ],
  },
  {
    table: 'rollup_daily_store_sales',
    fixtureFile: 'rollup_daily_store_sales.json',
    foreignKeys: [{ field: 'storeId', sourceTable: 'stores' }],
  },
  {
    table: 'rollup_daily_store_category_sales',
    fixtureFile: 'rollup_daily_store_category_sales.json',
    foreignKeys: [
      { field: 'storeId', sourceTable: 'stores' },
      { field: 'categoryId', sourceTable: 'categories' },
    ],
  },
  {
    table: 'rollup_hourly_store_sales',
    fixtureFile: 'rollup_hourly_store_sales.json',
    foreignKeys: [{ field: 'storeId', sourceTable: 'stores' }],
  },
  {
    table: 'rollup_product_monthly',
    fixtureFile: 'rollup_product_monthly.json',
    foreignKeys: [{ field: 'productId', sourceTable: 'products' }],
  },
  {
    table: 'rollup_services_monthly',
    fixtureFile: 'rollup_services_monthly.json',
  },
  { table: 'rollup_geo_monthly', fixtureFile: 'rollup_geo_monthly.json' },
] as const

// ---- Args & env --------------------------------------------------------

interface CliArgs {
  reset: boolean
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { reset: false, dryRun: false }
  for (const a of argv) {
    if (a === '--') continue // bare separator from pnpm
    if (a === '--reset') out.reset = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: tsx scripts/run-seed.ts [--reset] [--dry-run]\n' +
          '  --reset   wipe all retail tables before seeding\n' +
          '  --dry-run read fixtures but do not call Convex\n',
      )
      process.exit(0)
    } else {
      console.error(`unknown arg: ${a}`)
      process.exit(2)
    }
  }
  return out
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`missing env var: ${name}`)
    console.error('Make sure to run via `pnpm seed-retail` (which loads .env)')
    process.exit(1)
  }
  return v
}

// ---- Helpers -----------------------------------------------------------

function readFixture<T>(file: string): T[] {
  const path = join(FIXTURES_DIR, file)
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as T[]
}

function rewriteForeignKeys(
  rows: Array<Record<string, unknown>>,
  spec: TableSpec,
  idMaps: Map<RetailTable, Map<string, string>>,
): Array<Record<string, unknown>> {
  if (!spec.foreignKeys || spec.foreignKeys.length === 0) return rows
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row }
    for (const fk of spec.foreignKeys ?? []) {
      const synth = next[fk.field]
      if (synth === undefined || synth === null) {
        if (fk.optional) continue
        throw new Error(
          `missing required FK ${fk.field} on row in ${spec.table}: ${JSON.stringify(row)}`,
        )
      }
      const map = idMaps.get(fk.sourceTable)
      if (!map) {
        throw new Error(
          `id-map for ${fk.sourceTable} is missing -- insert order bug?`,
        )
      }
      const realId = map.get(String(synth))
      if (!realId) {
        throw new Error(
          `unmapped ${fk.sourceTable} id "${synth}" referenced by ${spec.table}.${fk.field}`,
        )
      }
      next[fk.field] = realId
    }
    return next
  })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US')
}

// ---- Clear -------------------------------------------------------------

async function clearAll(
  client: ConvexHttpClient,
  secret: string,
): Promise<void> {
  console.log('[seed] reset: wiping retail tables')
  // Delete in reverse topo order so cascading FKs are clean.
  const reversed = [...INSERT_PLAN].reverse()
  for (const spec of reversed) {
    let total = 0
    while (true) {
      const res = (await client.mutation(api.seedRetail.clearChunk, {
        secret,
        table: spec.table,
        limit: CLEAR_CHUNK,
      })) as { deleted: number; remaining: number }
      total += res.deleted
      if (res.remaining === 0) break
    }
    console.log(`  cleared ${spec.table.padEnd(36)} ${fmtNumber(total)} rows`)
  }
}

// ---- Insert ------------------------------------------------------------

async function seedAll(
  client: ConvexHttpClient,
  secret: string,
  dryRun: boolean,
): Promise<{ totals: Record<RetailTable, number> }> {
  const idMaps = new Map<RetailTable, Map<string, string>>()
  const totals = {} as Record<RetailTable, number>

  for (const spec of INSERT_PLAN) {
    const rawRows = readFixture<Record<string, unknown>>(spec.fixtureFile)
    const rows = rewriteForeignKeys(rawRows, spec, idMaps)
    const chunks = chunk(rows, INSERT_CHUNK)
    const synthIds = rawRows.map((r) => r.id as string | undefined)
    const realIds: string[] = []

    process.stdout.write(
      `  inserting ${spec.table.padEnd(36)} ${fmtNumber(rows.length).padStart(9)} rows `,
    )
    const t0 = Date.now()
    for (let i = 0; i < chunks.length; i += 1) {
      if (dryRun) {
        // In dry-run we just fake ids so downstream remap can be tested.
        const fake = (chunks[i] ?? []).map(
          (_, k) => `dryrun-${spec.table}-${realIds.length + k}`,
        )
        realIds.push(...fake)
      } else {
        const res = (await client.mutation(api.seedRetail.insertChunk, {
          secret,
          table: spec.table,
          rows: chunks[i] ?? [],
        })) as { ids: string[] }
        realIds.push(...res.ids)
      }
      const pct = ((i + 1) / chunks.length) * 100
      process.stdout.write('.')
      if ((i + 1) % 50 === 0 || i === chunks.length - 1) {
        process.stdout.write(` ${pct.toFixed(0)}%`)
      }
    }
    const t1 = Date.now()
    process.stdout.write(`  ${((t1 - t0) / 1000).toFixed(1)}s\n`)

    // Build id-map for downstream FK rewriting.
    const map = new Map<string, string>()
    for (let i = 0; i < synthIds.length; i += 1) {
      const synth = synthIds[i]
      const real = realIds[i]
      if (synth && real) map.set(synth, real)
    }
    idMaps.set(spec.table, map)
    totals[spec.table] = rows.length
  }
  return { totals }
}

// ---- Summary -----------------------------------------------------------

async function printSummary(
  client: ConvexHttpClient,
  secret: string,
): Promise<void> {
  const counts = (await client.mutation(api.seedRetail.counts, {
    secret,
  })) as Record<string, number>
  console.log('[seed] post-seed counts (server-side):')
  for (const t of RETAIL_TABLES) {
    console.log(`  ${t.padEnd(36)} ${fmtNumber(counts[t] ?? 0).padStart(9)}`)
  }
}

// ---- Main --------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const convexUrl = args.dryRun
    ? (process.env.CONVEX_URL ?? 'https://dryrun.invalid')
    : requireEnv('CONVEX_URL')
  const secret = args.dryRun
    ? (process.env.SEED_SECRET ?? 'dryrun-secret')
    : requireEnv('SEED_SECRET')

  console.log(
    `[seed] CONVEX_URL=${convexUrl}  fixtures=${FIXTURES_DIR}  reset=${args.reset}  dryRun=${args.dryRun}`,
  )

  const client = new ConvexHttpClient(convexUrl)

  if (args.reset && !args.dryRun) {
    await clearAll(client, secret)
  }

  const t0 = Date.now()
  const { totals } = await seedAll(client, secret, args.dryRun)
  const t1 = Date.now()
  console.log(`[seed] inserts done in ${((t1 - t0) / 1000).toFixed(1)}s`)
  console.log('[seed] inserted (client-side counts):')
  for (const t of RETAIL_TABLES) {
    console.log(`  ${t.padEnd(36)} ${fmtNumber(totals[t] ?? 0).padStart(9)}`)
  }

  if (!args.dryRun) {
    await printSummary(client, secret)
  }
  console.log('[seed] done')
}

main().catch((err) => {
  console.error('[seed] FAILED:', err)
  process.exit(1)
})
