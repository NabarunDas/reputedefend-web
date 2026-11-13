import { describe, expect, it } from "vitest"
import { parseTelloyaOfferDraftCommand } from "./telloya-offer-draft-command"

const enquiryId = "21affacc-2e97-4b9a-992d-9f0644ab7115"
const locationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

describe("parseTelloyaOfferDraftCommand", () => {
  it("accepts a Growth draft with proposed Guard quantity and overage policy", () => {
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "growth",
      customAmountPence: null,
      customIncludedMinutes: null,
      customRequirements: "",
      proposedGuardQuantity: 2,
      guardLocationIds: [],
      overageOptIn: true,
      overageCapPence: 4000,
      notes: "Owner prefers Growth with two Guard sites.",
    })).toEqual({
      enquiryId,
      expectedVersion: 0,
      planTier: "growth",
      customAmountPence: null,
      customIncludedMinutes: null,
      customRequirements: "",
      proposedGuardQuantity: 2,
      guardLocationIds: [],
      overageOptIn: true,
      overageCapPence: 4000,
      notes: "Owner prefers Growth with two Guard sites.",
    })
  })

  it("requires a positive Custom amount and clears Custom fields for standard tiers", () => {
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "custom",
      customAmountPence: 15000,
      customIncludedMinutes: 800,
      customRequirements: "Two numbers",
      proposedGuardQuantity: 2,
      guardLocationIds: [],
      overageOptIn: false,
      overageCapPence: null,
      notes: "",
    })).toMatchObject({
      planTier: "custom",
      customAmountPence: 15000,
      customIncludedMinutes: 800,
      customRequirements: "Two numbers",
    })
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "custom",
      customAmountPence: null,
      proposedGuardQuantity: 0,
      guardLocationIds: [],
      overageOptIn: false,
      notes: "",
    })).toBeNull()
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "custom",
      customAmountPence: 0,
      proposedGuardQuantity: 0,
      guardLocationIds: [],
      overageOptIn: false,
      notes: "",
    })).toBeNull()
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "basic",
      customAmountPence: 15000,
      proposedGuardQuantity: 0,
      guardLocationIds: [],
      overageOptIn: false,
      notes: "",
    })).toBeNull()
  })

  it("accepts confirmed Guard location ids and rejects malformed payloads", () => {
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 1,
      planTier: "basic",
      proposedGuardQuantity: 0,
      guardLocationIds: [locationId],
      overageOptIn: false,
      overageCapPence: null,
      notes: "",
    })?.guardLocationIds).toEqual([locationId])
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "enterprise",
      proposedGuardQuantity: 1,
      guardLocationIds: [],
      overageOptIn: false,
      notes: "",
    })).toBeNull()
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: -1,
      planTier: "growth",
      proposedGuardQuantity: 1,
      guardLocationIds: [],
      overageOptIn: false,
      notes: "",
    })).toBeNull()
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "growth",
      proposedGuardQuantity: 51,
      guardLocationIds: [],
      overageOptIn: false,
      notes: "",
    })).toBeNull()
    expect(parseTelloyaOfferDraftCommand({
      enquiryId,
      expectedVersion: 0,
      planTier: "growth",
      proposedGuardQuantity: 1,
      guardLocationIds: ["not-a-uuid"],
      overageOptIn: false,
      notes: "",
    })).toBeNull()
  })
})
