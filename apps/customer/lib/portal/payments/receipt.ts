import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { moneyLabel, paidOn, taxNote } from "./model"
import { parseReceiptDownload } from "./parse"

const UNAVAILABLE = "This receipt is no longer available."

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => (
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;"
  ))
}

function paidAtLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return paidOn(iso)
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
  return `${formatted} UK`
}

function renderReceiptDocument(receipt: {
  receiptRef: string
  reference: string
  orderRef: string
  serviceName: string
  amountMinor: number
  currency: string
  taxBehaviour: Parameters<typeof taxNote>[0]
  taxAmountMinor: number
  paidAt: string
  paymentStatus: string
  providerLabel: string
}): string {
  const amount = escapeHtml(moneyLabel(receipt.amountMinor, receipt.currency))
  const tax = receipt.taxAmountMinor > 0
    ? `<p>${escapeHtml(receipt.taxBehaviour === "EXCLUSIVE" ? "Recorded tax" : "Included in the total")}: ${escapeHtml(moneyLabel(receipt.taxAmountMinor, receipt.currency))}</p>`
    : ""
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt ${escapeHtml(receipt.receiptRef)}</title>
  <style>
    body { margin: 0; background: #f4f1ea; color: #1c1915; font: 16px/1.5 Georgia, "Times New Roman", serif; }
    main { max-width: 40rem; margin: 2rem auto; padding: 2rem; background: #fff; border: 1px solid #d9d1c3; }
    img { width: 11rem; height: auto; }
    h1 { font-size: 1.6rem; margin: 1.25rem 0 0.25rem; }
    .status { letter-spacing: 0.04em; text-transform: uppercase; font: 600 0.8rem/1.2 system-ui, sans-serif; color: #1f6b45; }
    .amount { font-size: 2rem; margin: 0.5rem 0 1rem; }
    dl { display: grid; grid-template-columns: 9rem 1fr; gap: 0.35rem 1rem; margin: 0; }
    dt { color: #5c564c; }
    dd { margin: 0; }
    p { margin: 1rem 0 0; }
    @media print { body { background: #fff; } main { margin: 0; border: 0; } .print-hint { display: none; } }
  </style>
</head>
<body>
  <main>
    <img src="/brand/profile-relaunch-logo.png" alt="ProfileRelaunch">
    <p class="status">${escapeHtml(receipt.paymentStatus)}</p>
    <h1>Receipt</h1>
    <p class="amount">${amount}</p>
    <dl>
      <dt>Receipt</dt><dd>${escapeHtml(receipt.receiptRef)}</dd>
      <dt>Service</dt><dd>${escapeHtml(receipt.serviceName)}</dd>
      <dt>Order</dt><dd>${escapeHtml(receipt.orderRef)}</dd>
      <dt>Case</dt><dd>${escapeHtml(receipt.reference)}</dd>
      <dt>Paid</dt><dd>${escapeHtml(paidAtLabel(receipt.paidAt))}</dd>
      <dt>Payment</dt><dd>${escapeHtml(receipt.providerLabel)}</dd>
    </dl>
    ${tax}
    <p>${escapeHtml(taxNote(receipt.taxBehaviour))}</p>
    <p>This is a receipt for the amount received. It is not a VAT invoice.</p>
    <p class="print-hint">To keep a PDF, use your browser print dialog and choose Save as PDF.</p>
  </main>
</body>
</html>`
}
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
    const body = renderReceiptDocument(receipt)
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...privateResponseHeaders,
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="receipt-${receipt.receiptRef}.html"`,
      },
    })
  } catch {
    return textReply(RETRY, 503)
  }
}
