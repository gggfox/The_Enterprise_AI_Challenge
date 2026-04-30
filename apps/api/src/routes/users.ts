import { ALL_ROLES } from '@enterprise-ai/shared/auth'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { sendResult } from '../plugins/error-mapper.js'
import { listUsers, setUserRoles } from '../services/users.service.js'

const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/users/me', async (req, reply) => {
    if (!req.user) {
      return reply.code(401).send({ error: { reason: 'unauthenticated' } })
    }
    return reply.code(200).send({
      data: {
        _id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        roles: req.user.roles,
      },
    })
  })

  app.get('/api/v1/users', async (req, reply) => {
    if (!req.user || !req.userJwt) {
      return reply.code(401).send({ error: { reason: 'unauthenticated' } })
    }
    const result = await listUsers({ user: req.user, jwt: req.userJwt })
    return sendResult(reply, result)
  })

  const setRolesSchema = z.object({
    userId: z.string().min(1),
    roles: z.array(z.string()).min(0),
  })

  app.post('/api/v1/users/roles', async (req, reply) => {
    if (!req.user || !req.userJwt) {
      return reply.code(401).send({ error: { reason: 'unauthenticated' } })
    }
    const parsed = setRolesSchema.safeParse(req.body)
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
    const result = await setUserRoles(
      { user: req.user, jwt: req.userJwt },
      parsed.data,
    )
    return sendResult(reply, result)
  })

  app.get('/api/v1/users/roles', async () => ({
    data: ALL_ROLES,
  }))
}

export default usersRoutes
