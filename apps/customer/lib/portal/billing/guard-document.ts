import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { documentFromGuard } from "./present"
import { parseGuardDocument } from "./parse"
import { billingPdfResponse } from "./pdf-response"

const UNAVAILABLE = "This billing document is no longer available."
const RETRY = "This billing document can't be downloaded right now. Please try again shortly."
const SELECTOR = /^(rg|cn|sc)-[a-f0-9]{64}$/

function textReply(message: string, http: number) {
  return new NextResponse(message, {
    status: http,
    headers: { ...privateResponseHeaders, "content-type": "text/plain; charset=utf-8" },
  })
}

export async function portalGuardDocument(request: NextRequest) {
  const config = customerBackendConfig()
  if (!portalAvailable() || !config || !customerRequestOriginAllowed(null, request.nextUrl.origin, false)) return textReply(UNAVAILABLE, 404)
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (!validToken(token)) return textReply("Sign in again to download this document.", 401)
  const params = request.nextUrl.searchParams
  const names = [...params.keys()]
  if (names.length !== 1 || names[0] !== "selector") return textReply(UNAVAILABLE, 404)
  const selector = params.get("selector") ?? ""
  if (!SELECTOR.test(selector)) return textReply(UNAVAILABLE, 404)
  try {
    const resolved = await backend().rpc<unknown>("customer_portal_guard_document_v1", {
      p_token_hash: tokenHash(token),
      p_selector: selector,
    })
    if (resolved == null) return textReply("Sign in again to download this document.", 401)
    const row = parseGuardDocument(resolved)
    if (row === "not_found" || !row) return textReply(UNAVAILABLE, 404)
    const document = documentFromGuard(row)
    if (!document) return textReply(UNAVAILABLE, 404)
    const prefix = row.kind === "credit_note" ? "credit-note" : "receipt"
    return billingPdfResponse(document, `${prefix}-${row.reference}.pdf`)
  } catch {
    return textReply(RETRY, 503)
  }
}
