// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CustomerPayments } from "@/lib/portal/payments/parse"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const loadCustomerPayments = vi.fn()
vi.mock("@/lib/portal/payments/queries", () => ({
  loadCustomerPayments: (...args: unknown[]) => loadCustomerPayments(...args),
}))

const portalCookie = vi.hoisted(() => ({ value: "" }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => portalCookie.value ? { value: portalCookie.value } : undefined }),
}))

import PaymentReturnPage from "./page"
import { resumeSameOrigin } from "./resume"

const selector = `rc-${"ab".repeat(32)}`

function payments(state: "DUE" | "PAID" | "FAILED"): CustomerPayments {
  return {
    cases: [{
      reference: "PR-26-GHNLB9",
      businessName: "Harbour Bakery",
      locationName: "High Street",
      serviceTrack: "GUIDED",
      orders: [{
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
          state,
          amountMinor: 9900,
          currency: "GBP",
          taxBehaviour: "NOT_APPLICABLE",
          taxAmountMinor: 0,
          invoice: null,
        }],
        receipts: state === "PAID" ? [{
          selector,
          amountMinor: 9900,
          currency: "GBP",
          taxBehaviour: "NOT_APPLICABLE",
          taxAmountMinor: 0,
          paidAt: "2026-10-26T16:40:00.000Z",
        }] : [],
      }],
      actions: [],
    }],
  }
}

afterEach(() => cleanup())
beforeEach(() => {
  refresh.mockReset()
  loadCustomerPayments.mockReset()
  portalCookie.value = ""
})

describe("payment return page", () => {
  it("hops once on our origin before reading a Strict portal cookie", async () => {
    loadCustomerPayments.mockResolvedValue({ status: "unauthenticated" })
    expect(PaymentReturnPage.length).toBe(0)
    render(await PaymentReturnPage({ searchParams: Promise.resolve({ order: "SO-26-GHHRGY" }) }))
    expect(screen.getByRole("heading", { name: "Payment is being confirmed" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/pay/return?order=SO-26-GHHRGY&resume=1")
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull()
    expect(loadCustomerPayments).not.toHaveBeenCalled()
    const navigated: string[] = []
    resumeSameOrigin("/pay/return?order=SO-26-GHHRGY&resume=1", next => { navigated.push(next) })
    resumeSameOrigin("https://evil.example/pay/return?resume=1", next => { navigated.push(next) })
    resumeSameOrigin("/pay/return?resume=1&token=secret", next => { navigated.push(next) })
    expect(navigated).toEqual(["/pay/return?order=SO-26-GHHRGY&resume=1"])
    expect(document.body.textContent).toMatch(/Continuing to your payment status/)
    expect(document.body.textContent).not.toMatch(/£|SO-|PR-|Guard|pi_|cs_|payment successful/i)
    expect(document.body.innerHTML).not.toMatch(/checkout\.stripe|invoice\.stripe|javascript:|pr-portal|__Host-pr-portal/)
  })

  it("shows a signed-out visitor generic copy after the same-origin hop", async () => {
    loadCustomerPayments.mockResolvedValue({ status: "unauthenticated" })
    render(await PaymentReturnPage({ searchParams: Promise.resolve({ order: "SO-26-GHHRGY", resume: "1" }) }))
    expect(screen.getByRole("heading", { name: "Payment is being confirmed" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    expect(screen.queryByRole("link", { name: "Continue" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull()
    expect(document.body.textContent).toMatch(/Sign in to see whether your payment has been recorded/)
    expect(document.body.textContent).not.toMatch(/does not mark a payment as paid/)
    expect(document.body.textContent).not.toMatch(/£|SO-|PR-|Guard|pi_|cs_|payment successful/i)
    expect(document.body.innerHTML).not.toMatch(/checkout\.stripe|invoice\.stripe|javascript:/)
  })

  it("keeps an expired portal cookie on the sign-in screen", async () => {
    portalCookie.value = "a".repeat(64)
    loadCustomerPayments.mockResolvedValue({ status: "unauthenticated" })
    render(await PaymentReturnPage({ searchParams: Promise.resolve({ order: "SO-26-GHHRGY" }) }))
    expect(loadCustomerPayments).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("link", { name: "Continue" })).toBeNull()
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    expect(document.body.textContent).not.toMatch(/£|SO-|PR-|payment successful/i)
  })

  it("rejects another customer's return without showing that order", async () => {
    portalCookie.value = "b".repeat(64)
    loadCustomerPayments.mockResolvedValue({ status: "ready", payments: payments("PAID") })
    render(await PaymentReturnPage({ searchParams: Promise.resolve({ order: "SO-26-UB4VUQ" }) }))
    expect(screen.getByRole("heading", { name: "Payment is being confirmed" })).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/could not find a payment on your account/)
    expect(document.body.textContent).not.toMatch(/SO-26-UB4VUQ|SO-26-GHHRGY|£99|PR-26-GHNLB9|payment successful/i)
    expect(screen.queryByRole("link", { name: "View your receipt" })).toBeNull()
  })

  it("shows the confirmed Guided payment, receipt and pack next step", async () => {
    portalCookie.value = "a".repeat(64)
    loadCustomerPayments.mockResolvedValue({ status: "ready", payments: payments("PAID") })
    render(await PaymentReturnPage({ searchParams: Promise.resolve({ order: "SO-26-GHHRGY" }) }))
    expect(screen.getByRole("heading", { name: "Payment received" })).toBeInTheDocument()
    expect(document.body.textContent).toContain("Guided Relaunch")
    expect(document.body.textContent).toContain("£99.00")
    expect(document.body.textContent).toContain("SO-26-GHHRGY")
    expect(document.body.textContent).toContain("16:40")
    expect(document.body.textContent).toContain("UK")
    expect(document.body.textContent).toMatch(/one-time/)
    expect(document.body.textContent).toMatch(/not a VAT invoice/)
    expect(document.body.textContent).toMatch(/prepare your Guided pack/)
    expect(document.body.textContent).toMatch(/does not mean Google has reinstated/)
    expect(screen.getByRole("link", { name: "View your receipt" })).toHaveAttribute(
      "href",
      `/portal/payments/receipt?selector=${selector}`,
    )
    expect(screen.getByRole("link", { name: "Open your case" })).toHaveAttribute("href", "/portal/cases/PR-26-GHNLB9")
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Guard|pi_|cs_|payment successful/i)
    expect(document.body.innerHTML).not.toMatch(/checkout\.stripe|invoice\.stripe|javascript:/)
  })

  it("refreshes a pending confirmation without starting another charge", async () => {
    portalCookie.value = "a".repeat(64)
    loadCustomerPayments.mockResolvedValue({ status: "ready", payments: payments("DUE") })
    render(await PaymentReturnPage({ searchParams: Promise.resolve({ order: "SO-26-GHHRGY" }) }))
    expect(screen.getByRole("heading", { name: "Payment is being confirmed" })).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/do not need to pay again/)
    expect(document.body.textContent).not.toMatch(/does not mark a payment as paid/)
    expect(document.body.textContent).toMatch(/will not be charged again/)
    expect(document.body.textContent).not.toMatch(/Guard|payment successful/i)
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
