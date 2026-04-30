/**
 * Deterministic synthetic-data generator for the "Tiendita" fictional
 * Mexican convenience-store chain.
 *
 * Usage:
 *   pnpm --filter @enterprise-ai/convex run generate-fixtures
 *
 * Output: JSON files under `packages/convex/fixtures/`. Same RNG seed
 * in -> byte-identical files out. Do not introduce `Math.random()`
 * anywhere in the generation pipeline; use the `Rng` from `lib/rng.ts`.
 *
 * The generator emits both raw tables (categories, products, stores,
 * customers, transactions, transaction_items, inventory_movements,
 * promotions) and pre-aggregated rollups (daily store sales, daily
 * store-category, hourly heatmap, monthly product, monthly services,
 * monthly geo). Rollups are computed in this script so the seeder
 * stays a dumb loader.
 *
 * Engineered narratives (see `lib/multipliers.ts`):
 *   - Declining store: CDMX-IZT, -2% MoM compounding in last 6 months.
 *   - Star product:    BEB-RB-355 (Red Bull 355ml), 1x -> 3x ramp.
 *   - Underperformer:  snacks held flat while bebidas grows 18%.
 *   - Services ramp:   8% -> 18% of transactions, linear.
 *   - Geo asymmetry:   MTY +20% basket, GDL -10% basket vs CDMX.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CATEGORIES,
  PRODUCTS,
  REGION_TICKET_MULTIPLIER,
  SERVICE_TYPES,
  SERVICE_TYPE_ALIASES_EN,
  SERVICE_TYPE_AVG_AMOUNT_MXN,
  SERVICE_TYPE_WEIGHT,
  STAR_PRODUCT_SKU,
  STORES,
  type ServiceType,
} from './lib/catalog'
import {
  END_DATE_ISO,
  START_DATE_ISO,
  addDaysUtc,
  dayKey,
  dayOfWeek,
  eachDayInRange,
  hourOfDay,
  monthKey,
  parseDateUtc,
} from './lib/dates'
import {
  categoryTrendMultiplier,
  dailyMultiplier,
  hourMultiplier,
  servicesShare,
  starProductMultiplier,
} from './lib/multipliers'
import { type Rng, makeRng } from './lib/rng'

// ---- Constants ---------------------------------------------------------

const RNG_SEED = 'tiendita-v1'
const BASE_TXNS_PER_STORE_PER_DAY = 15
const TARGET_CUSTOMER_COUNT = 1500
const RETURN_RATE = 0.02
const PROMO_TRANSACTION_RATE = 0.05
const LOYALTY_ATTACH_RATE_SALE = 0.3
const LOYALTY_ATTACH_RATE_SERVICE = 0.2
const RESTOCK_DAYS_MIN = 3
const RESTOCK_DAYS_MAX = 6
const STOCKOUTS_PER_STORE = 3
const STOCKOUT_WINDOW_DAYS_MIN = 1
const STOCKOUT_WINDOW_DAYS_MAX = 5

// Basket-size distribution for *sale* transactions. Indices map to
// item count; values are sampling weights (region-multiplier-adjusted).
const BASKET_SIZE_WEIGHTS_BASELINE = [0, 28, 38, 22, 9, 3] // 1..5 items
const BASKET_SIZE_OPTIONS = [1, 2, 3, 4, 5] as const

// Item quantity distribution: usually 1, sometimes 2, rarely 3.
const QUANTITY_WEIGHTS = [82, 14, 4]
const QUANTITY_OPTIONS = [1, 2, 3] as const

// ---- Fixture types (JSON shape) ---------------------------------------

interface CategoryFixture {
  id: string
  slug: string
  name_es: string
  sortOrder: number
}

interface ProductFixture {
  id: string
  sku: string
  name_es: string
  categoryId: string
  priceMxn: number
  costMxn: number
  isActive: boolean
}

interface StoreFixture {
  id: string
  code: string
  name_es: string
  city: string
  region: string
  openedAt: number
}

interface CustomerFixture {
  id: string
  loyaltyId: string
  signupAt: number
  city: string
  segment: 'frequent' | 'occasional' | 'new'
}

interface TransactionFixture {
  id: string
  storeId: string
  customerId?: string
  occurredAt: number
  totalMxn: number
  kind: 'sale' | 'service' | 'return'
  serviceType?: ServiceType
  promoId?: string
}

interface TransactionItemFixture {
  id: string
  transactionId: string
  productId: string
  quantity: number
  unitPriceMxn: number
  discountMxn: number
  occurredAt: number
}

interface InventoryMovementFixture {
  id: string
  storeId: string
  productId: string
  occurredAt: number
  kind: 'restock' | 'sale' | 'stockout_start' | 'stockout_end'
  quantity: number
}

interface PromotionFixture {
  id: string
  code: string
  name_es: string
  startAt: number
  endAt: number
  discountPct: number
  scopeCategoryId?: string
}

interface RollupDailyStoreSales {
  storeId: string
  dateKey: string
  revenueMxn: number
  transactions: number
  units: number
}

interface RollupDailyStoreCategorySales {
  storeId: string
  categoryId: string
  dateKey: string
  revenueMxn: number
  units: number
}

interface RollupHourlyStoreSales {
  storeId: string
  dayOfWeek: number
  hour: number
  avgRevenueMxn: number
  avgTransactions: number
}

interface RollupProductMonthly {
  productId: string
  monthKey: string
  revenueMxn: number
  units: number
}

interface RollupServicesMonthly {
  monthKey: string
  serviceType: ServiceType
  revenueMxn: number
  transactions: number
}

interface RollupGeoMonthly {
  region: string
  monthKey: string
  revenueMxn: number
  transactions: number
  avgTicketMxn: number
}

interface DictionaryFixture {
  brand: { name: string; tagline_es: string; tagline_en: string }
  generatedAt: number
  startDate: string
  endDate: string
  categories: Array<{
    slug: string
    name_es: string
    aliases_en: readonly string[]
  }>
  serviceTypes: Array<{
    slug: ServiceType
    aliases_en: readonly string[]
  }>
  narratives: {
    decliningStoreCode: string
    starProductSku: string
    underperformingCategorySlug: string
    servicesShareStart: number
    servicesShareEnd: number
    regionTicketMultipliers: Record<string, number>
  }
}

// ---- Utility: normalize-and-sample ------------------------------------

function basketSizeWeightsForRegion(region: string): number[] {
  const mult = REGION_TICKET_MULTIPLIER[region] ?? 1.0
  // Shift mass toward larger baskets when mult > 1, smaller when < 1.
  // Implement as a power-law tilt on the baseline weights' index.
  const out: number[] = [0]
  for (let i = 1; i < BASKET_SIZE_WEIGHTS_BASELINE.length; i += 1) {
    const base = BASKET_SIZE_WEIGHTS_BASELINE[i] ?? 0
    out.push(base * mult ** (i - 2))
  }
  return out
}

// ---- Static-entity generation -----------------------------------------

function buildCategories(): CategoryFixture[] {
  return CATEGORIES.map((c) => ({
    id: `cat_${c.slug}`,
    slug: c.slug,
    name_es: c.name_es,
    sortOrder: c.sortOrder,
  }))
}

function buildProducts(): ProductFixture[] {
  return PRODUCTS.map((p) => ({
    id: `prod_${p.sku}`,
    sku: p.sku,
    name_es: p.name_es,
    categoryId: `cat_${p.categorySlug}`,
    priceMxn: p.priceMxn,
    costMxn: Math.max(1, Math.round(p.priceMxn * (1 - p.margin))),
    isActive: true,
  }))
}

function buildStores(endMs: number): StoreFixture[] {
  return STORES.map((s) => ({
    id: `store_${s.code}`,
    code: s.code,
    name_es: s.name_es,
    city: s.city,
    region: s.region,
    openedAt: addDaysUtc(endMs, -s.openedDaysAgo),
  }))
}

function buildCustomers(rng: Rng, endMs: number): CustomerFixture[] {
  // Distribute customers across cities proportional to store count.
  const cityCounts = new Map<string, number>()
  for (const s of STORES) {
    cityCounts.set(s.city, (cityCounts.get(s.city) ?? 0) + 1)
  }
  const totalStores = STORES.length
  const customers: CustomerFixture[] = []
  for (let i = 0; i < TARGET_CUSTOMER_COUNT; i += 1) {
    // Weighted-pick a city by store count.
    const cities = Array.from(cityCounts.entries())
    const city = rng.weightedPick(
      cities.map(([c]) => c),
      cities.map(([, n]) => n / totalStores),
    )
    // Segment distribution.
    const segment = rng.weightedPick(
      ['occasional', 'frequent', 'new'] as const,
      [60, 25, 15],
    )
    // signupAt: older for frequent, newer for new.
    const minDaysAgo = segment === 'new' ? 0 : segment === 'occasional' ? 60 : 200
    const maxDaysAgo = segment === 'new' ? 60 : segment === 'occasional' ? 540 : 540
    const daysAgo = rng.int(minDaysAgo, maxDaysAgo)
    customers.push({
      id: `cust_${(i + 1).toString().padStart(5, '0')}`,
      loyaltyId: `TIENDITA-${(i + 1).toString().padStart(6, '0')}`,
      signupAt: addDaysUtc(endMs, -daysAgo),
      city,
      segment,
    })
  }
  return customers
}

// ---- Promotions --------------------------------------------------------

function buildPromotions(
  rng: Rng,
  startMs: number,
  endMs: number,
  categories: CategoryFixture[],
): PromotionFixture[] {
  const targets = [
    { code: 'BUEN-FIN-2025', name_es: 'Buen Fin 2025: 20% en bebidas', startDay: '2025-11-13', days: 7, discount: 20, scopeSlug: 'bebidas' },
    { code: 'NAV-2024', name_es: 'Promo Navideña: 15% en dulces', startDay: '2024-12-20', days: 14, discount: 15, scopeSlug: 'dulces' },
    { code: 'VERANO-2025', name_es: 'Promo Verano: 12% en snacks', startDay: '2025-07-01', days: 21, discount: 12, scopeSlug: 'snacks' },
    { code: 'REGRESO-CLASES', name_es: 'Regreso a Clases 2025', startDay: '2025-08-15', days: 11, discount: 10, scopeSlug: 'panaderia' },
    { code: 'MADRES-2025', name_es: 'Día de las Madres', startDay: '2025-05-08', days: 4, discount: 15, scopeSlug: 'panaderia' },
    { code: 'INDEPEND-2025', name_es: 'Mes Patrio', startDay: '2025-09-14', days: 7, discount: 10, scopeSlug: 'bebidas' },
  ] as const

  const promos: PromotionFixture[] = []
  for (const t of targets) {
    const start = parseDateUtc(t.startDay)
    if (start < startMs || start > endMs) continue
    const cat = categories.find((c) => c.slug === t.scopeSlug)
    promos.push({
      id: `promo_${t.code}`,
      code: t.code,
      name_es: t.name_es,
      startAt: start,
      endAt: addDaysUtc(start, t.days),
      discountPct: t.discount,
      ...(cat ? { scopeCategoryId: cat.id } : {}),
    })
  }
  void rng // reserved for future jitter; keep signature stable.
  return promos
}

function activePromotionFor(
  promotions: PromotionFixture[],
  timestampMs: number,
): PromotionFixture | undefined {
  return promotions.find(
    (p) => timestampMs >= p.startAt && timestampMs < p.endAt,
  )
}

// ---- Hourly distribution ----------------------------------------------

function distributeHourly(rng: Rng, totalForDay: number): number[] {
  // Sum hourly weights, then scale to expected lambda per hour. Sample
  // Poisson per hour. Result roughly sums to totalForDay; absolute
  // count is allowed to vary slightly via Poisson noise.
  const totalWeight = HOUR_INDICES.reduce(
    (acc, h) => acc + hourMultiplier(h),
    0,
  )
  return HOUR_INDICES.map((h) =>
    rng.poisson((totalForDay * hourMultiplier(h)) / totalWeight),
  )
}

const HOUR_INDICES = Array.from({ length: 24 }, (_, i) => i)

// ---- Basket composition -----------------------------------------------

function pickBasketSize(rng: Rng, region: string): number {
  return rng.weightedPick(
    [...BASKET_SIZE_OPTIONS],
    basketSizeWeightsForRegion(region).slice(1),
  )
}

interface BasketContext {
  rng: Rng
  products: ProductFixture[]
  productsByCategoryId: Map<string, ProductFixture[]>
  categoriesById: Map<string, CategoryFixture>
  productsBySku: Map<string, ProductFixture>
  startMs: number
  endMs: number
  timestampMs: number
}

function pickProduct(ctx: BasketContext): ProductFixture {
  // Two-stage sample: category by category-trend-weighted basketWeight,
  // then product within category by per-product weight × star-boost.

  // Filter out 'servicios' from sale-basket sampling; services are
  // their own transaction kind.
  const eligibleCats = CATEGORIES.filter((c) => c.slug !== 'servicios')
  const catWeights = eligibleCats.map(
    (c) =>
      c.basketWeight *
      categoryTrendMultiplier(c.slug, ctx.timestampMs, ctx.startMs, ctx.endMs),
  )
  const cat = ctx.rng.weightedPick(eligibleCats, catWeights)
  const catId = `cat_${cat.slug}`
  const productsInCat = ctx.productsByCategoryId.get(catId) ?? []
  const prodWeights = productsInCat.map((p) => {
    const base = (PRODUCTS.find((s) => s.sku === p.sku)?.weight ?? 1)
    const star = starProductMultiplier(p.sku, ctx.timestampMs, ctx.endMs)
    return base * star
  })
  return ctx.rng.weightedPick(productsInCat, prodWeights)
}

// ---- Main generation phases -------------------------------------------

interface GeneratedData {
  categories: CategoryFixture[]
  products: ProductFixture[]
  stores: StoreFixture[]
  customers: CustomerFixture[]
  transactions: TransactionFixture[]
  transaction_items: TransactionItemFixture[]
  inventory_movements: InventoryMovementFixture[]
  promotions: PromotionFixture[]
}

interface RollupData {
  rollup_daily_store_sales: RollupDailyStoreSales[]
  rollup_daily_store_category_sales: RollupDailyStoreCategorySales[]
  rollup_hourly_store_sales: RollupHourlyStoreSales[]
  rollup_product_monthly: RollupProductMonthly[]
  rollup_services_monthly: RollupServicesMonthly[]
  rollup_geo_monthly: RollupGeoMonthly[]
}

function generateAll(): { data: GeneratedData; rollups: RollupData } {
  const rng = makeRng(RNG_SEED)
  const startMs = parseDateUtc(START_DATE_ISO)
  const endMs = parseDateUtc(END_DATE_ISO)

  // Phase 1: static entities ------------------------------------------
  const categories = buildCategories()
  const products = buildProducts()
  const stores = buildStores(endMs)
  const customers = buildCustomers(rng, endMs)
  const promotions = buildPromotions(rng, startMs, endMs, categories)

  // Lookups
  const productsByCategoryId = new Map<string, ProductFixture[]>()
  for (const p of products) {
    const arr = productsByCategoryId.get(p.categoryId) ?? []
    arr.push(p)
    productsByCategoryId.set(p.categoryId, arr)
  }
  const categoriesById = new Map<string, CategoryFixture>(
    categories.map((c) => [c.id, c]),
  )
  const productsBySku = new Map<string, ProductFixture>(
    products.map((p) => [p.sku, p]),
  )
  const customerIdsByCity = new Map<string, string[]>()
  for (const c of customers) {
    const arr = customerIdsByCity.get(c.city) ?? []
    arr.push(c.id)
    customerIdsByCity.set(c.city, arr)
  }

  // Phase 2: transactions -------------------------------------------
  const transactions: TransactionFixture[] = []
  const transactionItems: TransactionItemFixture[] = []
  const days = eachDayInRange(startMs, endMs)
  let txnSeq = 0
  let itemSeq = 0

  for (const day of days) {
    for (const store of stores) {
      const dailyMult = dailyMultiplier(day, store.code, endMs)
      const targetTxns = BASE_TXNS_PER_STORE_PER_DAY * dailyMult
      const dayCount = Math.max(0, Math.round(rng.normal(targetTxns, 1.5)))
      const servicesFraction = servicesShare(day, startMs, endMs)
      const expectedServices = dayCount * servicesFraction
      const serviceCountToday = rng.poisson(expectedServices)
      const saleCountToday = Math.max(0, dayCount - serviceCountToday)

      // Distribute sales across hours.
      const salesPerHour = distributeHourly(rng, saleCountToday)
      for (let h = 0; h < 24; h += 1) {
        const n = salesPerHour[h] ?? 0
        for (let k = 0; k < n; k += 1) {
          const minute = rng.int(0, 60)
          const second = rng.int(0, 60)
          const occurredAt =
            day + h * 60 * 60 * 1000 + minute * 60 * 1000 + second * 1000
          const promo = activePromotionFor(promotions, occurredAt)
          const usePromo = promo && rng.bool(PROMO_TRANSACTION_RATE)

          const basketSize = pickBasketSize(rng, store.region)
          let total = 0
          const itemsForThisTxn: Omit<TransactionItemFixture, 'transactionId'>[] = []
          const ctx: BasketContext = {
            rng,
            products,
            productsByCategoryId,
            categoriesById,
            productsBySku,
            startMs,
            endMs,
            timestampMs: occurredAt,
          }
          for (let bi = 0; bi < basketSize; bi += 1) {
            const product = pickProduct(ctx)
            const qty = rng.weightedPick(
              [...QUANTITY_OPTIONS],
              QUANTITY_WEIGHTS,
            )
            let discount = 0
            if (
              usePromo &&
              promo &&
              (!promo.scopeCategoryId ||
                promo.scopeCategoryId === product.categoryId)
            ) {
              discount = Math.round(
                (product.priceMxn * qty * promo.discountPct) / 100,
              )
            }
            const lineTotal = product.priceMxn * qty - discount
            total += lineTotal
            itemSeq += 1
            itemsForThisTxn.push({
              id: `item_${itemSeq.toString().padStart(8, '0')}`,
              productId: product.id,
              quantity: qty,
              unitPriceMxn: product.priceMxn,
              discountMxn: discount,
              occurredAt,
            })
          }

          // Loyalty attach.
          let customerId: string | undefined
          if (rng.bool(LOYALTY_ATTACH_RATE_SALE)) {
            const cityCustomers = customerIdsByCity.get(store.city) ?? []
            if (cityCustomers.length > 0) {
              customerId = rng.pick(cityCustomers)
            }
          }

          txnSeq += 1
          const txnId = `txn_${txnSeq.toString().padStart(8, '0')}`
          transactions.push({
            id: txnId,
            storeId: store.id,
            ...(customerId ? { customerId } : {}),
            occurredAt,
            totalMxn: total,
            kind: 'sale',
            ...(usePromo && promo ? { promoId: promo.id } : {}),
          })
          for (const it of itemsForThisTxn) {
            transactionItems.push({ ...it, transactionId: txnId })
          }
        }
      }

      // Service transactions (no items).
      const servicesPerHour = distributeHourly(rng, serviceCountToday)
      for (let h = 0; h < 24; h += 1) {
        const n = servicesPerHour[h] ?? 0
        for (let k = 0; k < n; k += 1) {
          const minute = rng.int(0, 60)
          const second = rng.int(0, 60)
          const occurredAt =
            day + h * 60 * 60 * 1000 + minute * 60 * 1000 + second * 1000
          const serviceType = rng.weightedPick<ServiceType>(
            [...SERVICE_TYPES],
            SERVICE_TYPES.map((s) => SERVICE_TYPE_WEIGHT[s]),
          )
          const avg = SERVICE_TYPE_AVG_AMOUNT_MXN[serviceType]
          const total = Math.max(
            10,
            Math.round(rng.normal(avg, avg * 0.25)),
          )
          let customerId: string | undefined
          if (rng.bool(LOYALTY_ATTACH_RATE_SERVICE)) {
            const cityCustomers = customerIdsByCity.get(store.city) ?? []
            if (cityCustomers.length > 0) {
              customerId = rng.pick(cityCustomers)
            }
          }
          txnSeq += 1
          transactions.push({
            id: `txn_${txnSeq.toString().padStart(8, '0')}`,
            storeId: store.id,
            ...(customerId ? { customerId } : {}),
            occurredAt,
            totalMxn: total,
            kind: 'service',
            serviceType,
          })
        }
      }
    }
  }

  // Phase 3: returns (paired) ----------------------------------------
  // Pick RETURN_RATE of sale transactions and add a paired return 1-7
  // days later with negative totalMxn.
  const saleTxns = transactions.filter((t) => t.kind === 'sale')
  for (const saleTxn of saleTxns) {
    if (!rng.bool(RETURN_RATE)) continue
    const offsetDays = rng.int(1, 8)
    const returnAt = addDaysUtc(saleTxn.occurredAt, offsetDays)
    if (returnAt > endMs) continue
    txnSeq += 1
    transactions.push({
      id: `txn_${txnSeq.toString().padStart(8, '0')}`,
      storeId: saleTxn.storeId,
      ...(saleTxn.customerId ? { customerId: saleTxn.customerId } : {}),
      occurredAt: returnAt,
      totalMxn: -saleTxn.totalMxn,
      kind: 'return',
    })
  }

  // Phase 4: inventory movements --------------------------------------
  const inventoryMovements: InventoryMovementFixture[] = []
  let invSeq = 0
  for (const store of stores) {
    for (const product of products) {
      // Skip services category for inventory.
      if (product.categoryId === 'cat_servicios') continue
      let cursor = startMs
      while (cursor <= endMs) {
        const gapDays = rng.int(RESTOCK_DAYS_MIN, RESTOCK_DAYS_MAX + 1)
        cursor = addDaysUtc(cursor, gapDays)
        if (cursor > endMs) break
        const qty = Math.max(5, Math.round(rng.normal(50, 15)))
        invSeq += 1
        inventoryMovements.push({
          id: `inv_${invSeq.toString().padStart(8, '0')}`,
          storeId: store.id,
          productId: product.id,
          occurredAt: cursor,
          kind: 'restock',
          quantity: qty,
        })
      }
    }
    // Stockout windows -- pick a few random product+window pairs per store.
    const eligibleProducts = products.filter(
      (p) => p.categoryId !== 'cat_servicios',
    )
    for (let s = 0; s < STOCKOUTS_PER_STORE; s += 1) {
      const product = rng.pick(eligibleProducts)
      const startDayOffset = rng.int(30, days.length - 14)
      const startAt = addDaysUtc(startMs, startDayOffset)
      const windowDays = rng.int(
        STOCKOUT_WINDOW_DAYS_MIN,
        STOCKOUT_WINDOW_DAYS_MAX + 1,
      )
      const endAt = addDaysUtc(startAt, windowDays)
      invSeq += 1
      inventoryMovements.push({
        id: `inv_${invSeq.toString().padStart(8, '0')}`,
        storeId: store.id,
        productId: product.id,
        occurredAt: startAt,
        kind: 'stockout_start',
        quantity: 0,
      })
      invSeq += 1
      inventoryMovements.push({
        id: `inv_${invSeq.toString().padStart(8, '0')}`,
        storeId: store.id,
        productId: product.id,
        occurredAt: endAt,
        kind: 'stockout_end',
        quantity: 0,
      })
    }
  }

  // Phase 5: rollups --------------------------------------------------
  const rollups = computeRollups({
    transactions,
    transactionItems,
    products,
    stores,
    startMs,
    endMs,
  })

  return {
    data: {
      categories,
      products,
      stores,
      customers,
      transactions,
      transaction_items: transactionItems,
      inventory_movements: inventoryMovements,
      promotions,
    },
    rollups,
  }
}

// ---- Rollups -----------------------------------------------------------

function computeRollups(input: {
  transactions: TransactionFixture[]
  transactionItems: TransactionItemFixture[]
  products: ProductFixture[]
  stores: StoreFixture[]
  startMs: number
  endMs: number
}): RollupData {
  const productsById = new Map(input.products.map((p) => [p.id, p]))
  const storesById = new Map(input.stores.map((s) => [s.id, s]))
  const txnsById = new Map(input.transactions.map((t) => [t.id, t]))

  // ---- daily store sales (sum of sale + return totals; services excluded
  // from "sales" rollup so revenue trends reflect merchandise only).
  // We include returns as negative so net daily revenue is realistic.
  const dailyStoreMap = new Map<
    string,
    { storeId: string; dateKey: string; revenueMxn: number; transactions: number; units: number }
  >()
  // Pre-index items per transaction so we can sum units fast.
  const itemsByTxn = new Map<string, TransactionItemFixture[]>()
  for (const it of input.transactionItems) {
    const arr = itemsByTxn.get(it.transactionId) ?? []
    arr.push(it)
    itemsByTxn.set(it.transactionId, arr)
  }

  for (const t of input.transactions) {
    if (t.kind === 'service') continue
    const dk = dayKey(t.occurredAt)
    const key = `${t.storeId}|${dk}`
    const existing = dailyStoreMap.get(key) ?? {
      storeId: t.storeId,
      dateKey: dk,
      revenueMxn: 0,
      transactions: 0,
      units: 0,
    }
    existing.revenueMxn += t.totalMxn
    existing.transactions += 1
    if (t.kind === 'sale') {
      const items = itemsByTxn.get(t.id) ?? []
      for (const it of items) existing.units += it.quantity
    }
    dailyStoreMap.set(key, existing)
  }

  // ---- daily store + category sales (sale items only)
  const dailyStoreCatMap = new Map<
    string,
    {
      storeId: string
      categoryId: string
      dateKey: string
      revenueMxn: number
      units: number
    }
  >()
  for (const it of input.transactionItems) {
    const txn = txnsById.get(it.transactionId)
    if (!txn || txn.kind !== 'sale') continue
    const product = productsById.get(it.productId)
    if (!product) continue
    const dk = dayKey(it.occurredAt)
    const key = `${txn.storeId}|${product.categoryId}|${dk}`
    const existing = dailyStoreCatMap.get(key) ?? {
      storeId: txn.storeId,
      categoryId: product.categoryId,
      dateKey: dk,
      revenueMxn: 0,
      units: 0,
    }
    existing.revenueMxn += it.unitPriceMxn * it.quantity - it.discountMxn
    existing.units += it.quantity
    dailyStoreCatMap.set(key, existing)
  }

  // ---- hourly heatmap (avg across the full window)
  const hourlyAggMap = new Map<
    string,
    { storeId: string; dayOfWeek: number; hour: number; revenueMxn: number; transactions: number }
  >()
  for (const t of input.transactions) {
    if (t.kind === 'service') continue
    const dow = dayOfWeek(t.occurredAt)
    const hr = hourOfDay(t.occurredAt)
    const key = `${t.storeId}|${dow}|${hr}`
    const existing = hourlyAggMap.get(key) ?? {
      storeId: t.storeId,
      dayOfWeek: dow,
      hour: hr,
      revenueMxn: 0,
      transactions: 0,
    }
    existing.revenueMxn += t.totalMxn
    existing.transactions += 1
    hourlyAggMap.set(key, existing)
  }
  // Number of weeks in the window.
  const totalDays = Math.round((input.endMs - input.startMs) / (24 * 60 * 60 * 1000)) + 1
  // Each (dow, hour) appears roughly totalDays/7 times per store.
  const sampleCount = totalDays / 7
  const hourlyRollup: RollupHourlyStoreSales[] = []
  for (const v of hourlyAggMap.values()) {
    hourlyRollup.push({
      storeId: v.storeId,
      dayOfWeek: v.dayOfWeek,
      hour: v.hour,
      avgRevenueMxn: Math.round(v.revenueMxn / sampleCount),
      avgTransactions: Math.round((v.transactions * 100) / sampleCount) / 100,
    })
  }

  // ---- product monthly (from items, sale only)
  const productMonthlyMap = new Map<
    string,
    { productId: string; monthKey: string; revenueMxn: number; units: number }
  >()
  for (const it of input.transactionItems) {
    const txn = txnsById.get(it.transactionId)
    if (!txn || txn.kind !== 'sale') continue
    const mk = monthKey(it.occurredAt)
    const key = `${it.productId}|${mk}`
    const existing = productMonthlyMap.get(key) ?? {
      productId: it.productId,
      monthKey: mk,
      revenueMxn: 0,
      units: 0,
    }
    existing.revenueMxn += it.unitPriceMxn * it.quantity - it.discountMxn
    existing.units += it.quantity
    productMonthlyMap.set(key, existing)
  }

  // ---- services monthly
  const servicesMonthlyMap = new Map<
    string,
    { monthKey: string; serviceType: ServiceType; revenueMxn: number; transactions: number }
  >()
  for (const t of input.transactions) {
    if (t.kind !== 'service' || !t.serviceType) continue
    const mk = monthKey(t.occurredAt)
    const key = `${mk}|${t.serviceType}`
    const existing = servicesMonthlyMap.get(key) ?? {
      monthKey: mk,
      serviceType: t.serviceType,
      revenueMxn: 0,
      transactions: 0,
    }
    existing.revenueMxn += t.totalMxn
    existing.transactions += 1
    servicesMonthlyMap.set(key, existing)
  }

  // ---- geo monthly (region-level, sale + return; services excluded)
  const geoAccum = new Map<
    string,
    { region: string; monthKey: string; revenueMxn: number; transactions: number }
  >()
  for (const t of input.transactions) {
    if (t.kind === 'service') continue
    const store = storesById.get(t.storeId)
    if (!store) continue
    const mk = monthKey(t.occurredAt)
    const key = `${store.region}|${mk}`
    const existing = geoAccum.get(key) ?? {
      region: store.region,
      monthKey: mk,
      revenueMxn: 0,
      transactions: 0,
    }
    existing.revenueMxn += t.totalMxn
    existing.transactions += 1
    geoAccum.set(key, existing)
  }
  const geoMonthly: RollupGeoMonthly[] = Array.from(geoAccum.values()).map(
    (g) => ({
      region: g.region,
      monthKey: g.monthKey,
      revenueMxn: g.revenueMxn,
      transactions: g.transactions,
      avgTicketMxn:
        g.transactions > 0 ? Math.round(g.revenueMxn / g.transactions) : 0,
    }),
  )

  return {
    rollup_daily_store_sales: Array.from(dailyStoreMap.values()),
    rollup_daily_store_category_sales: Array.from(dailyStoreCatMap.values()),
    rollup_hourly_store_sales: hourlyRollup,
    rollup_product_monthly: Array.from(productMonthlyMap.values()),
    rollup_services_monthly: Array.from(servicesMonthlyMap.values()),
    rollup_geo_monthly: geoMonthly,
  }
}

// ---- Output -----------------------------------------------------------

const FIXTURES_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', 'fixtures')
})()

function writeJsonCompact(name: string, value: unknown): void {
  mkdirSync(FIXTURES_DIR, { recursive: true })
  writeFileSync(join(FIXTURES_DIR, name), JSON.stringify(value))
}

function writeJsonPretty(name: string, value: unknown): void {
  mkdirSync(FIXTURES_DIR, { recursive: true })
  writeFileSync(join(FIXTURES_DIR, name), `${JSON.stringify(value, null, 2)}\n`)
}

function buildDictionary(): DictionaryFixture {
  return {
    brand: {
      name: 'Tiendita',
      tagline_es: 'Tu tienda de la esquina',
      tagline_en: 'Your corner store',
    },
    generatedAt: parseDateUtc(END_DATE_ISO),
    startDate: START_DATE_ISO,
    endDate: END_DATE_ISO,
    categories: CATEGORIES.map((c) => ({
      slug: c.slug,
      name_es: c.name_es,
      aliases_en: c.aliases_en,
    })),
    serviceTypes: SERVICE_TYPES.map((s) => ({
      slug: s,
      aliases_en: SERVICE_TYPE_ALIASES_EN[s],
    })),
    narratives: {
      decliningStoreCode: 'CDMX-IZT',
      starProductSku: STAR_PRODUCT_SKU,
      underperformingCategorySlug: 'snacks',
      servicesShareStart: 0.08,
      servicesShareEnd: 0.18,
      regionTicketMultipliers: { ...REGION_TICKET_MULTIPLIER },
    },
  }
}

function main(): void {
  const t0 = Date.now()
  console.log(
    `[generate-fixtures] seed=${RNG_SEED}  window=${START_DATE_ISO}..${END_DATE_ISO}`,
  )
  const { data, rollups } = generateAll()

  // Pretty-print the small files so a human can grep them quickly.
  writeJsonPretty('categories.json', data.categories)
  writeJsonPretty('products.json', data.products)
  writeJsonPretty('stores.json', data.stores)
  writeJsonPretty('promotions.json', data.promotions)
  writeJsonPretty('_dictionary.json', buildDictionary())

  // Compact for the bulk tables.
  writeJsonCompact('customers.json', data.customers)
  writeJsonCompact('transactions.json', data.transactions)
  writeJsonCompact('transaction_items.json', data.transaction_items)
  writeJsonCompact('inventory_movements.json', data.inventory_movements)
  writeJsonCompact(
    'rollup_daily_store_sales.json',
    rollups.rollup_daily_store_sales,
  )
  writeJsonCompact(
    'rollup_daily_store_category_sales.json',
    rollups.rollup_daily_store_category_sales,
  )
  writeJsonCompact(
    'rollup_hourly_store_sales.json',
    rollups.rollup_hourly_store_sales,
  )
  writeJsonCompact(
    'rollup_product_monthly.json',
    rollups.rollup_product_monthly,
  )
  writeJsonCompact(
    'rollup_services_monthly.json',
    rollups.rollup_services_monthly,
  )
  writeJsonCompact('rollup_geo_monthly.json', rollups.rollup_geo_monthly)

  const tDelta = Date.now() - t0
  console.log(`[generate-fixtures] wrote fixtures to ${FIXTURES_DIR}`)
  console.log('[generate-fixtures] summary:')
  console.log(`  categories             : ${data.categories.length}`)
  console.log(`  products               : ${data.products.length}`)
  console.log(`  stores                 : ${data.stores.length}`)
  console.log(`  customers              : ${data.customers.length}`)
  console.log(`  transactions           : ${data.transactions.length}`)
  console.log(`    .. of kind sale      : ${data.transactions.filter((t) => t.kind === 'sale').length}`)
  console.log(`    .. of kind service   : ${data.transactions.filter((t) => t.kind === 'service').length}`)
  console.log(`    .. of kind return    : ${data.transactions.filter((t) => t.kind === 'return').length}`)
  console.log(`  transaction_items      : ${data.transaction_items.length}`)
  console.log(`  inventory_movements    : ${data.inventory_movements.length}`)
  console.log(`  promotions             : ${data.promotions.length}`)
  console.log(`  rollup_daily_store     : ${rollups.rollup_daily_store_sales.length}`)
  console.log(`  rollup_daily_store_cat : ${rollups.rollup_daily_store_category_sales.length}`)
  console.log(`  rollup_hourly_store    : ${rollups.rollup_hourly_store_sales.length}`)
  console.log(`  rollup_product_monthly : ${rollups.rollup_product_monthly.length}`)
  console.log(`  rollup_services_monthly: ${rollups.rollup_services_monthly.length}`)
  console.log(`  rollup_geo_monthly     : ${rollups.rollup_geo_monthly.length}`)
  console.log(`[generate-fixtures] done in ${tDelta}ms`)
}

main()
