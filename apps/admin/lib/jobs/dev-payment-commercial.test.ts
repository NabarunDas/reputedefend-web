import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkout: null as Record<string, unknown> | null,
  invoice: null as Record<string, unknown> | null,
  subscription: null as Record<string, unknown> | null,
  invoiceError: false,
  invoiceCalls: 0,
  failAfter: 0,
}))

vi.mock("../../../../lib/payments", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/payments")>("../../../../lib/payments")
  return {
    ...actual,
    paymentProvider: () => ({
      mode: "stripe_test" as const,
      retrieveCheckout: async () => mocks.checkout,
      retrieveRecurringInvoice: async () => {
        mocks.invoiceCalls += 1
        if (mocks.invoiceError || (mocks.failAfter > 0 && mocks.invoiceCalls > mocks.failAfter)) throw new Error("timeout")
        return mocks.invoice
      },
      retrieveSubscription: async () => mocks.subscription,
    }),
  }
})

import { runDevPaymentEventWorker } from "./dev-payment-events"
import type { JobRpc } from "./model"

const secret = "d".repeat(32)
const preview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  DEV_PAYMENT_EVENT_WORKER_ENABLED: "true",
  DEV_PAYMENT_EVENT_WORKER_SECRET: secret,
  PAYMENTS_PROVIDER_MODE: "stripe_test",
  STRIPE_SECRET_KEY: "sk_test_placeholdernotarealkey",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
  STRIPE_LIVE_ACTIVATION: "",
}

function apply(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value)
}

function workerRpc(events: Array<Record<string, string>>, invoices: Array<Record<string, string>> = []) {
  const names: string[] = []
  const rpc = {
    async rpc(name: string) {
      names.push(name)
      if (name === "job_heartbeat_v1") return { status: "success" }
      if (name === "dev_payment_event_candidates_v1") return { status: "success", events }
      if (name === "payment_provider_lane_status_v1") return { configured: false, mode: "stripe_test", expectedLivemode: false }
      if (name === "commercial_payment_invoice_candidates_v1") return { status: "success", events: invoices }
      if (name === "commercial_payment_receipt_v1") return { status: "unmatched", reason: "not_received" }
      if (name === "commercial_payment_preparation_for_session_v1" || name === "commercial_payment_preparation_for_price_v1") {
        return { status: "unmatched", reason: "preparation" }
      }
      if (name === "dev_payment_event_claim_v1") return { status: "absent" }
      throw new Error(name)
    },
  } as JobRpc
  return { rpc, names }
}

beforeEach(() => {
  mocks.checkout = null
  mocks.invoice = null
  mocks.subscription = null
  mocks.invoiceError = false
  mocks.invoiceCalls = 0
  mocks.failAfter = 0
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

describe("DEV payment worker commercial routing", () => {
  it("keeps a commercial subscription checkout out of Recovery and Guard settlement while the gate is off", async () => {
    apply(preview)
    mocks.checkout = {
      id: "cs_telloya", mode: "subscription", status: "complete", paymentStatus: "paid",
      customerId: "cus_telloya", livemode: false, metadata: { commercialSubscriptionId: "internal" }, subscriptionId: "sub_telloya",
    }
    const { rpc, names } = workerRpc([{ eventId: "evt_checkout1", eventType: "checkout.session.completed", objectId: "cs_telloya" }])
    const result = await runDevPaymentEventWorker({ rpc })
    expect(result.status).toBe("success")
    expect(result.counts.claimed).toBe(0)
    expect(names).not.toContain("dev_payment_event_claim_v1")
    expect(names).not.toContain("commercial_payment_receipt_v1")
    expect(names).not.toContain("commercial_payment_invoice_candidates_v1")
    expect(names).not.toContain("payment_apply_provider_event_v1")
    expect(names).not.toContain("guard_apply_subscription_event_v1")
  })

  it("still claims a Recovery payment checkout and leaves a Guard subscription queued", async () => {
    apply({ ...preview, CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" })
    mocks.checkout = {
      id: "cs_recovery", mode: "payment", status: "complete", paymentStatus: "paid",
      customerId: "cus_recovery", livemode: false, metadata: { serviceOrderId: "order" }, subscriptionId: null,
    }
    const recovery = workerRpc([{ eventId: "evt_recovery1", eventType: "checkout.session.completed", objectId: "cs_recovery" }])
    await runDevPaymentEventWorker({ rpc: recovery.rpc })
    expect(recovery.names).toContain("dev_payment_event_claim_v1")
    expect(recovery.names).not.toContain("guard_apply_subscription_event_v1")

    mocks.checkout = {
      id: "cs_guard", mode: "subscription", status: "complete", paymentStatus: "paid",
      customerId: "cus_guard", livemode: false, metadata: { guardSubscriptionId: "guard-1" }, subscriptionId: "sub_guard",
    }
    const guard = workerRpc([{ eventId: "evt_guard1", eventType: "checkout.session.completed", objectId: "cs_guard" }])
    const guardResult = await runDevPaymentEventWorker({ rpc: guard.rpc })
    expect(guardResult.counts.claimed).toBe(0)
    expect(guard.names).not.toContain("dev_payment_event_claim_v1")
    expect(guard.names).not.toContain("guard_apply_subscription_event_v1")
    expect(guard.names).not.toContain("payment_apply_provider_event_v1")
  })

  it("reads invoice candidates only when verification is enabled and leaves a timeout queued", async () => {
    apply({ ...preview, CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" })
    mocks.invoiceError = true
    const { rpc, names } = workerRpc([], [{ eventId: "evt_invoice01", eventType: "invoice.paid", objectId: "in_telloya" }])
    const result = await runDevPaymentEventWorker({ rpc })
    expect(result.status).toBe("success")
    expect(result.counts.claimed).toBe(0)
    expect(result.counts.skipped).toBe(1)
    expect(names).toContain("commercial_payment_invoice_candidates_v1")
    expect(names).not.toContain("dev_payment_event_claim_v1")
    expect(names).not.toContain("payment_apply_provider_event_v1")
    expect(names).not.toContain("guard_apply_subscription_event_v1")
  })

  const customerId = "6f0c1a20-1c3e-4a7b-9d11-0a1b2c3d4e5f"
  const commercialSubscriptionId = "7a1d2b30-2d4f-4b8c-8e22-1b2c3d4e5f60"
  const acceptanceId = "8b2e3c40-3e50-4c9d-9f33-2c3d4e5f6071"
  const checkoutOperationId = "9c3f4d50-4f61-4d0e-a044-3d4e5f607182"
  const sessionId = "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2"
  const stripeCustomerId = "cus_NffrFeUfNV2Hib"
  const stripeSubscriptionId = "sub_1P2abcDEF3ghiJKL"
  const stripePriceId = "price_1P2abcDEF3ghiJKL"
  const invoiceId = "in_1P2abcDEF3ghiJKL"
  const eventId = "evt_1P2abcDEF3ghiJKL"
  const periodStart = "2026-11-01T00:00:00.000Z"
  const periodEnd = "2026-12-01T00:00:00.000Z"
  const metadata = { customerId, commercialSubscriptionId, acceptanceId, providerOperationId: checkoutOperationId }

  function verifiedProvider() {
    mocks.checkout = {
      id: sessionId, mode: "subscription", status: "complete", paymentStatus: "paid",
      customerId: stripeCustomerId, livemode: false, metadata, subscriptionId: stripeSubscriptionId,
    }
    mocks.invoice = {
      id: invoiceId, status: "paid", customerId: stripeCustomerId, amountDueMinor: 7900, amountPaidMinor: 7900,
      currency: "gbp", livemode: false, metadata: {}, subscriptionId: stripeSubscriptionId, priceId: stripePriceId,
      quantity: 1, periodStart, periodEnd, discountMinor: 0, taxMinor: 0, automaticTax: false, trial: false,
      refunded: false, disputed: false, lineCount: 1, billingReason: "subscription_create",
    }
    mocks.subscription = {
      id: stripeSubscriptionId, customerId: stripeCustomerId, priceId: stripePriceId, quantity: 1, livemode: false,
      status: "active", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false,
      scheduleId: null, metadata,
    }
  }

  function verifiedRpc(extra: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
    const names: string[] = []
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const rpc = {
      async rpc(name: string, args: Record<string, unknown> = {}) {
        names.push(name)
        calls.push({ name, args })
        if (extra[name]) return extra[name](args)
        if (name === "job_heartbeat_v1") return { status: "success" }
        if (name === "dev_payment_event_candidates_v1") return { status: "success", events: [] }
        if (name === "payment_provider_lane_status_v1") return { configured: false, mode: "stripe_test", expectedLivemode: false }
        if (name === "commercial_payment_invoice_candidates_v1") return { status: "success", events: [{ eventId, eventType: "invoice.paid", objectId: invoiceId }] }
        if (name === "commercial_payment_receipt_v1") {
          return { status: "success", eventId, eventType: "invoice.paid", objectId: invoiceId, livemode: false }
        }
        if (name === "commercial_payment_preparation_for_price_v1") {
          return {
            status: "success", productCode: "TELLOYA", checkoutSessionId: sessionId, stripePriceId, stripeCustomerId,
            customerId, commercialSubscriptionId, acceptanceId, checkoutOperationId, amountMinor: 7900, currency: "GBP",
            cadence: "MONTH", taxBehaviour: "NOT_APPLICABLE", guardQuantity: 0, livemode: false,
            subscriptionState: "PAYMENT_PENDING", stripeSubscriptionId: null, cancelAtPeriodEnd: false, evidence: [],
          }
        }
        throw new Error(name)
      },
    } as JobRpc
    return { rpc, names, calls }
  }

  it("does not claim a verified invoice while settlement is off", async () => {
    apply({ ...preview, CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" })
    verifiedProvider()
    const { rpc, names } = verifiedRpc()
    const result = await runDevPaymentEventWorker({ rpc })
    expect(result.counts).toMatchObject({ claimed: 0, succeeded: 0, skipped: 1 })
    expect(names).toContain("commercial_payment_invoice_candidates_v1")
    expect(names).not.toContain("commercial_payment_invoice_claim_v1")
    expect(names).not.toContain("commercial_payment_settle_initial_invoice_v1")
    expect(names).not.toContain("payment_apply_provider_event_v1")
    expect(names).not.toContain("guard_apply_subscription_event_v1")
  })

  it("settles a verified invoice through the leased command and does not send a verified flag", async () => {
    apply({
      ...preview,
      CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true",
      CUSTOMER_COMMERCIAL_PAYMENT_SETTLEMENT_ENABLED: "true",
    })
    verifiedProvider()
    const { rpc, names, calls } = verifiedRpc({
      commercial_payment_invoice_claim_v1: () => ({ status: "success", jobId: "job-1", leaseToken: "lease-1" }),
      commercial_payment_settle_initial_invoice_v1: () => ({ status: "settled", retryable: false }),
    })
    const result = await runDevPaymentEventWorker({ rpc })
    expect(result.counts).toMatchObject({ claimed: 1, succeeded: 1, deadLettered: 0 })
    expect(names).toContain("commercial_payment_invoice_claim_v1")
    expect(names).toContain("commercial_payment_settle_initial_invoice_v1")
    expect(names).not.toContain("dev_payment_event_claim_v1")
    expect(names).not.toContain("payment_apply_provider_event_v1")
    expect(names).not.toContain("guard_apply_subscription_event_v1")
    expect(names).not.toContain("job_complete_v1")
    const settled = calls.find(call => call.name === "commercial_payment_settle_initial_invoice_v1")
    expect(settled?.args.p_facts).toMatchObject({ eventId, invoiceId, amountPaidMinor: 7900, currency: "gbp" })
    expect(settled?.args.p_facts).not.toHaveProperty("verified")
  })

  it("leaves the event retryable when provider evidence disappears after the claim", async () => {
    apply({
      ...preview,
      CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true",
      CUSTOMER_COMMERCIAL_PAYMENT_SETTLEMENT_ENABLED: "true",
    })
    verifiedProvider()
    mocks.failAfter = 2
    const { rpc, names } = verifiedRpc({
      commercial_payment_invoice_claim_v1: () => ({ status: "success", jobId: "job-1", leaseToken: "lease-1" }),
      job_fail_v1: () => ({ status: "success", jobStatus: "RETRY" }),
    })
    const result = await runDevPaymentEventWorker({ rpc })
    expect(result.counts).toMatchObject({ claimed: 1, succeeded: 0, retried: 1 })
    expect(names).toContain("commercial_payment_invoice_claim_v1")
    expect(names).toContain("job_fail_v1")
    expect(names).not.toContain("commercial_payment_settle_initial_invoice_v1")
    expect(names).not.toContain("payment_apply_provider_event_v1")
  })
})
