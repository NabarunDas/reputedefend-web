/**
 * Readable checks for `record_outcome` and the close guard.
 *
 * The live function is `public.admin_case_command_v1` in
 * `supabase/migrations/20261019183000_admin_journey_10b_record_outcome_v1.sql`.
 * That migration is not applied to DEV or Production. The journey page does
 * not call these functions. `readStoredOutcome` is the current read-only check.
 */

const recoveryOutcomes = ["RESTORED", "PARTIALLY_RESTORED", "NOT_RESTORED", "WITHDRAWN"]
const protectionOutcomes = ["REMOVED", "NOT_REMOVED", "RESPONSE_RECOMMENDED", "WITHDRAWN"]

export type ProposedOutcomeRecord =
  | { status: "would_record"; outcome: string; closesCase: false; changesStage: false }
  | { status: "refused"; reason: "invalid_outcome" | "wrong_stage" | "already_closed" | "outcome_exists" | "summary" }

export type ProposedClose =
  | { status: "would_close"; outcome: string; closesCase: true; overwroteOutcome: false }
  | { status: "refused"; reason: "invalid_outcome" | "wrong_stage" | "already_closed" | "summary" | "open_work" | "outcome_conflict" }

/** What the current Step 10 reader may treat as an authoritative outcome. */
export type StoredOutcomeReading = "absent" | "closed" | "pre_closure" | "conflict"

function allowedOutcomes(caseType: string): readonly string[] | null {
  if (caseType === "PROFILE_RECOVERY") return recoveryOutcomes
  if (caseType === "REVIEW_PROTECTION") return protectionOutcomes
  return null
}

function summaryOk(summary: string): boolean {
  const length = summary.trim().length
  return length >= 10 && length <= 2000
}

/**
 * The checks `record_outcome` enforces.
 * `closesCase` and `changesStage` stay false: recording does not close the case.
 */
export function assessProposedOutcomeRecord(input: {
  caseType: string
  stage: string
  status: string
  existingOutcome: string | null
  outcome: string
  summary: string
}): ProposedOutcomeRecord {
  if (!summaryOk(input.summary)) return { status: "refused", reason: "summary" }
  if (!allowedOutcomes(input.caseType)?.includes(input.outcome)) return { status: "refused", reason: "invalid_outcome" }
  if (input.status === "CLOSED" || input.status === "CANCELLED") return { status: "refused", reason: "already_closed" }
  if (input.existingOutcome) return { status: "refused", reason: "outcome_exists" }
  if (input.stage === "FINISHED" || (input.outcome !== "WITHDRAWN" && input.stage !== "OUTCOME_REVIEW")) {
    return { status: "refused", reason: "wrong_stage" }
  }
  return { status: "would_record", outcome: input.outcome, closesCase: false, changesStage: false }
}

/**
 * The close guard that accompanies `record_outcome`.
 * A stored outcome and its summary must be repeated exactly. A different
 * value is refused. Closing still closes the case, and this function does
 * not replace the stored outcome or summary.
 */
export function assessProposedClose(input: {
  caseType: string
  stage: string
  status: string
  existingOutcome: string | null
  existingSummary: string | null
  outcome: string
  summary: string
  openWork: boolean
}): ProposedClose {
  if (!summaryOk(input.summary)) return { status: "refused", reason: "summary" }
  if (!allowedOutcomes(input.caseType)?.includes(input.outcome)) return { status: "refused", reason: "invalid_outcome" }
  if (input.status === "CLOSED" || input.status === "CANCELLED") return { status: "refused", reason: "already_closed" }
  if (input.outcome !== "WITHDRAWN" && input.stage !== "OUTCOME_REVIEW") return { status: "refused", reason: "wrong_stage" }
  if (input.openWork) return { status: "refused", reason: "open_work" }
  if (input.existingOutcome && (input.existingOutcome !== input.outcome || input.existingSummary !== input.summary)) {
    return { status: "refused", reason: "outcome_conflict" }
  }
  return { status: "would_close", outcome: input.outcome, closesCase: true, overwroteOutcome: false }
}

/**
 * Read-only. A `pre_closure` result means the stored row has the shape
 * `record_outcome` writes. It does not mean the migration has been applied.
 */
export function readStoredOutcome(input: {
  caseType: string
  stage: string
  status: string
  outcome: string | null
  summary: string
  reopened: boolean
}): StoredOutcomeReading {
  const closed = input.status === "CLOSED" || input.status === "CANCELLED"
  if (!input.outcome) return closed ? "conflict" : "absent"
  if (!allowedOutcomes(input.caseType)?.includes(input.outcome)) return "conflict"
  if (closed) {
    const withdrawn = input.outcome === "WITHDRAWN"
    const statusMatches = withdrawn ? input.status === "CANCELLED" : input.status === "CLOSED"
    return statusMatches && input.stage === "FINISHED" ? "closed" : "conflict"
  }
  if (input.reopened || input.stage === "FINISHED" || !summaryOk(input.summary)) return "conflict"
  if (input.outcome !== "WITHDRAWN" && input.stage !== "OUTCOME_REVIEW") return "conflict"
  return "pre_closure"
}
