import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerConfig, sessionCookie } from "@/lib/config"
import { isUuid } from "@/lib/uuid"
import {
  MAX_EVIDENCE_BYTES, UPLOAD_EXPIRES_SECONDS, isOpaqueEvidenceKey, usesConfiguredEvidenceBucket,
  type CustomerUploadVersion,
} from "./model"
import { createCustomerEvidenceStorage, type CustomerEvidenceStorage } from "./storage"
import { customerUploadArgs, isBeginUploadArgs } from "./validation"

const reply = (message: string, http = 401, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status: http, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit: number) {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return null }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return JSON.parse(raw || "{}") as Record<string, unknown> }
  catch { return null }
}

function originOk(request: NextRequest) {
  const config = customerConfig()
  return !!config && request.headers.get("origin") === config.origin && request.nextUrl.origin === config.origin
}

function isBeginResult(value: unknown): value is { status: string; versionId?: string } {
  return !!value && typeof value === "object" && "status" in value
}

export async function caseEvidenceUpload(request: NextRequest, storage: CustomerEvidenceStorage | null = createCustomerEvidenceStorage()) {
  const config = customerConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply(ACTION_UNAVAILABLE)
  }
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  const body = await readJson(request, 4096)
  if (!validToken(token) || !isUuid(key) || !body) return reply(ACTION_UNAVAILABLE)
  if (body.operation !== "begin" && body.operation !== "finalize") return reply(ACTION_UNAVAILABLE)
  const args = customerUploadArgs(body.operation, body)
  if (!args) {
    if (body.operation === "begin") {
      const allowed = ["operation", "evidenceRequestId", "filename", "contentType", "size"]
      const keys = Object.keys(body)
      if (keys.length !== allowed.length || allowed.some(field => !keys.includes(field))) return reply(ACTION_UNAVAILABLE)
      return reply("Check the file type and size before uploading.", 400)
    }
    return reply(ACTION_UNAVAILABLE)
  }
  if (!storage) return reply("Evidence upload is not available in this environment.", 503)
  try {
    if (isBeginUploadArgs(args)) {
      const begun = await backend().rpc<unknown>("customer_evidence_begin_v1", {
        p_token_hash: tokenHash(token), p_request: key, p_evidence_request: args.evidenceRequestId,
        p_filename: args.filename, p_content_type: args.contentType, p_size: args.size, p_bucket: storage.bucket,
      })
      if (!isBeginResult(begun) || begun.status !== "success" || !begun.versionId) {
        if (isBeginResult(begun) && begun.status === "conflict") return reply("That upload cannot be completed.", 409)
        if (isBeginResult(begun) && begun.status === "invalid") return reply("Check the file type and size before uploading.", 400)
        return reply(ACTION_UNAVAILABLE)
      }
      const version = await backend().rpc<CustomerUploadVersion | null>("customer_evidence_upload_version_v1", {
        p_token_hash: tokenHash(token), p_version: begun.versionId,
      })
      if (!version || version.submissionSource !== "CUSTOMER" || version.uploadStatus !== "PENDING_UPLOAD") {
        return reply("That upload cannot be completed.", 409)
      }
      if (!isOpaqueEvidenceKey(version.storageKey, args.filename) || !usesConfiguredEvidenceBucket(version, storage.bucket)) {
        return reply("We couldn’t create a safe upload. Please try again shortly.", 503)
      }
      const upload = await storage.createUpload({ key: version.storageKey, contentType: version.contentType })
      if (upload.expiresSeconds > UPLOAD_EXPIRES_SECONDS) return reply("We couldn’t create a safe upload. Please try again shortly.", 503)
      return reply("Upload the file directly using the provided fields.", 200, {
        versionId: version.versionId,
        maxBytes: MAX_EVIDENCE_BYTES,
        upload: { url: upload.url, fields: upload.fields, expiresSeconds: upload.expiresSeconds },
      })
    }
    const version = await backend().rpc<CustomerUploadVersion | null>("customer_evidence_upload_version_v1", {
      p_token_hash: tokenHash(token), p_version: args.versionId,
    })
    if (!version || version.submissionSource !== "CUSTOMER" || !usesConfiguredEvidenceBucket(version, storage.bucket)) {
      return reply(ACTION_UNAVAILABLE)
    }
    if (version.uploadStatus !== "PENDING_UPLOAD" && version.uploadStatus !== "UPLOADED") {
      return reply("That upload cannot be completed.", 409)
    }
    const probe = await storage.probeObject(version.storageKey)
    if (!probe.exists) return reply("That upload cannot be completed.", 409)
    const finalized = await backend().rpc<{ status?: string; uploadStatus?: string; scanStatus?: string; validationStatus?: string }>("customer_evidence_finalize_v1", {
      p_token_hash: tokenHash(token), p_request: key, p_version: args.versionId,
    })
    if (finalized.status !== "success") {
      return reply(finalized.status === "conflict" ? "That upload cannot be completed." : ACTION_UNAVAILABLE, finalized.status === "conflict" ? 409 : 401)
    }
    return reply("Uploaded — awaiting security review", 200, {
      versionId: version.versionId,
      uploadStatus: finalized.uploadStatus || "UPLOADED",
      scanStatus: finalized.scanStatus || "PENDING",
      validationStatus: finalized.validationStatus || "PENDING",
    })
  } catch {
    return reply(ACTION_UNAVAILABLE)
  }
}