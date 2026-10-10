import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerConfig, sessionCookie, customerRequestOriginAllowed } from "@/lib/config"
import { isUuid } from "@/lib/uuid"
import { canDownloadItem, canViewItem, isDocxMime, type CustomerFileOperation, type CustomerPackVersion } from "./model"
import { createCustomerEvidenceStorage, isAllowedReadExpiry, signedUrlExpiresSeconds, type CustomerEvidenceStorage } from "./storage"

const reply = (extra: Record<string, unknown> = {}, http = 401) =>
  NextResponse.json({ message: ACTION_UNAVAILABLE, ...extra }, { status: http, headers: privateResponseHeaders })

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
  return customerRequestOriginAllowed(request.headers.get("origin"), request.nextUrl.origin)
}

export async function caseEvidenceAccess(request: NextRequest, storage: CustomerEvidenceStorage | null = createCustomerEvidenceStorage()) {
  const config = customerConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply()
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  const body = await readJson(request, 1024)
  if (!validToken(token) || !isUuid(key) || !body) return reply()
  const keys = Object.keys(body)
  if (keys.length !== 2 || !keys.includes("operation") || !keys.includes("versionId")) return reply()
  if (body.operation !== "view" && body.operation !== "download") return reply()
  if (typeof body.versionId !== "string" || !isUuid(body.versionId)) return reply()
  const operation = body.operation as CustomerFileOperation
  if (!storage) return reply({}, 503)
  try {
    const version = await backend().rpc<CustomerPackVersion | null>("customer_case_pack_version_v1", {
      p_token_hash: tokenHash(token), p_version: body.versionId,
    })
    if (!version || version.storageBucket !== storage.bucket || !version.storageKey) return reply()
    if (operation === "view" && (isDocxMime(version.contentType) || !canViewItem(version))) {
      return NextResponse.json({ message: "Preview not available for this file type." }, { status: 403, headers: privateResponseHeaders })
    }
    if (operation === "download" && !canDownloadItem(version)) return reply()
    const probe = await storage.probeObject(version.storageKey)
    if (!probe.exists || probe.scan !== "NO_THREATS_FOUND") return reply()
    const url = await storage.createReadUrl({
      key: version.storageKey,
      contentType: version.contentType,
      filename: version.originalFilename,
      disposition: operation === "view" ? "inline" : "attachment",
    })
    const expires = signedUrlExpiresSeconds(url)
    if (!isAllowedReadExpiry(expires)) return reply({}, 503)
    const audited = await backend().rpc<{ status?: string }>("customer_case_pack_access_v1", {
      p_token_hash: tokenHash(token), p_request: key, p_version: body.versionId, p_action: operation,
    })
    if (audited.status !== "success") return reply()
    return NextResponse.json({
      status: "ok",
      message: operation === "view" ? "Open the file in the new tab." : "Download the file.",
      url,
    }, { headers: privateResponseHeaders })
  } catch {
    return reply()
  }
}
