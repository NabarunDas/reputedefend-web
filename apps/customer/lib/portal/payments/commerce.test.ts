import { describe, expect, it } from "vitest"
import { presentCaseCommerce } from "./model"
import type { PaymentCase, PaymentOrder } from "./parse"

function order(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    orderRef: "SO-26-ABCDEF",
    serviceName: "Guided Relaunch",
    amountMinor: 9900,
    currency: "GBP",
    taxBehaviour: "NOT_APPLICABLE",
    taxAmountMinor: 0,
    paymentModel: "UPFRONT",
    paymentMethodSaved: false,
    consent: null,
    consentOfferText: null,
    obligations: [{
      kind: "upfront",
      state: "DUE",
      amountMinor: 9900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      invoice: null,
    }],
    receipts: [],
    ...overrides,
  }
}

function item(orders: PaymentOrder[]): PaymentCase {
  return {
    reference: "PR-26-ABCDEF",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    serviceTrack: "GUIDED",
    orders,
    actions: [],
  }
}

describe("recorded case commerce", () => {
  it("uses the paid service name and the amount received", () => {
    expect(presentCaseCommerce(item([order({
      obligations: [{ ...order().obligations[0], state: "PAID" }],
      receipts: [{ selector: `rc-${"ab".repeat(32)}`, amountMinor: 9900, currency: "GBP", taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0, paidAt: "2026-10-04T12:00:00.000Z" }],
    })]))).toEqual({ purchasedService: "Guided Relaunch", payment: "Paid £99.00" })
  })

  it("does not describe an unpaid order as paid and does not invent a product", () => {
    expect(presentCaseCommerce(item([order()]))).toEqual({ purchasedService: "Guided Relaunch", payment: "Payment due £99.00" })
    expect(presentCaseCommerce(item([]))).toEqual({ purchasedService: null, payment: null })
    expect(presentCaseCommerce(item([order({
      serviceName: "Managed Profile Recovery",
      paymentModel: "SUCCESS_FEE",
      obligations: [],
    })]))).toEqual({
      purchasedService: "Managed Profile Recovery",
      payment: "The success fee is charged only after a documented result",
    })
  })
})
