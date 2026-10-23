import { isUuid } from "@/lib/uuid"
import {
  MAX_EVIDENCE_BYTES, evidenceFormatSummary, evidenceSizeSummary, fileExtension, isAllowedMime, mimeExtensions, rejectedExtensions,
  type AllowedMime, type CustomerUploadOperation,
} from "./model"

export type BeginUploadArgs = { evidenceRequestId: string; itemTitle?: string; filename: string; contentType: AllowedMime; size: number }
export type FinalizeUploadArgs = { versionId: string }
export type CustomerUploadArgs = BeginUploadArgs | FinalizeUploadArgs

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).length === allowed.length && allowed.every(key => Object.hasOwn(body, key))
}

export function evidenceFileChoiceError(filename: string, contentType: string, size: number): string | null {
  if (!Number.isSafeInteger(size) || size < 1) return "This file is empty. Choose a file that contains the document."
  const extension = fileExtension(filename)
  const typeAllowed = isAllowedMime(contentType)
    && mimeExtensions[contentType].includes(extension)
    && !(rejectedExtensions as readonly string[]).includes(extension)
  if (!typeAllowed) return `This file type is not accepted. Use ${evidenceFormatSummary("or")}.`
  if (size > MAX_EVIDENCE_BYTES) return `This file is too large. ${evidenceSizeSummary()}.`
  if (!declaredUpload(filename, contentType, size)) return `This file type is not accepted. Use ${evidenceFormatSummary("or")}.`
  return null
}

export function declaredUpload(filename: string, contentType: string, size: number): { filename: string; contentType: AllowedMime; size: number } | null {
  if (typeof filename !== "string" || typeof contentType !== "string" || !Number.isSafeInteger(size)) return null
  const name = filename.trim()
  if (name.length < 1 || name.length > 255 || /[\\/]/.test(name)) return null
  if (size < 1 || size > MAX_EVIDENCE_BYTES) return null
  const extension = fileExtension(name)
  if ((rejectedExtensions as readonly string[]).includes(extension) || !isAllowedMime(contentType)) return null
  if (!mimeExtensions[contentType].includes(extension)) return null
  return { filename: name, contentType, size }
}

export function customerUploadArgs(operation: CustomerUploadOperation, raw: unknown): CustomerUploadArgs | null {
  const body = asRecord(raw)
  if (!body || body.operation !== operation) return null
  if (operation === "begin") {
    const hasItem = Object.hasOwn(body, "itemTitle")
    if (!onlyKeys(body, ["operation", "evidenceRequestId", ...(hasItem ? ["itemTitle"] : []), "filename", "contentType", "size"])) return null
    // Validate the raw value before trimming so leading/trailing control
    // characters cannot disappear and be accepted as a new item label.
    const rawItem = hasItem ? body.itemTitle : null
    if (hasItem && (typeof rawItem !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(rawItem))) return null
    const item = typeof rawItem === "string" ? rawItem.trim() : null
    if (hasItem && (!item || item.length > 200)) return null
    if (!isUuid(body.evidenceRequestId) || typeof body.filename !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number") return null
    const file = declaredUpload(body.filename, body.contentType, body.size)
    if (!file) return null
    return { evidenceRequestId: body.evidenceRequestId, ...(item ? { itemTitle: item } : {}), filename: file.filename, contentType: file.contentType, size: file.size }
  }
  if (!onlyKeys(body, ["operation", "versionId"]) || typeof body.versionId !== "string" || !isUuid(body.versionId)) return null
  return { versionId: body.versionId }
}

export function isBeginUploadArgs(args: CustomerUploadArgs): args is BeginUploadArgs {
  return "filename" in args
}