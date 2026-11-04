import { describe, expect, it } from "vitest"
import {
  assessCommercialSettlement,
  classifyStripeEvent,
  commercialPaymentVerificationEnabled,
  type CheckoutFacts,
  type InvoiceFacts,
  type PreparationFacts,
  type ReceiptFacts,
} from "./commercial-settlement"

const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"

function preparation(overrides: Partial<PreparationFacts> = {}): PreparationFacts {
  return {
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
    ...overrides,
  }
}

function checkout(overrides: Partial<CheckoutFacts> = {}): CheckoutFacts {
  return {
    id: "cs_telloya",
    mode: "subscription",
    status: "complete",
    paymentStatus: "paid",
    customerId: "cus_telloya",
    livemode: false,
    metadata: { commercialSubscriptionId: "sub-internal", acceptanceId: "acc-internal" },
    subscriptionId: "sub_telloya",
    ...overrides,
  }
}

function invoice(overrides: Partial<InvoiceFacts> = {}): InvoiceFacts {
  return {
    id: "in_telloya",
    status: "paid",
    customerId: "cus_telloya",
    amountDueMinor: 7900,
    amountPaidMinor: 7900,
    currency: "gbp",
    livemode: false,
    metadata: { note: "ignored" },
    subscriptionId: "sub_telloya",
    priceId: "price_telloya",
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
    eventId: "evt_invoice",
    eventType: "invoice.paid",
    objectId: "in_telloya",
    livemode: false,
    ...overrides,
  }
}

function assess(overrides: Partial<Parameters<typeof assessCommercialSettlement>[0]> = {}) {
  const prep = overrides.preparation === undefined ? preparation() : overrides.preparation
  const route = prep?.productCode === "COMPLETE" ? "complete" as const : "telloya" as const
  return assessCommercialSettlement({
    enabled: true,
    route,
    eventType: "invoice.paid",
    receipt: receipt(),
    preparation: prep,
    checkout: checkout(),
    invoice: invoice(prep?.productCode === "COMPLETE" ? { amountDueMinor: prep.amountMinor, amountPaidMinor: prep.amountMinor } : {}),
    ...overrides,
  })
}

describe("commercial Stripe classification", () => {
  it("routes a prepared Telloya checkout by the database preparation, not the metadata label", () => {
    const classified = classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ metadata: { guardSubscriptionId: "pretend-guard" } }),
      invoice: null,
      preparation: preparation(),
      guardLinked: true,
      recoveryLinked: true,
    })
    expect(classified.route).toBe("telloya")
  })

  it("routes a prepared Complete invoice, including a Guard quantity on the acceptance", () => {
    const prep = preparation({ productCode: "COMPLETE", amountMinor: 14900, guardQuantity: 2, stripePriceId: "price_complete", checkoutSessionId: "cs_complete" })
    expect(classifyStripeEvent({
      eventType: "invoice.paid",
      checkout: checkout({ id: "cs_complete", subscriptionId: "sub_complete" }),
      invoice: invoice({ priceId: "price_complete", customerId: "cus_telloya", amountDueMinor: 14900, amountPaidMinor: 14900 }),
      preparation: prep,
      guardLinked: false,
      recoveryLinked: false,
    }).route).toBe("complete")
  })

  it("keeps a Recovery checkout on the Recovery route", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ id: "cs_recovery", mode: "payment", metadata: { serviceOrderId: "order" }, subscriptionId: null }),
      invoice: null,
      preparation: null,
      guardLinked: false,
      recoveryLinked: true,
    }).route).toBe("recovery")
  })

  it("keeps a Guard subscription on the Guard route", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ id: "cs_guard", metadata: { guardSubscriptionId: "guard-1" } }),
      invoice: null,
      preparation: null,
      guardLinked: true,
      recoveryLinked: false,
    }).route).toBe("guard")
  })

  it("does not treat an unknown subscription session as Recovery or Guard entitlement", () => {
    expect(classifyStripeEvent({
      eventType: "checkout.session.completed",
      checkout: checkout({ id: "cs_unknown", metadata: {} }),
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
      invoice: invoice({ metadata: { commercialSubscriptionId: "one", guardSubscriptionId: "two" } }),
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
      receipt: receipt({ eventType: "checkout.session.completed", objectId: "cs_telloya", eventId: "evt_checkout" }),
      invoice: null,
    })).toMatchObject({ status: "pending", reason: "checkout_not_payment" })
    expect(assess({ invoice: invoice({ status: "open", amountPaidMinor: 0 }) })).toMatchObject({ status: "pending", reason: "async_pending", retryable: true })
    expect(assess({ invoice: invoice({ status: "draft", amountPaidMinor: 0 }) })).toMatchObject({ status: "pending", reason: "invoice_unpaid", retryable: true })
  })

  it("keeps the same result when the Checkout and the paid invoice arrive out of order", () => {
    const checkoutResult = assess({
      eventType: "checkout.session.completed",
      receipt: receipt({ eventType: "checkout.session.completed", objectId: "cs_telloya", eventId: "evt_checkout" }),
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
    expect(assess({ invoice: invoice({ subscriptionStatus: "past_due" }) })).toMatchObject({ status: "mismatch", reason: "payment_failed" })
    expect(assess({ invoice: invoice({ subscriptionStatus: "canceled" }) })).toMatchObject({ reason: "cancellation" })
    expect(assess({ invoice: invoice({ refunded: true }) })).toMatchObject({ reason: "refund" })
    expect(assess({ invoice: invoice({ disputed: true }) })).toMatchObject({ reason: "dispute" })
    expect(assess({
      eventType: "checkout.session.async_payment_succeeded",
      receipt: receipt({ eventType: "checkout.session.async_payment_succeeded", objectId: "cs_telloya" }),
      checkout: checkout({ paymentStatus: "unpaid" }),
      invoice: null,
    })).toMatchObject({ status: "pending", reason: "async_pending", retryable: true })
  })

  it("reports duplicate evidence and an overlapping prior settlement", () => {
    expect(assess({
      preparation: preparation({ evidence: [{ eventId: "evt_invoice", periodStart, periodEnd }] }),
    })).toMatchObject({ status: "already_processed", reason: "duplicate_evidence" })
    expect(assess({
      preparation: preparation({ evidence: [{ eventId: "evt_older", periodStart, periodEnd }] }),
    })).toMatchObject({ status: "mismatch", reason: "prior_settlement" })
  })

  it("does not verify when the gate is disabled or the signed receipt is missing", () => {
    expect(commercialPaymentVerificationEnabled({})).toBe(false)
    expect(commercialPaymentVerificationEnabled({ CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED: "true" })).toBe(true)
    expect(assess({ enabled: false })).toMatchObject({ status: "pending", reason: "verification_disabled" })
    expect(assess({ receipt: receipt({ received: false }) })).toMatchObject({ status: "unmatched", reason: "not_received" })
  })

  it("does not treat a paid Checkout return, an incomplete provider, or an active subscription as settlement", () => {
    expect(assess({
      eventType: "checkout.session.async_payment_succeeded",
      receipt: receipt({ eventType: "checkout.session.async_payment_succeeded", objectId: "cs_telloya" }),
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
  })
})
