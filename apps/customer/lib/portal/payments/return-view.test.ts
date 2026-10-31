import { describe, expect, it } from "vitest"
import type { CustomerPayments, PaymentCase, PaymentOrder } from "./parse"
import { paymentReturnResumeHref, paymentReturnUrl, paymentReturnView, requestedOrderRef } from "./return-view"

const receipt = {
  selector: `rc-${"ab".repeat(32)}`,
  amountMinor: 9900,
  currency: "GBP",
  taxBehaviour: "NOT_APPLICABLE" as const,
  taxAmountMinor: 0,
  paidAt: "2026-10-26T16:40:00.000Z",
}

function order(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    orderRef: "SO-26-GHHRGY",
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

function payments(item: PaymentOrder, track: PaymentCase["serviceTrack"] = "GUIDED"): CustomerPayments {
  return {
    cases: [{
      reference: "PR-26-GHNLB9",
      businessName: "Harbour Bakery",
      locationName: "High Street",
      serviceTrack: track,
      orders: [item],
      actions: [],
    }],
  }
}

describe("payment return view", () => {
  it("shows a signed-out visitor a generic confirmation with no payment details", () => {
    const view = paymentReturnView({ status: "unauthenticated" }, "SO-26-GHHRGY")
    expect(view.tone).toBe("signed_out")
    expect(view.heading).toBe("Payment is being confirmed")
    expect(view.links).toEqual([{ href: "/login", label: "Sign in" }])
    expect(view.refresh).toBe(false)
    const text = view.paragraphs.join(" ")
    expect(text).toMatch(/Sign in to see whether your payment has been recorded/)
    expect(text).not.toMatch(/does not mark a payment as paid/)
    expect(text).not.toMatch(/£|SO-|PR-|Guard|pi_|cs_/)
  })

  it("shows the confirmed Guided receipt and the pack next step", () => {
    const view = paymentReturnView({
      status: "ready",
      payments: payments(order({
        obligations: [{ ...order().obligations[0], state: "PAID" }],
        receipts: [receipt],
      })),
    }, null)
    expect(view.tone).toBe("paid")
    expect(view.heading).toBe("Payment received")
    const text = view.paragraphs.join(" ")
    expect(text).toContain("Guided Relaunch")
    expect(text).toContain("£99.00")
    expect(text).toContain("SO-26-GHHRGY")
    expect(text).toContain("one-time")
    expect(text).toMatch(/not a VAT invoice/)
    expect(text).toMatch(/prepare your Guided pack/)
    expect(text).toMatch(/does not mean Google has reinstated/)
    expect(text).not.toMatch(/Guard subscription|pi_|cs_|checkout\.stripe/)
    expect(view.links[0]).toEqual({ href: `/portal/payments/receipt?selector=${receipt.selector}`, label: "View your receipt" })
    expect(view.links.map(link => link.href)).toEqual([
      `/portal/payments/receipt?selector=${receipt.selector}`,
      "/portal/cases/PR-26-GHNLB9",
      "/portal/cases/PR-26-GHNLB9/payments",
    ])
    expect(view.refresh).toBe(false)
  })

  it("keeps an unpaid order pending and does not offer another charge", () => {
    const view = paymentReturnView({ status: "ready", payments: payments(order()) }, "SO-26-GHHRGY")
    expect(view.tone).toBe("pending")
    expect(view.refresh).toBe(true)
    const text = view.paragraphs.join(" ")
    expect(text).toMatch(/do not need to pay again/)
    expect(text).not.toMatch(/does not mark a payment as paid/)
    expect(text).toMatch(/will not be charged again/)
    expect(text).not.toMatch(/Guard|reinstated|payment successful/)
    expect(view.links.map(link => link.label)).toEqual(["Open your case", "View payments"])
  })

  it("offers a retry only when the selected order has no paid or processing payment", () => {
    const failed = order({
      obligations: [{ ...order().obligations[0], state: "FAILED" }],
    })
    const view = paymentReturnView({ status: "ready", payments: payments(failed) }, failed.orderRef)
    expect(view.tone).toBe("failed")
    expect(view.links.map(link => link.label)).toContain("Review this payment")
    expect(view.paragraphs.join(" ")).toMatch(/not been charged/)
  })

  it("uses Guard copy only for a recurring Guard order", () => {
    const guard = order({
      orderRef: "SO-26-GUARD2",
      serviceName: "Relaunch Guard",
      paymentModel: "RECURRING_MONTHLY",
      obligations: [],
      receipts: [{ ...receipt, amountMinor: 2900 }],
      amountMinor: 2900,
    })
    const view = paymentReturnView({ status: "ready", payments: payments(guard, "MANAGED") }, null)
    expect(view.paragraphs.join(" ")).toMatch(/Guard subscription becomes current only after a confirmed recurring invoice payment/)
    expect(view.paragraphs.join(" ")).not.toMatch(/Guided pack/)
  })

  it("ignores a provider id or an order the customer does not own", () => {
    expect(requestedOrderRef({ order: "pi_3UUqioBq7gpSHBmB1ZhwsJd5", session: "cs_test" })).toBeNull()
    expect(requestedOrderRef({ order: ["SO-26-GHHRGY"] })).toBeNull()
    expect(paymentReturnUrl("https://customer.example", "SO-26-GHHRGY")).toBe("https://customer.example/pay/return?order=SO-26-GHHRGY")
    expect(paymentReturnUrl("https://customer.example", "pi_secret")).toBe("https://customer.example/pay/return")
    expect(paymentReturnResumeHref("SO-26-GHHRGY")).toBe("/pay/return?order=SO-26-GHHRGY&resume=1")
    expect(paymentReturnResumeHref("pi_secret")).toBe("/pay/return?resume=1")
    expect(paymentReturnResumeHref(null)).not.toMatch(/token|session|pi_|cs_/)
    const view = paymentReturnView({ status: "ready", payments: payments(order()) }, "SO-26-OTHER1")
    expect(view.tone).toBe("empty")
    expect(view.paragraphs.join(" ")).not.toContain("SO-26-GHHRGY")
    expect(view.paragraphs.join(" ")).not.toContain("SO-26-OTHER1")
    expect(view.paragraphs.join(" ")).not.toMatch(/£/)
    expect(view.links).toEqual([{ href: "/portal", label: "Open your portal" }])
  })
})
