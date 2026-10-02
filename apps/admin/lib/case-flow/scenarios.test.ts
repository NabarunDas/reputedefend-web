/**
 * Named case journeys.
 *
 * Each one is a complete set of facts plus what the model should say about
 * them, named the way an operator would describe the case rather than the
 * way the database stores it. The list is meant to be read as a
 * specification: if a case can be in a state, it should be in here.
 */

import { describe, expect, it } from "vitest"
import { stages } from "../cases/model"
import { actionCatalogue } from "./actions"
import { isInternalPath } from "./destinations"
import { blockerCatalogue } from "./notices"
import { casePhaseIds } from "./phases"
import { resolveCaseFlow } from "./resolve"
import type {
  CaseActionState,
  CaseFlowAuthorizationFact,
  CaseFlowCommunicationFact,
  CaseFlowCustomerActionFact,
  CaseFlowEvidenceRequestFact,
  CaseFlowEvidenceVersionFact,
  CaseFlowFacts,
  CaseFlowModel,
  CaseFlowOrderFact,
  CaseFlowQuoteFact,
  CaseNextActionId,
  CaseWaitingOn,
} from "./model"
import type { CasePhaseId } from "./phases"

const CASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111"
const BUSINESS_ID = "22222222-2222-2222-2222-222222222222"
const LOCATION_ID = "33333333-3333-3333-3333-333333333333"

const NOW = "2026-06-01T12:00:00.000Z"
const PAST = "2026-05-01T12:00:00.000Z"
const FUTURE = "2026-07-01T12:00:00.000Z"

/**
 * `admin_private.case_transitions`, mirrored so a fixture cannot invent a
 * transition the database would refuse. If the migration changes, the test
 * that compares the two fails.
 */
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

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

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

/**
 * The two facts `create_quote_acceptance_action` insists on before it will
 * issue a customer link: a verified email and a verified membership.
 */
function trusted(overrides: Partial<CaseFlowAuthorizationFact> = {}): CaseFlowAuthorizationFact {
  return authorization({
    membershipStatus: "verified",
    customerEmailVerified: true,
    businessAuthorityVerified: true,
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

function requestMessage(overrides: Partial<CaseFlowCommunicationFact> = {}): CaseFlowCommunicationFact {
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

const delivered = requestMessage({ lifecycle: "QUEUED", deliveryStatus: "DELIVERED" })

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

function customerAction(overrides: Partial<CaseFlowCustomerActionFact> = {}): CaseFlowCustomerActionFact {
  return { id: "action-1", kind: "AGREEMENT_ACCEPTANCE", agreementKind: null, status: "OPEN", expiresAt: FUTURE, ...overrides }
}

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  const stage = overrides.technicalStage ?? "INITIAL_REVIEW"
  return {
    caseId: CASE_ID,
    reference: "CASE-0001",
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
    // The deployment as it actually stands: Stripe test mode is available,
    // live customer mail is not, and there is no Google transport at all.
    capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    ...overrides,
  }
}

/** Guided, assessed, quote accepted, order raised: the usual way in. */
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

/** Managed, quote accepted, success-fee order raised, nothing verified. */
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

/** A success-fee order with consent given and a usable method saved. */
const managedPaymentDone: CaseFlowFacts["payment"] = {
  complete: true,
  orders: [order({
    paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null,
    setupReady: true, consentRecorded: true,
  })],
}

function managedReady(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return managed({ authorization: fullyAuthorised(), payment: managedPaymentDone, ...overrides })
}

function pack(overrides: Partial<CaseFlowFacts["packs"]["packs"][number]> = {}) {
  return { id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 1, ...overrides }
}

/** Guided, paid, with accepted evidence: ready to start preparing. */
function prepared(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return guided({
    technicalStage: "PREPARATION",
    payment: { complete: true, orders: [order({ obligationState: "PAID" })] },
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

type Scenario = {
  name: string
  facts: CaseFlowFacts
  primary: CaseNextActionId | null
  waitingOn?: CaseWaitingOn
  state?: CaseActionState
  phase?: CasePhaseId
  blockers?: string[]
  attention?: string[]
  overdue?: boolean
  check?: (model: CaseFlowModel) => void
}

const scenarios: Scenario[] = [
  // --- Received -----------------------------------------------------------
  {
    name: "a case nobody has looked at yet",
    facts: facts(),
    primary: "REVIEW_NEW_CASE",
    waitingOn: "ADMIN",
    phase: "RECEIVED",
    check: model => {
      expect(model.progressSummary).toEqual({ completed: 0, total: 9 })
      expect(model.phases[0].state).toBe("CURRENT")
    },
  },
  {
    name: "a new case whose planned next action has already slipped",
    facts: facts({ plannedNextAction: "Call the customer", plannedNextActionDueAt: PAST }),
    primary: "REVIEW_NEW_CASE",
    attention: ["PLANNED_ACTION_OVERDUE"],
  },
  {
    name: "a new case with an overdue task, which is noted but does not take over",
    facts: facts({
      tasks: [{ id: "task-1", title: "Chase", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: PAST }],
    }),
    primary: "REVIEW_NEW_CASE",
    attention: ["TASK_OVERDUE"],
  },
  {
    name: "a new case with an open complaint, which is noted but does not take over",
    facts: facts({ complaints: { complete: true, open: [{ id: "complaint-1", dueAt: FUTURE }] } }),
    primary: "REVIEW_NEW_CASE",
    attention: ["COMPLAINT_OPEN"],
  },

  // --- Evidence -----------------------------------------------------------
  {
    name: "collecting evidence with nothing asked for yet",
    facts: facts({ technicalStage: "EVIDENCE_COLLECTION" }),
    primary: "REQUEST_EVIDENCE",
    waitingOn: "ADMIN",
    phase: "EVIDENCE",
  },
  {
    name: "an evidence request raised but the customer never written to",
    facts: facts({ technicalStage: "EVIDENCE_COLLECTION", evidence: { requests: [request()], versions: [] } }),
    primary: "PREPARE_EVIDENCE_REQUEST_MESSAGE",
    waitingOn: "ADMIN",
    attention: ["EVIDENCE_REQUEST_NOT_SENT"],
  },
  {
    name: "the evidence request message drafted and waiting to be checked",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "DRAFT" })],
    }),
    primary: "REVIEW_EVIDENCE_REQUEST_MESSAGE",
  },
  {
    name: "the message reviewed and ready to send, with live mail available",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "REVIEWED" })],
      capabilities: { liveMailEnabled: true, paymentsEnabled: true, googleSubmissionLive: false },
    }),
    primary: "SEND_EVIDENCE_REQUEST",
    state: "ACTION_REQUIRED",
  },
  {
    name: "the message reviewed but outgoing mail switched off in this deployment",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "REVIEWED" })],
    }),
    primary: "SEND_EVIDENCE_REQUEST",
    state: "BLOCKED",
    blockers: ["LIVE_MAIL_NOT_ENABLED"],
  },
  {
    name: "the message cancelled before it went anywhere",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "CANCELLED" })],
    }),
    primary: "PREPARE_EVIDENCE_REQUEST_MESSAGE",
  },
  {
    name: "the request queued with the email provider and no outcome back yet",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "QUEUED" })],
    }),
    primary: "WAIT_FOR_EMAIL_DELIVERY",
    waitingOn: "SYSTEM",
    state: "WAITING",
  },
  {
    name: "the request accepted by the email provider but not confirmed delivered",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "QUEUED", deliveryStatus: "PROVIDER_ACCEPTED" })],
    }),
    primary: "WAIT_FOR_EMAIL_DELIVERY",
    waitingOn: "SYSTEM",
    attention: ["EVIDENCE_DELIVERY_UNCONFIRMED"],
    check: model => expect(model.primaryAction?.description).toContain("not the same as delivered"),
  },
  {
    name: "the request whose provider acceptance was never established",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "QUEUED", deliveryStatus: "ACCEPTANCE_UNKNOWN" })],
    }),
    primary: "RECONCILE_EMAIL_DELIVERY",
    waitingOn: "ADMIN",
    state: "ACTION_REQUIRED",
    attention: ["EVIDENCE_DELIVERY_UNKNOWN"],
  },
  {
    name: "the request delivered and the customer has not uploaded anything",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [delivered],
    }),
    primary: "WAIT_FOR_CUSTOMER_EVIDENCE",
    waitingOn: "CUSTOMER",
  },
  {
    name: "the request delivered and past the date it was due",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request({ dueAt: PAST })], versions: [] },
      communications: [delivered],
    }),
    primary: "WAIT_FOR_CUSTOMER_EVIDENCE",
    overdue: true,
    attention: ["EVIDENCE_REQUEST_OVERDUE"],
  },
  {
    name: "the request bounced, so waiting for an upload is pointless",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "QUEUED", deliveryStatus: "BOUNCED" })],
    }),
    primary: "RECOVER_CUSTOMER_CONTACT",
    waitingOn: "ADMIN",
    attention: ["EVIDENCE_REQUEST_UNDELIVERED"],
  },
  {
    name: "the customer complained about the request email",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "QUEUED", deliveryStatus: "COMPLAINED" })],
    }),
    primary: "RECOVER_CUSTOMER_CONTACT",
  },
  {
    name: "the customer's address is suppressed by the email provider",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "QUEUED", deliveryStatus: "SUPPRESSED" })],
    }),
    primary: "RECOVER_CUSTOMER_CONTACT",
  },
  {
    name: "a bounce the provider may yet retry still means nobody has been reached",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [requestMessage({ lifecycle: "QUEUED", deliveryStatus: "TRANSIENT_BOUNCE" })],
    }),
    primary: "RECOVER_CUSTOMER_CONTACT",
  },
  {
    name: "an upload started but never finished",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: {
        requests: [request()],
        versions: [upload({ uploadStatus: "PENDING_UPLOAD", scanStatus: "PENDING", validationStatus: "PENDING" })],
      },
      communications: [delivered],
    }),
    primary: "WAIT_FOR_CUSTOMER_EVIDENCE",
    waitingOn: "CUSTOMER",
  },
  {
    name: "an upload that failed outright",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: {
        requests: [request()],
        versions: [upload({ uploadStatus: "FAILED", scanStatus: "PENDING", validationStatus: "PENDING" })],
      },
      communications: [delivered],
    }),
    primary: "WAIT_FOR_CUSTOMER_EVIDENCE",
  },
  {
    name: "a file uploaded and still being scanned for malware",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload({ scanStatus: "PENDING", validationStatus: "PENDING" })] },
      communications: [delivered],
    }),
    primary: "WAIT_FOR_EVIDENCE_SCAN",
    waitingOn: "SYSTEM",
  },
  {
    name: "a threat found in an uploaded file",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload({ scanStatus: "THREATS_FOUND" })] },
      communications: [delivered],
    }),
    primary: "RESOLVE_EVIDENCE_THREAT",
    blockers: ["EVIDENCE_THREAT_BLOCKED"],
    attention: ["EVIDENCE_THREAT_FOUND"],
    check: model => expect(model.phases[1].state).toBe("NEEDS_ATTENTION"),
  },
  {
    name: "a scan that could not run, which nothing retries on its own",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload({ scanStatus: "ACCESS_DENIED" })] },
      communications: [delivered],
    }),
    primary: "CHECK_EVIDENCE_SCAN",
    attention: ["EVIDENCE_SCAN_UNRESOLVED"],
  },
  {
    name: "a clean file whose contents are not what they claim to be",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload({ validationStatus: "INVALID" })] },
      communications: [delivered],
    }),
    primary: "REPLACE_INVALID_EVIDENCE",
    attention: ["EVIDENCE_CONTENT_INVALID"],
  },
  {
    name: "a clean, valid file waiting for somebody to accept or reject it",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload()] },
      communications: [delivered],
    }),
    primary: "REVIEW_EVIDENCE",
    waitingOn: "ADMIN",
  },
  {
    name: "evidence accepted but the request left open behind it",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload({ reviewStatus: "ACCEPTED" })] },
      communications: [delivered],
    }),
    primary: "FULFIL_EVIDENCE_REQUEST",
    attention: ["EVIDENCE_REQUEST_SATISFIED_BUT_OPEN"],
  },
  {
    name: "every evidence request closed off with accepted evidence behind it",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED" })] },
      communications: [delivered],
    }),
    primary: "ADVANCE_TO_ASSESSMENT",
  },
  {
    name: "a threat that has already been rejected stops being the headline",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: {
        requests: [request()],
        versions: [
          upload({ versionId: "version-1", scanStatus: "THREATS_FOUND", reviewStatus: "REJECTED" }),
          upload({ versionId: "version-2" }),
        ],
      },
      communications: [delivered],
    }),
    primary: "REVIEW_EVIDENCE",
  },
  {
    name: "a superseded earlier version is history, not outstanding work",
    facts: facts({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: {
        requests: [request({ status: "FULFILLED" })],
        versions: [
          upload({ versionId: "version-1", reviewStatus: "SUPERSEDED" }),
          upload({ versionId: "version-2", reviewStatus: "ACCEPTED" }),
        ],
      },
      communications: [delivered],
    }),
    primary: "ADVANCE_TO_ASSESSMENT",
  },

  // --- Assessment ---------------------------------------------------------
  {
    name: "ready to assess, with accepted evidence to assess",
    facts: facts({
      technicalStage: "ASSESSMENT_READY",
      evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED" })] },
    }),
    primary: "COMPLETE_ASSESSMENT",
    phase: "ASSESSMENT",
    waitingOn: "ADMIN",
  },
  {
    name: "ready to assess with nothing accepted to assess",
    facts: facts({ technicalStage: "ASSESSMENT_READY" }),
    primary: "REQUEST_EVIDENCE",
    blockers: ["NO_ACCEPTED_EVIDENCE"],
  },
  {
    name: "ready to assess with evidence still waiting on review",
    facts: facts({
      technicalStage: "ASSESSMENT_READY",
      evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED" }), upload({ versionId: "version-2" })] },
    }),
    primary: "REVIEW_EVIDENCE",
  },

  // --- Service ------------------------------------------------------------
  {
    name: "choosing the service with no track decided",
    facts: facts({ technicalStage: "SERVICE_SELECTION" }),
    primary: "SELECT_SERVICE",
    phase: "SERVICE",
    blockers: ["SERVICE_TRACK_UNDECIDED"],
  },
  {
    name: "a Guided case with no quote raised",
    facts: facts({ technicalStage: "SERVICE_SELECTION", serviceTrack: "GUIDED" }),
    primary: "CREATE_QUOTE",
  },
  {
    name: "a case whose quote could not be found in the capped quote list",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: false, quotes: [] },
    }),
    primary: "CONFIRM_COMMERCIAL_STATE",
    state: "BLOCKED",
    blockers: ["COMMERCIAL_STATE_UNKNOWN"],
    attention: ["COMMERCIAL_LIST_TRUNCATED"],
  },
  {
    name: "a draft quote whose tax treatment has not been confirmed",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ taxBehaviour: "UNCONFIRMED" })] },
    }),
    primary: "COMPLETE_QUOTE_CONFIGURATION",
    state: "BLOCKED",
    blockers: ["QUOTE_TAX_UNCONFIRMED"],
  },
  {
    name: "a draft quote that is configured and can go out",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote()] },
    }),
    primary: "OFFER_QUOTE",
  },
  {
    name: "a quote offered with no way for the customer to accept it",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      authorization: trusted(),
      commercial: { complete: true, quotes: [quote({ status: "OFFERED" })] },
    }),
    primary: "ISSUE_QUOTE_ACCEPTANCE",
  },
  // The database refuses to create a quote-acceptance action without a
  // verified email and a verified membership, so neither does the model.
  {
    name: "a Guided quote offered to a customer whose email is not verified",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "OFFERED" })] },
    }),
    primary: "VERIFY_CUSTOMER_CONTACT",
    waitingOn: "ADMIN",
    blockers: ["ACCEPTANCE_TRUST_INCOMPLETE"],
  },
  {
    name: "a Guided quote offered with the email verified but not the business authority",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      authorization: authorization({ customerEmailVerified: true }),
      commercial: { complete: true, quotes: [quote({ status: "OFFERED" })] },
    }),
    primary: "VERIFY_BUSINESS_AUTHORITY",
    blockers: ["ACCEPTANCE_TRUST_INCOMPLETE"],
  },
  {
    name: "a Managed quote offered to a customer whose email is not verified",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "MANAGED",
      commercial: { complete: true, quotes: [quote({ status: "OFFERED" })] },
    }),
    primary: "VERIFY_CUSTOMER_CONTACT",
    blockers: ["ACCEPTANCE_TRUST_INCOMPLETE"],
  },
  {
    name: "a Managed quote offered with the email verified but not the business authority",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "MANAGED",
      authorization: authorization({ customerEmailVerified: true }),
      commercial: { complete: true, quotes: [quote({ status: "OFFERED" })] },
    }),
    primary: "VERIFY_BUSINESS_AUTHORITY",
    blockers: ["ACCEPTANCE_TRUST_INCOMPLETE"],
  },
  {
    name: "a Managed quote offered once both trust facts are recorded",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "MANAGED",
      authorization: trusted(),
      commercial: { complete: true, quotes: [quote({ status: "OFFERED" })] },
    }),
    primary: "ISSUE_QUOTE_ACCEPTANCE",
  },
  // Preparing the commercial side is not gated on the trust facts; only
  // putting a link in front of the customer is.
  {
    name: "a draft quote can be configured before the customer is verified at all",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "MANAGED",
      commercial: { complete: true, quotes: [quote({ taxBehaviour: "UNCONFIRMED" })] },
    }),
    primary: "COMPLETE_QUOTE_CONFIGURATION",
  },
  {
    name: "a quote offered with an open acceptance link",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "OFFERED", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
    }),
    primary: "WAIT_FOR_QUOTE_ACCEPTANCE",
    waitingOn: "CUSTOMER",
    check: model => expect(model.primaryAction?.dueAt).toBe(FUTURE),
  },
  {
    name: "a quote whose acceptance link has expired",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      authorization: trusted(),
      commercial: { complete: true, quotes: [quote({ status: "OFFERED", actionStatus: "OPEN", actionExpiresAt: PAST })] },
      customerActions: [customerAction({ kind: "QUOTE_ACCEPTANCE", status: "OPEN", expiresAt: PAST })],
    }),
    primary: "ISSUE_QUOTE_ACCEPTANCE",
    attention: ["CUSTOMER_ACTION_EXPIRED"],
  },
  {
    name: "a quote the customer declined",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "DECLINED" })] },
    }),
    primary: "REVIEW_DECLINED_QUOTE",
    blockers: ["NO_ACCEPTED_ORDER"],
    attention: ["QUOTE_DECLINED"],
  },
  {
    name: "a quote that expired without being accepted",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "EXPIRED" })] },
    }),
    primary: "CREATE_QUOTE",
    attention: ["QUOTE_EXPIRED"],
  },
  {
    name: "a quote the customer accepted, so the case can move on",
    facts: facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
    }),
    primary: "ADVANCE_TO_PREREQUISITES",
  },

  // --- Guided prerequisites ----------------------------------------------
  {
    name: "a Guided case waiting for payment with no order behind it",
    facts: guided({ technicalStage: "PAYMENT_REQUIRED", commercial: { complete: true, quotes: [] }, payment: { complete: true, orders: [] } }),
    primary: "CREATE_QUOTE",
    phase: "PREREQUISITES",
    blockers: ["NO_ACCEPTED_ORDER"],
  },
  {
    name: "a Guided case whose order list came back incomplete",
    facts: guided({ technicalStage: "PAYMENT_REQUIRED", payment: { complete: false, orders: [] } }),
    primary: "CONFIRM_PAYMENT_STATE",
    state: "BLOCKED",
    blockers: ["PAYMENT_STATE_UNKNOWN"],
    attention: ["PAYMENT_LIST_TRUNCATED"],
  },
  {
    name: "a Guided case where the upfront payment has not been started",
    facts: guided({ technicalStage: "PAYMENT_REQUIRED" }),
    primary: "START_UPFRONT_PAYMENT",
    state: "ACTION_REQUIRED",
    blockers: ["UPFRONT_PAYMENT_OUTSTANDING"],
  },
  {
    name: "a Guided case where payment collection is switched off in the deployment",
    facts: guided({
      technicalStage: "PAYMENT_REQUIRED",
      capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    }),
    primary: "START_UPFRONT_PAYMENT",
    state: "BLOCKED",
    blockers: ["PAYMENTS_NOT_ENABLED"],
  },
  {
    name: "a Guided case with a payment link already out with the customer",
    facts: guided({
      technicalStage: "PAYMENT_REQUIRED",
      customerActions: [customerAction({ kind: "GUIDED_PAYMENT", status: "OPEN" })],
    }),
    primary: "WAIT_FOR_UPFRONT_PAYMENT",
    waitingOn: "CUSTOMER",
  },
  {
    name: "a Guided case where the customer finished checkout but nothing is collected yet",
    facts: guided({ technicalStage: "PAYMENT_REQUIRED", payment: { complete: true, orders: [order({ obligationState: "COLLECTING" })] } }),
    primary: "WAIT_FOR_UPFRONT_PAYMENT",
    waitingOn: "CUSTOMER",
    check: model => expect(model.primaryAction?.description).toContain("not payment"),
  },
  {
    name: "a Guided case whose payment attempt failed",
    facts: guided({ technicalStage: "PAYMENT_REQUIRED", payment: { complete: true, orders: [order({ obligationState: "FAILED" })] } }),
    primary: "RESOLVE_PAYMENT_EXCEPTION",
    attention: ["PAYMENT_FAILED"],
  },
  {
    name: "a Guided case whose payment needs the customer's bank to authenticate",
    facts: guided({ technicalStage: "PAYMENT_REQUIRED", payment: { complete: true, orders: [order({ obligationState: "AUTHENTICATION_REQUIRED" })] } }),
    primary: "RESOLVE_PAYMENT_EXCEPTION",
    attention: ["PAYMENT_AUTHENTICATION_REQUIRED"],
  },
  {
    name: "a Guided case whose payment the provider has confirmed",
    facts: guided({ technicalStage: "PAYMENT_REQUIRED", payment: { complete: true, orders: [order({ obligationState: "PAID", receiptRecorded: true })] } }),
    primary: "ADVANCE_TO_PREPARATION",
    check: model => {
      const group = model.prerequisites.find(entry => entry.id === "GUIDED_PAYMENT")
      expect(group?.satisfied).toBe(true)
    },
  },

  // --- Managed prerequisites ----------------------------------------------
  {
    name: "a Managed case with nothing verified yet",
    facts: managed({ technicalStage: "AUTHORIZATION_REQUIRED" }),
    primary: "VERIFY_CUSTOMER_CONTACT",
    phase: "PREREQUISITES",
    blockers: ["AUTHORISATION_INCOMPLETE"],
    check: model => {
      const group = model.prerequisites.find(entry => entry.id === "MANAGED_AUTHORISATION")
      expect(group?.items).toHaveLength(6)
      expect(group?.satisfied).toBe(false)
    },
  },
  {
    name: "a Managed case with the email verified but not the business authority",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: authorization({ customerEmailVerified: true }),
    }),
    primary: "VERIFY_BUSINESS_AUTHORITY",
  },
  {
    name: "a Managed case with both verified and no agreement issued",
    facts: managed({ technicalStage: "AUTHORIZATION_REQUIRED", authorization: trusted() }),
    primary: "ISSUE_SERVICE_AGREEMENT",
  },
  // The six prerequisites are worked one at a time, in the order the
  // operator walks them. A customer who is already holding something is
  // never handed the next thing as well.
  {
    name: "a Managed case where the agreement is out and the permission has not been issued",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: trusted(),
      customerActions: [customerAction({ agreementKind: "SERVICE_AGREEMENT", status: "OPEN" })],
    }),
    primary: "WAIT_FOR_SERVICE_AGREEMENT",
    waitingOn: "CUSTOMER",
  },
  {
    name: "a Managed case where the agreement is accepted and the permission has not been issued",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: trusted({ serviceAgreementAccepted: true }),
    }),
    primary: "ISSUE_CASE_PERMISSION",
    waitingOn: "ADMIN",
  },
  {
    name: "a Managed case where the permission is out with the customer",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: trusted({ serviceAgreementAccepted: true }),
      customerActions: [customerAction({ agreementKind: "CASE_MANAGEMENT_PERMISSION", status: "OPEN" })],
    }),
    primary: "WAIT_FOR_CASE_PERMISSION",
    waitingOn: "CUSTOMER",
  },
  {
    name: "a Managed case where the permission is accepted and Manager access is unrecorded",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: trusted({ serviceAgreementAccepted: true, caseManagementPermissionActive: true }),
    }),
    primary: "VERIFY_MANAGER_ACCESS",
    waitingOn: "ADMIN",
  },
  {
    name: "the payment-setup link does not overtake an agreement the customer still has",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: trusted({ managerAccessVerified: true }),
      customerActions: [customerAction({ agreementKind: "SERVICE_AGREEMENT", status: "OPEN" })],
    }),
    primary: "WAIT_FOR_SERVICE_AGREEMENT",
    waitingOn: "CUSTOMER",
  },
  {
    name: "a Managed case waiting on the customer for both agreements",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      payment: managedPaymentDone,
      authorization: trusted({ managerAccessVerified: true }),
      customerActions: [
        customerAction({ id: "action-1", agreementKind: "SERVICE_AGREEMENT", status: "OPEN" }),
        customerAction({ id: "action-2", agreementKind: "CASE_MANAGEMENT_PERMISSION", status: "OPEN" }),
      ],
    }),
    primary: "WAIT_FOR_SERVICE_AGREEMENT",
    waitingOn: "CUSTOMER",
  },
  {
    name: "a Managed case waiting only on the case-management permission",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      payment: managedPaymentDone,
      authorization: trusted({ serviceAgreementAccepted: true, managerAccessVerified: true }),
      customerActions: [customerAction({ agreementKind: "CASE_MANAGEMENT_PERMISSION", status: "OPEN" })],
    }),
    primary: "WAIT_FOR_CASE_PERMISSION",
    waitingOn: "CUSTOMER",
  },
  {
    name: "a Managed case with no location to verify Manager access against",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      locationId: null,
      authorization: trusted({
        serviceAgreementAccepted: true, caseManagementPermissionActive: true, hasLocation: false,
      }),
    }),
    primary: "CONFIRM_CASE_LOCATION",
    blockers: ["NO_LOCATION_RECORDED"],
  },
  {
    name: "a Managed case whose permission was invalidated after acceptance",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: trusted({
        serviceAgreementAccepted: true, managerAccessVerified: true,
        reviewRequired: ["CASE_MANAGEMENT_PERMISSION"],
      }),
    }),
    primary: "RESOLVE_AUTHORISATION_REVIEW",
    blockers: ["AUTHORISATION_IN_REVIEW"],
    attention: ["AUTHORISATION_REVIEW_REQUIRED"],
    check: model => {
      const group = model.prerequisites.find(entry => entry.id === "MANAGED_AUTHORISATION")
      const item = group?.items.find(entry => entry.id === "CASE_PERMISSION_ACTIVE")
      expect(item?.state).toBe("ATTENTION")
    },
  },
  {
    name: "a Managed case authorised but with no order to set payment up against",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: fullyAuthorised(),
      commercial: { complete: true, quotes: [] },
      payment: { complete: true, orders: [] },
    }),
    primary: "CREATE_QUOTE",
    blockers: ["NO_ACCEPTED_ORDER"],
  },
  {
    name: "a Managed case authorised with payment setup not started",
    facts: managed({ technicalStage: "AUTHORIZATION_REQUIRED", authorization: fullyAuthorised() }),
    primary: "START_MANAGED_PAYMENT_SETUP",
    state: "ACTION_REQUIRED",
    blockers: ["MANAGED_PAYMENT_SETUP_INCOMPLETE"],
  },
  {
    name: "a Managed case where payment collection is switched off in the deployment",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: fullyAuthorised(),
      capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    }),
    primary: "START_MANAGED_PAYMENT_SETUP",
    state: "BLOCKED",
    blockers: ["PAYMENTS_NOT_ENABLED"],
  },
  {
    name: "a Managed case with the payment-setup link out with the customer",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: fullyAuthorised(),
      customerActions: [customerAction({ kind: "MANAGED_PAYMENT_SETUP", status: "OPEN" })],
    }),
    primary: "WAIT_FOR_MANAGED_PAYMENT_SETUP",
    waitingOn: "CUSTOMER",
  },
  {
    name: "a Managed case where the setup link was used but no method was saved",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: fullyAuthorised(),
      customerActions: [customerAction({ kind: "MANAGED_PAYMENT_SETUP", status: "COMPLETED" })],
    }),
    primary: "RESOLVE_MANAGED_PAYMENT_EXCEPTION",
  },
  {
    name: "a Managed case where consent was given but no usable payment method exists",
    facts: managed({
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: fullyAuthorised(),
      payment: {
        complete: true,
        orders: [order({ paymentModel: "SUCCESS_FEE", obligationKind: null, obligationState: null, consentRecorded: true })],
      },
    }),
    primary: "RESOLVE_MANAGED_PAYMENT_EXCEPTION",
  },
  {
    name: "a Managed case with every prerequisite satisfied",
    facts: managedReady({ technicalStage: "AUTHORIZATION_REQUIRED" }),
    primary: "ADVANCE_TO_PREPARATION",
    check: model => {
      expect(model.prerequisites.map(group => group.satisfied)).toEqual([true, true])
    },
  },

  // --- Preparation ---------------------------------------------------------
  {
    name: "a prepared case with no pack started",
    facts: prepared(),
    primary: "CREATE_PREPARED_PACK",
    phase: "PREPARATION",
    blockers: ["NO_PUBLISHED_PACK"],
  },
  {
    name: "a prepared case with an empty draft pack",
    facts: prepared({ packs: { packs: [pack({ itemCount: 0 })], eligibleCount: 1 } }),
    primary: "ADD_PREPARED_PACK_ITEMS",
  },
  {
    name: "a draft pack with evidence in it, waiting for approval",
    facts: prepared({ packs: { packs: [pack()], eligibleCount: 1 } }),
    primary: "APPROVE_PREPARED_PACK",
    waitingOn: "ADMIN",
  },
  {
    name: "an approved pack the customer cannot see yet",
    facts: prepared({ packs: { packs: [pack({ status: "APPROVED" })], eligibleCount: 1 } }),
    primary: "PUBLISH_PREPARED_PACK",
    blockers: ["NO_PUBLISHED_PACK"],
  },
  {
    name: "a published pack, so the case is internally ready",
    facts: prepared({ packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 } }),
    primary: "ADVANCE_TO_READY_TO_SUBMIT",
    check: model => expect(model.primaryAction?.description).toContain("does not mean Google has received anything"),
  },
  {
    name: "a pack that went stale after approval",
    facts: prepared({ packs: { packs: [pack({ status: "STALE" })], eligibleCount: 1 } }),
    primary: "FIX_PREPARED_PACK",
    blockers: ["PACK_STALE"],
    attention: ["PACK_STALE"],
    check: model => expect(model.phases[5].state).toBe("NEEDS_ATTENTION"),
  },
  {
    name: "a pack that was published and then withdrawn from the customer",
    facts: prepared({ packs: { packs: [pack({ status: "APPROVED", published: false, everPublished: true })], eligibleCount: 1 } }),
    primary: "PUBLISH_PREPARED_PACK",
    attention: ["PACK_UNPUBLISHED"],
  },
  {
    name: "preparation reached with nothing accepted to pack",
    facts: prepared({ evidence: { requests: [], versions: [] } }),
    primary: "REQUEST_EVIDENCE",
    blockers: ["NO_ACCEPTED_EVIDENCE"],
  },
  {
    name: "a Managed case in preparation whose permission was invalidated behind it",
    facts: managedReady({
      technicalStage: "PREPARATION",
      authorization: fullyAuthorised({
        caseManagementPermissionActive: false, authorizationReady: false,
        reviewRequired: ["CASE_MANAGEMENT_PERMISSION"],
      }),
      packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
    }),
    primary: "RESOLVE_AUTHORISATION_REVIEW",
    blockers: ["AUTHORISATION_IN_REVIEW"],
    // The earlier phase is reopened for attention without the history of
    // the case being rewritten.
    check: model => {
      expect(model.phase).toBe("PREPARATION")
      expect(model.phases[4].state).toBe("NEEDS_ATTENTION")
    },
  },
  {
    name: "an invalidated permission outranks a stale pack before submission",
    facts: managedReady({
      technicalStage: "PREPARATION",
      authorization: fullyAuthorised({
        caseManagementPermissionActive: false, authorizationReady: false,
        reviewRequired: ["CASE_MANAGEMENT_PERMISSION"],
      }),
      packs: { packs: [pack({ status: "STALE" })], eligibleCount: 1 },
    }),
    // Authority to act at all comes before the quality of what would be
    // sent. The stale pack stays visible rather than being swallowed.
    primary: "RESOLVE_AUTHORISATION_REVIEW",
    blockers: ["AUTHORISATION_IN_REVIEW", "PACK_STALE"],
    attention: ["AUTHORISATION_REVIEW_REQUIRED", "PACK_STALE"],
  },
  {
    name: "a threat in evidence outranks pack work in preparation",
    facts: prepared({
      packs: { packs: [pack({ status: "APPROVED" })], eligibleCount: 1 },
      evidence: {
        requests: [request({ status: "FULFILLED" })],
        versions: [upload({ reviewStatus: "ACCEPTED" }), upload({ versionId: "version-2", scanStatus: "THREATS_FOUND" })],
      },
    }),
    primary: "RESOLVE_EVIDENCE_THREAT",
  },

  // --- Submission ----------------------------------------------------------
  {
    name: "a case ready to submit, with no automated submission to make",
    facts: prepared({
      technicalStage: "READY_TO_SUBMIT",
      packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
    }),
    primary: "RECORD_EXTERNAL_SUBMISSION",
    phase: "SUBMISSION",
    blockers: ["GOOGLE_SUBMISSION_NOT_LIVE"],
  },
  {
    name: "a case ready to submit with an earlier submission still open",
    facts: prepared({
      technicalStage: "READY_TO_SUBMIT",
      packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
    }),
    primary: "REVIEW_SUBMISSION_DECISION",
    blockers: ["OPEN_SUBMISSION_UNRESOLVED"],
  },
  // Being at the stage is not being ready. The pack ladder runs again here,
  // with the same rungs preparation uses, so the operator is told the step
  // they actually have to take rather than a generic repair.
  {
    name: "a case marked ready to submit whose pack went stale behind it",
    facts: prepared({
      technicalStage: "READY_TO_SUBMIT",
      packs: { packs: [pack({ status: "STALE", everPublished: true })], eligibleCount: 1 },
    }),
    primary: "FIX_PREPARED_PACK",
    state: "ACTION_REQUIRED",
    waitingOn: "ADMIN",
    blockers: ["PACK_STALE"],
    attention: ["PACK_STALE"],
    check: model => {
      // The stage stays where the database put it; preparation is what
      // reads as needing attention.
      expect(model.technicalStage).toBe("READY_TO_SUBMIT")
      expect(model.phases[5].state).toBe("NEEDS_ATTENTION")
      expect(model.primaryAction?.destination?.kind).toBe("CASE_EVIDENCE")
    },
  },
  {
    name: "a case marked ready to submit with no pack ever started",
    facts: prepared({ technicalStage: "READY_TO_SUBMIT" }),
    primary: "CREATE_PREPARED_PACK",
    waitingOn: "ADMIN",
    blockers: ["NO_PUBLISHED_PACK"],
    attention: ["PACK_NOT_SUBMITTABLE"],
  },
  {
    name: "a case marked ready to submit with an empty draft pack",
    facts: prepared({
      technicalStage: "READY_TO_SUBMIT",
      packs: { packs: [pack({ itemCount: 0 })], eligibleCount: 1 },
    }),
    primary: "ADD_PREPARED_PACK_ITEMS",
    blockers: ["NO_PUBLISHED_PACK"],
    attention: ["PACK_NOT_SUBMITTABLE"],
  },
  {
    name: "a case marked ready to submit with a draft pack nobody approved",
    facts: prepared({
      technicalStage: "READY_TO_SUBMIT",
      packs: { packs: [pack()], eligibleCount: 1 },
    }),
    primary: "APPROVE_PREPARED_PACK",
    blockers: ["NO_PUBLISHED_PACK"],
    attention: ["PACK_NOT_SUBMITTABLE"],
  },
  {
    name: "a case marked ready to submit with an approved pack nobody published",
    facts: prepared({
      technicalStage: "READY_TO_SUBMIT",
      packs: { packs: [pack({ status: "APPROVED" })], eligibleCount: 1 },
    }),
    primary: "PUBLISH_PREPARED_PACK",
    waitingOn: "ADMIN",
    blockers: ["NO_PUBLISHED_PACK"],
    attention: ["PACK_NOT_SUBMITTABLE"],
  },
  {
    name: "a recorded submission that can move to waiting on Google",
    facts: prepared({
      technicalStage: "SUBMITTED",
      packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
    }),
    primary: "MOVE_TO_WAITING_GOOGLE",
    attention: ["SUBMISSION_AWAITING_RESULT"],
  },

  // --- Decision ------------------------------------------------------------
  {
    name: "a case with Google and nothing due to chase",
    facts: prepared({
      technicalStage: "WAITING_GOOGLE",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
      tasks: [{ id: "task-1", title: "Follow up", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: FUTURE }],
    }),
    primary: "WAIT_FOR_GOOGLE",
    waitingOn: "GOOGLE",
    phase: "DECISION",
    check: model => expect(model.primaryAction?.dueAt).toBe(FUTURE),
  },
  {
    name: "a case with Google whose follow-up date has come",
    facts: prepared({
      technicalStage: "WAITING_GOOGLE",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
      tasks: [{ id: "task-1", title: "Follow up", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: PAST }],
    }),
    primary: "FOLLOW_UP_GOOGLE",
    overdue: true,
    attention: ["TASK_OVERDUE"],
  },
  {
    name: "Google has asked the profile owner to do something, and they have been told",
    facts: prepared({
      technicalStage: "OWNER_ACTION",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
      tasks: [{ id: "task-1", title: "Confirm the address", owner: "CUSTOMER", kind: "FOLLOW_UP", status: "OPEN", dueAt: FUTURE }],
    }),
    primary: "WAIT_FOR_CUSTOMER_ACTION",
    waitingOn: "CUSTOMER",
  },
  {
    name: "Google has asked for something and nothing has been recorded for the customer",
    facts: prepared({
      technicalStage: "OWNER_ACTION",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
    }),
    primary: "REQUEST_CUSTOMER_ACTION",
    waitingOn: "ADMIN",
  },
  // A submission having happened says nothing about which files were in it.
  // Until the flow facts can prove the threatened file was not part of the
  // submitted pack, the threat stays the headline.
  {
    name: "a threat found in evidence after the submission was recorded",
    facts: prepared({
      technicalStage: "WAITING_GOOGLE",
      packs: { packs: [pack({ status: "APPROVED", published: true, everPublished: true })], eligibleCount: 1 },
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
      evidence: {
        requests: [request({ status: "FULFILLED" })],
        versions: [upload({ reviewStatus: "ACCEPTED" }), upload({ versionId: "version-2", scanStatus: "THREATS_FOUND" })],
      },
      tasks: [{ id: "task-1", title: "Follow up", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: FUTURE }],
    }),
    primary: "RESOLVE_EVIDENCE_THREAT",
    waitingOn: "ADMIN",
    blockers: ["EVIDENCE_THREAT_BLOCKED"],
    attention: ["EVIDENCE_THREAT_FOUND"],
    check: model => expect(model.phases[1].state).toBe("NEEDS_ATTENTION"),
  },
  {
    name: "a case back for further work",
    facts: prepared({
      technicalStage: "FURTHER_REVIEW",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    }),
    primary: "PERFORM_FURTHER_REVIEW",
    waitingOn: "ADMIN",
  },
  {
    name: "a case reopened after it had been closed",
    facts: prepared({
      technicalStage: "FURTHER_REVIEW",
      reopened: true,
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    }),
    primary: "PERFORM_FURTHER_REVIEW",
    attention: ["CASE_REOPENED"],
    check: model => {
      expect(model.reopened).toBe(true)
      expect(model.caseComplete).toBe(false)
      expect(model.outcome).toBeNull()
    },
  },
  {
    name: "a case under outcome review with work still open on it",
    facts: prepared({
      technicalStage: "OUTCOME_REVIEW",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
      tasks: [{ id: "task-1", title: "Call the customer", owner: "ADMIN", kind: "CALL", status: "OPEN", dueAt: FUTURE }],
    }),
    primary: "REVIEW_OUTCOME",
    blockers: ["OPEN_TASKS_BLOCK_CLOSURE"],
  },
  {
    name: "a case under outcome review with nothing left open",
    facts: prepared({
      technicalStage: "OUTCOME_REVIEW",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    }),
    primary: "CLOSE_CASE",
    waitingOn: "ADMIN",
  },
  {
    name: "a case under outcome review whose submission was never resolved",
    facts: prepared({
      technicalStage: "OUTCOME_REVIEW",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
    }),
    primary: "REVIEW_SUBMISSION_DECISION",
    blockers: ["OPEN_SUBMISSION_UNRESOLVED"],
  },

  // --- Complete ------------------------------------------------------------
  {
    name: "a closed case",
    facts: prepared({
      technicalStage: "FINISHED",
      caseStatus: "CLOSED",
      outcome: "RESTORED",
      outcomeSummary: "The profile was reinstated.",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    }),
    primary: null,
    waitingOn: "NONE",
    phase: "COMPLETE",
    check: model => {
      expect(model.caseComplete).toBe(true)
      expect(model.progressSummary).toEqual({ completed: 9, total: 9 })
      expect(model.blockers).toEqual([])
      expect(model.attentionItems).toEqual([])
      expect(model.outcome).toBe("RESTORED")
    },
  },
  // Closing a case ends its journey but not a complaint about it. The old
  // stale pack is history and is not resurrected; the complaint is not.
  {
    name: "a closed case with an open complaint still against it",
    facts: prepared({
      technicalStage: "FINISHED",
      caseStatus: "CLOSED",
      outcome: "RESTORED",
      outcomeSummary: "The profile was reinstated.",
      packs: { packs: [pack({ status: "STALE", everPublished: true })], eligibleCount: 1 },
      complaints: { complete: true, open: [{ id: "complaint-1", dueAt: FUTURE }] },
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    }),
    primary: null,
    waitingOn: "NONE",
    phase: "COMPLETE",
    attention: ["COMPLAINT_OPEN"],
    check: model => {
      expect(model.caseComplete).toBe(true)
      expect(model.attentionItems.map(entry => entry.code)).toEqual(["COMPLAINT_OPEN"])
      expect(model.blockers).toEqual([])
      expect(model.progressSummary).toEqual({ completed: 9, total: 9 })
    },
  },
  {
    name: "a withdrawn case",
    facts: prepared({
      technicalStage: "FINISHED",
      caseStatus: "CANCELLED",
      outcome: "WITHDRAWN",
      outcomeSummary: "The customer withdrew.",
    }),
    primary: null,
    waitingOn: "NONE",
    check: model => expect(model.caseComplete).toBe(true),
  },
  {
    name: "a case cancelled before it ever reached the end of the journey",
    facts: facts({ technicalStage: "EVIDENCE_COLLECTION", caseStatus: "CANCELLED", outcome: "WITHDRAWN" }),
    primary: null,
    waitingOn: "NONE",
    check: model => {
      expect(model.caseComplete).toBe(true)
      expect(model.technicalStage).toBe("EVIDENCE_COLLECTION")
    },
  },
]

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("case flow scenarios", () => {
  it("has at least the fifty named journeys the model is specified against", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(50)
    expect(new Set(scenarios.map(scenario => scenario.name)).size).toBe(scenarios.length)
  })

  it("only uses transitions the database would actually permit", () => {
    expect(Object.keys(transitionMatrix).sort()).toEqual(Object.keys(stages).sort())
    for (const scenario of scenarios) {
      const allowed = transitionMatrix[scenario.facts.technicalStage] ?? []
      for (const target of scenario.facts.allowedTransitions) {
        expect(allowed, scenario.name).toContain(target)
      }
    }
  })

  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const model = resolveCaseFlow(scenario.facts, NOW)
      expect(model.primaryAction?.id ?? null).toBe(scenario.primary)
      if (scenario.waitingOn) expect(model.waitingOn).toBe(scenario.waitingOn)
      if (scenario.state) expect(model.primaryAction?.state).toBe(scenario.state)
      if (scenario.phase) expect(model.phase).toBe(scenario.phase)
      if (scenario.overdue !== undefined) expect(model.primaryAction?.overdue).toBe(scenario.overdue)
      for (const code of scenario.blockers ?? []) {
        expect(model.blockers.map(entry => entry.code), scenario.name).toContain(code)
      }
      for (const code of scenario.attention ?? []) {
        expect(model.attentionItems.map(entry => entry.code), scenario.name).toContain(code)
      }
      scenario.check?.(model)
    })
  }
})

describe("every scenario, whatever it is about", () => {
  const resolved = scenarios.map(scenario => ({ scenario, model: resolveCaseFlow(scenario.facts, NOW) }))

  // One answer, never a list to choose between.
  it("gives an open case exactly one primary action, and a finished case none", () => {
    for (const { scenario, model } of resolved) {
      if (model.caseComplete) expect(model.primaryAction, scenario.name).toBeNull()
      else expect(model.primaryAction, scenario.name).not.toBeNull()
    }
  })

  it("never falls back to the hand-check action, because every state is modelled", () => {
    for (const { scenario, model } of resolved) {
      expect(model.primaryAction?.id, scenario.name).not.toBe("REVIEW_CASE_STATE")
    }
  })

  it("names exactly one party the case is waiting on", () => {
    for (const { scenario, model } of resolved) {
      if (model.primaryAction) expect(model.waitingOn, scenario.name).toBe(model.primaryAction.owner)
      else expect(model.waitingOn, scenario.name).toBe("NONE")
    }
  })

  // A customer existing is not a reason to say the case is waiting on them.
  it("only waits on the customer when something has been put to them", () => {
    for (const { scenario, model } of resolved) {
      if (model.waitingOn !== "CUSTOMER") continue
      expect(model.primaryAction?.state, scenario.name).toBe("WAITING")
    }
  })

  // A stale or unpublished pack must never be submitted, whatever stage the
  // database has the case at.
  it("never recommends recording a submission without a usable pack behind it", () => {
    for (const { scenario, model } of resolved) {
      if (model.primaryAction?.id !== "RECORD_EXTERNAL_SUBMISSION") continue
      const packs = scenario.facts.packs.packs
      expect(packs.some(entry => entry.status === "STALE"), scenario.name).toBe(false)
      expect(
        packs.some(entry => entry.published && entry.status === "APPROVED" && entry.itemCount > 0),
        scenario.name,
      ).toBe(true)
    }
  })

  // Every blocker says what is missing, why that stops things, and who fixes it.
  it("explains every blocker in full", () => {
    for (const { scenario, model } of resolved) {
      for (const entry of model.blockers) {
        expect(blockerCatalogue, scenario.name).toHaveProperty(entry.code)
        expect(entry.title.length, `${scenario.name}/${entry.code}`).toBeGreaterThan(10)
        expect(entry.explanation.length, `${scenario.name}/${entry.code}`).toBeGreaterThan(40)
        expect(entry.owner, `${scenario.name}/${entry.code}`).toBeTruthy()
      }
    }
  })

  it("raises each blocker and each attention item at most once", () => {
    for (const { scenario, model } of resolved) {
      const blockerCodes = model.blockers.map(entry => entry.code)
      const attentionCodes = model.attentionItems.map(entry => entry.code)
      expect(new Set(blockerCodes).size, scenario.name).toBe(blockerCodes.length)
      expect(new Set(attentionCodes).size, scenario.name).toBe(attentionCodes.length)
    }
  })

  it("sends the operator somewhere inside Admin, or nowhere at all", () => {
    for (const { scenario, model } of resolved) {
      const destinations = [
        model.primaryAction?.destination,
        ...model.blockers.map(entry => entry.destination),
        ...model.attentionItems.map(entry => entry.destination),
        ...model.prerequisites.flatMap(group => group.items.map(item => item.destination)),
      ]
      for (const target of destinations) {
        if (!target) continue
        expect(isInternalPath(target.href), `${scenario.name}: ${target.href}`).toBe(true)
      }
    }
  })

  it("never invents a date", () => {
    for (const { scenario, model } of resolved) {
      const dueAt = model.primaryAction?.dueAt
      if (!dueAt) continue
      const sources = [
        ...scenario.facts.tasks.map(task => task.dueAt),
        ...scenario.facts.evidence.requests.map(entry => entry.dueAt),
        ...scenario.facts.customerActions.map(entry => entry.expiresAt),
        ...scenario.facts.commercial.quotes.flatMap(entry => [entry.validUntil, entry.actionExpiresAt]),
        ...scenario.facts.complaints.open.map(entry => entry.dueAt),
        scenario.facts.plannedNextActionDueAt,
      ]
      expect(sources, `${scenario.name}: ${dueAt}`).toContain(dueAt)
    }
  })

  it("keeps the exact technical stage beside the human phase", () => {
    for (const { scenario, model } of resolved) {
      expect(model.technicalStage, scenario.name).toBe(scenario.facts.technicalStage)
      expect(model.technicalStageLabel, scenario.name).toBeTruthy()
      expect(casePhaseIds, scenario.name).toContain(model.phase)
      expect(model.phases.map(entry => entry.id)).toEqual([...casePhaseIds])
    }
  })

  it("counts progress from the phase states it reports", () => {
    for (const { scenario, model } of resolved) {
      expect(model.progressSummary.total, scenario.name).toBe(casePhaseIds.length)
      expect(model.progressSummary.completed, scenario.name)
        .toBe(model.phases.filter(entry => entry.state === "COMPLETE").length)
    }
  })

  it("gives every phase a sentence about this case", () => {
    for (const { scenario, model } of resolved) {
      for (const entry of model.phases) {
        expect(entry.detail.length, `${scenario.name}/${entry.id}`).toBeGreaterThan(3)
      }
    }
  })

  it("is deterministic", () => {
    for (const { scenario, model } of resolved) {
      expect(resolveCaseFlow(scenario.facts, NOW), scenario.name).toEqual(model)
    }
  })

  // Nothing in the wording may claim an email arrived, money was taken or
  // something was sent to Google when the facts do not say so.
  it("never claims delivery, payment or submission the facts do not support", () => {
    const wording = [
      ...Object.values(actionCatalogue).map(entry => `${entry.label} ${entry.description}`),
      ...Object.values(blockerCatalogue).map(entry => `${entry.title} ${entry.explanation}`),
    ].join(" ")
    expect(wording).not.toMatch(/\bemail (has been |was )?delivered\b/i)
    expect(wording).not.toMatch(/\bpayment (has been |was )?received\b/i)
    expect(wording).not.toMatch(/\bsubmitted to Google\b/i)
    expect(wording).not.toMatch(/\bsent to Google\b/i)
  })
})

/**
 * The pack ladder at `READY_TO_SUBMIT`, rung by rung.
 *
 * An operator who does not know this system should be told the step they
 * have to take, not a repair they then have to interpret. The ladder is the
 * one preparation uses, so the two surfaces cannot drift apart.
 */
describe("a case marked ready to submit, at every pack state", () => {
  const ladder: Array<{ state: string; packs: CaseFlowFacts["packs"]; expected: CaseNextActionId }> = [
    { state: "no pack", packs: { packs: [], eligibleCount: 1 }, expected: "CREATE_PREPARED_PACK" },
    { state: "empty draft", packs: { packs: [pack({ itemCount: 0 })], eligibleCount: 1 }, expected: "ADD_PREPARED_PACK_ITEMS" },
    { state: "draft with evidence", packs: { packs: [pack()], eligibleCount: 1 }, expected: "APPROVE_PREPARED_PACK" },
    { state: "approved, unpublished", packs: { packs: [pack({ status: "APPROVED" })], eligibleCount: 1 }, expected: "PUBLISH_PREPARED_PACK" },
    { state: "stale", packs: { packs: [pack({ status: "STALE" })], eligibleCount: 1 }, expected: "FIX_PREPARED_PACK" },
  ]

  const usable: CaseFlowFacts["packs"] = {
    packs: [pack({ status: "APPROVED", published: true, everPublished: true })],
    eligibleCount: 1,
  }

  const resolve = (packs: CaseFlowFacts["packs"]) =>
    resolveCaseFlow(prepared({ technicalStage: "READY_TO_SUBMIT", packs }), NOW)

  it("names the exact pack step rather than a generic repair", () => {
    for (const rung of ladder) {
      expect(resolve(rung.packs).primaryAction?.id, rung.state).toBe(rung.expected)
    }
  })

  it("never offers to record a submission until the pack is usable", () => {
    for (const rung of ladder) {
      expect(resolve(rung.packs).primaryAction?.id, rung.state).not.toBe("RECORD_EXTERNAL_SUBMISSION")
    }
    expect(resolve(usable).primaryAction?.id).toBe("RECORD_EXTERNAL_SUBMISSION")
  })

  it("leaves the stage alone and flags preparation instead", () => {
    for (const rung of ladder) {
      const model = resolve(rung.packs)
      expect(model.technicalStage, rung.state).toBe("READY_TO_SUBMIT")
      expect(model.phase, rung.state).toBe("SUBMISSION")
      expect(model.phases[5].state, rung.state).toBe("NEEDS_ATTENTION")
    }
  })
})

/**
 * Every delivery outcome the communications contract can report, swept in
 * one place. The point of the sweep is the negative: nine of the ten say
 * nothing about whether the customer has the request.
 */
describe("the evidence request message, at every delivery outcome", () => {
  const deliveryStates = [
    "NONE",
    "ACCEPTANCE_UNKNOWN",
    "PROVIDER_ACCEPTED",
    "DELIVERED",
    "BOUNCED",
    "TRANSIENT_BOUNCE",
    "UNDETERMINED_BOUNCE",
    "COMPLAINED",
    "SUPPRESSED",
    "FAILED",
  ]

  const queued = (deliveryStatus: string) =>
    resolveCaseFlow(
      facts({
        technicalStage: "EVIDENCE_COLLECTION",
        evidence: { requests: [request()], versions: [] },
        communications: [requestMessage({ lifecycle: "QUEUED", deliveryStatus })],
      }),
      NOW,
    )

  it("only says the case is waiting on the customer once delivery is confirmed", () => {
    for (const deliveryStatus of deliveryStates) {
      const model = queued(deliveryStatus)
      expect(model.primaryAction?.id === "WAIT_FOR_CUSTOMER_EVIDENCE", deliveryStatus)
        .toBe(deliveryStatus === "DELIVERED")
      expect(model.waitingOn === "CUSTOMER", deliveryStatus).toBe(deliveryStatus === "DELIVERED")
    }
  })

  it("waits on the provider while the message is queued or merely accepted", () => {
    for (const deliveryStatus of ["NONE", "PROVIDER_ACCEPTED"]) {
      const model = queued(deliveryStatus)
      expect(model.primaryAction?.id, deliveryStatus).toBe("WAIT_FOR_EMAIL_DELIVERY")
      expect(model.waitingOn, deliveryStatus).toBe("SYSTEM")
    }
  })

  it("asks for a reconciliation rather than a resend when acceptance is unknown", () => {
    const model = queued("ACCEPTANCE_UNKNOWN")
    expect(model.primaryAction?.id).toBe("RECONCILE_EMAIL_DELIVERY")
    expect(model.primaryAction?.state).toBe("ACTION_REQUIRED")
  })

  it("treats every failure outcome as contact to re-establish", () => {
    for (const deliveryStatus of ["BOUNCED", "TRANSIENT_BOUNCE", "UNDETERMINED_BOUNCE", "COMPLAINED", "SUPPRESSED", "FAILED"]) {
      expect(queued(deliveryStatus).primaryAction?.id, deliveryStatus).toBe("RECOVER_CUSTOMER_CONTACT")
    }
  })

  it("walks the drafting steps before any of that", () => {
    const at = (lifecycle: string) =>
      resolveCaseFlow(
        facts({
          technicalStage: "EVIDENCE_COLLECTION",
          evidence: { requests: [request()], versions: [] },
          communications: [requestMessage({ lifecycle })],
          capabilities: { liveMailEnabled: true, paymentsEnabled: true, googleSubmissionLive: false },
        }),
        NOW,
      )
    expect(at("DRAFT").primaryAction?.id).toBe("REVIEW_EVIDENCE_REQUEST_MESSAGE")
    expect(at("REVIEWED").primaryAction?.id).toBe("SEND_EVIDENCE_REQUEST")
  })
})
