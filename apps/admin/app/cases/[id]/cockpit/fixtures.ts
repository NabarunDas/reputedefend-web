/**
 * Cases to render the cockpit against, in the states operators actually see.
 *
 * Every model here is produced by `resolveCaseFlow` from a real
 * `CaseFlowFacts` tree, not hand-written. A hand-written `CaseFlowModel`
 * would let a component test pass against a shape the resolver never
 * produces, which is exactly the divergence UX-1 exists to prevent — so the
 * fixtures state facts and let the model answer.
 *
 * Test-only. Nothing in the application imports this file.
 */

import { resolveCaseFlow } from "@/lib/case-flow/resolve"
import type {
  CaseFlowAuthorizationFact,
  CaseFlowCommunicationFact,
  CaseFlowEvidenceRequestFact,
  CaseFlowEvidenceVersionFact,
  CaseFlowFacts,
  CaseFlowModel,
  CaseFlowOrderFact,
  CaseFlowQuoteFact,
} from "@/lib/case-flow/model"
import type { CaseDetail } from "@/lib/cases/model"

export const CASE_ID = "55555555-5555-4555-8555-555555555555"
export const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222"
export const BUSINESS_ID = "33333333-3333-4333-8333-333333333333"
export const LOCATION_ID = "44444444-4444-4444-8444-444444444444"

export const NOW = "2026-06-01T12:00:00.000Z"
const PAST = "2026-05-01T12:00:00.000Z"
const FUTURE = "2026-07-01T12:00:00.000Z"

/** `admin_private.case_transitions`, so no fixture invents an illegal move. */
const transitionMatrix: Record<string, string[]> = {
  INITIAL_REVIEW: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"],
  EVIDENCE_COLLECTION: ["ASSESSMENT_READY"],
  ASSESSMENT_READY: ["EVIDENCE_COLLECTION", "SERVICE_SELECTION"],
  SERVICE_SELECTION: ["AUTHORIZATION_REQUIRED", "PAYMENT_REQUIRED"],
  PAYMENT_REQUIRED: ["PREPARATION"],
  AUTHORIZATION_REQUIRED: ["PREPARATION"],
  PREPARATION: ["EVIDENCE_COLLECTION", "READY_TO_SUBMIT"],
  READY_TO_SUBMIT: [],
  SUBMITTED: ["OUTCOME_REVIEW", "WAITING_GOOGLE"],
  WAITING_GOOGLE: ["FURTHER_REVIEW", "OUTCOME_REVIEW", "OWNER_ACTION"],
  OWNER_ACTION: ["FURTHER_REVIEW", "WAITING_GOOGLE"],
  FURTHER_REVIEW: ["OUTCOME_REVIEW", "PREPARATION"],
  OUTCOME_REVIEW: ["FURTHER_REVIEW"],
  FINISHED: [],
}

function authorization(overrides: Partial<CaseFlowAuthorizationFact> = {}): CaseFlowAuthorizationFact {
  return {
    membershipStatus: "pending",
    customerEmailVerified: false,
    businessAuthorityVerified: false,
    serviceAgreementAccepted: false,
    caseManagementPermissionActive: false,
    managerAccessVerified: false,
    authorizationReady: false,
    reviewRequired: [],
    agreementKinds: [],
    hasLocation: true,
    ...overrides,
  }
}

function fullyAuthorised(overrides: Partial<CaseFlowAuthorizationFact> = {}): CaseFlowAuthorizationFact {
  return authorization({
    membershipStatus: "verified",
    customerEmailVerified: true,
    businessAuthorityVerified: true,
    serviceAgreementAccepted: true,
    caseManagementPermissionActive: true,
    managerAccessVerified: true,
    authorizationReady: true,
    agreementKinds: ["SERVICE_AGREEMENT", "CASE_MANAGEMENT_PERMISSION"],
    ...overrides,
  })
}

function request(overrides: Partial<CaseFlowEvidenceRequestFact> = {}): CaseFlowEvidenceRequestFact {
  return { id: "request-1", status: "OPEN", dueAt: null, createdAt: PAST, ...overrides }
}

function upload(overrides: Partial<CaseFlowEvidenceVersionFact> = {}): CaseFlowEvidenceVersionFact {
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

function message(overrides: Partial<CaseFlowCommunicationFact> = {}): CaseFlowCommunicationFact {
  return {
    id: "communication-1",
    templateKey: "EVIDENCE_REQUEST",
    lifecycle: "DRAFT",
    deliveryStatus: "NONE",
    legacyStatus: null,
    draftedAt: PAST,
    ...overrides,
  }
}

const delivered = message({ lifecycle: "QUEUED", deliveryStatus: "DELIVERED" })

function quote(overrides: Partial<CaseFlowQuoteFact> = {}): CaseFlowQuoteFact {
  return {
    id: "quote-1",
    status: "DRAFT",
    taxBehaviour: "INCLUSIVE",
    validUntil: FUTURE,
    actionStatus: null,
    actionExpiresAt: null,
    orderId: null,
    ...overrides,
  }
}

function order(overrides: Partial<CaseFlowOrderFact> = {}): CaseFlowOrderFact {
  return {
    orderId: "order-1",
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    obligationKind: "UPFRONT",
    obligationState: "DUE",
    setupReady: false,
    consentRecorded: false,
    receiptRecorded: false,
    ...overrides,
  }
}

function pack(overrides: Partial<CaseFlowFacts["packs"]["packs"][number]> = {}) {
  return { id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 1, ...overrides }
}

export function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  const stage = overrides.technicalStage ?? "INITIAL_REVIEW"
  return {
    caseId: CASE_ID,
    reference: "PR-1042",
    caseType: "PROFILE_RECOVERY",
    technicalStage: stage,
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "UNDECIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    locationId: LOCATION_ID,
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: transitionMatrix[stage] ?? [],
    reopened: false,
    tasks: [],
    submissions: [],
    authorization: authorization(),
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    ...overrides,
  }
}

function guided(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return facts({
    serviceTrack: "GUIDED",
    commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
    payment: { complete: true, orders: [order()] },
    evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED" })] },
    communications: [delivered],
    ...overrides,
  })
}

function managed(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return facts({
    serviceTrack: "MANAGED",
    commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
    payment: {
      complete: true,
      orders: [order({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })],
    },
    evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED" })] },
    communications: [delivered],
    ...overrides,
  })
}

const managedPaymentDone: CaseFlowFacts["payment"] = {
  complete: true,
  orders: [order({
    paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null,
    setupReady: true, consentRecorded: true,
  })],
}

/** Guided, paid, with accepted evidence behind it. */
function paidGuided(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return guided({
    payment: { complete: true, orders: [order({ obligationState: "PAID" })] },
    ...overrides,
  })
}

export function flowFrom(input: CaseFlowFacts): CaseFlowModel {
  return resolveCaseFlow(input, NOW)
}

/**
 * The sixteen case states the cockpit is accepted against, keyed by the way
 * an operator would describe them.
 */
export const cockpitScenarios = {
  newCase: facts(),

  evidenceNothingAskedFor: facts({ technicalStage: "EVIDENCE_COLLECTION" }),

  evidenceWaitingForCustomer: facts({
    technicalStage: "EVIDENCE_COLLECTION",
    evidence: { requests: [request()], versions: [] },
    communications: [delivered],
  }),

  evidenceScanProblem: facts({
    technicalStage: "EVIDENCE_COLLECTION",
    evidence: { requests: [request()], versions: [upload({ scanStatus: "FAILED" })] },
    communications: [delivered],
  }),

  serviceNeedsQuote: facts({
    technicalStage: "SERVICE_SELECTION",
    serviceTrack: "GUIDED",
    evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED" })] },
    communications: [delivered],
  }),

  managedWaitingForAgreement: managed({
    technicalStage: "AUTHORIZATION_REQUIRED",
    authorization: authorization({ membershipStatus: "verified", customerEmailVerified: true, businessAuthorityVerified: true, agreementKinds: ["SERVICE_AGREEMENT"] }),
    customerActions: [{ id: "action-1", kind: "AGREEMENT_ACCEPTANCE", agreementKind: "SERVICE_AGREEMENT", status: "OPEN", expiresAt: FUTURE }],
  }),

  managedPermissionInReview: managed({
    technicalStage: "AUTHORIZATION_REQUIRED",
    authorization: fullyAuthorised({ reviewRequired: ["CASE_MANAGEMENT_PERMISSION"], caseManagementPermissionActive: false, authorizationReady: false }),
    payment: managedPaymentDone,
  }),

  guidedWaitingForPayment: guided({
    technicalStage: "PAYMENT_REQUIRED",
    payment: { complete: true, orders: [order({ obligationState: "COLLECTING" })] },
  }),

  preparationApprovePack: paidGuided({
    technicalStage: "PREPARATION",
    packs: { packs: [pack()], eligibleCount: 1 },
  }),

  readyToSubmitNeedsPublish: paidGuided({
    technicalStage: "READY_TO_SUBMIT",
    packs: { packs: [pack({ status: "APPROVED" })], eligibleCount: 1 },
  }),

  readyToSubmitRecordSubmission: paidGuided({
    technicalStage: "READY_TO_SUBMIT",
    packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
  }),

  waitingForGoogle: paidGuided({
    technicalStage: "WAITING_GOOGLE",
    packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
    submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
  }),

  furtherReview: paidGuided({
    technicalStage: "FURTHER_REVIEW",
    packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
    submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
  }),

  outcomeReview: paidGuided({
    technicalStage: "OUTCOME_REVIEW",
    packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
    submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
  }),

  closedSuccessfully: paidGuided({
    technicalStage: "FINISHED",
    caseStatus: "CLOSED",
    outcome: "RESTORED",
    outcomeSummary: "The profile was reinstated by Google.",
    packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
    submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
  }),

  closedWithOpenComplaint: paidGuided({
    technicalStage: "FINISHED",
    caseStatus: "CLOSED",
    outcome: "NOT_RESTORED",
    outcomeSummary: "Google declined the appeal.",
    packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
    submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    complaints: { complete: true, open: [{ id: "complaint-1", dueAt: FUTURE }] },
  }),
} satisfies Record<string, CaseFlowFacts>

export type CockpitScenarioName = keyof typeof cockpitScenarios

/**
 * Two more states the sixteen above do not reach, needed because the next
 * action card has to be right about them too: an action the model marks as
 * blocked, and one carrying a date that has passed.
 */
export const componentScenarios = {
  commercialPositionUnknown: facts({
    technicalStage: "SERVICE_SELECTION",
    serviceTrack: "GUIDED",
    commercial: { complete: false, quotes: [] },
    evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED" })] },
    communications: [delivered],
  }),

  evidenceRequestOverdue: facts({
    technicalStage: "EVIDENCE_COLLECTION",
    evidence: { requests: [request({ dueAt: PAST })], versions: [] },
    communications: [delivered],
  }),
} satisfies Record<string, CaseFlowFacts>

/**
 * The legacy case object the page still needs for the original request, the
 * forms, the tasks, the submissions and the history. Kept deliberately
 * separate from the facts above: the page reads both, and the point of the
 * cockpit is that it never confuses one for the other.
 */
export function caseDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: CASE_ID,
    reference: "PR-1042",
    client: "Alex Mercer",
    business: "Mercer Bakery",
    type: "PROFILE_RECOVERY",
    stage: "INITIAL_REVIEW",
    track: "UNDECIDED",
    status: "UNDER_REVIEW",
    priority: "NORMAL",
    assigned: true,
    nextAction: "",
    due: null,
    createdAt: "2026-05-18T10:00:00.000Z",
    version: 1,
    outcome: null,
    summary: "",
    priorityReason: "",
    firstResponseDue: null,
    issue: "The business profile was suspended without warning.",
    reviewUrl: null,
    customerId: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    locationId: LOCATION_ID,
    events: [],
    tasks: [],
    submissions: [],
    transitions: [],
    customerPreview: { reference: "PR-1042", type: "PROFILE_RECOVERY", summary: "", notes: [] },
    ...overrides,
  } as CaseDetail
}
