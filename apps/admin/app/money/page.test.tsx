// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

vi.mock("@/lib/guard/queries", () => ({
  loadGuard: async () => ({
    requests: [],
    coverages: [],
    guardOrders: [],
    locations: [],
    subscriptions: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      locationId: "44444444-4444-4444-8444-444444444444",
      customerId: "22222222-2222-4222-8222-222222222222",
      businessId: "33333333-3333-4333-8333-333333333333",
      serviceOrderId: "55555555-5555-4555-8555-555555555555",
      locationName: "High Street",
      customerName: "Alex",
      businessName: "Bakery",
      lifecycleState: "ACTIVE",
      providerStatus: "active",
      amountMinor: 999,
      currency: "GBP",
      billingState: "CURRENT",
      paidThroughAt: "2026-10-30T00:00:00.000Z",
      version: 1,
    }],
    continuations: [],
    reminders: [],
    adjustments: [],
  }),
}))
vi.mock("@/lib/payments/success-fee-cases", () => ({
  loadSuccessFeeCaseOutcomes: async () => new Map([
    ["55555555-5555-4555-8555-555555555555", { caseType: "PROFILE_RECOVERY", outcome: "RESTORED" }],
    ["66666666-6666-4666-8666-666666666666", { caseType: "PROFILE_RECOVERY", outcome: null }],
  ]),
}))
vi.mock("@/lib/payments/queries", () => ({
  loadMoney: async () => ({
    orders: [{
      orderId: "55555555-5555-4555-8555-555555555555",
      orderRef: "SO-26-ABCDE2",
      customerId: "22222222-2222-4222-8222-222222222222",
      caseId: "55555555-5555-4555-8555-555555555555",
      serviceCode: "GUIDED_RELAUNCH",
      amountMinor: 9900,
      currency: "GBP",
      paymentModel: "UPFRONT",
      orderState: "ACCEPTED_AWAITING_PAYMENT",
      version: 1,
      obligationId: "66666666-6666-4666-8666-666666666666",
      obligationKind: "UPFRONT",
      obligationState: "DUE",
      setupReady: false,
      consentId: null,
      approvalId: null,
      receiptId: null,
      acceptedEvidence: [],
    }, {
      orderId: "77777777-7777-4777-8777-777777777777",
      orderRef: "SO-26-MANAGE",
      customerId: "22222222-2222-4222-8222-222222222222",
      caseId: "55555555-5555-4555-8555-555555555555",
      serviceCode: "MANAGED_RELAUNCH",
      amountMinor: 29900,
      currency: "GBP",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      version: 1,
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "88888888-8888-4888-8888-888888888888",
      approvalId: null,
      receiptId: null,
      acceptedEvidence: [{ id: "99999999-9999-4999-8999-999999999999", filename: "outcome.png", versionNumber: 1 }],
    }, {
      orderId: "88888888-8888-4888-8888-888888888888",
      orderRef: "SO-26-EARLY",
      customerId: "22222222-2222-4222-8222-222222222222",
      caseId: "66666666-6666-4666-8666-666666666666",
      serviceCode: "MANAGED_RELAUNCH",
      amountMinor: 29900,
      currency: "GBP",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      version: 1,
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "88888888-8888-4888-8888-888888888888",
      approvalId: null,
      receiptId: null,
      acceptedEvidence: [{ id: "99999999-9999-4999-8999-999999999999", filename: "early.png", versionNumber: 1 }],
    }],
  }),
}))

import MoneyPage from "./page"

describe("money workspace", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  })
  afterEach(() => {
    cleanup()
  })

  it("shows obligation state and no mark-paid control", async () => {
    render(await MoneyPage())
    expect(screen.getByRole("heading", { name: "Money" })).toBeInTheDocument()
    expect(screen.getByText("SO-26-ABCDE2")).toBeInTheDocument()
    expect(screen.getByText("Due")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Issue upfront payment action" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Issue TEST-MODE hosted invoice fallback" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mark paid|force success|charge/i })).toBeNull()
    expect(screen.getByRole("heading", { name: "Guard subscriptions" })).toBeInTheDocument()
    expect(screen.getByText("High Street")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mark refunded|override paid-through|cancel all/i })).toBeNull()
  })

  it("requires accepted outcome evidence for success-fee approval", async () => {
    render(await MoneyPage())
    expect(screen.getByRole("combobox", { name: /accepted outcome evidence/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /outcome.png/ })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Approve success fee" })).toHaveLength(1)
  })

  it("does not offer success-fee approval before a qualifying outcome", async () => {
    render(await MoneyPage())
    expect(screen.getByText("SO-26-EARLY")).toBeInTheDocument()
    expect(screen.getByText(/Success-fee approval is not due yet/)).toBeInTheDocument()
    const links = screen.getAllByRole("link", { name: "Open case commercial and money" }).map(link => link.getAttribute("href"))
    expect(links).toEqual([
      "/cases/55555555-5555-4555-8555-555555555555/commercial",
      "/cases/55555555-5555-4555-8555-555555555555/commercial",
      "/cases/66666666-6666-4666-8666-666666666666/commercial",
    ])
  })
})
