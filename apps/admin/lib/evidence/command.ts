import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import {
  evidenceArgs, isBeginArgs, isRequestCreateArgs, isRequestUpdateArgs, isReviewArgs, isVersionArgs,
} from "./validation"
import { createEvidenceStorage, isAllowedReadExpiry, signedUrlExpiresSeconds, type EvidenceStorage } from "./storage"
import {
  MAX_EVIDENCE_BYTES, UPLOAD_EXPIRES_SECONDS, evidenceOperations, isAllowedMime,
  isOpaqueEvidenceKey, isPreviewableMime, mayRetrieveBytes, needsEvidenceStorage, usesConfiguredEvidenceBucket,
  type EvidenceOperation, type EvidenceVersion, type ScanStatus, type ValidationStatus,
} from "./model"
import { validateEvidenceBytes } from "./content"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest): Promise<{ body: unknown } | NextResponse> {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 32768) { await reader.cancel(); return reply("That request is too large.", 413) }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return { body: JSON.parse(raw || "{}") } } catch { return reply("Please check the form and try again.", 400) }
}

function mapStatus(status: string | undefined): number {
  switch (status) {
    case "success": return 200
    case "unauthorized": return 401
    case "conflict": return 409
    case "denied": return 403
    case "invalid": return 400
    default: return 503
  }
}

async function versionRecord(token: string, caseId: string, versionId: string): Promise<EvidenceVersion | "missing" | "unauthorized"> {
  const result = await backend().rpc<EvidenceVersion | { missing: true } | null>("admin_evidence_version_v1", { p_token: tokenHash(token), p_case: caseId, p_version: versionId })
  if (result === null) return "unauthorized"
  if ("missing" in result) return "missing"
  return result
}

function commandMessage(status: string | undefined, fallback: string): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That record is not available. Reload the case before trying again."
  if (status === "denied") return "That action is not allowed for this document."
  if (status === "invalid") return "Check the fields before saving."
  return fallback
}

export async function evidenceCommand(request: NextRequest) {
  return runEvidenceCommand(request, createEvidenceStorage())
}

export async function runEvidenceCommand(request: NextRequest, storage: EvidenceStorage | null) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const parsed = await readJson(request)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { operation?: unknown }).operation !== "string" || !evidenceOperations.includes((body as { operation: EvidenceOperation }).operation)) {
      return reply("Check the fields before saving.", 400)
    }
    const operation = (body as { operation: EvidenceOperation }).operation
    const args = evidenceArgs(operation, body)
    if (!args) return reply("Check the file type, size and case before saving.", 400)
    if (isRequestCreateArgs(args) && operation === "create_request") {
      const result = await backend().rpc<{ status: string; id?: string; version?: number; requestStatus?: string }>("admin_evidence_request_v1", {
        p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_id: null, p_version: null,
        p_operation: "create", p_title: args.title, p_text: args.requestText, p_due: args.dueAt, p_note: null,
      })
      if (result.status !== "success") return reply(commandMessage(result.status, "The evidence request could not be saved."), mapStatus(result.status))
      return reply("The evidence request has been recorded. No email was sent.", 200, { id: result.id, version: result.version, requestStatus: result.requestStatus })
    }
    if (isRequestUpdateArgs(args) && (operation === "fulfill_request" || operation === "cancel_request")) {
      const result = await backend().rpc<{ status: string; id?: string; version?: number; requestStatus?: string }>("admin_evidence_request_v1", {
        p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_id: args.requestId, p_version: args.version,
        p_operation: operation === "fulfill_request" ? "fulfill" : "cancel", p_title: null, p_text: null, p_due: null, p_note: args.note,
      })
      if (result.status !== "success") return reply(commandMessage(result.status, "The evidence request could not be updated."), mapStatus(result.status))
      return reply(operation === "fulfill_request" ? "The evidence request has been marked fulfilled." : "The evidence request has been cancelled.", 200, { id: result.id, version: result.version, requestStatus: result.requestStatus })
    }
    if (isReviewArgs(args) && (operation === "accept" || operation === "reject" || operation === "set_visibility")) {
      const result = await backend().rpc<{ status: string; id?: string; reviewStatus?: string; customerVisible?: boolean; recordVersion?: number }>("admin_evidence_review_v1", {
        p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_version: args.versionId, p_expected: args.recordVersion,
        p_operation: operation, p_note: args.note, p_visible: args.customerVisible,
      })
      if (result.status !== "success") return reply(commandMessage(result.status, "The review could not be saved."), mapStatus(result.status))
      return reply(
        operation === "accept" ? "The document version has been accepted. Customer visibility was not changed."
          : operation === "reject" ? "The document version has been rejected."
          : args.customerVisible ? "Future customer visibility has been recorded. No customer portal currently exposes this file."
          : "Customer visibility has been turned off.",
        200,
        { id: result.id, reviewStatus: result.reviewStatus, customerVisible: result.customerVisible, recordVersion: result.recordVersion },
      )
    }
    if (needsEvidenceStorage(operation) && !storage) return reply("Evidence storage is not configured for this environment.", 503)
    const store = storage
    if (!store) return reply("Evidence storage is not configured for this environment.", 503)
    if (operation === "begin" && isBeginArgs(args)) {
      const result = await backend().rpc<{
        status: string; documentId?: string; versionId?: string; versionNumber?: number; storageKey?: string; contentType?: string
      }>("admin_evidence_begin_v1", {
        p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_document: args.documentId, p_filename: args.filename,
        p_content_type: args.contentType, p_size: args.size, p_title: args.title, p_bucket: store.bucket, p_evidence_request: args.evidenceRequestId,
      })
      if (result.status !== "success" || !result.storageKey || !result.contentType || !result.documentId || !result.versionId) {
        return reply(result.status === "conflict" ? "That case or document is not available." : result.status === "unauthorized" ? "Your session has ended. Please sign in again." : "Check the file type, size and case before saving.", mapStatus(result.status))
      }
      const loaded = await versionRecord(token, args.caseId, result.versionId)
      if (loaded === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
      if (loaded === "missing") return reply("That document is not available.", 409)
      if (loaded.uploadStatus !== "PENDING_UPLOAD") {
        return reply("This upload has already been finalised. Start a new document version instead.", 409)
      }
      if (!isOpaqueEvidenceKey(loaded.storageKey, args.filename) || !usesConfiguredEvidenceBucket(loaded, store.bucket)) {
        return reply("We couldn’t create a safe upload. Please try again shortly.", 503)
      }
      const upload = await store.createUpload({ key: loaded.storageKey, contentType: loaded.contentType })
      if (upload.expiresSeconds > UPLOAD_EXPIRES_SECONDS) return reply("We couldn’t create a safe upload. Please try again shortly.", 503)
      return reply("Upload the file directly using the provided fields.", 200, {
        documentId: result.documentId, versionId: result.versionId, versionNumber: result.versionNumber, storageKey: loaded.storageKey,
        maxBytes: MAX_EVIDENCE_BYTES, upload: { url: upload.url, fields: upload.fields, expiresSeconds: upload.expiresSeconds },
      })
    }
    if (!isVersionArgs(args)) return reply("Check the fields before saving.", 400)
    const version = await versionRecord(token, args.caseId, args.versionId)
    if (version === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (version === "missing") return reply("That document is not available.", 409)
    if (!usesConfiguredEvidenceBucket(version, store.bucket)) return reply("We couldn’t confirm the change. Reload the case before trying again.", 503)
    if (operation === "view" || operation === "download") {
      if (version.uploadStatus !== "UPLOADED" || !mayRetrieveBytes(version.scanStatus, version.validationStatus)) {
        return reply("That file cannot be opened.", 403)
      }
      if (operation === "view" && !isPreviewableMime(version.contentType)) return reply("Preview not available for this file type.", 403)
      const probe = await store.probeObject(version.storageKey)
      if (!probe.exists || probe.scan !== "NO_THREATS_FOUND") return reply("That file cannot be opened.", 403)
      const url = await store.createReadUrl({
        key: version.storageKey,
        contentType: version.contentType,
        filename: version.originalFilename,
        disposition: operation === "view" ? "inline" : "attachment",
      })
      const expires = signedUrlExpiresSeconds(url)
      if (!isAllowedReadExpiry(expires)) return reply("We couldn’t create a safe download. Please try again shortly.", 503)
      const result = await backend().rpc<{ status: string }>("admin_evidence_access_v1", {
        p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_version: args.versionId, p_action: operation,
      })
      if (result.status !== "success") return reply(commandMessage(result.status, "That file cannot be opened."), mapStatus(result.status))
      return reply(operation === "view" ? "Open the file in the new tab." : "Download the file.", 200, { url })
    }
    if (operation === "finalize") {
      const probe = await store.probeObject(version.storageKey)
      if (!probe.exists) return reply("The uploaded file was not found. Ask for a new upload link and try again.", 409)
      const result = await backend().rpc<{ status: string; uploadStatus?: string; scanStatus?: string; validationStatus?: string }>("admin_evidence_finalize_v1", {
        p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_version: args.versionId,
      })
      if (result.status !== "success") return reply(result.status === "unauthorized" ? "Your session has ended. Please sign in again." : "That upload cannot be finalized.", mapStatus(result.status))
      return reply("The upload has been recorded and is waiting for malware scanning.", 200, { documentId: version.documentId, versionId: version.versionId, uploadStatus: result.uploadStatus, scanStatus: result.scanStatus, validationStatus: result.validationStatus })
    }
    const probe = await store.probeObject(version.storageKey)
    if (!probe.exists) return reply("The uploaded file was not found.", 409)
    const scan: ScanStatus = probe.scan
    let validation: ValidationStatus = "PENDING"
    let validationError: string | null = null
    if (scan === "NO_THREATS_FOUND") {
      try {
        const bytes = await store.readScannedObject(version.storageKey)
        if (!bytes || !isAllowedMime(version.contentType)) {
          validation = "ERROR"
          validationError = "The scanned file could not be read for validation."
        } else {
          const error = validateEvidenceBytes(bytes, version.contentType)
          if (error) { validation = "INVALID"; validationError = error }
          else validation = "VALID"
        }
      } catch {
        validation = "ERROR"
        validationError = "The scanned file could not be read for validation."
      }
    }
    const result = await backend().rpc<{ status: string; scanStatus?: string; validationStatus?: string }>("admin_evidence_refresh_scan_v1", {
      p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_version: args.versionId, p_scan: scan, p_validation: validation, p_validation_error: validationError,
    })
    if (result.status !== "success") return reply(result.status === "unauthorized" ? "Your session has ended. Please sign in again." : "The scan status could not be updated.", mapStatus(result.status))
    return reply("The malware scan status has been refreshed.", 200, { documentId: version.documentId, versionId: version.versionId, scanStatus: result.scanStatus, validationStatus: result.validationStatus })
  } catch {
    return reply("We couldn’t confirm the change. Reload the case before trying again.", 503)
  }
}

export async function retrieveCleanEvidence(storage: EvidenceStorage, version: EvidenceVersion): Promise<Uint8Array | null> {
  if (!mayRetrieveBytes(version.scanStatus, version.validationStatus) || !usesConfiguredEvidenceBucket(version, storage.bucket)) return null
  return storage.readScannedObject(version.storageKey)
}
