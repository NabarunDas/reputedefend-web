export const packStatuses = ["DRAFT", "APPROVED", "STALE", "SUPERSEDED"] as const
export type PackStatus = (typeof packStatuses)[number]

export const packOperations = ["create", "add_item", "remove_item", "move_item", "approve"] as const
export type PackOperation = (typeof packOperations)[number]

export const PACK_APPROVAL_WARNING =
  "Pack approval confirms the selected evidence only. It does not confirm payment, customer authority or permission to submit, and it does not submit anything to Google."

export const PACK_STALE_WARNING =
  "Pack stale — included evidence has changed. Do not use this pack for submission. Create a new prepared pack."

export const PACK_CONFIRMATION =
  "I confirm this exact evidence selection is the prepared pack. This does not confirm payment, customer authority, or submission to Google."

export type PreparedPackItem = {
  id: string
  documentId: string
  versionId: string
  position: number
  documentTitle: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  versionNumber: number
}

export type PreparedPack = {
  id: string
  packNumber: number
  status: PackStatus
  approvalNote: string
  createdAt: string
  approvedAt: string | null
  recordVersion: number
  items: PreparedPackItem[]
}

export type EligiblePackVersion = {
  documentId: string
  versionId: string
  versionNumber: number
  documentTitle: string
  originalFilename: string
  contentType: string
  sizeBytes: number
}

export type PreparedPackCase = {
  caseId: string
  packs: PreparedPack[]
  eligible: EligiblePackVersion[]
}

export function packStatusTone(status: PackStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED") return "success"
  if (status === "DRAFT") return "warning"
  if (status === "STALE") return "danger"
  return "neutral"
}

export function isPackStatus(value: string): value is PackStatus {
  return (packStatuses as readonly string[]).includes(value)
}
