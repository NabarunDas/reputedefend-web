import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { BillingDocumentError } from "../../../../../lib/billing/document"
import { documentFromQuotation } from "./present"
import { parseQuotationDocument } from "./parse"
import { billingPdfResponse } from "./pdf-response"

const UNAVAILABLE = "This quotation is no longer available."
const RETRY = "This quotation can't be downloaded right now. Please try again shortly."

function textReply(message: string, http: number) {
  return new NextResponse(message, {
    status: http,
    headers: { ...privateResponseHeaders, "content-type": "text/plain; charset=utf-8" },
  })
}

export async function portalQuotationDocument(request: NextRequest) {
  const config = customerBackendConfig()
  if (!portalAvailable() || !config || !customerRequestOriginAllowed(null, request.nextUrl.origin, false)) return textReply(UNAVAILABLE, 404)
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (!validToken(token)) return textReply("Sign in again to download this quotation.", 401)
  const params = request.nextUrl.searchParams
  const names = [...params.keys()]
  if (names.length !== 1 || names[0] !== "reference") return textReply(UNAVAILABLE, 404)
  const reference = params.get("reference") ?? ""
  if (!isPublicCaseReference(reference)) return textReply(UNAVAILABLE, 404)
  try {
    const resolved = await backend().rpc<unknown>("customer_portal_quotation_document_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
    })
    if (resolved == null) return textReply("Sign in again to download this quotation.", 401)
    const quote = parseQuotationDocument(resolved)
    if (quote === "not_found" || !quote) return textReply(UNAVAILABLE, 404)
    return billingPdfResponse(documentFromQuotation(quote), `quotation-${quote.quoteRef}.pdf`)
  } catch (error) {
    if (error instanceof BillingDocumentError) return textReply(UNAVAILABLE, 404)
    return textReply(RETRY, 503)
  }
}
