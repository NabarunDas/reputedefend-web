import "server-only"
import Stripe from "stripe"
import { liveSecretRejected, resolvePaymentProviderMode, stripeSecret, type PaymentEnv } from "./config"
import { assertSafeMetadata, paymentMetadata, type MappedProviderEvent } from "./model"
import { PaymentsDisabledError, type PaymentProvider } from "./provider"

function client(env: PaymentEnv): Stripe {
  const mode = resolvePaymentProviderMode(env)
  const secret = stripeSecret(env)
  if (mode !== "stripe_test" || !secret || liveSecretRejected(mode, secret)) {
    throw new PaymentsDisabledError("Stripe test mode is not configured.")
  }
  return new Stripe(secret)
}

function mapStripeEvent(event: Stripe.Event): MappedProviderEvent {
  const object = event.data.object as { id?: string; mode?: string; customer?: string | { id?: string }; payment_intent?: string | { id?: string }; setup_intent?: string | { id?: string }; payment_method?: string | { id?: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number; fingerprint?: string } }; latest_charge?: string | { id?: string; receipt_url?: string }; last_payment_error?: { code?: string } }
  const objectId = typeof object.id === "string" ? object.id : ""
  const customer = typeof object.customer === "string" ? object.customer : object.customer?.id
  const mapped: MappedProviderEvent = {
    eventId: event.id,
    type: event.type,
    objectId,
    objectType: event.type.startsWith("payment_intent.") ? "payment_intent" : event.type.startsWith("setup_intent.") ? "setup_intent" : "checkout.session",
    outcome: "ignored",
    stripeCustomerId: customer,
  }
  if (event.type === "checkout.session.completed" && object.mode === "setup") {
    mapped.outcome = "setup_succeeded"
  } else if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
    mapped.outcome = "succeeded"
    mapped.chargeId = typeof object.latest_charge === "string" ? object.latest_charge : object.latest_charge?.id ?? null
    mapped.receiptUrl = typeof object.latest_charge === "object" ? object.latest_charge?.receipt_url ?? null : null
  } else if (event.type === "payment_intent.requires_action") {
    mapped.outcome = "requires_action"
  } else if (event.type === "payment_intent.payment_failed" || event.type === "checkout.session.expired") {
    mapped.outcome = "failed"
    mapped.failureCategory = "DECLINED"
    mapped.failureCode = object.last_payment_error?.code ?? event.type
  } else if (event.type === "setup_intent.succeeded") {
    mapped.outcome = "setup_succeeded"
    const pm = object.payment_method
    if (pm && typeof pm === "object") {
      mapped.paymentMethod = {
        id: pm.id || "",
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
        fingerprint: pm.card?.fingerprint ?? null,
      }
    } else if (typeof pm === "string") {
      mapped.paymentMethod = { id: pm, brand: null, last4: null, expMonth: null, expYear: null, fingerprint: null }
    }
  } else if (event.type === "setup_intent.setup_failed" || event.type === "setup_intent.canceled") {
    mapped.outcome = "setup_failed"
  }
  return mapped
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
        setup_intent_data: { usage: "off_session", metadata: meta },
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
      return mapStripeEvent(event as Stripe.Event)
    },
  }
}

export function constructStripeEvent(rawBody: string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret)
}
