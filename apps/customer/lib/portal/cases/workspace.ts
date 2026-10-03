/**
 * Customer case workspace presentation.
 *
 * This is a current-position presentation. It is not immutable history.
 * If the authoritative case moves backward, the visual current position may
 * move backward. Progress is not persisted and this module performs no write.
 *
 * It is not Admin CaseFlow. It does not expose phases, blockers, or actions.
 */
import { caseTypeLabel, customerCaseState, formatPortalDate, presentAttention, serviceLabel } from "./model"
import type { CaseStatus, CaseType, CustomerCaseDetail, CustomerTimelineCode, OutcomeCode, WorkStage } from "./parse"

export const CUSTOMER_PROGRESS_STEPS = [
  { code: "RECEIVED", label: "Case received" },
  { code: "INFORMATION", label: "Information" },
  { code: "SERVICE_SETUP", label: "Service setup" },
  { code: "PREPARATION", label: "Preparing your case" },
  { code: "SUBMITTED", label: "Submitted to Google" },
  { code: "DECISION", label: "Decision" },
] as const

export type CustomerProgressStep = (typeof CUSTOMER_PROGRESS_STEPS)[number]["code"]

export type ProgressPosition = "earlier" | "current" | "upcoming"

export type PresentedProgressStep = {
  code: CustomerProgressStep
  label: string
  position: ProgressPosition
  text: string
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
  SUBMITTED_TO_GOOGLE: "Your case was submitted to Google.",
  GOOGLE_DECISION_RECORDED: "A Google decision was recorded for your case.",
  CASE_COMPLETED: "This ProfileRelaunch case was completed.",
  CASE_CANCELLED: "This ProfileRelaunch case was cancelled.",
}

export function customerProgressStep(status: CaseStatus, workStage: WorkStage): CustomerProgressStep | null {
  if (status === "CANCELLED") return null
  if (status === "CLOSED") return "DECISION"
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

export function presentProgress(status: CaseStatus, workStage: WorkStage): PresentedProgressStep[] | null {
  const current = customerProgressStep(status, workStage)
  if (!current) return null
  const index = CUSTOMER_PROGRESS_STEPS.findIndex(step => step.code === current)
  return CUSTOMER_PROGRESS_STEPS.map((step, stepIndex) => {
    const position: ProgressPosition = stepIndex < index ? "earlier" : stepIndex === index ? "current" : "upcoming"
    const state = position === "earlier" ? "earlier step" : position === "current" ? "current step" : "upcoming step"
    return { code: step.code, label: step.label, position, text: `${step.label} — ${state}` }
  })
}

export type PresentedNextStep = {
  title: string
  body: string | null
  timing: string | null
  support: string | null
  alsoWaiting: string | null
  remaining: string[]
}

export function presentNextStep(input: {
  status: CaseStatus
  workStage: WorkStage
  caseType: CaseType
  outcomeCode: OutcomeCode | null
  attentionItems: CustomerCaseDetail["case"]["attentionItems"]
}): PresentedNextStep {
  if (input.attentionItems.length > 0) {
    const [first, ...rest] = input.attentionItems.map(presentAttention)
    const extra = rest.length
    return {
      title: first.label,
      body: null,
      timing: first.timing,
      support: first.support,
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
      alsoWaiting: null,
      remaining: [],
    }
  }
  if (input.caseType === "PROFILE_RECOVERY" && input.outcomeCode === "RESTORED") {
    return { title: "Your profile was restored", body: "This case is complete.", timing: null, support: null, alsoWaiting: null, remaining: [] }
  }
  if (input.caseType === "REVIEW_PROTECTION" && input.outcomeCode === "REMOVED") {
    return { title: "The review was removed", body: "This case is complete.", timing: null, support: null, alsoWaiting: null, remaining: [] }
  }
  return {
    title: "Your case is complete",
    body: "No further action is currently needed for this case.",
    timing: null,
    support: null,
    alsoWaiting: null,
    remaining: [],
  }
}

export function timelineMessage(code: CustomerTimelineCode, outcomeCode: OutcomeCode | null): string {
  if (code === "CASE_COMPLETED" && outcomeCode === "RESTORED") {
    return "Your profile was restored and the case was completed."
  }
  if (code === "CASE_COMPLETED" && outcomeCode === "REMOVED") {
    return "The review was removed and the case was completed."
  }
  return TIMELINE_MESSAGES[code]
}

export type PresentedTimelineEntry = {
  code: CustomerTimelineCode
  occurredAt: string
  dateLabel: string
  message: string
}

export function presentTimeline(detail: CustomerCaseDetail): PresentedTimelineEntry[] {
  return detail.timeline.map(event => ({
    code: event.code,
    occurredAt: event.occurredAt,
    dateLabel: formatPortalDate(event.occurredAt),
    message: timelineMessage(event.code, detail.case.outcomeCode),
  }))
}

export type DetailRow = { term: string; value: string }

export function presentDetailRows(detail: CustomerCaseDetail): DetailRow[] {
  const item = detail.case
  const rows: DetailRow[] = [
    { term: "Reference", value: item.reference },
    { term: "Service", value: caseTypeLabel(item.caseType) },
    { term: "Business", value: item.businessName },
  ]
  if (item.locationName) rows.push({ term: "Location", value: item.locationName })
  const track = serviceLabel(item.serviceTrack)
  if (track) rows.push({ term: "Service type", value: track })
  rows.push({ term: "Started", value: formatPortalDate(item.submittedAt) })
  if (item.closedAt) rows.push({ term: "Closed", value: formatPortalDate(item.closedAt) })
  return rows
}
