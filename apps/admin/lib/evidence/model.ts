export const MAX_EVIDENCE_BYTES = 10_485_760
export const UPLOAD_EXPIRES_SECONDS = 300
export const GUARDDUTY_TAG = "GuardDutyMalwareScanStatus"

export const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const
export type AllowedMime = (typeof allowedMimeTypes)[number]

export const mimeExtensions: Record<AllowedMime, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
}

export const rejectedExtensions = [".doc", ".docm", ".xls", ".xlsx", ".zip", ".rar", ".7z", ".svg", ".html", ".js", ".exe"] as const

export const uploadStatuses = ["PENDING_UPLOAD", "UPLOADED", "FAILED"] as const
export const scanStatuses = ["PENDING", "NO_THREATS_FOUND", "THREATS_FOUND", "UNSUPPORTED", "ACCESS_DENIED", "FAILED"] as const
export const validationStatuses = ["PENDING", "VALID", "INVALID", "ERROR"] as const
export const reviewStatuses = ["UNREVIEWED", "ACCEPTED", "REJECTED", "SUPERSEDED"] as const
export type ScanStatus = (typeof scanStatuses)[number]
export type ValidationStatus = (typeof validationStatuses)[number]

export const evidenceOperations = ["begin", "finalize", "refresh_scan"] as const
export type EvidenceOperation = (typeof evidenceOperations)[number]

export function isAllowedMime(value: string): value is AllowedMime {
  return (allowedMimeTypes as readonly string[]).includes(value)
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
}
