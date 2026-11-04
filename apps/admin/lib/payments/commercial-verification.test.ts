import { describe, expect, it, vi } from "vitest"
import type { RetrievedCheckout, RetrievedInvoice, RetrievedSubscription } from "../../../../lib/payments/model"
import type { PaymentProvider } from "../../../../lib/payments/provider"
import { observeCommercialCheckout, observeCommercialInvoice } from "./commercial-verification"
import type { JobRpc } from "../jobs/model"

const calls: string[] = []

function rpc(responses: Record<string, unknown>): JobRpc {
  return {
    async rpc<T>(name: string): Promise<T> {
      calls.push(name)
      if (name in responses) return responses[name] as T
      throw new Error(name)
    },
  }
}

const customerId = "6f0c1a20-1c3e-4a7b-9d11-0a1b2c3d4e5f"
const commercialSubscriptionId = "7a1d2b30-2d4f-4b8c-8e22-1b2c3d4e5f60"
const acceptanceId = "8b2e3c40-3e50-4c9d-9f33-2c3d4e5f6071"
const checkoutOperationId = "9c3f4d50-4f61-4d0e-a044-3d4e5f607182"
const sessionId = "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2"
const stripeCustomerId = "cus_NffrFeUfNV2Hib"
const stripeSubscriptionId = "sub_1P2abcDEF3ghiJKL"
const stripePriceId = "price_1P2abcDEF3ghiJKL"
const commercialMetadata = {
  customerId,
  commercialSubscriptionId,
  acceptanceId,
  providerOperationId: checkoutOperationId,
}

const checkout: RetrievedCheckout = {
  id: sessionId,
  mode: "subscription",
  status: "complete",
  paymentStatus: "paid",
  paymentIntentId: null,
  setupIntentId: null,
  customerId: stripeCustomerId,
  url: null,
  metadata: { ...commercialMetadata },
  livemode: false,
  amountMinor: 7900,
  currency: "gbp",
  subscriptionId: stripeSubscriptionId,
}

const preparation = {
  status: "success",
  productCode: "TELLOYA",
  checkoutSessionId: sessionId,
  stripePriceId,
  stripeCustomerId,
  customerId,
  commercialSubscriptionId,
  acceptanceId,
  checkoutOperationId,
  amountMinor: 7900,
  currency: "GBP",
  cadence: "MONTH",
  taxBehaviour: "NOT_APPLICABLE",
  guardQuantity: 0,
  livemode: false,
  subscriptionState: "PAYMENT_PENDING",
  stripeSubscriptionId: null,
  cancelAtPeriodEnd: false,
  evidence: [],
}

const invoice: RetrievedInvoice = {
  id: "in_1P2abcDEF3ghiJKL",
  status: "paid",
  customerId: stripeCustomerId,
  amountDueMinor: 7900,
  amountPaidMinor: 7900,
  currency: "gbp",
  hostedInvoiceUrl: null,
  metadata: { note: "ignored" },
  livemode: false,
  subscriptionId: stripeSubscriptionId,
  priceId: stripePriceId,
  quantity: 1,
  periodStart: "2026-11-01T00:00:00.000Z",
  periodEnd: "2026-12-01T00:00:00.000Z",
  discountMinor: 0,
  taxMinor: 0,
  automaticTax: false,
  trial: false,
  refunded: false,
  disputed: false,
  lineCount: 1,
  billingReason: "subscription_create",
}

const subscription: RetrievedSubscription = {
  id: stripeSubscriptionId,
  status: "active",
  customerId: stripeCustomerId,
  priceId: stripePriceId,
  subscriptionItemId: "si_telloya",
  quantity: 1,
  cancelAtPeriodEnd: false,
  currentPeriodStart: "2026-11-01T00:00:00.000Z",
  currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  scheduleId: null,
  defaultPaymentMethodId: null,
  metadata: { ...commercialMetadata },
  livemode: false,
}

const receipt = {
  status: "success",
  eventId: "evt_invoice01",
  eventType: "invoice.paid",
  objectId: "in_1P2abcDEF3ghiJKL",
  livemode: false,
  processed: false,
}

function provider(overrides: {
  checkout?: RetrievedCheckout | null
  invoice?: RetrievedInvoice | null
  subscription?: RetrievedSubscription | null
  checkoutError?: boolean
  invoiceError?: boolean
} = {}): Pick<PaymentProvider, "retrieveCheckout" | "retrieveRecurringInvoice" | "retrieveSubscription"> {
  return {
    retrieveCheckout: vi.fn(async () => {
      if (overrides.checkoutError) throw new Error("timeout")
      return overrides.checkout === undefined ? checkout : overrides.checkout
    }),
    retrieveRecurringInvoice: vi.fn(async () => {
      if (overrides.invoiceError) throw new Error("timeout")
      return overrides.invoice === undefined ? invoice : overrides.invoice
    }),
    retrieveSubscription: vi.fn(async () => overrides.subscription === undefined ? subscription : overrides.subscription),
  }
}

describe("commercial event observation", () => {
  it("does not call a verification RPC or name a product when the gate is off", async () => {
    calls.length = 0
    const commercial = await observeCommercialCheckout({
      rpc: rpc({}),
      provider: provider(),
      eventId: "evt_checkout1",
      eventType: "checkout.session.completed",
      objectId: sessionId,
      env: {},
    })
    expect(commercial).toMatchObject({ handled: true, result: { status: "pending", route: "unmatched", reason: "verification_disabled" } })
    const recovery = await observeCommercialCheckout({
      rpc: rpc({}),
      provider: provider({ checkout: { ...checkout, id: "cs_recovery", mode: "payment", metadata: { serviceOrderId: "order" }, subscriptionId: null } }),
      eventId: "evt_recovery1",
      eventType: "checkout.session.completed",
      objectId: "cs_recovery",
      env: {},
    })
    expect(recovery.handled).toBe(false)
    expect(calls).toEqual([])
  })

  it("verifies a paid invoice from the preparation and does not settle or activate", async () => {
    calls.length = 0
    const result = await observeCommercialInvoice({
      rpc: rpc({
        commercial_payment_receipt_v1: receipt,
        commercial_payment_preparation_for_price_v1: preparation,
      }),
      provider: provider(),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_1P2abcDEF3ghiJKL",
    })
    expect(result).toMatchObject({ status: "verified", route: "telloya", reason: "paid_invoice", productCode: "TELLOYA" })
    expect(calls).toEqual(["commercial_payment_receipt_v1", "commercial_payment_preparation_for_price_v1"])
    expect(JSON.stringify(result)).not.toMatch(/commercial_payment_evidence|ACTIVE|Paid/)
  })

  it("keeps a completed Checkout pending and retries a provider timeout", async () => {
    const pending = await observeCommercialCheckout({
      rpc: rpc({
        commercial_payment_receipt_v1: { ...receipt, eventId: "evt_checkout1", eventType: "checkout.session.completed", objectId: sessionId },
        commercial_payment_preparation_for_session_v1: preparation,
      }),
      provider: provider(),
      eventId: "evt_checkout1",
      eventType: "checkout.session.completed",
      objectId: sessionId,
      env: { CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" },
    })
    expect(pending.result).toMatchObject({ status: "pending", reason: "checkout_not_payment" })
    const timedOut = await observeCommercialInvoice({
      rpc: rpc({}),
      provider: provider({ invoiceError: true }),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_1P2abcDEF3ghiJKL",
    })
    expect(timedOut).toMatchObject({ status: "pending", reason: "provider_timeout", retryable: true })
    expect(calls).not.toContain("payment_apply_provider_event_v1")
    expect(calls).not.toContain("guard_apply_subscription_event_v1")
  })

  it("fails closed for the wrong customer and does not route Guard metadata as Telloya", async () => {
    const wrongCustomer = await observeCommercialInvoice({
      rpc: rpc({
        commercial_payment_receipt_v1: receipt,
        commercial_payment_preparation_for_price_v1: { ...preparation, stripeCustomerId: "cus_other" },
      }),
      provider: provider(),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_1P2abcDEF3ghiJKL",
    })
    expect(wrongCustomer).toMatchObject({ status: "mismatch", route: "telloya", reason: "customer" })
    const guard = await observeCommercialInvoice({
      rpc: rpc({ commercial_payment_receipt_v1: receipt }),
      provider: provider({ invoice: { ...invoice, priceId: null, metadata: { guardSubscriptionId: "guard-1" } } }),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_1P2abcDEF3ghiJKL",
    })
    expect(guard).toMatchObject({ status: "pending", route: "guard", reason: "guard_record" })
    expect(calls).not.toContain("guard_apply_subscription_event_v1")
    expect(calls).not.toContain("payment_apply_provider_event_v1")
  })

  it("verifies Complete from one price while the acceptance still records Guard quantity", async () => {
    const result = await observeCommercialInvoice({
      rpc: rpc({
        commercial_payment_receipt_v1: { ...receipt, objectId: "in_1PcompleteDEF3ghi" },
        commercial_payment_preparation_for_price_v1: {
          ...preparation,
          productCode: "COMPLETE",
          amountMinor: 14900,
          guardQuantity: 2,
          stripePriceId: "price_1PcompleteDEF3ghi",
          checkoutSessionId: "cs_test_completeGuard12345",
          customerId,
          commercialSubscriptionId,
          acceptanceId,
          checkoutOperationId,
        },
      }),
      provider: provider({
        invoice: { ...invoice, id: "in_1PcompleteDEF3ghi", amountDueMinor: 14900, amountPaidMinor: 14900, priceId: "price_1PcompleteDEF3ghi", quantity: 1, lineCount: 1 },
        checkout: { ...checkout, id: "cs_test_completeGuard12345" },
        subscription: { ...subscription, priceId: "price_1PcompleteDEF3ghi" },
      }),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_1PcompleteDEF3ghi",
    })
    expect(result).toMatchObject({ status: "verified", route: "complete", productCode: "COMPLETE", reason: "paid_invoice" })
    expect(JSON.stringify(result)).not.toContain(customerId)
  })

  it("does not verify when the Stripe subscription disagrees with a matching invoice", async () => {
    const wrongSubscription = await observeCommercialInvoice({
      rpc: rpc({
        commercial_payment_receipt_v1: receipt,
        commercial_payment_preparation_for_price_v1: preparation,
      }),
      provider: provider({ subscription: { ...subscription, customerId: "cus_OtherCustomer123" } }),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_1P2abcDEF3ghiJKL",
    })
    expect(wrongSubscription).toMatchObject({ status: "mismatch", reason: "subscription_customer" })
    const guardCheckout = await observeCommercialCheckout({
      rpc: rpc({
        commercial_payment_receipt_v1: { ...receipt, eventType: "checkout.session.completed", objectId: sessionId },
        commercial_payment_preparation_for_session_v1: preparation,
      }),
      provider: provider({ checkout: { ...checkout, metadata: { ...commercialMetadata, guardSubscriptionId: "4d5e6f70-5a72-4e1f-b155-4e5f60718293" } } }),
      eventId: "evt_checkout1",
      eventType: "checkout.session.completed",
      objectId: sessionId,
      env: { CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" },
    })
    expect(guardCheckout.result).toMatchObject({ status: "mismatch", route: "suspicious", reason: "conflicting_metadata" })
    expect(JSON.stringify(guardCheckout.result)).not.toMatch(/commercial_payment_evidence|ACTIVE|Paid/)
  })
})
