import type { FastifyPluginAsync } from 'fastify'

const health: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    service: 'enterprise-ai-api',
    time: new Date().toISOString(),
  }))
}

export default health
