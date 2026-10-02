/**
 * Wording, symbols and page anchors for the case cockpit.
 *
 * Everything here is presentation. Nothing in this file decides what a case
 * may do, which action is next, whether a prerequisite is met or where a case
 * is in its journey — UX-1 has already answered all of that, and the cockpit
 * renders those answers rather than forming its own. The one job here is to
 * turn the model's enums into words an operator reads and into somewhere on
 * the page to go.
 */

import type { CaseNextAction, CaseNextActionId } from "@/lib/case-flow/model"
import type {
  CaseActionOwner,
  CaseActionState,
  CaseAttentionSeverity,
  CasePhaseState,
  CasePrerequisiteState,
  CaseServiceTrack,
  CaseWaitingOn,
} from "@/lib/case-flow/model"

export type Tone = "neutral" | "info" | "success" | "warning" | "danger"

// ---------------------------------------------------------------------------
// Who
// ---------------------------------------------------------------------------

/**
 * The operator is reading their own case, so `ADMIN` is "You" in the sentence
 * about what they have to do next and "ProfileRelaunch" everywhere a third
 * party is being named alongside the customer, Google or the provider. Both
 * readings are the same `CaseActionOwner`; only the wording changes.
 */
const ownerLabels: Record<CaseActionOwner, { self: string; organisation: string }> = {
  ADMIN: { self: "You", organisation: "ProfileRelaunch" },
  CUSTOMER: { self: "Customer", organisation: "Customer" },
  GOOGLE: { self: "Google", organisation: "Google" },
  PAYMENT_PROVIDER: { self: "Payment provider", organisation: "Payment provider" },
  SYSTEM: { self: "System", organisation: "System" },
}

export function ownerLabel(owner: CaseActionOwner, voice: "self" | "organisation" = "organisation"): string {
  return ownerLabels[owner][voice]
}

/** `NONE` has no label, because a case waiting on nobody is not waiting. */
export function waitingLabel(waitingOn: CaseWaitingOn): string | null {
  return waitingOn === "NONE" ? null : ownerLabels[waitingOn].organisation
}

// ---------------------------------------------------------------------------
// Action state
// ---------------------------------------------------------------------------

/**
 * `primary` is what separates a step somebody can take now from a step that
 * has been asked for or cannot be taken: only the first two get a button, so
 * waiting never looks like something to click.
 */
export const actionStatePresentation: Record<CaseActionState, { word: string; tone: Tone; prefix: string; primary: boolean }> = {
  ACTION_REQUIRED: { word: "Action required", tone: "warning", prefix: "Action owner", primary: true },
  READY: { word: "Ready to do", tone: "success", prefix: "Action owner", primary: true },
  WAITING: { word: "Waiting", tone: "neutral", prefix: "Waiting on", primary: false },
  BLOCKED: { word: "Blocked", tone: "danger", prefix: "Blocked by", primary: false },
}

/** "Action owner: You", "Waiting on: Customer", "Blocked by: System". */
export function ownerSentence(action: CaseNextAction): string {
  const { prefix, primary } = actionStatePresentation[action.state]
  return `${prefix}: ${ownerLabel(action.owner, primary ? "self" : "organisation")}`
}

// ---------------------------------------------------------------------------
// Phase and prerequisite state
// ---------------------------------------------------------------------------

/**
 * A symbol and a word beside every state, so the journey is readable without
 * seeing colour and audible without seeing anything. The symbol is decorative
 * and the word carries the meaning.
 */
export const phaseStatePresentation: Record<CasePhaseState, { symbol: string; status: string; tone: Tone }> = {
  COMPLETE: { symbol: "✓", status: "Complete", tone: "success" },
  CURRENT: { symbol: "●", status: "In progress", tone: "info" },
  UPCOMING: { symbol: "○", status: "Not started", tone: "neutral" },
  NEEDS_ATTENTION: { symbol: "!", status: "Needs attention", tone: "warning" },
}

export const prerequisiteStatePresentation: Record<CasePrerequisiteState, { symbol: string; status: string; tone: Tone }> = {
  SATISFIED: { symbol: "✓", status: "Done", tone: "success" },
  IN_PROGRESS: { symbol: "●", status: "In progress", tone: "info" },
  NOT_STARTED: { symbol: "○", status: "Not started", tone: "neutral" },
  ATTENTION: { symbol: "!", status: "Needs attention", tone: "warning" },
  NOT_APPLICABLE: { symbol: "—", status: "Not needed", tone: "neutral" },
}

export const severityPresentation: Record<CaseAttentionSeverity, { word: string; tone: Tone }> = {
  CRITICAL: { word: "Critical", tone: "danger" },
  WARNING: { word: "Warning", tone: "warning" },
  INFO: { word: "For information", tone: "neutral" },
}

// ---------------------------------------------------------------------------
// Case facts the header and snapshot show
// ---------------------------------------------------------------------------

export const serviceTrackLabels: Record<CaseServiceTrack, string> = {
  UNDECIDED: "Not chosen",
  GUIDED: "Guided",
  MANAGED: "Managed",
}

export const priorityPresentation: Record<string, { word: string; tone: Tone }> = {
  NORMAL: { word: "Normal priority", tone: "neutral" },
  HIGH: { word: "High priority", tone: "warning" },
  URGENT: { word: "Urgent", tone: "danger" },
}

export function priorityLabel(priority: string): { word: string; tone: Tone } {
  return priorityPresentation[priority] ?? { word: `${priority} priority`, tone: "neutral" }
}

const statusWords: Record<string, string> = {
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  AWAITING_CUSTOMER: "Open",
  UNDER_REVIEW: "Open",
  RECEIVED: "Open",
}

export function caseStatusLabel(status: string): { word: string; tone: Tone } {
  const word = statusWords[status] ?? "Open"
  return { word, tone: word === "Open" ? "info" : "neutral" }
}

// ---------------------------------------------------------------------------
// Where an action is performed
// ---------------------------------------------------------------------------

/**
 * The sections of this page that hold a command, and what each is called.
 * Ids are rendered as `id` attributes so an anchor can reach them.
 */
export const caseSections = {
  "case-plan": "Case planning",
  "case-progress": "Progress case",
  "case-authorisation": "Agreements and permissions",
  "case-tasks": "Tasks",
  "case-submissions": "Submission attempts",
  "case-closure": "Close or withdraw this case",
} as const

export type CaseSectionId = keyof typeof caseSections

/**
 * Where on this page each same-case action is performed.
 *
 * A `CASE` destination means "the case page", which is the page the operator
 * is already on, so linking to its href would move them nowhere. This maps
 * the action to the section that holds the relevant command instead.
 *
 * It decides nothing about permission. An action appears here because UX-1
 * recommended it; the command in that section still applies every check it
 * applied before, and an action missing from this map simply gets no link.
 */
const caseActionSections: Partial<Record<CaseNextActionId, CaseSectionId>> = {
  SELECT_SERVICE: "case-plan",

  REVIEW_NEW_CASE: "case-progress",
  COMPLETE_ASSESSMENT: "case-progress",
  ADVANCE_TO_ASSESSMENT: "case-progress",
  ADVANCE_TO_PREREQUISITES: "case-progress",
  ADVANCE_TO_PREPARATION: "case-progress",
  ADVANCE_TO_READY_TO_SUBMIT: "case-progress",
  MOVE_TO_WAITING_GOOGLE: "case-progress",
  RETURN_TO_PREPARATION: "case-progress",
  PERFORM_FURTHER_REVIEW: "case-progress",
  REVIEW_OUTCOME: "case-progress",
  REVIEW_CASE_STATE: "case-progress",

  RESOLVE_AUTHORISATION_REVIEW: "case-authorisation",
  ISSUE_SERVICE_AGREEMENT: "case-authorisation",
  WAIT_FOR_SERVICE_AGREEMENT: "case-authorisation",
  ISSUE_CASE_PERMISSION: "case-authorisation",
  WAIT_FOR_CASE_PERMISSION: "case-authorisation",
  VERIFY_MANAGER_ACCESS: "case-authorisation",

  REQUEST_CUSTOMER_ACTION: "case-tasks",
  WAIT_FOR_CUSTOMER_ACTION: "case-tasks",
  FOLLOW_UP_GOOGLE: "case-tasks",
  WAIT_FOR_GOOGLE: "case-tasks",

  RECORD_EXTERNAL_SUBMISSION: "case-submissions",
  REVIEW_SUBMISSION_DECISION: "case-submissions",

  CLOSE_CASE: "case-closure",
}

/** Where the action's link should point, and what that place is called. */
export function actionTarget(action: CaseNextAction): { href: string; label: string } | null {
  const target = action.destination
  if (!target) return null
  if (target.kind !== "CASE") return { href: target.href, label: target.label }
  const section = caseActionSections[action.id]
  return section ? { href: `#${section}`, label: caseSections[section] } : null
}
