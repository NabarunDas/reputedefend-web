/**
 * Wording shared by every Admin surface that renders the UX-1 case flow model.
 *
 * The cockpit built this vocabulary; the case queue needs the same words for
 * the same model, and two surfaces describing one action differently is worse
 * than either description. So the genuinely shared parts live here and
 * `[id]/cockpit/presentation.ts` keeps only what is about that page — its
 * section anchors and its journey and prerequisite symbols.
 *
 * Everything here is presentation. Nothing decides what a case may do, which
 * action is next, who is waiting or whether a prerequisite is met: UX-1 has
 * already answered all of that, and these functions turn its enums into words.
 */

import type { CaseActionOwner, CaseActionState, CaseFlowModel, CaseNextAction, CaseNextActionId, CaseServiceTrack } from "@/lib/case-flow/model"

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

/**
 * Who the case is on, under the word that is true of them.
 *
 * `flow.waitingOn` is the primary action's owner whatever the state of that
 * action, so reading it as a wait is wrong: a case the operator has to act on
 * would say "Waiting on: ProfileRelaunch" when it means "Action owner: You".
 * The action state decides the word — a step that can be taken now has an
 * owner, only a step that has been asked for is a wait, and a blocked step
 * names what is holding it. A case with no primary action is a finished case,
 * because the resolver proposes a step for every open one.
 */
export function actionOwnershipSummary(action: CaseNextAction | null): { label: string; value: string } {
  if (!action) return { label: "Work state", value: "Complete" }
  const { prefix, primary } = actionStatePresentation[action.state]
  return { label: prefix, value: ownerLabel(action.owner, primary ? "self" : "organisation") }
}

/** "Action owner: You", "Waiting on: Customer", "Blocked by: System". */
export function ownerSentence(action: CaseNextAction): string {
  const { label, value } = actionOwnershipSummary(action)
  return `${label}: ${value}`
}

// ---------------------------------------------------------------------------
// Case facts
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
// What else is wrong with a case
// ---------------------------------------------------------------------------

export type CaseNotice = { text: string; tone: "danger" | "warning" }

/**
 * `2 blockers`, `1 other issue`, `Overdue` — counted, never coded.
 *
 * A list of cases cannot have each one explain its blockers, and the case
 * page already does that properly. A count with its noun is enough to decide
 * whether to open the case. Nothing here is derived: the blockers and the
 * attention items are UX-1's, and overdue is the action's own recorded date
 * having passed.
 */
export function caseAttentionNotices(flow: CaseFlowModel): CaseNotice[] {
  const notices: CaseNotice[] = []
  if (flow.blockers.length > 0) notices.push({ text: plural(flow.blockers.length, "blocker"), tone: "danger" })
  if (flow.attentionItems.length > 0) {
    notices.push({ text: plural(flow.attentionItems.length, "other issue"), tone: "warning" })
  }
  if (flow.primaryAction?.overdue) notices.push({ text: "Overdue", tone: "danger" })
  return notices
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

// ---------------------------------------------------------------------------
// Where an action is performed
// ---------------------------------------------------------------------------

/**
 * The sections of the case page that hold a command, and what each is called.
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
 * Where on the case page each same-case action is performed.
 *
 * A `CASE` destination means "the case page", which tells an operator already
 * on that page nothing. This maps the action to the section that holds the
 * relevant command, so the link lands on the control rather than the top of
 * the document. Today reuses the same map from the outside, which is the
 * reason it lives here rather than beside the cockpit it was written for.
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

/**
 * Where the action's link should point, and what that place is called.
 *
 * `caseBase` is empty on the case page itself, where a bare fragment is the
 * right link, and is the case's own path anywhere else, so a surface listing
 * many cases still lands on the section that performs the action.
 */
export function actionTarget(action: CaseNextAction, caseBase = ""): { href: string; label: string } | null {
  const target = action.destination
  if (!target) return null
  if (target.kind !== "CASE") return { href: target.href, label: target.label }
  const section = caseActionSections[action.id]
  return section ? { href: `${caseBase}#${section}`, label: caseSections[section] } : null
}
