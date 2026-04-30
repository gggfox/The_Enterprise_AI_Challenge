/**
 * `/api/v1/webhooks/*` -- BRIDGE_API_KEY-gated. Stub endpoint included so
 * the auth-by-prefix policy has a route to demonstrate against.
 */

import type { FastifyPluginAsync } from 'fastify'

const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/webhooks/example', async (req, reply) => {
    req.log.info({ body: req.body }, 'received example webhook')
    return reply.code(202).send({ data: { received: true } })
  })
}

export default webhookRoutes
