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
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh }),
}))

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
      ["DUE", "Payment required", "Continue to secure checkout"],
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
    expect(screen.queryByRole("link", { name: /Relaunch Guard|Account/ })).toBeNull()
  })

  it("shows managed consent and a saved-method state without card data", () => {
    render(<PaymentsView focused cases={[item({
      serviceTrack: "MANAGED",
      orders: [order({
        paymentModel: "SUCCESS_FEE",
        paymentMethodSaved: true,
        consent: { recorded: true, text: consent },
        obligations: [],
      })],
      actions: [],
    })]} />)
    expect(screen.getByRole("heading", { name: "Managed service payment" })).toBeTruthy()
    expect(screen.getByText("A payment method is saved for this managed service.")).toBeTruthy()
    expect(screen.getByText("Consent is recorded.")).toBeTruthy()
    expect(screen.getByText(consent)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/last4|4242|pm_|brand/i)
  })

  it("keeps a repeated checkout click on one idempotency key and does not mark the page paid", async () => {
    let release: (value: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise(resolve => { release = resolve }))
    render(<PaymentsView focused cases={[item()]} />)
    const button = screen.getByRole("button", { name: "Continue to secure checkout" })
    fireEvent.submit(button.closest("form")!)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.submit(button.closest("form")!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstKey = fetchMock.mock.calls[0][1].headers["idempotency-key"]
    release({ ok: false, status: 503, json: async () => ({ status: "disabled", message: "Secure Stripe Checkout is not available yet." }) })
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Secure Stripe Checkout is not available yet."))
    expect(screen.getByRole("heading", { name: "Payment required" })).toBeTruthy()
    expect(screen.queryByText(/payment successful/i)).toBeNull()
    fireEvent.submit(screen.getByRole("button", { name: "Continue to secure checkout" }).closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][1].headers["idempotency-key"]).toBe(firstKey)
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
})
