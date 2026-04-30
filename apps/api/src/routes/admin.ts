/**
 * `/api/v1/admin/*` -- ADMIN_API_KEY-gated bootstrap operations.
 *
 * The default seed promotes a target email to admin via the deploy-key
 * path so there's an admin who can subsequently assign roles via the
 * normal Bearer/JWT path.
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { sendResult } from '../plugins/error-mapper.js'
import { promoteAdminByEmail } from '../services/users.service.js'

const adminRoutes: FastifyPluginAsync = async (app) => {
  const promoteSchema = z.object({ email: z.string().email() })

  app.post('/api/v1/admin/seed/promote-admin', async (req, reply) => {
    const parsed = promoteSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(422).send({
        error: {
          reason: 'validation_failed',
          issues: parsed.error.issues.map(
            (i) => `${i.path.join('.')}: ${i.message}`,
          ),
        },
      })
    }
    const result = await promoteAdminByEmail(parsed.data.email)
    return sendResult(reply, result)
  })
}

export default adminRoutes
