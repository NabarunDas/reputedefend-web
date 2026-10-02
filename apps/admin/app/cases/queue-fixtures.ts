/**
 * The seventeen case states the queue is accepted against.
 *
 * As in the cockpit, every model comes from `resolveCaseFlow` reading a real
 * fact tree rather than from a hand-written `CaseFlowModel`: a queue that
 * rendered a shape the resolver never produces would pass its tests and still
 * be wrong in front of an operator. The facts themselves are reused from the
 * cockpit fixtures wherever the state already exists there, so the two
 * surfaces are demonstrably describing the same cases.
 *
 * Each entry pairs the flow with the case list row the database returns, since
 * the queue reads assignment and priority from the row and everything else
 * from the model.
 *
 * Test-only. Nothing in the application imports this file.
 */

import { cockpitScenarios, componentScenarios, flowFrom } from "./[id]/cockpit/fixtures"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { CaseRow } from "@/lib/cases/model"
import type { CaseQueueEntry } from "./queue"

export { NOW } from "./[id]/cockpit/fixtures"

const PAST = "2026-05-01T12:00:00.000Z"

let counter = 0
const nextId = () => `${(counter += 1).toString(16).padStart(8, "0")}-5555-4555-8555-555555555555`

export function caseRow(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    id: nextId(),
    reference: "PR-1042",
    type: "PROFILE_RECOVERY",
    stage: "INITIAL_REVIEW",
    track: "UNDECIDED",
    status: "UNDER_REVIEW",
    client: "Alex Mercer",
    business: "Mercer Bakery",
    assigned: true,
    priority: "NORMAL",
    // The queue must not read either of these; they are here because the
    // database returns them and a test should notice if they reappear.
    nextAction: "Ring the customer about the bill",
    due: "2026-05-20T09:00:00.000Z",
    createdAt: "2026-05-18T10:00:00.000Z",
    ...overrides,
  } as CaseRow
}

export function entry(facts: CaseFlowFacts, row: Partial<CaseRow> = {}): CaseQueueEntry {
  return { row: caseRow({ reference: row.reference ?? "PR-1042", ...row }), flow: flowFrom(facts) }
}

/** A case whose evidence request passed its date, so the step is late. */
const overdueEvidence = componentScenarios.evidenceRequestOverdue

const reopenedCase: CaseFlowFacts = {
  ...cockpitScenarios.furtherReview,
  reopened: true,
}

const withComplaint: CaseFlowFacts = {
  ...cockpitScenarios.preparationApprovePack,
  complaints: { complete: true, open: [{ id: "complaint-1", dueAt: PAST }] },
}

/**
 * Named the way an operator would describe the row, not the way the database
 * stores it.
 */
export const queueScenarios: Record<string, CaseQueueEntry> = {
  newCaseToTriage: entry(cockpitScenarios.newCase, { reference: "PR-1001" }),

  waitingOnTheCustomer: entry(cockpitScenarios.evidenceWaitingForCustomer, { reference: "PR-1002" }),

  evidenceOverdue: entry(overdueEvidence, { reference: "PR-1003" }),

  blockedOnAScanFailure: entry(cockpitScenarios.evidenceScanProblem, { reference: "PR-1004" }),

  guidedNeedingAQuote: entry(cockpitScenarios.serviceNeedsQuote, { reference: "PR-1005", track: "GUIDED" }),

  commercialPositionUnknown: entry(componentScenarios.commercialPositionUnknown, { reference: "PR-1006" }),

  guidedWaitingForPayment: entry(cockpitScenarios.guidedWaitingForPayment, {
    reference: "PR-1007", track: "GUIDED", priority: "HIGH",
  }),

  managedWaitingForAgreement: entry(cockpitScenarios.managedWaitingForAgreement, {
    reference: "PR-1008", track: "MANAGED",
  }),

  managedPermissionInReview: entry(cockpitScenarios.managedPermissionInReview, {
    reference: "PR-1009", track: "MANAGED", priority: "URGENT",
  }),

  packToApprove: entry(cockpitScenarios.preparationApprovePack, { reference: "PR-1010" }),

  readyToSubmit: entry(cockpitScenarios.readyToSubmitRecordSubmission, { reference: "PR-1011" }),

  waitingForGoogle: entry(cockpitScenarios.waitingForGoogle, { reference: "PR-1012" }),

  reopenedAfterClosure: entry(reopenedCase, { reference: "PR-1013" }),

  openComplaintAlongside: entry(withComplaint, { reference: "PR-1014" }),

  unassigned: entry(cockpitScenarios.evidenceNothingAskedFor, { reference: "PR-1015", assigned: false }),

  closedSuccessfully: entry(cockpitScenarios.closedSuccessfully, {
    reference: "PR-1016", status: "CLOSED", stage: "FINISHED",
  }),

  closedWithAComplaint: entry(cockpitScenarios.closedWithOpenComplaint, {
    reference: "PR-1017", status: "CLOSED", stage: "FINISHED",
  }),
}

export const queueEntries = Object.values(queueScenarios)
