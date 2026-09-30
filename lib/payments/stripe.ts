import "server-only"
import Stripe from "stripe"
import { isStripeTestSecret, liveSecretRejected, resolvePaymentProviderMode, type PaymentEnv } from "./config"
import { assertSafeMetadata, mapBoundedProviderEvent, paymentMetadata, type ProviderPaymentIntent } from "./model"
import { LiveStripeKeyError, PaymentsDisabledError, type PaymentProvider } from "./provider"

function rawSecret(env: PaymentEnv): string | null {
  return env.STRIPE_SECRET_KEY ?? null
}

function client(env: PaymentEnv): Stripe {
  const mode = resolvePaymentProviderMode(env)
  const raw = rawSecret(env)
  if (mode !== "stripe_test" || liveSecretRejected(mode, raw) || !isStripeTestSecret(raw)) {
    throw new LiveStripeKeyError()
  }
  return new Stripe(raw)
}

function asId(value: unknown): string | null {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id
  return null
}

function metadataOf(value: { metadata?: Stripe.Metadata | null } | null | undefined): Record<string, string> {
  const meta = value?.metadata
  if (!meta) return {}
  return Object.fromEntries(Object.entries(meta).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
}

function classifyStripeError(error: unknown, amountMinor: number): ProviderPaymentIntent {
  const stripeError = error as {
    type?: string
    code?: string
    statusCode?: number
    payment_intent?: { id?: string; status?: string }
    rawType?: string
  }
  const intent = stripeError.payment_intent
  if (intent?.status === "requires_action" || stripeError.code === "authentication_required") {
    return {
      id: intent?.id,
      status: "requires_action",
      amountMinor,
      requiresAction: true,
      livemode: false,
      classification: "requires_action",
      retryable: false,
      failureCode: stripeError.code ?? "authentication_required",
      failureCategory: "AUTHENTICATION_REQUIRED",
    }
  }
  const retryable = stripeError.type === "StripeConnectionError"
    || stripeError.type === "StripeAPIConnectionError"
    || stripeError.type === "StripeRateLimitError"
    || stripeError.rawType === "api_connection_error"
    || stripeError.rawType === "rate_limit_error"
    || (typeof stripeError.statusCode === "number" && stripeError.statusCode >= 500)
  if (retryable) {
    return {
      id: intent?.id,
      status: "retryable",
      amountMinor,
      requiresAction: false,
      livemode: false,
      classification: "retryable",
      retryable: true,
      failureCode: stripeError.code ?? stripeError.type ?? "provider_unavailable",
      failureCategory: "INFRASTRUCTURE",
    }
  }
  return {
    id: intent?.id,
    status: "failed",
    amountMinor,
    requiresAction: false,
    livemode: false,
    classification: "declined",
    retryable: false,
    failureCode: stripeError.code ?? "card_declined",
    failureCategory: "DECLINED",
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
        payment_method_types: ["card"],
        payment_intent_data: { metadata: meta },
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
        payment_method_types: ["card"],
        metadata: meta,
        setup_intent_data: { metadata: meta },
      }, { idempotencyKey: input.idempotencyKey })
      if (session.livemode) throw new PaymentsDisabledError("Live Stripe Checkout is forbidden.")
      return { id: session.id, url: session.url || "", mode: "setup", amountMinor: 0, livemode: false }
    },
    async createOffSessionPayment(input) {
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      try {
        const intent = await client(env).paymentIntents.create({
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          customer: input.stripeCustomerId,
          payment_method: input.paymentMethodId,
          off_session: true,
          confirm: true,
          payment_method_types: ["card"],
          metadata: meta,
        }, { idempotencyKey: input.idempotencyKey })
        if (intent.livemode) throw new PaymentsDisabledError("Live Stripe PaymentIntents are forbidden.")
        if (intent.status === "requires_action") {
          return {
            id: intent.id,
            status: intent.status,
            amountMinor: intent.amount,
            requiresAction: true,
            livemode: false,
            classification: "requires_action",
            retryable: false,
          }
        }
        if (intent.status === "succeeded") {
          return {
            id: intent.id,
            status: intent.status,
            amountMinor: intent.amount,
            requiresAction: false,
            livemode: false,
            classification: "succeeded",
            retryable: false,
          }
        }
        return {
          id: intent.id,
          status: intent.status,
          amountMinor: intent.amount,
          requiresAction: false,
          livemode: false,
          classification: "declined",
          retryable: false,
          failureCode: intent.last_payment_error?.code ?? intent.status,
          failureCategory: "DECLINED",
        }
      } catch (error) {
        if (error instanceof PaymentsDisabledError) throw error
        return classifyStripeError(error, input.amountMinor)
      }
    },
    async retrieveCheckout(id) {
      const session = await client(env).checkout.sessions.retrieve(id)
      if (session.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: session.id,
        mode: session.mode === "setup" ? "setup" : "payment",
        status: session.status || "unknown",
        paymentStatus: session.payment_status ?? null,
        paymentIntentId: asId(session.payment_intent),
        setupIntentId: asId(session.setup_intent),
        customerId: asId(session.customer),
        url: session.url,
        metadata: metadataOf(session),
        livemode: false,
      }
    },
    async retrievePaymentIntent(id) {
      const intent = await client(env).paymentIntents.retrieve(id)
      if (intent.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      const charge = intent.latest_charge
      return {
        id: intent.id,
        status: intent.status,
        customerId: asId(intent.customer),
        amountMinor: intent.amount,
        currency: (intent.currency || "gbp").toLowerCase(),
        chargeId: asId(charge),
        receiptUrl: charge && typeof charge === "object" && "receipt_url" in charge && typeof charge.receipt_url === "string" ? charge.receipt_url : null,
        lastErrorCode: intent.last_payment_error?.code ?? null,
        metadata: metadataOf(intent),
        livemode: false,
      }
    },
    async retrieveSetupIntent(id) {
      const setup = await client(env).setupIntents.retrieve(id)
      if (setup.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: setup.id,
        status: setup.status,
        usage: setup.usage ?? null,
        customerId: asId(setup.customer),
        paymentMethodId: asId(setup.payment_method),
        metadata: metadataOf(setup),
        livemode: false,
      }
    },
    async retrievePaymentMethod(id) {
      if (!id.startsWith("pm_")) return null
      const method = await client(env).paymentMethods.retrieve(id)
      if (method.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: method.id,
        brand: method.card?.brand ?? null,
        last4: method.card?.last4 ?? null,
        expMonth: method.card?.exp_month ?? null,
        expYear: method.card?.exp_year ?? null,
        fingerprint: method.card?.fingerprint ?? null,
      }
    },
    async retrieveInvoice(id) {
      const invoice = await client(env).invoices.retrieve(id)
      if (invoice.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: invoice.id,
        status: invoice.status || "unknown",
        customerId: asId(invoice.customer),
        amountDueMinor: invoice.amount_due,
        amountPaidMinor: invoice.amount_paid,
        currency: (invoice.currency || "gbp").toLowerCase(),
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        metadata: metadataOf(invoice),
        livemode: false as const,
      }
    },
    async createHostedInvoice(input) {
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      const stripe = client(env)
      const created = await stripe.invoices.create({
        customer: input.stripeCustomerId,
        currency: input.currency.toLowerCase(),
        collection_method: "send_invoice",
        days_until_due: 30,
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        metadata: meta,
        payment_settings: { payment_method_types: ["card"] },
      }, { idempotencyKey: input.idempotencyKey })
      if (created.livemode) throw new PaymentsDisabledError("Live Stripe invoices are forbidden.")
      await stripe.invoices.addLines(created.id, {
        lines: [{
          description: "ProfileRelaunch service",
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            product_data: { name: "ProfileRelaunch service" },
            unit_amount: input.amountMinor,
          },
        }],
      }, { idempotencyKey: `${input.idempotencyKey}:lines` })
      const finalized = await stripe.invoices.finalizeInvoice(created.id, { auto_advance: false }, { idempotencyKey: `${input.idempotencyKey}:finalize` })
      if (finalized.livemode) throw new PaymentsDisabledError("Live Stripe invoices are forbidden.")
      if (finalized.amount_due !== input.amountMinor || (finalized.currency || "").toLowerCase() !== "gbp" || !finalized.hosted_invoice_url) {
        throw new PaymentsDisabledError("Hosted invoice amount or currency did not match the obligation.")
      }
      return {
        id: finalized.id,
        hostedInvoiceUrl: finalized.hosted_invoice_url,
        amountDueMinor: finalized.amount_due,
        currency: (finalized.currency || "gbp").toLowerCase(),
        status: finalized.status || "open",
        livemode: false as const,
      }
    },
    async cancelPaymentIntent({ id, idempotencyKey }) {
      const current = await client(env).paymentIntents.retrieve(id)
      if (current.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      if (current.status === "succeeded") {
        return { ok: false, id: current.id, status: current.status, alreadySucceeded: true, cancelled: false }
      }
      if (current.status === "canceled") {
        return { ok: true, id: current.id, status: current.status, alreadySucceeded: false, cancelled: true }
      }
      const cancelled = await client(env).paymentIntents.cancel(id, undefined, { idempotencyKey })
      if (cancelled.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        ok: cancelled.status === "canceled",
        id: cancelled.id,
        status: cancelled.status,
        alreadySucceeded: cancelled.status === "succeeded",
        cancelled: cancelled.status === "canceled",
      }
    },
    mapEvent(event) {
      return mapBoundedProviderEvent(event)
    },
  }
}

export function constructStripeEvent(rawBody: string, signature: string, secret: string): {
  id: string
  type: string
  livemode: boolean
  data?: { object?: { id?: string } }
} {
  const event = Stripe.webhooks.constructEvent(rawBody, signature, secret)
  const object = event.data?.object as { id?: string } | undefined
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode === true,
    data: { object: object && typeof object.id === "string" ? { id: object.id } : undefined },
  }
}
