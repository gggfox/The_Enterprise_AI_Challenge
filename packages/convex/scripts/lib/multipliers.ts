/**
 * Multiplier functions that shape transaction volume. Keep these in
 * one file so the engineered narratives are auditable in one place.
 *
 * `dailyMultiplier(timestampMs, storeCode)` returns the product of:
 *   - day-of-week
 *   - quincena (15th and last day of month)
 *   - annual MX retail seasonality (Buen Fin, Independencia, Muertos,
 *     Navidad/Reyes, Día de las Madres, back-to-school)
 *   - declining-store narrative (CDMX-IZT in the last 6 months)
 *
 * `hourMultiplier(hour)` returns the time-of-day shape.
 *
 * `categoryTrendMultiplier(categorySlug, timestampMs, endMs)` returns
 * the per-month growth/decline applied to a basket-item weight so the
 * underperforming-category narrative shows up in the data.
 *
 * `starProductMultiplier(sku, timestampMs, endMs)` returns the boost
 * applied to the star product's basket weight in the last 6 months.
 */

import { DECLINING_STORE_CODE, STAR_PRODUCT_SKU } from './catalog'
import {
  dayOfMonth,
  dayOfWeek,
  lastDayOfMonth,
  monthOfYear,
  monthsSince,
} from './dates'

const DOW_MULTIPLIERS = [
  // Sun .. Sat
  1.2, 1.0, 0.95, 0.95, 1.05, 1.25, 1.35,
] as const

const HOUR_MULTIPLIERS = [
  // 0..23 -- baseline 0.4 with morning + lunch + evening + late-night peaks
  // 0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23
  0.6, 0.4, 0.3, 0.2, 0.2, 0.3, 0.6, 1.4, 1.5, 1.2, 0.9, 0.9, 1.1, 1.4, 1.3,
  1.0, 0.9, 1.0, 1.3, 1.5, 1.4, 1.2, 1.0, 0.8,
] as const

export function hourMultiplier(hour: number): number {
  return HOUR_MULTIPLIERS[hour] ?? 1
}

function quincenaMultiplier(timestampMs: number): number {
  const dom = dayOfMonth(timestampMs)
  const last = lastDayOfMonth(timestampMs)
  if (dom === 15 || dom === last) return 1.15
  if (dom === 16 || dom === 1) return 1.07 // small spillover
  return 1.0
}

function annualSeasonalityMultiplier(timestampMs: number): number {
  const m = monthOfYear(timestampMs)
  const d = dayOfMonth(timestampMs)
  // Buen Fin: Nov 13-19 (always the weekend before Día de la Revolución).
  if (m === 11 && d >= 13 && d <= 19) return 1.3
  // Independencia: Sep 14-16.
  if (m === 9 && d >= 14 && d <= 16) return 1.15
  // Día de Muertos: Oct 31 - Nov 2.
  if ((m === 10 && d === 31) || (m === 11 && d <= 2)) return 1.1
  // Navidad / Reyes: Dec 20 - Jan 6.
  if (m === 12 && d >= 20) return 1.15
  if (m === 1 && d <= 6) return 1.15
  // Día de las Madres: May 9-10.
  if (m === 5 && (d === 9 || d === 10)) return 1.12
  // Back-to-school: Aug 15-25.
  if (m === 8 && d >= 15 && d <= 25) return 1.1
  return 1.0
}

function decliningStoreMultiplier(
  storeCode: string,
  timestampMs: number,
  endMs: number,
): number {
  if (storeCode !== DECLINING_STORE_CODE) return 1.0
  // -2% MoM compounding over the last 6 months. Earlier than that:
  // baseline. For month i in the last 6 (i=0 oldest, i=5 newest):
  // multiplier = 0.98^i applied to the *latest* month.
  // We invert that here: how many months from current to end, capped at 6.
  const monthsFromEnd = monthsSince(timestampMs, endMs)
  if (monthsFromEnd >= 6) return 1.0
  // Newest month gets 0.98^5 ~= 0.904, oldest of the 6 gets 0.98^0 = 1.0
  const monthsIntoDecline = 5 - monthsFromEnd
  return 0.98 ** monthsIntoDecline
}

export function dailyMultiplier(
  timestampMs: number,
  storeCode: string,
  endMs: number,
): number {
  return (
    (DOW_MULTIPLIERS[dayOfWeek(timestampMs)] ?? 1) *
    quincenaMultiplier(timestampMs) *
    annualSeasonalityMultiplier(timestampMs) *
    decliningStoreMultiplier(storeCode, timestampMs, endMs)
  )
}

/**
 * Category-trend multiplier applied to basket-item sampling weights.
 * Implements the "snacks underperforms while bebidas grows" narrative.
 *
 * 18-month linear ramp:
 *   - bebidas: 1.0 -> 1.18
 *   - snacks:  1.0 -> 1.0   (held flat)
 *   - others:  1.0 -> 1.05  (mild growth)
 */
export function categoryTrendMultiplier(
  categorySlug: string,
  timestampMs: number,
  startMs: number,
  endMs: number,
): number {
  const total = monthsSince(startMs, endMs)
  if (total <= 0) return 1
  const t = monthsSince(startMs, timestampMs) / total
  if (categorySlug === 'bebidas') return 1.0 + 0.18 * t
  if (categorySlug === 'snacks') return 1.0
  return 1.0 + 0.05 * t
}

/**
 * Boost applied to the star product's basket weight. Ramps from 1x
 * to 3x linearly across the LAST 6 months of the dataset; outside
 * that window it's 1.0.
 */
export function starProductMultiplier(
  sku: string,
  timestampMs: number,
  endMs: number,
): number {
  if (sku !== STAR_PRODUCT_SKU) return 1.0
  const monthsFromEnd = monthsSince(timestampMs, endMs)
  if (monthsFromEnd >= 6 || monthsFromEnd < 0) return 1.0
  const t = (5 - monthsFromEnd) / 5 // 0..1 across the 6-month window
  return 1.0 + 2.0 * t
}

/**
 * Services-revenue ramp. Returns the fraction of total store
 * transactions that should be services on the given day. Linear
 * ramp from 8% to 18% across the 18 months.
 */
export function servicesShare(
  timestampMs: number,
  startMs: number,
  endMs: number,
): number {
  const total = monthsSince(startMs, endMs)
  if (total <= 0) return 0.08
  const t = monthsSince(startMs, timestampMs) / total
  return 0.08 + 0.1 * t
}
