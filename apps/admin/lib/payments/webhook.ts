import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { constructStripeEvent } from "../../../../lib/payments/stripe"
import { expectedLivemode, paymentsEnabled, stripeWebhookSecret } from "../../../../lib/payments/config"
import { backend } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { devPaymentEventWorkerBlock, runDevPaymentEventWorker } from "../jobs/dev-payment-events"

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateResponseHeaders })

export async function handleStripeWebhook(request: NextRequest, env: Record<string, string | undefined> = process.env) {
  const secret = stripeWebhookSecret(env)
  if (!secret || !paymentsEnabled(env)) return reply({ status: "disabled" }, 503)
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 65536) { await reader.cancel(); return reply({ status: "invalid" }, 413) }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  const signature = request.headers.get("stripe-signature") || ""
  let event: { id: string; type: string; livemode?: boolean; data?: { object?: { id?: string } } }
  try {
    event = constructStripeEvent(raw, signature, secret)
  } catch {
    return reply({ status: "unauthorized" }, 401)
  }
  if (event.livemode !== expectedLivemode(env)) return reply({ status: "livemode_mismatch" }, 409)
  const objectId = typeof event.data?.object?.id === "string" ? event.data.object.id : null
  const result = await backend().rpc<{ status?: string; duplicate?: boolean }>("payment_receive_stripe_event_v1", {
    p_event_id: event.id, p_type: event.type, p_object_id: objectId, p_livemode: event.livemode === true,
  })
  if (result.status !== "success") return reply({ status: "invalid" }, 400)
  // The receipt is already stored. Apply it through the existing DEV worker
  // before answering Stripe, so a paid Checkout does not wait for the delayed
  // schedule. A closed gate, or a worker failure, leaves the outbox for the
  // next run. This does not mark an obligation paid by itself.
  const settlement = event.type.startsWith("checkout.session.") || event.type.startsWith("payment_intent.")
  if (settlement && !devPaymentEventWorkerBlock(env)) {
    try {
      await runDevPaymentEventWorker({ rpc: backend() })
    } catch {
      // The signed event stays queued. A later worker run can apply it once.
    }
  }
  return reply({ status: "success", duplicate: result.duplicate === true })
}
