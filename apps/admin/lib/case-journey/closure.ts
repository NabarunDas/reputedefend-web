/**
 * Guided Step 11 reads the case the database already has and reuses `close`
 * and `reopen`. It does not keep a second closure state.
 *
 * A stored outcome is repeated exactly. The form cannot replace it. The case
 * is closed only when the case status is CLOSED or CANCELLED. A withdrawal
 * stays CANCELLED. Optional Guard is explained and linked. It is never required,
 * enrolled, discounted, invoiced or charged from this step.
 */

import type { CaseFlowFacts } from "../case-flow/model"
import { outcomes, type CaseDetail, type Submission, type Task } from "../cases/model"
import type { ServiceOrder } from "../commerce/model"
import type { MoneyOrder } from "../payments/model"
import { isQualifyingSuccessFeeOutcome } from "../payments/success-fee"
import { presentJourneyOutcome } from "./outcome"
import { assessProposedClose, coherentTerminalClosure, readStoredOutcome, type OutcomeProofEvent } from "./outcome-proposal"
import { submissionRecordsDisagree } from "./submission"

export type JourneyClosureHistory = {
  id: string
  label: string
  at: string
  detail: string
}

export type JourneyClosureTask = {
  id: string
  title: string
  state: string
}

export type JourneyClosureAttempt = {
  id: string
  reference: string
  state: string
}

export type JourneyClosureRecord = {
  status: "CLOSED" | "CANCELLED"
  outcomeLabel: string
  summary: string
}

export type JourneyClosureCommands = {
  close: boolean
  reopen: boolean
}

export type JourneyClosurePanel = {
  headline: "Closed" | "Cancelled" | "Not closed" | "Inconsistent closure"
  detail: string
  statusLabel: string
  outcomeLabel: string
  summary: string
  otherSummary: string | null
  trackLabel: string
  billingLabel: string
  tasks: JourneyClosureTask[]
  attempts: JourneyClosureAttempt[]
  history: JourneyClosureHistory[]
  closureRecord: JourneyClosureRecord | null
  notices: string[]
  blockers: string[]
  who: string
  guard: { offered: boolean; text: string; href: "/guard" }
  /** Guided preparation can close without a stored Google outcome. */
  fulfilmentClose: boolean
  /** A closed Guided case can queue the completion email that was never sent. */
  completionRecovery: boolean
  /** Exact stored values. Present only when the close form is shown. */
  locked: { outcome: string; summary: string } | null
  commands: JourneyClosureCommands | null
  version: number
}

const GUARD_HREF = "/guard" as const

export function guidedCompletionNotice(communications: CaseFlowFacts["communications"]): string {
  const row = communications
    .filter(item => item.templateKey === "GUIDED_COMPLETION" && item.lifecycle !== "CANCELLED")
    .sort((left, right) => left.draftedAt.localeCompare(right.draftedAt))
    .at(-1)
  if (!row) return "No completion email has been queued. The notification is pending, and pending is not delivered."
  if (row.deliveryStatus === "DELIVERED") return "The provider reported delivery of the completion email. That is not a download."
  if (row.deliveryStatus === "PROVIDER_ACCEPTED") return "The email provider accepted the completion email. That is not proof the customer received it."
  if (row.deliveryStatus === "ACCEPTANCE_UNKNOWN") return "Provider acceptance of the completion email is unknown, so another copy was not sent."
  if (row.deliveryStatus === "BOUNCED" || row.deliveryStatus === "FAILED" || row.deliveryStatus === "SUPPRESSED") {
    return "The completion email was not delivered. Resume the same communication only when that is safe."
  }
  if (row.lifecycle === "QUEUED") return "The completion email is queued. Queued is not delivered."
  return "The completion email status is not confirmed, so another copy was not sent."
}

function outcomeLabel(value: string | null | undefined): string {
  if (!value) return "Not recorded"
  return value in outcomes ? outcomes[value as keyof typeof outcomes] : value
}

function trackLabel(track: string): string {
  if (track === "GUIDED") return "Guided"
  if (track === "MANAGED") return "Managed"
  return "Not chosen"
}

function statusWord(status: string): "Closed" | "Cancelled" | "Not closed" {
  if (status === "CLOSED") return "Closed"
  if (status === "CANCELLED") return "Cancelled"
  return "Not closed"
}

function attemptState(result: string | null): string {
  if (result === null) return "Submitted, awaiting a decision"
  if (result === "DECIDED") return "Decision recorded"
  if (result === "WITHDRAWN") return "Withdrawn"
  return "Result not recognised"
}

function taskState(status: string): string {
  if (status === "OPEN") return "Open"
  if (status === "DONE") return "Completed"
  if (status === "CANCELLED") return "Cancelled"
  return status
}

function tasksAgree(facts: CaseFlowFacts, tasks: Task[]): boolean {
  if (facts.tasks.length !== tasks.length) return false
  return facts.tasks.every(task => tasks.some(row => row.id === task.id && row.status === task.status))
}

function historyDetail(event: CaseDetail["events"][number], mode: "verified" | "inconsistent" | "open"): { label: string; detail: string } | null {
  const outcome = typeof event.details.outcome === "string" ? outcomeLabel(event.details.outcome) : "Not recorded"
  const summary = typeof event.details.summary === "string" ? event.details.summary : "Not recorded"
  const previousOutcome = typeof event.details.previousOutcome === "string" ? outcomeLabel(event.details.previousOutcome) : "Not recorded"
  const previousSummary = typeof event.details.previousSummary === "string" ? event.details.previousSummary : "Not recorded"
  if (event.event === "reopen") {
    return {
      label: "Reopened",
      detail: `Previous outcome: ${previousOutcome}. Previous summary: ${previousSummary}. The case is no longer complete.`,
    }
  }
  if (event.event === "record_outcome") {
    const leftOpen = event.details.closesCase === false
    return {
      label: leftOpen ? "Outcome recorded, case left open" : "Outcome event",
      detail: leftOpen
        ? `${outcome}. ${summary} This event did not close the case.`
        : `${outcome}. ${summary} This event is not the closure record.`,
    }
  }
  if (event.event === "close" && event.details.fulfilment === "guided_preparation") {
    return {
      label: mode === "verified" ? "Guided preparation delivered" : "Earlier close command",
      detail: mode === "verified"
        ? `${summary} Google's later decision was not required.`
        : `Historical summary: ${summary} This event is not a verified closure.`,
    }
  }
  if (event.event === "close") {
    return {
      label: mode === "verified" ? "Close command" : "Earlier close command",
      detail: mode === "verified"
        ? `${outcome}. ${summary}`
        : mode === "inconsistent"
          ? `Historical outcome: ${outcome}. Historical summary: ${summary} This event is not a verified closure.`
          : `Historical outcome: ${outcome}. Historical summary: ${summary} The current case is not closed.`,
    }
  }
  return null
}

function relevantHistory(events: CaseDetail["events"], mode: "verified" | "inconsistent" | "open"): JourneyClosureHistory[] {
  return events.flatMap(event => {
    const described = historyDetail(event, mode)
    if (!described) return []
    return [{ id: event.id, label: described.label, at: event.createdAt, detail: described.detail }]
  }).sort((left, right) => {
    const a = /^[0-9]+$/.test(left.id) ? BigInt(left.id) : null
    const b = /^[0-9]+$/.test(right.id) ? BigInt(right.id) : null
    if (a !== null && b !== null && a !== b) return a > b ? -1 : 1
    return right.at.localeCompare(left.at)
  })
}

export function presentJourneyClosure(input: {
  facts: CaseFlowFacts
  now: string
  recorded: {
    submissions: Submission[] | null
    caseTrack: string
    caseOutcome: string | null
    caseStatus: string
    moneyOrders: MoneyOrder[] | null
  }
  order?: ServiceOrder | null
  orderDetailMissing?: boolean
  events?: readonly OutcomeProofEvent[] | null
  detail: CaseDetail
  /** Every earlier guided step is complete or does not apply. */
  precedingComplete: boolean
  /** Outgoing mail is enabled and a monitored Reply-To is confirmed. */
  mailRecovery?: boolean
}): { disagreed: boolean; closureRecordsDisagree: boolean; panel: JourneyClosurePanel } {
  const outcomeView = presentJourneyOutcome({
    facts: input.facts,
    now: input.now,
    recorded: input.recorded,
    order: input.order,
    orderDetailMissing: input.orderDetailMissing,
    events: input.events,
  })
  const facts = input.facts
  const detail = input.detail
  const stored = readStoredOutcome({
    caseType: facts.caseType,
    stage: facts.technicalStage,
    status: facts.caseStatus,
    outcome: facts.outcome,
    summary: facts.outcomeSummary,
    reopened: facts.reopened,
    events: input.events,
  })
  const summaryAgrees = detail.summary === facts.outcomeSummary
  const identityAgrees = detail.status === facts.caseStatus
    && detail.stage === facts.technicalStage
    && detail.track === facts.serviceTrack
    && (detail.outcome ?? null) === (facts.outcome ?? null)
    && summaryAgrees
    && tasksAgree(facts, detail.tasks)
    && !submissionRecordsDisagree(facts, detail.submissions, detail.track)
  const billingMet = outcomeView.panel.requirements.some(item => item.label === "Billing position" && item.state === "Met")
  const openTasks = facts.tasks.filter(task => task.status === "OPEN")
  const unresolved = facts.submissions.filter(item => item.result === null)
  const proposed = facts.outcome
    ? assessProposedClose({
      caseType: facts.caseType,
      stage: facts.technicalStage,
      status: facts.caseStatus,
      existingOutcome: facts.outcome,
      existingSummary: facts.outcomeSummary,
      outcome: facts.outcome,
      summary: facts.outcomeSummary,
      openWork: openTasks.length > 0 || unresolved.length > 0,
    })
    : null
  const databaseClosed = facts.caseStatus === "CLOSED" || facts.caseStatus === "CANCELLED"
  const coherent = coherentTerminalClosure({
    caseType: facts.caseType,
    stage: facts.technicalStage,
    status: facts.caseStatus,
    outcome: facts.outcome,
    summary: facts.outcomeSummary,
    serviceTrack: facts.serviceTrack,
  })
  const verified = coherent && identityAgrees
  const upfront = facts.payment.orders.length === 1 ? facts.payment.orders[0] : null
  const guidedDelivered = facts.serviceTrack === "GUIDED"
    && !facts.outcome
    && facts.payment.complete
    && !!upfront
    && upfront.paymentModel === "UPFRONT"
    && upfront.orderState === "ACCEPTED_AWAITING_PAYMENT"
    && upfront.obligationKind === "UPFRONT"
    && upfront.obligationState === "PAID"
    && upfront.receiptRecorded
  const fulfilment = guidedDelivered
    && input.precedingComplete
    && identityAgrees
    && !outcomeView.disagreed
    && !databaseClosed
    && openTasks.length === 0
    && unresolved.length === 0
  const close = fulfilment || (
    input.precedingComplete
    && identityAgrees
    && !outcomeView.disagreed
    && billingMet
    && stored === "pre_closure"
    && proposed?.status === "would_close"
    && !databaseClosed
  )
  const reopen = databaseClosed && identityAgrees
  const locked = close && facts.outcome
    ? { outcome: facts.outcome, summary: facts.outcomeSummary }
    : null
  const guardOffered = verified
    && facts.caseStatus === "CLOSED"
    && facts.serviceTrack === "MANAGED"
    && facts.caseType === "PROFILE_RECOVERY"
    && facts.outcome === "RESTORED"
    && isQualifyingSuccessFeeOutcome(facts.caseType, facts.outcome)
  const completionStatus = guidedCompletionNotice(facts.communications)
  const completionRecovery = !!input.mailRecovery
    && verified
    && facts.caseStatus === "CLOSED"
    && facts.serviceTrack === "GUIDED"
    && !facts.outcome
    && completionStatus.startsWith("No completion email")
    && facts.outcomeSummary.trim().length >= 10
    && facts.outcomeSummary.length <= 2000
  const notices = [
    "Optional Guard is not required to close this case.",
    completionStatus,
    fulfilment
      ? "Closing can queue one completion summary. Queued is not delivered. If outgoing mail is off, the notification stays pending. It does not submit anything to Google, collect another payment, or enrol Relaunch Guard."
      : completionRecovery
        ? "The completion update has not been queued. Sending it does not close the case again, submit anything to Google, or collect a payment. Queued is not delivered."
        : "Closing does not send email, submit anything to Google, or collect a payment.",
  ]
  if (facts.reopened && !databaseClosed) notices.push("This case was reopened. It is not complete. Earlier outcomes stay in the history.")
  if (!summaryAgrees) notices.push("The stored customer summary and the case record do not agree. Neither value is changed from here.")
  if (!identityAgrees && summaryAgrees) notices.push("The case record and the case projection do not agree, so this step does not confirm closure.")
  if (stored === "pre_closure" && identityAgrees) notices.push("The outcome and summary already recorded are repeated exactly. A different value is refused.")
  if (facts.outcome === "WITHDRAWN" && !databaseClosed) notices.push("A withdrawal is recorded as CANCELLED. It is not recorded as CLOSED.")
  if (verified && facts.caseStatus === "CANCELLED" && facts.outcome === "WITHDRAWN") notices.push("The withdrawal keeps the CANCELLED status.")
  if (databaseClosed && !verified) notices.push("This is an inconsistent closure. It is not a verified closed or cancelled result.")
  if (outcomeView.disagreed) notices.push("The outcome and billing records do not agree, so closure is not offered from here.")
  if (!input.precedingComplete && !databaseClosed) notices.push("Earlier guided steps are still open, so closure is not offered from here.")
  if (openTasks.length > 0) notices.push("An open task is still on the case. Resolve or cancel it before closure.")
  if (unresolved.length > 0) notices.push("A submission attempt has no decision or withdrawal.")

  const blockers: string[] = []
  if (databaseClosed && !verified) {
    if (!coherent) blockers.push("The status, outcome, summary and stage do not form a valid closure.")
    if (!identityAgrees) blockers.push("The case record and the projection do not agree.")
  }
  if (!databaseClosed && !close) {
    if (!input.precedingComplete) blockers.push("Earlier guided steps are still open.")
    if (!identityAgrees) blockers.push("The case record and the projection do not agree.")
    if (outcomeView.disagreed || (!billingMet && !guidedDelivered)) blockers.push("The billing position is not ready.")
    if (stored !== "pre_closure" && !guidedDelivered) blockers.push("No authoritative pre-closure outcome is stored.")
    if (openTasks.length > 0) blockers.push("An open task remains.")
    if (unresolved.length > 0) blockers.push("A submission attempt is unresolved.")
    if (stored === "pre_closure" && proposed?.status === "refused") blockers.push("The existing close command would refuse this case.")
  }

  const history = relevantHistory(detail.events, verified ? "verified" : databaseClosed ? "inconsistent" : "open")
  if (verified && history.every(item => item.label !== "Close command" && item.label !== "Guided preparation delivered")) {
    notices.push("The loaded history has no close event. The case status is still the closure record.")
  }

  const attempts = identityAgrees
    ? detail.submissions.map(row => ({ id: row.id, reference: row.reference, state: attemptState(row.result) }))
    : facts.submissions.map(row => ({ id: row.id, reference: "Recorded attempt", state: attemptState(row.result) }))

  return {
    disagreed: outcomeView.disagreed,
    closureRecordsDisagree: !identityAgrees,
    panel: {
      headline: verified ? statusWord(facts.caseStatus) : databaseClosed ? "Inconsistent closure" : "Not closed",
      detail: verified
        ? facts.caseStatus === "CANCELLED"
          ? "The database status is CANCELLED. This step does not call the case closed."
          : facts.serviceTrack === "GUIDED" && !facts.outcome
            ? "The database status is CLOSED. This is a completed Guided preparation. It is not a Google decision."
            : "The database status is CLOSED. This step does not call the case cancelled."
        : databaseClosed
          ? `The database status is ${facts.caseStatus}. That status is not a verified closure.`
          : "The database has not confirmed closure. A recorded outcome does not close the case.",
      statusLabel: verified ? statusWord(facts.caseStatus) : databaseClosed ? facts.caseStatus : `Open (${facts.caseStatus})`,
      outcomeLabel: verified && facts.serviceTrack === "GUIDED" && !facts.outcome
        ? "Guided preparation delivered"
        : outcomeLabel(identityAgrees ? facts.outcome : detail.outcome ?? facts.outcome),
      summary: identityAgrees ? facts.outcomeSummary : facts.outcomeSummary || "Not recorded",
      otherSummary: summaryAgrees ? null : detail.summary,
      trackLabel: trackLabel(facts.serviceTrack),
      billingLabel: outcomeView.panel.billingLabel,
      tasks: facts.tasks.map(task => ({ id: task.id, title: task.title, state: taskState(task.status) })),
      attempts,
      history,
      closureRecord: verified
        ? {
          status: facts.caseStatus as "CLOSED" | "CANCELLED",
          outcomeLabel: facts.serviceTrack === "GUIDED" && !facts.outcome ? "Guided preparation delivered" : outcomeLabel(facts.outcome),
          summary: facts.outcomeSummary,
        }
        : null,
      notices,
      blockers,
      who: verified
        ? "Nothing further is required to close this case. Reopening uses the existing command and a follow-up task."
        : databaseClosed
          ? "ProfileRelaunch reconciles this closure. Reopening uses the existing command and a follow-up task."
          : fulfilment
          ? "ProfileRelaunch can close this Guided preparation. Google's later decision is not required. Guard can stay unset."
          : close
          ? "ProfileRelaunch can close the case with the outcome already recorded. Guard can stay unset."
          : "ProfileRelaunch finishes the earlier steps, the open work and the billing position before closure. Guard can stay unset.",
      guard: {
        offered: guardOffered,
        href: GUARD_HREF,
        text: guardOffered
          ? "A restored Managed case can be reviewed for the existing included Guard offer. The customer has to choose it. This step does not create the offer, apply a discount, raise an invoice, or charge the customer."
          : "Relaunch Guard is not on this step and is not required. Closing does not enrol the customer, apply a discount, raise an invoice, or charge the customer.",
      },
      locked,
      fulfilmentClose: fulfilment,
      completionRecovery,
      commands: close || reopen ? { close, reopen } : null,
      version: detail.version,
    },
  }
}
