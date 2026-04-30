/**
 * Centralized, validated, boot-time-logged config for the Bridge API.
 *
 * One singleton per process. `process.env` is parsed once through Zod on
 * first import; required vars missing throws immediately, and a grouped,
 * masked summary is printed to stdout so what booted is visible in logs.
 *
 * Adapted from `references/logisticsPractice/apps/api/src/config.ts`.
 */

import { z } from 'zod'

const requiredString = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .min(1, `${name} must not be empty`)

const optionalWithDefault = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : fallback))

const EnvSchema = z.object({
  NODE_ENV: optionalWithDefault('development'),

  HTTP_PORT: optionalWithDefault('3111'),
  DASHBOARD_ORIGIN: optionalWithDefault('http://localhost:3000'),

  CONVEX_URL: requiredString('CONVEX_URL'),
  CONVEX_DEPLOY_KEY: z.string().optional(),

  // Clerk JWT verification. The web app mints JWTs via Clerk's "convex"
  // template (audience = "convex"); the Bridge verifies them against
  // Clerk's JWKS without any shared secret.
  CLERK_ISSUER_URL: requiredString('CLERK_ISSUER_URL'),
  CLERK_JWKS_URL: z.string().optional(),

  BRIDGE_API_KEY: requiredString('BRIDGE_API_KEY'),
  ADMIN_API_KEY: requiredString('ADMIN_API_KEY'),

  OTEL_ENABLED: optionalWithDefault('true'),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalWithDefault('http://localhost:5081'),
  OTEL_EXPORTER_OTLP_HEADERS: optionalWithDefault(''),
  OTEL_SERVICE_NAME: optionalWithDefault('enterprise-ai-api'),
  SERVICE_VERSION: optionalWithDefault('0.1.0'),
  SERVICE_NAMESPACE: optionalWithDefault('development'),
  DEPLOYMENT_REGION: optionalWithDefault('local'),

  WIDE_EVENT_SLOW_MS: optionalWithDefault('2000'),
  WIDE_EVENT_SUCCESS_SAMPLE_RATE: optionalWithDefault('1.0'),
})

type Env = z.infer<typeof EnvSchema>

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }
  return result.data
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function toIntOrFallback(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

function toFloatOrFallback(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function parseHeaders(raw: string): Record<string, string> {
  // Format: "key1=value1,key2=value2". OpenObserve uses this for the
  // `Authorization: Basic ...` token.
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [k, ...rest] = pair.split('=')
    if (!k || rest.length === 0) continue
    out[k.trim()] = rest.join('=').trim()
  }
  return out
}

const env = parseEnv()
const normalizedConvexUrl = stripTrailingSlash(env.CONVEX_URL)
const normalizedClerkIssuer = stripTrailingSlash(env.CLERK_ISSUER_URL)
const clerkJwksUrl =
  env.CLERK_JWKS_URL && env.CLERK_JWKS_URL.length > 0
    ? env.CLERK_JWKS_URL
    : `${normalizedClerkIssuer}/.well-known/jwks.json`

export const config = {
  nodeEnv: env.NODE_ENV,
  http: {
    port: toIntOrFallback(env.HTTP_PORT, 3111),
    dashboardOrigin: env.DASHBOARD_ORIGIN,
  },
  convex: {
    url: normalizedConvexUrl,
    deployKey: env.CONVEX_DEPLOY_KEY,
  },
  // Clerk-issued JWTs (template "convex", aud=convex). The Bridge verifies
  // signatures against Clerk's JWKS; no shared secret with Convex.
  auth: {
    issuer: normalizedClerkIssuer,
    jwksUrl: clerkJwksUrl,
    audience: 'convex',
  },
  bridge: {
    apiKey: env.BRIDGE_API_KEY,
    adminKey: env.ADMIN_API_KEY,
  },
  observability: {
    service: env.OTEL_SERVICE_NAME,
    version: env.SERVICE_VERSION,
    namespace: env.SERVICE_NAMESPACE,
    region: env.DEPLOYMENT_REGION,
    otelEnabled: env.OTEL_ENABLED.toLowerCase() === 'true',
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelHeaders: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    slowMs: toIntOrFallback(env.WIDE_EVENT_SLOW_MS, 2000),
    successSampleRate: toFloatOrFallback(env.WIDE_EVENT_SUCCESS_SAMPLE_RATE, 1),
  },
} as const

export type Config = typeof config

function maskSecret(value: string | undefined): string {
  if (!value) return '<unset>'
  const tail = value.slice(-Math.min(8, value.length))
  return `*** (len=${value.length}, tail=${tail})`
}

function printBootSummary(): void {
  const lines: string[] = []
  lines.push(`[config] @enterprise-ai/api booted (NODE_ENV=${config.nodeEnv})`)
  const kv = (key: string, val: string) =>
    lines.push(`  ${key.padEnd(32)}= ${val}`)
  kv('http.port', String(config.http.port))
  kv('http.dashboardOrigin', config.http.dashboardOrigin)
  kv('convex.url', config.convex.url)
  kv('convex.deployKey', maskSecret(config.convex.deployKey))
  kv('auth.issuer', config.auth.issuer)
  kv('auth.jwksUrl', config.auth.jwksUrl)
  kv('auth.audience', config.auth.audience)
  kv('bridge.apiKey', maskSecret(config.bridge.apiKey))
  kv('bridge.adminKey', maskSecret(config.bridge.adminKey))
  kv('observability.service', config.observability.service)
  kv(
    'observability.otel',
    config.observability.otelEnabled
      ? `enabled (${config.observability.otelEndpoint})`
      : 'disabled',
  )
  kv('observability.slowMs', String(config.observability.slowMs))
  kv(
    'observability.successSampleRate',
    String(config.observability.successSampleRate),
  )
  process.stdout.write(`${lines.join('\n')}\n`)
}

declare global {
  // eslint-disable-next-line no-var
  var __ENTERPRISE_AI_API_CONFIG_PRINTED__: boolean | undefined
}

if (!globalThis.__ENTERPRISE_AI_API_CONFIG_PRINTED__) {
  globalThis.__ENTERPRISE_AI_API_CONFIG_PRINTED__ = true
  printBootSummary()
}
