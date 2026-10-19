/**
 * Proposal only. This is not wired to `admin_case_command_v1` and it is not
 * a migration. The existing `close` operation remains the only writer of
 * `cases.outcome`, and it also closes the case.
 *
 * A later review can add `record_outcome` with these checks. Until that
 * command exists, Step 10 does not record an outcome and does not close the case.
 */

const recoveryOutcomes = ["RESTORED", "PARTIALLY_RESTORED", "NOT_RESTORED", "WITHDRAWN"]
const protectionOutcomes = ["REMOVED", "NOT_REMOVED", "RESPONSE_RECOMMENDED", "WITHDRAWN"]

export type ProposedOutcomeRecord =
  | { status: "would_record"; outcome: string; closesCase: false; changesStage: false }
  | { status: "refused"; reason: "invalid_outcome" | "wrong_stage" | "already_closed" | "outcome_exists" | "summary" }

/**
 * The checks a pre-closure outcome command would have to enforce.
 * `closesCase` and `changesStage` stay false: the proposal does not close the case.
 */
export function assessProposedOutcomeRecord(input: {
  caseType: string
  stage: string
  status: string
  existingOutcome: string | null
  outcome: string
  summary: string
}): ProposedOutcomeRecord {
  const summaryLength = input.summary.trim().length
  if (summaryLength < 10 || summaryLength > 2000) return { status: "refused", reason: "summary" }
  const allowed = input.caseType === "PROFILE_RECOVERY"
    ? recoveryOutcomes
    : input.caseType === "REVIEW_PROTECTION"
      ? protectionOutcomes
      : null
  if (!allowed?.includes(input.outcome)) return { status: "refused", reason: "invalid_outcome" }
  if (input.status === "CLOSED" || input.status === "CANCELLED") return { status: "refused", reason: "already_closed" }
  if (input.existingOutcome) return { status: "refused", reason: "outcome_exists" }
  if (input.outcome !== "WITHDRAWN" && input.stage !== "OUTCOME_REVIEW") return { status: "refused", reason: "wrong_stage" }
  return { status: "would_record", outcome: input.outcome, closesCase: false, changesStage: false }
}
