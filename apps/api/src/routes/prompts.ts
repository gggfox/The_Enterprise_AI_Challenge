/**
 * `/api/v1/prompts/*` -- Bearer-authed CRUD that writes through Convex.
 *
 * Reads on this resource are intentionally also exposed (in addition to
 * Convex's reactive websocket) so non-browser clients (Bruno, server jobs)
 * can consume the same data without opening a Convex client.
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { sendResult } from '../plugins/error-mapper.js'
import {
  createPrompt,
  deletePrompt,
  listPrompts,
  updatePrompt,
} from '../services/prompts.service.js'

const promptsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/prompts', async (req, reply) => {
    if (!req.user || !req.userJwt) {
      return reply.code(401).send({ error: { reason: 'unauthenticated' } })
    }
    const result = await listPrompts({ user: req.user, jwt: req.userJwt })
    return sendResult(reply, result)
  })

  const createSchema = z.object({
    title: z.string().min(1).max(200),
    body: z.string().max(10_000),
  })

  app.post('/api/v1/prompts', async (req, reply) => {
    if (!req.user || !req.userJwt) {
      return reply.code(401).send({ error: { reason: 'unauthenticated' } })
    }
    const parsed = createSchema.safeParse(req.body)
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
    const result = await createPrompt(
      { user: req.user, jwt: req.userJwt },
      parsed.data,
    )
    return sendResult(reply, result, 201)
  })

  const updateSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(10_000).optional(),
    archived: z.boolean().optional(),
  })

  app.patch<{ Params: { id: string } }>(
    '/api/v1/prompts/:id',
    async (req, reply) => {
      if (!req.user || !req.userJwt) {
        return reply.code(401).send({ error: { reason: 'unauthenticated' } })
      }
      const parsed = updateSchema.safeParse(req.body)
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
      const patch: {
        id: string
        title?: string
        body?: string
        archived?: boolean
      } = { id: req.params.id }
      if (parsed.data.title !== undefined) patch.title = parsed.data.title
      if (parsed.data.body !== undefined) patch.body = parsed.data.body
      if (parsed.data.archived !== undefined)
        patch.archived = parsed.data.archived
      const result = await updatePrompt(
        { user: req.user, jwt: req.userJwt },
        patch,
      )
      return sendResult(reply, result)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/v1/prompts/:id',
    async (req, reply) => {
      if (!req.user || !req.userJwt) {
        return reply.code(401).send({ error: { reason: 'unauthenticated' } })
      }
      const result = await deletePrompt(
        { user: req.user, jwt: req.userJwt },
        { id: req.params.id },
      )
      return sendResult(reply, result)
    },
  )
}

export default promptsRoutes
