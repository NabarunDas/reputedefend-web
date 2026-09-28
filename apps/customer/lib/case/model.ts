export const READ_EXPIRES_SECONDS = 60
export const GUARDDUTY_TAG = "GuardDutyMalwareScanStatus"
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const previewableMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export const downloadableMimeTypes = [...previewableMimeTypes, DOCX_MIME] as const
export const scanStatuses = ["PENDING", "NO_THREATS_FOUND", "THREATS_FOUND", "UNSUPPORTED", "ACCESS_DENIED", "FAILED"] as const
export type ScanStatus = (typeof scanStatuses)[number]
export type CustomerFileOperation = "view" | "download"

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

export type CustomerCasePack = {
  kind: string
  caseReference: string
  businessName: string
  locationName: string | null
  maskedEmail: string
  pack: CustomerPublishedPack | null
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
