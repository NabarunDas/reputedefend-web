import { describe, expect, it } from "vitest"
import { successFeeApprovalOffer, type SuccessFeeCaseOutcome } from "./success-fee-offer"

const caseId = "55555555-5555-4555-8555-555555555555"
const evidence = [{ id: "99999999-9999-4999-8999-999999999999", filename: "outcome.png", versionNumber: 1 }]

function order(overrides: Record<string, unknown> = {}) {
  return {
    paymentModel: "SUCCESS_FEE",
    approvalId: null,
    caseId,
    acceptedEvidence: evidence,
    ...overrides,
  }
}

function outcomes(caseType: string, outcome: string | null): Map<string, SuccessFeeCaseOutcome> {
  return new Map([[caseId, { caseType, outcome }]])
}

function message(result: ReturnType<typeof successFeeApprovalOffer>): string {
  return result.kind === "explain" ? result.message : ""
}

describe("success-fee approval on the Money page", () => {
  it("offers approval for a verified Profile Recovery or Review Protection outcome without a saved card", () => {
    expect(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "RESTORED"), true).kind).toBe("approve")
    expect(successFeeApprovalOffer(order(), outcomes("REVIEW_PROTECTION", "REMOVED"), true).kind).toBe("approve")
  })

  it("explains the 48-hour rule when the two observations are not ready", () => {
    const waiting = successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "RESTORED"), false)
    expect(waiting.kind).toBe("explain")
    expect(message(waiting)).toMatch(/48 hours/)
    expect(message(waiting)).toMatch(/saved card is not required/i)
    expect(message(waiting)).not.toMatch(/setup is not complete|later-charge consent|usable payment method/i)
  })

  it("still requires accepted evidence after the outcome and the observations qualify", () => {
    const waiting = successFeeApprovalOffer(order({ acceptedEvidence: [] }), outcomes("PROFILE_RECOVERY", "RESTORED"), true)
    expect(waiting.kind).toBe("explain")
    expect(message(waiting)).toMatch(/accepted evidence/)
  })

  it("does not offer approval before the qualifying outcome", () => {
    expect(message(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", null), true))).toMatch(/not due yet/)
    expect(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "WITHDRAWN"), true).kind).toBe("explain")
    expect(successFeeApprovalOffer(order(), outcomes("REVIEW_PROTECTION", "RESTORED"), true).kind).toBe("explain")
    expect(message(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "NOT_RESTORED"), true))).toMatch(/not due yet/)
  })

  it("withholds approval when the case outcome cannot be confirmed", () => {
    expect(message(successFeeApprovalOffer(order(), null, true))).toMatch(/could not be confirmed/)
    expect(message(successFeeApprovalOffer(order(), new Map(), true))).toMatch(/could not be confirmed/)
    expect(message(successFeeApprovalOffer(order({ caseId: null }), outcomes("PROFILE_RECOVERY", "RESTORED"), true))).toMatch(/not linked to a case/)
  })

  it("hides the approval form for an upfront order and for an approval that already exists", () => {
    expect(successFeeApprovalOffer(order({ paymentModel: "UPFRONT" }), null, true).kind).toBe("hidden")
    expect(successFeeApprovalOffer(order({ approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }), null, false).kind).toBe("hidden")
  })
})
