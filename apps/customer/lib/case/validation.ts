import { isUuid } from "@/lib/uuid"
import {
  MAX_EVIDENCE_BYTES, fileExtension, isAllowedMime, mimeExtensions, rejectedExtensions,
  type AllowedMime, type CustomerUploadOperation,
} from "./model"

export type BeginUploadArgs = { evidenceRequestId: string; filename: string; contentType: AllowedMime; size: number }
export type FinalizeUploadArgs = { versionId: string }
export type CustomerUploadArgs = BeginUploadArgs | FinalizeUploadArgs

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).length === allowed.length && allowed.every(key => Object.hasOwn(body, key))
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
    if (!onlyKeys(body, ["operation", "evidenceRequestId", "filename", "contentType", "size"])) return null
    if (!isUuid(body.evidenceRequestId) || typeof body.filename !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number") return null
    const file = declaredUpload(body.filename, body.contentType, body.size)
    if (!file) return null
    return { evidenceRequestId: body.evidenceRequestId, filename: file.filename, contentType: file.contentType, size: file.size }
  }
  if (!onlyKeys(body, ["operation", "versionId"]) || typeof body.versionId !== "string" || !isUuid(body.versionId)) return null
  return { versionId: body.versionId }
}

export function isBeginUploadArgs(args: CustomerUploadArgs): args is BeginUploadArgs {
  return "filename" in args
}