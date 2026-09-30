import { assertSafeMetadata, mapBoundedProviderEvent, paymentMetadata, type MappedProviderEvent, type ProviderPaymentIntent } from "./model"
import type { PaymentProvider } from "./provider"

type StoredCheckout = {
  id: string
  url: string
  mode: "payment" | "setup"
  amountMinor: number
  status: string
  paymentStatus: string | null
  paymentIntentId: string | null
  setupIntentId: string | null
  customerId: string
  metadata: Record<string, string>
  livemode: false
}

type StoredIntent = {
  id: string
  status: string
  amountMinor: number
  currency: string
  customerId?: string
  metadata: Record<string, string>
}

export function createFakePaymentProvider(): PaymentProvider & {
  customers: number
  checkouts: number
  setups: number
  intents: number
  cancels: number
  lastCheckout: { amountMinor: number; mode: "payment" | "setup"; idempotencyKey: string; setupUsage?: "off_session"; paymentMethodTypes: ["card"]; paymentIntentMetadata?: Record<string, string> } | null
  lastIntent: { amountMinor: number; idempotencyKey: string; offSession: true } | null
  lastInvoice: { amountMinor: number; idempotencyKey: string; metadata: Record<string, string> } | null
  idempotency: Set<string>
  nextIntentStatus: string
  nextOffSessionError: { type?: string; code?: string; statusCode?: number; rawType?: string; payment_intent?: { id?: string; status?: string } } | null
  objects: Map<string, Record<string, unknown>>
} {
  const customers = new Map<string, string>()
  const sessions = new Map<string, StoredCheckout>()
  const intents = new Map<string, StoredIntent>()
  const invoices = new Map<string, { id: string; status: string; amountDueMinor: number; amountPaidMinor: number; currency: string; customerId: string; hostedInvoiceUrl: string; metadata: Record<string, string> }>()
  const setups = new Map<string, { id: string; status: string; usage: string; customerId: string; paymentMethodId: string | null; metadata: Record<string, string> }>()
  const methods = new Map<string, { id: string; brand: string; last4: string; expMonth: number; expYear: number; fingerprint: string }>()
  const objects = new Map<string, Record<string, unknown>>()
  const state = {
    customers: 0,
    checkouts: 0,
    setups: 0,
    intents: 0,
    cancels: 0,
    lastCheckout: null as { amountMinor: number; mode: "payment" | "setup"; idempotencyKey: string; setupUsage?: "off_session"; paymentMethodTypes: ["card"]; paymentIntentMetadata?: Record<string, string> } | null,
    lastIntent: null as { amountMinor: number; idempotencyKey: string; offSession: true } | null,
    lastInvoice: null as { amountMinor: number; idempotencyKey: string; metadata: Record<string, string> } | null,
    idempotency: new Set<string>(),
    nextIntentStatus: "succeeded",
    nextOffSessionError: null as { type?: string; code?: string; statusCode?: number; rawType?: string; payment_intent?: { id?: string; status?: string } } | null,
  }

  return {
    mode: "fake",
    get customers() { return state.customers },
    get checkouts() { return state.checkouts },
    get setups() { return state.setups },
    get intents() { return state.intents },
    get cancels() { return state.cancels },
    get lastCheckout() { return state.lastCheckout },
    get lastIntent() { return state.lastIntent },
    get lastInvoice() { return state.lastInvoice },
    get idempotency() { return state.idempotency },
    get nextIntentStatus() { return state.nextIntentStatus },
    set nextIntentStatus(value: string) { state.nextIntentStatus = value },
    get nextOffSessionError() { return state.nextOffSessionError },
    set nextOffSessionError(value) { state.nextOffSessionError = value },
    get objects() { return objects },
    async createCustomer({ idempotencyKey, customerId }) {
      state.idempotency.add(idempotencyKey)
      const existing = customers.get(customerId)
      if (existing) return { id: existing, livemode: false as const }
      const id = `cus_test_${customerId.replace(/-/g, "").slice(0, 14)}`
      customers.set(customerId, id)
      state.customers += 1
      return { id, livemode: false as const }
    },
    async createPaymentCheckout(input) {
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      if (sessions.has(input.idempotencyKey)) return { ...sessions.get(input.idempotencyKey)!, livemode: false as const }
      const paymentIntentId = `pi_test_${input.idempotencyKey.replace(/-/g, "").slice(0, 16)}`
      const created: StoredCheckout = {
        id: `cs_test_${input.idempotencyKey.replace(/-/g, "").slice(0, 16)}`,
        url: `https://checkout.stripe.test/${input.idempotencyKey}`,
        mode: "payment",
        amountMinor: input.amountMinor,
        status: "open",
        paymentStatus: "unpaid",
        paymentIntentId,
        setupIntentId: null,
        customerId: input.stripeCustomerId,
        metadata: meta,
        livemode: false,
      }
      sessions.set(input.idempotencyKey, created)
      objects.set(created.id, created)
      intents.set(input.idempotencyKey, {
        id: paymentIntentId,
        status: "requires_payment_method",
        amountMinor: input.amountMinor,
        currency: "gbp",
        customerId: input.stripeCustomerId,
        metadata: meta,
      })
      objects.set(paymentIntentId, intents.get(input.idempotencyKey)!)
      state.checkouts += 1
      state.lastCheckout = {
        amountMinor: input.amountMinor,
        mode: "payment",
        idempotencyKey: input.idempotencyKey,
        paymentMethodTypes: ["card"],
        paymentIntentMetadata: meta,
      }
      state.idempotency.add(input.idempotencyKey)
      return { id: created.id, url: created.url, mode: "payment", amountMinor: input.amountMinor, livemode: false as const }
    },
    async createSetupCheckout(input) {
      assertSafeMetadata(paymentMetadata(input.metadata))
      if (sessions.has(input.idempotencyKey)) return { ...sessions.get(input.idempotencyKey)!, livemode: false as const }
      const setupId = `seti_test_${input.idempotencyKey.replace(/-/g, "").slice(0, 12)}`
      const created: StoredCheckout = {
        id: `cs_test_setup_${input.idempotencyKey.replace(/-/g, "").slice(0, 12)}`,
        url: `https://checkout.stripe.test/setup/${input.idempotencyKey}`,
        mode: "setup",
        amountMinor: 0,
        status: "open",
        paymentStatus: null,
        paymentIntentId: null,
        setupIntentId: setupId,
        customerId: input.stripeCustomerId,
        metadata: paymentMetadata(input.metadata),
        livemode: false,
      }
      sessions.set(input.idempotencyKey, created)
      setups.set(setupId, {
        id: setupId,
        status: "requires_payment_method",
        usage: "off_session",
        customerId: input.stripeCustomerId,
        paymentMethodId: null,
        metadata: paymentMetadata(input.metadata),
      })
      objects.set(created.id, created)
      objects.set(setupId, setups.get(setupId)!)
      state.setups += 1
      state.lastCheckout = { amountMinor: 0, mode: "setup", idempotencyKey: input.idempotencyKey, setupUsage: "off_session", paymentMethodTypes: ["card"] }
      state.idempotency.add(input.idempotencyKey)
      return { id: created.id, url: created.url, mode: "setup", amountMinor: 0, livemode: false as const }
    },
    async createOffSessionPayment(input) {
      assertSafeMetadata(paymentMetadata(input.metadata))
      if (intents.has(input.idempotencyKey)) {
        const existing = intents.get(input.idempotencyKey)!
        return {
          id: existing.id,
          status: existing.status,
          amountMinor: existing.amountMinor,
          requiresAction: existing.status === "requires_action",
          livemode: false as const,
          classification: existing.status === "succeeded" ? "succeeded" : existing.status === "requires_action" ? "requires_action" : "declined",
          retryable: false,
        } satisfies ProviderPaymentIntent
      }
      if (state.nextOffSessionError) {
        const error = state.nextOffSessionError
        state.nextOffSessionError = null
        if (error.payment_intent?.status === "requires_action" || error.code === "authentication_required") {
          return {
            id: error.payment_intent?.id,
            status: "requires_action",
            amountMinor: input.amountMinor,
            requiresAction: true,
            livemode: false,
            classification: "requires_action",
            retryable: false,
            failureCode: error.code ?? "authentication_required",
            failureCategory: "AUTHENTICATION_REQUIRED",
          }
        }
        const retryable = error.type === "StripeConnectionError" || error.type === "StripeRateLimitError" || error.rawType === "api_connection_error" || (error.statusCode ?? 0) >= 500
        return {
          id: error.payment_intent?.id,
          status: retryable ? "retryable" : "failed",
          amountMinor: input.amountMinor,
          requiresAction: false,
          livemode: false,
          classification: retryable ? "retryable" : "declined",
          retryable,
          failureCode: error.code ?? error.type ?? "card_declined",
          failureCategory: retryable ? "INFRASTRUCTURE" : "DECLINED",
        }
      }
      const status = state.nextIntentStatus
      const created = {
        id: `pi_test_${input.idempotencyKey.replace(/-/g, "").slice(0, 16)}`,
        status,
        amountMinor: input.amountMinor,
        currency: "gbp",
        customerId: input.stripeCustomerId,
        metadata: paymentMetadata(input.metadata),
      }
      intents.set(input.idempotencyKey, created)
      objects.set(created.id, created)
      state.intents += 1
      state.lastIntent = { amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey, offSession: true }
      state.idempotency.add(input.idempotencyKey)
      return {
        id: created.id,
        status,
        amountMinor: input.amountMinor,
        requiresAction: status === "requires_action",
        livemode: false as const,
        classification: status === "succeeded" ? "succeeded" : status === "requires_action" ? "requires_action" : "declined",
        retryable: false,
      }
    },
    async retrieveCheckout(id) {
      const found = [...sessions.values()].find(session => session.id === id) || objects.get(id) as StoredCheckout | undefined
      return found ? { ...found, metadata: found.metadata ?? {}, livemode: false as const } : null
    },
    async retrievePaymentIntent(id) {
      const found = [...intents.values()].find(intent => intent.id === id) || objects.get(id) as StoredIntent | undefined
      if (!found) return null
      return {
        id: found.id,
        status: found.status,
        customerId: found.customerId ?? null,
        amountMinor: found.amountMinor ?? 0,
        currency: found.currency ?? "gbp",
        chargeId: found.status === "succeeded" ? `ch_${found.id.slice(-8)}` : null,
        receiptUrl: found.status === "succeeded" ? `https://stripe.test/receipts/${found.id}` : null,
        lastErrorCode: found.status === "failed" ? "card_declined" : null,
        metadata: found.metadata ?? {},
        livemode: false as const,
      }
    },
    async retrieveSetupIntent(id) {
      const found = setups.get(id) || objects.get(id) as { id: string; status?: string; usage?: string; customerId?: string; paymentMethodId?: string | null; metadata?: Record<string, string> } | undefined
      if (!found) return null
      return {
        id: found.id,
        status: found.status || "requires_payment_method",
        usage: found.usage ?? "off_session",
        customerId: found.customerId ?? null,
        paymentMethodId: found.paymentMethodId ?? null,
        metadata: found.metadata ?? {},
        livemode: false as const,
      }
    },
    async retrieveInvoice(id) {
      const found = invoices.get(id) || objects.get(id) as {
        id: string; status?: string; amountDueMinor?: number; amountPaidMinor?: number; currency?: string;
        customerId?: string; hostedInvoiceUrl?: string; metadata?: Record<string, string>
      } | undefined
      if (!found) return null
      return {
        id: found.id,
        status: found.status || "open",
        customerId: found.customerId ?? null,
        amountDueMinor: found.amountDueMinor ?? 0,
        amountPaidMinor: found.amountPaidMinor ?? 0,
        currency: found.currency ?? "gbp",
        hostedInvoiceUrl: found.hostedInvoiceUrl ?? `https://invoice.stripe.test/${found.id}`,
        metadata: found.metadata ?? {},
        livemode: false as const,
      }
    },
    async createHostedInvoice(input) {
      const meta = paymentMetadata(input.metadata)
      assertSafeMetadata(meta)
      if (invoices.has(input.idempotencyKey)) {
        const existing = invoices.get(input.idempotencyKey)!
        return {
          id: existing.id,
          hostedInvoiceUrl: existing.hostedInvoiceUrl,
          amountDueMinor: existing.amountDueMinor,
          currency: existing.currency,
          status: existing.status,
          livemode: false as const,
        }
      }
      const created = {
        id: `in_test_${input.idempotencyKey.replace(/-/g, "").slice(0, 16)}`,
        status: "open",
        amountDueMinor: input.amountMinor,
        amountPaidMinor: 0,
        currency: "gbp",
        customerId: input.stripeCustomerId,
        hostedInvoiceUrl: `https://invoice.stripe.test/${input.idempotencyKey}`,
        metadata: meta,
      }
      invoices.set(input.idempotencyKey, created)
      objects.set(created.id, created)
      state.lastInvoice = { amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey, metadata: meta }
      state.idempotency.add(input.idempotencyKey)
      return {
        id: created.id,
        hostedInvoiceUrl: created.hostedInvoiceUrl,
        amountDueMinor: created.amountDueMinor,
        currency: created.currency,
        status: created.status,
        livemode: false as const,
      }
    },
    async retrievePaymentMethod(id) {
      if (!id.startsWith("pm_")) return null
      const found = methods.get(id) || {
        id, brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, fingerprint: "fp_test",
      }
      return found
    },
    async cancelPaymentIntent({ id, idempotencyKey }) {
      state.idempotency.add(idempotencyKey)
      const found = [...intents.values()].find(intent => intent.id === id) || objects.get(id) as { id: string; status: string } | undefined
      if (!found) return { ok: false, id, status: "unknown", alreadySucceeded: false, cancelled: false }
      if (found.status === "succeeded") return { ok: false, id: found.id, status: "succeeded", alreadySucceeded: true, cancelled: false }
      found.status = "canceled"
      state.cancels += 1
      return { ok: true, id: found.id, status: "canceled", alreadySucceeded: false, cancelled: true }
    },
    mapEvent(event): MappedProviderEvent {
      return mapBoundedProviderEvent(event)
    },
    succeedSetup(id: string, paymentMethodId = "pm_test_saved") {
      const setup = setups.get(id)
      if (!setup) return
      setup.status = "succeeded"
      setup.paymentMethodId = paymentMethodId
      methods.set(paymentMethodId, { id: paymentMethodId, brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, fingerprint: "fp_test" })
    },
    expireCheckout(id: string) {
      const found = [...sessions.values()].find(session => session.id === id)
      if (found) found.status = "expired"
    },
    markInvoicePaid(id: string) {
      const found = invoices.get(id) || objects.get(id) as { status?: string; amountPaidMinor?: number; amountDueMinor?: number } | undefined
      if (!found) return
      found.status = "paid"
      found.amountPaidMinor = found.amountDueMinor ?? 0
    },
  } as ReturnType<typeof createFakePaymentProvider> & {
    succeedSetup(id: string, paymentMethodId?: string): void
    expireCheckout(id: string): void
    markInvoicePaid(id: string): void
  }
}
