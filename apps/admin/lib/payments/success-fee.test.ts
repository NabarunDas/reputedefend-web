import { describe, expect, it } from "vitest"
import { isQualifyingSuccessFeeOutcome } from "./success-fee"

describe("qualifying success-fee outcome", () => {
  it("accepts a restored Profile Recovery and a removed Review Protection", () => {
    expect(isQualifyingSuccessFeeOutcome("PROFILE_RECOVERY", "RESTORED")).toBe(true)
    expect(isQualifyingSuccessFeeOutcome("REVIEW_PROTECTION", "REMOVED")).toBe(true)
  })

  it("rejects every other outcome, including no outcome", () => {
    for (const outcome of [null, undefined, "", "PARTIALLY_RESTORED", "NOT_RESTORED", "NOT_REMOVED", "RESPONSE_RECOMMENDED", "WITHDRAWN", "REMOVED"]) {
      expect(isQualifyingSuccessFeeOutcome("PROFILE_RECOVERY", outcome)).toBe(outcome === "RESTORED")
    }
    for (const outcome of [null, "RESTORED", "NOT_REMOVED", "RESPONSE_RECOMMENDED", "WITHDRAWN"]) {
      expect(isQualifyingSuccessFeeOutcome("REVIEW_PROTECTION", outcome)).toBe(false)
    }
    expect(isQualifyingSuccessFeeOutcome("REVIEW_PROTECTION", "REMOVED")).toBe(true)
    expect(isQualifyingSuccessFeeOutcome(null, "RESTORED")).toBe(false)
    expect(isQualifyingSuccessFeeOutcome("GUIDED", "RESTORED")).toBe(false)
  })
})
