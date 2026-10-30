import { createHash } from "node:crypto"
import { backend, tokenHash } from "@/lib/backend"
import { renderPaymentRequest } from "../../../../lib/email/payment-request"
import { confirmedReplyMailbox, validReplyMailbox } from "../../../../lib/email/reply-mailbox"

/**
 * Portal sessions and Secure Action sessions are different credentials.
 * The portal queue function holds dispatch for fifteen minutes so a payment
 * completed in that same portal visit can cancel the unsent email before the
 * provider is contacted. The action-session function does not set that hold:
 * quotation-email acceptance is not the portal payment visit, so the email is
 * eligible for immediate processing. Neither caller supplies the hold, the
 * actor, or a bearer link. A queue failure must not undo the acceptance.
 */
export type GuidedPaymentQueueRpc =
  | "customer_queue_guided_payment_request_v1"
  | "customer_action_queue_guided_payment_request_v1"

export function paymentRequestId(acceptanceKey: string): string {
  const hash = createHash("sha1").update(`guided-payment-request:${acceptanceKey}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const id = hash.subarray(0, 16).toString("hex")
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function automaticPaymentMail(): { origin: string; from: string; replyTo: string | null } | null {
  if (process.env.COMMUNICATIONS_SEND_ENABLED !== "true") return null
  // Production customer requests enqueue only when a worker is enabled on that
  // deployment. Other environments queue a durable outbox row for the shared
  // mail worker. A skipped queue leaves the accepted unpaid order for Admin Step 7.
  if (process.env.VERCEL_ENV === "production" && process.env.JOB_WORKER_ENABLED !== "true") return null
  const from = validReplyMailbox(process.env.COMMUNICATIONS_FROM_EMAIL)
  const origin = (process.env.CUSTOMER_ORIGIN ?? "").trim().replace(/\/$/, "")
  if (!from || !/^https:\/\/[A-Za-z0-9.-]+$/.test(origin)) return null
  return { origin, from, replyTo: confirmedReplyMailbox() }
}

/** Queues one payment email after Guided acceptance. Returns without throwing when the order is not a Guided upfront acceptance. */
export async function queueAcceptedGuidedPayment(input: {
  token: string
  acceptanceKey: string
  result: object
  rpc: GuidedPaymentQueueRpc
}): Promise<void> {
  const result = input.result as Record<string, unknown>
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
    businessName: typeof quotation.businessName === "string" ? quotation.businessName : null,
  })
  if (!rendered) return
  await backend().rpc(input.rpc, {
    p_token_hash: tokenHash(input.token),
    p_request: paymentRequestId(input.acceptanceKey),
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
