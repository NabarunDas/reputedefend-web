export const MAX_EVIDENCE_BYTES = 10_485_760
export const UPLOAD_EXPIRES_SECONDS = 300
export const READ_EXPIRES_SECONDS = 60
export const GUARDDUTY_TAG = "GuardDutyMalwareScanStatus"
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const PREVIEW_UNAVAILABLE = "Preview not available for this file type"

export const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  DOCX_MIME,
] as const
export type AllowedMime = (typeof allowedMimeTypes)[number]

export const previewableMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export type PreviewableMime = (typeof previewableMimeTypes)[number]

export const mimeExtensions: Record<AllowedMime, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  [DOCX_MIME]: [".docx"],
}

export const mimeLabels: Record<AllowedMime, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  [DOCX_MIME]: "DOCX",
}

export const allowedFileAccept = ".pdf,.jpg,.jpeg,.png,.webp,.docx"

export const rejectedExtensions = [".doc", ".docm", ".xls", ".xlsx", ".zip", ".rar", ".7z", ".svg", ".html", ".js", ".exe"] as const

export const uploadStatuses = ["PENDING_UPLOAD", "UPLOADED", "FAILED"] as const
export const scanStatuses = ["PENDING", "NO_THREATS_FOUND", "THREATS_FOUND", "UNSUPPORTED", "ACCESS_DENIED", "FAILED"] as const
export const validationStatuses = ["PENDING", "VALID", "INVALID", "ERROR"] as const
export const reviewStatuses = ["UNREVIEWED", "ACCEPTED", "REJECTED", "SUPERSEDED"] as const
export type ScanStatus = (typeof scanStatuses)[number]
export type ValidationStatus = (typeof validationStatuses)[number]
export type ReviewStatus = (typeof reviewStatuses)[number]

export const evidenceOperations = [
  "begin", "finalize", "refresh_scan",
  "create_request", "fulfill_request", "cancel_request",
  "accept", "reject", "set_visibility",
  "view", "download",
] as const
export type EvidenceOperation = (typeof evidenceOperations)[number]

export const storageOperations = ["begin", "finalize", "refresh_scan", "view", "download"] as const
export type StorageOperation = (typeof storageOperations)[number]

export const requestOperations = ["create_request", "fulfill_request", "cancel_request"] as const
export type RequestOperation = (typeof requestOperations)[number]

export const reviewOperations = ["accept", "reject", "set_visibility"] as const
export type ReviewOperation = (typeof reviewOperations)[number]

export const queueFilters = ["needs_review", "scanning", "blocked", "accepted", "rejected", "all"] as const
export type QueueFilter = (typeof queueFilters)[number]
export const queueFilterLabels: Record<QueueFilter, string> = {
  needs_review: "Needs review",
  scanning: "Scanning",
  blocked: "Blocked",
  accepted: "Accepted",
  rejected: "Rejected",
  all: "All",
}

export function isAllowedMime(value: string): value is AllowedMime {
  return (allowedMimeTypes as readonly string[]).includes(value)
}

export function isPreviewableMime(value: string): value is PreviewableMime {
  return (previewableMimeTypes as readonly string[]).includes(value)
}

export function isDocxMime(value: string): boolean {
  return value === DOCX_MIME
}

export function needsEvidenceStorage(operation: EvidenceOperation): boolean {
  return (storageOperations as readonly string[]).includes(operation)
}

export function fileExtension(filename: string): string {
  const lower = filename.trim().toLowerCase()
  const index = lower.lastIndexOf(".")
  return index < 0 ? "" : lower.slice(index)
}

export function mimeFromFilename(filename: string, declaredType?: string): AllowedMime | null {
  if (declaredType && isAllowedMime(declaredType) && mimeExtensions[declaredType].includes(fileExtension(filename))) return declaredType
  const extension = fileExtension(filename)
  for (const mime of allowedMimeTypes) {
    if (mimeExtensions[mime].includes(extension)) return mime
  }
  return null
}

export function evidenceObjectKey(caseId: string, documentId: string, versionId: string): string {
  return `cases/${caseId}/documents/${documentId}/versions/${versionId}`
}

export function isOpaqueEvidenceKey(key: string, originalFilename: string): boolean {
  return /^cases\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/versions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
    && !key.toLowerCase().includes(originalFilename.trim().toLowerCase())
}

export function mapGuardDutyStatus(tag: string | undefined): ScanStatus {
  if (!tag) return "PENDING"
  return (scanStatuses as readonly string[]).includes(tag) ? tag as ScanStatus : "FAILED"
}

export function mayRetrieveBytes(scan: ScanStatus, validation: ValidationStatus): boolean {
  return scan === "NO_THREATS_FOUND" && validation === "VALID"
}

export function usesConfiguredEvidenceBucket(version: Pick<EvidenceVersion, "storageBucket">, bucket: string): boolean {
  return version.storageBucket === bucket
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1_048_576) return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`
  return `${(size / 1_048_576).toFixed(size < 10_485_760 ? 1 : 0)} MB`
}

export function fileTypeLabel(contentType: string): string {
  return isAllowedMime(contentType) ? mimeLabels[contentType] : contentType
}

export type EvidenceActionState = {
  refresh: boolean
  view: boolean
  download: boolean
  accept: boolean
  reject: boolean
  visibility: boolean
  threatBlocked: boolean
  validationFailed: boolean
  viewHint: string | null
  statusLabel: string | null
}

export function evidenceActions(version: {
  uploadStatus: string
  scanStatus: string
  validationStatus: string
  reviewStatus: string
  contentType: string
}): EvidenceActionState {
  const uploaded = version.uploadStatus === "UPLOADED"
  const pendingScan = uploaded && version.scanStatus === "PENDING"
  const threats = version.scanStatus === "THREATS_FOUND"
  const scanBlocked = version.scanStatus === "FAILED" || version.scanStatus === "UNSUPPORTED" || version.scanStatus === "ACCESS_DENIED"
  const clean = version.scanStatus === "NO_THREATS_FOUND"
  const valid = version.validationStatus === "VALID"
  const invalidContent = clean && (version.validationStatus === "INVALID" || version.validationStatus === "ERROR")
  const cleanValid = uploaded && clean && valid
  const previewable = isPreviewableMime(version.contentType)
  const docx = isDocxMime(version.contentType)
  const superseded = version.reviewStatus === "SUPERSEDED"
  const none: EvidenceActionState = {
    refresh: false, view: false, download: false, accept: false, reject: false, visibility: false,
    threatBlocked: false, validationFailed: false, viewHint: docx ? PREVIEW_UNAVAILABLE : null, statusLabel: null,
  }
  if (pendingScan || version.uploadStatus === "PENDING_UPLOAD") {
    return { ...none, refresh: pendingScan, statusLabel: pendingScan ? "Waiting for security scan." : "Upload not finished." }
  }
  if (threats) {
    return { ...none, threatBlocked: true, statusLabel: "Threat detected — file blocked" }
  }
  if (scanBlocked) {
    return { ...none, refresh: true, statusLabel: "Scan blocked or failed." }
  }
  if (invalidContent) {
    return { ...none, refresh: true, validationFailed: true, statusLabel: "Validation failure" }
  }
  if (!cleanValid) {
    return { ...none, refresh: uploaded }
  }
  if (superseded) {
    return {
      ...none, view: previewable, download: true, viewHint: docx ? PREVIEW_UNAVAILABLE : null,
      statusLabel: "Superseded — read-only history",
    }
  }
  return {
    refresh: false,
    view: previewable,
    download: true,
    accept: version.reviewStatus === "UNREVIEWED" || version.reviewStatus === "REJECTED",
    reject: version.reviewStatus === "UNREVIEWED" || version.reviewStatus === "ACCEPTED",
    visibility: version.reviewStatus === "ACCEPTED",
    threatBlocked: false,
    validationFailed: false,
    viewHint: docx ? PREVIEW_UNAVAILABLE : null,
    statusLabel: null,
  }
}

export type EvidenceVersion = {
  documentId: string
  versionId: string
  versionNumber: number
  storageKey: string
  storageBucket: string
  uploadStatus: string
  scanStatus: ScanStatus
  validationStatus: ValidationStatus
  contentType: AllowedMime
  sizeBytes: number
  customerVisible: boolean
  originalFilename: string
  recordVersion: number
  reviewStatus: ReviewStatus
}

export type EvidenceRequest = {
  id: string
  title: string
  requestText: string
  status: "OPEN" | "FULFILLED" | "CANCELLED"
  dueAt: string | null
  createdAt: string
  fulfilledAt: string | null
  version: number
}

export type EvidenceVersionRow = {
  id: string
  versionNumber: number
  originalFilename: string
  contentType: AllowedMime
  sizeBytes: number
  uploadStatus: string
  scanStatus: ScanStatus
  validationStatus: ValidationStatus
  validationError: string | null
  reviewStatus: ReviewStatus
  reviewNote: string | null
  customerVisible: boolean
  createdAt: string
  uploadedAt: string | null
  validatedAt: string | null
  reviewedAt: string | null
  recordVersion: number
}

export type EvidenceDocument = {
  id: string
  title: string
  evidenceRequestId: string | null
  createdAt: string
  updatedAt: string
  version: number
  versions: EvidenceVersionRow[]
}

export type EvidenceCase = {
  caseId: string
  reference: string
  requests: EvidenceRequest[]
  documents: EvidenceDocument[]
}

export function evidenceQueueFilters(params: Record<string, string | string[] | undefined>): { filter: QueueFilter; time: string | null; before: string | null } | null {
  const { filter = "needs_review", time, before } = params
  if (typeof filter !== "string" || !(queueFilters as readonly string[]).includes(filter)) return null
  if ((time === undefined) !== (before === undefined)) return null
  if (time !== undefined && (Array.isArray(time) || !isIsoTime(time))) return null
  if (before !== undefined && (Array.isArray(before) || !isUuidValue(before))) return null
  return { filter: filter as QueueFilter, time: time || null, before: before || null }
}

function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
}

function isIsoTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}

export type EvidenceQueueRow = {
  caseId: string
  reference: string
  client: string
  business: string
  documentId: string
  versionId: string
  title: string
  filename: string
  contentType: AllowedMime
  sizeBytes: number
  scanStatus: ScanStatus
  validationStatus: ValidationStatus
  reviewStatus: ReviewStatus
  customerVisible: boolean
  uploadedAt: string
}
