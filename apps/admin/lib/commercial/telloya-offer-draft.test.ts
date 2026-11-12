import { describe, expect, it } from "vitest"
import {
  draftChecklist,
  draftSaveReady,
  draftSelectionsEqual,
  emptyTelloyaOfferDraft,
  estimateTelloyaDraft,
  guardQuantityForDraft,
  mapDraftTierToApprovedPlan,
  parseCustomAmountGbpInput,
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

  it("keeps Basic and Pro on the marketing catalogue and prices Custom from an entered amount", () => {
    expect(estimateTelloyaDraft({ planTier: "basic", proposedGuardQuantity: 0 }).monthlyTotalPence).toBe(4900)
    expect(estimateTelloyaDraft({ planTier: "pro", proposedGuardQuantity: 1 }).monthlyTotalPence).toBe(12999)
    const blankCustom = estimateTelloyaDraft({ planTier: "custom", proposedGuardQuantity: 3 })
    expect(blankCustom.quotationRequired).toBe(true)
    expect(blankCustom.monthlyTotalPence).toBeNull()
    expect(blankCustom.totalLabel).toBe("Enter Custom amount")
    const custom = estimateTelloyaDraft({
      planTier: "custom",
      customAmountPence: 15000,
      customIncludedMinutes: 800,
      proposedGuardQuantity: 2,
    })
    expect(custom.quotationRequired).toBe(false)
    expect(custom.customApprovalRequired).toBe(true)
    expect(custom.planAmountPence).toBe(15000)
    expect(custom.monthlyTotalPence).toBe(16998)
    expect(custom.totalLabel).toBe("£169.98 / month")
    expect(custom.summaryLines.some(line => /approval is required/i.test(line))).toBe(true)
  })

  it("rejects blank, zero, negative, malformed and overlarge Custom GBP amounts", () => {
    expect(parseCustomAmountGbpInput("")).toBeNull()
    expect(parseCustomAmountGbpInput("0")).toBeNull()
    expect(parseCustomAmountGbpInput("0.00")).toBeNull()
    expect(parseCustomAmountGbpInput("-12.50")).toBeNull()
    expect(parseCustomAmountGbpInput("12.345")).toBeNull()
    expect(parseCustomAmountGbpInput("abc")).toBeNull()
    expect(parseCustomAmountGbpInput("100000.01")).toBeNull()
    expect(parseCustomAmountGbpInput("150.00")).toBe(15000)
    expect(parseCustomAmountGbpInput("9.99")).toBe(999)
    expect(draftSaveReady({
      ...emptyTelloyaOfferDraft("custom"),
      customAmountPence: null,
    })).toBe(false)
    expect(draftSaveReady({
      ...emptyTelloyaOfferDraft("custom"),
      customAmountPence: 15000,
    })).toBe(true)
  })

  it("clears Custom amount when comparing a switched standard selection", () => {
    const custom = {
      ...emptyTelloyaOfferDraft("custom"),
      customAmountPence: 15000,
      customIncludedMinutes: 600,
      customRequirements: "Two numbers",
      version: 1,
    }
    const basic = {
      ...custom,
      planTier: "basic" as const,
      customAmountPence: null,
      customIncludedMinutes: null,
      customRequirements: "",
    }
    expect(draftSelectionsEqual(custom, basic)).toBe(false)
    expect(draftSelectionsEqual(basic, { ...basic, version: 9 })).toBe(true)
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
      { tierCode: "BASIC", offerable: true, amountMinor: 4900, includedMinutes: 120 },
      { tierCode: "GROWTH", offerable: true, amountMinor: 7900, includedMinutes: 300 },
      { tierCode: "PRO", offerable: false, amountMinor: 12000, includedMinutes: 500 },
      { tierCode: "CUSTOM", offerable: true, amountMinor: 15000, includedMinutes: 800 },
    ]
    expect(mapDraftTierToApprovedPlan(plans, "growth")).toEqual(plans[1])
    expect(mapDraftTierToApprovedPlan(plans, "basic")).toEqual(plans[0])
    expect(mapDraftTierToApprovedPlan([
      { tierCode: "GROWTH", offerable: true, amountMinor: 8900, includedMinutes: 250 },
      ...plans,
    ], "growth")).toEqual(plans[1])
    expect(mapDraftTierToApprovedPlan([
      { tierCode: "GROWTH", offerable: true, amountMinor: 8900, includedMinutes: 250 },
    ], "growth")).toBeNull()
    expect(mapDraftTierToApprovedPlan([
      { tierCode: "BASIC", offerable: true, amountMinor: 4900, includedMinutes: 90 },
    ], "basic")).toBeNull()
    expect(mapDraftTierToApprovedPlan(plans, "custom")).toBeNull()
    expect(mapDraftTierToApprovedPlan(plans, "custom", {
      customAmountPence: 15000,
      customIncludedMinutes: 800,
    })).toEqual(plans[3])
    expect(mapDraftTierToApprovedPlan(plans, "custom", {
      customAmountPence: 15000,
      customIncludedMinutes: 700,
    })).toBeNull()
    expect(draftChecklist({
      termsConfigured: false,
      offerablePlans: 0,
      membershipVerified: false,
      selectedLocations: 0,
      offerReady: false,
    }).every(item => item.ready === false)).toBe(true)
  })
})
