import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"

const UNAVAILABLE = "The hosted invoice link is not available yet."
const MISSING = "This invoice is no longer available."
const RETRY = "This invoice can't be opened right now. Please try again shortly."
const SELECTOR = /^ca-[a-f0-9]{64}$/

function textReply(message: string, http: number) {
  return new NextResponse(message, {
    status: http,
    headers: { ...privateResponseHeaders, "content-type": "text/plain; charset=utf-8" },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export async function portalInvoiceOpen(request: NextRequest) {
  const config = customerBackendConfig()
  if (!portalAvailable() || !config || !customerRequestOriginAllowed(null, request.nextUrl.origin, false)) return textReply(MISSING, 404)
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (!validToken(token)) return textReply("Sign in again to open this invoice.", 401)
  const params = request.nextUrl.searchParams
  const names = [...params.keys()]
  if (names.length !== 2 || !names.includes("reference") || !names.includes("selector")) return textReply(MISSING, 404)
  const reference = params.get("reference") ?? ""
  const selector = params.get("selector") ?? ""
  if (!isPublicCaseReference(reference) || !SELECTOR.test(selector)) return textReply(MISSING, 404)
  try {
    const resolved = await backend().rpc<unknown>("customer_portal_invoice_target_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
      p_selector: selector,
    })
    if (resolved == null) return textReply("Sign in again to open this invoice.", 401)
    if (!isRecord(resolved) || typeof resolved.status !== "string") return textReply(RETRY, 503)
    if (resolved.status === "unavailable") return textReply(UNAVAILABLE, 404)
    if (resolved.status !== "redirect" || typeof resolved.hostedInvoiceUrl !== "string") return textReply(MISSING, 404)
    const target = resolved.hostedInvoiceUrl
    if (!target.startsWith("https://") || /\s/.test(target) || target.length > 2000) return textReply(UNAVAILABLE, 404)
    return NextResponse.redirect(target, { headers: privateResponseHeaders })
  } catch {
    return textReply(RETRY, 503)
  }
}
