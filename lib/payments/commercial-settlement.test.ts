import { describe, expect, it } from "vitest"
import {
  assessCommercialSettlement,
  classifyStripeEvent,
  COMMERCIAL_CHECKOUT_SESSION_ID,
  commercialPaymentSettlementEnabled,
  commercialPaymentVerificationEnabled,
  type CheckoutFacts,
  type InvoiceFacts,
  type PreparationFacts,
  type ReceiptFacts,
  type SubscriptionFacts,
} from "./commercial-settlement"

const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"
const customerId = "6f0c1a20-1c3e-4a7b-9d11-0a1b2c3d4e5f"
const commercialSubscriptionId = "7a1d2b30-2d4f-4b8c-8e22-1b2c3d4e5f60"
const acceptanceId = "8b2e3c40-3e50-4c9d-9f33-2c3d4e5f6071"
const checkoutOperationId = "9c3f4d50-4f61-4d0e-a044-3d4e5f607182"
const sessionId = "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2"
const liveSessionId = "cs_live_b2C3d4E5f6G7h8I9j0K1l2M3"
const stripeCustomerId = "cus_NffrFeUfNV2Hib"
const stripeSubscriptionId = "sub_1P2abcDEF3ghiJKL"
const stripePriceId = "price_1P2abcDEF3ghiJKL"
const invoiceId = "in_1P2abcDEF3ghiJKL"
const eventId = "evt_1P2abcDEF3ghiJKL"

const commercialMetadata = {
  customerId,
  commercialSubscriptionId,
  acceptanceId,
  providerOperationId: checkoutOperationId,
}

function preparation(overrides: Partial<PreparationFacts> = {}): PreparationFacts {
  return {
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
    ...overrides,
  }
}

function checkout(overrides: Partial<CheckoutFacts> = {}): CheckoutFacts {
  return {
    id: sessionId,
    mode: "subscription",
    status: "complete",
    paymentStatus: "paid",
    customerId: stripeCustomerId,
    livemode: false,
    metadata: { ...commercialMetadata },
    subscriptionId: stripeSubscriptionId,
    ...overrides,
  }
}

function invoice(overrides: Partial<InvoiceFacts> = {}): InvoiceFacts {
  return {
    id: invoiceId,
    status: "paid",
    customerId: stripeCustomerId,
    amountDueMinor: 7900,
    amountPaidMinor: 7900,
    currency: "gbp",
    livemode: false,
    metadata: { note: "ignored" },
    subscriptionId: stripeSubscriptionId,
    priceId: stripePriceId,
    quantity: 1,
    periodStart,
    periodEnd,
    subscriptionStatus: "active",
    discountMinor: 0,
    taxMinor: 0,
    automaticTax: false,
    trial: false,
    refunded: false,
    disputed: false,
    lineCount: 1,
    billingReason: "subscription_create",
    ...overrides,
  }
}

function receipt(overrides: Partial<ReceiptFacts> = {}): ReceiptFacts {
  return {
    received: true,
    eventId,
    eventType: "invoice.paid",
    objectId: invoiceId,
    livemode: false,
    ...overrides,
  }
}

function subscription(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    id: stripeSubscriptionId,
    customerId: stripeCustomerId,
    priceId: stripePriceId,
    quantity: 1,
    livemode: false,
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    scheduleId: null,
    metadata: { ...commercialMetadata },
    ...overrides,
  }
}

function assess(overrides: Partial<Parameters<typeof assessCommercialSettlement>[0]> = {}) {
  const prep = overrides.preparation === undefined ? preparation() : overrides.preparation
  const route = prep?.productCode === "COMPLETE" ? "complete" as const : "telloya" as const
  const billed = prep?.productCode === "COMPLETE" ? { amountDueMinor: prep.amountMinor, amountPaidMinor: prep.amountMinor } : {}
  return assessCommercialSettlement({
    enabled: true,
    route,
    eventType: "invoice.paid",
    receipt: receipt(),
    preparation: prep,
    checkout: checkout(),
    invoice: invoice(billed),
    subscription: subscription(),
    ...overrides,
  })
}

describe("commercial Stripe classification", () => {
  it("accepts realistic test and live Checkout ids and rejects malformed or unrelated ids", () => {
    expect(COMMERCIAL_CHECKOUT_SESSION_ID.test(sessionId)).toBe(true)
    expect(COMMERCIAL_CHECKOUT_SESSION_ID.test(liveSessionId)).toBe(true)
    for (const id of [
      "cs_test_a1B2c3D4e5F6g7H8 ",
      "cs_test_a1B2c3D4e5F6\ng7",
      `cs_test_${"a".repeat(300)}`,
      "pi_3NffrFeUfNV2Hib1234",
      "sub_1P2abcDEF3ghiJKL",
      "in_1P2abcDEF3ghiJKL",
      "cus_NffrFeUfNV2Hib",
      "price_1P2abcDEF3ghiJKL",
      "cs_test_",
      "cs_",
    ]) {
      expect(COMMERCIAL_CHECKOUT_SESSION_ID.test(id)).toBe(false)
    }
  })

  it("fails closed when a prepared Checkout carries Guard or Recovery metadata", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ metadata: { ...commercialMetadata, guardSubscriptionId: "4d5e6f70-5a72-4e1f-b155-4e5f60718293" } }),
      invoice: null,
      preparation: preparation(),
      guardLinked: true,
      recoveryLinked: false,
    })).toMatchObject({ route: "suspicious", reason: "conflicting_metadata" })
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ metadata: { serviceOrderId: "1a2b3c4d-6b83-4f20-c266-5f60718293a4" } }),
      invoice: null,
      preparation: preparation(),
      guardLinked: false,
      recoveryLinked: true,
    })).toMatchObject({ route: "suspicious", reason: "conflicting_metadata" })
  })

  it("routes a prepared Complete invoice, including a Guard quantity on the acceptance", () => {
    const prep = preparation({ productCode: "COMPLETE", amountMinor: 14900, guardQuantity: 2, stripePriceId: "price_1PcompleteDEF3ghi" })
    expect(classifyStripeEvent({
      eventType: "invoice.paid",
      checkout: checkout(),
      invoice: invoice({ priceId: "price_1PcompleteDEF3ghi", amountDueMinor: 14900, amountPaidMinor: 14900 }),
      preparation: prep,
      guardLinked: false,
      recoveryLinked: false,
    }).route).toBe("complete")
  })

  it("keeps a Recovery checkout on the Recovery route", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ id: "cs_test_recoveryOrder1234", mode: "payment", metadata: { serviceOrderId: "1a2b3c4d-6b83-4f20-c266-5f60718293a4" }, subscriptionId: null }),
      invoice: null,
      preparation: null,
      guardLinked: false,
      recoveryLinked: true,
    }).route).toBe("recovery")
  })

  it("keeps a Guard subscription on the Guard route", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ id: "cs_test_guardSubscription1", metadata: { guardSubscriptionId: "4d5e6f70-5a72-4e1f-b155-4e5f60718293" } }),
      invoice: null,
      preparation: null,
      guardLinked: true,
      recoveryLinked: false,
    }).route).toBe("guard")
  })

  it("does not treat an unknown subscription session as Recovery or Guard entitlement", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ id: "cs_test_unknownSession1234", metadata: {} }),
      invoice: null,
      preparation: null,
      guardLinked: false,
      recoveryLinked: false,
    }).route).toBe("unmatched")
  })

  it("treats commercial metadata without a preparation as suspicious", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout(),
      invoice: null,
      preparation: null,
      guardLinked: false,
      recoveryLinked: false,
    })).toMatchObject({ route: "suspicious", reason: "metadata_without_preparation" })
  })

  it("treats conflicting Guard and commercial metadata as suspicious", () => {
    expect(classifyStripeEvent({
      eventType: "invoice.paid",
      checkout: null,
      invoice: invoice({ metadata: { commercialSubscriptionId, guardSubscriptionId: "4d5e6f70-5a72-4e1f-b155-4e5f60718293" } }),
      preparation: preparation(),
      guardLinked: false,
      recoveryLinked: false,
    }).route).toBe("suspicious")
  })
})

describe("commercial settlement verification", () => {
  it("verifies a paid Telloya invoice and a paid Complete invoice", () => {
    expect(assess()).toMatchObject({ status: "verified", route: "telloya", reason: "paid_invoice" })
    const complete = preparation({ productCode: "COMPLETE", amountMinor: 14900, guardQuantity: 2 })
    expect(assess({
      preparation: complete,
      invoice: invoice({ amountDueMinor: 14900, amountPaidMinor: 14900 }),
    })).toMatchObject({ status: "verified", route: "complete", productCode: "COMPLETE" })
  })

  it("does not treat a completed Checkout or an unpaid invoice as payment", () => {
    expect(assess({
      eventType: "checkout.session.completed",
      receipt: receipt({ eventType: "checkout.session.completed", objectId: sessionId, eventId: "evt_1PcheckoutDEF3ghi" }),
      invoice: null,
    })).toMatchObject({ status: "pending", reason: "checkout_not_payment" })
    expect(assess({ invoice: invoice({ status: "open", amountPaidMinor: 0 }) })).toMatchObject({ status: "pending", reason: "async_pending", retryable: true })
    expect(assess({ invoice: invoice({ status: "draft", amountPaidMinor: 0 }) })).toMatchObject({ status: "pending", reason: "invoice_unpaid", retryable: true })
  })

  it("keeps the same result when the Checkout and the paid invoice arrive out of order", () => {
    const checkoutResult = assess({
      eventType: "checkout.session.completed",
      receipt: receipt({ eventType: "checkout.session.completed", objectId: sessionId, eventId: "evt_1PcheckoutDEF3ghi" }),
      invoice: null,
    })
    const invoiceFirst = assess()
    const invoiceAgain = assess()
    expect(checkoutResult.status).toBe("pending")
    expect(invoiceFirst).toEqual(invoiceAgain)
    expect(invoiceFirst.status).toBe("verified")
  })

  it("fails closed for customer, price, amount, currency, livemode, and period mismatches", () => {
    expect(assess({ invoice: invoice({ customerId: "cus_other" }) }).reason).toBe("customer")
    expect(assess({ invoice: invoice({ priceId: "price_other" }) }).reason).toBe("price")
    expect(assess({ invoice: invoice({ amountPaidMinor: 1, amountDueMinor: 1 }) }).reason).toBe("amount")
    expect(assess({ invoice: invoice({ amountPaidMinor: 0, amountDueMinor: 0 }) }).reason).toBe("amount_zero")
    expect(assess({ invoice: invoice({ currency: "usd" }) }).reason).toBe("currency")
    expect(assess({ invoice: invoice({ livemode: true }) }).reason).toBe("livemode")
    expect(assess({ invoice: invoice({ periodStart: periodEnd, periodEnd: periodStart }) }).reason).toBe("period")
    expect(assess({ invoice: invoice({ periodStart: null, periodEnd: null }) }).reason).toBe("period")
  })

  it("rejects unsupported tax, trials, discounts, and unexpected quantities", () => {
    expect(assess({ preparation: preparation({ taxBehaviour: "EXCLUSIVE" }) })).toMatchObject({ status: "unsupported", reason: "tax" })
    expect(assess({ preparation: preparation({ cadence: "YEAR" }) })).toMatchObject({ status: "unsupported", reason: "billing_arrangement" })
    expect(assess({ invoice: invoice({ trial: true }) })).toMatchObject({ status: "unsupported", reason: "trial" })
    expect(assess({ invoice: invoice({ discountMinor: 500 }) })).toMatchObject({ status: "unsupported", reason: "discount" })
    expect(assess({ invoice: invoice({ quantity: 2 }) })).toMatchObject({ status: "unsupported", reason: "quantity" })
  })

  it("reports failed, canceled, refunded, disputed, and pending asynchronous payments", () => {
    expect(assess({ eventType: "invoice.payment_failed", receipt: receipt({ eventType: "invoice.payment_failed" }), invoice: invoice({ status: "open" }) })).toMatchObject({ status: "mismatch", reason: "payment_failed" })
    expect(assess({ invoice: invoice({ subscriptionStatus: "past_due" }), subscription: subscription({ status: "past_due" }) })).toMatchObject({ status: "mismatch", reason: "payment_failed" })
    expect(assess({ invoice: invoice({ subscriptionStatus: "canceled" }), subscription: subscription({ status: "canceled" }) })).toMatchObject({ reason: "cancellation" })
    expect(assess({ invoice: invoice({ refunded: true }) })).toMatchObject({ reason: "refund" })
    expect(assess({ invoice: invoice({ disputed: true }) })).toMatchObject({ reason: "dispute" })
    expect(assess({
      eventType: "checkout.session.async_payment_succeeded",
      receipt: receipt({ eventType: "checkout.session.async_payment_succeeded", objectId: sessionId }),
      checkout: checkout({ paymentStatus: "unpaid" }),
      invoice: null,
    })).toMatchObject({ status: "pending", reason: "async_pending", retryable: true })
  })

  it("reports duplicate evidence and an overlapping prior settlement", () => {
    expect(assess({
      preparation: preparation({ evidence: [{ eventId, periodStart, periodEnd }] }),
    })).toMatchObject({ status: "already_processed", reason: "duplicate_evidence" })
    expect(assess({
      preparation: preparation({ evidence: [{ eventId: "evt_older", periodStart, periodEnd }] }),
    })).toMatchObject({ status: "mismatch", reason: "prior_settlement" })
  })

  it("does not verify when the gate is disabled or the signed receipt is missing", () => {
    expect(commercialPaymentVerificationEnabled({})).toBe(false)
    expect(commercialPaymentVerificationEnabled({ CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" })).toBe(true)
    expect(commercialPaymentSettlementEnabled({
      CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true",
      CUSTOMER_COMMERCIAL_PAYMENT_SETTLEMENT_ENABLED: "true",
    })).toBe(true)
    expect(commercialPaymentSettlementEnabled({ CUSTOMER_COMMERCIAL_PAYMENT_SETTLEMENT_ENABLED: "true" })).toBe(false)
    expect(commercialPaymentSettlementEnabled({ CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" })).toBe(false)
    expect(assess({ enabled: false })).toMatchObject({ status: "pending", reason: "verification_disabled" })
    expect(assess({ receipt: receipt({ received: false }) })).toMatchObject({ status: "unmatched", reason: "not_received" })
  })

  it("does not treat a paid Checkout return, an incomplete provider, or an active subscription as settlement", () => {
    expect(assess({
      eventType: "checkout.session.async_payment_succeeded",
      receipt: receipt({ eventType: "checkout.session.async_payment_succeeded", objectId: sessionId }),
      checkout: checkout({ paymentStatus: "paid" }),
      invoice: null,
    })).toMatchObject({ status: "pending", reason: "checkout_not_payment" })
    expect(assess({ invoice: invoice({ disputed: null }) })).toMatchObject({ status: "pending", reason: "provider_incomplete", retryable: true })
    expect(assess({ invoice: invoice({ billingReason: "manual" }) })).toMatchObject({ status: "unsupported", reason: "billing_arrangement" })
    expect(assess({ invoice: invoice({ lineCount: 2 }) })).toMatchObject({ status: "unsupported", reason: "quantity" })
    expect(assess({ invoice: invoice({ automaticTax: true, taxMinor: 0 }) })).toMatchObject({ status: "unsupported", reason: "tax" })
    expect(assess({ preparation: preparation({ subscriptionState: "ACTIVE" }) })).toMatchObject({ status: "mismatch", reason: "prior_settlement" })
    expect(assessCommercialSettlement({
      enabled: true,
      route: "suspicious",
      eventType: "checkout.session.completed",
      receipt: receipt(),
      preparation: null,
      checkout: checkout(),
      invoice: null,
      classificationReason: "metadata_without_preparation",
    })).toMatchObject({ status: "mismatch", reason: "metadata_without_preparation" })
  })

  it("does not describe a verified result as an inserted evidence row or an active subscription", () => {
    const verified = assess()
    expect(verified.status).toBe("verified")
    expect(JSON.stringify(verified)).not.toMatch(/commercial_payment_evidence|ACTIVE|Paid/)
    expect(JSON.stringify(verified)).not.toContain(customerId)
    expect(JSON.stringify(verified)).not.toContain(acceptanceId)
    expect(JSON.stringify(verified)).not.toContain(stripeCustomerId)
  })

  it("rejects altered Checkout identity and a live session on a test preparation", () => {
    const otherCustomer = "11111111-1111-4111-8111-111111111111"
    const otherSubscription = "22222222-2222-4222-8222-222222222222"
    const otherAcceptance = "33333333-3333-4333-8333-333333333333"
    const otherOperation = "44444444-4444-4444-8444-444444444444"
    expect(assess({
      eventType: "checkout.session.completed",
      receipt: receipt({ eventType: "checkout.session.completed", objectId: sessionId, eventId: "evt_1PcheckoutDEF3ghi" }),
      checkout: checkout({ metadata: { ...commercialMetadata, customerId: otherCustomer } }),
      invoice: null,
    })).toMatchObject({ status: "mismatch", reason: "metadata_customer" })
    expect(assess({
      checkout: checkout({ metadata: { ...commercialMetadata, commercialSubscriptionId: otherSubscription } }),
    })).toMatchObject({ status: "mismatch", reason: "metadata_subscription" })
    expect(assess({
      checkout: checkout({ metadata: { ...commercialMetadata, acceptanceId: otherAcceptance } }),
    })).toMatchObject({ status: "mismatch", reason: "metadata_acceptance" })
    expect(assess({
      checkout: checkout({ metadata: { ...commercialMetadata, providerOperationId: otherOperation } }),
    })).toMatchObject({ status: "mismatch", reason: "metadata_operation" })
    expect(assess({
      checkout: checkout({ customerId: "cus_OtherCustomer123" }),
    })).toMatchObject({ status: "mismatch", reason: "customer" })
    expect(assess({
      preparation: preparation({ checkoutSessionId: liveSessionId }),
      checkout: checkout({ id: liveSessionId }),
      receipt: receipt({ objectId: invoiceId }),
    })).toMatchObject({ status: "mismatch", reason: "livemode" })
    expect(assess({
      preparation: preparation({ checkoutSessionId: "cs_test_bad id" }),
      checkout: checkout({ id: "cs_test_bad id" }),
      receipt: receipt({ eventType: "checkout.session.completed", objectId: "cs_test_bad id" }),
      eventType: "checkout.session.completed",
      invoice: null,
    })).toMatchObject({ status: "unmatched", reason: "session" })
  })

  it("rejects an inconsistent Stripe subscription even when the invoice amount matches", () => {
    expect(assess({ subscription: subscription({ customerId: "cus_OtherCustomer123" }) })).toMatchObject({ status: "mismatch", reason: "subscription_customer" })
    expect(assess({ subscription: subscription({ priceId: "price_1PotherDEF3ghiKLM" }) })).toMatchObject({ status: "mismatch", reason: "subscription_price" })
    expect(assess({ subscription: subscription({ quantity: 2 }) })).toMatchObject({ status: "unsupported", reason: "subscription_quantity" })
    expect(assess({ subscription: subscription({ livemode: true }) })).toMatchObject({ status: "mismatch", reason: "livemode" })
    expect(assess({ subscription: subscription({ currentPeriodEnd: "2027-01-01T00:00:00.000Z" }) })).toMatchObject({ status: "mismatch", reason: "period" })
    expect(assess({ subscription: subscription({ scheduleId: "sub_sched_1P2abcDEF" }) })).toMatchObject({ status: "mismatch", reason: "subscription_change" })
    expect(assess({ subscription: subscription({ metadata: { ...commercialMetadata, guardSubscriptionId: "4d5e6f70-5a72-4e1f-b155-4e5f60718293" } }) })).toMatchObject({ status: "mismatch", route: "suspicious", reason: "conflicting_metadata" })
    expect(assess({ subscription: subscription({ metadata: {} }) })).toMatchObject({ status: "pending", reason: "provider_incomplete", retryable: true })
    expect(assess({ subscription: subscription({ priceId: null }) })).toMatchObject({ status: "pending", reason: "provider_incomplete", retryable: true })
    expect(assess({ subscription: null })).toMatchObject({ status: "pending", reason: "provider_incomplete", retryable: true })
  })

  it("does not verify a completed Checkout or move a subscription to active", () => {
    const completed = assess({
      eventType: "checkout.session.completed",
      receipt: receipt({ eventType: "checkout.session.completed", objectId: sessionId, eventId: "evt_1PcheckoutDEF3ghi" }),
      invoice: null,
      subscription: null,
    })
    expect(completed.status).not.toBe("verified")
    expect(completed).toMatchObject({ status: "pending", reason: "checkout_not_payment" })
    expect(JSON.stringify(completed)).not.toMatch(/commercial_payment_evidence|ACTIVE|Paid/)
  })
})
