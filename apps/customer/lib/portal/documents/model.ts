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
  NEEDS_ANOTHER: "Needs another document",
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

export function publishedFileMeta(item: { contentType: string; sizeBytes: number }): string {
  return `${fileTypeLabel(item.contentType)} · ${formatBytes(item.sizeBytes)}`
}

export function publishedFileDetail(item: { contentType: string; sizeBytes: number; publishedAt: string }): string {
  return `${publishedFileMeta(item)} · Published ${formatPortalDate(item.publishedAt)}`
}

export function archiveActionLabel(count: number): string {
  return `Download all ${count} ${count === 1 ? "file" : "files"}`
}

export const GUIDED_PACK_READY = "Your submission pack is ready"

export const UPLOAD_CONSTRAINTS = "PDF, JPEG, PNG, WebP or DOCX. Maximum size 10 MB."
