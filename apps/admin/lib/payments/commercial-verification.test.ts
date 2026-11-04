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

const checkout: RetrievedCheckout = {
  id: "cs_telloya",
  mode: "subscription",
  status: "complete",
  paymentStatus: "paid",
  paymentIntentId: null,
  setupIntentId: null,
  customerId: "cus_telloya",
  url: null,
  metadata: { commercialSubscriptionId: "internal-sub", acceptanceId: "internal-acc" },
  livemode: false,
  amountMinor: 7900,
  currency: "gbp",
  subscriptionId: "sub_telloya",
}

const preparation = {
  status: "success",
  productCode: "TELLOYA",
  checkoutSessionId: "cs_telloya",
  stripePriceId: "price_telloya",
  stripeCustomerId: "cus_telloya",
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
  id: "in_telloya",
  status: "paid",
  customerId: "cus_telloya",
  amountDueMinor: 7900,
  amountPaidMinor: 7900,
  currency: "gbp",
  hostedInvoiceUrl: null,
  metadata: { commercialSubscriptionId: "ignored" },
  livemode: false,
  subscriptionId: "sub_telloya",
  priceId: "price_telloya",
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
  id: "sub_telloya",
  status: "active",
  customerId: "cus_telloya",
  priceId: "price_telloya",
  subscriptionItemId: "si_telloya",
  quantity: 1,
  cancelAtPeriodEnd: false,
  currentPeriodStart: "2026-11-01T00:00:00.000Z",
  currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  scheduleId: null,
  defaultPaymentMethodId: null,
  metadata: {},
  livemode: false,
}

const receipt = {
  status: "success",
  eventId: "evt_invoice01",
  eventType: "invoice.paid",
  objectId: "in_telloya",
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
      objectId: "cs_telloya",
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
      objectId: "in_telloya",
    })
    expect(result).toMatchObject({ status: "verified", route: "telloya", reason: "paid_invoice", productCode: "TELLOYA" })
    expect(calls).toEqual(["commercial_payment_receipt_v1", "commercial_payment_preparation_for_price_v1"])
    expect(JSON.stringify(result)).not.toMatch(/commercial_payment_evidence|ACTIVE|Paid/)
  })

  it("keeps a completed Checkout pending and retries a provider timeout", async () => {
    const pending = await observeCommercialCheckout({
      rpc: rpc({
        commercial_payment_receipt_v1: { ...receipt, eventId: "evt_checkout1", eventType: "checkout.session.completed", objectId: "cs_telloya" },
        commercial_payment_preparation_for_session_v1: preparation,
      }),
      provider: provider(),
      eventId: "evt_checkout1",
      eventType: "checkout.session.completed",
      objectId: "cs_telloya",
      env: { CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" },
    })
    expect(pending.result).toMatchObject({ status: "pending", reason: "checkout_not_payment" })
    const timedOut = await observeCommercialInvoice({
      rpc: rpc({}),
      provider: provider({ invoiceError: true }),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_telloya",
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
      objectId: "in_telloya",
    })
    expect(wrongCustomer).toMatchObject({ status: "mismatch", route: "telloya", reason: "customer" })
    const guard = await observeCommercialInvoice({
      rpc: rpc({ commercial_payment_receipt_v1: receipt }),
      provider: provider({ invoice: { ...invoice, priceId: null, metadata: { guardSubscriptionId: "guard-1" } } }),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_telloya",
    })
    expect(guard).toMatchObject({ status: "pending", route: "guard", reason: "guard_record" })
    expect(calls).not.toContain("guard_apply_subscription_event_v1")
    expect(calls).not.toContain("payment_apply_provider_event_v1")
  })

  it("verifies Complete from one price while the acceptance still records Guard quantity", async () => {
    const result = await observeCommercialInvoice({
      rpc: rpc({
        commercial_payment_receipt_v1: { ...receipt, objectId: "in_complete" },
        commercial_payment_preparation_for_price_v1: {
          ...preparation,
          productCode: "COMPLETE",
          amountMinor: 14900,
          guardQuantity: 2,
          stripePriceId: "price_complete",
          checkoutSessionId: "cs_complete",
        },
      }),
      provider: provider({
        invoice: { ...invoice, id: "in_complete", amountDueMinor: 14900, amountPaidMinor: 14900, priceId: "price_complete", quantity: 1, lineCount: 1 },
        checkout: { ...checkout, id: "cs_complete" },
      }),
      eventId: "evt_invoice01",
      eventType: "invoice.paid",
      objectId: "in_complete",
    })
    expect(result).toMatchObject({ status: "verified", route: "complete", productCode: "COMPLETE", reason: "paid_invoice" })
  })
})
