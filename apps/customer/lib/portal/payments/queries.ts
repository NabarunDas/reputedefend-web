import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { paymentProvider, paymentProviderWithLane } from "../../../../../lib/payments"
import { decideCheckoutRefresh } from "../../../../../lib/payments/checkout-refresh"
import { expectedLivemode } from "../../../../../lib/payments/config"
import { guardExternalPayment } from "../../../../../lib/payments/lane-agreement"
import { parseCasePayments, parsePayments, type CustomerCasePayments, type CustomerPayments, type PaymentCase } from "./parse"

export type PaymentsLoad =
  | { status: "ready"; payments: CustomerPayments }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export type CasePaymentsLoad =
  | { status: "ready"; payments: CustomerCasePayments }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

/** The portal session cookie is the only credential. The RPC derives the customer. */
export async function loadCustomerPayments(): Promise<PaymentsLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_payments_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return { status: "unauthenticated" }
    const payments = parsePayments(row)
    if (!payments) return { status: "unavailable" }
    return { status: "ready", payments }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadCustomerCasePayments(reference: string): Promise<CasePaymentsLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_case_payments_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
    })
    if (row == null) return { status: "unauthenticated" }
    const payments = parseCasePayments(row)
    if (payments === "not_found") return { status: "not_found" }
    if (!payments) return { status: "unavailable" }
    return { status: "ready", payments }
  } catch {
    return { status: "unavailable" }
  }
}

/**
 * Order references whose Guided Checkout is still open and unpaid.
 * The session id stays on the server. A Checkout replaced in the last two
 * minutes is not offered for another refresh.
 */
export async function loadFreshCheckoutOrderRefs(item: PaymentCase): Promise<string[]> {
  const token = await portalToken()
  if (!token) return []
  const refs: string[] = []
  for (const action of item.actions) {
    if (action.kind !== "guided_payment") continue
    try {
      const loaded = await backend().rpc<Record<string, unknown> | null>("customer_portal_checkout_attempt_v1", {
        p_token_hash: tokenHash(token),
        p_reference: item.reference,
        p_selector: action.selector,
      })
      if (!loaded || loaded.status !== "recorded" || typeof loaded.checkoutSessionId !== "string") continue
      const rpc = (name: string, args?: Record<string, unknown>) => backend().rpc(name, args ?? {})
      const lane = await guardExternalPayment(rpc)
      const provider = lane ? paymentProviderWithLane(lane) : paymentProvider()
      const session = await provider.retrieveCheckout(loaded.checkoutSessionId)
      const intent = session?.paymentIntentId ? await provider.retrievePaymentIntent(session.paymentIntentId) : null
      const decision = decideCheckoutRefresh({
        attempt: {
          providerOperationId: String(loaded.providerOperationId || ""),
          customerId: String(loaded.customerId || ""),
          serviceOrderId: String(loaded.serviceOrderId || ""),
          obligationId: String(loaded.obligationId || ""),
          amountMinor: typeof loaded.amountMinor === "number" ? loaded.amountMinor : -1,
          currency: typeof loaded.currency === "string" ? loaded.currency : "",
          mode: "payment",
        },
        session,
        paymentIntentStatus: intent?.status ?? null,
        expectedLivemode: lane ? lane.expectedLivemode : expectedLivemode(),
      })
      if (decision === "expire") refs.push(action.orderRef)
    } catch {
      continue
    }
  }
  return refs
}
