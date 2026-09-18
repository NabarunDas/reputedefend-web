import { isUuid } from "../records/model"
import { validTime } from "../enquiries/model"
import {
  MAX_EVIDENCE_BYTES, evidenceOperations, fileExtension, isAllowedMime, mimeExtensions, rejectedExtensions,
  requestOperations, reviewOperations,
  type AllowedMime, type EvidenceOperation, type RequestOperation, type ReviewOperation,
} from "./model"

export type BeginArgs = { caseId: string; documentId: string | null; filename: string; contentType: AllowedMime; size: number; title: string; evidenceRequestId: string | null }
export type VersionArgs = { caseId: string; versionId: string }
export type RequestCreateArgs = { caseId: string; title: string; requestText: string; dueAt: string | null }
export type RequestUpdateArgs = { caseId: string; requestId: string; version: number; note: string }
export type ReviewArgs = { caseId: string; versionId: string; recordVersion: number; note: string; customerVisible: boolean | null }
export type EvidenceArgs = BeginArgs | VersionArgs | RequestCreateArgs | RequestUpdateArgs | ReviewArgs

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every(key => allowed.includes(key))
}

function note(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length >= 10 && value.trim().length <= max ? value.trim() : null
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

export function evidenceArgs(operation: EvidenceOperation, raw: unknown): EvidenceArgs | null {
  const body = asRecord(raw)
  if (!body || body.operation !== operation || !evidenceOperations.includes(operation)) return null
  if (operation === "begin") {
    if (!onlyKeys(body, ["operation", "caseId", "documentId", "filename", "contentType", "size", "title", "evidenceRequestId"])) return null
    if (!isUuid(body.caseId) || (body.documentId !== null && !isUuid(body.documentId)) || (body.evidenceRequestId !== null && !isUuid(body.evidenceRequestId))) return null
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 200) return null
    if (typeof body.filename !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number") return null
    const file = declaredUpload(body.filename, body.contentType, body.size)
    if (!file) return null
    return { caseId: body.caseId, documentId: body.documentId, filename: file.filename, contentType: file.contentType, size: file.size, title: body.title.trim(), evidenceRequestId: body.evidenceRequestId }
  }
  if ((requestOperations as readonly string[]).includes(operation)) {
    if (operation === "create_request") {
      if (!onlyKeys(body, ["operation", "caseId", "title", "requestText", "dueAt"])) return null
      if (!isUuid(body.caseId) || typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 200) return null
      if (typeof body.requestText !== "string" || body.requestText.trim().length < 1 || body.requestText.trim().length > 4000) return null
      if (body.dueAt !== null && !validTime(body.dueAt)) return null
      return { caseId: body.caseId, title: body.title.trim(), requestText: body.requestText.trim(), dueAt: body.dueAt }
    }
    if (!onlyKeys(body, ["operation", "caseId", "requestId", "version", "note"])) return null
    const supporting = note(body.note, 1000)
    if (!isUuid(body.caseId) || !isUuid(body.requestId) || !Number.isSafeInteger(body.version) || (body.version as number) < 1 || !supporting) return null
    return { caseId: body.caseId, requestId: body.requestId, version: body.version as number, note: supporting }
  }
  if ((reviewOperations as readonly string[]).includes(operation)) {
    const allowed = operation === "set_visibility"
      ? ["operation", "caseId", "versionId", "recordVersion", "note", "customerVisible"]
      : ["operation", "caseId", "versionId", "recordVersion", "note"]
    if (!onlyKeys(body, allowed)) return null
    const supporting = note(body.note, 2000)
    if (!isUuid(body.caseId) || !isUuid(body.versionId) || !Number.isSafeInteger(body.recordVersion) || (body.recordVersion as number) < 1 || !supporting) return null
    if (operation === "set_visibility" && typeof body.customerVisible !== "boolean") return null
    return {
      caseId: body.caseId, versionId: body.versionId, recordVersion: body.recordVersion as number, note: supporting,
      customerVisible: operation === "set_visibility" ? body.customerVisible as boolean : null,
    }
  }
  if (!onlyKeys(body, ["operation", "caseId", "versionId"]) || !isUuid(body.caseId) || !isUuid(body.versionId)) return null
  return { caseId: body.caseId, versionId: body.versionId }
}

export function isBeginArgs(args: EvidenceArgs): args is BeginArgs {
  return "filename" in args
}
export function isRequestCreateArgs(args: EvidenceArgs): args is RequestCreateArgs {
  return "requestText" in args
}
export function isRequestUpdateArgs(args: EvidenceArgs): args is RequestUpdateArgs {
  return "requestId" in args
}
export function isReviewArgs(args: EvidenceArgs): args is ReviewArgs {
  return "recordVersion" in args && "note" in args && "versionId" in args
}
export function isVersionArgs(args: EvidenceArgs): args is VersionArgs {
  return "versionId" in args && !("recordVersion" in args)
}

export { type RequestOperation, type ReviewOperation }
