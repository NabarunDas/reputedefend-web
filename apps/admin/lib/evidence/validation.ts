import { isUuid } from "../records/model"
import {
  MAX_EVIDENCE_BYTES, evidenceOperations, fileExtension, isAllowedMime, mimeExtensions, rejectedExtensions,
  type AllowedMime, type EvidenceOperation,
} from "./model"

export type BeginArgs = { caseId: string; documentId: string | null; filename: string; contentType: AllowedMime; size: number; title: string; evidenceRequestId: string | null }
export type VersionArgs = { caseId: string; versionId: string }

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null
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

export function evidenceArgs(operation: EvidenceOperation, raw: unknown): BeginArgs | VersionArgs | null {
  const body = asRecord(raw)
  if (!body || body.operation !== operation || !evidenceOperations.includes(operation)) return null
  if (operation === "begin") {
    if (Object.keys(body).some(key => !["operation", "caseId", "documentId", "filename", "contentType", "size", "title", "evidenceRequestId"].includes(key))) return null
    if (!isUuid(body.caseId) || (body.documentId !== null && !isUuid(body.documentId)) || (body.evidenceRequestId !== null && !isUuid(body.evidenceRequestId))) return null
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 200) return null
    if (typeof body.filename !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number") return null
    const file = declaredUpload(body.filename, body.contentType, body.size)
    if (!file) return null
    return { caseId: body.caseId, documentId: body.documentId, filename: file.filename, contentType: file.contentType, size: file.size, title: body.title.trim(), evidenceRequestId: body.evidenceRequestId }
  }
  if (Object.keys(body).some(key => !["operation", "caseId", "versionId"].includes(key)) || !isUuid(body.caseId) || !isUuid(body.versionId)) return null
  return { caseId: body.caseId, versionId: body.versionId }
}
