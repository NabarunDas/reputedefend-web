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

import type { CaseActionOwner, CaseActionState, CaseNextAction, CaseServiceTrack } from "@/lib/case-flow/model"

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
