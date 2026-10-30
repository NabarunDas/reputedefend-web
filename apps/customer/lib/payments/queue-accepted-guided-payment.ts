import { createHash } from "node:crypto"
import { backend, tokenHash } from "@/lib/backend"
import { renderPaymentRequest } from "../../../../lib/email/payment-request"
import { customerDispatchLaneOpen, customerDispatchPreview, requestCentralDispatch } from "./central-dispatch"
import type { PaymentHandoverReason } from "./handover"

/**
 * Portal sessions and Secure Action sessions are different credentials.
 * Both queue one payment email with no dispatch hold. The sender, the reply
 * mailbox and the portal origin come from the quotation Admin already stored.
 * This module does not read mail-provider settings. A queue or send failure
 * does not undo the acceptance.
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

async function recordHandover(input: {
  token: string
  requestId: string
  serviceOrderId: string
  reason: PaymentHandoverReason
}) {
  console.error(JSON.stringify({ event: "guided_payment_handover", reason: input.reason }))
  try {
    await backend().rpc("customer_record_guided_payment_handover_v1", {
      p_token_hash: tokenHash(input.token),
      p_request: input.requestId,
      p_service_order: input.serviceOrderId,
      p_reason: input.reason,
    })
  } catch {
    console.error(JSON.stringify({ event: "guided_payment_handover", reason: "queue_unavailable" }))
  }
}

type MailIdentity = {
  status?: string
  customerOrigin?: string
  fromAddress?: string
  replyTo?: string
}

/** Queues one payment email after Guided acceptance. A queue or send failure does not undo the acceptance. */
export async function queueAcceptedGuidedPayment(input: {
  token: string
  acceptanceKey: string
  result: object
  rpc: GuidedPaymentQueueRpc
}): Promise<void> {
  const result = input.result as Record<string, unknown>
  const snapshot = isRecord(result.snapshot) ? result.snapshot : null
  const quotation = snapshot && isRecord(snapshot.quotationSnapshot) ? snapshot.quotationSnapshot : null
  const serviceCode = typeof snapshot?.serviceCode === "string" ? snapshot.serviceCode : ""
  const paymentModel = typeof snapshot?.paymentModel === "string" ? snapshot.paymentModel : ""
  const guided = (serviceCode === "GUIDED_RELAUNCH" || serviceCode === "GUIDED_REVIEW") && paymentModel === "UPFRONT"
  const orderId = typeof result.orderId === "string" ? result.orderId : ""
  if (!guided || !orderId || typeof result.orderRef !== "string") return
  if (typeof snapshot?.amountMinor !== "number" || typeof snapshot.currency !== "string") return
  if (typeof quotation?.serviceName !== "string" || typeof quotation.caseReference !== "string") return
  const requestId = paymentRequestId(input.acceptanceKey)
  let identity: MailIdentity | null = null
  try {
    identity = await backend().rpc<MailIdentity>("customer_guided_payment_mail_identity_v1", {
      p_token_hash: tokenHash(input.token),
      p_service_order: orderId,
    })
  } catch {
    await recordHandover({ token: input.token, requestId, serviceOrderId: orderId, reason: "queue_unavailable" })
    return
  }
  const rendered = identity?.status === "success"
    ? renderPaymentRequest({
      serviceCode,
      serviceName: quotation.serviceName,
      orderRef: result.orderRef,
      caseRef: quotation.caseReference,
      amountMinor: snapshot.amountMinor,
      currency: snapshot.currency,
      origin: identity.customerOrigin ?? "",
      replyTo: identity.replyTo,
      businessName: typeof quotation.businessName === "string" ? quotation.businessName : null,
    })
    : null
  if (!rendered) {
    await recordHandover({ token: input.token, requestId, serviceOrderId: orderId, reason: "queue_denied" })
    return
  }
  let queued: { status?: string; reason?: string } | null = null
  try {
    queued = await backend().rpc(input.rpc, {
      p_token_hash: tokenHash(input.token),
      p_request: requestId,
      p_payload: {
        serviceOrderId: orderId,
        subject: rendered.subject,
        bodyText: rendered.text,
        bodyHtml: rendered.html,
      },
    })
  } catch {
    await recordHandover({ token: input.token, requestId, serviceOrderId: orderId, reason: "queue_unavailable" })
    return
  }
  if (queued?.status === "success" && customerDispatchLaneOpen()) {
    const reason = await requestCentralDispatch({ requestId })
    await recordHandover({ token: input.token, requestId, serviceOrderId: orderId, reason })
    return
  }
  if (!queued || queued.status !== "success") {
    await recordHandover({ token: input.token, requestId, serviceOrderId: orderId, reason: "queue_denied" })
    return
  }
  if (input.rpc === "customer_action_queue_guided_payment_request_v1" && customerDispatchPreview()) {
    await recordHandover({ token: input.token, requestId, serviceOrderId: orderId, reason: "dispatch_not_configured" })
  }
}
