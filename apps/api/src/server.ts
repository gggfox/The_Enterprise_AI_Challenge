/**
 * Fastify entrypoint.
 *
 * IMPORTANT: `./otel.js` is imported FIRST so the auto-instrumentations
 * patch the modules every other file is about to import. Swapping the
 * order means spans disappear.
 */

import { shutdownOtel } from './otel.js'

import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import Fastify, { type FastifyError } from 'fastify'
import { config } from './config.js'
import { logger } from './logger.js'
import authPlugin from './plugins/auth.js'
import wideEvent from './plugins/wide-event.js'
import routes from './routes/index.js'
import './types.js'

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: false,
    bodyLimit: 1_048_576,
    trustProxy: true,
  })

  await app.register(sensible)
  await app.register(cors, {
    origin: [config.http.dashboardOrigin, 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-debug'],
  })

  await app.register(authPlugin)
  await app.register(wideEvent)
  await app.register(routes)

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const statusCode = err.statusCode ?? 500
    reply.code(statusCode).send({
      error: {
        reason: statusCode === 500 ? 'internal' : 'upstream_failed',
        message: err.message ?? 'Unhandled error',
      },
    })
  })

  return app
}

type BuiltServer = Awaited<ReturnType<typeof buildServer>>

async function shutdown(app: BuiltServer, signal: string): Promise<void> {
  logger.info({ signal }, 'shutdown: starting')
  try {
    await app.close()
    await shutdownOtel()
    logger.info({ signal }, 'shutdown: complete')
    process.exit(0)
  } catch (err: unknown) {
    logger.error({ err }, 'shutdown: failed')
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const app = await buildServer()
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdown(app, signal)
    })
  }
  await app.listen({ port: config.http.port, host: '0.0.0.0' })
  logger.info({ port: config.http.port }, 'api: listening')
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`
if (isDirectRun) {
  try {
    await main()
  } catch (err: unknown) {
    logger.error({ err }, 'api: boot failed')
    process.exit(1)
  }
}
