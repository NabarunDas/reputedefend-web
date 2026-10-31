import { describe, expect, it } from "vitest"
import { parseCaseDocuments } from "./parse"

const instructions = "You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you."

const found = {
  found: true,
  case: {
    reference: "PR-26-FULF99",
    caseType: "PROFILE_RECOVERY",
    serviceTrack: "GUIDED",
    businessName: "Harbour Bakery",
    locationName: "High Street",
  },
  requests: [],
  submissions: [],
  documents: [],
  pack: {
    title: "Guided Relaunch submission pack",
    serviceName: "Guided Relaunch",
    packNumber: 1,
    instructions,
    instructionSelectors: ["pd-2"],
    customerSubmitted: false,
    correctionRequested: false,
    outcomeReported: false,
    outcomeReviewed: false,
  },
}

describe("guided pack handover parser", () => {
  it("reads a published pack and rejects a payload that omits it", () => {
    const parsed = parseCaseDocuments(found)
    expect(parsed !== "not_found" && parsed ? parsed.pack : null).toMatchObject({
      serviceName: "Guided Relaunch",
      instructions,
      instructionSelectors: ["pd-2"],
    })
    expect(parseCaseDocuments({ found: false })).toBe("not_found")
    const withoutPack = { ...found }
    delete (withoutPack as { pack?: unknown }).pack
    expect(parseCaseDocuments(withoutPack)).toBeNull()
    expect(parseCaseDocuments({
      ...found,
      pack: { ...found.pack, instructions: "ProfileRelaunch will submit this pack to Google." },
    })).toBeNull()
    const { outcomeReported: _reported, outcomeReviewed: _reviewed, ...legacyPack } = found.pack
    const legacy = parseCaseDocuments({ ...found, pack: legacyPack })
    expect(legacy !== "not_found" && legacy ? legacy.pack : null).toMatchObject({
      outcomeReported: false,
      outcomeReviewed: false,
    })
  })
})
