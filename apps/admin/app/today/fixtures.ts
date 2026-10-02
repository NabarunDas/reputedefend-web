/**
 * A working day, as the workbench would actually find it.
 *
 * Every flow here comes out of `resolveCaseFlow` reading a real fact tree,
 * for the reason the cockpit fixtures give: a hand-written `CaseFlowModel`
 * lets a page test pass against a shape the resolver never produces, which is
 * the divergence UX-1 exists to prevent. The facts are reused from the
 * cockpit and queue fixtures wherever the state already exists there, so all
 * three surfaces are demonstrably describing the same cases.
 *
 * Test-only. Nothing in the application imports this file.
 */

import { cockpitScenarios, componentScenarios, facts, flowFrom } from "../cases/[id]/cockpit/fixtures"
import { caseRow } from "../cases/queue-fixtures"
import type { CaseFlowFacts, CaseFlowModel } from "@/lib/case-flow/model"
import type { CaseRow } from "@/lib/cases/model"
import type { DashboardFacts } from "@/lib/today/model"

export { NOW } from "../cases/[id]/cockpit/fixtures"

/** The instant the cockpit fixtures are resolved against, as a `Date`. */
export const NOW_DATE = new Date("2026-06-01T12:00:00.000Z")
const PAST = "2026-05-01T12:00:00.000Z"
const FUTURE = "2026-07-01T12:00:00.000Z"

export type TodayEntry = { row: CaseRow; flow: CaseFlowModel }

let counter = 0
const nextId = () => `${(counter += 1).toString(16).padStart(8, "0")}-9999-4999-8999-999999999999`

/**
 * The row and the flow describe the same case, which is worth being strict
 * about: an action's destination is built from the case identifier, so
 * fixtures that let the two drift would accept links the operator could
 * never follow.
 */
export function entry(input: CaseFlowFacts, row: Partial<CaseRow> = {}): TodayEntry {
  const id = nextId()
  const reference = row.reference ?? input.reference
  return { row: caseRow({ ...row, id, reference }), flow: flowFrom({ ...input, caseId: id, reference }) }
}

const delivered = {
  id: "communication-1",
  templateKey: "EVIDENCE_REQUEST",
  lifecycle: "QUEUED",
  deliveryStatus: "DELIVERED",
  legacyStatus: null,
  draftedAt: PAST,
}

const openRequest = { id: "request-1", status: "OPEN", dueAt: null, createdAt: PAST }

function uploaded(overrides: Record<string, string | null> = {}) {
  return {
    documentId: "document-1",
    versionId: "version-1",
    evidenceRequestId: "request-1",
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    reviewStatus: "UNREVIEWED",
    ...overrides,
  }
}

/** A malware hit on an upload: the highest band the model has. */
const evidenceThreat: CaseFlowFacts = facts({
  technicalStage: "EVIDENCE_COLLECTION",
  evidence: { requests: [openRequest], versions: [uploaded({ scanStatus: "THREATS_FOUND" })] },
  communications: [delivered],
})

/** A file still in the scanner: nobody can hurry it, so it is a system wait. */
const evidenceScanRunning: CaseFlowFacts = facts({
  technicalStage: "EVIDENCE_COLLECTION",
  evidence: { requests: [openRequest], versions: [uploaded({ scanStatus: "PENDING" })] },
  communications: [delivered],
})

/** A follow-up somebody set on the Google submission, now past its date. */
const googleFollowUpOverdue: CaseFlowFacts = {
  ...cockpitScenarios.waitingForGoogle,
  tasks: [{ id: "task-1", title: "Chase the submission", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: PAST }],
}

/** The same submission with the follow-up still ahead: a dated wait. */
const googleFollowUpAhead: CaseFlowFacts = {
  ...cockpitScenarios.waitingForGoogle,
  tasks: [{ id: "task-2", title: "Chase the submission", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: FUTURE }],
}

/**
 * Named the way an operator would describe the case, not the way the model
 * identifies the action.
 */
export const todayScenarios = {
  safetyEvidenceThreat: entry(evidenceThreat, { reference: "PR-2001", business: "Harbour Dental" }),
  safetyPermissionInvalidated: entry(cockpitScenarios.managedPermissionInReview, { reference: "PR-2002", track: "MANAGED" }),

  adminReviewNewCase: entry(cockpitScenarios.newCase, { reference: "PR-2003" }),
  adminApprovePack: entry(cockpitScenarios.preparationApprovePack, { reference: "PR-2004" }),
  adminFurtherReview: entry(cockpitScenarios.furtherReview, { reference: "PR-2005" }),

  journeyRequestEvidence: entry(cockpitScenarios.evidenceNothingAskedFor, { reference: "PR-2006" }),
  journeyFollowUpGoogleOverdue: entry(googleFollowUpOverdue, { reference: "PR-2007" }),

  progressionRecordSubmission: entry(cockpitScenarios.readyToSubmitRecordSubmission, { reference: "PR-2008" }),
  progressionCloseCase: entry(cockpitScenarios.outcomeReview, { reference: "PR-2009" }),

  waitingOnCustomer: entry(cockpitScenarios.evidenceWaitingForCustomer, { reference: "PR-2010" }),
  waitingOnCustomerOverdue: entry(componentScenarios.evidenceRequestOverdue, { reference: "PR-2011" }),
  waitingOnAgreement: entry(cockpitScenarios.managedWaitingForAgreement, { reference: "PR-2012", track: "MANAGED" }),
  waitingOnGoogle: entry(cockpitScenarios.waitingForGoogle, { reference: "PR-2013" }),
  waitingOnGoogleDated: entry(googleFollowUpAhead, { reference: "PR-2014" }),
  waitingOnScan: entry(evidenceScanRunning, { reference: "PR-2015" }),

  blockedCommercialUnknown: entry(componentScenarios.commercialPositionUnknown, { reference: "PR-2016" }),

  closedCase: entry(cockpitScenarios.closedSuccessfully, { reference: "PR-2017", status: "CLOSED", stage: "FINISHED" }),
} satisfies Record<string, TodayEntry>

export type TodayScenarioName = keyof typeof todayScenarios

export const todayEntries = Object.values(todayScenarios)

/** The two arguments the work model takes, from a set of entries. */
export function population(entries: readonly TodayEntry[]) {
  return {
    rows: entries.map(item => item.row),
    flows: new Map(entries.map(item => [item.row.id, item.flow])),
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const zeroAttention = {
  overdueWork: { count: 0 },
  unassignedEnquiries: { count: 0 },
  missedGuardChecks: { count: 0 },
  unreviewedGuardAlerts: { count: 0 },
  guardAlertsNeedsReview: { count: 0 },
  failedCustomerEmail: { count: 0 },
  accessRecovery: { count: 0 },
  contactRecovery: { count: 0 },
  paymentExceptions: { count: 0 },
  guardBillingExceptions: { count: 0 },
  failedJobs: { count: 0 },
}

const metrics = {
  clientsTotal: { count: 42 },
  clientsActiveService: { count: 11 },
  contactsEnquiryOnly: { count: 9 },
  openEnquiries: { count: 4 },
  openCases: { count: 17 },
  collectedGross: { count: 3, amounts: [{ currency: "GBP", amountMinor: 125000 }] },
  collectedRefunds: { count: 0, amounts: [] },
  collectedNet: { count: 3, amounts: [{ currency: "GBP", amountMinor: 125000 }, { currency: "USD", amountMinor: 30000 }] },
  outstandingMoney: { count: 2, amounts: [{ currency: "GBP", amountMinor: 49800 }] },
  guardPaidActive: { count: 6 },
  guardIncludedActive: { count: 2 },
  guardRecurring: { count: 6, amounts: [{ currency: "GBP", amountMinor: 18000 }] },
  checkCoverage: { numerator: 1, denominator: 2, percentage: 50 },
}

export function dashboard(overrides: Partial<DashboardFacts> = {}): DashboardFacts {
  return {
    computedAt: "2026-06-01T12:00:00.000Z",
    timezone: "Europe/London",
    freshness: { status: "HEALTHY", lastStartedAt: "2026-06-01T11:00:00.000Z", lateAfterSeconds: 93600 },
    monitoringScheduleConfigured: false,
    needsAttention: { ...zeroAttention },
    metrics: { ...metrics },
    secondary: {},
    ...overrides,
  }
}

export const busyAttention = {
  ...zeroAttention,
  unassignedEnquiries: { count: 3 },
  missedGuardChecks: { count: 2 },
  failedCustomerEmail: { count: 1 },
  paymentExceptions: { count: 4 },
  failedJobs: { count: 5 },
}

export const guardWindows = [
  { id: "66666666-6666-4666-8666-666666666666", windowCode: "MORNING", state: "COMPLETED" },
  { id: "77777777-7777-4777-8777-777777777777", windowCode: "EVENING", state: "PENDING" },
]

export const upcomingDeadlines = [
  {
    id: "task-9",
    title: "Send the follow-up pack",
    dueAt: FUTURE,
    caseId: "88888888-8888-4888-8888-888888888888",
    reference: "PR-2099",
  },
]
