import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { eligibilityEnquiryMessage } from "../../../../../lib/commercial/eligibility-message"
import { renderPaymentRequest } from "../../../../../lib/email/payment-request"
import { confirmedReplyMailbox, validReplyMailbox } from "../../../../../lib/email/reply-mailbox"
import { isUuid } from "@/lib/uuid"

const SIGN_IN = "Sign in again to continue."
const MISSING = "We couldn't find that case."
const UNAVAILABLE = "This action is no longer available."
const QUOTE_UNAVAILABLE = "This quote is no longer available to accept."
const STALE = "This page is out of date. Refresh it and try again."
const CONFIRM = "Confirm this step before continuing."
const RETRY = "We couldn't complete that step. Please try again shortly."
const NOT_READY = "Service details are not available right now. Refresh the page and try again."

const SELECTOR = /^ca-[a-f0-9]{64}$/
const OPERATIONS = ["accept_quote", "decline_quote", "accept_agreement", "decline_agreement", "revoke_authorization"] as const

type Operation = (typeof OPERATIONS)[number]

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
  return customerRequestOriginAllowed(request.headers.get("origin"), request.nextUrl.origin)
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  return Object.keys(body).length === allowed.length && allowed.every(key => Object.hasOwn(body, key))
}

function confirmationFor(operation: Operation, value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (operation === "accept_agreement") {
    if (keys.length !== 1 || keys[0] !== "accepted" || value.accepted !== true) return null
    return { accepted: true }
  }
  if (operation === "accept_quote") return quoteConfirmation(value)
  if (keys.length !== 1 || keys[0] !== "confirmed" || value.confirmed !== true) return null
  return { confirmed: true }
}

function quoteConfirmation(value: Record<string, unknown>): Record<string, unknown> | null {
  if (value.accepted !== true) return null
  const keys = Object.keys(value)
  if (keys.length === 1) return { accepted: true }
  const allowed = ["accepted", "businessPurpose", "terms", "feeBasis"]
  if (!allowed.every(key => Object.hasOwn(value, key)) || keys.some(key => !allowed.includes(key))) return null
  if (!isRecord(value.businessPurpose) || value.businessPurpose.accepted !== true || Object.keys(value.businessPurpose).length !== 1) return null
  if (!isRecord(value.terms) || value.terms.accepted !== true || typeof value.terms.version !== "string" || typeof value.terms.hash !== "string") return null
  if (Object.keys(value.terms).some(key => !["accepted", "version", "hash"].includes(key))) return null
  if (value.feeBasis !== null && !isRecord(value.feeBasis)) return null
  return {
    accepted: true,
    businessPurpose: { accepted: true },
    terms: { accepted: true, version: value.terms.version, hash: value.terms.hash },
    feeBasis: value.feeBasis,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function paymentRequestId(acceptanceKey: string): string {
  const hash = createHash("sha1").update(`guided-payment-request:${acceptanceKey}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const id = hash.subarray(0, 16).toString("hex")
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`
}

function automaticPaymentMail(): { origin: string; from: string; replyTo: string | null } | null {
  if (process.env.COMMUNICATIONS_SEND_ENABLED !== "true") return null
  if (process.env.VERCEL_ENV === "production" && process.env.JOB_WORKER_ENABLED !== "true") return null
  const from = validReplyMailbox(process.env.COMMUNICATIONS_FROM_EMAIL)
  const origin = (process.env.CUSTOMER_ORIGIN ?? "").trim().replace(/\/$/, "")
  if (!from || !/^https:\/\/[A-Za-z0-9.-]+$/.test(origin)) return null
  return { origin, from, replyTo: confirmedReplyMailbox() }
}

/** Queues one portal payment email after Guided acceptance. Failure leaves acceptance intact. */
async function queueAcceptedGuidedPayment(token: string, acceptanceKey: string, result: Record<string, unknown>) {
  const mail = automaticPaymentMail()
  const snapshot = isRecord(result.snapshot) ? result.snapshot : null
  const quotation = snapshot && isRecord(snapshot.quotationSnapshot) ? snapshot.quotationSnapshot : null
  const serviceCode = typeof snapshot?.serviceCode === "string" ? snapshot.serviceCode : ""
  const paymentModel = typeof snapshot?.paymentModel === "string" ? snapshot.paymentModel : ""
  if (!mail || (serviceCode !== "GUIDED_RELAUNCH" && serviceCode !== "GUIDED_REVIEW") || paymentModel !== "UPFRONT") return
  if (typeof result.orderId !== "string" || typeof result.orderRef !== "string") return
  if (typeof snapshot?.amountMinor !== "number" || typeof snapshot.currency !== "string") return
  if (typeof quotation?.serviceName !== "string" || typeof quotation.caseReference !== "string") return
  const rendered = renderPaymentRequest({
    serviceCode,
    serviceName: quotation.serviceName,
    orderRef: result.orderRef,
    caseRef: quotation.caseReference,
    amountMinor: snapshot.amountMinor,
    currency: snapshot.currency,
    origin: mail.origin,
    replyTo: mail.replyTo,
  })
  if (!rendered) return
  await backend().rpc("customer_queue_guided_payment_request_v1", {
    p_token_hash: tokenHash(token),
    p_request: paymentRequestId(acceptanceKey),
    p_payload: {
      serviceOrderId: result.orderId,
      customerOrigin: mail.origin,
      subject: rendered.subject,
      bodyText: rendered.text,
      bodyHtml: rendered.html,
      fromAddress: mail.from,
      replyTo: mail.replyTo,
      sendEnabled: true,
    },
  })
}

export async function portalServiceCommand(request: NextRequest) {
  if (!portalAvailable()) return reply(NOT_READY, 404)
  if (!originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply(NOT_READY)
  }
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request, 4096)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  if (!onlyKeys(body, ["reference", "selector", "operation", "confirmation"])) return reply(NOT_READY)
  if (typeof body.reference !== "string" || !isPublicCaseReference(body.reference)) return reply(MISSING, 404)
  if (typeof body.selector !== "string" || !SELECTOR.test(body.selector)) return reply(UNAVAILABLE)
  if (typeof body.operation !== "string" || !(OPERATIONS as readonly string[]).includes(body.operation)) return reply(NOT_READY)
  const operation = body.operation as Operation
  const confirmation = confirmationFor(operation, body.confirmation)
  if (!confirmation) return reply(CONFIRM, 400)

  try {
    const result = await backend().rpc<unknown>("customer_portal_service_command_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_reference: body.reference,
      p_selector: body.selector,
      p_operation: operation,
      p_data: confirmation,
    })
    if (result == null) return reply(SIGN_IN)
    if (!isRecord(result) || typeof result.status !== "string") return reply(RETRY, 503)
    if (result.status === "success") {
      if (operation === "accept_quote") {
        try { await queueAcceptedGuidedPayment(token, key, result) } catch { /* Acceptance stands. Step 7 can queue the email once. */ }
      }
      return NextResponse.json({ status: "success" }, { headers: privateResponseHeaders })
    }
    if (result.status === "not_found") return reply(MISSING, 404)
    if (result.status === "invalid") return reply(CONFIRM, 400)
    if (result.status === "eligibility_blocked") return reply(eligibilityEnquiryMessage, 403)
    if (result.status === "conflict") return reply(STALE, 409)
    if (result.status === "denied" && operation === "accept_quote") return reply(QUOTE_UNAVAILABLE)
    if (result.status === "unavailable" || result.status === "denied") return reply(UNAVAILABLE)
    return reply(RETRY, 503)
  } catch {
    return reply(RETRY, 503)
  }
}
