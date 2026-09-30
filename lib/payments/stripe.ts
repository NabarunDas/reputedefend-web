import "server-only"
import Stripe from "stripe"
import { liveSecretRejected, resolvePaymentProviderMode, stripeSecret, type PaymentEnv } from "./config"
import { assertSafeMetadata, mapBoundedProviderEvent, paymentMetadata } from "./model"
import { PaymentsDisabledError, type PaymentProvider } from "./provider"

function client(env: PaymentEnv): Stripe {
  const mode = resolvePaymentProviderMode(env)
  const secret = stripeSecret(env)
  if (mode !== "stripe_test" || !secret || liveSecretRejected(mode, secret)) {
    throw new PaymentsDisabledError("Stripe test mode is not configured.")
  }
  return new Stripe(secret)
}

function boundedObject(object: Record<string, unknown>): Record<string, unknown> {
  return {
    id: object.id,
    mode: object.mode,
    customer: object.customer,
    payment_intent: object.payment_intent,
    setup_intent: object.setup_intent,
    payment_method: object.payment_method,
    latest_charge: object.latest_charge,
    last_payment_error: object.last_payment_error,
    status: object.status,
    usage: object.usage,
  }
}

export function createStripePaymentProvider(env: PaymentEnv = process.env): PaymentProvider {
  return {
    mode: "stripe_test",
    async createCustomer(input) {
      const created = await client(env).customers.create(
        { metadata: { customerId: input.customerId } },
        { idempotencyKey: input.idempotencyKey },
      )
      if (created.livemode) throw new PaymentsDisabledError("Live Stripe customers are forbidden.")
      return { id: created.id, livemode: false }
    },
    async createPaymentCheckout(input) {
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      const session = await client(env).checkout.sessions.create({
        mode: "payment",
        customer: input.stripeCustomerId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.metadata.attemptId || input.metadata.obligationId,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: { name: "ProfileRelaunch service" },
          },
        }],
        metadata: meta,
      }, { idempotencyKey: input.idempotencyKey })
      if (session.livemode) throw new PaymentsDisabledError("Live Stripe Checkout is forbidden.")
      return { id: session.id, url: session.url || "", mode: "payment", amountMinor: input.amountMinor, livemode: false }
    },
    async createSetupCheckout(input) {
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      const session = await client(env).checkout.sessions.create({
        mode: "setup",
        customer: input.stripeCustomerId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: meta,
        // SDK 22.6.2 Checkout SessionCreateParams.SetupIntentData has no `usage` field.
        // Stripe SetupIntent create defaults usage to off_session, which is the intended Managed later-charge use.
        setup_intent_data: { metadata: meta },
      }, { idempotencyKey: input.idempotencyKey })
      if (session.livemode) throw new PaymentsDisabledError("Live Stripe Checkout is forbidden.")
      return { id: session.id, url: session.url || "", mode: "setup", amountMinor: 0, livemode: false }
    },
    async createOffSessionPayment(input) {
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      const intent = await client(env).paymentIntents.create({
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        customer: input.stripeCustomerId,
        payment_method: input.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: meta,
      }, { idempotencyKey: input.idempotencyKey })
      if (intent.livemode) throw new PaymentsDisabledError("Live Stripe PaymentIntents are forbidden.")
      return {
        id: intent.id,
        status: intent.status,
        amountMinor: intent.amount,
        requiresAction: intent.status === "requires_action",
        livemode: false,
      }
    },
    mapEvent(event) {
      return mapBoundedProviderEvent(event)
    },
    async retrieveObject(kind, id) {
      const stripe = client(env)
      if (kind === "checkout.session") {
        const session = await stripe.checkout.sessions.retrieve(id)
        if (session.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
        return boundedObject(session as unknown as Record<string, unknown>)
      }
      if (kind === "payment_intent") {
        const intent = await stripe.paymentIntents.retrieve(id)
        if (intent.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
        return boundedObject(intent as unknown as Record<string, unknown>)
      }
      const setup = await stripe.setupIntents.retrieve(id)
      if (setup.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return boundedObject(setup as unknown as Record<string, unknown>)
    },
  }
}

export function constructStripeEvent(rawBody: string, signature: string, secret: string): {
  id: string
  type: string
  data?: { object?: { id?: string } }
} {
  const event = Stripe.webhooks.constructEvent(rawBody, signature, secret)
  const object = event.data?.object as { id?: string } | undefined
  return {
    id: event.id,
    type: event.type,
    data: { object: object && typeof object.id === "string" ? { id: object.id } : undefined },
  }
}
