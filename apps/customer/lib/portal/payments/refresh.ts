import { NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend } from "@/lib/backend"
import { openCustomerCheckout } from "@/lib/action/payment"
import { declaredLivemodeArgument, guardExternalPayment } from "../../../../../lib/payments/lane-agreement"
import { paymentProvider, paymentProviderWithLane } from "../../../../../lib/payments"
import { decideCheckoutRefresh, expireConfirmed, type CheckoutRefreshAttempt } from "../../../../../lib/payments/checkout-refresh"
import { expectedLivemode } from "../../../../../lib/payments/config"
import { PaymentsDisabledError } from "../../../../../lib/payments/provider"

const CONFIRMING = "We're confirming your payment."
const NONE = "There isn't an open payment page to refresh."
const RETRY = "We couldn't close the old payment page. No payment has been taken. Please try again shortly."
const UNAVAILABLE = "This payment step is no longer available."

type Attempt = CheckoutRefreshAttempt & {
  status?: string
  idempotencyKey?: string
  attemptId?: string
  orderRef?: string
  checkoutSessionId?: string
  message?: string
}

function row(value: unknown): Attempt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Attempt
}

function checkoutResult(attempt: Attempt) {
  return {
    status: "success",
    providerOperationId: attempt.providerOperationId,
    idempotencyKey: attempt.idempotencyKey,
    attemptId: attempt.attemptId,
    amountMinor: attempt.amountMinor,
    mode: "payment",
    customerId: attempt.customerId,
    serviceOrderId: attempt.serviceOrderId,
    obligationId: attempt.obligationId,
    orderRef: attempt.orderRef,
    checkoutSessionId: attempt.checkoutSessionId,
  }
}

function json(message: string, http = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ message, ...extra }, { status: http, headers: privateResponseHeaders })
}

/**
 * Close one owned open Checkout Session, then open a new one for the same
 * accepted obligation. The session id is read from the customer's attempt.
 * Pay continues to reuse an open session; only this explicit action expires it.
 */
export async function refreshPortalCheckout(input: {
  origin: string
  tokenHash: string
  requestId: string
  reference: string
  selector: string
}): Promise<NextResponse> {
  const rpc = (name: string, args?: Record<string, unknown>) => backend().rpc(name, args ?? {})
  const lane = await guardExternalPayment(rpc)
  const provider = lane ? paymentProviderWithLane(lane) : paymentProvider()
  const expected = lane ? lane.expectedLivemode : expectedLivemode()
  const loaded = row(await rpc("customer_portal_checkout_attempt_v1", {
    p_token_hash: input.tokenHash,
    p_reference: input.reference,
    p_selector: input.selector,
    p_request: input.requestId,
  }))
  if (loaded == null) return json("Sign in again to continue.", 401)
  if (loaded.status === "eligibility_blocked") return json(loaded.message || UNAVAILABLE, 403)
  if (loaded.status === "confirming") {
    return NextResponse.json({ status: "ok", confirming: true, message: CONFIRMING }, { headers: privateResponseHeaders })
  }
  if (loaded.status === "success" || loaded.status === "resume") {
    return openCustomerCheckout(input.origin, checkoutResult(loaded))
  }
  if (loaded.status !== "recorded" || !loaded.checkoutSessionId || !loaded.providerOperationId) {
    return json(loaded.status === "not_found" ? "We couldn't find that case." : NONE, loaded.status === "not_found" ? 404 : 409)
  }

  const session = await provider.retrieveCheckout(loaded.checkoutSessionId)
  const intent = session?.paymentIntentId ? await provider.retrievePaymentIntent(session.paymentIntentId) : null
  const decision = decideCheckoutRefresh({
    attempt: loaded,
    session,
    paymentIntentStatus: intent?.status ?? null,
    expectedLivemode: expected,
  })
  if (decision === "confirming") {
    return NextResponse.json({ status: "ok", confirming: true, message: CONFIRMING }, { headers: privateResponseHeaders })
  }
  if (decision === "reject") return json(RETRY, 409)
  if (decision === "expire") {
    let expired = false
    try {
      expired = expireConfirmed(await provider.expireCheckout({
        id: loaded.checkoutSessionId,
        idempotencyKey: loaded.providerOperationId,
      }))
    } catch (error) {
      if (!(error instanceof PaymentsDisabledError) && !(error instanceof Error)) throw error
    }
    if (!expired) {
      const again = await provider.retrieveCheckout(loaded.checkoutSessionId)
      const againIntent = again?.paymentIntentId ? await provider.retrievePaymentIntent(again.paymentIntentId) : null
      const after = decideCheckoutRefresh({
        attempt: loaded,
        session: again,
        paymentIntentStatus: againIntent?.status ?? null,
        expectedLivemode: expected,
      })
      if (after === "confirming") {
        return NextResponse.json({ status: "ok", confirming: true, message: CONFIRMING }, { headers: privateResponseHeaders })
      }
      if (after !== "replace_expired") return json(RETRY, 409)
    }
  }

  const replaced = row(await rpc("customer_portal_checkout_refresh_v1", {
    p_token_hash: input.tokenHash,
    p_request: input.requestId,
    p_reference: input.reference,
    p_selector: input.selector,
    p_operation: loaded.providerOperationId,
    ...declaredLivemodeArgument(),
  }))
  if (replaced == null) return json("Sign in again to continue.", 401)
  if (replaced.status === "eligibility_blocked") return json(replaced.message || UNAVAILABLE, 403)
  if (replaced.status === "confirming") {
    return NextResponse.json({ status: "ok", confirming: true, message: CONFIRMING }, { headers: privateResponseHeaders })
  }
  if (replaced.status !== "success" || !replaced.providerOperationId || !replaced.idempotencyKey) {
    return json(RETRY, 409)
  }
  return openCustomerCheckout(input.origin, checkoutResult({ ...replaced, checkoutSessionId: replaced.checkoutSessionId }))
}
