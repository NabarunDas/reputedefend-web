import { fileTypeLabel, formatBytes } from "@/lib/case/model"
import { caseTypeLabel, formatPortalDate, serviceLabel } from "@/lib/portal/cases/model"
import type { EvidenceState, PortalCaseContext } from "./parse"

const STATE_LABELS: Record<EvidenceState, string> = {
  NOT_SUBMITTED: "Not submitted",
  UPLOAD_IN_PROGRESS: "Upload in progress",
  RECEIVED: "Received",
  BEING_CHECKED: "Being checked",
  UNDER_REVIEW: "Under review",
  ACCEPTED: "Accepted",
  NEEDS_ANOTHER: "We need another document",
}

export function evidenceStateLabel(state: EvidenceState): string {
  return STATE_LABELS[state]
}

export function documentContext(item: PortalCaseContext): string {
  const parts = [caseTypeLabel(item.caseType), item.businessName]
  if (item.locationName) parts.push(item.locationName)
  const service = serviceLabel(item.serviceTrack)
  if (service) parts.push(service)
  return parts.join(" · ")
}

export function publishedFileDetail(item: { contentType: string; sizeBytes: number; publishedAt: string }): string {
  return `${fileTypeLabel(item.contentType)} · ${formatBytes(item.sizeBytes)} · Published ${formatPortalDate(item.publishedAt)}`
}

export const UPLOAD_CONSTRAINTS = "PDF, JPEG, PNG, WebP or DOCX. Maximum size 10 MB."
