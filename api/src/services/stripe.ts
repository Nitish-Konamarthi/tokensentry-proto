import type Stripe from 'stripe'
import { getStripeClient, getWebhookSecret } from '../clients/stripe.js'
import { orgRepo } from '../repositories/org.js'
import { auditLogRepo } from '../repositories/audit-log.js'
import { logger } from '../lib/logger.js'

const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  business: process.env['STRIPE_PRICE_BUSINESS'],
  enterprise: process.env['STRIPE_PRICE_ENTERPRISE'],
}

const PLAN_FROM_PRICE: Record<string, string> = {}

export async function createCheckoutSession(params: {
  orgId: string
  orgName: string
  plan: string
  customerId?: string
  returnUrl: string
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient()

  const priceId = PLAN_PRICE_IDS[params.plan]
  if (!priceId) {
    throw new Error(`No price configured for plan: ${params.plan}`)
  }

  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    customer_creation: params.customerId ? undefined : 'always',
    customer_email: params.customerId ? undefined : undefined,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${params.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.returnUrl}?canceled=true`,
    metadata: {
      org_id: params.orgId,
      org_name: params.orgName,
      plan: params.plan,
    },
    subscription_data: {
      metadata: {
        org_id: params.orgId,
        plan: params.plan,
      },
    },
  })

  logger.info({ orgId: params.orgId, plan: params.plan, sessionId: session.id }, 'Checkout session created')

  return session
}

export async function createPortalSession(params: {
  customerId: string
  returnUrl: string
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripeClient()

  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  })

  return session
}

export async function handleWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<{ received: boolean; eventType: string }> {
  const stripe = getStripeClient()
  const secret = getWebhookSecret()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    logger.error({ err }, 'Stripe webhook signature verification failed')
    throw new Error('Webhook signature verification failed')
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received')

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      await handleCheckoutCompleted(session)
      break
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      await handleSubscriptionUpdated(subscription)
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await handleSubscriptionDeleted(subscription)
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      await handlePaymentFailed(invoice)
      break
    }
  }

  return { received: true, eventType: event.type }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const orgId = session.metadata?.org_id
  const plan = session.metadata?.plan ?? 'business'

  if (!orgId) {
    logger.warn({ sessionId: session.id }, 'Checkout completed without org_id metadata')
    return
  }

  const customerId = session.customer as string

  try {
    await orgRepo.updateStripeCustomerId(orgId, customerId)
    await orgRepo.updatePlan(orgId, plan)

    await auditLogRepo.insert({
      orgId,
      action: 'billing.subscription.created',
      resource: `stripe:session:${session.id}`,
      details: { plan, customerId } as Record<string, unknown>,
    })

    logger.info({ orgId, plan, customerId }, 'Org upgraded after checkout')
  } catch (err) {
    logger.error({ err, orgId, sessionId: session.id }, 'Failed to process checkout completed')
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const orgId = subscription.metadata?.org_id

  if (!orgId) {
    logger.warn({ subscriptionId: subscription.id }, 'Subscription updated without org_id metadata')
    return
  }

  const plan = determinePlanFromItems(subscription.items.data)
  const status = subscription.status

  try {
    if (plan) {
      await orgRepo.updatePlan(orgId, plan)
    }

    await auditLogRepo.insert({
      orgId,
      action: `billing.subscription.${status}`,
      resource: `stripe:subscription:${subscription.id}`,
      details: { plan, status } as Record<string, unknown>,
    })

    logger.info({ orgId, plan, status }, 'Org plan updated after subscription change')
  } catch (err) {
    logger.error({ err, orgId, subscriptionId: subscription.id }, 'Failed to process subscription updated')
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const orgId = subscription.metadata?.org_id

  if (!orgId) {
    logger.warn({ subscriptionId: subscription.id }, 'Subscription deleted without org_id metadata')
    return
  }

  try {
    await orgRepo.updatePlan(orgId, 'starter')

    await auditLogRepo.insert({
      orgId,
      action: 'billing.subscription.deleted',
      resource: `stripe:subscription:${subscription.id}`,
      details: {} as Record<string, unknown>,
    })

    logger.info({ orgId }, 'Org downgraded to starter after subscription deletion')
  } catch (err) {
    logger.error({ err, orgId, subscriptionId: subscription.id }, 'Failed to process subscription deleted')
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string
  const subscriptionId = invoice.subscription as string | undefined

  logger.warn({ customerId, subscriptionId, invoiceId: invoice.id }, 'Payment failed')
}

function determinePlanFromItems(items: Stripe.SubscriptionItem[]): string | null {
  for (const item of items) {
    const priceId = item.price.id
    const plan = PLAN_FROM_PRICE[priceId]
    if (plan) return plan
  }

  if (items.length > 0) {
    const priceId = items[0]!.price.id
    if (priceId.includes('business')) return 'business'
    if (priceId.includes('enterprise')) return 'enterprise'
  }

  return null
}
