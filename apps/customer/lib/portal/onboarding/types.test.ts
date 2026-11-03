import { describe, expect, it } from "vitest"
import { parseOnboardingStatus } from "./types"

const row = {
  product: "Telloya",
  stage: "under_review",
  statusLabel: "Request in progress",
  waitingFor: "us",
  customerActionRequired: false,
  businessName: "Harbour Bakery",
  locations: ["High Street"],
  completed: ["Request received"],
  nextStep: "We are reviewing this request.",
  receivedAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-01T09:30:00.000Z",
  offerRef: null,
  offerState: null,
}

describe("onboarding progress parser", () => {
  it("keeps the allowlisted display fields and drops a leaked identifier", () => {
    expect(parseOnboardingStatus({ requests: [row] })?.requests).toHaveLength(1)
    expect(parseOnboardingStatus({ requests: [] })).toEqual({ requests: [] })
    expect(parseOnboardingStatus({ requests: [{ ...row, stripeSubscriptionId: "sub_secret" }] })).toBeNull()
    expect(parseOnboardingStatus({ requests: [row], customerId: "a020d000-0000-4000-8000-0000000000a1" })).toBeNull()
    expect(parseOnboardingStatus({
      requests: [{ ...row, nextStep: "Use cus_secret to pay." }],
    })).toBeNull()
    expect(parseOnboardingStatus(null)).toBeNull()
    expect(parseOnboardingStatus({
      requests: [{ ...row, offerRef: "VC-26-AB2347", offerState: "eligible" }],
    })?.requests[0].offerState).toBe("eligible")
    expect(parseOnboardingStatus({
      requests: [{ ...row, offerRef: "VC-26-AB2347", offerState: null }],
    })).toBeNull()
    expect(parseOnboardingStatus({
      requests: [{ ...row, offerRef: null, offerState: "accepted" }],
    })).toBeNull()
    expect(parseOnboardingStatus({
      requests: [{ ...row, offerRef: "sub_secret", offerState: "eligible" }],
    })).toBeNull()
  })
})
