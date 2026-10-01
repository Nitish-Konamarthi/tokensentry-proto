import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth-admin.js'
import { orgRepo } from '../repositories/org.js'

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/settings', { preHandler: requireApiKey }, async (request: FastifyRequest) => {
    const ctx = request.authContext
    const org = await orgRepo.findById(ctx.orgId)

    if (!org) {
      return { name: '', slug: '', plan: 'starter', model_policy: null }
    }

    return {
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      model_policy: org.modelPolicy,
    }
  })

  fastify.put('/v1/settings', { preHandler: [requireApiKey, requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const body = request.body as {
      name?: string
      model_policy?: Record<string, unknown>
    }

    if (body.name) {
      await orgRepo.updateName(ctx.orgId, body.name)
    }

    if (body.model_policy) {
      await orgRepo.updatePolicy(ctx.orgId, body.model_policy)
    }

    const org = await orgRepo.findById(ctx.orgId)

    return {
      name: org?.name ?? '',
      slug: org?.slug ?? '',
      plan: org?.plan ?? 'starter',
      model_policy: org?.modelPolicy,
    }
  })
}
