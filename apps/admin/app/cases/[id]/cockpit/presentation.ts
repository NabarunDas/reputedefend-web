/**
 * Symbols and page anchors for the case cockpit.
 *
 * The wording every case surface shares — who owns an action, what its state
 * is called, what a service track or a priority is called — moved to
 * `app/cases/presentation.ts` when UX-3 gave the case queue the same model to
 * render, and is re-exported here so this page's components keep one import.
 * What stays is what is only true of this page: the journey and prerequisite
 * symbols, and the map from an action to the section that performs it.
 *
 * Everything here is presentation. Nothing in this file decides what a case
 * may do, which action is next, whether a prerequisite is met or where a case
 * is in its journey — UX-1 has already answered all of that, and the cockpit
 * renders those answers rather than forming its own.
 */

import type { CaseNextAction, CaseNextActionId } from "@/lib/case-flow/model"
import type { CaseAttentionSeverity, CasePhaseState, CasePrerequisiteState } from "@/lib/case-flow/model"
import type { Tone } from "../../presentation"

export type { Tone } from "../../presentation"
export {
  actionOwnershipSummary,
  actionStatePresentation,
  caseStatusLabel,
  ownerLabel,
  ownerSentence,
  priorityLabel,
  priorityPresentation,
  serviceTrackLabels,
} from "../../presentation"

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
