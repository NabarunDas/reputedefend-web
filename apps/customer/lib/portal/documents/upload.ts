import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig } from "@/lib/config"
import { isOpaqueEvidenceKey, MAX_EVIDENCE_BYTES, UPLOAD_EXPIRES_SECONDS, usesConfiguredEvidenceBucket } from "@/lib/case/model"
import { createCustomerEvidenceStorage, type CustomerEvidenceStorage } from "@/lib/case/storage"
import { declaredUpload } from "@/lib/case/validation"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { isUuid } from "@/lib/uuid"

const SIGN_IN = "Sign in again to upload evidence."
const CHECK_FILE = "Check the file type and size. Use a PDF, JPEG, PNG, WebP or DOCX up to 10 MB."
const UNAVAILABLE = "We couldn't upload that file. Refresh the page and try again."
const RETRY = "We couldn't upload that file. Please try again shortly."
const RECEIVED = "We've received your file. It still needs to be checked."
const NOT_ARRIVED = "The file did not arrive. Choose it again and try the upload once more."
const ALREADY = "This request already has a file, so another upload can't be started."

const REQUEST_SELECTOR = /^er-[1-9][0-9]{0,3}$/

const reply = (message: string, http = 401) =>
  NextResponse.json({ message }, { status: http, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit: number) {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = ""
  let size = 0
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
  const config = customerBackendConfig()
  return !!config && request.headers.get("origin") === config.origin && request.nextUrl.origin === config.origin
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  return Object.keys(body).length === allowed.length && allowed.every(key => Object.hasOwn(body, key))
}

function referenceAndSelector(body: Record<string, unknown>) {
  if (typeof body.reference !== "string" || !isPublicCaseReference(body.reference)) return null
  if (typeof body.selector !== "string" || !REQUEST_SELECTOR.test(body.selector)) return null
  return { reference: body.reference, selector: body.selector }
}

type BeginPayload = {
  status?: string
  storageKey?: string
  storageBucket?: string
  contentType?: string
  maxBytes?: number
}

type TargetPayload = {
  found?: boolean
  available?: boolean
  filename?: string
  storageBucket?: string
  storageKey?: string
  contentType?: string
  uploadStatus?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export async function portalEvidenceUpload(
  request: NextRequest,
  storage: CustomerEvidenceStorage | null = createCustomerEvidenceStorage(),
) {
  if (!portalAvailable()) return reply(UNAVAILABLE, 404)
  if (!originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply(UNAVAILABLE)
  }
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request, 4096)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  if (body.operation !== "begin" && body.operation !== "finalize") return reply(UNAVAILABLE)
  const identity = referenceAndSelector(body)
  if (!identity) return reply(UNAVAILABLE)
  if (!storage) return reply(RETRY, 503)

  try {
    if (body.operation === "begin") {
      if (!onlyKeys(body, ["operation", "reference", "selector", "filename", "contentType", "size"])) return reply(UNAVAILABLE)
      if (typeof body.filename !== "string" || typeof body.contentType !== "string" || typeof body.size !== "number") {
        return reply(CHECK_FILE, 400)
      }
      const file = declaredUpload(body.filename, body.contentType, body.size)
      if (!file) return reply(CHECK_FILE, 400)
      const begun = await backend().rpc<unknown>("customer_portal_evidence_begin_v1", {
        p_token_hash: tokenHash(token),
        p_request: key,
        p_reference: identity.reference,
        p_selector: identity.selector,
        p_filename: file.filename,
        p_content_type: file.contentType,
        p_size: file.size,
        p_bucket: storage.bucket,
      })
      if (begun == null) return reply(SIGN_IN)
      if (!isRecord(begun)) return reply(UNAVAILABLE)
      const payload = begun as BeginPayload
      if (payload.status === "invalid") return reply(CHECK_FILE, 400)
      if (payload.status === "conflict") return reply(ALREADY, 409)
      if (payload.status !== "success" || !payload.storageKey || payload.contentType !== file.contentType) {
        return reply(UNAVAILABLE)
      }
      if (payload.maxBytes !== MAX_EVIDENCE_BYTES || payload.storageBucket !== storage.bucket) return reply(RETRY, 503)
      if (!isOpaqueEvidenceKey(payload.storageKey, file.filename) || !usesConfiguredEvidenceBucket({ storageBucket: payload.storageBucket }, storage.bucket)) {
        return reply(RETRY, 503)
      }
      const upload = await storage.createUpload({ key: payload.storageKey, contentType: payload.contentType })
      if (upload.expiresSeconds > UPLOAD_EXPIRES_SECONDS) return reply(RETRY, 503)
      return NextResponse.json({
        message: "Upload the file directly using the provided fields.",
        maxBytes: MAX_EVIDENCE_BYTES,
        upload: { url: upload.url, fields: upload.fields, expiresSeconds: upload.expiresSeconds },
      }, { headers: privateResponseHeaders })
    }

    if (!onlyKeys(body, ["operation", "reference", "selector"])) return reply(UNAVAILABLE)
    const target = await backend().rpc<unknown>("customer_portal_evidence_target_v1", {
      p_token_hash: tokenHash(token),
      p_reference: identity.reference,
      p_selector: identity.selector,
    })
    if (target == null) return reply(SIGN_IN)
    if (!isRecord(target)) return reply(UNAVAILABLE)
    const version = target as TargetPayload
    if (!version.found || !version.available || !version.storageKey || !version.storageBucket || !version.contentType || !version.filename) {
      return reply(UNAVAILABLE)
    }
    if (version.uploadStatus !== "PENDING_UPLOAD" && version.uploadStatus !== "UPLOADED") return reply(ALREADY, 409)
    if (!usesConfiguredEvidenceBucket({ storageBucket: version.storageBucket }, storage.bucket)) return reply(RETRY, 503)
    if (!isOpaqueEvidenceKey(version.storageKey, version.filename)) return reply(RETRY, 503)
    const probe = await storage.probeObject(version.storageKey)
    if (!probe.exists) return reply(NOT_ARRIVED, 409)
    const finalized = await backend().rpc<{ status?: string } | null>("customer_portal_evidence_finalize_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_reference: identity.reference,
      p_selector: identity.selector,
    })
    if (finalized == null) return reply(SIGN_IN)
    if (finalized.status === "conflict") return reply(ALREADY, 409)
    if (finalized.status !== "success") return reply(UNAVAILABLE)
    return NextResponse.json({ message: RECEIVED }, { headers: privateResponseHeaders })
  } catch {
    return reply(UNAVAILABLE)
  }
}
