import { assertSafeMetadata, paymentMetadata, type MappedProviderEvent } from "./model"
import type { PaymentProvider } from "./provider"

export function createFakePaymentProvider(): PaymentProvider & {
  customers: number
  checkouts: number
  setups: number
  intents: number
  lastCheckout: { amountMinor: number; mode: "payment" | "setup"; idempotencyKey: string } | null
  lastIntent: { amountMinor: number; idempotencyKey: string; offSession: true } | null
  idempotency: Set<string>
  nextIntentStatus: string
} {
  const customers = new Map<string, string>()
  const sessions = new Map<string, { id: string; url: string; mode: "payment" | "setup"; amountMinor: number }>()
  const intents = new Map<string, { id: string; status: string; amountMinor: number }>()
  const state = {
    customers: 0,
    checkouts: 0,
    setups: 0,
    intents: 0,
    lastCheckout: null as { amountMinor: number; mode: "payment" | "setup"; idempotencyKey: string } | null,
    lastIntent: null as { amountMinor: number; idempotencyKey: string; offSession: true } | null,
    idempotency: new Set<string>(),
    nextIntentStatus: "succeeded",
  }
  return {
    mode: "fake",
    get customers() { return state.customers },
    get checkouts() { return state.checkouts },
    get setups() { return state.setups },
    get intents() { return state.intents },
    get lastCheckout() { return state.lastCheckout },
    get lastIntent() { return state.lastIntent },
    get idempotency() { return state.idempotency },
    get nextIntentStatus() { return state.nextIntentStatus },
    set nextIntentStatus(value: string) { state.nextIntentStatus = value },
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
      assertSafeMetadata(paymentMetadata(input.metadata))
      if (sessions.has(input.idempotencyKey)) {
        const existing = sessions.get(input.idempotencyKey)!
        return { ...existing, livemode: false as const }
      }
      const created = {
        id: `cs_test_${input.idempotencyKey.replace(/-/g, "").slice(0, 16)}`,
        url: `https://checkout.stripe.test/${input.idempotencyKey}`,
        mode: "payment" as const,
        amountMinor: input.amountMinor,
        livemode: false as const,
      }
      sessions.set(input.idempotencyKey, created)
      state.checkouts += 1
      state.lastCheckout = { amountMinor: input.amountMinor, mode: "payment", idempotencyKey: input.idempotencyKey }
      state.idempotency.add(input.idempotencyKey)
      return created
    },
    async createSetupCheckout(input) {
      assertSafeMetadata(paymentMetadata(input.metadata))
      if (sessions.has(input.idempotencyKey)) {
        const existing = sessions.get(input.idempotencyKey)!
        return { ...existing, livemode: false as const }
      }
      const created = {
        id: `cs_test_setup_${input.idempotencyKey.replace(/-/g, "").slice(0, 12)}`,
        url: `https://checkout.stripe.test/setup/${input.idempotencyKey}`,
        mode: "setup" as const,
        amountMinor: 0,
        livemode: false as const,
      }
      sessions.set(input.idempotencyKey, created)
      state.setups += 1
      state.lastCheckout = { amountMinor: 0, mode: "setup", idempotencyKey: input.idempotencyKey }
      state.idempotency.add(input.idempotencyKey)
      return created
    },
    async createOffSessionPayment(input) {
      assertSafeMetadata(paymentMetadata(input.metadata))
      if (intents.has(input.idempotencyKey)) return { ...intents.get(input.idempotencyKey)!, requiresAction: intents.get(input.idempotencyKey)!.status === "requires_action", livemode: false as const }
      const status = state.nextIntentStatus
      const created = { id: `pi_test_${input.idempotencyKey.replace(/-/g, "").slice(0, 16)}`, status, amountMinor: input.amountMinor }
      intents.set(input.idempotencyKey, created)
      state.intents += 1
      state.lastIntent = { amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey, offSession: true }
      state.idempotency.add(input.idempotencyKey)
      return { ...created, requiresAction: status === "requires_action", livemode: false as const }
    },
    mapEvent(event) {
      const object = event.data?.object ?? {}
      const objectId = typeof object.id === "string" ? object.id : ""
      const mapped: MappedProviderEvent = {
        eventId: event.id,
        type: event.type,
        objectId,
        objectType: event.type.startsWith("payment_intent") ? "payment_intent" : event.type.startsWith("setup_intent") ? "setup_intent" : "checkout.session",
        outcome: "ignored",
      }
      if (event.type === "checkout.session.completed" && object.mode === "setup") {
        mapped.outcome = "setup_succeeded"
        mapped.stripeCustomerId = typeof object.customer === "string" ? object.customer : undefined
        mapped.paymentMethod = { id: String(object.setup_intent || "pm_test_saved"), brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, fingerprint: "fp_test" }
      } else if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
        mapped.outcome = "succeeded"
      } else if (event.type === "payment_intent.requires_action") {
        mapped.outcome = "requires_action"
      } else if (event.type === "payment_intent.payment_failed" || event.type === "checkout.session.expired") {
        mapped.outcome = "failed"
        mapped.failureCategory = "DECLINED"
        mapped.failureCode = "card_declined"
      } else if (event.type === "setup_intent.succeeded") {
        mapped.outcome = "setup_succeeded"
        mapped.stripeCustomerId = typeof object.customer === "string" ? object.customer : "cus_test"
        mapped.paymentMethod = { id: String(object.payment_method || "pm_test_saved"), brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, fingerprint: "fp_test" }
      }
      return mapped
    },
  }
}
