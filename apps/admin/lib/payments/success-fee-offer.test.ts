import { describe, expect, it } from "vitest"
import { successFeeApprovalOffer, type SuccessFeeCaseOutcome } from "./success-fee-offer"

const caseId = "55555555-5555-4555-8555-555555555555"
const evidence = [{ id: "99999999-9999-4999-8999-999999999999", filename: "outcome.png", versionNumber: 1 }]
const consentId = "88888888-8888-4888-8888-888888888888"

function order(overrides: Record<string, unknown> = {}) {
  return {
    paymentModel: "SUCCESS_FEE",
    approvalId: null,
    caseId,
    acceptedEvidence: evidence,
    setupReady: true,
    consentId,
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
  it("offers approval when the outcome, evidence, setup and consent all hold", () => {
    expect(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "RESTORED")).kind).toBe("approve")
    expect(successFeeApprovalOffer(order(), outcomes("REVIEW_PROTECTION", "REMOVED")).kind).toBe("approve")
  })

  it("does not offer approval when setup is not ready", () => {
    const waiting = successFeeApprovalOffer(order({ setupReady: false, consentId: null }), outcomes("PROFILE_RECOVERY", "RESTORED"))
    expect(waiting.kind).toBe("explain")
    expect(message(waiting)).toMatch(/setup is not complete/i)
  })

  it("does not offer approval when consent is missing", () => {
    const waiting = successFeeApprovalOffer(order({ setupReady: false, consentId: null }), outcomes("PROFILE_RECOVERY", "RESTORED"))
    expect(waiting.kind).toBe("explain")
    expect(message(waiting)).toMatch(/setup is not complete/i)
  })

  it("fails closed when a payment method is saved without later-charge consent", () => {
    const conflict = successFeeApprovalOffer(order({ setupReady: true, consentId: null }), outcomes("PROFILE_RECOVERY", "RESTORED"))
    expect(conflict.kind).toBe("explain")
    expect(message(conflict)).toMatch(/without later-charge consent/)
  })

  it("does not offer approval when consent is recorded but no usable payment method is saved", () => {
    const waiting = successFeeApprovalOffer(order({ setupReady: false, consentId }), outcomes("PROFILE_RECOVERY", "RESTORED"))
    expect(waiting.kind).toBe("explain")
    expect(message(waiting)).toMatch(/no usable payment method/)
  })

  it("still requires accepted evidence after the outcome and setup qualify", () => {
    const waiting = successFeeApprovalOffer(order({ acceptedEvidence: [] }), outcomes("PROFILE_RECOVERY", "RESTORED"))
    expect(waiting.kind).toBe("explain")
    expect(message(waiting)).toMatch(/accepted evidence/)
  })

  it("does not offer approval before the qualifying outcome", () => {
    expect(message(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", null)))).toMatch(/not due yet/)
    expect(successFeeApprovalOffer(order(), outcomes("PROFILE_RECOVERY", "WITHDRAWN")).kind).toBe("explain")
    expect(successFeeApprovalOffer(order(), outcomes("REVIEW_PROTECTION", "RESTORED")).kind).toBe("explain")
  })

  it("withholds approval when the case outcome cannot be confirmed", () => {
    expect(message(successFeeApprovalOffer(order(), null))).toMatch(/could not be confirmed/)
    expect(message(successFeeApprovalOffer(order(), new Map()))).toMatch(/could not be confirmed/)
    expect(message(successFeeApprovalOffer(order({ caseId: null }), outcomes("PROFILE_RECOVERY", "RESTORED")))).toMatch(/not linked to a case/)
  })

  it("hides the approval form for an upfront order and for an approval that already exists", () => {
    expect(successFeeApprovalOffer(order({ paymentModel: "UPFRONT" }), null).kind).toBe("hidden")
    expect(successFeeApprovalOffer(order({ approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }), null).kind).toBe("hidden")
  })
})
