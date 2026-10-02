/**
 * Symbols and page anchors for the case cockpit.
 *
 * The wording every case surface shares — who owns an action, what its state
 * is called, what a service track or a priority is called, and which section
 * of this page performs an action — lives in `app/cases/presentation.ts`,
 * because the case queue and the Today workbench render the same model and
 * two surfaces describing one action differently is worse than either. It is
 * re-exported here so this page's components keep one import. What stays is
 * what is only true of this page: the journey and prerequisite symbols.
 *
 * Everything here is presentation. Nothing in this file decides what a case
 * may do, which action is next, whether a prerequisite is met or where a case
 * is in its journey — UX-1 has already answered all of that, and the cockpit
 * renders those answers rather than forming its own.
 */

import type { CaseAttentionSeverity, CasePhaseState, CasePrerequisiteState } from "@/lib/case-flow/model"
import type { Tone } from "../../presentation"

export type { CaseSectionId, Tone } from "../../presentation"
export {
  actionOwnershipSummary,
  actionStatePresentation,
  actionTarget,
  caseSections,
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
