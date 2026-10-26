import "server-only"
import Stripe from "stripe"
import { isStripeLiveSecret, isStripeTestSecret, paymentLane, resolvePaymentProviderMode, type PaymentEnv } from "./config"
import { databaseLaneAgrees, type DatabasePaymentLane } from "./lane-agreement"
import { GUARD_PRODUCT_NAME, normalisedCheckoutEmail, requireCheckoutPresentation } from "./checkout-presentation"
import { assertGuardScheduleSubscription, assertSafeGuardMetadata, assertSafeMetadata, guardMetadata, HOSTED_INVOICE_DAYS_UNTIL_DUE, isStripeTrialEndAllowed, mapBoundedProviderEvent, paymentMetadata } from "./model"
import { LiveStripeKeyError, PaymentsDisabledError, type PaymentProvider } from "./provider"
import { trustedStripeUrl } from "./stripe-url"

function requireCheckoutUrl(url: string | null | undefined): string {
  const trusted = trustedStripeUrl(url, "checkout")
  if (!trusted) throw new PaymentsDisabledError("Stripe Checkout URL was rejected.")
  return trusted
}

function acceptedInvoiceUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return trustedStripeUrl(url, "invoice")
}

function requireInvoiceUrl(url: string | null | undefined): string {
  const trusted = trustedStripeUrl(url, "invoice")
  if (!trusted) throw new PaymentsDisabledError("Hosted invoice URL was rejected.")
  return trusted
}

function rawSecret(env: PaymentEnv): string | null {
  return env.STRIPE_SECRET_KEY ?? null
}

function client(env: PaymentEnv): Stripe {
  const mode = resolvePaymentProviderMode(env)
  const raw = rawSecret(env) ?? ""
  const liveKey = isStripeLiveSecret(raw)
  if (liveKey && paymentLane(env) !== "production") throw new LiveStripeKeyError()
  if (mode === "stripe_test" && isStripeTestSecret(raw) && !liveKey) return new Stripe(raw)
  if (mode === "stripe_live" && liveKey && env.STRIPE_LIVE_ACTIVATION === "enabled") return new Stripe(raw)
  if (liveKey) throw new LiveStripeKeyError()
  throw new PaymentsDisabledError("Stripe client is not available for this lane.")
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

export function createStripePaymentProvider(env: PaymentEnv = process.env, databaseLane?: DatabasePaymentLane | null): PaymentProvider {
  const mode = resolvePaymentProviderMode(env)
  if (mode !== "stripe_test" && mode !== "stripe_live") throw new PaymentsDisabledError()
  const raw = rawSecret(env) ?? ""
  if (isStripeLiveSecret(raw) && paymentLane(env) !== "production") throw new LiveStripeKeyError()
  if (mode === "stripe_live" && !isStripeLiveSecret(raw)) throw new PaymentsDisabledError()
  if (mode === "stripe_test" && !isStripeTestSecret(raw)) throw new PaymentsDisabledError()
  if (!databaseLaneAgrees(env, databaseLane ?? null)) {
    throw new PaymentsDisabledError("Payment database lane does not match this environment.")
  }
  const expectedLivemode = mode === "stripe_live"
  function lane<T extends { livemode?: boolean }>(value: T, label: string): T {
    if (value.livemode !== expectedLivemode) {
      throw new PaymentsDisabledError(`${label} does not belong to this payment lane.`)
    }
    return value
  }
  return {
    mode,
    async createCustomer(input) {
      const email = input.email == null || input.email === "" ? undefined : normalisedCheckoutEmail(input.email)
      if (input.email && !email) throw new PaymentsDisabledError("Stripe customer email was rejected.")
      const created = await client(env).customers.create(
        {
          ...(email ? { email } : {}),
          metadata: { customerId: input.customerId },
        },
        { idempotencyKey: input.idempotencyKey },
      )
      lane(created, "Stripe object")
      if (created.metadata?.customerId !== input.customerId) {
        throw new PaymentsDisabledError("Stripe customer mapping was rejected.")
      }
      if (email && (created.email || "").toLowerCase() !== email) {
        throw new PaymentsDisabledError("Stripe customer email was not saved.")
      }
      return { id: created.id, livemode: expectedLivemode }
    },
    async syncCustomerEmail(input) {
      const email = normalisedCheckoutEmail(input.email)
      if (!email) throw new PaymentsDisabledError("Stripe customer email was rejected.")
      const stripe = client(env)
      const current = await stripe.customers.retrieve(input.stripeCustomerId)
      if (current.deleted) throw new PaymentsDisabledError("Stripe customer mapping was rejected.")
      lane(current, "Stripe object")
      if (current.metadata?.customerId !== input.customerId) {
        throw new PaymentsDisabledError("Stripe customer mapping was rejected.")
      }
      if ((current.email || "").trim().toLowerCase() === email) {
        return { id: current.id, email, livemode: expectedLivemode }
      }
      const updated = await stripe.customers.update(input.stripeCustomerId, { email }, { idempotencyKey: input.idempotencyKey })
      lane(updated, "Stripe object")
      if (updated.metadata?.customerId !== input.customerId || (updated.email || "").trim().toLowerCase() !== email) {
        throw new PaymentsDisabledError("Stripe customer email was not updated.")
      }
      return { id: updated.id, email, livemode: expectedLivemode }
    },
    async createPaymentCheckout(input) {
      const presentation = requireCheckoutPresentation(input.serviceCode)
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
            product_data: { name: presentation.name, description: presentation.description },
          },
        }],
        metadata: meta,
      }, { idempotencyKey: input.idempotencyKey })
      lane(session, "Stripe object")
      return { id: session.id, url: requireCheckoutUrl(session.url), mode: "payment", amountMinor: input.amountMinor, livemode: expectedLivemode }
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
      lane(session, "Stripe object")
      return { id: session.id, url: requireCheckoutUrl(session.url), mode: "setup", amountMinor: 0, livemode: expectedLivemode }
    },
    async createOffSessionPayment() {
      throw new PaymentsDisabledError("Off-session Managed collection is retired.")
    },
    async retrieveCheckout(id) {
      const session = await client(env).checkout.sessions.retrieve(id)
      lane(session, "Stripe object")
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
        livemode: expectedLivemode,
        amountMinor: typeof session.amount_total === "number" ? session.amount_total : null,
        currency: session.currency ?? null,
      }
    },
    async expireCheckout(input) {
      const session = await client(env).checkout.sessions.expire(input.id, {}, { idempotencyKey: input.idempotencyKey })
      lane(session, "Stripe object")
      return {
        id: session.id,
        status: session.status || "unknown",
        paymentStatus: session.payment_status ?? null,
        livemode: expectedLivemode,
      }
    },
    async retrievePaymentIntent(id) {
      const intent = await client(env).paymentIntents.retrieve(id)
      lane(intent, "Stripe object")
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
        livemode: expectedLivemode,
      }
    },
    async retrieveSetupIntent(id) {
      const setup = await client(env).setupIntents.retrieve(id)
      lane(setup, "Stripe object")
      return {
        id: setup.id,
        status: setup.status,
        usage: setup.usage ?? null,
        customerId: asId(setup.customer),
        paymentMethodId: asId(setup.payment_method),
        metadata: metadataOf(setup),
        livemode: expectedLivemode,
      }
    },
    async retrievePaymentMethod(id) {
      if (!id.startsWith("pm_")) return null
      const method = await client(env).paymentMethods.retrieve(id)
      lane(method, "Stripe object")
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
      lane(invoice, "Stripe object")
      return {
        id: invoice.id,
        status: invoice.status || "unknown",
        customerId: asId(invoice.customer),
        amountDueMinor: invoice.amount_due,
        amountPaidMinor: invoice.amount_paid,
        currency: (invoice.currency || "gbp").toLowerCase(),
        hostedInvoiceUrl: acceptedInvoiceUrl(invoice.hosted_invoice_url),
        metadata: metadataOf(invoice),
        livemode: expectedLivemode,
      }
    },
    async createHostedInvoice(input) {
      const presentation = requireCheckoutPresentation(input.serviceCode)
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      const stripe = client(env)
      const created = await stripe.invoices.create({
        customer: input.stripeCustomerId,
        currency: input.currency.toLowerCase(),
        collection_method: "send_invoice",
        days_until_due: HOSTED_INVOICE_DAYS_UNTIL_DUE,
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        metadata: meta,
        payment_settings: { payment_method_types: ["card"] },
      }, { idempotencyKey: input.idempotencyKey })
      lane(created, "Stripe object")
      await stripe.invoices.addLines(created.id, {
        lines: [{
          description: presentation.description,
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            product_data: { name: presentation.name, description: presentation.description },
            unit_amount: input.amountMinor,
          },
        }],
      }, { idempotencyKey: `${input.idempotencyKey}:lines` })
      const finalized = await stripe.invoices.finalizeInvoice(created.id, { auto_advance: false }, { idempotencyKey: `${input.idempotencyKey}:finalize` })
      lane(finalized, "Stripe object")
      if (finalized.amount_due !== input.amountMinor || (finalized.currency || "").toLowerCase() !== "gbp" || !finalized.hosted_invoice_url) {
        throw new PaymentsDisabledError("Hosted invoice amount or currency did not match the obligation.")
      }
      return {
        id: finalized.id,
        hostedInvoiceUrl: requireInvoiceUrl(finalized.hosted_invoice_url),
        amountDueMinor: finalized.amount_due,
        currency: (finalized.currency || "gbp").toLowerCase(),
        status: finalized.status || "open",
        livemode: expectedLivemode,
        dueAt: finalized.due_date ? new Date(finalized.due_date * 1000).toISOString() : null,
      }
    },
    async voidHostedInvoice(input) {
      const stripe = client(env)
      const current = await stripe.invoices.retrieve(input.id)
      lane(current, "Stripe object")
      const paid = current.status === "paid" || (current.amount_paid ?? 0) > 0
      if (paid) {
        return { id: current.id, status: current.status || "paid", voided: false, alreadyPaid: true, livemode: expectedLivemode }
      }
      if (current.status === "void") {
        return { id: current.id, status: "void", voided: true, alreadyPaid: false, livemode: expectedLivemode }
      }
      const voided = await stripe.invoices.voidInvoice(input.id, {}, { idempotencyKey: input.idempotencyKey })
      lane(voided, "Stripe object")
      if (voided.status !== "void") {
        throw new PaymentsDisabledError("Stripe did not confirm the invoice was void.")
      }
      return { id: voided.id, status: "void", voided: true, alreadyPaid: false, livemode: expectedLivemode }
    },
    async createRecurringPrice(input) {
      const meta = { priceVersionId: input.priceVersionId, providerOperationId: input.providerOperationId }
      assertSafeGuardMetadata(meta)
      const stripe = client(env)
      const product = await stripe.products.create({
        name: GUARD_PRODUCT_NAME,
        metadata: meta,
      }, { idempotencyKey: `${input.idempotencyKey}:product` })
      lane(product, "Stripe object")
      const price = await stripe.prices.create({
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountMinor,
        recurring: { interval: "month" },
        product: product.id,
        metadata: meta,
      }, { idempotencyKey: input.idempotencyKey })
      lane(price, "Stripe object")
      if (price.unit_amount !== input.amountMinor || (price.currency || "").toLowerCase() !== "gbp" || price.type !== "recurring") {
        throw new PaymentsDisabledError("Stripe Price does not match the approved Guard amount.")
      }
      return { productId: product.id, priceId: price.id, amountMinor: input.amountMinor, livemode: expectedLivemode }
    },
    async createSubscriptionCheckout(input) {
      const meta = guardMetadata(input.metadata)
      assertSafeGuardMetadata(meta)
      if (input.trialEnd != null && !isStripeTrialEndAllowed(input.trialEnd)) {
        throw new PaymentsDisabledError("Delayed Guard Checkout requires a Stripe trial_end at least 48 hours in the future.")
      }
      const session = await client(env).checkout.sessions.create({
        mode: "subscription",
        customer: input.stripeCustomerId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        payment_method_types: ["card"],
        line_items: [{ price: input.stripePriceId, quantity: 1 }],
        subscription_data: {
          metadata: meta,
          ...(input.trialEnd ? { trial_end: input.trialEnd } : {}),
        },
        metadata: meta,
      }, { idempotencyKey: input.idempotencyKey })
      lane(session, "Stripe object")
      return { id: session.id, url: requireCheckoutUrl(session.url), mode: "subscription", amountMinor: 0, livemode: expectedLivemode }
    },
    async createGuardRecoveryCheckout(input) {
      const meta = guardMetadata(input.metadata)
      assertSafeGuardMetadata(meta)
      const session = await client(env).checkout.sessions.create({
        mode: "setup",
        customer: input.stripeCustomerId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        payment_method_types: ["card"],
        metadata: meta,
        setup_intent_data: { metadata: meta },
      }, { idempotencyKey: input.idempotencyKey })
      lane(session, "Stripe object")
      return { id: session.id, url: requireCheckoutUrl(session.url), mode: "setup", amountMinor: 0, livemode: expectedLivemode }
    },
    async updateSubscriptionPaymentMethod({ id, idempotencyKey, paymentMethodId }) {
      const updated = await client(env).subscriptions.update(id, {
        default_payment_method: paymentMethodId,
      }, { idempotencyKey })
      lane(updated, "Stripe object")
      return {
        id: updated.id,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancel_at_period_end === true,
        canceled: updated.status === "canceled",
        livemode: expectedLivemode,
      }
    },
    async retrieveSubscription(id) {
      const subscription = await client(env).subscriptions.retrieve(id, { expand: ["items.data.price"] })
      lane(subscription, "Stripe object")
      const item = subscription.items.data[0]
      return {
        id: subscription.id,
        status: subscription.status,
        customerId: asId(subscription.customer),
        priceId: asId(item?.price) ?? (typeof item?.price === "string" ? item.price : null),
        subscriptionItemId: item?.id ?? null,
        quantity: typeof item?.quantity === "number" ? item.quantity : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        currentPeriodStart: subscription.items.data[0]?.current_period_start
          ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
          : null,
        currentPeriodEnd: subscription.items.data[0]?.current_period_end
          ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
          : null,
        scheduleId: asId(subscription.schedule),
        defaultPaymentMethodId: asId(subscription.default_payment_method),
        metadata: metadataOf(subscription),
        livemode: expectedLivemode,
      }
    },
    async retrieveRecurringInvoice(id) {
      const invoice = await client(env).invoices.retrieve(id, { expand: ["payments.data.payment.payment_intent"] })
      lane(invoice, "Stripe object")
      const parent = invoice.parent && typeof invoice.parent === "object" ? invoice.parent as {
        subscription_details?: {
          subscription?: string | { id?: string; metadata?: Stripe.Metadata | null }
          metadata?: Stripe.Metadata | null
        }
      } : {}
      const line = invoice.lines?.data?.[0]
      const pricing = line && "pricing" in line ? (line.pricing as { price_details?: { price?: string } } | null) : null
      const subscriptionMeta = {
        ...metadataOf({ metadata: parent.subscription_details?.metadata }),
        ...metadataOf({ metadata: typeof parent.subscription_details?.subscription === "object" ? parent.subscription_details.subscription.metadata : undefined }),
      }
      return {
        id: invoice.id,
        status: invoice.status || "unknown",
        customerId: asId(invoice.customer),
        amountDueMinor: invoice.amount_due,
        amountPaidMinor: invoice.amount_paid,
        currency: invoice.currency ? invoice.currency.toLowerCase() : "",
        hostedInvoiceUrl: acceptedInvoiceUrl(invoice.hosted_invoice_url),
        metadata: { ...subscriptionMeta, ...metadataOf(invoice) },
        livemode: expectedLivemode,
        subscriptionId: asId(parent.subscription_details?.subscription),
        subscriptionItemId: line?.parent?.subscription_item_details?.subscription_item ?? null,
        priceId: pricing?.price_details?.price ?? asId(line?.pricing) ?? null,
        quantity: typeof line?.quantity === "number" ? line.quantity : null,
        periodStart: line?.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
        periodEnd: line?.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
        paymentIntentId: asId((invoice as { payment_intent?: unknown }).payment_intent),
        chargeId: asId((invoice as { charge?: unknown }).charge),
        subscriptionMetadata: subscriptionMeta,
      }
    },
    async setCancelAtPeriodEnd({ id, idempotencyKey, cancel }) {
      const updated = await client(env).subscriptions.update(id, { cancel_at_period_end: cancel }, { idempotencyKey })
      lane(updated, "Stripe object")
      return {
        id: updated.id,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancel_at_period_end === true,
        canceled: updated.status === "canceled",
        livemode: expectedLivemode,
      }
    },
    async cancelSubscriptionImmediate({ id, idempotencyKey }) {
      const cancelled = await client(env).subscriptions.cancel(id, undefined, { idempotencyKey })
      lane(cancelled, "Stripe object")
      return {
        id: cancelled.id,
        status: cancelled.status,
        cancelAtPeriodEnd: false,
        canceled: cancelled.status === "canceled",
        livemode: expectedLivemode,
      }
    },
    async createSubscriptionSchedule(input) {
      const stripe = client(env)
      const current = await this.retrieveSubscription(input.subscriptionId)
      try {
        assertGuardScheduleSubscription(input, current)
      } catch (error) {
        throw new PaymentsDisabledError((error as Error).message)
      }
      if (current.scheduleId) {
        return { id: current.scheduleId, subscriptionId: current.id, livemode: expectedLivemode }
      }
      const created = await stripe.subscriptionSchedules.create({
        from_subscription: input.subscriptionId,
      }, { idempotencyKey: input.idempotencyKey })
      lane(created, "Stripe object")
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
      lane(updated, "Stripe object")
      return { id: updated.id, subscriptionId: asId(updated.subscription) || input.subscriptionId, livemode: expectedLivemode }
    },
    async createRefund(input) {
      const meta = input.metadata ? guardMetadata(input.metadata) : undefined
      if (meta) assertSafeGuardMetadata(meta)
      const refund = await client(env).refunds.create({
        payment_intent: input.paymentIntentId,
        amount: input.amountMinor,
        ...(meta ? { metadata: meta } : {}),
      }, { idempotencyKey: input.idempotencyKey })
      lane(refund as { livemode?: boolean }, "Stripe refund")
      return {
        id: refund.id,
        status: refund.status || "pending",
        amountMinor: typeof refund.amount === "number" ? refund.amount : null,
        currency: refund.currency ? refund.currency.toLowerCase() : "",
        paymentIntentId: asId(refund.payment_intent),
        chargeId: asId(refund.charge),
        failureReason: refund.failure_reason ?? null,
        metadata: metadataOf(refund),
        livemode: expectedLivemode,
      }
    },
    async retrieveRefund(id) {
      const refund = await client(env).refunds.retrieve(id)
      lane(refund as { livemode?: boolean }, "Stripe refund")
      return {
        id: refund.id,
        status: refund.status || "pending",
        amountMinor: typeof refund.amount === "number" ? refund.amount : null,
        currency: refund.currency ? refund.currency.toLowerCase() : "",
        paymentIntentId: asId(refund.payment_intent),
        chargeId: asId(refund.charge),
        failureReason: refund.failure_reason ?? null,
        metadata: metadataOf(refund),
        livemode: expectedLivemode,
      }
    },
    async retrieveDispute(id) {
      const dispute = await client(env).disputes.retrieve(id)
      lane(dispute, "Stripe object")
      return {
        id: dispute.id,
        status: dispute.status,
        amountMinor: typeof dispute.amount === "number" ? dispute.amount : null,
        currency: dispute.currency ? dispute.currency.toLowerCase() : "",
        chargeId: asId(dispute.charge),
        reason: dispute.reason ?? null,
        livemode: expectedLivemode,
      }
    },
    async cancelPaymentIntent({ id, idempotencyKey }) {
      const current = await client(env).paymentIntents.retrieve(id)
      lane(current, "Stripe object")
      if (current.status === "succeeded") {
        return { ok: false, id: current.id, status: current.status, alreadySucceeded: true, cancelled: false }
      }
      if (current.status === "canceled") {
        return { ok: true, id: current.id, status: current.status, alreadySucceeded: false, cancelled: true }
      }
      const cancelled = await client(env).paymentIntents.cancel(id, undefined, { idempotencyKey })
      lane(cancelled, "Stripe object")
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
