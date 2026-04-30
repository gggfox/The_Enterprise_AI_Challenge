/**
 * Shared request decorations and ambient types for the Fastify app.
 *
 * The auth plugin attaches `req.user` and `req.userJwt` after a Bearer
 * token has been verified. Routes pull them off the request directly.
 */

import type { Role } from '@enterprise-ai/shared/auth'
import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      _id: string
      subject: string
      email: string | null
      name: string | null
      roles: readonly Role[]
    }
    userJwt?: string
  }
}
