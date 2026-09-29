export const MAX_EVIDENCE_BYTES = 10_485_760
export const UPLOAD_EXPIRES_SECONDS = 300
export const READ_EXPIRES_SECONDS = 60
export const GUARDDUTY_TAG = "GuardDutyMalwareScanStatus"
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const previewableMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export const downloadableMimeTypes = [...previewableMimeTypes, DOCX_MIME] as const
export const allowedMimeTypes = [...downloadableMimeTypes] as const
export const allowedFileAccept = ".pdf,.jpg,.jpeg,.png,.webp,.docx"
export const rejectedExtensions = [".doc", ".docm", ".xls", ".xlsx", ".zip", ".rar", ".7z", ".svg", ".html", ".js", ".exe"] as const
export const mimeExtensions: Record<AllowedMime, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  [DOCX_MIME]: [".docx"],
}
export const scanStatuses = ["PENDING", "NO_THREATS_FOUND", "THREATS_FOUND", "UNSUPPORTED", "ACCESS_DENIED", "FAILED"] as const
export type ScanStatus = (typeof scanStatuses)[number]
export type AllowedMime = (typeof allowedMimeTypes)[number]
export type CustomerFileOperation = "view" | "download"
export type CustomerUploadOperation = "begin" | "finalize"
export type CustomerSubmissionStatus = "NOT_SUBMITTED" | "UPLOAD_PENDING" | "AWAITING_REVIEW"

export type CustomerPackItem = {
  versionId: string
  position: number
  documentTitle: string
  originalFilename: string
  contentType: string
  sizeBytes: number
}

export type CustomerPublishedPack = {
  packNumber: number
  publishedAt: string
  items: CustomerPackItem[]
}

export type CustomerEvidenceRequest = {
  requestId: string
  title: string
  requestText: string
  dueAt: string | null
  createdAt: string
  submissionStatus: CustomerSubmissionStatus
  filename: string | null
  submittedAt: string | null
}

export type CustomerCasePack = {
  kind: string
  caseReference: string
  businessName: string
  locationName: string | null
  maskedEmail: string
  pack: CustomerPublishedPack | null
  evidenceRequests: CustomerEvidenceRequest[]
}

export type CustomerUploadVersion = {
  documentId: string
  versionId: string
  evidenceRequestId: string
  storageBucket: string
  storageKey: string
  contentType: AllowedMime
  sizeBytes: number
  uploadStatus: string
  submissionSource: "CUSTOMER"
}

export type CustomerPackVersion = {
  versionId: string
  documentTitle: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  storageBucket: string
  storageKey: string
}

export function isAllowedMime(value: string): value is AllowedMime {
  return (allowedMimeTypes as readonly string[]).includes(value)
}

export function isPreviewableMime(value: string): boolean {
  return (previewableMimeTypes as readonly string[]).includes(value)
}

export function isDownloadableMime(value: string): boolean {
  return (downloadableMimeTypes as readonly string[]).includes(value)
}

export function isDocxMime(value: string): boolean {
  return value === DOCX_MIME
}

export function mapGuardDutyStatus(tag: string | undefined): ScanStatus {
  if (!tag) return "PENDING"
  return (scanStatuses as readonly string[]).includes(tag) ? tag as ScanStatus : "FAILED"
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1_048_576) return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`
  return `${(size / 1_048_576).toFixed(size < 10_485_760 ? 1 : 0)} MB`
}

export function fileTypeLabel(contentType: string): string {
  if (contentType === "application/pdf") return "PDF"
  if (contentType === "image/jpeg") return "JPEG"
  if (contentType === "image/png") return "PNG"
  if (contentType === "image/webp") return "WebP"
  if (isDocxMime(contentType)) return "DOCX"
  return contentType
}

export function canViewItem(item: Pick<CustomerPackItem, "contentType">): boolean {
  return isPreviewableMime(item.contentType)
}

export function canDownloadItem(item: Pick<CustomerPackItem, "contentType">): boolean {
  return isDownloadableMime(item.contentType)
}

export function fileExtension(filename: string): string {
  const lower = filename.trim().toLowerCase()
  const index = lower.lastIndexOf(".")
  return index < 0 ? "" : lower.slice(index)
}

export function evidenceObjectKey(caseId: string, documentId: string, versionId: string): string {
  return `cases/${caseId}/documents/${documentId}/versions/${versionId}`
}

export function isOpaqueEvidenceKey(key: string, originalFilename: string): boolean {
  return /^cases\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/versions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
    && !key.toLowerCase().includes(originalFilename.trim().toLowerCase())
}

export function usesConfiguredEvidenceBucket(version: Pick<CustomerUploadVersion, "storageBucket">, bucket: string): boolean {
  return version.storageBucket === bucket
}

export function submissionLabel(status: CustomerSubmissionStatus): string {
  if (status === "AWAITING_REVIEW") return "Uploaded — awaiting security review"
  if (status === "UPLOAD_PENDING") return "Upload pending"
  return "Not submitted"
}
