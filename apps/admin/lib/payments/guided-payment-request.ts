import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { devCaseJourneyPreviewEnabled } from "../case-journey/gate"
import { devAdminOutgoingMailLane, devCustomerPortalOrigin } from "../communications/dev-lane"
import { settleDevSendEmailClaim, type DevSendClaim } from "../communications/dev-send"
import { communicationsSendEnabled, sendDisabledReason } from "../communications/gate"
import { deriveQuoteAcceptanceActionId } from "../communications/link"
import { confirmedReplyMailbox } from "../communications/brand-email"
import { mailFromAddress, resolveMailProvider } from "../communications/mail"
import { renderPaymentRequest } from "../../../../lib/email/payment-request"
import type { ServiceOrder } from "../commerce/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"

const reply = (message: string, status = 200, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

const outstanding = "The payment stays outstanding until Stripe confirms settlement and a receipt is stored."
const queuedOnly = `The payment-request email is queued. The email provider has not accepted it yet, and queued is not delivered. ${outstanding}`
const submitted = `The payment-request email was submitted to the email provider. Accepted by the provider is not delivered. ${outstanding}`
const stillQueued = `The payment-request email is queued. It was not submitted to the email provider. Queued is not delivered. ${outstanding}`

const reasons: Record<string, { message: string; status: number }> = {
  success_fee: {
    message: "Managed services are not charged an upfront fee, so no payment-request email was queued.",
    status: 403,
  },
  guard_separate: {
    message: "Relaunch Guard is a separate subscription, so no upfront payment email was queued.",
    status: 403,
  },
  already_paid: {
    message: "This order is already paid, so no payment-request email was sent.",
    status: 403,
  },
  contact_unverified: {
    message: "The customer email is not verified, so the payment-request email was not queued.",
    status: 403,
  },
  authority_unverified: {
    message: "Business authority is not verified, so the payment-request email was not queued.",
    status: 403,
  },
  suppressed: {
    message: "That email address is suppressed, so the payment-request email was not queued.",
    status: 403,
  },
  recipient_mismatch: {
    message: "The recipient does not match the verified customer email, so the payment-request email was not queued.",
    status: 403,
  },
  duplicate_action: {
    message: "More than one payment action is open, so no email was queued and no further link was created.",
    status: 409,
  },
  snapshot_mismatch: {
    message: "The payment-request email wording was not accepted, so it was not queued. The quotation was not sent again.",
    status: 409,
  },
  case_closed: {
    message: "This case is closed, so the payment-request email was not queued.",
    status: 403,
  },
  mismatch: {
    message: "The accepted order does not match this payment, so no email was queued.",
    status: 409,
  },
  unmatched_payment: {
    message: "The payment obligation does not match the accepted order, so no email was queued.",
    status: 409,
  },
  stale_version: {
    message: "This order has changed. Reload it before continuing.",
    status: 409,
  },
  send_disabled: {
    message: "Outgoing customer email is not enabled, so the payment-request email was not queued.",
    status: 403,
  },
  invalid: {
    message: "The payment-request email could not be prepared.",
    status: 400,
  },
}

type QueueResult = {
  status?: string
  reason?: string
  id?: string
  lifecycle?: string
  deliveryStatus?: string
  replay?: boolean
  reusedAction?: boolean
}

function commandArgs(raw: unknown): { serviceOrderId: string; version: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  if (Object.keys(body).length !== 2 || !isUuid(body.serviceOrderId)) return null
  if (!Number.isSafeInteger(body.version) || (body.version as number) < 1) return null
  return { serviceOrderId: body.serviceOrderId, version: body.version as number }
}

function devSendRequestId(queueKey: string): string {
  return deriveQuoteAcceptanceActionId(`dev-send:payment:${queueKey}`)
}

async function submitDevelopmentPayment(input: {
  token: string
  key: string
  communicationId: string
}): Promise<NextResponse> {
  const portal = devCustomerPortalOrigin()
  const queued = { id: input.communicationId, lifecycle: "QUEUED", deliveryStatus: "NONE" }
  if (!portal) return reply(stillQueued, 503, queued)
  const provider = resolveMailProvider()
  if (provider === "disabled") return reply(`${stillQueued} Outgoing mail is not enabled.`, 403, queued)
  let claimed: DevSendClaim
  try {
    claimed = await backend().rpc<DevSendClaim>("admin_dev_send_email_claim_v1", {
      p_token: tokenHash(input.token),
      p_request: devSendRequestId(input.key),
      p_communication: input.communicationId,
      p_confirmed: true,
      p_customer_origin: portal,
    })
  } catch {
    return reply(stillQueued, 503, queued)
  }
  if (claimed.replay === true) {
    if (claimed.currentJobStatus === "SUCCEEDED" || claimed.reason === "already_processed") {
      return reply(submitted, 200, { ...queued, deliveryStatus: "PROVIDER_ACCEPTED" })
    }
    return reply(stillQueued, 409, queued)
  }
  if (claimed.status === "reauth_required") {
    return reply(`${ADMIN_RECENT_SIGN_IN_MESSAGE} The payment-request email stays queued. Queued is not delivered. ${outstanding}`, 403, queued)
  }
  if (claimed.status !== "success" || !claimed.leaseToken) {
    return reply(stillQueued, claimed.status === "conflict" ? 409 : 503, queued)
  }
  const settled = await settleDevSendEmailClaim({ rpc: backend(), claim: claimed, provider })
  if (settled === "succeeded") return reply(submitted, 200, { ...queued, deliveryStatus: "PROVIDER_ACCEPTED" })
  return reply(`The payment-request email is queued. The email provider did not accept it, and it was not submitted again. ${outstanding}`, settled === "retry" ? 503 : 409, queued)
}

function localRefusal(order: ServiceOrder): { message: string; status: number } | null {
  if (order.paymentModel === "SUCCESS_FEE" || order.serviceCode === "MANAGED_RELAUNCH" || order.serviceCode === "MANAGED_REVIEW") {
    return reasons.success_fee
  }
  if (order.serviceCode === "RELAUNCH_GUARD" || order.paymentModel === "RECURRING_MONTHLY") return reasons.guard_separate
  return null
}

/** Queues one Guided payment-request email. The server creates a payment action only when none is open. It does not return a bearer link. */
export async function queueGuidedPaymentRequest(request: NextRequest): Promise<NextResponse> {
  if (!devCaseJourneyPreviewEnabled()) return reply("Unavailable.", 404)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originError = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originError) return reply(originError, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  if (!communicationsSendEnabled()) return reply(sendDisabledReason(), 403)
  const customerOrigin = config.customerOrigin
  if (!customerOrigin) return reply("The customer site origin is not configured.", 503)
  const devLane = devAdminOutgoingMailLane()
  if (devLane && customerOrigin !== devCustomerPortalOrigin()) {
    return reply("The customer site origin must be the development customer portal.", 503)
  }
  const fromAddress = mailFromAddress()
  if (!fromAddress) return reply("The outbound sender address is not configured.", 503)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) {
        await reader.cancel()
        return reply("That request is too large.", 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw || "{}") } catch { return reply("Please check the form and try again.", 400) }
    const args = commandArgs(body)
    if (!args) return reply("Reload the page and try again.", 400)
    const order = await backend().rpc<(ServiceOrder & { status?: string }) | null>("admin_order_detail_v1", {
      p_token: tokenHash(token),
      p_order: args.serviceOrderId,
    })
    if (order == null) return reply("Your session has ended. Please sign in again.", 401)
    if (order.status === "conflict" || order.id !== args.serviceOrderId) return reply("This order has changed. Reload it before continuing.", 409)
    const refused = localRefusal(order)
    if (refused) return reply(refused.message, refused.status)
    const serviceName = order.serviceCode === "GUIDED_RELAUNCH" ? "Guided Relaunch" : order.serviceCode === "GUIDED_REVIEW" ? "Guided Review" : ""
    const rendered = renderPaymentRequest({
      serviceCode: order.serviceCode,
      serviceName,
      orderRef: order.publicRef,
      caseRef: order.caseReference ?? "",
      amountMinor: order.amountMinor,
      currency: order.currency,
      origin: customerOrigin,
      replyTo: confirmedReplyMailbox(),
      businessName: order.businessName,
    })
    if (!rendered) return reply("This order is not ready for a Guided payment email. No email was queued.", 409)
    const result = await backend().rpc<QueueResult>("admin_queue_guided_payment_request_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_payload: {
        serviceOrderId: args.serviceOrderId,
        version: args.version,
        customerOrigin,
        subject: rendered.subject,
        bodyText: rendered.text,
        bodyHtml: rendered.html,
        fromAddress,
        replyTo: confirmedReplyMailbox(),
        sendEnabled: true,
      },
    })
    if (result?.status === "success" && result.id && devLane) {
      return submitDevelopmentPayment({
        token,
        key,
        communicationId: result.id,
      })
    }
    if (result?.status === "success") {
      return reply(queuedOnly, 200, {
        id: result.id,
        lifecycle: result.lifecycle ?? "QUEUED",
        deliveryStatus: result.deliveryStatus ?? "NONE",
        reusedAction: result.reusedAction === true,
      })
    }
    if (result?.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (result?.status === "conflict" && result.reason !== "stale_version") return reply("This order has changed. Reload it before continuing.", 409)
    const known = result?.reason ? reasons[result.reason] : undefined
    if (known) return reply(known.message, known.status)
    if (result?.status === "denied") return reply("That payment-request email cannot be queued.", 403)
    if (result?.status === "invalid") return reply(reasons.invalid.message, reasons.invalid.status)
    return reply("We couldn’t confirm the payment-request email. Reload the page before trying again.", 503)
  } catch {
    return reply("We couldn’t confirm the payment-request email. Reload the page before trying again.", 503)
  }
}
