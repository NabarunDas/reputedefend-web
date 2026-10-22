import "server-only"
import { NextResponse } from "next/server"
import { backend, tokenHash } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { devAdminOutgoingMailLane, devCustomerPortalOrigin } from "../communications/dev-lane"
import { communicationsSendEnabled, sendDisabledReason } from "../communications/gate"
import { deriveQuoteAcceptanceActionId, prepareQuoteAcceptanceLink, snapshotUploadUrl } from "../communications/link"
import { confirmedReplyMailbox } from "../communications/brand-email"
import { mailFromAddress } from "../communications/mail"
import { preservedAcceptedQuoteRef, renderQuotationOffer } from "../../../../lib/email/quotation-offer"
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
  preserved_quote: {
    message: "This accepted test quotation is preserved. No quotation email was queued.",
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
  dev_recipient: {
    message: "Development email can only be queued to an example.com test mailbox.",
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
  lifecycle?: string
  deliveryStatus?: string
}

export async function queueQuoteOfferEmail(input: {
  token: string
  key: string
  customerOrigin: string | null
  quoteId: string
  subject?: string
  introduction?: string
}): Promise<NextResponse> {
  if (!communicationsSendEnabled()) return reply(sendDisabledReason(), 403)
  if (!input.customerOrigin) return reply("The customer site origin is not configured.", 503)
  if (devAdminOutgoingMailLane() && input.customerOrigin !== devCustomerPortalOrigin()) {
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
  if (detail.status === "conflict" || !detail.currentVersion) return reply("That commercial record changed. Reload the page and try again.", 409)
  if (detail.publicRef === preservedAcceptedQuoteRef) return reply(reasons.preserved_quote.message, reasons.preserved_quote.status)
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
        devLane: devAdminOutgoingMailLane(),
      },
    })
  } catch {
    return reply("We couldn’t confirm the quotation email. Reload the page before trying again.", 503)
  }
  if (result?.status === "success") {
    return reply(
      "The quotation email is queued. The email provider has not accepted it yet, and queued is not delivered.",
      200,
      { id: result.id, lifecycle: result.lifecycle ?? "QUEUED", deliveryStatus: result.deliveryStatus ?? "NONE" },
    )
  }
  if (result?.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
  if (result?.status === "conflict") return reply("That commercial record changed. Reload the page and try again.", 409)
  const known = result?.reason ? reasons[result.reason] : undefined
  if (known) return reply(known.message, known.status)
  if (result?.status === "denied") return reply("That quotation email cannot be queued.", 403)
  if (result?.status === "invalid") return reply("Check the quotation email wording before sending.", 400)
  return reply("We couldn’t confirm the quotation email. Reload the page before trying again.", 503)
}
