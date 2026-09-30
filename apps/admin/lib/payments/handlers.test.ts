import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakePaymentProvider } from "../../../../lib/payments/fake"

const fake = createFakePaymentProvider()
vi.mock("../../../../lib/payments", () => ({
  paymentProvider: () => fake,
}))

import { collectPaymentHandler, processStripeEventHandler } from "./handlers"

const obligationId = "55555555-5555-4555-8555-555555555555"
const operationId = "66666666-6666-4666-8666-666666666666"
const customerId = "22222222-2222-4222-8222-222222222222"
const orderId = "33333333-3333-4333-8333-333333333333"
const key = "44444444-4444-4444-8444-444444444444"

function rpcMock() {
  return {
    rpc: vi.fn(async (name: string) => {
      if (name === "payment_collect_prepare_v1") {
        return {
          status: "success",
          idempotencyKey: key,
          providerOperationId: operationId,
          attemptId: obligationId,
          amountMinor: 29900,
          stripeCustomerId: "cus_test",
          paymentMethodId: "pm_test_saved",
          serviceOrderId: orderId,
          customerId,
        }
      }
      return { status: "success" }
    }),
  }
}

beforeEach(() => {
  fake.nextOffSessionError = null
  fake.nextIntentStatus = "succeeded"
})

describe("payment job handlers", () => {
  it("retries the same collect operation after a rate-limit shaped Stripe error", async () => {
    fake.nextOffSessionError = { type: "StripeRateLimitError", statusCode: 429, rawType: "rate_limit_error", code: "rate_limit" }
    const rpc = rpcMock()
    const result = await collectPaymentHandler().execute({
      idempotencyKey: key,
      payload: { obligationId },
      rpc,
    })
    expect(result).toEqual({ ok: false, retryable: true, error: "rate_limit" })
    expect(rpc.rpc.mock.calls.map(call => call[0])).toEqual(["payment_collect_prepare_v1"])
  })

  it("does not job-retry a card decline", async () => {
    fake.nextOffSessionError = { type: "StripeCardError", code: "card_declined", payment_intent: { id: "pi_declined", status: "requires_payment_method" } }
    const rpc = rpcMock()
    const result = await collectPaymentHandler().execute({
      idempotencyKey: key,
      payload: { obligationId },
      rpc,
    })
    expect(result).toEqual({ ok: false, retryable: false, error: "card_declined" })
    expect(rpc.rpc.mock.calls.map(call => call[0])).toEqual([
      "payment_collect_prepare_v1",
      "payment_record_provider_refs_v1",
      "payment_apply_provider_event_v1",
    ])
  })

  it("marks authentication required without paying", async () => {
    fake.nextOffSessionError = { type: "StripeCardError", code: "authentication_required", payment_intent: { id: "pi_sca", status: "requires_action" } }
    const rpc = rpcMock()
    const result = await collectPaymentHandler().execute({
      idempotencyKey: key,
      payload: { obligationId },
      rpc,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc.mock.calls[2][1]).toMatchObject({ p_type: "payment_intent.requires_action" })
  })

  it("ignores a live-mode PROCESS_STRIPE_EVENT without retrieving provider objects", async () => {
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_live", eventType: "payment_intent.succeeded", objectId: "pi_live", livemode: true },
      rpc,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("payment_apply_provider_event_v1", expect.objectContaining({
      p_payload: { livemode: true },
    }))
  })
})
