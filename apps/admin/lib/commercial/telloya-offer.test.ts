import { describe, expect, it } from "vitest"
import { formatGbpPence, prepareTelloyaOffer, sendTelloyaOffer, telloyaCataloguePence, telloyaGuardLocationPence, type TelloyaOfferInput } from "./telloya-offer"

function input(overrides: Partial<TelloyaOfferInput> = {}): TelloyaOfferInput {
  const catalogue = telloyaCataloguePence("growth")
  return {
    demoStatus: "COMPLETED",
    businessAuthorityVerified: true,
    exceptionRequested: false,
    planCode: "growth",
    planStatus: "APPROVED",
    planVersionId: "22222222-2222-4222-8222-222222222222",
    amountPence: catalogue?.amountPence ?? null,
    includedMinutes: catalogue?.includedMinutes ?? null,
    guardLocations: 2,
    voiceLocations: 1,
    phoneNumbers: 1,
    overageOptIn: false,
    overageCapPence: null,
    fixture: false,
    ...overrides,
  }
}

describe("Telloya offer composer", () => {
  it("prices an approved Growth plan with two Guard locations at £98.98", () => {
    const prepared = prepareTelloyaOffer([], input())
    expect(prepared.result).toBe("draft")
    expect(prepared.versions[0]).toMatchObject({
      planAmountPence: 7900,
      includedMinutes: 300,
      guardLocations: 2,
      guardAmountPence: 1998,
      monthlyTotalPence: 9898,
      voiceLocations: 1,
      phoneNumbers: 1,
      overageOptIn: false,
      currency: "GBP",
      cadence: "MONTH",
    })
    expect(formatGbpPence(9898)).toBe("£98.98")
    expect(telloyaGuardLocationPence).toBe(999)
    expect(prepareTelloyaOffer(prepared.versions, input()).result).toBe("duplicate")
  })

  it("keeps Basic, Pro and Custom on the approved catalogue", () => {
    expect(telloyaCataloguePence("basic")).toEqual({ amountPence: 4900, includedMinutes: 120 })
    expect(telloyaCataloguePence("pro")).toEqual({ amountPence: 12000, includedMinutes: 500 })
    expect(prepareTelloyaOffer([], input({ planCode: "custom", amountPence: null, includedMinutes: null })).result).toBe("custom_requires_owner_approval")
    const custom = prepareTelloyaOffer([], input({ planCode: "custom", amountPence: 25000, includedMinutes: 1000, voiceLocations: 2, phoneNumbers: 2 }))
    expect(custom.result).toBe("draft")
    expect(custom.versions[0].monthlyTotalPence).toBe(26998)
  })

  it("does not let an exception, a missing demonstration, or an extra standard location through", () => {
    expect(prepareTelloyaOffer([], input({ demoStatus: "BOOKED" })).result).toBe("demonstration_not_completed")
    expect(prepareTelloyaOffer([], input({ exceptionRequested: true, demoStatus: "NOT_BOOKED" })).result).toBe("requires_owner_decision")
    expect(prepareTelloyaOffer([], input({ voiceLocations: 2 })).result).toBe("standard_tier_location_limit")
    expect(prepareTelloyaOffer([], input({ overageOptIn: true, overageCapPence: null })).result).toBe("overage_cap_required")
    const capped = prepareTelloyaOffer([], input({ overageOptIn: true, overageCapPence: 4000 }))
    expect(capped.versions[0].monthlyTotalPence).toBe(9898)
    expect(capped.versions[0].overageCapPence).toBe(4000)
  })

  it("keeps a test fixture and an unapproved agreement from being sent", () => {
    const preview = prepareTelloyaOffer([], input({ fixture: true, planStatus: "MISSING", planVersionId: null, demoStatus: "NOT_BOOKED", businessAuthorityVerified: false }))
    expect(preview.result).toBe("preview")
    expect(preview.versions[0].fixture).toBe(true)
    expect(preview.versions[0].blockers).toContain("test_only_fixture")
    expect(sendTelloyaOffer(preview.versions, { agreementStatus: "APPROVED", taxApproval: "APPROVED" }).result).toBe("send_closed")
    const draft = prepareTelloyaOffer([], input())
    expect(sendTelloyaOffer(draft.versions, { agreementStatus: "DRAFT", taxApproval: "UNAPPROVED" }).result).toBe("legal_or_tax_unapproved")
    expect(sendTelloyaOffer(draft.versions, { agreementStatus: "APPROVED", taxApproval: "APPROVED" }).result).toBe("queued")
  })
})
