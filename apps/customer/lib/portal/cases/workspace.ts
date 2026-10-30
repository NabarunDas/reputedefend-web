/**
 * Customer case workspace presentation.
 *
 * This is a current-position presentation. It is not immutable history.
 * If the authoritative case moves backward, the visual current position may
 * move backward. Progress is not persisted and this module performs no write.
 *
 * It is not Admin CaseFlow. It does not expose phases, blockers, or actions.
 */
import { caseTypeLabel, customerCaseState, formatPortalDate, formatPortalDateTime, portalDayKey, presentAttention, serviceLabel, statusLabel } from "./model"
import type { CaseStatus, CaseType, CustomerCaseDetail, CustomerTimelineCode, OutcomeCode, WorkStage } from "./parse"

export const CUSTOMER_PROGRESS_STEPS = [
  { code: "RECEIVED", label: "Case received" },
  { code: "INFORMATION", label: "Information" },
  { code: "SERVICE_SETUP", label: "Service setup" },
  { code: "PREPARATION", label: "Preparing your case" },
  { code: "SUBMITTED", label: "Submitted to Google" },
  { code: "DECISION", label: "Decision" },
] as const

const GUIDED_PROGRESS_STEPS = [
  { code: "RECEIVED", label: "Case received" },
  { code: "INFORMATION", label: "Information" },
  { code: "SERVICE_SETUP", label: "Service setup" },
  { code: "PREPARATION", label: "Preparing your pack" },
  { code: "HANDOVER", label: "Pack ready for you" },
] as const

const GUIDED_SUBMISSION_STEP = { code: "SUBMISSION", label: "Submission recorded" } as const
const GUIDED_DECISION_STEP = { code: "DECISION", label: "Decision" } as const

export type CustomerProgressStep =
  | (typeof CUSTOMER_PROGRESS_STEPS)[number]["code"]
  | (typeof GUIDED_PROGRESS_STEPS)[number]["code"]
  | "SUBMISSION"

export type ProgressEvidence = {
  outcomeCode?: OutcomeCode | null
  timeline?: readonly { code: CustomerTimelineCode }[]
  /** False only after a documents read found no current published pack. */
  packPublished?: boolean
}

export type ProgressPosition = "earlier" | "current" | "upcoming"

export type PresentedProgressStep = {
  code: CustomerProgressStep
  label: string
  position: ProgressPosition
  text: string
  /** Who the customer should understand as responsible for this stage. */
  ownerLabel: "Your step" | "ProfileRelaunch" | "Recorded"
}

export const GUIDED_PROGRESS_NOTE = "Preparation, a published pack, a submission to Google, and Google's decision are separate. This page only shows a decision when one has been recorded."

export const MANAGED_PROGRESS_NOTE = "ProfileRelaunch prepares and submits a managed case. An outcome appears here only after it has been recorded."

export function progressContext(serviceTrack: string | undefined): string | null {
  if (serviceTrack === "GUIDED") return GUIDED_PROGRESS_NOTE
  if (serviceTrack === "MANAGED") return MANAGED_PROGRESS_NOTE
  return null
}

function progressOwnerLabel(code: CustomerProgressStep): PresentedProgressStep["ownerLabel"] {
  switch (code) {
    case "INFORMATION":
    case "SERVICE_SETUP":
    case "HANDOVER":
      return "Your step"
    case "SUBMISSION":
    case "DECISION":
      return "Recorded"
    case "RECEIVED":
    case "PREPARATION":
    case "SUBMITTED":
      return "ProfileRelaunch"
    default: {
      const unreachable: never = code
      return unreachable
    }
  }
}

const TIMELINE_MESSAGES: Record<CustomerTimelineCode, string> = {
  CASE_RECEIVED: "We received your ProfileRelaunch case.",
  EVIDENCE_SUBMITTED: "You submitted evidence.",
  EVIDENCE_ACCEPTED: "Your evidence was accepted.",
  QUOTE_ACCEPTED: "You accepted your ProfileRelaunch quote.",
  SERVICE_AGREEMENT_ACCEPTED: "You accepted the service agreement.",
  CASE_PERMISSION_CONFIRMED: "You confirmed case-management permission.",
  SERVICE_AGREEMENT_WITHDRAWN: "The service agreement authorisation was withdrawn.",
  CASE_PERMISSION_WITHDRAWN: "Case-management permission was withdrawn.",
  PAYMENT_RECEIVED: "We received a payment for this case.",
  PACK_PUBLISHED: "Your pack was published for you to download.",
  NOTIFICATION_DELIVERED: "The pack-ready email was delivered. That record is not you reading it.",
  SUBMITTED_TO_GOOGLE: "Your case was submitted to Google.",
  GOOGLE_DECISION_RECORDED: "A Google decision was recorded for your case.",
  CASE_COMPLETED: "This ProfileRelaunch case was completed.",
  CASE_CANCELLED: "This ProfileRelaunch case was cancelled.",
}

const GOOGLE_OUTCOMES = new Set<OutcomeCode>([
  "RESTORED",
  "PARTIALLY_RESTORED",
  "NOT_RESTORED",
  "REMOVED",
  "NOT_REMOVED",
  "RESPONSE_RECOMMENDED",
])

const SUBMISSION_STAGES = new Set<WorkStage>(["SUBMITTED", "WAITING_GOOGLE", "OWNER_ACTION", "FURTHER_REVIEW"])

function recordedGoogle(evidence?: ProgressEvidence) {
  const codes = new Set(evidence?.timeline?.map(event => event.code) ?? [])
  return {
    submission: codes.has("SUBMITTED_TO_GOOGLE"),
    decision: codes.has("GOOGLE_DECISION_RECORDED") || (evidence?.outcomeCode != null && GOOGLE_OUTCOMES.has(evidence.outcomeCode)),
  }
}

function stageStep(workStage: WorkStage): CustomerProgressStep {
  switch (workStage) {
    case "INITIAL_REVIEW":
      return "RECEIVED"
    case "EVIDENCE_COLLECTION":
    case "ASSESSMENT_READY":
      return "INFORMATION"
    case "SERVICE_SELECTION":
    case "PAYMENT_REQUIRED":
    case "AUTHORIZATION_REQUIRED":
      return "SERVICE_SETUP"
    case "PREPARATION":
    case "READY_TO_SUBMIT":
      return "PREPARATION"
    case "SUBMITTED":
    case "WAITING_GOOGLE":
    case "OWNER_ACTION":
    case "FURTHER_REVIEW":
      return "SUBMITTED"
    case "OUTCOME_REVIEW":
    case "FINISHED":
      return "DECISION"
    default: {
      const unreachable: never = workStage
      return unreachable
    }
  }
}

export function customerProgressStep(
  status: CaseStatus,
  workStage: WorkStage,
  serviceTrack?: string,
  evidence?: ProgressEvidence,
): CustomerProgressStep | null {
  if (status === "CANCELLED") return null
  if (serviceTrack === "GUIDED") {
    const google = recordedGoogle(evidence)
    const atOutcome = status === "CLOSED" || workStage === "OUTCOME_REVIEW" || workStage === "FINISHED"
    if (google.decision && atOutcome) return "DECISION"
    if (SUBMISSION_STAGES.has(workStage)) return "SUBMISSION"
    if (workStage === "READY_TO_SUBMIT") return evidence?.packPublished === false ? "PREPARATION" : "HANDOVER"
    if (workStage === "OUTCOME_REVIEW" || workStage === "FINISHED" || status === "CLOSED") {
      return google.submission ? "SUBMISSION" : workStage === "FINISHED" || workStage === "OUTCOME_REVIEW" ? "HANDOVER" : stageStep(workStage)
    }
    return stageStep(workStage)
  }
  if (status === "CLOSED") return "DECISION"
  return stageStep(workStage)
}

function progressList(current: CustomerProgressStep, serviceTrack: string | undefined, evidence?: ProgressEvidence) {
  if (serviceTrack !== "GUIDED") return CUSTOMER_PROGRESS_STEPS
  const google = recordedGoogle(evidence)
  const steps: { code: CustomerProgressStep; label: string }[] = [...GUIDED_PROGRESS_STEPS]
  if (current === "SUBMISSION" || google.submission) steps.push(GUIDED_SUBMISSION_STEP)
  if (current === "DECISION") steps.push(GUIDED_DECISION_STEP)
  return steps
}

export function presentProgress(
  status: CaseStatus,
  workStage: WorkStage,
  options?: { serviceTrack?: string } & ProgressEvidence,
): PresentedProgressStep[] | null {
  const serviceTrack = options?.serviceTrack
  const evidence = { outcomeCode: options?.outcomeCode, timeline: options?.timeline, packPublished: options?.packPublished }
  const current = customerProgressStep(status, workStage, serviceTrack, evidence)
  if (!current) return null
  const steps = progressList(current, serviceTrack, evidence)
  const index = steps.findIndex(step => step.code === current)
  if (index < 0) return null
  return steps.map((step, stepIndex) => {
    const position: ProgressPosition = stepIndex < index ? "earlier" : stepIndex === index ? "current" : "upcoming"
    const state = position === "earlier" ? "Completed" : position === "current" ? "Now" : "Upcoming"
    return {
      code: step.code,
      label: step.label,
      position,
      text: `${step.label}. ${state}.`,
      ownerLabel: progressOwnerLabel(step.code),
    }
  })
}

const WITHDRAWN_STATEMENT = "This case was withdrawn and is now closed. This closure does not report a restoration or removal result."

const TERMINAL_OUTCOME_COPY: Record<OutcomeCode, { title: string; body: string; completed: string; cancelled: string }> = {
  RESTORED: {
    title: "Your profile was restored",
    body: "This case is complete.",
    completed: "Your profile was restored and the case was completed.",
    cancelled: "This ProfileRelaunch case was cancelled.",
  },
  PARTIALLY_RESTORED: {
    title: "Your profile was partly restored",
    body: "Part of the profile was restored. The profile was not fully restored.",
    completed: "Your profile was partly restored. The profile was not fully restored, and the case was completed.",
    cancelled: "This ProfileRelaunch case was cancelled.",
  },
  NOT_RESTORED: {
    title: "Your profile was not restored",
    body: "The profile was not restored. This case is complete.",
    completed: "Your profile was not restored and the case was completed.",
    cancelled: "This ProfileRelaunch case was cancelled.",
  },
  REMOVED: {
    title: "The review was removed",
    body: "This case is complete.",
    completed: "The review was removed and the case was completed.",
    cancelled: "This ProfileRelaunch case was cancelled.",
  },
  NOT_REMOVED: {
    title: "The review was not removed",
    body: "The review was not removed. This case is complete.",
    completed: "The review was not removed and the case was completed.",
    cancelled: "This ProfileRelaunch case was cancelled.",
  },
  RESPONSE_RECOMMENDED: {
    title: "A response was recommended",
    body: "A response to the review was recommended. The review was not removed.",
    completed: "A response was recommended. The review was not removed, and the case was completed.",
    cancelled: "This ProfileRelaunch case was cancelled.",
  },
  WITHDRAWN: {
    title: "This case was withdrawn",
    body: WITHDRAWN_STATEMENT,
    completed: WITHDRAWN_STATEMENT,
    cancelled: WITHDRAWN_STATEMENT,
  },
}

function terminalOutcome(status: CaseStatus, workStage: WorkStage, outcomeCode: OutcomeCode | null) {
  if (outcomeCode === null || workStage !== "FINISHED") return null
  if (outcomeCode === "WITHDRAWN") return status === "CANCELLED" ? TERMINAL_OUTCOME_COPY.WITHDRAWN : null
  return status === "CLOSED" ? TERMINAL_OUTCOME_COPY[outcomeCode] : null
}

export type PresentedNextStep = {
  title: string
  body: string | null
  timing: string | null
  support: string | null
  href: string | null
  actionLabel: string | null
  alsoWaiting: string | null
  remaining: string[]
}

export function presentNextStep(input: {
  reference?: string
  status: CaseStatus
  workStage: WorkStage
  caseType: CaseType
  serviceTrack?: string
  outcomeCode: OutcomeCode | null
  attentionItems: CustomerCaseDetail["case"]["attentionItems"]
  /** Set only after a read-only documents read finds a published pack. */
  packHref?: string | null
}): PresentedNextStep {
  if (input.attentionItems.length > 0) {
    const [first, ...rest] = input.attentionItems.map(item => presentAttention(item, input.reference))
    const extra = rest.length
    return {
      title: first.label,
      body: null,
      timing: first.timing,
      support: first.support,
      href: first.href,
      actionLabel: first.actionLabel,
      alsoWaiting: extra === 0
        ? null
        : extra === 1
          ? "You also have 1 other step waiting for you."
          : `You also have ${extra} other steps waiting for you.`,
      remaining: rest.map(item => item.label),
    }
  }

  const state = customerCaseState(input.status, input.workStage, 0)
  if (state === "RECEIVED") {
    return {
      title: "We're reviewing your case",
      body: "We've received your request and are reviewing the information you provided.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "IN_PROGRESS" && input.workStage === "PREPARATION") {
    return {
      title: input.serviceTrack === "GUIDED" ? "We're preparing your pack" : "We're preparing your case",
      body: input.serviceTrack === "GUIDED"
        ? "Nothing is needed from you right now. We'll let you know when your pack is ready."
        : "Nothing is needed from you right now. We'll let you know when that changes.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "IN_PROGRESS" && input.workStage === "READY_TO_SUBMIT") {
    const packHref = input.serviceTrack === "GUIDED" ? input.packHref ?? null : null
    if (input.serviceTrack === "GUIDED" && !packHref) {
      return {
        title: "We're preparing your pack",
        body: "Nothing is needed from you right now. We'll let you know when your pack is ready.",
        timing: null,
        support: null,
        href: null,
        actionLabel: null,
        alsoWaiting: null,
        remaining: [],
      }
    }
    return {
      title: input.serviceTrack === "GUIDED" ? "Pack ready for you" : "We're preparing your case",
      body: input.serviceTrack === "GUIDED"
        ? "Download your documents. You choose if and when to send them to Google. We have not sent them."
        : "Nothing is needed from you right now. We'll let you know when that changes.",
      timing: null,
      support: null,
      href: packHref,
      actionLabel: packHref ? "Download your pack" : null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "IN_PROGRESS" && (input.workStage === "SERVICE_SELECTION" || input.workStage === "PAYMENT_REQUIRED" || input.workStage === "AUTHORIZATION_REQUIRED")) {
    return {
      title: "We're setting up your service",
      body: "Nothing is needed from you unless a step is shown here. An amount already recorded as paid is not charged again from this page.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "IN_PROGRESS") {
    return {
      title: "We're working on your case",
      body: "Nothing is needed from you right now. We'll let you know when that changes.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "SUBMITTED" && input.serviceTrack === "GUIDED") {
    return {
      title: "A submission has been recorded",
      body: "We've recorded that this pack was sent to Google. That record is not a decision from Google.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "SUBMITTED") {
    return {
      title: "Your case has been submitted",
      body: "We've recorded the submission to Google. Nothing is needed from you right now.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "WAITING_GOOGLE") {
    return {
      title: "We're waiting for Google",
      body: "Your case is with Google. We'll update you when a decision or further action is recorded.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  const outcome = terminalOutcome(input.status, input.workStage, input.outcomeCode)
  if (outcome) {
    return { title: outcome.title, body: outcome.body, timing: null, support: null, href: null, actionLabel: null, alsoWaiting: null, remaining: [] }
  }
  if (input.status === "CLOSED" && input.workStage === "FINISHED" && !input.outcomeCode && input.serviceTrack === "GUIDED") {
    const packHref = input.packHref ?? null
    return {
      title: "Your Guided preparation is complete",
      body: packHref
        ? "Your pack is ready for you. Sending it to Google is your choice, and a later Google decision is separate."
        : "Your preparation is complete. Sending anything to Google is your choice, and a later Google decision is separate.",
      timing: null,
      support: null,
      href: packHref,
      actionLabel: packHref ? "Open your pack" : null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (state === "CANCELLED") {
    return {
      title: "This case was cancelled",
      body: "No further action is currently available for this case.",
      timing: null,
      support: null,
      href: null,
      actionLabel: null,
      alsoWaiting: null,
      remaining: [],
    }
  }
  return {
    title: "Your case is complete",
    body: "No further action is currently needed for this case.",
    timing: null,
    support: null,
    href: null,
    actionLabel: null,
    alsoWaiting: null,
    remaining: [],
  }
}

export function timelineMessage(code: CustomerTimelineCode, outcomeCode: OutcomeCode | null): string {
  const outcome = outcomeCode ? TERMINAL_OUTCOME_COPY[outcomeCode] : null
  if (code === "CASE_COMPLETED" && outcome) return outcome.completed
  if (code === "CASE_CANCELLED" && outcomeCode === "WITHDRAWN" && outcome) return outcome.cancelled
  return TIMELINE_MESSAGES[code]
}

export type PresentedTimelineEntry = {
  code: CustomerTimelineCode
  occurredAt: string
  dateLabel: string
  message: string
  separate: boolean
}

export function presentTimeline(detail: CustomerCaseDetail): PresentedTimelineEntry[] {
  let previous: { code: CustomerTimelineCode; day: string } | null = null
  return detail.timeline.map(event => {
    const day = portalDayKey(event.occurredAt)
    const separate = previous?.code === event.code && previous.day === day
    previous = { code: event.code, day }
    return {
      code: event.code,
      occurredAt: event.occurredAt,
      dateLabel: formatPortalDateTime(event.occurredAt),
      message: timelineMessage(event.code, detail.case.outcomeCode),
      separate,
    }
  })
}

export type DetailRow = { term: string; value: string }

export type CaseCommerce = {
  purchasedService: string | null
  payment: string | null
}

export function presentDetailRows(detail: CustomerCaseDetail, commerce?: CaseCommerce | null): DetailRow[] {
  const item = detail.case
  const state = customerCaseState(item.status, item.workStage, item.attentionItems.length)
  const rows: DetailRow[] = [
    { term: "Reference", value: item.reference },
    { term: "Business", value: item.businessName },
  ]
  if (item.locationName) rows.push({ term: "Location", value: item.locationName })
  if (commerce?.purchasedService) rows.push({ term: "Purchased service", value: commerce.purchasedService })
  rows.push({ term: "Case", value: caseTypeLabel(item.caseType) })
  const track = serviceLabel(item.serviceTrack)
  if (track) rows.push({ term: "Arrangement", value: track })
  rows.push({ term: "Status", value: statusLabel(state) })
  if (commerce?.payment) rows.push({ term: "Payment", value: commerce.payment })
  rows.push({ term: "Started", value: formatPortalDate(item.submittedAt) })
  if (item.closedAt) rows.push({ term: "Closed", value: formatPortalDate(item.closedAt) })
  return rows
}
