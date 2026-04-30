import type { FastifyPluginAsync } from 'fastify'
import adminRoutes from './admin.js'
import healthRoutes from './health.js'
import promptsRoutes from './prompts.js'
import telemetryRoutes from './telemetry.js'
import usersRoutes from './users.js'
import webhookRoutes from './webhooks.js'

const routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes)
  await app.register(usersRoutes)
  await app.register(promptsRoutes)
  await app.register(adminRoutes)
  await app.register(webhookRoutes)
  await app.register(telemetryRoutes)
}

export default routes
