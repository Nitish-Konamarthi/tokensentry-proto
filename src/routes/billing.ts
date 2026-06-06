// src/routes/billing.ts — Stripe Integration
import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import Stripe from 'stripe'
import { requireApiKey } from '../middleware/auth.js'
import { pg } from '../clients/db.js'
import { logger } from '../utils/logger.js'

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] || 'sk_test_dummy')

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post('/v1/billing/checkout', {
    preHandler: requireApiKey,
    schema: {
      body: Type.Object({
        plan: Type.Union([Type.Literal('business'), Type.Literal('enterprise')]),
      }),
    },
  }, async (request, reply) => {
    const ctx = request.authContext
    const { plan } = request.body as { plan: 'business' | 'enterprise' }

    if (!['owner', 'admin'].includes(ctx.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const rows = await pg<Array<{ stripe_customer_id: string | null }>>`
      SELECT stripe_customer_id FROM organizations WHERE id = ${ctx.orgId}
    `
    const org = rows[0]

    let customerId = org?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { org_id: ctx.orgId },
      })
      customerId = customer.id
      await pg`UPDATE organizations SET stripe_customer_id = ${customerId} WHERE id = ${ctx.orgId}`
    }

    const priceId = plan === 'business'
      ? process.env['STRIPE_PRICE_BUSINESS']!
      : process.env['STRIPE_PRICE_ENTERPRISE']!

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { org_id: ctx.orgId },
    }
    if (plan === 'business') {
      subscriptionData.trial_period_days = 14
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env['FRONTEND_URL']}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env['FRONTEND_URL']}/billing`,
      metadata: { org_id: ctx.orgId },
      subscription_data: subscriptionData,
      allow_promotion_codes: true,
    })

    return reply.send({ checkout_url: session.url, session_id: session.id })
  })

  fastify.post('/v1/webhooks/stripe', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string
    const rawBody = (request as unknown as { rawBody: Buffer }).rawBody

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env['STRIPE_WEBHOOK_SECRET']!)
    } catch (err) {
      logger.warn({ err }, 'Stripe webhook signature verification failed')
      return reply.code(400).send({ error: 'Invalid signature' })
    }

    logger.info({ type: event.type }, 'Stripe webhook received')

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.['org_id']
        if (orgId) {
          await pg`UPDATE organizations SET plan = 'business', stripe_subscription_id = ${session.subscription as string}, updated_at = NOW() WHERE id = ${orgId}`
        }
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.['org_id']
        if (orgId) {
          await pg`UPDATE organizations SET plan = 'starter', updated_at = NOW() WHERE id = ${orgId}`
        }
        break
      }
    }

    return reply.send({ received: true })
  })

  fastify.post('/v1/billing/portal', {
    preHandler: requireApiKey,
  }, async (request, reply) => {
    const ctx = request.authContext
    const rows = await pg<Array<{ stripe_customer_id: string | null }>>`
      SELECT stripe_customer_id FROM organizations WHERE id = ${ctx.orgId}
    `
    const customerId = rows[0]?.stripe_customer_id
    if (!customerId) {
      return reply.code(400).send({
        error: 'NO_STRIPE_CUSTOMER',
        message: 'No billing account found. Upgrade to Business first.',
      })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env['FRONTEND_URL']}/billing`,
    })

    return reply.send({ portal_url: session.url })
  })
}
