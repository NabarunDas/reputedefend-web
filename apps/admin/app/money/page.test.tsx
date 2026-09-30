// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
    }],
  }),
}))

import MoneyPage from "./page"

describe("money workspace", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  })

  it("shows obligation state and no mark-paid control", async () => {
    render(await MoneyPage())
    expect(screen.getByRole("heading", { name: "Money" })).toBeInTheDocument()
    expect(screen.getByText("SO-26-ABCDE2")).toBeInTheDocument()
    expect(screen.getByText("Due")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Issue upfront payment action" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mark paid|force success|charge/i })).toBeNull()
  })
})
