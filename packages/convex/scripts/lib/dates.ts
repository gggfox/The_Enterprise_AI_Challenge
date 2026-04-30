/**
 * Date utilities for the synthetic-data generator. All dates are
 * interpreted in the America/Mexico_City timezone for cultural-event
 * day boundaries (Buen Fin, Independencia, etc.) but stored as UTC
 * milliseconds in fixtures since Convex is UTC-only.
 *
 * For a hackathon-grade demo we approximate the timezone by treating
 * "Mexico City local midnight" as `00:00:00 UTC-06:00`. This is off
 * by one hour during daylight saving time but it doesn't matter for
 * day-bucket aggregations.
 */

const MX_OFFSET_MS = -6 * 60 * 60 * 1000

export const START_DATE_ISO = '2024-11-01'
export const END_DATE_ISO = '2026-04-30'

export function parseDateUtc(yyyyMmDd: string): number {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  // Treat as MX-local midnight, then convert to UTC.
  return Date.UTC(y as number, (m as number) - 1, d as number) - MX_OFFSET_MS
}

export function dayKey(timestampMs: number): string {
  // Convert UTC ms to MX-local, then take the YYYY-MM-DD.
  const d = new Date(timestampMs + MX_OFFSET_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKey(timestampMs: number): string {
  const d = new Date(timestampMs + MX_OFFSET_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function dayOfWeek(timestampMs: number): number {
  const d = new Date(timestampMs + MX_OFFSET_MS)
  return d.getUTCDay() // 0=Sun .. 6=Sat
}

export function hourOfDay(timestampMs: number): number {
  const d = new Date(timestampMs + MX_OFFSET_MS)
  return d.getUTCHours()
}

export function monthOfYear(timestampMs: number): number {
  const d = new Date(timestampMs + MX_OFFSET_MS)
  return d.getUTCMonth() + 1 // 1..12
}

export function dayOfMonth(timestampMs: number): number {
  const d = new Date(timestampMs + MX_OFFSET_MS)
  return d.getUTCDate()
}

export function lastDayOfMonth(timestampMs: number): number {
  const d = new Date(timestampMs + MX_OFFSET_MS)
  const next = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  )
  return next.getUTCDate()
}

export function addDaysUtc(timestampMs: number, days: number): number {
  return timestampMs + days * 24 * 60 * 60 * 1000
}

export function eachDayInRange(startMs: number, endMs: number): number[] {
  const out: number[] = []
  for (let t = startMs; t <= endMs; t = addDaysUtc(t, 1)) out.push(t)
  return out
}

/**
 * Months between two timestamps (inclusive). Used for narrative
 * ramps (services revenue, star product growth).
 */
export function monthsSince(fromMs: number, toMs: number): number {
  const a = new Date(fromMs + MX_OFFSET_MS)
  const b = new Date(toMs + MX_OFFSET_MS)
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  )
}
