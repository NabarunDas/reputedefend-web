import { describe, expect, it } from "vitest"
import {
  draftChecklist,
  emptyTelloyaOfferDraft,
  estimateTelloyaDraft,
  guardQuantityForDraft,
  mapDraftTierToApprovedPlan,
  parseTelloyaDraftPlanTier,
} from "./telloya-offer-draft"
import { telloyaGuardLocationPence } from "./telloya-offer"

describe("Telloya offer draft calculator", () => {
  it("starts with no plan and no Guard charge", () => {
    const empty = estimateTelloyaDraft({ planTier: null, proposedGuardQuantity: 0 })
    expect(empty.totalLabel).toBe("Choose a plan")
    expect(empty.monthlyTotalPence).toBeNull()
    expect(empty.summaryLines[0]).toContain("Choose a Telloya plan")
  })

  it("prices Growth with two proposed Guard locations at £98.98 using canonical pence", () => {
    const estimate = estimateTelloyaDraft({ planTier: "growth", proposedGuardQuantity: 2 })
    expect(estimate.planAmountPence).toBe(7900)
    expect(estimate.includedMinutes).toBe(300)
    expect(estimate.guardUnitPence).toBe(telloyaGuardLocationPence)
    expect(estimate.guardAmountPence).toBe(1998)
    expect(estimate.monthlyTotalPence).toBe(9898)
    expect(estimate.totalLabel).toBe("£98.98 / month")
    expect(estimate.quotationRequired).toBe(false)
  })

  it("keeps Basic, Pro and Custom on the marketing catalogue", () => {
    expect(estimateTelloyaDraft({ planTier: "basic", proposedGuardQuantity: 0 }).monthlyTotalPence).toBe(4900)
    expect(estimateTelloyaDraft({ planTier: "pro", proposedGuardQuantity: 1 }).monthlyTotalPence).toBe(12999)
    const custom = estimateTelloyaDraft({ planTier: "custom", proposedGuardQuantity: 3 })
    expect(custom.quotationRequired).toBe(true)
    expect(custom.monthlyTotalPence).toBeNull()
    expect(custom.totalLabel).toBe("Quotation required")
  })

  it("treats overage as a proposed offer term, not a fixed monthly fee or customer consent", () => {
    const incomplete = estimateTelloyaDraft({
      planTier: "growth",
      proposedGuardQuantity: 0,
      overageOptIn: true,
      overageCapPence: null,
    })
    expect(incomplete.monthlyTotalPence).toBe(7900)
    expect(incomplete.overageLabel).toContain("Overage proposed")
    expect(incomplete.overageLabel).toContain("still not customer consent")
    const estimate = estimateTelloyaDraft({
      planTier: "growth",
      proposedGuardQuantity: 0,
      overageOptIn: true,
      overageCapPence: 4000,
    })
    expect(estimate.monthlyTotalPence).toBe(7900)
    expect(estimate.overageLabel).toContain("£0.25/min")
    expect(estimate.overageLabel).toContain("£40.00")
    expect(estimate.overageLabel).toContain("subject to customer opt-in")
    expect(estimateTelloyaDraft({
      planTier: "growth",
      proposedGuardQuantity: 0,
      overageOptIn: false,
    }).summaryLines.some(line => line.includes("Overage not proposed"))).toBe(true)
  })

  it("rejects malformed plan tiers and clamps Guard quantity", () => {
    expect(parseTelloyaDraftPlanTier("GROWTH")).toBe("growth")
    expect(parseTelloyaDraftPlanTier("enterprise")).toBeNull()
    expect(estimateTelloyaDraft({ planTier: "growth", proposedGuardQuantity: -3 }).proposedGuardQuantity).toBe(0)
    expect(estimateTelloyaDraft({ planTier: "growth", proposedGuardQuantity: 99 }).proposedGuardQuantity).toBe(50)
    expect(emptyTelloyaOfferDraft("growth").planTier).toBe("growth")
  })

  it("prefers confirmed Guard location ids over a proposed quantity", () => {
    expect(guardQuantityForDraft({
      proposedGuardQuantity: 4,
      guardLocationIds: ["a", "b"],
      confirmedLocationCount: 2,
    })).toBe(2)
  })

  it("maps a draft tier onto an offerable approved plan and builds the send checklist", () => {
    const plans = [
      { tierCode: "BASIC", offerable: true },
      { tierCode: "GROWTH", offerable: true },
      { tierCode: "PRO", offerable: false },
    ]
    expect(mapDraftTierToApprovedPlan(plans, "growth")).toEqual({ tierCode: "GROWTH", offerable: true })
    expect(mapDraftTierToApprovedPlan(plans, "custom")).toBeNull()
    expect(draftChecklist({
      termsConfigured: false,
      offerablePlans: 0,
      membershipVerified: false,
      selectedLocations: 0,
      offerReady: false,
    }).every(item => item.ready === false)).toBe(true)
  })
})
