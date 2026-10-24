import "server-only"
import { NextResponse } from "next/server"
import { backend, tokenHash } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { devAdminOutgoingMailLane, devCustomerPortalOrigin } from "../communications/dev-lane"
import { settleDevSendEmailClaim, type DevSendClaim } from "../communications/dev-send"
import { communicationsSendEnabled, sendDisabledReason } from "../communications/gate"
import { deriveQuoteAcceptanceActionId, prepareQuoteAcceptanceLink, snapshotUploadUrl } from "../communications/link"
import { confirmedReplyMailbox } from "../communications/brand-email"
import { mailFromAddress, resolveMailProvider, type OutgoingMailProvider } from "../communications/mail"
import { renderQuotationOffer } from "../../../../lib/email/quotation-offer"
import type { QuoteListItem } from "./model"

const reply = (message: string, status = 200, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

const reasons: Record<string, { message: string; status: number }> = {
  open_action: {
    message: "A quotation acceptance link is already open. No second link was created and no second email was queued. Revoke that link before sending a replacement.",
    status: 403,
  },
  agreement_not_operative: {
    message: "This quotation is not bound to an operative service-specific agreement, so the email was not queued.",
    status: 403,
  },
  contact_unverified: {
    message: "The customer email is not verified, so the quotation email was not queued.",
    status: 403,
  },
  authority_unverified: {
    message: "Business authority is not verified, so the quotation email was not queued.",
    status: 403,
  },
  suppressed: {
    message: "That email address is suppressed, so the quotation email was not queued.",
    status: 403,
  },
  quote_not_offered: {
    message: "Only the current offered quotation can be emailed. This one was not queued.",
    status: 403,
  },
  quote_expired: {
    message: "This quotation has expired, so the email was not queued.",
    status: 403,
  },
  case_required: {
    message: "This quotation has no case or monitoring record the email system can attach to, so it was not queued.",
    status: 403,
  },
  recipient_mismatch: {
    message: "The recipient does not match the verified customer email, so the quotation email was not queued.",
    status: 403,
  },
  link_window: {
    message: "This quotation expires too soon to include a secure link that ends before the quotation and within seven days.",
    status: 400,
  },
  snapshot_mismatch: {
    message: "The quotation changed before the email was queued. Reload the page and try again.",
    status: 409,
  },
  case_closed: {
    message: "This case is closed, so the quotation email was not queued.",
    status: 403,
  },
  send_disabled: {
    message: "Outgoing customer email is not enabled, so the quotation email was not queued.",
    status: 403,
  },
}

type QueueResult = {
  status?: string
  reason?: string
  id?: string
  communicationId?: string
  actionId?: string
  lifecycle?: string
  deliveryStatus?: string
}

const queuedOnly = "The quotation email is queued. The email provider has not accepted it yet, and queued is not delivered."
const submitted = "The quotation email was submitted to the email provider. Accepted by the provider is not delivered."
const stillQueued = "The quotation email is queued. It was not submitted to the email provider. Queued is not delivered."

function devSendRequestId(queueKey: string): string {
  return deriveQuoteAcceptanceActionId(`dev-send:${queueKey}`)
}

async function submitDevelopmentQuotation(input: {
  token: string
  key: string
  communicationId: string
  provider?: OutgoingMailProvider
}): Promise<NextResponse> {
  const portal = devCustomerPortalOrigin()
  const queued = { id: input.communicationId, lifecycle: "QUEUED", deliveryStatus: "NONE" }
  if (!portal) return reply(`${stillQueued} The development customer portal is not configured.`, 503, queued)
  const provider = input.provider ?? resolveMailProvider()
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
    return reply("The quotation email is queued. Sign out and sign in again, then return to this step and process the pending quotation email within 30 minutes. The queued email was kept. Queued is not delivered.", 403, queued)
  }
  if (claimed.status !== "success" || !claimed.leaseToken) {
    return reply(stillQueued, claimed.status === "conflict" ? 409 : 503, queued)
  }
  const settled = await settleDevSendEmailClaim({ rpc: backend(), claim: claimed, provider })
  if (settled === "succeeded") return reply(submitted, 200, { ...queued, deliveryStatus: "PROVIDER_ACCEPTED" })
  return reply("The quotation email is queued. The email provider did not accept it, and it was not submitted again. Queued is not delivered.", settled === "retry" ? 503 : 409, queued)
}

export async function queueQuoteOfferEmail(input: {
  token: string
  key: string
  customerOrigin: string | null
  quoteId: string
  subject?: string
  introduction?: string
}, deps: { provider?: OutgoingMailProvider } = {}): Promise<NextResponse> {
  if (!communicationsSendEnabled()) return reply(sendDisabledReason(), 403)
  if (!input.customerOrigin) return reply("The customer site origin is not configured.", 503)
  const devLane = devAdminOutgoingMailLane()
  if (devLane && input.customerOrigin !== devCustomerPortalOrigin()) {
    return reply("The customer site origin must be the development customer portal.", 503)
  }
  const fromAddress = mailFromAddress()
  if (!fromAddress) return reply("The outbound sender address is not configured.", 503)
  const actionId = deriveQuoteAcceptanceActionId(input.key)
  const prepared = prepareQuoteAcceptanceLink(actionId)
  const actionUrl = snapshotUploadUrl(input.customerOrigin, actionId)
  if (!prepared || !actionUrl) return reply("The secure acceptance link secret is not configured.", 503)
  let detail: (QuoteListItem & { status?: string }) | null
  try {
    detail = await backend().rpc<(QuoteListItem & { status?: string }) | null>("admin_quote_detail_v1", {
      p_token: tokenHash(input.token),
      p_quote: input.quoteId,
    })
  } catch {
    return reply("We couldn’t confirm the quotation email. Reload the page before trying again.", 503)
  }
  if (detail == null) return reply("Your session has ended. Please sign in again.", 401)
  if (detail.status === "conflict" || !detail.currentVersion) return reply("This quotation has changed. Reload it before continuing.", 409)
  if (detail.status !== "OFFERED" || detail.currentVersion.status !== "OFFERED") {
    return reply(reasons.quote_not_offered.message, reasons.quote_not_offered.status)
  }
  const rendered = renderQuotationOffer({
    publicRef: detail.publicRef,
    caseRef: detail.caseReference,
    serviceName: detail.currentVersion.serviceName,
    amountMinor: detail.currentVersion.totalAmountMinor,
    currency: detail.currentVersion.currency,
    paymentModel: detail.currentVersion.paymentModel,
    taxBehaviour: detail.currentVersion.taxBehaviour,
    scope: detail.currentVersion.scope,
    exclusions: detail.currentVersion.exclusions,
    validUntil: detail.currentVersion.validUntil,
    actionUrl,
    replyTo: confirmedReplyMailbox(),
    subject: input.subject,
    introduction: input.introduction,
  })
  if (!rendered) return reply("Check the quotation email wording before sending.", 400)
  if (rendered.text.includes(prepared.token) || rendered.html.includes(prepared.token) || rendered.text.includes("#t=")) {
    return reply("The quotation email could not be prepared.", 500)
  }
  let result: QueueResult | null
  try {
    result = await backend().rpc<QueueResult>("admin_queue_quote_offer_email_v1", {
      p_token: tokenHash(input.token),
      p_request: input.key,
      p_payload: {
        quoteId: input.quoteId,
        actionId,
        secretHash: prepared.tokenHash,
        linkKeyVersion: prepared.version,
        customerOrigin: input.customerOrigin,
        subject: rendered.subject,
        bodyText: rendered.text,
        bodyHtml: rendered.html,
        fromAddress,
        replyTo: confirmedReplyMailbox(),
        sendEnabled: true,
        devLane,
      },
    })
  } catch {
    return reply("We couldn’t confirm the quotation email. Reload the page before trying again.", 503)
  }
  if (result?.status === "success" && result.id && devLane) {
    return submitDevelopmentQuotation({
      token: input.token,
      key: input.key,
      communicationId: result.id,
      provider: deps.provider,
    })
  }
  if (result?.status === "success") {
    return reply(queuedOnly, 200, { id: result.id, lifecycle: result.lifecycle ?? "QUEUED", deliveryStatus: result.deliveryStatus ?? "NONE" })
  }
  if (result?.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
  if (result?.status === "conflict") return reply("This quotation has changed. Reload it before continuing.", 409)
  if (result?.reason === "open_action") {
    const existing: Record<string, unknown> = {}
    if (result.communicationId) existing.id = result.communicationId
    if (result.lifecycle) existing.lifecycle = result.lifecycle
    if (result.deliveryStatus) existing.deliveryStatus = result.deliveryStatus
    return reply(reasons.open_action.message, reasons.open_action.status, existing)
  }
  const known = result?.reason ? reasons[result.reason] : undefined
  if (known) return reply(known.message, known.status)
  if (result?.status === "denied") return reply("That quotation email cannot be queued.", 403)
  if (result?.status === "invalid") return reply("Check the quotation email wording before sending.", 400)
  return reply("We couldn’t confirm the quotation email. Reload the page before trying again.", 503)
}
