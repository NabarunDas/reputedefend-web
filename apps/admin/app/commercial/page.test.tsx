// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const loadCatalogue = vi.fn()
const loadQuotes = vi.fn()
const loadOrders = vi.fn()
vi.mock("@/lib/commerce/queries", () => ({
  loadCatalogue: (...args: unknown[]) => loadCatalogue(...args),
  loadQuotes: (...args: unknown[]) => loadQuotes(...args),
  loadOrders: (...args: unknown[]) => loadOrders(...args),
}))

import CommercialPage from "./page"

afterEach(() => cleanup())
beforeEach(() => {
  loadCatalogue.mockReset()
  loadQuotes.mockReset()
  loadOrders.mockReset()
})

describe("commercial page", () => {
  it("renders seeded catalogue amounts without payment controls", async () => {
    loadCatalogue.mockResolvedValue({
      prices: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        serviceCode: "MANAGED_RELAUNCH",
        displayName: "Managed Relaunch",
        amountMinor: 29900,
        currency: "GBP",
        paymentModel: "SUCCESS_FEE",
        billingCadence: "ON_SUCCESS",
        billingUnit: "SERVICE",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        status: "APPROVED",
        taxBehaviour: "UNCONFIRMED",
        taxJurisdiction: null,
        taxRateBps: null,
        taxCode: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        approvedAt: "2026-01-01T00:00:00.000Z",
        retiredAt: null,
        version: 1,
        seedKey: "SEED_MANAGED_RELAUNCH",
      }],
    })
    loadQuotes.mockResolvedValue({ quotes: [] })
    const page = await CommercialPage({ searchParams: Promise.resolve({ tab: "catalogue" }) })
    render(page)
    expect(screen.getByText("Managed Relaunch")).toBeTruthy()
    expect(screen.getByText(/£299.00/)).toBeTruthy()
    expect(screen.getByText(/29900 pence/)).toBeTruthy()
    expect(screen.getByText(/Unconfirmed/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /charge|mark paid/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(/STRIPE|PaymentIntent|Checkout/i)
  })

  it("shows read-only orders without charge controls", async () => {
    loadCatalogue.mockResolvedValue({ prices: [] })
    loadQuotes.mockResolvedValue({ quotes: [] })
    loadOrders.mockResolvedValue({
      orders: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        publicRef: "SO-26-ABCDEF",
        quoteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        quoteRef: "QT-26-ABCDEF",
        quoteVersionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        customerName: "Alex",
        businessName: "Bakery",
        caseReference: "PR-26-ABCDEF",
        serviceCode: "GUIDED_RELAUNCH",
        amountMinor: 9900,
        currency: "GBP",
        paymentModel: "UPFRONT",
        taxBehaviour: "NOT_APPLICABLE",
        taxAmountMinor: 0,
        state: "ACCEPTED_AWAITING_PAYMENT",
        acceptedAt: "2026-09-29T12:00:00.000Z",
      }],
    })
    const page = await CommercialPage({ searchParams: Promise.resolve({ tab: "orders" }) })
    render(page)
    expect(screen.getByText("SO-26-ABCDEF")).toBeTruthy()
    expect(screen.getByText(/Accepted — awaiting later payment/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /charge|mark paid/i })).toBeNull()
  })
})
