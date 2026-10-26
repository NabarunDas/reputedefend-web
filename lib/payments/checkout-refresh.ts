import type { ExpiredCheckout, RetrievedCheckout } from "./model"

/**
 * Decides whether an owned, server-loaded Checkout Session may be expired.
 * The browser never supplies the session id. A paid, processing, or
 * live-lane session is left untouched.
 */
export type CheckoutRefreshAttempt = {
  providerOperationId: string
  customerId: string
  serviceOrderId: string
  obligationId: string
  amountMinor: number
  currency: string
  mode: string
}

export type CheckoutRefreshDecision = "expire" | "replace_expired" | "confirming" | "reject"

const SETTLED_INTENT = new Set(["processing", "succeeded", "requires_capture", "requires_action"])

function same(left: string | undefined, right: string): boolean {
  return typeof left === "string" && left === right
}

export function decideCheckoutRefresh(input: {
  attempt: CheckoutRefreshAttempt
  session: RetrievedCheckout | null
  paymentIntentStatus?: string | null
  expectedLivemode: boolean
}): CheckoutRefreshDecision {
  const { attempt, session } = input
  if (!session) return "reject"
  if (session.livemode !== input.expectedLivemode) return "reject"
  if (session.mode !== "payment" || attempt.mode !== "payment") return "reject"
  if (!same(session.metadata.customerId, attempt.customerId)) return "reject"
  if (!same(session.metadata.serviceOrderId, attempt.serviceOrderId)) return "reject"
  if (!same(session.metadata.obligationId, attempt.obligationId)) return "reject"
  if (session.metadata.providerOperationId && session.metadata.providerOperationId !== attempt.providerOperationId) return "reject"
  if (session.amountMinor !== attempt.amountMinor) return "reject"
  if ((session.currency || "").toLowerCase() !== attempt.currency.toLowerCase()) return "reject"
  const intent = input.paymentIntentStatus || ""
  if (SETTLED_INTENT.has(intent)) return "confirming"
  if (session.status === "complete" || session.paymentStatus === "paid" || session.paymentStatus === "processing") return "confirming"
  if (session.status === "expired" && session.paymentStatus === "unpaid") return "replace_expired"
  if (session.status === "open" && session.paymentStatus === "unpaid") return "expire"
  return "reject"
}

export function expireConfirmed(result: ExpiredCheckout | null | undefined): boolean {
  return result?.status === "expired"
}
