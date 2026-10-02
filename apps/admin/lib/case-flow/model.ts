/**
 * The read-only case flow model: what UX-2 renders, and the facts it is
 * resolved from.
 *
 * Nothing here is persisted and nothing here decides anything. The database
 * remains the only authority on what a case may do next — `case_stage_ready_v1`
 * still refuses a transition whose prerequisites are unmet, whatever this
 * model says. What this adds is an explanation an operator can read without
 * knowing which Admin module holds which fact.
 *
 * The types are deliberately free of presentation: no React, no class names,
 * no component state. A label here is a sentence, not a design.
 */

import type { CaseDestination } from "./destinations"
import type { CasePhaseId } from "./phases"

/** Who has to act. `SYSTEM` is work in progress that no human can hurry. */
export type CaseActionOwner = "ADMIN" | "CUSTOMER" | "GOOGLE" | "PAYMENT_PROVIDER" | "SYSTEM"

/** The single party the case is waiting on, or nothing. */
export type CaseWaitingOn = CaseActionOwner | "NONE"

export type CaseServiceTrack = "UNDECIDED" | "GUIDED" | "MANAGED"

/**
 * `ACTION_REQUIRED` — somebody can do this now.
 * `WAITING` — it has been asked for and the answer has not arrived.
 * `BLOCKED` — it cannot be done until something else is resolved.
 * `READY` — a progression step the case has earned and may now take.
 */
export type CaseActionState = "ACTION_REQUIRED" | "WAITING" | "BLOCKED" | "READY"

export type CasePhaseState = "COMPLETE" | "CURRENT" | "UPCOMING" | "NEEDS_ATTENTION"

export type CasePhase = {
  id: CasePhaseId
  label: string
  state: CasePhaseState
  /** One factual sentence about this phase on this case. */
  detail: string
}

export const caseNextActionIds = [
  // Received
  "REVIEW_NEW_CASE",
  "CONFIRM_CASE_LOCATION",
  // Evidence
  "REQUEST_EVIDENCE",
  "PREPARE_EVIDENCE_REQUEST_MESSAGE",
  "REVIEW_EVIDENCE_REQUEST_MESSAGE",
  "SEND_EVIDENCE_REQUEST",
  "WAIT_FOR_EMAIL_DELIVERY",
  "RECONCILE_EMAIL_DELIVERY",
  "RECOVER_CUSTOMER_CONTACT",
  "WAIT_FOR_CUSTOMER_EVIDENCE",
  "WAIT_FOR_EVIDENCE_SCAN",
  "CHECK_EVIDENCE_SCAN",
  "RESOLVE_EVIDENCE_THREAT",
  "REPLACE_INVALID_EVIDENCE",
  "REVIEW_EVIDENCE",
  "FULFIL_EVIDENCE_REQUEST",
  "ADVANCE_TO_ASSESSMENT",
  // Assessment
  "COMPLETE_ASSESSMENT",
  // Service
  "SELECT_SERVICE",
  "CREATE_QUOTE",
  "COMPLETE_QUOTE_CONFIGURATION",
  "OFFER_QUOTE",
  "ISSUE_QUOTE_ACCEPTANCE",
  "WAIT_FOR_QUOTE_ACCEPTANCE",
  "REVIEW_DECLINED_QUOTE",
  "CONFIRM_COMMERCIAL_STATE",
  "ADVANCE_TO_PREREQUISITES",
  // Guided prerequisites
  "CONFIRM_PAYMENT_STATE",
  "START_UPFRONT_PAYMENT",
  "WAIT_FOR_UPFRONT_PAYMENT",
  "RESOLVE_PAYMENT_EXCEPTION",
  // Managed prerequisites
  "VERIFY_CUSTOMER_CONTACT",
  "VERIFY_BUSINESS_AUTHORITY",
  "RESOLVE_AUTHORISATION_REVIEW",
  "ISSUE_SERVICE_AGREEMENT",
  "WAIT_FOR_SERVICE_AGREEMENT",
  "ISSUE_CASE_PERMISSION",
  "WAIT_FOR_CASE_PERMISSION",
  "VERIFY_MANAGER_ACCESS",
  "START_MANAGED_PAYMENT_SETUP",
  "WAIT_FOR_MANAGED_PAYMENT_SETUP",
  "RESOLVE_MANAGED_PAYMENT_EXCEPTION",
  "ADVANCE_TO_PREPARATION",
  // Preparation
  "CREATE_PREPARED_PACK",
  "ADD_PREPARED_PACK_ITEMS",
  "FIX_PREPARED_PACK",
  "APPROVE_PREPARED_PACK",
  "PUBLISH_PREPARED_PACK",
  "ADVANCE_TO_READY_TO_SUBMIT",
  // Submission
  "RECORD_EXTERNAL_SUBMISSION",
  "MOVE_TO_WAITING_GOOGLE",
  // Decision
  "WAIT_FOR_GOOGLE",
  "FOLLOW_UP_GOOGLE",
  "REQUEST_CUSTOMER_ACTION",
  "WAIT_FOR_CUSTOMER_ACTION",
  "PERFORM_FURTHER_REVIEW",
  "RETURN_TO_PREPARATION",
  "REVIEW_SUBMISSION_DECISION",
  "REVIEW_OUTCOME",
  "CLOSE_CASE",
  // Fallback
  "REVIEW_CASE_STATE",
] as const

export type CaseNextActionId = (typeof caseNextActionIds)[number]

export type CaseNextAction = {
  id: CaseNextActionId
  /** Short imperative wording, e.g. "Review the uploaded evidence". */
  label: string
  /** One or two sentences saying what this means and why it is next. */
  description: string
  owner: CaseActionOwner
  state: CaseActionState
  /** An authoritative date, or null. Never an invented service level. */
  dueAt: string | null
  overdue: boolean
  destination: CaseDestination | null
  /** Stable codes for tests and analytics, beside the human wording. */
  reasonCodes: string[]
}

export const caseBlockerCategories = [
  "SAFETY",
  "EVIDENCE",
  "AUTHORITY",
  "COMMERCIAL_CONFIGURATION",
  "PAYMENT",
  "CAPABILITY",
  "DATA",
] as const

export type CaseBlockerCategory = (typeof caseBlockerCategories)[number]

export type CaseBlocker = {
  code: string
  category: CaseBlockerCategory
  /** What is missing. */
  title: string
  /** Why progress cannot continue. */
  explanation: string
  /** Who or what must resolve it. */
  owner: CaseActionOwner
  destination: CaseDestination | null
}

export type CaseAttentionSeverity = "CRITICAL" | "WARNING" | "INFO"

export type CaseAttentionItem = {
  code: string
  severity: CaseAttentionSeverity
  title: string
  explanation: string
  owner: CaseActionOwner
  /** The phase this reflects on, which need not be the current one. */
  phase: CasePhaseId
  dueAt: string | null
  overdue: boolean
  destination: CaseDestination | null
}

export type CasePrerequisiteState = "SATISFIED" | "IN_PROGRESS" | "NOT_STARTED" | "ATTENTION" | "NOT_APPLICABLE"

export type CasePrerequisite = {
  id: string
  label: string
  state: CasePrerequisiteState
  detail: string
  owner: CaseActionOwner
  destination: CaseDestination | null
}

export type CasePrerequisiteGroup = {
  id: "GUIDED_PAYMENT" | "MANAGED_AUTHORISATION" | "MANAGED_PAYMENT"
  label: string
  /**
   * Whether every item in the group is satisfied. This is the model's
   * reading of component facts; the database gate — `guided_payment_ready_v1`
   * or `managed_setup_ready_v1` — remains what actually permits a transition.
   */
  satisfied: boolean
  items: CasePrerequisite[]
}

export type CaseFlowModel = {
  caseId: string
  reference: string

  /** Untouched, exactly as the database holds it. */
  technicalStage: string
  technicalStageLabel: string
  phase: CasePhaseId
  phaseLabel: string
  phases: CasePhase[]

  serviceTrack: CaseServiceTrack

  primaryAction: CaseNextAction | null
  waitingOn: CaseWaitingOn

  blockers: CaseBlocker[]
  attentionItems: CaseAttentionItem[]
  prerequisites: CasePrerequisiteGroup[]

  progressSummary: { completed: number; total: number }

  caseComplete: boolean
  /** True while a previously closed case is being worked again. */
  reopened: boolean
  /** The recorded outcome, which a reopened case no longer has. */
  outcome: string | null
  outcomeSummary: string
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/**
 * Everything the resolver is allowed to see.
 *
 * Each field is a projection of something an existing Admin query already
 * returns. Keeping them primitive is what makes the scenario fixtures
 * readable and the resolver testable without a database.
 */

export type CaseFlowTaskFact = {
  id: string
  title: string
  owner: "ADMIN" | "CUSTOMER"
  kind: string
  status: string
  dueAt: string
}

export type CaseFlowSubmissionFact = {
  id: string
  actor: string
  submittedAt: string
  /** A submission with no recorded result is still awaiting a decision. */
  result: string | null
}

export type CaseFlowAuthorizationFact = {
  /** `pending`, `verified`, `revoked`, or `missing` when there is no row. */
  membershipStatus: string
  customerEmailVerified: boolean
  businessAuthorityVerified: boolean
  serviceAgreementAccepted: boolean
  caseManagementPermissionActive: boolean
  managerAccessVerified: boolean
  /**
   * The authoritative aggregate from `case_authorization_readiness_v1`,
   * consumed rather than recomputed. It is only ever true on a Managed case.
   */
  authorizationReady: boolean
  /** Authorisation kinds whose record has been moved to review. */
  reviewRequired: string[]
  /** Whether an agreement version of each kind has been drafted at all. */
  agreementKinds: string[]
  /** Whether the case has a location at all; manager access needs one. */
  hasLocation: boolean
}

/**
 * A secure customer action issued against this case: an agreement
 * acceptance, a payment link, a payment-setup link or case access.
 * Never the secret itself, which the database does not hand back anyway.
 */
export type CaseFlowCustomerActionFact = {
  id: string
  /** `customer_actions.kind`, e.g. `AGREEMENT_ACCEPTANCE`, `GUIDED_PAYMENT`. */
  kind: string
  /** For an agreement acceptance, the kind of agreement it carries. */
  agreementKind: string | null
  /** `OPEN`, `COMPLETED`, `DECLINED` or `REVOKED`. */
  status: string
  expiresAt: string
}

export type CaseFlowEvidenceRequestFact = {
  id: string
  status: string
  dueAt: string | null
  createdAt: string
}

export type CaseFlowEvidenceVersionFact = {
  documentId: string
  versionId: string
  /** The request this document was raised against, when it carries one. */
  evidenceRequestId: string | null
  uploadStatus: string
  scanStatus: string
  validationStatus: string
  reviewStatus: string
}

export type CaseFlowEvidenceFact = {
  requests: CaseFlowEvidenceRequestFact[]
  versions: CaseFlowEvidenceVersionFact[]
}

export type CaseFlowPackFact = {
  packs: Array<{
    id: string
    packNumber: number
    /** `DRAFT`, `APPROVED`, `STALE` or `SUPERSEDED`. */
    status: string
    /** Visible to the customer right now. */
    published: boolean
    /** Published at some point, whether or not it still is. */
    everPublished: boolean
    itemCount: number
  }>
  /** Accepted evidence versions that a pack could include. */
  eligibleCount: number
}

export type CaseFlowQuoteFact = {
  id: string
  status: string
  taxBehaviour: string
  validUntil: string
  /** The quote-acceptance customer action, when one has been issued. */
  actionStatus: string | null
  actionExpiresAt: string | null
  orderId: string | null
}

export type CaseFlowCommercialFact = {
  /**
   * False when the quote list this was read from may have been truncated,
   * so "no quote exists" cannot be concluded from an empty result.
   */
  complete: boolean
  quotes: CaseFlowQuoteFact[]
}

export type CaseFlowOrderFact = {
  orderId: string
  paymentModel: string
  orderState: string
  obligationKind: string | null
  obligationState: string | null
  /** A usable saved payment method exists for this order. */
  setupReady: boolean
  /** Later-charge consent has been recorded for this order. */
  consentRecorded: boolean
  receiptRecorded: boolean
}

export type CaseFlowPaymentFact = {
  complete: boolean
  orders: CaseFlowOrderFact[]
}

export type CaseFlowCommunicationFact = {
  id: string
  templateKey: string | null
  lifecycle: string | null
  deliveryStatus: string | null
  legacyStatus: string | null
  draftedAt: string
}

export type CaseFlowComplaintFact = {
  complete: boolean
  open: Array<{ id: string; dueAt: string | null }>
}

export type CaseFlowCapabilityFact = {
  /** Outgoing customer mail may actually leave the building. */
  liveMailEnabled: boolean
  /** Stripe is configured for test-mode collection. */
  paymentsEnabled: boolean
  /** There is no live Google submission transport in this build. */
  googleSubmissionLive: boolean
}

export type CaseFlowFacts = {
  caseId: string
  reference: string
  caseType: string
  technicalStage: string
  /** `RECEIVED`, `UNDER_REVIEW`, `AWAITING_CUSTOMER`, `CLOSED`, `CANCELLED`. */
  caseStatus: string
  serviceTrack: CaseServiceTrack
  outcome: string | null
  outcomeSummary: string
  customerId: string | null
  businessId: string | null
  locationId: string | null
  /** The operator's own note and date on the case, when they set one. */
  plannedNextAction: string
  plannedNextActionDueAt: string | null
  /** Stages the transition matrix permits from here, before prerequisites. */
  allowedTransitions: string[]
  /** A `reopen` event has been recorded at some point. */
  reopened: boolean

  tasks: CaseFlowTaskFact[]
  submissions: CaseFlowSubmissionFact[]
  authorization: CaseFlowAuthorizationFact
  customerActions: CaseFlowCustomerActionFact[]
  evidence: CaseFlowEvidenceFact
  packs: CaseFlowPackFact
  commercial: CaseFlowCommercialFact
  payment: CaseFlowPaymentFact
  communications: CaseFlowCommunicationFact[]
  complaints: CaseFlowComplaintFact
  capabilities: CaseFlowCapabilityFact
}
