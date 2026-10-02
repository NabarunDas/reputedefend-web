/**
 * The human case journey.
 *
 * The database stage machine has fourteen stages because it encodes the
 * rules an operation must satisfy. An operator opening a case does not need
 * fourteen answers; they need to know roughly where the case is. These nine
 * phases are that coarser view, and they are a projection: the technical
 * stage stays in the model beside them and is never replaced or rewritten.
 */

export const casePhaseIds = [
  "RECEIVED",
  "EVIDENCE",
  "ASSESSMENT",
  "SERVICE",
  "PREREQUISITES",
  "PREPARATION",
  "SUBMISSION",
  "DECISION",
  "COMPLETE",
] as const

export type CasePhaseId = (typeof casePhaseIds)[number]

export const casePhaseLabels: Record<CasePhaseId, string> = {
  RECEIVED: "Received",
  EVIDENCE: "Evidence",
  ASSESSMENT: "Assessment",
  SERVICE: "Service",
  PREREQUISITES: "Prerequisites",
  PREPARATION: "Preparation",
  SUBMISSION: "Submission",
  DECISION: "Decision",
  COMPLETE: "Complete",
}

/** The technical stages, exactly as `public.cases.work_stage` constrains them. */
export const technicalStages = [
  "INITIAL_REVIEW",
  "EVIDENCE_COLLECTION",
  "ASSESSMENT_READY",
  "SERVICE_SELECTION",
  "PAYMENT_REQUIRED",
  "AUTHORIZATION_REQUIRED",
  "PREPARATION",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "WAITING_GOOGLE",
  "OWNER_ACTION",
  "FURTHER_REVIEW",
  "OUTCOME_REVIEW",
  "FINISHED",
] as const

export type TechnicalStage = (typeof technicalStages)[number]

/** Many stages to one phase. Both payment and permission are prerequisites. */
export const phaseByStage: Record<TechnicalStage, CasePhaseId> = {
  INITIAL_REVIEW: "RECEIVED",
  EVIDENCE_COLLECTION: "EVIDENCE",
  ASSESSMENT_READY: "ASSESSMENT",
  SERVICE_SELECTION: "SERVICE",
  PAYMENT_REQUIRED: "PREREQUISITES",
  AUTHORIZATION_REQUIRED: "PREREQUISITES",
  PREPARATION: "PREPARATION",
  READY_TO_SUBMIT: "SUBMISSION",
  SUBMITTED: "SUBMISSION",
  WAITING_GOOGLE: "DECISION",
  OWNER_ACTION: "DECISION",
  FURTHER_REVIEW: "DECISION",
  OUTCOME_REVIEW: "DECISION",
  FINISHED: "COMPLETE",
}

/**
 * Operator-facing wording for a technical stage.
 *
 * Deliberately separate from `stages` in `lib/cases/model.ts`, which labels
 * the stage selector on the existing page. These describe the situation
 * rather than the stage name, and they are factual: a case that is waiting
 * for Google has not heard from Google.
 */
export const technicalStageLabels: Record<TechnicalStage, string> = {
  INITIAL_REVIEW: "New case to review",
  EVIDENCE_COLLECTION: "Collecting evidence",
  ASSESSMENT_READY: "Ready to assess",
  SERVICE_SELECTION: "Choosing the service",
  PAYMENT_REQUIRED: "Waiting for payment",
  AUTHORIZATION_REQUIRED: "Waiting for permissions",
  PREPARATION: "Preparing the submission",
  READY_TO_SUBMIT: "Ready to submit",
  SUBMITTED: "Submitted",
  WAITING_GOOGLE: "Waiting for Google",
  OWNER_ACTION: "Customer action needed",
  FURTHER_REVIEW: "Further work required",
  OUTCOME_REVIEW: "Reviewing the outcome",
  FINISHED: "Finished",
}

/** What a finished phase means, said once rather than at each call site. */
export const phaseCompleteDetails: Record<CasePhaseId, string> = {
  RECEIVED: "The case has been read and triaged.",
  EVIDENCE: "Evidence collection is finished.",
  ASSESSMENT: "The assessment is recorded.",
  SERVICE: "The service track is chosen and the customer has accepted the quote.",
  PREREQUISITES: "Everything that has to be in place before work begins is in place.",
  PREPARATION: "The evidence pack is prepared and published.",
  SUBMISSION: "A submission has been recorded.",
  DECISION: "The result has been recorded.",
  COMPLETE: "The case is closed.",
}

export const phaseUpcomingDetails: Record<CasePhaseId, string> = {
  RECEIVED: "Not started.",
  EVIDENCE: "No evidence has been asked for yet.",
  ASSESSMENT: "Nothing to assess yet.",
  SERVICE: "No service has been chosen yet.",
  PREREQUISITES: "Nothing has been asked of the customer yet.",
  PREPARATION: "No pack has been started yet.",
  SUBMISSION: "Nothing has been submitted.",
  DECISION: "There is no decision to wait for yet.",
  COMPLETE: "The case is still open.",
}

export function isTechnicalStage(value: string): value is TechnicalStage {
  return (technicalStages as readonly string[]).includes(value)
}

/** Position in the journey, used to decide what a phase has already passed. */
export function phaseOrdinal(phase: CasePhaseId): number {
  return casePhaseIds.indexOf(phase)
}

/**
 * The phase for a stage. An unrecognised stage resolves to `RECEIVED` rather
 * than throwing, because a stage this build does not know about is a reason
 * to show the case plainly, not a reason to fail the page.
 */
export function phaseForStage(stage: string): CasePhaseId {
  return isTechnicalStage(stage) ? phaseByStage[stage] : "RECEIVED"
}

export function stageLabel(stage: string): string {
  return isTechnicalStage(stage) ? technicalStageLabels[stage] : stage
}
