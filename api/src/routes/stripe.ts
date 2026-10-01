import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { createCheckoutSession, createPortalSession, handleWebhookEvent } from '../services/stripe.js'
import { orgRepo } from '../repositories/org.js'
import { logger } from '../lib/logger.js'

export async function stripeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/stripe/create-checkout-session', {
    preHandler: requireApiKey,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const body = request.body as { plan: string; return_url: string }

    if (!body.plan || !['business', 'enterprise'].includes(body.plan)) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'plan must be "business" or "enterprise"',
      })
    }

    if (!body.return_url) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'return_url is required',
      })
    }

    const org = await orgRepo.findById(ctx.orgId)
    if (!org) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Organization not found' })
    }

    try {
      const session = await createCheckoutSession({
        orgId: ctx.orgId,
        orgName: org.name,
        plan: body.plan,
        customerId: org.stripeCustomerId ?? undefined,
        returnUrl: body.return_url,
      })

      return { url: session.url, session_id: session.id }
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId, plan: body.plan }, 'Failed to create checkout session')
      return reply.code(500).send({
        error: 'STRIPE_ERROR',
        message: 'Failed to create checkout session',
      })
    }
  })

  fastify.post('/v1/stripe/create-portal-session', {
    preHandler: requireApiKey,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.authContext
    const body = request.body as { return_url: string }

    if (!body.return_url) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'return_url is required',
      })
    }

    const org = await orgRepo.findById(ctx.orgId)
    if (!org) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Organization not found' })
    }

    if (!org.stripeCustomerId) {
      return reply.code(400).send({
        error: 'NO_CUSTOMER',
        message: 'No Stripe customer found. Subscribe to a plan first.',
      })
    }

    try {
      const session = await createPortalSession({
        customerId: org.stripeCustomerId,
        returnUrl: body.return_url,
      })

      return { url: session.url }
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId }, 'Failed to create portal session')
      return reply.code(500).send({
        error: 'STRIPE_ERROR',
        message: 'Failed to create portal session',
      })
    }
  })

  // Webhook — registered in a child context with raw body parser
  await fastify.register(async function webhookPlugin(instance) {
    instance.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 1_048_576 },
      (_req: unknown, body: string, done: (err: Error | null, result?: string) => void) => {
        done(null, body)
      },
    )

    instance.post('/v1/stripe/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['stripe-signature'] as string
      if (!signature) {
        return reply.code(400).send({ error: 'MISSING_SIGNATURE', message: 'stripe-signature header required' })
      }

      const rawBody = request.body as string

      try {
        const result = await handleWebhookEvent(rawBody, signature)
        return result
      } catch (err) {
        logger.error({ err }, 'Stripe webhook processing failed')
        return reply.code(400).send({ error: 'WEBHOOK_ERROR', message: 'Webhook processing failed' })
      }
    })
  })
}
