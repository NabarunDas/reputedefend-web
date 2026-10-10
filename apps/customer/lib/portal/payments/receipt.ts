import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { moneyLabel, paidOn, taxNote } from "./model"
import { parseReceiptDownload } from "./parse"

const UNAVAILABLE = "This receipt is no longer available."
const RETRY = "This receipt can't be downloaded right now. Please try again shortly."
const SELECTOR = /^rc-[a-f0-9]{64}$/

function textReply(message: string, http: number) {
  return new NextResponse(message, {
    status: http,
    headers: { ...privateResponseHeaders, "content-type": "text/plain; charset=utf-8" },
  })
}

export async function portalReceiptDownload(request: NextRequest) {
  const config = customerBackendConfig()
  if (!portalAvailable() || !config || !customerRequestOriginAllowed(null, request.nextUrl.origin, false)) return textReply(UNAVAILABLE, 404)
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (!validToken(token)) return textReply("Sign in again to download this receipt.", 401)
  const params = request.nextUrl.searchParams
  const names = [...params.keys()]
  if (names.length !== 1 || names[0] !== "selector") return textReply(UNAVAILABLE, 404)
  const selector = params.get("selector") ?? ""
  if (!SELECTOR.test(selector)) return textReply(UNAVAILABLE, 404)
  try {
    const resolved = await backend().rpc<unknown>("customer_portal_receipt_v1", {
      p_token_hash: tokenHash(token),
      p_selector: selector,
    })
    if (resolved == null) return textReply("Sign in again to download this receipt.", 401)
    const receipt = parseReceiptDownload(resolved)
    if (receipt === "not_found" || !receipt) return textReply(UNAVAILABLE, 404)
    const body = [
      "ProfileRelaunch receipt",
      `Case: ${receipt.reference}`,
      `Order: ${receipt.orderRef}`,
      `Amount: ${moneyLabel(receipt.amountMinor, receipt.currency)}`,
      `Currency: ${receipt.currency}`,
      `Tax: ${moneyLabel(receipt.taxAmountMinor, receipt.currency)}`,
      taxNote(receipt.taxBehaviour),
      paidOn(receipt.paidAt),
    ].join("\n")
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...privateResponseHeaders,
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="receipt-${receipt.orderRef}.txt"`,
      },
    })
  } catch {
    return textReply(RETRY, 503)
  }
}
