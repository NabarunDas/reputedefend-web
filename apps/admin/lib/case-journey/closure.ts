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
import { assessProposedClose, readStoredOutcome, type OutcomeProofEvent } from "./outcome-proposal"
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
  headline: "Closed" | "Cancelled" | "Not closed"
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
  /** Exact stored values. Present only when the close form is shown. */
  locked: { outcome: string; summary: string } | null
  commands: JourneyClosureCommands | null
  version: number
}

const GUARD_HREF = "/guard" as const

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

function historyDetail(event: CaseDetail["events"][number], openNow: boolean): { label: string; detail: string } | null {
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
  if (event.event === "close") {
    return {
      label: openNow ? "Earlier close command" : "Close command",
      detail: openNow
        ? `Historical outcome: ${outcome}. Historical summary: ${summary} The current case is not closed.`
        : `${outcome}. ${summary}`,
    }
  }
  return null
}

function relevantHistory(events: CaseDetail["events"], openNow: boolean): JourneyClosureHistory[] {
  return events.flatMap(event => {
    const described = historyDetail(event, openNow)
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
}): { disagreed: boolean; panel: JourneyClosurePanel } {
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
  const confirmedClosed = databaseClosed && identityAgrees
  const close = input.precedingComplete
    && identityAgrees
    && !outcomeView.disagreed
    && billingMet
    && stored === "pre_closure"
    && proposed?.status === "would_close"
    && !databaseClosed
  const reopen = confirmedClosed
  const locked = close && facts.outcome
    ? { outcome: facts.outcome, summary: facts.outcomeSummary }
    : null
  const guardOffered = confirmedClosed
    && facts.caseStatus === "CLOSED"
    && facts.serviceTrack === "MANAGED"
    && facts.caseType === "PROFILE_RECOVERY"
    && facts.outcome === "RESTORED"
    && isQualifyingSuccessFeeOutcome(facts.caseType, facts.outcome)
  const notices = [
    "Optional Guard is not required to close this case.",
    "Closing does not send email, submit anything to Google, or collect a payment.",
  ]
  if (facts.reopened && !databaseClosed) notices.push("This case was reopened. It is not complete. Earlier outcomes stay in the history.")
  if (!summaryAgrees) notices.push("The stored customer summary and the case record do not agree. Neither value is changed from here.")
  if (!identityAgrees && summaryAgrees) notices.push("The case record and the case projection do not agree, so this step does not confirm closure.")
  if (stored === "pre_closure" && identityAgrees) notices.push("The outcome and summary already recorded are repeated exactly. A different value is refused.")
  if (facts.outcome === "WITHDRAWN" && !databaseClosed) notices.push("A withdrawal is recorded as CANCELLED. It is not recorded as CLOSED.")
  if (confirmedClosed && facts.caseStatus === "CANCELLED" && facts.outcome === "WITHDRAWN") notices.push("The withdrawal keeps the CANCELLED status.")
  if (confirmedClosed && facts.caseStatus === "CLOSED" && facts.outcome === "WITHDRAWN") notices.push("The status is CLOSED and the outcome is Withdrawn. Those records do not agree.")
  if (outcomeView.disagreed) notices.push("The outcome and billing records do not agree, so closure is not offered from here.")
  if (!input.precedingComplete && !databaseClosed) notices.push("Earlier guided steps are still open, so closure is not offered from here.")
  if (openTasks.length > 0) notices.push("An open task is still on the case. Resolve or cancel it before closure.")
  if (unresolved.length > 0) notices.push("A submission attempt has no decision or withdrawal.")

  const blockers: string[] = []
  if (!databaseClosed && !close) {
    if (!input.precedingComplete) blockers.push("Earlier guided steps are still open.")
    if (!identityAgrees) blockers.push("The case record and the projection do not agree.")
    if (outcomeView.disagreed || !billingMet) blockers.push("The billing position is not ready.")
    if (stored !== "pre_closure") blockers.push("No authoritative pre-closure outcome is stored.")
    if (openTasks.length > 0) blockers.push("An open task remains.")
    if (unresolved.length > 0) blockers.push("A submission attempt is unresolved.")
    if (stored === "pre_closure" && proposed?.status === "refused") blockers.push("The existing close command would refuse this case.")
  }

  const history = relevantHistory(detail.events, !confirmedClosed)
  if (confirmedClosed && history.every(item => item.label !== "Close command")) {
    notices.push("The loaded history has no close event. The case status is still the closure record.")
  }

  const attempts = identityAgrees
    ? detail.submissions.map(row => ({ id: row.id, reference: row.reference, state: attemptState(row.result) }))
    : facts.submissions.map(row => ({ id: row.id, reference: "Recorded attempt", state: attemptState(row.result) }))

  return {
    disagreed: outcomeView.disagreed,
    panel: {
      headline: confirmedClosed ? statusWord(facts.caseStatus) : "Not closed",
      detail: confirmedClosed
        ? facts.caseStatus === "CANCELLED"
          ? "The database status is CANCELLED. This step does not call the case closed."
          : "The database status is CLOSED. This step does not call the case cancelled."
        : "The database has not confirmed closure. A recorded outcome does not close the case.",
      statusLabel: confirmedClosed ? statusWord(facts.caseStatus) : `Open (${facts.caseStatus})`,
      outcomeLabel: outcomeLabel(identityAgrees ? facts.outcome : detail.outcome ?? facts.outcome),
      summary: identityAgrees ? facts.outcomeSummary : facts.outcomeSummary || "Not recorded",
      otherSummary: summaryAgrees ? null : detail.summary,
      trackLabel: trackLabel(facts.serviceTrack),
      billingLabel: outcomeView.panel.billingLabel,
      tasks: facts.tasks.map(task => ({ id: task.id, title: task.title, state: taskState(task.status) })),
      attempts,
      history,
      closureRecord: confirmedClosed
        ? { status: facts.caseStatus as "CLOSED" | "CANCELLED", outcomeLabel: outcomeLabel(facts.outcome), summary: facts.outcomeSummary }
        : null,
      notices,
      blockers,
      who: confirmedClosed
        ? "Nothing further is required to close this case. Reopening uses the existing command and a follow-up task."
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
      commands: close || reopen ? { close, reopen } : null,
      version: detail.version,
    },
  }
}
