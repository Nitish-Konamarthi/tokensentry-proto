import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth-admin.js'
import { orgRepo } from '../repositories/org.js'
import { z } from 'zod'
import { canonicalizeModelId } from '../services/canonicalize.js'
import { modelCatalogService } from '../services/model-catalog-service.js'

const modelPolicySchema = z.object({
  allowed_models: z.array(z.string().min(1).max(200)).min(1).max(100),
  max_model_tier: z.enum(['low', 'standard', 'high', 'premium']),
  require_classification: z.boolean().optional(),
  allow_opus: z.boolean().optional(),
}).strict()

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  model_policy: modelPolicySchema.optional(),
}).strict()

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
    const parsed = settingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid settings' })
    }
    const body = parsed.data

    if (body.name) {
      await orgRepo.updateName(ctx.orgId, body.name)
    }

    if (body.model_policy) {
      const allowedModels = body.model_policy.allowed_models.map(canonicalizeModelId)
      const unsupported = allowedModels.filter(model => !modelCatalogService.isSupported(model))
      if (unsupported.length > 0) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', message: `Unsupported models: ${unsupported.join(', ')}` })
      }
      await orgRepo.updatePolicy(ctx.orgId, { ...body.model_policy, allowed_models: [...new Set(allowedModels)] })
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
