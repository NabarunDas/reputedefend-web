/**
 * `resolveCaseFlow(facts, now)` — the whole case journey in one pure
 * function.
 *
 * It decides nothing and changes nothing. Given the facts the database
 * already holds, it answers four questions an operator currently has to open
 * five Admin surfaces to answer: where the case is, what is finished, what
 * is in the way, and what to do next. The database stays the authority: a
 * transition this model calls ready is still refused by
 * `case_stage_ready_v1` if the prerequisites are not genuinely met, and that
 * is the correct outcome, not a bug in either place.
 *
 * `now` is a parameter. Nothing in this file reads the clock, so a scenario
 * fixture is reproducible and an overdue test does not depend on the day it
 * runs.
 */

import {
  actionCatalogue,
  highestPriority,
  type ActionCandidate,
} from "./actions"
import {
  caseDestination,
  destination,
  recordDestination,
  type CaseDestination,
  type CaseDestinationKind,
} from "./destinations"
import {
  contactAwaitingProvider,
  contactReachedCustomer,
  summariseEvidence,
  type EvidenceSummary,
} from "./evidence"
import {
  casePhaseIds,
  casePhaseLabels,
  phaseCompleteDetails,
  phaseForStage,
  phaseOrdinal,
  phaseUpcomingDetails,
  stageLabel,
  type CasePhaseId,
} from "./phases"
import { attention, blocker, type CaseAttentionCode, type CaseBlockerCode } from "./notices"
import type {
  CaseAttentionItem,
  CaseBlocker,
  CaseFlowFacts,
  CaseFlowModel,
  CaseFlowOrderFact,
  CaseFlowQuoteFact,
  CaseNextAction,
  CasePhase,
  CasePhaseState,
  CasePrerequisite,
  CasePrerequisiteGroup,
  CaseWaitingOn,
} from "./model"

// ---------------------------------------------------------------------------
// Derived views over the facts
// ---------------------------------------------------------------------------

type CommercialState =
  | "UNKNOWN"
  | "NONE"
  | "DRAFT_UNCONFIGURED"
  | "DRAFT_READY"
  | "OFFERED_NO_LINK"
  | "OFFERED_AWAITING"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"

type CommercialView = {
  state: CommercialState
  quote: CaseFlowQuoteFact | null
  /** The open acceptance link's expiry, when one is open. */
  acceptanceExpiresAt: string | null
  acceptanceExpired: boolean
  truncated: boolean
}

/** The quote that matters: the furthest one along, not the newest. */
const quoteRank: Record<string, number> = {
  ACCEPTED: 0, OFFERED: 1, DRAFT: 2, DECLINED: 3, EXPIRED: 4, SUPERSEDED: 5, CANCELLED: 6,
}

function summariseCommercial(facts: CaseFlowFacts, now: string): CommercialView {
  const quotes = [...facts.commercial.quotes].sort(
    (a, b) => (quoteRank[a.status] ?? 9) - (quoteRank[b.status] ?? 9),
  )
  const quote = quotes[0] ?? null
  const truncated = !facts.commercial.complete
  if (!quote) {
    return {
      state: truncated ? "UNKNOWN" : "NONE",
      quote: null,
      acceptanceExpiresAt: null,
      acceptanceExpired: false,
      truncated,
    }
  }
  const open = quote.actionStatus === "OPEN"
  const expiresAt = open ? quote.actionExpiresAt : null
  const expired = !!expiresAt && expiresAt <= now
  const state: CommercialState =
    quote.status === "ACCEPTED" ? "ACCEPTED"
    : quote.status === "DECLINED" ? "DECLINED"
    : quote.status === "OFFERED" ? (open && !expired ? "OFFERED_AWAITING" : "OFFERED_NO_LINK")
    : quote.status === "DRAFT" ? (quote.taxBehaviour === "UNCONFIRMED" ? "DRAFT_UNCONFIGURED" : "DRAFT_READY")
    : "EXPIRED"
  return { state, quote, acceptanceExpiresAt: expiresAt, acceptanceExpired: expired, truncated }
}

type PaymentView = {
  truncated: boolean
  upfrontOrder: CaseFlowOrderFact | null
  successFeeOrder: CaseFlowOrderFact | null
  /** The authoritative upfront obligation state, or null when there is none. */
  upfrontState: string | null
  upfrontPaid: boolean
  upfrontFailed: boolean
  upfrontAuthenticationRequired: boolean
  upfrontCollecting: boolean
  managedSetupReady: boolean
  managedConsentRecorded: boolean
}

function summarisePayment(facts: CaseFlowFacts): PaymentView {
  const upfrontOrder = facts.payment.orders.find(order => order.paymentModel === "UPFRONT") ?? null
  const successFeeOrder = facts.payment.orders.find(order => order.paymentModel === "SUCCESS_FEE") ?? null
  const upfrontState =
    upfrontOrder && upfrontOrder.obligationKind === "UPFRONT" ? upfrontOrder.obligationState : null
  return {
    truncated: !facts.payment.complete,
    upfrontOrder,
    successFeeOrder,
    upfrontState,
    upfrontPaid: upfrontState === "PAID",
    upfrontFailed: upfrontState === "FAILED",
    upfrontAuthenticationRequired: upfrontState === "AUTHENTICATION_REQUIRED",
    upfrontCollecting: upfrontState === "COLLECTING",
    managedSetupReady: !!successFeeOrder?.setupReady,
    managedConsentRecorded: !!successFeeOrder?.consentRecorded,
  }
}

type PackView = {
  any: boolean
  /** The pack being worked on: the newest that has not been superseded. */
  working: CaseFlowPack | null
  stale: boolean
  publishedUsable: boolean
  unpublishedAfterPublication: boolean
}

type CaseFlowPack = CaseFlowFacts["packs"]["packs"][number]

function summarisePacks(facts: CaseFlowFacts): PackView {
  const live = facts.packs.packs.filter(pack => pack.status !== "SUPERSEDED")
  const working = live.reduce<CaseFlowPack | null>(
    (best, pack) => (best === null || pack.packNumber > best.packNumber ? pack : best),
    null,
  )
  const publishedUsable = facts.packs.packs.some(
    pack => pack.published && pack.status === "APPROVED" && pack.itemCount > 0,
  )
  return {
    any: facts.packs.packs.length > 0,
    working,
    stale: live.some(pack => pack.status === "STALE"),
    publishedUsable,
    unpublishedAfterPublication: facts.packs.packs.some(pack => pack.everPublished && !pack.published),
  }
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

function guidedPrerequisites(
  facts: CaseFlowFacts,
  commercial: CommercialView,
  payment: PaymentView,
  destinations: Destinations,
): CasePrerequisiteGroup {
  const accepted = commercial.state === "ACCEPTED" || !!payment.upfrontOrder
  const items: CasePrerequisite[] = [
    {
      id: "QUOTE_ACCEPTED",
      label: "The customer has accepted a quote",
      state: accepted ? "SATISFIED" : commercial.state === "OFFERED_AWAITING" ? "IN_PROGRESS" : "NOT_STARTED",
      detail: accepted
        ? "An accepted quote has created the order payment is collected against."
        : "Payment is collected against an order, and an order only exists once a quote has been accepted.",
      owner: accepted ? "ADMIN" : "CUSTOMER",
      destination: destinations.commercial,
    },
    {
      id: "UPFRONT_PAYMENT",
      label: "The upfront payment has been collected",
      state:
        payment.upfrontPaid ? "SATISFIED"
        : payment.upfrontFailed || payment.upfrontAuthenticationRequired ? "ATTENTION"
        : payment.upfrontCollecting ? "IN_PROGRESS"
        : "NOT_STARTED",
      detail:
        payment.upfrontPaid ? "The payment provider has confirmed the money was taken."
        : payment.upfrontFailed ? "The last attempt failed and nothing has been collected."
        : payment.upfrontAuthenticationRequired ? "The bank asked for extra authentication and it has not been given."
        : payment.upfrontCollecting ? "Collection has started. A completed checkout page is not a payment."
        : "Collection has not been started.",
      owner: payment.upfrontPaid ? "ADMIN" : "CUSTOMER",
      destination: destinations.money,
    },
  ]
  return {
    id: "GUIDED_PAYMENT",
    label: "Before a Guided case can be prepared",
    satisfied: items.every(item => item.state === "SATISFIED"),
    items,
  }
}

/**
 * Six separate answers, never one `authorised` flag.
 *
 * Five of them are the component facts the database checks, so an operator
 * can see which one is missing instead of being told "not authorised". The
 * sixth is the authoritative aggregate itself, consumed from
 * `case_authorization_readiness_v1` rather than recomputed here: if this
 * model's reading of the components ever disagreed with the database, the
 * database is right and the disagreement is visible on the same screen.
 */
function managedAuthorisation(
  facts: CaseFlowFacts,
  destinations: Destinations,
): CasePrerequisiteGroup {
  const authorization = facts.authorization
  const review = (kind: string) => authorization.reviewRequired.includes(kind)
  const items: CasePrerequisite[] = [
    {
      id: "CUSTOMER_EMAIL_VERIFIED",
      label: "The customer's email address is verified",
      state: authorization.customerEmailVerified ? "SATISFIED" : "NOT_STARTED",
      detail: authorization.customerEmailVerified
        ? "The address permissions are tied to has been verified."
        : "Permissions are tied to a verified address. Nothing the customer accepts can be relied on until it is verified.",
      owner: "ADMIN",
      destination: destinations.client,
    },
    {
      id: "BUSINESS_AUTHORITY_VERIFIED",
      label: "The customer's authority over the business is verified",
      state: authorization.businessAuthorityVerified ? "SATISFIED" : "NOT_STARTED",
      detail: authorization.businessAuthorityVerified
        ? "The membership linking this customer to the business is verified."
        : `The membership linking this customer to the business is ${authorization.membershipStatus}, so there is no record that they speak for it.`,
      owner: "ADMIN",
      destination: destinations.business,
    },
    {
      id: "SERVICE_AGREEMENT_ACCEPTED",
      label: "The service agreement is accepted",
      state:
        review("SERVICE_AGREEMENT") ? "ATTENTION"
        : authorization.serviceAgreementAccepted ? "SATISFIED"
        : openAgreement(facts, "SERVICE_AGREEMENT") ? "IN_PROGRESS"
        : "NOT_STARTED",
      detail:
        review("SERVICE_AGREEMENT")
          ? "The accepted agreement was invalidated by a later change and has to be issued again."
          : authorization.serviceAgreementAccepted
            ? "The customer has accepted the service agreement."
            : "The customer has not accepted the service agreement.",
      owner: "CUSTOMER",
      destination: destinations.case,
    },
    {
      id: "CASE_PERMISSION_ACTIVE",
      label: "The case-management permission is active",
      state:
        review("CASE_MANAGEMENT_PERMISSION") ? "ATTENTION"
        : authorization.caseManagementPermissionActive ? "SATISFIED"
        : openAgreement(facts, "CASE_MANAGEMENT_PERMISSION") ? "IN_PROGRESS"
        : "NOT_STARTED",
      detail:
        review("CASE_MANAGEMENT_PERMISSION")
          ? "The accepted permission was invalidated by a later change and has to be issued again."
          : authorization.caseManagementPermissionActive
            ? "The customer has given permission for this specific case."
            : "This permission is specific to this case and is separate from the service agreement.",
      owner: "CUSTOMER",
      destination: destinations.case,
    },
    {
      id: "MANAGER_ACCESS_VERIFIED",
      label: "Google Manager access is verified",
      state:
        authorization.managerAccessVerified ? "SATISFIED"
        : !authorization.hasLocation ? "ATTENTION"
        : "NOT_STARTED",
      detail:
        authorization.managerAccessVerified
          ? "Manager or Owner access to the location's Google profile is recorded."
          : !authorization.hasLocation
            ? "The case has no location, so there is nothing to verify access against."
            : "Manager or Owner access to the location's Google profile has not been recorded.",
      owner: "ADMIN",
      destination: destinations.case,
    },
    {
      id: "AUTHORISATION_READY",
      label: "The domain rule agrees permission is complete",
      state: authorization.authorizationReady ? "SATISFIED" : "NOT_STARTED",
      detail: authorization.authorizationReady
        ? "The authorisation rule in the database confirms this case may be worked."
        : "This is the database's own answer, not this view's. Until it is true the transition is refused whatever the items above say.",
      owner: "ADMIN",
      destination: destinations.case,
    },
  ]
  return {
    id: "MANAGED_AUTHORISATION",
    label: "Permission to act on a Managed case",
    satisfied: authorization.authorizationReady,
    items,
  }
}

function managedPayment(payment: PaymentView, destinations: Destinations): CasePrerequisiteGroup {
  const hasOrder = !!payment.successFeeOrder
  const items: CasePrerequisite[] = [
    {
      id: "SUCCESS_FEE_ORDER",
      label: "There is an accepted success-fee order",
      state: hasOrder ? "SATISFIED" : "NOT_STARTED",
      detail: hasOrder
        ? "The accepted quote has created the order the success fee will be charged against."
        : "Payment setup happens against an order, which exists once the customer accepts the quote.",
      owner: hasOrder ? "ADMIN" : "CUSTOMER",
      destination: destinations.commercial,
    },
    {
      id: "LATER_CHARGE_CONSENT",
      label: "The customer has consented to a later charge",
      state: payment.managedConsentRecorded ? "SATISFIED" : "NOT_STARTED",
      detail: payment.managedConsentRecorded
        ? "Consent to charge on success is recorded."
        : "A Managed case is charged when it succeeds, so the customer has to agree to that in advance.",
      owner: "CUSTOMER",
      destination: destinations.money,
    },
    {
      id: "SAVED_PAYMENT_METHOD",
      label: "A usable payment method is saved",
      state:
        payment.managedSetupReady ? "SATISFIED"
        : payment.managedConsentRecorded ? "ATTENTION"
        : "NOT_STARTED",
      detail:
        payment.managedSetupReady
          ? "A usable saved payment method is on file for this order."
          : payment.managedConsentRecorded
            ? "Consent was given but no usable payment method was saved, so the setup did not finish."
            : "No payment method has been saved for this order.",
      owner: "CUSTOMER",
      destination: destinations.money,
    },
  ]
  return {
    id: "MANAGED_PAYMENT",
    label: "Before a Managed case can be prepared",
    satisfied: payment.managedSetupReady,
    items,
  }
}

function openAgreement(facts: CaseFlowFacts, kind: string): boolean {
  return facts.customerActions.some(
    action => action.kind === "AGREEMENT_ACCEPTANCE" && action.agreementKind === kind && action.status === "OPEN",
  )
}

function openAction(facts: CaseFlowFacts, kind: string): boolean {
  return facts.customerActions.some(action => action.kind === kind && action.status === "OPEN")
}

function completedAction(facts: CaseFlowFacts, kind: string): boolean {
  return facts.customerActions.some(action => action.kind === kind && action.status === "COMPLETED")
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

type Destinations = Record<"case" | "evidence" | "communications" | "commercial" | "money" | "tasks" | "client" | "business" | "complaints" | "documents" | "conversations", CaseDestination | null>

function buildDestinations(facts: CaseFlowFacts): Destinations {
  return {
    case: caseDestination("CASE", facts.caseId),
    evidence: caseDestination("CASE_EVIDENCE", facts.caseId),
    communications: caseDestination("CASE_COMMUNICATIONS", facts.caseId),
    commercial: destination("COMMERCIAL"),
    money: destination("MONEY"),
    tasks: destination("TASKS"),
    complaints: destination("COMPLAINTS"),
    documents: destination("DOCUMENTS"),
    conversations: destination("CONVERSATIONS"),
    client: recordDestination("CLIENT_RECORD", facts.customerId),
    business: recordDestination("BUSINESS_RECORD", facts.businessId),
  }
}

const surfaceKeys: Record<CaseDestinationKind, keyof Destinations> = {
  CASE: "case",
  CASE_EVIDENCE: "evidence",
  CASE_COMMUNICATIONS: "communications",
  COMMERCIAL: "commercial",
  MONEY: "money",
  TASKS: "tasks",
  DOCUMENTS: "documents",
  CONVERSATIONS: "conversations",
  COMPLAINTS: "complaints",
  CLIENT_RECORD: "client",
  BUSINESS_RECORD: "business",
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

type Collector = {
  facts: CaseFlowFacts
  now: string
  destinations: Destinations
  evidence: EvidenceSummary
  commercial: CommercialView
  payment: PaymentView
  packs: PackView
  candidates: ActionCandidate[]
  blockers: CaseBlocker[]
  attention: CaseAttentionItem[]
}

function propose(collector: Collector, candidate: ActionCandidate): void {
  collector.candidates.push(candidate)
}

function block(collector: Collector, code: CaseBlockerCode, where: keyof Destinations = "case"): void {
  if (collector.blockers.some(existing => existing.code === code)) return
  collector.blockers.push(blocker(code, collector.destinations[where]))
}

function notice(
  collector: Collector,
  code: CaseAttentionCode,
  options: Parameters<typeof attention>[1] & { where?: keyof Destinations } = {},
): void {
  if (collector.attention.some(existing => existing.code === code)) return
  const { where = "case", ...rest } = options
  collector.attention.push(attention(code, { ...rest, destination: collector.destinations[where] }))
}

export function resolveCaseFlow(facts: CaseFlowFacts, now: string): CaseFlowModel {
  const destinations = buildDestinations(facts)
  const collector: Collector = {
    facts,
    now,
    destinations,
    evidence: summariseEvidence(facts.evidence, facts.communications),
    commercial: summariseCommercial(facts, now),
    payment: summarisePayment(facts),
    packs: summarisePacks(facts),
    candidates: [],
    blockers: [],
    attention: [],
  }

  const phase = phaseForStage(facts.technicalStage)
  const caseComplete =
    facts.technicalStage === "FINISHED" || facts.caseStatus === "CLOSED" || facts.caseStatus === "CANCELLED"

  if (caseComplete) {
    collectDurableExceptions(collector)
  } else {
    collectSafety(collector)
    collectHousekeeping(collector)
    collectStage(collector, phase)
    if (collector.candidates.length === 0) {
      propose(collector, { id: "REVIEW_CASE_STATE", reasonCodes: ["NO_RULE_MATCHED"] })
    }
  }

  const prerequisites = buildPrerequisiteGroups(collector, facts)
  const chosen = caseComplete ? null : highestPriority(collector.candidates)
  const primaryAction = chosen ? materialise(collector, chosen) : null
  const phases = buildPhases(phase, caseComplete, collector.attention, stageLabel(facts.technicalStage))

  return {
    caseId: facts.caseId,
    reference: facts.reference,
    technicalStage: facts.technicalStage,
    technicalStageLabel: stageLabel(facts.technicalStage),
    phase,
    phaseLabel: casePhaseLabels[phase],
    phases,
    serviceTrack: facts.serviceTrack,
    primaryAction,
    waitingOn: resolveWaitingOn(primaryAction),
    blockers: collector.blockers,
    attentionItems: collector.attention,
    prerequisites,
    progressSummary: {
      completed: phases.filter(entry => entry.state === "COMPLETE").length,
      total: phases.length,
    },
    caseComplete,
    reopened: facts.reopened && !caseComplete,
    outcome: facts.outcome,
    outcomeSummary: facts.outcomeSummary,
  }
}

/** Exactly one party, taken from the action the operator is being shown. */
function resolveWaitingOn(action: CaseNextAction | null): CaseWaitingOn {
  return action ? action.owner : "NONE"
}

function materialise(collector: Collector, candidate: ActionCandidate): CaseNextAction {
  const definition = actionCatalogue[candidate.id]
  return {
    id: candidate.id,
    label: definition.label,
    description: candidate.description ?? definition.description,
    owner: definition.owner,
    state: candidate.state ?? definition.state,
    dueAt: candidate.dueAt ?? null,
    overdue: candidate.overdue ?? false,
    destination: collector.destinations[surfaceKeys[definition.surface]],
    reasonCodes: candidate.reasonCodes ?? [],
  }
}

// ---------------------------------------------------------------------------
// Safety: evaluated on every open case, whatever stage it is at
// ---------------------------------------------------------------------------

function collectSafety(collector: Collector): void {
  const { evidence, facts, payment } = collector

  if (evidence.threatBlocked > 0) {
    propose(collector, { id: "RESOLVE_EVIDENCE_THREAT", reasonCodes: ["EVIDENCE_THREAT_FOUND"] })
    notice(collector, "EVIDENCE_THREAT_FOUND", { where: "evidence" })
    block(collector, "EVIDENCE_THREAT_BLOCKED", "evidence")
  }
  if (evidence.contentInvalid > 0) {
    propose(collector, { id: "REPLACE_INVALID_EVIDENCE", reasonCodes: ["EVIDENCE_CONTENT_INVALID"] })
    notice(collector, "EVIDENCE_CONTENT_INVALID", { where: "evidence" })
  }
  if (facts.authorization.reviewRequired.length > 0) {
    propose(collector, { id: "RESOLVE_AUTHORISATION_REVIEW", reasonCodes: ["AUTHORISATION_REVIEW_REQUIRED"] })
    notice(collector, "AUTHORISATION_REVIEW_REQUIRED")
    block(collector, "AUTHORISATION_IN_REVIEW")
  }
  if (payment.upfrontFailed) {
    propose(collector, { id: "RESOLVE_PAYMENT_EXCEPTION", reasonCodes: ["PAYMENT_FAILED"] })
    notice(collector, "PAYMENT_FAILED", { where: "money" })
  }
  if (payment.upfrontAuthenticationRequired) {
    propose(collector, { id: "RESOLVE_PAYMENT_EXCEPTION", reasonCodes: ["PAYMENT_AUTHENTICATION_REQUIRED"] })
    notice(collector, "PAYMENT_AUTHENTICATION_REQUIRED", { where: "money" })
  }
  if (payment.successFeeOrder && payment.managedConsentRecorded && !payment.managedSetupReady) {
    propose(collector, {
      id: "RESOLVE_MANAGED_PAYMENT_EXCEPTION",
      reasonCodes: ["MANAGED_SETUP_INCOMPLETE_AFTER_CONSENT"],
    })
  }
  if (evidence.contact === "FAILED" && evidence.openRequests.length > 0) {
    propose(collector, { id: "RECOVER_CUSTOMER_CONTACT", reasonCodes: ["EVIDENCE_REQUEST_UNDELIVERED"] })
    notice(collector, "EVIDENCE_REQUEST_UNDELIVERED", { where: "communications" })
  }
  if (collector.packs.stale) {
    notice(collector, "PACK_STALE", { where: "evidence" })
    block(collector, "PACK_STALE", "evidence")
  }
}

/**
 * What survives the end of the case.
 *
 * Closing a case finishes its journey, so none of the ordinary workflow
 * expectations apply any more: an old pack that went stale, a prerequisite
 * that lapsed and a permission that was invalidated are all history, and
 * resurrecting them would be noise. An open complaint is different. The
 * case rules already say a complaint cannot disappear because the case it
 * concerns was closed, so it stays visible as an exception — never as a
 * case-progression action, because there is no case progression left.
 */
function collectDurableExceptions(collector: Collector): void {
  const { facts, now } = collector
  if (facts.complaints.open.length === 0) return
  const dates = facts.complaints.open.map(entry => entry.dueAt).filter((value): value is string => !!value).sort()
  notice(collector, "COMPLAINT_OPEN", {
    where: "complaints",
    dueAt: dates[0] ?? null,
    overdue: !!dates[0] && dates[0] <= now,
    phase: "COMPLETE",
  })
}

/**
 * Things that deserve a mention but never take over the recommendation:
 * overdue follow-ups, open complaints, expired links, truncated lists.
 */
function collectHousekeeping(collector: Collector): void {
  const { facts, now } = collector

  const overdueTasks = facts.tasks.filter(task => task.status === "OPEN" && task.dueAt <= now)
  if (overdueTasks.length > 0) {
    const earliest = overdueTasks.map(task => task.dueAt).sort()[0]
    notice(collector, "TASK_OVERDUE", {
      where: "tasks",
      dueAt: earliest,
      overdue: true,
      phase: phaseForStage(facts.technicalStage),
      detail: overdueTasks.length > 1 ? `${overdueTasks.length} tasks are overdue.` : undefined,
    })
  }
  if (facts.plannedNextActionDueAt && facts.plannedNextActionDueAt <= now) {
    notice(collector, "PLANNED_ACTION_OVERDUE", {
      dueAt: facts.plannedNextActionDueAt,
      overdue: true,
      phase: phaseForStage(facts.technicalStage),
      detail: facts.plannedNextAction ? `The recorded action is: ${facts.plannedNextAction}` : undefined,
    })
  }
  if (facts.complaints.open.length > 0) {
    const dates = facts.complaints.open.map(entry => entry.dueAt).filter((value): value is string => !!value).sort()
    notice(collector, "COMPLAINT_OPEN", {
      where: "complaints",
      dueAt: dates[0] ?? null,
      overdue: !!dates[0] && dates[0] <= now,
      phase: phaseForStage(facts.technicalStage),
    })
  }
  if (collector.commercial.truncated) notice(collector, "COMMERCIAL_LIST_TRUNCATED", { where: "commercial" })
  if (collector.payment.truncated) notice(collector, "PAYMENT_LIST_TRUNCATED", { where: "money" })
  if (collector.packs.unpublishedAfterPublication && !collector.packs.publishedUsable) {
    notice(collector, "PACK_UNPUBLISHED", { where: "evidence" })
  }
  if (facts.reopened) notice(collector, "CASE_REOPENED")

  const expired = facts.customerActions.find(action => action.status === "OPEN" && action.expiresAt <= now)
  if (expired) {
    notice(collector, "CUSTOMER_ACTION_EXPIRED", { dueAt: expired.expiresAt, overdue: true })
  }
  if (facts.submissions.some(entry => entry.result === null)) {
    notice(collector, "SUBMISSION_AWAITING_RESULT")
  }
  if (!facts.capabilities.liveMailEnabled) notice(collector, "LIVE_MAIL_DISABLED", { where: "communications" })
}

// ---------------------------------------------------------------------------
// Stage rules
// ---------------------------------------------------------------------------

function collectStage(collector: Collector, phase: CasePhaseId): void {
  const stage = collector.facts.technicalStage
  if (phase === "RECEIVED") return receivedRules(collector)
  if (phase === "EVIDENCE") return evidenceRules(collector)
  if (phase === "ASSESSMENT") return assessmentRules(collector)
  if (phase === "SERVICE") return serviceRules(collector)
  if (phase === "PREREQUISITES") return prerequisiteRules(collector)
  if (phase === "PREPARATION") return preparationRules(collector)
  if (phase === "SUBMISSION") return submissionRules(collector, stage)
  if (phase === "DECISION") return decisionRules(collector, stage)
}

function allows(collector: Collector, target: string): boolean {
  return collector.facts.allowedTransitions.includes(target)
}

function receivedRules(collector: Collector): void {
  propose(collector, { id: "REVIEW_NEW_CASE", reasonCodes: ["CASE_NOT_TRIAGED"] })
}

/**
 * The evidence phase, which is where most of the confusion lives.
 *
 * Raising a request, writing the message, the message actually arriving, the
 * file arriving, the scan, the validation, the review and closing the
 * request off are eight different things. The customer is only genuinely
 * being waited on in one of them.
 */
function evidenceRules(collector: Collector): void {
  const { evidence } = collector

  if (!evidence.anyRequest) {
    propose(collector, { id: "REQUEST_EVIDENCE", reasonCodes: ["NO_EVIDENCE_REQUEST"] })
    return
  }

  // The contact ladder answers "has the customer been told?". Once a file
  // arrives against a request that question is answered by the file, so it
  // only runs while something is still outstanding with nothing behind it.
  if (evidence.openRequests.some(entry => entry.state === "OPEN_NOT_STARTED")) {
    contactRules(collector)
  }

  if (evidence.scanInProgress > 0) {
    propose(collector, { id: "WAIT_FOR_EVIDENCE_SCAN", reasonCodes: ["EVIDENCE_SCAN_PENDING"] })
  }
  if (evidence.needsScanCheck > 0) {
    propose(collector, { id: "CHECK_EVIDENCE_SCAN", reasonCodes: ["EVIDENCE_SCAN_UNRESOLVED"] })
    notice(collector, "EVIDENCE_SCAN_UNRESOLVED", { where: "evidence" })
  }
  if (evidence.awaitingReview > 0) {
    propose(collector, { id: "REVIEW_EVIDENCE", reasonCodes: ["EVIDENCE_AWAITING_REVIEW"] })
  }
  if (evidence.satisfiedButOpen.length > 0) {
    propose(collector, { id: "FULFIL_EVIDENCE_REQUEST", reasonCodes: ["EVIDENCE_REQUEST_SATISFIED_BUT_OPEN"] })
    notice(collector, "EVIDENCE_REQUEST_SATISFIED_BUT_OPEN", { where: "evidence" })
  }

  const nothingArrived =
    evidence.openRequests.some(request => request.state === "OPEN_NOT_STARTED")
    && contactReachedCustomer(evidence.contact)
  // An upload that is half finished or failed outright is also the
  // customer's move, and is not the same as never having been asked.
  const uploadIncomplete = evidence.uploadInProgress > 0 || evidence.uploadFailed > 0
  if (nothingArrived || uploadIncomplete) {
    const dueAt = evidence.earliestOpenDueAt
    propose(collector, {
      id: "WAIT_FOR_CUSTOMER_EVIDENCE",
      dueAt,
      overdue: !!dueAt && dueAt <= collector.now,
      reasonCodes: ["EVIDENCE_REQUEST_OPEN"],
    })
    if (dueAt && dueAt <= collector.now) {
      notice(collector, "EVIDENCE_REQUEST_OVERDUE", { where: "evidence", dueAt, overdue: true })
    }
  }

  if (evidence.complete && evidence.accepted > 0 && allows(collector, "ASSESSMENT_READY")) {
    propose(collector, { id: "ADVANCE_TO_ASSESSMENT", reasonCodes: ["EVIDENCE_COMPLETE"] })
  }
}

/**
 * Whether the customer has actually been told, and how far that got.
 *
 * The Step 11 contract keeps three things apart that an operator would
 * otherwise read as one: a message that has been queued, a message the
 * provider said it accepted, and a message that was delivered. Only the
 * last of those means the customer has it. The two before it are waits on
 * the provider, and a message whose provider acceptance was never
 * established is neither — it needs reconciling before anything else.
 */
function contactRules(collector: Collector): void {
  const { evidence, facts } = collector
  const liveMail = facts.capabilities.liveMailEnabled
  if (evidence.contact === "NOT_PREPARED") {
    propose(collector, { id: "PREPARE_EVIDENCE_REQUEST_MESSAGE", reasonCodes: ["EVIDENCE_REQUEST_NOT_SENT"] })
    notice(collector, "EVIDENCE_REQUEST_NOT_SENT", { where: "communications" })
    return
  }
  if (evidence.contact === "CANCELLED") {
    propose(collector, { id: "PREPARE_EVIDENCE_REQUEST_MESSAGE", reasonCodes: ["EVIDENCE_MESSAGE_CANCELLED"] })
    return
  }
  if (evidence.contact === "DRAFTED") {
    propose(collector, { id: "REVIEW_EVIDENCE_REQUEST_MESSAGE", reasonCodes: ["EVIDENCE_MESSAGE_DRAFTED"] })
    return
  }
  if (evidence.contact === "REVIEWED") {
    propose(collector, {
      id: "SEND_EVIDENCE_REQUEST",
      state: liveMail ? "ACTION_REQUIRED" : "BLOCKED",
      reasonCodes: liveMail ? ["EVIDENCE_MESSAGE_REVIEWED"] : ["EVIDENCE_MESSAGE_REVIEWED", "LIVE_MAIL_NOT_ENABLED"],
      description: liveMail
        ? undefined
        : "The message is reviewed and ready, but outgoing customer email is switched off in this deployment, so queueing it is closed. Reach the customer another way if the case cannot wait.",
    })
    if (!liveMail) block(collector, "LIVE_MAIL_NOT_ENABLED", "communications")
    return
  }
  if (evidence.contact === "ACCEPTANCE_UNKNOWN") {
    propose(collector, { id: "RECONCILE_EMAIL_DELIVERY", reasonCodes: ["EVIDENCE_DELIVERY_UNKNOWN"] })
    notice(collector, "EVIDENCE_DELIVERY_UNKNOWN", { where: "communications" })
    return
  }
  if (contactAwaitingProvider(evidence.contact)) {
    propose(collector, {
      id: "WAIT_FOR_EMAIL_DELIVERY",
      reasonCodes:
        evidence.contact === "PROVIDER_ACCEPTED"
          ? ["EVIDENCE_MESSAGE_PROVIDER_ACCEPTED"]
          : ["EVIDENCE_MESSAGE_QUEUED"],
    })
    if (evidence.contact === "PROVIDER_ACCEPTED") {
      notice(collector, "EVIDENCE_DELIVERY_UNCONFIRMED", { where: "communications" })
    }
  }
}

function assessmentRules(collector: Collector): void {
  const { evidence } = collector
  if (evidence.accepted === 0) {
    block(collector, "NO_ACCEPTED_EVIDENCE", "evidence")
    if (!evidence.anyRequest) propose(collector, { id: "REQUEST_EVIDENCE", reasonCodes: ["NO_EVIDENCE_REQUEST"] })
    else evidenceRules(collector)
    return
  }
  if (evidence.awaitingReview > 0) {
    propose(collector, { id: "REVIEW_EVIDENCE", reasonCodes: ["EVIDENCE_AWAITING_REVIEW"] })
  }
  if (allows(collector, "SERVICE_SELECTION")) {
    propose(collector, { id: "COMPLETE_ASSESSMENT", reasonCodes: ["EVIDENCE_ACCEPTED"] })
  }
}

function serviceRules(collector: Collector): void {
  const { commercial, facts } = collector
  if (facts.serviceTrack === "UNDECIDED") {
    propose(collector, { id: "SELECT_SERVICE", reasonCodes: ["SERVICE_TRACK_UNDECIDED"] })
    block(collector, "SERVICE_TRACK_UNDECIDED")
    return
  }
  quoteRules(collector)
  if (commercial.state === "ACCEPTED") {
    const target = facts.serviceTrack === "GUIDED" ? "PAYMENT_REQUIRED" : "AUTHORIZATION_REQUIRED"
    if (allows(collector, target)) {
      propose(collector, { id: "ADVANCE_TO_PREREQUISITES", reasonCodes: ["QUOTE_ACCEPTED"] })
    }
  }
}

/** The commercial ladder: draft, configured, offered, linked, accepted. */
function quoteRules(collector: Collector): void {
  const { commercial } = collector
  if (commercial.state === "UNKNOWN") {
    propose(collector, { id: "CONFIRM_COMMERCIAL_STATE", reasonCodes: ["COMMERCIAL_LIST_TRUNCATED"] })
    block(collector, "COMMERCIAL_STATE_UNKNOWN", "commercial")
    return
  }
  if (commercial.state === "NONE") {
    propose(collector, { id: "CREATE_QUOTE", reasonCodes: ["NO_QUOTE"] })
    return
  }
  if (commercial.state === "DRAFT_UNCONFIGURED") {
    propose(collector, { id: "COMPLETE_QUOTE_CONFIGURATION", reasonCodes: ["QUOTE_TAX_UNCONFIRMED"] })
    block(collector, "QUOTE_TAX_UNCONFIRMED", "commercial")
    return
  }
  if (commercial.state === "DRAFT_READY") {
    propose(collector, { id: "OFFER_QUOTE", reasonCodes: ["QUOTE_DRAFT_CONFIGURED"] })
    return
  }
  if (commercial.state === "OFFERED_NO_LINK") {
    acceptanceLinkRules(collector)
    return
  }
  if (commercial.state === "OFFERED_AWAITING") {
    propose(collector, {
      id: "WAIT_FOR_QUOTE_ACCEPTANCE",
      dueAt: commercial.acceptanceExpiresAt,
      reasonCodes: ["QUOTE_ACCEPTANCE_OPEN"],
    })
    return
  }
  if (commercial.state === "DECLINED") {
    propose(collector, { id: "REVIEW_DECLINED_QUOTE", reasonCodes: ["QUOTE_DECLINED"] })
    notice(collector, "QUOTE_DECLINED", { where: "commercial" })
    block(collector, "NO_ACCEPTED_ORDER", "commercial")
    return
  }
  if (commercial.state === "EXPIRED") {
    propose(collector, { id: "CREATE_QUOTE", reasonCodes: ["QUOTE_EXPIRED"] })
    notice(collector, "QUOTE_EXPIRED", { where: "commercial" })
    block(collector, "NO_ACCEPTED_ORDER", "commercial")
  }
}

/**
 * Issuing the acceptance link, and the two facts that have to be true first.
 *
 * `create_quote_acceptance_action` refuses unless the customer's email is
 * verified and their membership of the business is verified. Recommending
 * the link without them would send an operator to a button the database
 * denies, so the same two facts gate the recommendation. They are read from
 * the authorisation readiness projection, which computes them from exactly
 * the conditions the command checks, and they apply to both tracks because
 * the customer-action trust boundary is the same on both.
 */
function acceptanceLinkRules(collector: Collector): void {
  const authorization = collector.facts.authorization
  if (!authorization.customerEmailVerified) {
    propose(collector, { id: "VERIFY_CUSTOMER_CONTACT", reasonCodes: ["ACCEPTANCE_NEEDS_VERIFIED_EMAIL"] })
    block(collector, "ACCEPTANCE_TRUST_INCOMPLETE", "client")
    return
  }
  if (!authorization.businessAuthorityVerified) {
    propose(collector, { id: "VERIFY_BUSINESS_AUTHORITY", reasonCodes: ["ACCEPTANCE_NEEDS_VERIFIED_AUTHORITY"] })
    block(collector, "ACCEPTANCE_TRUST_INCOMPLETE", "business")
    return
  }
  propose(collector, { id: "ISSUE_QUOTE_ACCEPTANCE", reasonCodes: ["QUOTE_OFFERED_NO_ACCEPTANCE_LINK"] })
}

function prerequisiteRules(collector: Collector): void {
  if (collector.facts.serviceTrack === "MANAGED") managedPrerequisiteRules(collector)
  else guidedPrerequisiteRules(collector)
}

function guidedPrerequisiteRules(collector: Collector): void {
  const { facts, payment } = collector

  if (payment.truncated && !payment.upfrontOrder) {
    propose(collector, { id: "CONFIRM_PAYMENT_STATE", reasonCodes: ["PAYMENT_LIST_TRUNCATED"] })
    block(collector, "PAYMENT_STATE_UNKNOWN", "money")
    return
  }
  if (!payment.upfrontOrder) {
    block(collector, "NO_ACCEPTED_ORDER", "commercial")
    quoteRules(collector)
    return
  }
  if (payment.upfrontPaid) {
    if (allows(collector, "PREPARATION")) {
      propose(collector, { id: "ADVANCE_TO_PREPARATION", reasonCodes: ["GUIDED_PAYMENT_COLLECTED"] })
    }
    return
  }

  block(collector, "UPFRONT_PAYMENT_OUTSTANDING", "money")
  if (payment.upfrontFailed || payment.upfrontAuthenticationRequired) return
  if (payment.upfrontCollecting || openAction(facts, "GUIDED_PAYMENT") || openAction(facts, "PAYMENT_RECOVERY")) {
    propose(collector, { id: "WAIT_FOR_UPFRONT_PAYMENT", reasonCodes: ["UPFRONT_COLLECTION_STARTED"] })
    return
  }
  const enabled = facts.capabilities.paymentsEnabled
  propose(collector, {
    id: "START_UPFRONT_PAYMENT",
    state: enabled ? "ACTION_REQUIRED" : "BLOCKED",
    reasonCodes: enabled ? ["UPFRONT_NOT_STARTED"] : ["UPFRONT_NOT_STARTED", "PAYMENTS_NOT_ENABLED"],
    description: enabled
      ? undefined
      : "The upfront payment has not been started and cannot be: payment collection is switched off in this deployment, so no link can be issued. This is a capability of the deployment, not a problem with the case.",
  })
  if (!enabled) block(collector, "PAYMENTS_NOT_ENABLED", "money")
}

/**
 * The Managed ladder, resolved one rung at a time.
 *
 * The canonical operator journey is sequential: verify the contact, verify
 * the authority, get the service agreement accepted, get the case-management
 * permission accepted, record Manager access, then set payment up. Each rung
 * returns, so a request that is already out with the customer produces a wait
 * rather than the next request. Some of this work could technically happen in
 * parallel, and deliberately does not: one clear next step is worth more to
 * the operator than a list of things they could be doing.
 *
 * The sequence is a presentation of the journey, not a restatement of the
 * rule. `authorizationReady` from the database stays the authority on whether
 * the case may actually move, and it is checked again at the end.
 */
function managedPrerequisiteRules(collector: Collector): void {
  const { facts, payment } = collector
  const authorization = facts.authorization
  const review = (kind: string) => authorization.reviewRequired.includes(kind)

  if (!authorization.authorizationReady) block(collector, "AUTHORISATION_INCOMPLETE")

  if (!authorization.customerEmailVerified) {
    propose(collector, { id: "VERIFY_CUSTOMER_CONTACT", reasonCodes: ["CUSTOMER_EMAIL_UNVERIFIED"] })
    return
  }
  if (!authorization.businessAuthorityVerified) {
    propose(collector, { id: "VERIFY_BUSINESS_AUTHORITY", reasonCodes: ["BUSINESS_AUTHORITY_UNVERIFIED"] })
    return
  }
  if (review("SERVICE_AGREEMENT")) {
    propose(collector, { id: "RESOLVE_AUTHORISATION_REVIEW", reasonCodes: ["SERVICE_AGREEMENT_IN_REVIEW"] })
    return
  }
  if (!authorization.serviceAgreementAccepted) {
    propose(collector, openAgreement(facts, "SERVICE_AGREEMENT")
      ? { id: "WAIT_FOR_SERVICE_AGREEMENT", reasonCodes: ["SERVICE_AGREEMENT_ISSUED"] }
      : { id: "ISSUE_SERVICE_AGREEMENT", reasonCodes: ["SERVICE_AGREEMENT_NOT_ISSUED"] })
    return
  }
  if (review("CASE_MANAGEMENT_PERMISSION")) {
    propose(collector, { id: "RESOLVE_AUTHORISATION_REVIEW", reasonCodes: ["CASE_PERMISSION_IN_REVIEW"] })
    return
  }
  if (!authorization.caseManagementPermissionActive) {
    propose(collector, openAgreement(facts, "CASE_MANAGEMENT_PERMISSION")
      ? { id: "WAIT_FOR_CASE_PERMISSION", reasonCodes: ["CASE_PERMISSION_ISSUED"] }
      : { id: "ISSUE_CASE_PERMISSION", reasonCodes: ["CASE_PERMISSION_NOT_ISSUED"] })
    return
  }
  if (!authorization.managerAccessVerified) {
    if (!authorization.hasLocation) {
      propose(collector, { id: "CONFIRM_CASE_LOCATION", reasonCodes: ["NO_LOCATION_RECORDED"] })
      block(collector, "NO_LOCATION_RECORDED", "business")
      return
    }
    propose(collector, { id: "VERIFY_MANAGER_ACCESS", reasonCodes: ["MANAGER_ACCESS_UNVERIFIED"] })
    return
  }

  managedPaymentRules(collector)

  if (authorization.authorizationReady && payment.managedSetupReady && allows(collector, "PREPARATION")) {
    propose(collector, { id: "ADVANCE_TO_PREPARATION", reasonCodes: ["MANAGED_PREREQUISITES_MET"] })
  }
}

function managedPaymentRules(collector: Collector): void {
  const { facts, payment } = collector
  if (payment.managedSetupReady) return

  if (!payment.successFeeOrder) {
    if (payment.truncated) {
      propose(collector, { id: "CONFIRM_PAYMENT_STATE", reasonCodes: ["PAYMENT_LIST_TRUNCATED"] })
      block(collector, "PAYMENT_STATE_UNKNOWN", "money")
    } else {
      block(collector, "NO_ACCEPTED_ORDER", "commercial")
      quoteRules(collector)
    }
    return
  }

  block(collector, "MANAGED_PAYMENT_SETUP_INCOMPLETE", "money")
  if (payment.managedConsentRecorded) return
  if (openAction(facts, "MANAGED_PAYMENT_SETUP")) {
    propose(collector, { id: "WAIT_FOR_MANAGED_PAYMENT_SETUP", reasonCodes: ["MANAGED_SETUP_LINK_OPEN"] })
    return
  }
  if (completedAction(facts, "MANAGED_PAYMENT_SETUP")) {
    propose(collector, { id: "RESOLVE_MANAGED_PAYMENT_EXCEPTION", reasonCodes: ["MANAGED_SETUP_DID_NOT_COMPLETE"] })
    return
  }
  const enabled = facts.capabilities.paymentsEnabled
  propose(collector, {
    id: "START_MANAGED_PAYMENT_SETUP",
    state: enabled ? "ACTION_REQUIRED" : "BLOCKED",
    reasonCodes: enabled ? ["MANAGED_SETUP_NOT_STARTED"] : ["MANAGED_SETUP_NOT_STARTED", "PAYMENTS_NOT_ENABLED"],
    description: enabled
      ? undefined
      : "Payment setup has not been started and cannot be: payment collection is switched off in this deployment, so no setup link can be issued. This is a capability of the deployment, not a problem with the case.",
  })
  if (!enabled) block(collector, "PAYMENTS_NOT_ENABLED", "money")
}

function preparationRules(collector: Collector): void {
  const { evidence, facts } = collector

  // Prerequisites were met to arrive here, and can be undone afterwards.
  const prerequisitesHold =
    facts.serviceTrack === "MANAGED"
      ? facts.authorization.authorizationReady && collector.payment.managedSetupReady
      : collector.payment.upfrontPaid
  if (!prerequisitesHold) prerequisiteRules(collector)

  if (evidence.awaitingReview > 0) {
    propose(collector, { id: "REVIEW_EVIDENCE", reasonCodes: ["EVIDENCE_AWAITING_REVIEW"] })
  }
  if (evidence.accepted === 0) {
    block(collector, "NO_ACCEPTED_EVIDENCE", "evidence")
    if (!evidence.anyRequest) propose(collector, { id: "REQUEST_EVIDENCE", reasonCodes: ["NO_EVIDENCE_REQUEST"] })
    return
  }

  if (packRules(collector)) return
  if (prerequisitesHold && allows(collector, "READY_TO_SUBMIT")) {
    propose(collector, { id: "ADVANCE_TO_READY_TO_SUBMIT", reasonCodes: ["PACK_PUBLISHED"] })
  }
}

/**
 * The pack ladder: stale, missing, empty, unapproved, unpublished, usable.
 *
 * Returns true when it proposed a step, meaning there is no pack on this
 * case fit to submit. Preparation and `READY_TO_SUBMIT` share it rather
 * than each interpreting pack state their own way: the prepared-pack
 * command is not gated on the work stage, so every rung of the ladder is
 * available from either, and the operator should be told the same thing in
 * both places.
 */
function packRules(collector: Collector): boolean {
  const { packs } = collector
  if (packs.stale) {
    propose(collector, { id: "FIX_PREPARED_PACK", reasonCodes: ["PACK_STALE"] })
    return true
  }
  if (!packs.working) {
    propose(collector, { id: "CREATE_PREPARED_PACK", reasonCodes: ["NO_PACK"] })
    block(collector, "NO_PUBLISHED_PACK", "evidence")
    return true
  }
  if (packs.working.status === "DRAFT") {
    block(collector, "NO_PUBLISHED_PACK", "evidence")
    if (packs.working.itemCount === 0) {
      propose(collector, { id: "ADD_PREPARED_PACK_ITEMS", reasonCodes: ["PACK_EMPTY"] })
    } else {
      propose(collector, { id: "APPROVE_PREPARED_PACK", reasonCodes: ["PACK_READY_FOR_APPROVAL"] })
    }
    return true
  }
  if (!packs.publishedUsable) {
    propose(collector, { id: "PUBLISH_PREPARED_PACK", reasonCodes: ["PACK_APPROVED_NOT_PUBLISHED"] })
    block(collector, "NO_PUBLISHED_PACK", "evidence")
    return true
  }
  return false
}

/**
 * `READY_TO_SUBMIT` means ProfileRelaunch is ready, and nothing more. The
 * submission itself happens outside this application and is then recorded;
 * recording it is what moves the case on.
 *
 * Being at the stage is not the same as still being ready. A pack can go
 * stale or be withdrawn after the case was marked ready, and a stale pack
 * must never be submitted, so the pack is checked again here rather than
 * assumed from the stage. It is checked with the same ladder preparation
 * uses, so the operator is told the actual next step — start it, fill it,
 * approve it, publish it, rebuild it — rather than a generic repair they
 * would have to read a paragraph to interpret. Preparation then reads as
 * needing attention while the technical stage stays where the database put
 * it.
 */
function submissionRules(collector: Collector, stage: string): void {
  const { facts, packs } = collector
  const unresolved = facts.submissions.filter(entry => entry.result === null)

  if (stage === "READY_TO_SUBMIT") {
    if (packRules(collector)) {
      if (!packs.stale) notice(collector, "PACK_NOT_SUBMITTABLE", { where: "evidence" })
      return
    }
    if (unresolved.length > 0) {
      propose(collector, { id: "REVIEW_SUBMISSION_DECISION", reasonCodes: ["SUBMISSION_AWAITING_RESULT"] })
      block(collector, "OPEN_SUBMISSION_UNRESOLVED")
      return
    }
    propose(collector, { id: "RECORD_EXTERNAL_SUBMISSION", reasonCodes: ["READY_TO_SUBMIT"] })
    block(collector, "GOOGLE_SUBMISSION_NOT_LIVE")
    return
  }
  // SUBMITTED
  if (allows(collector, "WAITING_GOOGLE")) {
    propose(collector, { id: "MOVE_TO_WAITING_GOOGLE", reasonCodes: ["SUBMISSION_RECORDED"] })
  }
  if (facts.submissions.length > 0 && unresolved.length === 0 && allows(collector, "OUTCOME_REVIEW")) {
    propose(collector, { id: "REVIEW_OUTCOME", reasonCodes: ["SUBMISSION_RESOLVED"] })
  }
}

function decisionRules(collector: Collector, stage: string): void {
  const { facts, now } = collector
  const unresolved = facts.submissions.filter(entry => entry.result === null)

  if (stage === "WAITING_GOOGLE") {
    const followUp = facts.tasks
      .filter(task => task.status === "OPEN" && task.owner === "ADMIN")
      .map(task => task.dueAt)
      .sort()[0]
    if (followUp && followUp <= now) {
      propose(collector, { id: "FOLLOW_UP_GOOGLE", dueAt: followUp, overdue: true, reasonCodes: ["FOLLOW_UP_DUE"] })
    } else {
      propose(collector, { id: "WAIT_FOR_GOOGLE", dueAt: followUp ?? null, reasonCodes: ["SUBMISSION_WITH_GOOGLE"] })
    }
    return
  }
  if (stage === "OWNER_ACTION") {
    const customerTask = facts.tasks
      .filter(task => task.status === "OPEN" && task.owner === "CUSTOMER")
      .map(task => task.dueAt)
      .sort()[0]
    if (customerTask) {
      propose(collector, {
        id: "WAIT_FOR_CUSTOMER_ACTION",
        dueAt: customerTask,
        overdue: customerTask <= now,
        reasonCodes: ["CUSTOMER_TASK_OPEN"],
      })
    } else {
      propose(collector, { id: "REQUEST_CUSTOMER_ACTION", reasonCodes: ["NO_CUSTOMER_TASK_RECORDED"] })
    }
    return
  }
  if (stage === "FURTHER_REVIEW") {
    if (unresolved.length > 0) {
      propose(collector, { id: "REVIEW_SUBMISSION_DECISION", reasonCodes: ["SUBMISSION_AWAITING_RESULT"] })
      block(collector, "OPEN_SUBMISSION_UNRESOLVED")
      return
    }
    propose(collector, { id: "PERFORM_FURTHER_REVIEW", reasonCodes: ["CASE_RETURNED_FOR_FURTHER_WORK"] })
    if (allows(collector, "PREPARATION")) {
      propose(collector, { id: "RETURN_TO_PREPARATION", reasonCodes: ["ANOTHER_ATTEMPT_NEEDED"] })
    }
    return
  }
  // OUTCOME_REVIEW
  if (unresolved.length > 0) {
    propose(collector, { id: "REVIEW_SUBMISSION_DECISION", reasonCodes: ["SUBMISSION_AWAITING_RESULT"] })
    block(collector, "OPEN_SUBMISSION_UNRESOLVED")
    return
  }
  const openTasks = facts.tasks.filter(task => task.status === "OPEN")
  if (openTasks.length > 0) {
    propose(collector, { id: "REVIEW_OUTCOME", reasonCodes: ["OPEN_TASKS_BLOCK_CLOSURE"] })
    block(collector, "OPEN_TASKS_BLOCK_CLOSURE", "tasks")
    return
  }
  propose(collector, { id: "CLOSE_CASE", reasonCodes: ["READY_TO_CLOSE"] })
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildPrerequisiteGroups(collector: Collector, facts: CaseFlowFacts): CasePrerequisiteGroup[] {
  if (facts.serviceTrack === "GUIDED") {
    return [guidedPrerequisites(facts, collector.commercial, collector.payment, collector.destinations)]
  }
  if (facts.serviceTrack === "MANAGED") {
    return [
      managedAuthorisation(facts, collector.destinations),
      managedPayment(collector.payment, collector.destinations),
    ]
  }
  return []
}

/**
 * Phase states.
 *
 * The current phase comes from the stage, so a case that goes backwards —
 * preparation returning to evidence collection, a decision sending the case
 * for further review — is described correctly rather than being assumed to
 * have made progress it has not made.
 *
 * An attention item then overrides a finished or current phase, which is how
 * a stale pack or an invalidated permission reopens an earlier phase without
 * anything being rewritten: the history is untouched, the phase simply says
 * that something there needs looking at again.
 *
 * A finished case is exempt. Its journey is over, and an exception that
 * outlives it — an open complaint — is not an unfinished step in it.
 */
function buildPhases(
  current: CasePhaseId,
  caseComplete: boolean,
  attentionItems: CaseAttentionItem[],
  currentDetail: string,
): CasePhase[] {
  const currentOrdinal = phaseOrdinal(current)
  const attentionByPhase = new Map<CasePhaseId, CaseAttentionItem>()
  for (const item of caseComplete ? [] : attentionItems) {
    if (item.severity === "INFO") continue
    const existing = attentionByPhase.get(item.phase)
    if (!existing || (existing.severity === "WARNING" && item.severity === "CRITICAL")) {
      attentionByPhase.set(item.phase, item)
    }
  }
  return casePhaseIds.map(id => {
    const ordinal = phaseOrdinal(id)
    const base: CasePhaseState =
      caseComplete ? "COMPLETE"
      : ordinal < currentOrdinal ? "COMPLETE"
      : ordinal === currentOrdinal ? "CURRENT"
      : "UPCOMING"
    const flagged = base !== "UPCOMING" ? attentionByPhase.get(id) : undefined
    return {
      id,
      label: casePhaseLabels[id],
      state: flagged ? "NEEDS_ATTENTION" : base,
      detail:
        flagged ? flagged.title
        : base === "COMPLETE" ? phaseCompleteDetails[id]
        : base === "CURRENT" ? currentDetail
        : phaseUpcomingDetails[id],
    }
  })
}
