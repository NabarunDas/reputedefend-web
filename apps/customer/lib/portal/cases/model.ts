/**
 * Customer-facing presentation for a case list.
 *
 * This is not CaseFlow. It does not write case state, authorise an action,
 * or decide whether a case may progress. The order of attention codes is
 * display order only.
 */
import { isPublicCaseReference, type AttentionCode, type AttentionItem, type CaseStatus, type CaseType, type CustomerCaseRow, type ServiceTrack, type WorkStage } from "./parse"

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
const EVIDENCE_SUPPORT = "Upload the requested evidence in your customer portal."

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

const PORTAL_SERVICE_SUPPORT = {
  QUOTE_ACCEPTANCE: "Review your quote in the customer portal.",
  SERVICE_AGREEMENT: "Review your Service Agreement in the customer portal.",
  CASE_PERMISSION: "Review your case management permission in the customer portal.",
} as const

export type PresentedAttention = {
  label: string
  timing: string | null
  support: string
  href: string | null
  actionLabel: string | null
}

export function presentAttention(item: AttentionItem, reference?: string): PresentedAttention {
  const destination = reference && isPublicCaseReference(reference) ? reference : null
  if (item.code === "EVIDENCE_REQUIRED") {
    return {
      label: ATTENTION_LABELS.EVIDENCE_REQUIRED,
      timing: item.dueAt ? `Requested by ${formatPortalDate(item.dueAt)}` : null,
      support: EVIDENCE_SUPPORT,
      href: destination ? `/portal/cases/${destination}/documents` : null,
      actionLabel: destination ? `Upload evidence for ${destination}` : null,
    }
  }
  if (item.code === "QUOTE_ACCEPTANCE" || item.code === "SERVICE_AGREEMENT" || item.code === "CASE_PERMISSION") {
    return {
      label: ATTENTION_LABELS[item.code],
      timing: `Available until ${formatPortalDate(item.expiresAt)}`,
      support: PORTAL_SERVICE_SUPPORT[item.code],
      href: destination ? `/portal/cases/${destination}/service` : null,
      actionLabel: destination ? `Review your service for ${destination}` : null,
    }
  }
  return {
    label: ATTENTION_LABELS[item.code],
    timing: `Secure link expires ${formatPortalDate(item.expiresAt)}`,
    support: ACTION_SUPPORT,
    href: null,
    actionLabel: null,
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
    attention: row.attentionItems.map(item => presentAttention(item, row.reference)),
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
