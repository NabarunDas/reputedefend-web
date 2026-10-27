import { describe, expect, it } from "vitest"
import { checkoutControl, presentCaseCommerce } from "./model"
import type { PaymentCase, PaymentObligation, PaymentOrder, PaymentReceipt } from "./parse"

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

function receipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    selector: `rc-${"ab".repeat(32)}`,
    amountMinor: 9900,
    currency: "GBP",
    taxBehaviour: "NOT_APPLICABLE",
    taxAmountMinor: 0,
    paidAt: "2026-10-04T12:00:00.000Z",
    ...overrides,
  }
}

function obligation(overrides: Partial<PaymentObligation> = {}): PaymentObligation {
  return { ...order().obligations[0], ...overrides }
}

describe("recorded case commerce", () => {
  it("uses the paid service name and the amount received", () => {
    const paid = order({
      obligations: [obligation({ state: "PAID" })],
      receipts: [receipt()],
    })
    expect(presentCaseCommerce(item([paid]))).toEqual({ purchasedService: "Guided Relaunch", payment: "Paid £99.00" })
    expect(checkoutControl(paid, [{ selector: `ca-${"cd".repeat(32)}`, kind: "guided_payment", orderRef: paid.orderRef }], paid.obligations[0])).toBeNull()
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
    expect(presentCaseCommerce(item([order({
      serviceName: "Managed Profile Recovery",
      paymentModel: "SUCCESS_FEE",
      obligations: [obligation({ kind: "success_fee", state: "DUE", amountMinor: 25000 })],
    })])).payment).toBe("The success fee is charged only after a documented result")
    expect(presentCaseCommerce(item([order({
      serviceName: "Managed Profile Recovery",
      paymentModel: "SUCCESS_FEE",
      obligations: [obligation({
        kind: "success_fee",
        state: "DUE",
        amountMinor: 25000,
        invoice: { status: "ISSUED", hostedAvailable: true },
      })],
    })]))).toEqual({
      purchasedService: "Managed Profile Recovery",
      payment: "Payment due £250.00",
    })
  })

  it("does not follow alphabetical order when several orders are recorded", () => {
    const historicalDue = order({
      orderRef: "SO-26-AAAAAA",
      serviceName: "Historical review response",
    })
    const currentPaid = order({
      orderRef: "SO-26-ZZZZZZ",
      serviceName: "Guided Relaunch",
      obligations: [obligation({ state: "PAID" })],
      receipts: [receipt()],
    })
    const neutral = { purchasedService: null, payment: "Several payments are recorded for this case. Each one is listed under Payments for this case." }
    expect(presentCaseCommerce(item([historicalDue, currentPaid]))).toEqual(neutral)
    expect(presentCaseCommerce(item([currentPaid, historicalDue]))).toEqual(neutral)
    expect(presentCaseCommerce(item([
      order({ orderRef: "SO-26-AAAAAA", obligations: [obligation({ state: "PAID" })], receipts: [receipt()] }),
      order({ orderRef: "SO-26-ZZZZZZ" }),
    ]))).toEqual(neutral)

    const voidedFirst = order({
      orderRef: "SO-26-AAAAAA",
      serviceName: "Historical review response",
      obligations: [obligation({ state: "VOID" })],
      receipts: [],
    })
    expect(presentCaseCommerce(item([voidedFirst, currentPaid]))).toEqual({
      purchasedService: "Guided Relaunch",
      payment: "Paid £99.00",
    })
    expect(presentCaseCommerce(item([currentPaid, voidedFirst]))).toEqual({
      purchasedService: "Guided Relaunch",
      payment: "Paid £99.00",
    })
    expect(presentCaseCommerce(item([
      order({ orderRef: "SO-26-AAAAAA", serviceName: "Guided Relaunch", obligations: [obligation({ state: "PAID" })], receipts: [receipt({ paidAt: "2026-10-01T12:00:00.000Z" })] }),
      order({ orderRef: "SO-26-ZZZZZZ", serviceName: "Guided Relaunch", obligations: [obligation({ state: "PAID" })], receipts: [receipt({ selector: `rc-${"ef".repeat(32)}`, paidAt: "2026-10-04T12:00:00.000Z" })] }),
    ]))).toEqual(neutral)
    expect(presentCaseCommerce(item([
      order({ serviceName: "Guided Relaunch", obligations: [obligation({ state: "VOID" })], receipts: [] }),
      order({ orderRef: "SO-26-ZZZZZZ", serviceName: "Managed Profile Recovery", obligations: [obligation({ state: "VOID" })], receipts: [] }),
    ]))).toEqual({ purchasedService: null, payment: "This payment was voided." })
    expect(presentCaseCommerce(item([order({
      obligations: [obligation({ state: "PAID" })],
      receipts: [],
    })]))).toEqual({ purchasedService: "Guided Relaunch", payment: "Paid £99.00" })
  })
})
