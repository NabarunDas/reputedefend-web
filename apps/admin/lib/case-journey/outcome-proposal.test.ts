import { describe, expect, it } from "vitest"
import { assessProposedOutcomeRecord } from "./outcome-proposal"

const summary = "The listing was restored and the customer can see it again."

describe("proposed pre-closure outcome record", () => {
  it("would record an outcome without closing the case or changing the stage", () => {
    const recorded = assessProposedOutcomeRecord({
      caseType: "PROFILE_RECOVERY",
      stage: "OUTCOME_REVIEW",
      status: "UNDER_REVIEW",
      existingOutcome: null,
      outcome: "RESTORED",
      summary,
    })
    expect(recorded).toEqual({ status: "would_record", outcome: "RESTORED", closesCase: false, changesStage: false })

    const withdrawn = assessProposedOutcomeRecord({
      caseType: "REVIEW_PROTECTION",
      stage: "READY_TO_SUBMIT",
      status: "UNDER_REVIEW",
      existingOutcome: null,
      outcome: "WITHDRAWN",
      summary,
    })
    expect(withdrawn.status).toBe("would_record")
    if (withdrawn.status === "would_record") {
      expect(withdrawn.closesCase).toBe(false)
      expect(withdrawn.changesStage).toBe(false)
    }
  })

  it("refuses an outcome the close command would refuse, and refuses to overwrite or reopen a closed case", () => {
    expect(assessProposedOutcomeRecord({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: null, outcome: "REMOVED", summary,
    }).status).toBe("refused")
    expect(assessProposedOutcomeRecord({
      caseType: "PROFILE_RECOVERY", stage: "PREPARATION", status: "UNDER_REVIEW", existingOutcome: null, outcome: "RESTORED", summary,
    })).toMatchObject({ status: "refused", reason: "wrong_stage" })
    expect(assessProposedOutcomeRecord({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "CLOSED", existingOutcome: null, outcome: "RESTORED", summary,
    })).toMatchObject({ status: "refused", reason: "already_closed" })
    expect(assessProposedOutcomeRecord({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: "RESTORED", outcome: "NOT_RESTORED", summary,
    })).toMatchObject({ status: "refused", reason: "outcome_exists" })
    expect(assessProposedOutcomeRecord({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: null, outcome: "RESTORED", summary: "short",
    })).toMatchObject({ status: "refused", reason: "summary" })
  })
})
