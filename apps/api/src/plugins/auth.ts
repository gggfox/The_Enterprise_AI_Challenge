/**
 * Convention-by-prefix auth plugin.
 *
 *   /api/v1/health         -> bypass (containers + Traefik probe this)
 *   /api/v1/admin/**       -> require x-api-key === ADMIN_API_KEY
 *   /api/v1/webhooks/**    -> require x-api-key === BRIDGE_API_KEY
 *   /api/v1/internal/**    -> require x-api-key === BRIDGE_API_KEY (S2S)
 *   /api/v1/**  (default)  -> require Authorization: Bearer <Clerk JWT>
 *
 * Bearer tokens are minted by Clerk via the "convex" JWT template
 * (audience = "convex") and verified here against Clerk's JWKS. The
 * verified `subject` (Clerk's user_xxx) is mapped to a Convex `users`
 * row via `api.users.me`, which the FE provisions on first sign-in via
 * `users.ensureProvisioned`. The result is attached to `req.user` so
 * route handlers can run ABAC checks without re-querying the network.
 */

import { api } from '@enterprise-ai/convex/convex/_generated/api'
import { type Role, isRole } from '@enterprise-ai/shared/auth'
import { ConvexError } from 'convex/values'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose'
import { config } from '../config.js'
import { userScopedConvex } from '../services/convex.service.js'

const ADMIN_PREFIX = '/api/v1/admin'
const WEBHOOK_PREFIX = '/api/v1/webhooks'
const INTERNAL_PREFIX = '/api/v1/internal'
const TELEMETRY_PREFIX = '/api/v1/telemetry'
const BYPASS = new Set<string>(['/api/v1/health'])

const jwks = createRemoteJWKSet(new URL(config.auth.jwksUrl))

function unauthorized(
  reply: FastifyReply,
  message = 'Unauthorized',
): FastifyReply {
  return reply.code(401).send({
    error: { reason: 'unauthenticated', message },
  })
}

function readApiKey(req: FastifyRequest): string | undefined {
  const raw = req.headers['x-api-key']
  if (typeof raw === 'string' && raw.length > 0) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return undefined
}

function readBearer(req: FastifyRequest): string | undefined {
  const raw = req.headers.authorization
  if (typeof raw !== 'string') return undefined
  const [scheme, token] = raw.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined
  return token
}

async function requireApiKey(
  req: FastifyRequest,
  reply: FastifyReply,
  expected: string,
): Promise<FastifyReply | undefined> {
  const got = readApiKey(req)
  if (!got || got !== expected) {
    return unauthorized(reply, 'invalid or missing x-api-key')
  }
  return undefined
}

async function requireBearer(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const token = readBearer(req)
  if (!token) {
    return unauthorized(reply, 'missing Authorization: Bearer token')
  }

  let payload: JWTPayload
  try {
    const verified = await jwtVerify(token, jwks, {
      // Clerk's "convex" JWT template sets `iss` to the Clerk frontend
      // API URL and `aud` to "convex". We accept only tokens minted for
      // this exact issuer/audience pair.
      issuer: config.auth.issuer,
      audience: config.auth.audience,
    })
    payload = verified.payload
  } catch (cause) {
    req.log.warn({ err: cause }, 'jwt verification failed')
    return unauthorized(reply, 'invalid Bearer token')
  }

  const subject = payload.sub
  if (!subject) {
    return unauthorized(reply, 'token missing subject')
  }

  // Resolve the user row via Convex (forwarding the same JWT). `api.users.me`
  // returns the row including `roles` so we can run ABAC locally without
  // another round trip.
  type Me = {
    _id: string
    email: string | null
    name: string | null
    roles: readonly string[]
  }
  let me: Me | null = null
  try {
    me = (await userScopedConvex(token).query(api.users.me, {})) as Me | null
  } catch (cause) {
    if (cause instanceof ConvexError) {
      req.log.warn({ err: cause.data }, 'convex me-query rejected token')
    } else {
      req.log.error({ err: cause }, 'convex me-query failed')
    }
    return unauthorized(reply, 'identity not yet provisioned')
  }
  if (!me) {
    return unauthorized(reply, 'identity not provisioned in Convex')
  }

  const roles = me.roles.filter(isRole) as readonly Role[]
  req.user = {
    _id: me._id,
    subject,
    email: me.email,
    name: me.name,
    roles,
  }
  req.userJwt = token
  return undefined
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.routeOptions.url ?? req.url
    if (BYPASS.has(url)) return
    if (url.startsWith(ADMIN_PREFIX))
      return requireApiKey(req, reply, config.bridge.adminKey)
    if (url.startsWith(WEBHOOK_PREFIX))
      return requireApiKey(req, reply, config.bridge.apiKey)
    if (url.startsWith(INTERNAL_PREFIX))
      return requireApiKey(req, reply, config.bridge.apiKey)
    // Telemetry endpoints are intentionally unauthenticated (web-vitals
    // beacons fire from any client), but we keep them under /api/v1 so
    // CORS + rate-limiting still apply.
    if (url.startsWith(TELEMETRY_PREFIX)) return
    return requireBearer(req, reply)
  })
}

export default fp(plugin, { name: 'auth' })
