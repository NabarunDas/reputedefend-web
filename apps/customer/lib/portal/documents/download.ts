import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { canDownloadItem, isOpaqueEvidenceKey } from "@/lib/case/model"
import { createCustomerEvidenceStorage, isAllowedReadExpiry, signedUrlExpiresSeconds, type CustomerEvidenceStorage } from "@/lib/case/storage"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
const UNAVAILABLE = "This document is no longer available."
const RETRY = "This document can't be downloaded right now. Please try again shortly."
const DOCUMENT_SELECTOR = /^pd-[1-9][0-9]{0,3}$/

function textReply(message: string, http: number) {
  return new NextResponse(message, { status: http, headers: { ...privateResponseHeaders, "content-type": "text/plain; charset=utf-8" } })
}

type ResolvePayload = {
  found?: boolean
  available?: boolean
  filename?: string
  contentType?: string
  storageBucket?: string
  storageKey?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export async function portalDocumentDownload(
  request: NextRequest,
  storage: CustomerEvidenceStorage | null = createCustomerEvidenceStorage(),
) {
  const config = customerBackendConfig()
  if (!portalAvailable() || !config || !customerRequestOriginAllowed(null, request.nextUrl.origin, false)) return textReply(UNAVAILABLE, 404)
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (!validToken(token)) return textReply("Sign in again to download this document.", 401)
  const params = request.nextUrl.searchParams
  const names = [...params.keys()]
  if (names.length !== 2 || !names.includes("reference") || !names.includes("selector")) return textReply(UNAVAILABLE, 404)
  const reference = params.get("reference") ?? ""
  const selector = params.get("selector") ?? ""
  if (!isPublicCaseReference(reference) || !DOCUMENT_SELECTOR.test(selector)) return textReply(UNAVAILABLE, 404)
  if (!storage) return textReply(RETRY, 503)
  try {
    const resolved = await backend().rpc<unknown>("customer_portal_document_resolve_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
      p_selector: selector,
    })
    if (resolved == null) return textReply("Sign in again to download this document.", 401)
    if (!isRecord(resolved)) return textReply(RETRY, 503)
    const file = resolved as ResolvePayload
    if (!file.found) return textReply(UNAVAILABLE, 404)
    if (!file.available || !file.storageKey || !file.storageBucket || !file.filename || !file.contentType) {
      return textReply(UNAVAILABLE, 404)
    }
    if (file.storageBucket !== storage.bucket || !isOpaqueEvidenceKey(file.storageKey, file.filename) || !canDownloadItem({ contentType: file.contentType })) {
      return textReply(UNAVAILABLE, 404)
    }
    const probe = await storage.probeObject(file.storageKey)
    if (!probe.exists || probe.scan !== "NO_THREATS_FOUND") return textReply(UNAVAILABLE, 404)
    const url = await storage.createReadUrl({
      key: file.storageKey,
      contentType: file.contentType,
      filename: file.filename,
      disposition: "attachment",
    })
    if (!isAllowedReadExpiry(signedUrlExpiresSeconds(url))) return textReply(RETRY, 503)
    const audited = await backend().rpc<{ status?: string } | null>("customer_portal_document_access_v1", {
      p_token_hash: tokenHash(token),
      p_request: crypto.randomUUID(),
      p_reference: reference,
      p_selector: selector,
    })
    if (!audited || audited.status !== "success") return textReply(UNAVAILABLE, 404)
    return NextResponse.redirect(url, { headers: privateResponseHeaders })
  } catch {
    return textReply(RETRY, 503)
  }
}
