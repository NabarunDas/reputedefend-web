import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkout: null as Record<string, unknown> | null,
  invoice: null as Record<string, unknown> | null,
  subscription: null as Record<string, unknown> | null,
  invoiceError: false,
}))

vi.mock("../../../../lib/payments", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/payments")>("../../../../lib/payments")
  return {
    ...actual,
    paymentProvider: () => ({
      mode: "stripe_test" as const,
      retrieveCheckout: async () => mocks.checkout,
      retrieveRecurringInvoice: async () => {
        if (mocks.invoiceError) throw new Error("timeout")
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
})
