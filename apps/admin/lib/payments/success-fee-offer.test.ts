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

describe("success-fee approval on the Money page", () => {
  it("offers approval only after a qualifying outcome and accepted evidence", () => {
    expect(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "RESTORED")).kind).toBe("approve")
    expect(successFeeApprovalOffer(order(), outcomes("REVIEW_PROTECTION", "REMOVED")).kind).toBe("approve")
  })

  it("does not offer approval before the qualifying outcome", () => {
    const early = successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", null))
    expect(early.kind).toBe("explain")
    if (early.kind === "explain") expect(early.message).toMatch(/not due yet/)
    expect(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "WITHDRAWN")).kind).toBe("explain")
    expect(successFeeApprovalOffer(order(), outcomes("REVIEW_PROTECTION", "RESTORED")).kind).toBe("explain")
  })

  it("still requires accepted evidence after the outcome qualifies", () => {
    const waiting = successFeeApprovalOffer(order({ acceptedEvidence: [] }), outcomes("PROFILE_RECOVERY", "RESTORED"))
    expect(waiting.kind).toBe("explain")
    if (waiting.kind === "explain") expect(waiting.message).toMatch(/accepted evidence/)
  })

  it("withholds approval when the case outcome cannot be confirmed", () => {
    expect(successFeeApprovalOffer(order(), null).kind).toBe("explain")
    expect(successFeeApprovalOffer(order(), new Map()).kind).toBe("explain")
    expect(successFeeApprovalOffer(order({ caseId: null }), outcomes("PROFILE_RECOVERY", "RESTORED")).kind).toBe("explain")
  })

  it("leaves upfront orders and approved success fees alone", () => {
    expect(successFeeApprovalOffer(order({ paymentModel: "UPFRONT" }), null).kind).toBe("hidden")
    expect(successFeeApprovalOffer(order({ approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }), null).kind).toBe("hidden")
  })
})