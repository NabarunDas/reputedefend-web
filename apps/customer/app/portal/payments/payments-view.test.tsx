// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../layout"
import { PaymentsView } from "./payments-view"
import type { PaymentCase, PaymentOrder } from "@/lib/portal/payments/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/payments" }))
const refresh = vi.hoisted(() => vi.fn())
const navigation = vi.hoisted(() => ({ urls: [] as string[] }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh }),
}))
vi.mock("../../../../../lib/payments/stripe-url", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/payments/stripe-url")>("../../../../../lib/payments/stripe-url")
  return {
    ...actual,
    assignTrustedStripeCheckout(value: unknown) {
      const trusted = actual.trustedStripeUrl(value, "checkout")
      if (!trusted) return false
      navigation.urls.push(trusted)
      return true
    },
  }
})

const fetchMock = vi.fn()
const selector = `ca-${"ab".repeat(32)}`
const receiptSelector = `rc-${"cd".repeat(32)}`
const consent = "No service fee is charged today. The agreed success fee may be charged later only after the defined successful outcome has occurred and ProfileRelaunch has approved billing."

function order(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    orderRef: "SO-26-ABCDEF",
    serviceName: "Guided relaunch",
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

function item(overrides: Partial<PaymentCase> = {}): PaymentCase {
  return {
    reference: "PR-26-ABCDEF",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    serviceTrack: "GUIDED",
    orders: [order()],
    actions: [{ selector, kind: "guided_payment", orderRef: "SO-26-ABCDEF" }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  refresh.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("payments screens", () => {
  it("renders each supported payment state with the matching next action", () => {
    const states = [
      ["DUE", "Payment required", "Pay £99.00 securely"],
      ["COLLECTING", "Payment pending", "Continue secure checkout"],
      ["FAILED", "Payment was not completed", "Try secure checkout again"],
      ["PAID", "Paid", null],
      ["VOID", "Void", null],
    ] as const
    for (const [state, heading, button] of states) {
      cleanup()
      render(<PaymentsView focused cases={[item({
        orders: [order({ obligations: [{ ...order().obligations[0], state }] })],
        actions: state === "PAID" || state === "VOID" ? [] : item().actions,
      })]} />)
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy()
      expect(screen.getAllByText("£99.00").length).toBeGreaterThan(0)
      if (button) expect(screen.getByRole("button", { name: button })).toBeTruthy()
      else expect(screen.queryByRole("button", { name: /checkout|authentication/i })).toBeNull()
      expect(document.body.textContent).not.toMatch(/successful|paymentIntent|cus_|pi_|cs_/)
    }
  })

  it("asks for authentication on a recovery obligation and does not invent an invoice number", () => {
    render(<PortalLayout><PaymentsView focused cases={[item({
      orders: [order({
        obligations: [{
          ...order().obligations[0],
          state: "AUTHENTICATION_REQUIRED",
          invoice: { status: "ISSUED", hostedAvailable: false },
        }],
      })],
      actions: [{ selector, kind: "recovery", orderRef: "SO-26-ABCDEF" }],
    })]} /></PortalLayout>)
    expect(screen.getByRole("heading", { name: "Authentication required" })).toBeTruthy()
    expect(screen.getByText("Your bank needs you to confirm this payment. This is not paid yet.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Continue authentication" })).toBeTruthy()
    expect(screen.getByText("The hosted invoice link is not available yet.")).toBeTruthy()
    expect(screen.queryByRole("link", { name: /Open invoice/ })).toBeNull()
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("href", "/portal/payments")
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toHaveAttribute("href", "/portal/guard")
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/portal/messages")
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/portal/account")
  })

  it("labels the stored Guided amount, including a discounted total", () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({ serviceName: "Guided Review", amountMinor: 5900, obligations: [{ ...order().obligations[0], amountMinor: 5900 }] })],
    })]} />)
    expect(screen.getByRole("button", { name: "Pay £59.00 securely" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Pay £99.00 securely" })).toBeNull()
    cleanup()
    render(<PaymentsView focused cases={[item({
      orders: [order({ amountMinor: 7920, obligations: [{ ...order().obligations[0], amountMinor: 7920 }] })],
    })]} />)
    expect(screen.getByRole("button", { name: "Pay £79.20 securely" })).toBeTruthy()
  })

  it("does not offer Managed off-session card setup", () => {
    render(<PaymentsView focused cases={[item({
      serviceTrack: "MANAGED",
      orders: [order({
        paymentModel: "SUCCESS_FEE",
        paymentMethodSaved: true,
        consent: { recorded: true, text: consent },
        consentOfferText: "A saved card may be charged off-session after success.",
        obligations: [],
      })],
      actions: [{ selector, kind: "managed_setup", orderRef: "SO-26-ABCDEF" }],
    })]} />)
    const notes = screen.getByText("Payment notes").closest("details")
    expect(notes?.querySelector("h4")?.textContent).toBe("Managed service payment")
    expect(notes?.textContent).toMatch(/invoiced only after documented success/)
    expect(screen.queryByRole("button", { name: /Save payment method|Record consent/ })).toBeNull()
    expect(screen.queryByText(consent)).toBeNull()
    expect(notes?.textContent).toMatch(/off-session charge is not available/)
    expect(screen.queryByText(/charged off-session/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/last4|4242|pm_|brand/i)
  })

  it("keeps a repeated checkout click on one idempotency key and does not mark the page paid", async () => {
    let release: (value: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise(resolve => { release = resolve }))
    render(<PaymentsView focused cases={[item()]} />)
    const button = screen.getByRole("button", { name: "Pay £99.00 securely" })
    fireEvent.submit(button.closest("form")!)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.submit(button.closest("form")!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstKey = fetchMock.mock.calls[0][1].headers["idempotency-key"]
    release({ ok: false, status: 503, json: async () => ({ status: "disabled", message: "Secure Stripe Checkout is not available yet." }) })
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Secure Stripe Checkout is not available yet."))
    expect(screen.getByRole("heading", { name: "Payment required" })).toBeTruthy()
    expect(screen.queryByText(/payment successful/i)).toBeNull()
    fireEvent.submit(screen.getByRole("button", { name: "Pay £99.00 securely" }).closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][1].headers["idempotency-key"]).toBe(firstKey)
  })

  it("does not navigate when Checkout returns an untrusted URL", async () => {
    navigation.urls.length = 0
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", checkoutUrl: "https://evil.example/checkout.stripe.com" }),
    })
    render(<PaymentsView focused cases={[item()]} />)
    fireEvent.submit(screen.getByRole("button", { name: "Pay £99.00 securely" }).closest("form")!)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Secure Stripe Checkout is not available yet."))
    expect(navigation.urls).toEqual([])
    expect(document.body.innerHTML).not.toContain("evil.example")
    expect(screen.queryByText(/payment successful/i)).toBeNull()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", checkoutUrl: "https://checkout.stripe.com/c/pay_test" }),
    })
    fireEvent.submit(screen.getByRole("button", { name: "Pay £99.00 securely" }).closest("form")!)
    await waitFor(() => expect(navigation.urls).toEqual(["https://checkout.stripe.com/c/pay_test"]))
  })

  it("links a receipt download without a storage path", () => {
    render(<PaymentsView cases={[item({
      orders: [order({
        obligations: [{ ...order().obligations[0], state: "PAID" }],
        receipts: [{
          selector: receiptSelector,
          amountMinor: 9900,
          currency: "GBP",
          taxBehaviour: "NOT_APPLICABLE",
          taxAmountMinor: 0,
          paidAt: "2026-10-04T12:00:00.000Z",
        }],
      })],
      actions: [],
    })]} focused={false} />)
    expect(screen.getByRole("link", { name: "Download receipt for SO-26-ABCDEF" })).toHaveAttribute(
      "href",
      `/api/portal/payments/receipt?selector=${receiptSelector}`,
    )
    expect(screen.getByRole("link", { name: "View payments for PR-26-ABCDEF" })).toHaveAttribute(
      "href",
      "/portal/cases/PR-26-ABCDEF/payments",
    )
    expect(document.body.innerHTML).not.toMatch(/storage|provider_receipt|stripe_/i)
  })

  it("shows one compact summary and a fresh checkout action only for an open unpaid session", async () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({ serviceName: "Guided Relaunch" })],
    })]} />)
    expect(screen.getByRole("heading", { name: "Guided Relaunch" })).toBeTruthy()
    expect(screen.getByText("Order SO-26-ABCDEF")).toBeTruthy()
    expect(screen.getAllByText("£99.00")).toHaveLength(2)
    expect(document.querySelector(".payments-amount")?.textContent).toBe("£99.00")
    expect(document.querySelector(".payments-amount")?.previousElementSibling?.textContent).toBe("Order total")
    expect(document.querySelector(".payments-outstanding")?.textContent).toBe("£99.00")
    expect(document.querySelector(".payments-outstanding")?.previousElementSibling?.textContent).toBe("Outstanding")
    const notes = screen.getByText("Payment notes").closest("details")
    expect(notes?.textContent).toContain("One-time payment")
    expect(notes?.textContent).toContain("The total includes any applicable taxes. ProfileRelaunch does not add a further fee.")
    expect(screen.queryByText("The amount shown is the amount recorded for this order.")).toBeNull()
    expect(screen.queryByText("Amount")).toBeNull()
    expect(screen.queryByRole("button", { name: "Start a fresh secure checkout" })).toBeNull()
    expect(screen.getByRole("button", { name: "Pay £99.00 securely" })).toBeTruthy()
    cleanup()

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_fresh" }),
    })
    render(<PaymentsView focused freshOrders={["SO-26-ABCDEF"]} cases={[item({
      orders: [order({ serviceName: "Guided Relaunch" })],
    })]} />)
    expect(screen.getByText("The old payment page will be closed and a new one opened. No payment has been taken.")).toBeTruthy()
    fireEvent.submit(screen.getByRole("button", { name: "Start a fresh secure checkout" }).closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const posted = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(posted).toEqual({
      reference: "PR-26-ABCDEF",
      selector,
      operation: "refresh_checkout",
      confirmation: {},
    })
    expect(JSON.stringify(posted)).not.toMatch(/cs_|pi_/)
    fireEvent.submit(screen.getByRole("button", { name: "Pay £99.00 securely" }).closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).operation).toBe("start_checkout")
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).not.toBe(fetchMock.mock.calls[1][1].headers["idempotency-key"])
  })
})

function obligation(overrides: Partial<PaymentOrder["obligations"][number]> = {}): PaymentOrder["obligations"][number] {
  return { ...order().obligations[0], ...overrides }
}

function receipt(amountMinor: number, marker: string) {
  return {
    selector: `rc-${marker.repeat(32)}`,
    amountMinor,
    currency: "GBP",
    taxBehaviour: "NOT_APPLICABLE" as const,
    taxAmountMinor: 0,
    paidAt: "2026-10-04T12:00:00.000Z",
  }
}

function orderTotal(): HTMLElement {
  const node = document.querySelector(".payments-amount")
  if (!(node instanceof HTMLElement)) throw new Error("missing order total")
  return node
}

describe("payment amount headings", () => {
  it("keeps an unpaid upfront order total separate from the recorded amount due", () => {
    render(<PaymentsView focused cases={[item()]} />)
    expect(orderTotal().textContent).toBe("£99.00")
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(document.querySelector(".payments-outstanding")?.textContent).toBe("£99.00")
    expect(screen.getByRole("heading", { name: "Payment required" })).toBeTruthy()
    expect(screen.getByText("No payment recorded yet.")).toBeTruthy()
    expect(screen.queryByText("£0.00")).toBeNull()
  })

  it("shows a paid order total and the receipt amount, not an outstanding balance", () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({
        obligations: [obligation({ state: "PAID" })],
        receipts: [receipt(9900, "ab")],
      })],
      actions: [],
    })]} />)
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(screen.getByText(/Paid £99\.00/)).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Paid" })).toBeTruthy()
    expect(screen.queryByText("Outstanding")).toBeNull()
    expect(screen.queryByText("No payment recorded yet.")).toBeNull()
  })

  it("uses the stored due obligation for a mixed order and does not subtract receipts", () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({
        obligations: [
          obligation({ state: "PAID", amountMinor: 4000 }),
          obligation({ state: "DUE", amountMinor: 9900 }),
        ],
        receipts: [receipt(4000, "cd")],
      })],
    })]} />)
    expect(orderTotal().textContent).toBe("£99.00")
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(screen.getByText(/Paid £40\.00/)).toBeTruthy()
    expect(document.querySelector(".payments-outstanding")?.textContent).toBe("£99.00")
    expect(document.querySelector(".payments-outstanding")?.previousElementSibling?.textContent).toBe("Outstanding")
    expect(document.body.textContent).not.toContain("£59.00")
    cleanup()

    render(<PaymentsView focused cases={[item({
      orders: [order({
        obligations: [
          obligation({ state: "PAID", amountMinor: 4000 }),
          obligation({ state: "DUE", amountMinor: 5900 }),
        ],
        receipts: [receipt(4000, "ef")],
      })],
    })]} />)
    expect(orderTotal().textContent).toBe("£99.00")
    expect(document.querySelector(".payments-outstanding")?.textContent).toBe("£59.00")
    expect(screen.getAllByText("Outstanding")).toHaveLength(1)
  })

  it("does not turn a failed or unconfirmed payment into an outstanding balance", () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({ obligations: [obligation({ state: "FAILED" })] })],
    })]} />)
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(screen.getByRole("heading", { name: "Payment was not completed" })).toBeTruthy()
    expect(screen.queryByText("Outstanding")).toBeNull()
    expect(screen.getByText("No payment recorded yet.")).toBeTruthy()
    cleanup()

    render(<PaymentsView focused cases={[item({
      orders: [order({ obligations: [obligation({ state: "COLLECTING" })] })],
    })]} />)
    expect(screen.getByRole("heading", { name: "Payment pending" })).toBeTruthy()
    expect(screen.getByText("We're confirming this payment. It is not marked paid.")).toBeTruthy()
    expect(screen.queryByText("Outstanding")).toBeNull()
    expect(orderTotal().textContent).toBe("£99.00")
  })

  it("labels a void obligation as void and leaves the order total unchanged", () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({ obligations: [obligation({ state: "VOID" })] })],
      actions: [],
    })]} />)
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(screen.getByRole("heading", { name: "Void" })).toBeTruthy()
    expect(screen.queryByText("Outstanding")).toBeNull()
    expect(screen.getByText("No payment was recorded.")).toBeTruthy()
  })

  it("does not show an outstanding balance for a Managed success fee that has not been earned", () => {
    render(<PaymentsView focused cases={[item({
      serviceTrack: "MANAGED",
      orders: [order({
        paymentModel: "SUCCESS_FEE",
        obligations: [],
        receipts: [],
      })],
      actions: [],
    })]} />)
    expect(orderTotal().textContent).toBe("£99.00")
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(screen.queryByText("Outstanding")).toBeNull()
    expect(screen.getByText("No payment was recorded.")).toBeTruthy()
    expect(screen.getByText(/invoiced only after documented success/)).toBeTruthy()
  })

  it("lists every receipt and does not replace them with one inferred balance", () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({
        obligations: [obligation({ state: "PAID" })],
        receipts: [receipt(5000, "11"), receipt(4900, "22")],
      })],
      actions: [],
    })]} />)
    expect(screen.getByText(/Paid £50\.00/)).toBeTruthy()
    expect(screen.getByText(/Paid £49\.00/)).toBeTruthy()
    expect(screen.queryByText("Outstanding")).toBeNull()
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(document.body.textContent).not.toContain("£1.00")
  })

  it("shows no outstanding figure when nothing is payable and nothing has been paid", () => {
    render(<PaymentsView focused cases={[item({
      orders: [order({ obligations: [], receipts: [] })],
      actions: [],
    })]} />)
    expect(orderTotal().previousElementSibling?.textContent).toBe("Order total")
    expect(screen.queryByText("Outstanding")).toBeNull()
    expect(screen.queryByText(/Paid £/)).toBeNull()
    expect(screen.getByText("No payment was recorded.")).toBeTruthy()
  })
})
