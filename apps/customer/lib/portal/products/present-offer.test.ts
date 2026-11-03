import { afterEach, describe, expect, it, vi } from "vitest"
import type { OnboardingRequestView } from "@/lib/portal/onboarding/types"
import { presentProducts } from "./present"

afterEach(() => vi.unstubAllEnvs())

function request(overrides: Partial<OnboardingRequestView> = {}): OnboardingRequestView {
  return {
    product: "Telloya",
    stage: "offer_preparation",
    statusLabel: "Offer prepared",
    waitingFor: "you",
    customerActionRequired: true,
    businessName: "Harbour Bakery",
    locations: ["High Street"],
    completed: ["Offer recorded"],
    nextStep: "Review the offer.",
    receivedAt: "2026-11-01T09:00:00.000Z",
    updatedAt: "2026-11-01T09:30:00.000Z",
    offerRef: "VC-26-AB2347",
    offerState: "eligible",
    ...overrides,
  }
}

describe("My Products offer links", () => {
  it("shows a review link only for an eligible offer when the read is enabled", () => {
    const sources = {
      recovery: {
        status: "ready" as const,
        dashboard: {
          summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
          attentionCases: [],
          recentCases: [],
        },
      },
      guard: { status: "ready" as const, locations: [] },
      onboarding: { status: "ready" as const, requests: [request(), request({
        product: "Complete" as const,
        businessName: "North Yard",
        offerRef: "VC-26-CD5678",
        offerState: "accepted" as const,
        receivedAt: "2026-11-02T09:00:00.000Z",
      })] },
    }
    const closed = presentProducts(sources)
    expect(closed[2].actions.map(action => action.label)).not.toContain("Review Telloya offer for Harbour Bakery")

    vi.stubEnv("CUSTOMER_COMMERCIAL_OFFER_READ_ENABLED", "true")
    const open = presentProducts(sources)
    expect(open[2].actions).toEqual(expect.arrayContaining([
      { label: "Review Telloya offer for Harbour Bakery", href: "/portal/onboarding/offer/VC-26-AB2347" },
      { label: "View accepted Complete offer for North Yard", href: "/portal/onboarding/offer/VC-26-CD5678" },
    ]))
    expect(open[0].actions.map(action => action.href).join(" ")).not.toContain("/portal/onboarding/offer/")
  })
})
