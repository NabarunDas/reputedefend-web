import { describe, expect, it } from "vitest"
import { assessProposedClose, assessProposedOutcomeRecord, readStoredOutcome } from "./outcome-proposal"

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
    expect(assessProposedOutcomeRecord({
      caseType: "PROFILE_RECOVERY", stage: "FINISHED", status: "UNDER_REVIEW", existingOutcome: null, outcome: "WITHDRAWN", summary,
    })).toMatchObject({ status: "refused", reason: "wrong_stage" })
  })

  it("lets close finish a recorded outcome and refuses to overwrite it", () => {
    const recorded = assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: "RESTORED", existingSummary: summary, outcome: "RESTORED", summary, openWork: false,
    })
    expect(recorded).toEqual({ status: "would_close", outcome: "RESTORED", closesCase: true, overwroteOutcome: false })

    const firstClose = assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: null, existingSummary: null, outcome: "RESTORED", summary, openWork: false,
    })
    expect(firstClose).toMatchObject({ status: "would_close", closesCase: true, overwroteOutcome: false })

    expect(assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: "RESTORED", existingSummary: summary, outcome: "NOT_RESTORED", summary, openWork: false,
    })).toMatchObject({ status: "refused", reason: "outcome_conflict" })
    expect(assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: "RESTORED", existingSummary: summary, outcome: "RESTORED", summary: "A different supporting summary that is long enough.", openWork: false,
    })).toMatchObject({ status: "refused", reason: "outcome_conflict" })
    expect(assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: null, existingSummary: "A stray summary that close may still replace.", outcome: "RESTORED", summary, openWork: true,
    })).toMatchObject({ status: "refused", reason: "open_work" })
    expect(assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "PREPARATION", status: "UNDER_REVIEW", existingOutcome: null, existingSummary: null, outcome: "RESTORED", summary, openWork: false,
    })).toMatchObject({ status: "refused", reason: "wrong_stage" })
    expect(assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "FINISHED", status: "CLOSED", existingOutcome: "RESTORED", existingSummary: summary, outcome: "RESTORED", summary, openWork: false,
    })).toMatchObject({ status: "refused", reason: "already_closed" })
    expect(assessProposedClose({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", existingOutcome: null, existingSummary: null, outcome: "REMOVED", summary, openWork: false,
    })).toMatchObject({ status: "refused", reason: "invalid_outcome" })
  })

  it("recognises a stored pre-closure outcome without treating the command as applied", () => {
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", outcome: "RESTORED", summary, reopened: false,
    })).toBe("pre_closure")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "FINISHED", status: "CLOSED", outcome: "RESTORED", summary, reopened: false,
    })).toBe("closed")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", outcome: null, summary: "", reopened: false,
    })).toBe("absent")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "PREPARATION", status: "UNDER_REVIEW", outcome: "RESTORED", summary, reopened: false,
    })).toBe("conflict")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", outcome: "RESTORED", summary, reopened: true,
    })).toBe("conflict")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", outcome: "RESTORED", summary, reopened: true,
      events: [
        { id: "9", event: "reopen", details: { previousOutcome: "RESTORED" } },
        { id: "10", event: "record_outcome", details: { outcome: "RESTORED", summary, closesCase: false } },
      ],
    })).toBe("pre_closure")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "FURTHER_REVIEW", status: "UNDER_REVIEW", outcome: "WITHDRAWN", summary, reopened: true,
      events: [
        { id: "10", event: "reopen", details: {} },
        { id: "9", event: "record_outcome", details: { outcome: "WITHDRAWN", summary, closesCase: false } },
      ],
    })).toBe("conflict")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "FINISHED", status: "CLOSED", outcome: "WITHDRAWN", summary, reopened: false,
    })).toBe("conflict")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "FINISHED", status: "CANCELLED", outcome: "RESTORED", summary, reopened: false,
    })).toBe("conflict")
    expect(readStoredOutcome({
      caseType: "PROFILE_RECOVERY", stage: "OUTCOME_REVIEW", status: "UNDER_REVIEW", outcome: "RESTORED", summary: "short", reopened: false,
    })).toBe("conflict")
  })

  it("accepts a post-reopen outcome only from a later matching record_outcome event", () => {
    const open = {
      caseType: "PROFILE_RECOVERY",
      stage: "OUTCOME_REVIEW",
      status: "UNDER_REVIEW",
      outcome: "RESTORED",
      summary,
      reopened: true,
    }
    const record = (id: string, details: Record<string, unknown>) => ({ id, event: "record_outcome", details })
    const reopen = (id: string) => ({ id, event: "reopen", details: { previousOutcome: "RESTORED", previousSummary: summary } })
    const matching = { outcome: "RESTORED", summary, closesCase: false }

    expect(readStoredOutcome({ ...open, events: [reopen("9"), record("10", matching)] })).toBe("pre_closure")
    expect(readStoredOutcome({ ...open, reopened: false })).toBe("pre_closure")
    expect(readStoredOutcome({ ...open, events: [record("10", matching)] })).toBe("conflict")
    expect(readStoredOutcome({ ...open, events: [record("9", matching), reopen("10")] })).toBe("conflict")
    expect(readStoredOutcome({ ...open, events: [reopen("10"), record("9", matching)] })).toBe("conflict")
    expect(readStoredOutcome({
      ...open,
      events: [reopen("2"), record("3", { outcome: "RESTORED", summary: `${summary} `, closesCase: false })],
    })).toBe("conflict")
    expect(readStoredOutcome({
      ...open,
      events: [reopen("2"), record("3", { outcome: "RESTORED", summary, closesCase: true })],
    })).toBe("conflict")
    expect(readStoredOutcome({
      ...open,
      events: [reopen("2"), record("3", { outcome: "RESTORED", summary })],
    })).toBe("conflict")
    expect(readStoredOutcome({ ...open, events: [reopen("2"), record("3", { outcome: "NOT_RESTORED", summary, closesCase: false })] })).toBe("conflict")
    expect(readStoredOutcome({ ...open, stage: "PREPARATION", events: [reopen("2"), record("3", matching)] })).toBe("conflict")
    expect(readStoredOutcome({ ...open, stage: "FURTHER_REVIEW", outcome: "WITHDRAWN", events: [reopen("2"), record("3", { outcome: "WITHDRAWN", summary, closesCase: false })] })).toBe("pre_closure")

    const buried = [
      reopen("1"),
      ...Array.from({ length: 49 }, (_, index) => ({ id: String(index + 2), event: "note", details: {} })),
      record("51", matching),
    ]
    expect(readStoredOutcome({ ...open, events: buried })).toBe("pre_closure")
    const hidden = Array.from({ length: 51 }, (_, index) => ({ id: String(index + 20), event: "note", details: {} }))
    expect(readStoredOutcome({ ...open, events: hidden })).toBe("conflict")
    const completeWithoutReopen = [record("1", matching), ...Array.from({ length: 49 }, (_, index) => ({ id: String(index + 2), event: "note", details: {} }))]
    expect(readStoredOutcome({ ...open, events: completeWithoutReopen })).toBe("conflict")
  })
})
