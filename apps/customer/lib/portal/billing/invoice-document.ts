import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { BillingDocumentError } from "../../../../../lib/billing/document"
import { documentFromInvoice } from "./present"
import { parseInvoiceDocument } from "./parse"
import { billingPdfResponse } from "./pdf-response"

const UNAVAILABLE = "This invoice is no longer available."
const RETRY = "This invoice can't be downloaded right now. Please try again shortly."
const PAUSED = "Collection of this success fee is paused while the outcome is disputed. This payment request is withheld. The invoice has not been cancelled."
const SELECTOR = /^ca-[a-f0-9]{64}$/

function textReply(message: string, http: number) {
  return new NextResponse(message, {
    status: http,
    headers: { ...privateResponseHeaders, "content-type": "text/plain; charset=utf-8" },
  })
}

export async function portalInvoiceDocument(request: NextRequest) {
  const config = customerBackendConfig()
  if (!portalAvailable() || !config || !customerRequestOriginAllowed(null, request.nextUrl.origin, false)) return textReply(UNAVAILABLE, 404)
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (!validToken(token)) return textReply("Sign in again to download this invoice.", 401)
  const params = request.nextUrl.searchParams
  const names = [...params.keys()]
  if (names.length !== 2 || !names.includes("reference") || !names.includes("selector")) return textReply(UNAVAILABLE, 404)
  const reference = params.get("reference") ?? ""
  const selector = params.get("selector") ?? ""
  if (!isPublicCaseReference(reference) || !SELECTOR.test(selector)) return textReply(UNAVAILABLE, 404)
  try {
    const resolved = await backend().rpc<unknown>("customer_portal_invoice_document_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
      p_selector: selector,
    })
    if (resolved == null) return textReply("Sign in again to download this invoice.", 401)
    const invoice = parseInvoiceDocument(resolved)
    if (invoice === "collection_paused") return textReply(PAUSED, 409)
    if (invoice === "not_found" || !invoice) return textReply(UNAVAILABLE, 404)
    const document = documentFromInvoice(invoice)
    if (!document) return textReply(UNAVAILABLE, 404)
    return billingPdfResponse(document, `invoice-${invoice.invoiceRef}.pdf`)
  } catch (error) {
    if (error instanceof BillingDocumentError) return textReply(UNAVAILABLE, 404)
    return textReply(RETRY, 503)
  }
}
