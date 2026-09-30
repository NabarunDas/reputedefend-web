import "server-only"
import Stripe from "stripe"
import { isStripeTestSecret, liveSecretRejected, resolvePaymentProviderMode, type PaymentEnv } from "./config"
import { assertSafeGuardMetadata, assertSafeMetadata, guardMetadata, mapBoundedProviderEvent, paymentMetadata, type ProviderPaymentIntent } from "./model"
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
        mode: session.mode === "setup" ? "setup" : session.mode === "subscription" ? "subscription" : "payment",
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
    async createRecurringPrice(input) {
      const meta = { priceVersionId: input.priceVersionId, providerOperationId: input.providerOperationId }
      assertSafeGuardMetadata(meta)
      const stripe = client(env)
      const product = await stripe.products.create({
        name: "Relaunch Guard",
        metadata: meta,
      }, { idempotencyKey: `${input.idempotencyKey}:product` })
      if (product.livemode) throw new PaymentsDisabledError("Live Stripe products are forbidden.")
      const price = await stripe.prices.create({
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountMinor,
        recurring: { interval: "month" },
        product: product.id,
        metadata: meta,
      }, { idempotencyKey: input.idempotencyKey })
      if (price.livemode) throw new PaymentsDisabledError("Live Stripe prices are forbidden.")
      if (price.unit_amount !== input.amountMinor || (price.currency || "").toLowerCase() !== "gbp" || price.type !== "recurring") {
        throw new PaymentsDisabledError("Stripe Price does not match the approved Guard amount.")
      }
      return { productId: product.id, priceId: price.id, amountMinor: input.amountMinor, livemode: false as const }
    },
    async createSubscriptionCheckout(input) {
      const meta = guardMetadata(input.metadata)
      assertSafeGuardMetadata(meta)
      const session = await client(env).checkout.sessions.create({
        mode: "subscription",
        customer: input.stripeCustomerId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        payment_method_types: ["card"],
        line_items: [{ price: input.stripePriceId, quantity: 1 }],
        subscription_data: { metadata: meta },
        metadata: meta,
      }, { idempotencyKey: input.idempotencyKey })
      if (session.livemode) throw new PaymentsDisabledError("Live Stripe Checkout is forbidden.")
      return { id: session.id, url: session.url || "", mode: "subscription", amountMinor: 0, livemode: false }
    },
    async retrieveSubscription(id) {
      const subscription = await client(env).subscriptions.retrieve(id, { expand: ["items.data.price"] })
      if (subscription.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      const item = subscription.items.data[0]
      return {
        id: subscription.id,
        status: subscription.status,
        customerId: asId(subscription.customer),
        priceId: asId(item?.price) ?? (typeof item?.price === "string" ? item.price : null),
        subscriptionItemId: item?.id ?? null,
        quantity: item?.quantity ?? 0,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        currentPeriodStart: subscription.items.data[0]?.current_period_start
          ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
          : null,
        currentPeriodEnd: subscription.items.data[0]?.current_period_end
          ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
          : null,
        scheduleId: asId(subscription.schedule),
        metadata: metadataOf(subscription),
        livemode: false as const,
      }
    },
    async retrieveRecurringInvoice(id) {
      const invoice = await client(env).invoices.retrieve(id, { expand: ["payments.data.payment.payment_intent"] })
      if (invoice.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      const parent = invoice.parent && typeof invoice.parent === "object" ? invoice.parent as {
        subscription_details?: { subscription?: string | { id?: string } }
      } : {}
      const line = invoice.lines?.data?.[0]
      const pricing = line && "pricing" in line ? (line.pricing as { price_details?: { price?: string } } | null) : null
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
        subscriptionId: asId(parent.subscription_details?.subscription),
        subscriptionItemId: line?.parent?.subscription_item_details?.subscription_item ?? null,
        priceId: pricing?.price_details?.price ?? asId(line?.pricing) ?? null,
        quantity: line?.quantity ?? null,
        periodStart: line?.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
        periodEnd: line?.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
        paymentIntentId: asId((invoice as { payment_intent?: unknown }).payment_intent),
        chargeId: asId((invoice as { charge?: unknown }).charge),
      }
    },
    async setCancelAtPeriodEnd({ id, idempotencyKey, cancel }) {
      const updated = await client(env).subscriptions.update(id, { cancel_at_period_end: cancel }, { idempotencyKey })
      if (updated.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: updated.id,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancel_at_period_end === true,
        canceled: updated.status === "canceled",
        livemode: false as const,
      }
    },
    async cancelSubscriptionImmediate({ id, idempotencyKey }) {
      const cancelled = await client(env).subscriptions.cancel(id, undefined, { idempotencyKey })
      if (cancelled.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: cancelled.id,
        status: cancelled.status,
        cancelAtPeriodEnd: false,
        canceled: cancelled.status === "canceled",
        livemode: false as const,
      }
    },
    async createSubscriptionSchedule(input) {
      const stripe = client(env)
      const created = await stripe.subscriptionSchedules.create({
        from_subscription: input.subscriptionId,
      }, { idempotencyKey: input.idempotencyKey })
      if (created.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      const updated = await stripe.subscriptionSchedules.update(created.id, {
        end_behavior: "release",
        proration_behavior: "none",
        phases: [
          {
            items: [{ price: input.currentPriceId, quantity: 1 }],
            start_date: created.phases[0]?.start_date,
            end_date: input.periodEnd,
            proration_behavior: "none",
          },
          {
            items: [{ price: input.nextPriceId, quantity: 1 }],
            proration_behavior: "none",
          },
        ],
      }, { idempotencyKey: `${input.idempotencyKey}:phases` })
      if (updated.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return { id: updated.id, subscriptionId: asId(updated.subscription) || input.subscriptionId, livemode: false as const }
    },
    async createRefund(input) {
      const refund = await client(env).refunds.create({
        payment_intent: input.paymentIntentId,
        amount: input.amountMinor,
      }, { idempotencyKey: input.idempotencyKey })
      if ((refund as { livemode?: boolean }).livemode) throw new PaymentsDisabledError("Live Stripe refunds are forbidden.")
      return {
        id: refund.id,
        status: refund.status || "pending",
        amountMinor: refund.amount,
        currency: (refund.currency || "gbp").toLowerCase(),
        paymentIntentId: asId(refund.payment_intent),
        chargeId: asId(refund.charge),
        failureReason: refund.failure_reason ?? null,
        livemode: false as const,
      }
    },
    async retrieveRefund(id) {
      const refund = await client(env).refunds.retrieve(id)
      if ((refund as { livemode?: boolean }).livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: refund.id,
        status: refund.status || "pending",
        amountMinor: refund.amount,
        currency: (refund.currency || "gbp").toLowerCase(),
        paymentIntentId: asId(refund.payment_intent),
        chargeId: asId(refund.charge),
        failureReason: refund.failure_reason ?? null,
        livemode: false as const,
      }
    },
    async retrieveDispute(id) {
      const dispute = await client(env).disputes.retrieve(id)
      if (dispute.livemode) throw new PaymentsDisabledError("Live Stripe objects are forbidden.")
      return {
        id: dispute.id,
        status: dispute.status,
        amountMinor: dispute.amount,
        currency: (dispute.currency || "gbp").toLowerCase(),
        chargeId: asId(dispute.charge),
        reason: dispute.reason ?? null,
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
