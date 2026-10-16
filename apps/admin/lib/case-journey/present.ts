/**
 * Presentation of the eleven-step workflow.
 *
 * Pure. It reads the existing case-flow facts and the existing resolver, and
 * it writes nothing. A step is COMPLETED only from the record named in the
 * catalogue. The technical stage may show where the operator is standing; it
 * never turns an earlier step green.
 */

import { PAID_SERVICE_AGREEMENT_VERSION } from "../../../../lib/commercial/paid-service-agreement"
import {
  caseDestination,
  destination,
  recordDestination,
  type CaseDestination,
} from "../case-flow/destinations"
import { summariseEvidence } from "../case-flow/evidence"
import type {
  CaseBlocker,
  CaseFlowFacts,
  CaseNextAction,
  CaseNextActionId,
  CaseServiceTrack,
} from "../case-flow/model"
import { isTechnicalStage, stageLabel, type TechnicalStage } from "../case-flow/phases"
import { resolveCaseFlow, summariseCommercial, summarisePayment } from "../case-flow/resolve"
import { journeyCatalogue, journeyStepIds, type JourneyParty, type JourneyStepId } from "./catalogue"

export const journeyStepStates = [
  "COMPLETED",
  "CURRENT",
  "LOCKED",
  "WAITING",
  "NEEDS_ATTENTION",
  "NOT_APPLICABLE",
  "UNKNOWN",
] as const

export type JourneyStepState = (typeof journeyStepStates)[number]

export const journeyStatePresentation: Record<JourneyStepState, { symbol: string; label: string }> = {
  COMPLETED: { symbol: "✓", label: "Complete" },
  CURRENT: { symbol: "●", label: "Current step" },
  LOCKED: { symbol: "○", label: "Not available yet" },
  WAITING: { symbol: "…", label: "Waiting" },
  NEEDS_ATTENTION: { symbol: "!", label: "Needs attention" },
  NOT_APPLICABLE: { symbol: "—", label: "Not applicable" },
  UNKNOWN: { symbol: "?", label: "Not recorded" },
}

type Proof = "complete" | "waiting" | "attention" | "unproven" | "not_applicable"

type Reading = {
  proof: Proof
  known: string[]
  missing: string[]
  who: string
}

export type JourneyStepView = {
  id: JourneyStepId
  order: number
  title: string
  purpose: string
  state: JourneyStepState
  focus: boolean
  responsibleParty: JourneyParty
  known: string[]
  missing: string[]
  whoMustAct: string
  destination: CaseDestination | null
  unlock: string
  unavailableReason: string | null
  unsupported: string
  laterWork: string
}

export type CaseJourneyPresentation = {
  steps: JourneyStepView[]
  focusStepId: JourneyStepId | null
  serviceTrack: CaseServiceTrack
  technicalStage: string
  technicalStageLabel: string
  caseStatus: string
  reopened: boolean
  closed: boolean
  attention: Array<{ code: string; title: string; explanation: string }>
  blockers: CaseBlocker[]
  incompatibilities: string[]
  nextAction: CaseNextAction | null
  /** Set when the canonical action is a saved-card step this agreement does not allow. */
  suppressedAction: { id: CaseNextActionId; label: string; reason: string } | null
  projectionNote: string | null
}

const savedCardActions = new Set<CaseNextActionId>([
  "START_MANAGED_PAYMENT_SETUP",
  "WAIT_FOR_MANAGED_PAYMENT_SETUP",
  "RESOLVE_MANAGED_PAYMENT_EXCEPTION",
])

const incompatibleBlockers = new Set(["MANAGED_PAYMENT_SETUP_INCOMPLETE"])

const savedCardReason =
  `The existing recommendation is a saved-card setup for a later Managed charge. Agreement ${PAID_SERVICE_AGREEMENT_VERSION} invoices a Managed success fee only after documented success, with no automatic card charge and no collection in advance. This preview does not treat that setup as service activation and does not offer it as an action.`

/**
 * Which existing recommendation belongs to which operator step.
 *
 * `null` means the recommendation does not identify a step. The stage is
 * then only a fallback for where to stand, never for what is finished.
 */
const stepForAction: Record<CaseNextActionId, JourneyStepId | null> = {
  REVIEW_NEW_CASE: "CASE_RECEIVED",
  CONFIRM_CASE_LOCATION: "VERIFICATION",
  REQUEST_EVIDENCE: "REQUEST_DOCUMENTS",
  PREPARE_EVIDENCE_REQUEST_MESSAGE: "REQUEST_DOCUMENTS",
  REVIEW_EVIDENCE_REQUEST_MESSAGE: "REQUEST_DOCUMENTS",
  SEND_EVIDENCE_REQUEST: "REQUEST_DOCUMENTS",
  WAIT_FOR_EMAIL_DELIVERY: "REQUEST_DOCUMENTS",
  RECONCILE_EMAIL_DELIVERY: "REQUEST_DOCUMENTS",
  RECOVER_CUSTOMER_CONTACT: "REQUEST_DOCUMENTS",
  WAIT_FOR_CUSTOMER_EVIDENCE: "EVIDENCE_REVIEW",
  WAIT_FOR_EVIDENCE_SCAN: "EVIDENCE_REVIEW",
  CHECK_EVIDENCE_SCAN: "EVIDENCE_REVIEW",
  RESOLVE_EVIDENCE_THREAT: "EVIDENCE_REVIEW",
  REPLACE_INVALID_EVIDENCE: "EVIDENCE_REVIEW",
  REVIEW_EVIDENCE: "EVIDENCE_REVIEW",
  FULFIL_EVIDENCE_REQUEST: "EVIDENCE_REVIEW",
  ADVANCE_TO_ASSESSMENT: "ASSESSMENT",
  COMPLETE_ASSESSMENT: "ASSESSMENT",
  SELECT_SERVICE: "QUOTE_ACCEPTANCE",
  CREATE_QUOTE: "QUOTE_ACCEPTANCE",
  COMPLETE_QUOTE_CONFIGURATION: "QUOTE_ACCEPTANCE",
  OFFER_QUOTE: "QUOTE_ACCEPTANCE",
  ISSUE_QUOTE_ACCEPTANCE: "QUOTE_ACCEPTANCE",
  WAIT_FOR_QUOTE_ACCEPTANCE: "QUOTE_ACCEPTANCE",
  REVIEW_DECLINED_QUOTE: "QUOTE_ACCEPTANCE",
  CONFIRM_COMMERCIAL_STATE: "QUOTE_ACCEPTANCE",
  ADVANCE_TO_PREREQUISITES: "QUOTE_ACCEPTANCE",
  CONFIRM_PAYMENT_STATE: "SERVICE_ACTIVATION",
  START_UPFRONT_PAYMENT: "SERVICE_ACTIVATION",
  WAIT_FOR_UPFRONT_PAYMENT: "SERVICE_ACTIVATION",
  RESOLVE_PAYMENT_EXCEPTION: "SERVICE_ACTIVATION",
  VERIFY_CUSTOMER_CONTACT: "SERVICE_ACTIVATION",
  VERIFY_BUSINESS_AUTHORITY: "SERVICE_ACTIVATION",
  RESOLVE_AUTHORISATION_REVIEW: "SERVICE_ACTIVATION",
  ISSUE_SERVICE_AGREEMENT: "SERVICE_ACTIVATION",
  WAIT_FOR_SERVICE_AGREEMENT: "SERVICE_ACTIVATION",
  ISSUE_CASE_PERMISSION: "SERVICE_ACTIVATION",
  WAIT_FOR_CASE_PERMISSION: "SERVICE_ACTIVATION",
  VERIFY_MANAGER_ACCESS: "SERVICE_ACTIVATION",
  START_MANAGED_PAYMENT_SETUP: "SERVICE_ACTIVATION",
  WAIT_FOR_MANAGED_PAYMENT_SETUP: "SERVICE_ACTIVATION",
  RESOLVE_MANAGED_PAYMENT_EXCEPTION: "SERVICE_ACTIVATION",
  ADVANCE_TO_PREPARATION: "PREPARATION",
  CREATE_PREPARED_PACK: "PREPARATION",
  ADD_PREPARED_PACK_ITEMS: "PREPARATION",
  FIX_PREPARED_PACK: "PREPARATION",
  APPROVE_PREPARED_PACK: "PREPARATION",
  PUBLISH_PREPARED_PACK: "PREPARATION",
  ADVANCE_TO_READY_TO_SUBMIT: "PREPARATION",
  RECORD_EXTERNAL_SUBMISSION: "SUBMISSION",
  MOVE_TO_WAITING_GOOGLE: "SUBMISSION",
  WAIT_FOR_GOOGLE: "SUBMISSION",
  FOLLOW_UP_GOOGLE: "SUBMISSION",
  REQUEST_CUSTOMER_ACTION: "SUBMISSION",
  WAIT_FOR_CUSTOMER_ACTION: "SUBMISSION",
  PERFORM_FURTHER_REVIEW: "SUBMISSION",
  RETURN_TO_PREPARATION: "PREPARATION",
  REVIEW_SUBMISSION_DECISION: "SUBMISSION",
  REVIEW_OUTCOME: "OUTCOME_BILLING",
  CLOSE_CASE: "CLOSURE",
  REVIEW_CASE_STATE: null,
}

/** How a proof becomes a state once the focus step is known. */
export function presentJourneyState(proof: Proof, place: "focus" | "before" | "after"): JourneyStepState {
  if (proof === "not_applicable") return "NOT_APPLICABLE"
  if (proof === "complete") return "COMPLETED"
  if (place === "focus") {
    if (proof === "waiting") return "WAITING"
    if (proof === "attention") return "NEEDS_ATTENTION"
    return "CURRENT"
  }
  if (proof === "waiting") return "WAITING"
  if (proof === "attention") return "NEEDS_ATTENTION"
  if (place === "after") return "LOCKED"
  return "UNKNOWN"
}

export function presentCaseJourney(facts: CaseFlowFacts, now: string): CaseJourneyPresentation {
  const flow = resolveCaseFlow(facts, now)
  const closed = facts.caseStatus === "CLOSED" || facts.caseStatus === "CANCELLED"
  const readings = readSteps(facts, now)
  const focusStepId = chooseFocus(flow.primaryAction, facts, readings, closed)
  const focusIndex = focusStepId ? journeyStepIds.indexOf(focusStepId) : null
  const places = buildPlaces(facts)

  const steps: JourneyStepView[] = journeyCatalogue.map(definition => {
    const reading = readings[definition.id]
    const index = journeyStepIds.indexOf(definition.id)
    const place = focusIndex === null ? "before" : index === focusIndex ? "focus" : index > focusIndex ? "after" : "before"
    const state = presentJourneyState(reading.proof, place)
    return {
      id: definition.id,
      order: definition.order,
      title: definition.title,
      purpose: definition.purpose,
      state,
      focus: definition.id === focusStepId,
      responsibleParty: definition.responsibleParty,
      known: reading.known,
      missing: reading.missing,
      whoMustAct: reading.who,
      destination: destinationFor(definition.id, facts, places),
      unlock: definition.unlocksNext,
      unavailableReason: unavailableReason(state),
      unsupported: definition.unsupported,
      laterWork: definition.laterWork,
    }
  })

  const suppressed = flow.primaryAction && savedCardActions.has(flow.primaryAction.id) ? flow.primaryAction : null
  const incompatibilities = incompatibleNotes(facts, suppressed !== null)

  return {
    steps,
    focusStepId,
    serviceTrack: facts.serviceTrack,
    technicalStage: facts.technicalStage,
    technicalStageLabel: isTechnicalStage(facts.technicalStage) ? stageLabel(facts.technicalStage) : facts.technicalStage,
    caseStatus: facts.caseStatus,
    reopened: facts.reopened && !closed,
    closed,
    attention: flow.attentionItems.map(item => ({ code: item.code, title: item.title, explanation: item.explanation })),
    blockers: flow.blockers.filter(item => !incompatibleBlockers.has(item.code)),
    incompatibilities,
    nextAction: suppressed ? null : flow.primaryAction,
    suppressedAction: suppressed ? { id: suppressed.id, label: suppressed.label, reason: savedCardReason } : null,
    projectionNote: projectionNote(facts),
  }
}

export function selectJourneyStep(journey: CaseJourneyPresentation, requested: string | undefined): JourneyStepId {
  if (requested && journey.steps.some(step => step.id === requested)) return requested as JourneyStepId
  if (journey.focusStepId) return journey.focusStepId
  if (journey.closed) return "CLOSURE"
  return "CASE_RECEIVED"
}

function chooseFocus(
  primary: CaseNextAction | null,
  facts: CaseFlowFacts,
  readings: Record<JourneyStepId, Reading>,
  closed: boolean,
): JourneyStepId | null {
  if (closed) return null
  if (!isTechnicalStage(facts.technicalStage)) return null
  const fromAction = primary ? stepForAction[primary.id] : null
  const seed = fromAction ?? (isTechnicalStage(facts.technicalStage) ? stageFocus(facts.technicalStage) : null)
  if (!seed) return null
  let index = journeyStepIds.indexOf(seed)
  while (index < journeyStepIds.length) {
    const proof = readings[journeyStepIds[index]].proof
    if (proof !== "complete" && proof !== "not_applicable") return journeyStepIds[index]
    index += 1
  }
  return null
}

function stageFocus(stage: TechnicalStage): JourneyStepId {
  switch (stage) {
    case "INITIAL_REVIEW":
      return "CASE_RECEIVED"
    case "EVIDENCE_COLLECTION":
      return "REQUEST_DOCUMENTS"
    case "ASSESSMENT_READY":
      return "ASSESSMENT"
    case "SERVICE_SELECTION":
      return "QUOTE_ACCEPTANCE"
    case "PAYMENT_REQUIRED":
    case "AUTHORIZATION_REQUIRED":
      return "SERVICE_ACTIVATION"
    case "PREPARATION":
    case "READY_TO_SUBMIT":
      return "PREPARATION"
    case "SUBMITTED":
    case "WAITING_GOOGLE":
    case "OWNER_ACTION":
    case "FURTHER_REVIEW":
      return "SUBMISSION"
    case "OUTCOME_REVIEW":
      return "OUTCOME_BILLING"
    case "FINISHED":
      return "CLOSURE"
  }
}

function unavailableReason(state: JourneyStepState): string | null {
  if (state === "LOCKED") {
    return "This step is later in the workflow. You can read what it will ask for. It cannot be completed from here, and there is no control that skips ahead."
  }
  if (state === "UNKNOWN") {
    return "The record that would complete this step is not in the case projection. The step stays unrecorded rather than being marked done."
  }
  if (state === "NOT_APPLICABLE") return "This step does not apply to this case."
  return null
}

type Places = {
  casePage: CaseDestination | null
  evidence: CaseDestination | null
  communications: CaseDestination | null
  commercial: CaseDestination | null
  business: CaseDestination | null
  money: CaseDestination | null
}

function buildPlaces(facts: CaseFlowFacts): Places {
  return {
    casePage: caseDestination("CASE", facts.caseId),
    evidence: caseDestination("CASE_EVIDENCE", facts.caseId),
    communications: caseDestination("CASE_COMMUNICATIONS", facts.caseId),
    commercial: caseDestination("CASE_COMMERCIAL", facts.caseId),
    business: recordDestination("BUSINESS_RECORD", facts.businessId),
    money: destination("MONEY"),
  }
}

function destinationFor(id: JourneyStepId, facts: CaseFlowFacts, places: Places): CaseDestination | null {
  if (id === "VERIFICATION") return places.business
  if (id === "REQUEST_DOCUMENTS") return facts.communications.some(row => row.templateKey === "EVIDENCE_REQUEST") ? places.communications : places.evidence
  if (id === "EVIDENCE_REVIEW" || id === "PREPARATION") return places.evidence
  if (id === "QUOTE_ACCEPTANCE") return places.commercial
  if (id === "SERVICE_ACTIVATION") return facts.serviceTrack === "GUIDED" ? places.commercial : places.casePage
  if (id === "OUTCOME_BILLING") return facts.serviceTrack === "GUIDED" ? places.money : places.casePage
  if (id === "ASSESSMENT") return null
  return places.casePage
}

function projectionNote(facts: CaseFlowFacts): string | null {
  const notes: string[] = []
  if (!isTechnicalStage(facts.technicalStage)) {
    notes.push("The technical stage on this case is not one this build recognises. No step is marked complete from it.")
  }
  if (!facts.commercial.complete || !facts.payment.complete) {
    notes.push("The commercial or payment list may be incomplete, so quote acceptance and payment settlement are left unknown.")
  }
  return notes.length ? notes.join(" ") : null
}

function incompatibleNotes(facts: CaseFlowFacts, suppressed: boolean): string[] {
  if (facts.serviceTrack === "MANAGED" || suppressed) return [savedCardReason]
  return []
}

function readSteps(facts: CaseFlowFacts, now: string): Record<JourneyStepId, Reading> {
  return {
    CASE_RECEIVED: readReceived(facts),
    VERIFICATION: readVerification(facts),
    REQUEST_DOCUMENTS: readRequest(facts),
    EVIDENCE_REVIEW: readEvidence(facts),
    ASSESSMENT: readAssessment(),
    QUOTE_ACCEPTANCE: readQuote(facts, now),
    SERVICE_ACTIVATION: readActivation(facts, now),
    PREPARATION: readPreparation(facts),
    SUBMISSION: readSubmission(facts),
    OUTCOME_BILLING: readOutcome(facts),
    CLOSURE: readClosure(facts),
  }
}

function readReceived(facts: CaseFlowFacts): Reading {
  return {
    proof: "unproven",
    known: [
      `Case ${facts.reference} is on file with status ${facts.caseStatus}.`,
      "A confirmation email, if one was sent, is not a review of this case and is not identity verification.",
    ],
    missing: ["A recorded operator review of the intake."],
    who: "ProfileRelaunch reviews the new case.",
  }
}

function readVerification(facts: CaseFlowFacts): Reading {
  const auth = facts.authorization
  const known = [
    auth.customerEmailVerified
      ? "Email control is recorded. That proves control of the address, not authority to speak for the business."
      : "Email control is not recorded.",
    auth.businessAuthorityVerified
      ? `Business authority is recorded. Membership status is ${auth.membershipStatus}.`
      : `Business authority is not recorded. Membership status is ${auth.membershipStatus}.`,
    auth.hasLocation ? "A location is recorded on the case. That is not a verified Google listing." : "No location is recorded on the case.",
  ]
  const missing = [
    "Google listing verification is not in this projection.",
    "The legal purchasing establishment is not in this projection.",
  ]
  if (!auth.customerEmailVerified) missing.push("Verified email control.")
  if (!auth.businessAuthorityVerified) missing.push("Verified authority to speak for the business.")
  const revoked = auth.membershipStatus === "revoked"
  return {
    proof: revoked ? "attention" : "unproven",
    known,
    missing,
    who: revoked ? "ProfileRelaunch has to look at a membership that is no longer valid." : "ProfileRelaunch verifies the business, the profile and the contact.",
  }
}

function readRequest(facts: CaseFlowFacts): Reading {
  const summary = summariseEvidence(facts.evidence, facts.communications)
  const liveRequests = summary.requests.filter(request => request.state !== "CANCELLED")
  const known = [
    liveRequests.length
      ? `${liveRequests.length} evidence request${liveRequests.length === 1 ? "" : "s"} on file. A request record contacts nobody by itself.`
      : "No evidence request is on file.",
    `The newest evidence-request message is ${summary.contact}.`,
  ]
  if (summary.contact === "DELIVERED" && liveRequests.length > 0) {
    return {
      proof: "complete",
      known: [...known, "Delivery is recorded, so the customer was reached."],
      missing: [],
      who: "The customer has the request.",
    }
  }
  if (summary.contact === "FAILED") {
    return {
      proof: "attention",
      known,
      missing: ["A delivered evidence request. The latest message failed."],
      who: "ProfileRelaunch has to recover contact before the customer can be expected to reply.",
    }
  }
  if (summary.contact === "QUEUED" || summary.contact === "PROVIDER_ACCEPTED" || summary.contact === "ACCEPTANCE_UNKNOWN") {
    return {
      proof: "waiting",
      known: [...known, "Provider acceptance and a queued message are not delivery."],
      missing: ["A delivery status of DELIVERED."],
      who: "The message is with the provider. The customer has not been reached.",
    }
  }
  return {
    proof: "unproven",
    known,
    missing: ["An evidence request the customer has actually received."],
    who: "ProfileRelaunch prepares and sends the request.",
  }
}

function readEvidence(facts: CaseFlowFacts): Reading {
  const summary = summariseEvidence(facts.evidence, facts.communications)
  const known = [
    summary.anyUpload ? `${summary.versionStates.length} uploaded version${summary.versionStates.length === 1 ? "" : "s"} on file.` : "No document has been submitted.",
    summary.accepted ? `${summary.accepted} accepted version${summary.accepted === 1 ? "" : "s"}.` : "No version has been accepted.",
    summary.awaitingReview ? `${summary.awaitingReview} version${summary.awaitingReview === 1 ? "" : "s"} awaiting review.` : "Nothing is waiting for a review decision.",
  ]
  const problems = summary.threatBlocked + summary.contentInvalid + summary.scanInProgress + summary.uploadInProgress + summary.needsScanCheck
  if (summary.threatBlocked || summary.contentInvalid) {
    return {
      proof: "attention",
      known,
      missing: ["A clean accepted version, and no live file blocked or invalid."],
      who: "ProfileRelaunch has to deal with the file before it can count as evidence.",
    }
  }
  const fulfilled = summary.complete && summary.accepted > 0 && summary.awaitingReview === 0 && problems === 0
  if (fulfilled) {
    return {
      proof: "complete",
      known: [...known, "The open requests are fulfilled and the accepted files are clear of a pending review."],
      missing: [],
      who: "ProfileRelaunch has reviewed the evidence.",
    }
  }
  if (summary.awaitingReview > 0 || summary.satisfiedButOpen.length > 0) {
    return {
      proof: "unproven",
      known: [...known, "Submitting a document is not acceptance, and accepting a file does not close its request."],
      missing: ["An acceptance decision, and the request marked fulfilled."],
      who: "ProfileRelaunch reviews the evidence.",
    }
  }
  if (summary.anyRequest && summary.contact === "DELIVERED" && !summary.anyUpload) {
    return {
      proof: "waiting",
      known,
      missing: ["A document from the customer."],
      who: "The customer still has to send the documents.",
    }
  }
  return {
    proof: "unproven",
    known,
    missing: ["Accepted evidence and a fulfilled request."],
    who: "ProfileRelaunch reviews whatever the customer submits.",
  }
}

function readAssessment(): Reading {
  return {
    proof: "unproven",
    known: ["No assessment record is present in the case-flow projection."],
    missing: ["A stored assessment and the recommended path."],
    who: "ProfileRelaunch writes the assessment.",
  }
}

function readQuote(facts: CaseFlowFacts, now: string): Reading {
  const commercial = summariseCommercial(facts, now)
  if (!facts.commercial.complete) {
    return {
      proof: "unproven",
      known: ["The quote list may be incomplete, so an acceptance in the rows that were returned is not enough to complete this step."],
      missing: ["A complete quote list showing an accepted quote."],
      who: "The commercial position has to be read again before anyone treats a quote as accepted.",
    }
  }
  if (commercial.state === "ACCEPTED") {
    return {
      proof: "complete",
      known: ["A quote is recorded as accepted."],
      missing: [],
      who: "The customer has accepted the quote.",
    }
  }
  if (commercial.state === "OFFERED_AWAITING") {
    return {
      proof: "waiting",
      known: ["A quote has been offered and an acceptance link is still open. Opening the contract is not acceptance."],
      missing: ["The quote status ACCEPTED."],
      who: "The customer has to accept the quote.",
    }
  }
  if (commercial.state === "DECLINED") {
    return {
      proof: "attention",
      known: ["The quote was declined."],
      missing: ["An accepted quote."],
      who: "ProfileRelaunch has to review the declined quote.",
    }
  }
  return {
    proof: "unproven",
    known: [commercial.state === "NONE" ? "No quote is on file." : `The quote is ${commercial.state}.`],
    missing: ["An accepted quote."],
    who: "ProfileRelaunch prepares the quote. The customer accepts it.",
  }
}

function readActivation(facts: CaseFlowFacts, now: string): Reading {
  if (facts.serviceTrack === "GUIDED") return readGuidedActivation(facts, now)
  if (facts.serviceTrack === "MANAGED") return readManagedActivation(facts, now)
  return {
    proof: "unproven",
    known: ["No service track has been chosen, so neither the Guided nor the Managed branch applies yet."],
    missing: ["A Guided or Managed track, and then that track's own activation record."],
    who: "ProfileRelaunch and the customer still have to choose the service.",
  }
}

function readGuidedActivation(facts: CaseFlowFacts, now: string): Reading {
  const payment = summarisePayment(facts)
  const commercial = summariseCommercial(facts, now)
  const state = payment.upfrontState ?? "none"
  const known = [
    "This is the Guided branch. The upfront fee is the activation payment.",
    facts.payment.complete
      ? `The upfront obligation state is ${state}. Returning from Checkout is not payment.`
      : "The payment list may be incomplete, so a paid row in what was returned is not treated as settlement.",
    commercial.state === "ACCEPTED" && facts.commercial.complete ? "An accepted quote is on file." : "No complete accepted quote is on file.",
  ]
  if (!facts.payment.complete || !facts.commercial.complete) {
    return {
      proof: "unproven",
      known,
      missing: ["A complete payment record whose upfront obligation is PAID."],
      who: "The payment position has to be read in full before it can be called settled.",
    }
  }
  if (payment.upfrontPaid && commercial.state === "ACCEPTED") {
    return {
      proof: "complete",
      known: [...known, "The payment provider has recorded the upfront obligation as PAID."],
      missing: [],
      who: "The upfront payment is settled.",
    }
  }
  if (payment.upfrontFailed || payment.upfrontAuthenticationRequired) {
    return {
      proof: "attention",
      known,
      missing: ["An upfront obligation recorded as PAID."],
      who: "The customer and the payment provider have an unfinished payment.",
    }
  }
  if (payment.upfrontOrder && (payment.upfrontState === "DUE" || payment.upfrontCollecting)) {
    return {
      proof: "waiting",
      known,
      missing: ["An upfront obligation recorded as PAID."],
      who: "The customer still has to pay. ProfileRelaunch does not treat a checkout return as payment.",
    }
  }
  return {
    proof: "unproven",
    known,
    missing: ["An accepted Guided order and an upfront obligation recorded as PAID."],
    who: "The customer pays the upfront fee after the quote is accepted.",
  }
}

function readManagedActivation(facts: CaseFlowFacts, now: string): Reading {
  const auth = facts.authorization
  const payment = summarisePayment(facts)
  const commercial = summariseCommercial(facts, now)
  const order = facts.payment.complete && payment.successFeeOrder ? "An accepted success-fee order is on file." : "No complete success-fee order is on file."
  const known = [
    "This is the Managed branch. Choosing Managed does not grant Google access.",
    "There is no upfront success fee. A saved card is not an activation requirement under the current agreement.",
    order,
    auth.customerEmailVerified ? "Email control is recorded. That is not business authority." : "Email control is not recorded.",
    auth.businessAuthorityVerified ? "Business authority is recorded." : "Business authority is not recorded.",
    auth.serviceAgreementAccepted ? "The service agreement is accepted." : "The service agreement is not accepted.",
    auth.caseManagementPermissionActive ? "The case-management permission is active." : "The case-management permission is not active.",
    auth.managerAccessVerified ? "Google manager access is recorded." : "Google manager access is not recorded.",
    auth.authorizationReady ? "The database authorisation rule is ready." : "The database authorisation rule is not ready.",
    payment.managedSetupReady ? "A saved payment method exists. It is not used as evidence of activation." : "No saved payment method is used in this decision.",
  ]
  const invalidated = auth.reviewRequired.length > 0 || auth.membershipStatus === "revoked"
  if (invalidated) {
    return {
      proof: "attention",
      known: [...known, `Authorisation moved back to review: ${auth.reviewRequired.join(", ") || auth.membershipStatus}. An earlier acceptance does not stay valid.`],
      missing: ["A current case-management permission, current business authority, and current Google access."],
      who: "ProfileRelaunch has to re-establish the permission that is no longer valid.",
    }
  }
  const ready =
    facts.commercial.complete &&
    facts.payment.complete &&
    commercial.state === "ACCEPTED" &&
    !!payment.successFeeOrder &&
    auth.authorizationReady &&
    auth.businessAuthorityVerified &&
    auth.caseManagementPermissionActive &&
    auth.managerAccessVerified &&
    auth.serviceAgreementAccepted
  if (ready) {
    return {
      proof: "complete",
      known,
      missing: [],
      who: "Managed activation is recorded from authority and Google access, not from a saved card.",
    }
  }
  const agreementOpen = facts.customerActions.some(
    action => action.kind === "AGREEMENT_ACCEPTANCE" && action.status === "OPEN" && action.expiresAt > now,
  )
  return {
    proof: agreementOpen ? "waiting" : "unproven",
    known,
    missing: [
      "Verified business authority, an active case-management permission, verified Google access, and the database authorisation rule.",
    ],
    who: agreementOpen ? "The customer still has an open agreement or permission to answer." : "ProfileRelaunch verifies authority and Google access. The customer accepts the agreement and the case permission.",
  }
}

function readPreparation(facts: CaseFlowFacts): Reading {
  const live = facts.packs.packs.filter(pack => pack.status !== "SUPERSEDED")
  const published = facts.packs.packs.some(pack => pack.published && pack.status === "APPROVED" && pack.itemCount > 0)
  const stale = live.some(pack => pack.status === "STALE")
  const known = [
    facts.packs.packs.length ? `${facts.packs.packs.length} pack${facts.packs.packs.length === 1 ? "" : "s"} on file.` : "No prepared pack is on file.",
    published ? "An approved, non-empty pack is published." : "No approved non-empty pack is published.",
    stale ? "A live pack is stale." : "No live pack is marked stale.",
  ]
  if (stale) {
    return {
      proof: "attention",
      known,
      missing: ["A published approved pack that is not stale."],
      who: "ProfileRelaunch has to rebuild the stale pack.",
    }
  }
  if (published && !stale) {
    return { proof: "complete", known, missing: [], who: "The published pack is current." }
  }
  return {
    proof: "unproven",
    known,
    missing: ["An approved, published, non-empty pack that is not stale."],
    who: "ProfileRelaunch prepares and publishes the pack.",
  }
}

function readSubmission(facts: CaseFlowFacts): Reading {
  const unresolved = facts.submissions.filter(item => !item.result)
  const known = [
    facts.submissions.length
      ? `${facts.submissions.length} submission${facts.submissions.length === 1 ? "" : "s"} recorded.`
      : "No submission is recorded.",
    facts.capabilities.googleSubmissionLive
      ? "A Google submission transport is configured."
      : "No live Google submission transport is configured. Recording a submission is not the same as sending one.",
  ]
  if (unresolved.length > 0) {
    return {
      proof: "waiting",
      known: [...known, "A submission with no result is still waiting for Google."],
      missing: ["A recorded result on every submission."],
      who: "Google has not answered the open submission.",
    }
  }
  if (facts.submissions.length > 0) {
    return {
      proof: "complete",
      known: [...known, "Every recorded submission has a result."],
      missing: [],
      who: "The submission result is recorded.",
    }
  }
  return {
    proof: "unproven",
    known,
    missing: ["A submission and its result."],
    who: "ProfileRelaunch records an externally completed submission. Google then answers it.",
  }
}

function readOutcome(facts: CaseFlowFacts): Reading {
  const payment = summarisePayment(facts)
  const known = [
    facts.outcome ? `The case outcome is ${facts.outcome}.` : "No case outcome is recorded.",
  ]
  if (facts.serviceTrack === "MANAGED") {
    return {
      proof: "unproven",
      known: [
        ...known,
        "A Managed success fee is invoiced only after documented success. No post-success invoice is in this projection, so billing cannot be marked complete.",
      ],
      missing: ["A recorded outcome and a post-success invoice. Neither a checkout return nor a saved card is that invoice."],
      who: "ProfileRelaunch verifies the outcome. Billing waits for a real invoice after success.",
    }
  }
  if (!facts.outcome) {
    return {
      proof: "unproven",
      known,
      missing: ["A recorded case outcome."],
      who: "ProfileRelaunch reviews the outcome.",
    }
  }
  if (facts.serviceTrack === "GUIDED" && facts.payment.complete && payment.upfrontPaid) {
    return {
      proof: "complete",
      known: [...known, "The Guided upfront obligation is already PAID. No second charge is inferred."],
      missing: [],
      who: "The outcome is recorded and the Guided fee was already settled.",
    }
  }
  return {
    proof: "unproven",
    known: [...known, "The outcome is recorded. Billing is not, because settlement is not in a complete payment record."],
    missing: ["Verified billing for this track."],
    who: "ProfileRelaunch still has to confirm billing.",
  }
}

function readClosure(facts: CaseFlowFacts): Reading {
  const closed = facts.caseStatus === "CLOSED" || facts.caseStatus === "CANCELLED"
  if (closed) {
    return {
      proof: "complete",
      known: [
        `The case status is ${facts.caseStatus}.`,
        "Optional Guard was not required and did not block closure.",
      ],
      missing: [],
      who: "The case is closed.",
    }
  }
  return {
    proof: "unproven",
    known: [
      facts.reopened ? "This case was closed before and has been reopened. Closure is not still complete." : "The case is open.",
      "Optional Guard is not a condition of closure.",
    ],
    missing: ["A case status of CLOSED or CANCELLED."],
    who: "ProfileRelaunch closes the case when the work is finished. Guard can stay unset.",
  }
}
