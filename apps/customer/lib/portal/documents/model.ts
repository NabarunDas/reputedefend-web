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

export const MAX_ARCHIVE_FILES = 20
export const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024
export const ARCHIVE_TOGETHER_LIMIT = "This pack is too large to download together. Download the files individually."

export function archiveActionLabel(count: number): string {
  return `Download all ${count} ${count === 1 ? "file" : "files"}`
}

/** True only when a pack can be streamed within the archive service limits. */
export function archiveFitsLimits(files: { sizeBytes: number }[]): boolean {
  if (files.length < 1 || files.length > MAX_ARCHIVE_FILES) return false
  let total = 0
  for (const file of files) {
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1) return false
    total += file.sizeBytes
    if (total > MAX_ARCHIVE_BYTES) return false
  }
  return true
}

export const GUIDED_PACK_READY = "Your submission pack is ready"

export const UPLOAD_CONSTRAINTS = "PDF, JPEG, PNG, WebP or DOCX. Maximum size 10 MB."
