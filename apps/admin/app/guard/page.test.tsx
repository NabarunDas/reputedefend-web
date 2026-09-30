// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

vi.mock("@/lib/guard/queries", () => ({
  loadGuard: async () => ({
    requests: [{
      id: "11111111-1111-4111-8111-111111111111",
      status: "REQUESTED",
      numberOfLocations: 10,
      customerId: "22222222-2222-4222-8222-222222222222",
      businessId: "33333333-3333-4333-8333-333333333333",
      locationId: "44444444-4444-4444-8444-444444444444",
      customerName: "Alex",
      businessName: "Bakery",
      locationName: "High Street",
      identifiedCount: 1,
      stillRequired: 9,
      createdAt: "2026-09-01T12:00:00.000Z",
      mappings: [{
        id: "55555555-5555-4555-8555-555555555555",
        locationId: "44444444-4444-4444-8444-444444444444",
        locationName: "High Street",
        source: "INTAKE_PRIMARY",
        status: "IDENTIFIED",
        ordinal: 1,
        version: 1,
      }],
    }],
    coverages: [{
      id: "66666666-6666-4666-8666-666666666666",
      state: "AWAITING_PAYMENT",
      coverageBasis: "DIRECT_GUARD",
      coverageOrigin: "DIRECT_GUARD",
      customerId: "22222222-2222-4222-8222-222222222222",
      businessId: "33333333-3333-4333-8333-333333333333",
      locationId: "44444444-4444-4444-8444-444444444444",
      customerName: "Alex",
      businessName: "Bakery",
      locationName: "High Street",
      version: 3,
      billingState: "PENDING",
      entitlementSource: "NONE",
      readiness: {
        mappingReady: true,
        businessMembershipReady: true,
        permissionReady: true,
        accessReady: true,
        contactReady: true,
        baselineReady: true,
        rotaReady: true,
        commercialOrderReady: true,
        billingReady: false,
        includedEligibilityReady: true,
        includedChoiceReady: true,
        readyToActivate: false,
        blockerCodes: ["BILLING_NOT_CURRENT"],
      },
    }],
    guardOrders: [],
    locations: [],
  }),
}))

import GuardPage from "./page"

describe("guard workspace", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  })
  afterEach(() => {
    cleanup()
  })

  it("shows requested versus identified counts and no mark-paid control", async () => {
    render(await GuardPage())
    expect(screen.getByRole("heading", { name: "Guard" })).toBeInTheDocument()
    expect(screen.getByText("10 requested / 1 identified / 9 still required")).toBeInTheDocument()
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument()
    expect(screen.getByText("Pending")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Activate Guard" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mark paid|mark guard paid|set current/i })).toBeNull()
    expect(screen.queryByRole("combobox", { name: /coverage state/i })).toBeNull()
  })
})
