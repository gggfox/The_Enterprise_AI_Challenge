/**
 * `/api/v1/telemetry/*` -- unauthenticated FE beacon endpoint, scoped to
 * tiny payloads. Forwarded into the wide-event stream so Web Vitals show
 * up next to backend traces in OpenObserve.
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const webVitalsSchema = z.object({
  name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
  value: z.number(),
  id: z.string().min(1).max(200),
  page: z.string().max(2000).optional(),
})

const telemetryRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/telemetry/web-vitals', async (req, reply) => {
    const parsed = webVitalsSchema.safeParse(req.body)
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
    req.log.info(
      {
        kind: 'web_vital',
        ...parsed.data,
      },
      'web_vital',
    )
    return reply.code(204).send()
  })
}

export default telemetryRoutes
