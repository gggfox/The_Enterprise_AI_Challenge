/**
 * Per-request "wide event" emitter -- one structured log line per request
 * with route, status, latency, user, and any captured error reason.
 *
 * Successful requests are sampled at `config.observability.successSampleRate`
 * to keep the volume sane; errors and slow requests (>= slowMs) always
 * emit.
 */

import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { config } from '../config.js'

const START_KEY = Symbol('wideEventStart')

type RequestWithStart = {
  [START_KEY]?: bigint
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req) => {
    ;(req as unknown as RequestWithStart)[START_KEY] = process.hrtime.bigint()
  })

  app.addHook('onResponse', async (req, reply) => {
    const start = (req as unknown as RequestWithStart)[START_KEY]
    if (start === undefined) return

    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000
    const status = reply.statusCode
    const isError = status >= 500 || status === 429
    const isClientError = status >= 400 && status < 500
    const isSlow = elapsedMs >= config.observability.slowMs

    const shouldEmit =
      isError ||
      isClientError ||
      isSlow ||
      Math.random() < config.observability.successSampleRate

    if (!shouldEmit) return

    const event = {
      kind: 'http_request',
      method: req.method,
      route: req.routeOptions.url ?? req.url,
      url: req.url,
      status,
      duration_ms: Math.round(elapsedMs * 100) / 100,
      slow: isSlow,
      user_id: req.user?._id,
      user_roles: req.user?.roles,
      // Tenancy / multi-deploy attributes match the otel resource attrs
      // so OpenObserve can join logs to traces by service+env.
      service: config.observability.service,
      env: config.observability.namespace,
    }

    if (isError) {
      req.log.error(event, 'wide_event')
    } else if (isClientError) {
      req.log.warn(event, 'wide_event')
    } else {
      req.log.info(event, 'wide_event')
    }
  })
}

export default fp(plugin, { name: 'wide-event' })
