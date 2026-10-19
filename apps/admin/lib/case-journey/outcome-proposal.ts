/**
 * Readable checks for `record_outcome` and the close guard.
 *
 * The live function is `public.admin_case_command_v1` in
 * `supabase/migrations/20261019183000_admin_journey_10b_record_outcome_v1.sql`.
 * That migration is applied to DEV only. It is not applied to Production.
 * `readStoredOutcome` is the read-only check. `assessProposedClose` is the
 * read-only close guard Step 11 uses before offering the existing command.
 * Neither function closes the case.
 */

/**
 * `admin_case_detail_v1` returns at most this many work events, newest id first.
 * A full page can hide an older reopen. It cannot hide a later one.
 */
const OUTCOME_EVENT_PAGE = 51

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

/** A case-detail work event. `id` is the bigint primary key as text. */
export type OutcomeProofEvent = {
  id?: string
  event: string
  details?: Record<string, unknown> | null
}

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

function numericEventId(value: string | undefined): bigint | null {
  if (!value || !/^[0-9]+$/.test(value)) return null
  return BigInt(value)
}

/**
 * An open reopened case may keep a stored outcome only when a `record_outcome`
 * event matches it and is newer than every loaded reopen. Missing, mismatched,
 * or unordered proof stays a conflict. Event ids are compared as integers.
 */
function recordedAfterReopen(outcome: string, summary: string, events: readonly OutcomeProofEvent[] | null | undefined): boolean {
  if (!events || events.length === 0) return false
  const parsed: { id: bigint; event: string; details: Record<string, unknown> }[] = []
  for (const row of events) {
    const id = numericEventId(row.id)
    if (id === null || typeof row.event !== "string") return false
    if (!row.details || typeof row.details !== "object" || Array.isArray(row.details)) return false
    parsed.push({ id, event: row.event, details: row.details })
  }
  const truncated = parsed.length >= OUTCOME_EVENT_PAGE
  const reopens = parsed.filter(row => row.event === "reopen")
  if (!truncated && reopens.length === 0) return false
  let latestMatch: bigint | null = null
  for (const row of parsed) {
    if (row.event !== "record_outcome") continue
    if (row.details.closesCase !== false) continue
    if (row.details.outcome !== outcome || row.details.summary !== summary) continue
    if (latestMatch === null || row.id > latestMatch) latestMatch = row.id
  }
  if (latestMatch === null) return false
  return reopens.every(row => row.id < latestMatch)
}

/**
 * Read-only. A `pre_closure` result means the stored row has the shape
 * `record_outcome` writes and, after a reopen, a later matching work event.
 * It does not mean the migration has been applied. Omitted events do not
 * prove a post-reopen record.
 */
export function readStoredOutcome(input: {
  caseType: string
  stage: string
  status: string
  outcome: string | null
  summary: string
  reopened: boolean
  events?: readonly OutcomeProofEvent[] | null
}): StoredOutcomeReading {
  const closed = input.status === "CLOSED" || input.status === "CANCELLED"
  if (!input.outcome) return closed ? "conflict" : "absent"
  if (!allowedOutcomes(input.caseType)?.includes(input.outcome)) return "conflict"
  if (closed) {
    const withdrawn = input.outcome === "WITHDRAWN"
    const statusMatches = withdrawn ? input.status === "CANCELLED" : input.status === "CLOSED"
    return statusMatches && input.stage === "FINISHED" ? "closed" : "conflict"
  }
  if (input.reopened && !recordedAfterReopen(input.outcome, input.summary, input.events)) return "conflict"
  if (input.stage === "FINISHED" || !summaryOk(input.summary)) return "conflict"
  if (input.outcome !== "WITHDRAWN" && input.stage !== "OUTCOME_REVIEW") return "conflict"
  return "pre_closure"
}
