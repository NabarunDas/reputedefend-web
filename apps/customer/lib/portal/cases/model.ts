/**
 * Customer-facing presentation for a case list.
 *
 * This is not CaseFlow. It does not write case state, authorise an action,
 * or decide whether a case may progress. The order of attention codes is
 * display order only.
 */
import type { AttentionCode, AttentionItem, CaseStatus, CaseType, CustomerCaseRow, ServiceTrack, WorkStage } from "./parse"

export type CustomerCaseState =
  | "ACTION_NEEDED"
  | "RECEIVED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "WAITING_GOOGLE"
  | "COMPLETE"
  | "CANCELLED"

const CASE_TYPE_LABELS: Record<CaseType, string> = {
  PROFILE_RECOVERY: "Profile Recovery",
  REVIEW_PROTECTION: "Review Protection",
}

const STATUS_LABELS: Record<CustomerCaseState, string> = {
  ACTION_NEEDED: "Action needed",
  RECEIVED: "Received",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  WAITING_GOOGLE: "Waiting for Google",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
}

const ATTENTION_LABELS: Record<AttentionCode, string> = {
  EVIDENCE_REQUIRED: "Upload evidence",
  QUOTE_ACCEPTANCE: "Review your quote",
  SERVICE_AGREEMENT: "Accept your service agreement",
  CASE_PERMISSION: "Confirm case-management permission",
  GUIDED_PAYMENT: "Complete your payment",
  MANAGED_PAYMENT_SETUP: "Save your payment method",
  PAYMENT_RECOVERY: "Complete payment authentication",
  INVOICE_PAYMENT: "Pay your invoice",
}

const ACTION_SUPPORT = "Use the secure link in the ProfileRelaunch email for this step."
const EVIDENCE_SUPPORT = "Use the secure case link in the ProfileRelaunch email to provide the requested evidence."

const ukDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
})

export function formatPortalDate(iso: string): string {
  return ukDate.format(new Date(iso))
}

export function caseTypeLabel(caseType: CaseType): string {
  return CASE_TYPE_LABELS[caseType]
}

export function serviceLabel(track: ServiceTrack): string | null {
  if (track === "GUIDED") return "Guided service"
  if (track === "MANAGED") return "Managed service"
  return null
}

export function customerCaseState(status: CaseStatus, workStage: WorkStage, attentionCount: number): CustomerCaseState {
  if (status === "CANCELLED") return "CANCELLED"
  if (status === "CLOSED") return "COMPLETE"
  if (attentionCount > 0) return "ACTION_NEEDED"
  if (workStage === "WAITING_GOOGLE") return "WAITING_GOOGLE"
  if (workStage === "SUBMITTED") return "SUBMITTED"
  if (status === "RECEIVED" && workStage === "INITIAL_REVIEW") return "RECEIVED"
  return "IN_PROGRESS"
}

export function statusLabel(state: CustomerCaseState): string {
  return STATUS_LABELS[state]
}

export type PresentedAttention = {
  label: string
  timing: string | null
  support: string
}

export function presentAttention(item: AttentionItem): PresentedAttention {
  if (item.code === "EVIDENCE_REQUIRED") {
    return {
      label: ATTENTION_LABELS.EVIDENCE_REQUIRED,
      timing: item.dueAt ? `Requested by ${formatPortalDate(item.dueAt)}` : null,
      support: EVIDENCE_SUPPORT,
    }
  }
  return {
    label: ATTENTION_LABELS[item.code],
    timing: `Secure link expires ${formatPortalDate(item.expiresAt)}`,
    support: ACTION_SUPPORT,
  }
}

export type PresentedCase = {
  reference: string
  caseTypeLabel: string
  serviceLabel: string | null
  businessName: string
  locationName: string | null
  state: CustomerCaseState
  statusLabel: string
  startedLabel: string
  attention: PresentedAttention[]
}

export function presentCase(row: CustomerCaseRow): PresentedCase {
  const state = customerCaseState(row.status, row.workStage, row.attentionItems.length)
  return {
    reference: row.reference,
    caseTypeLabel: caseTypeLabel(row.caseType),
    serviceLabel: serviceLabel(row.serviceTrack),
    businessName: row.businessName,
    locationName: row.locationName,
    state,
    statusLabel: statusLabel(state),
    startedLabel: `Started ${formatPortalDate(row.submittedAt)}`,
    attention: row.attentionItems.map(presentAttention),
  }
}

export function attentionIntro(count: number): string {
  return count === 1
    ? "One of your cases has a step for you."
    : "Some of your cases have steps for you."
}

export function calmActiveCopy(activeCases: number): string {
  return activeCases === 1
    ? "We're working on your active case. We'll let you know when you need to do something."
    : "We're working on your active cases. We'll let you know when you need to do something."
}
