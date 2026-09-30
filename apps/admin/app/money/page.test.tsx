// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

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
    expect(screen.queryByRole("button", { name: /mark paid|force success|charge/i })).toBeNull()
  })

  it("requires accepted outcome evidence for success-fee approval", async () => {
    render(await MoneyPage())
    expect(screen.getByRole("combobox", { name: /accepted outcome evidence/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /outcome.png/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve success fee" })).toBeInTheDocument()
  })
})
