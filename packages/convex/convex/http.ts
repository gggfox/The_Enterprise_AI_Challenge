/**
 * HTTP router for Convex.
 *
 * Identity is owned by Clerk now; auth callbacks land on Clerk's hosted
 * domain, not here. This file is kept as the registration point for any
 * custom HTTP endpoints (third-party webhooks consumed directly by
 * Convex, etc.). Nothing is registered yet -- all webhooks currently
 * land on Fastify first.
 */

import { httpRouter } from 'convex/server'

const http = httpRouter()

export default http
