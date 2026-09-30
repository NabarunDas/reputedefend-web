import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakePaymentProvider } from "../../../../lib/payments/fake"

const fake = createFakePaymentProvider()
vi.mock("../../../../lib/payments", () => ({
  paymentProvider: () => fake,
}))

import type { JobRpc } from "../jobs/model"
import { collectPaymentHandler, processStripeEventHandler } from "./handlers"

const obligationId = "55555555-5555-4555-8555-555555555555"
const operationId = "66666666-6666-4666-8666-666666666666"
const customerId = "22222222-2222-4222-8222-222222222222"
const orderId = "33333333-3333-4333-8333-333333333333"
const key = "44444444-4444-4444-8444-444444444444"

function rpcMock() {
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
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
  })
  return { rpc, asJob: { rpc } as unknown as JobRpc }
}

beforeEach(() => {
  fake.nextOffSessionError = null
  fake.nextIntentStatus = "succeeded"
  fake.nextRecurringInvoiceError = null
})

describe("payment job handlers", () => {
  it("retries the same collect operation after a rate-limit shaped Stripe error", async () => {
    fake.nextOffSessionError = { type: "StripeRateLimitError", statusCode: 429, rawType: "rate_limit_error", code: "rate_limit" }
    const rpc = rpcMock()
    const result = await collectPaymentHandler().execute({
      idempotencyKey: key,
      payload: { obligationId },
      rpc: rpc.asJob,
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
      rpc: rpc.asJob,
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
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc.mock.calls[2][1]).toMatchObject({ p_type: "payment_intent.requires_action" })
  })

  it("ignores a live-mode PROCESS_STRIPE_EVENT without retrieving provider objects", async () => {
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_live", eventType: "payment_intent.succeeded", objectId: "pi_live", livemode: true },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("payment_apply_provider_event_v1", expect.objectContaining({
      p_payload: { livemode: true },
    }))
  })

  it("treats Checkout as correlation-only and retries unmatched PaymentIntents", async () => {
    const rpc = rpcMock()
    const checkout = await fake.createPaymentCheckout({
      idempotencyKey: key,
      stripeCustomerId: "cus_test",
      amountMinor: 9900,
      currency: "GBP",
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: { customerId, serviceOrderId: orderId, obligationId, providerOperationId: operationId },
    })
    rpc.rpc.mockImplementation(async (name: string) => {
      if (name === "payment_apply_provider_event_v1") return { status: "success" }
      return { status: "success" }
    })
    const correlated = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_cs", eventType: "checkout.session.completed", objectId: checkout.id },
      rpc: rpc.asJob,
    })
    expect(correlated).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("payment_apply_provider_event_v1", expect.objectContaining({
      p_type: "checkout.session.completed",
      p_object_id: checkout.id,
    }))
    expect(rpc.rpc.mock.calls.some(call => call[1] && (call[1] as { p_type?: string }).p_type === "payment_intent.succeeded")).toBe(false)

    rpc.rpc.mockImplementation(async (name: string) => {
      if (name === "payment_apply_provider_event_v1") return { status: "unmatched", retryable: true }
      return { status: "success" }
    })
    fake.objects.set("pi_unmatched", {
      id: "pi_unmatched",
      status: "succeeded",
      amountMinor: 9900,
      currency: "gbp",
      customerId: "cus_test",
      metadata: { providerOperationId: operationId, customerId, serviceOrderId: orderId },
    })
    const unmatched = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_unmatched", eventType: "payment_intent.succeeded", objectId: "pi_unmatched" },
      rpc: rpc.asJob,
    })
    expect(unmatched).toEqual({ ok: false, retryable: true, error: "correlation_pending" })
  })

  it("retries recurring invoice retrieval failure and does not fall into Step 14 invoice handling", async () => {
    fake.nextRecurringInvoiceError = new Error("stripe_unavailable")
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_inv_fail", eventType: "invoice.paid", objectId: "in_guard_fail" },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: false, retryable: true, error: "Recurring invoice retrieval failed." })
    expect(rpc.rpc).not.toHaveBeenCalledWith("payment_apply_provider_event_v1", expect.anything())
    expect(rpc.rpc).not.toHaveBeenCalledWith("guard_apply_subscription_event_v1", expect.anything())
  })

  it("correlates invoice.paid from parent subscription metadata before subscription.created", async () => {
    fake.objects.set("in_parent_meta", {
      id: "in_parent_meta",
      status: "paid",
      customerId: "cus_guard",
      amountDueMinor: 999,
      amountPaidMinor: 999,
      currency: "gbp",
      subscriptionId: "sub_early",
      subscriptionItemId: "si_early",
      priceId: "price_testguard1",
      quantity: 1,
      periodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      metadata: {},
      subscriptionMetadata: {
        guardSubscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        customerId,
        serviceOrderId: orderId,
        continuationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        providerOperationId: operationId,
      },
    })
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_parent_meta", eventType: "invoice.paid", objectId: "in_parent_meta" },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("guard_apply_subscription_event_v1", expect.objectContaining({
      p_type: "invoice.paid",
      p_payload: expect.objectContaining({
        guardSubscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        continuationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        quantity: 1,
        currency: "gbp",
      }),
    }))
    expect(rpc.rpc).not.toHaveBeenCalledWith("payment_apply_provider_event_v1", expect.anything())
  })

  it("routes Guard recovery SetupIntent away from Managed setup and requires the exact customer", async () => {
    fake.objects.set("seti_guard_ok", {
      id: "seti_guard_ok",
      status: "succeeded",
      usage: "off_session",
      customerId: "cus_guard",
      paymentMethodId: "pm_guard1",
      metadata: {
        guardSubscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        customerId,
        serviceOrderId: orderId,
        providerOperationId: operationId,
      },
    })
    const rpc = rpcMock()
    rpc.rpc.mockImplementation((async (name: string) => {
      if (name === "guard_apply_subscription_event_v1") return { status: "success" }
      if (name === "guard_apply_recovery_setup_v1") {
        return { status: "success", providerOperationId: "99999999-9999-4999-8999-999999999999", idempotencyKey: key, stripeSubscriptionId: "sub_guard1" }
      }
      return { status: "success" }
    }) as typeof rpc.rpc)
    fake.objects.set("sub_guard1", { id: "sub_guard1", status: "past_due", customerId: "cus_guard" })
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_seti_guard", eventType: "setup_intent.succeeded", objectId: "seti_guard_ok" },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc.mock.calls.map(call => call[0])).toEqual([
      "guard_apply_subscription_event_v1",
      "guard_apply_recovery_setup_v1",
      "guard_confirm_payment_method_v1",
    ])
    expect(rpc.rpc).not.toHaveBeenCalledWith("payment_apply_provider_event_v1", expect.anything())
    expect(rpc.rpc).toHaveBeenCalledWith("guard_apply_recovery_setup_v1", expect.objectContaining({
      p_customer: "cus_guard",
      p_payment_method: "pm_guard1",
      p_guard_subscription: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }))
  })

  it("keeps Managed SetupIntent on the Step 14 path", async () => {
    fake.objects.set("seti_managed", {
      id: "seti_managed",
      status: "succeeded",
      usage: "off_session",
      customerId: "cus_managed",
      paymentMethodId: "pm_managed1",
      metadata: { customerId, serviceOrderId: orderId, providerOperationId: operationId },
    })
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_seti_managed", eventType: "setup_intent.succeeded", objectId: "seti_managed" },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("payment_apply_provider_event_v1", expect.objectContaining({
      p_type: "setup_intent.succeeded",
    }))
    expect(rpc.rpc).not.toHaveBeenCalledWith("guard_apply_recovery_setup_v1", expect.anything())
  })

  it("retrieves refund and dispute objects instead of treating their IDs as subscriptions", async () => {
    fake.objects.set("re_guard1", {
      id: "re_guard1",
      status: "pending",
      amountMinor: 100,
      currency: "gbp",
      paymentIntentId: "pi_testguard1",
      chargeId: "ch_testguard1",
    })
    fake.objects.set("dp_guard1", {
      id: "dp_guard1",
      status: "needs_response",
      amountMinor: 999,
      currency: "gbp",
      chargeId: "ch_testguard1",
    })
    const rpc = rpcMock()
    const refund = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_re", eventType: "refund.created", objectId: "re_guard1" },
      rpc: rpc.asJob,
    })
    expect(refund).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("guard_apply_subscription_event_v1", expect.objectContaining({
      p_type: "refund.created",
      p_object_id: "re_guard1",
      p_payload: expect.objectContaining({ refundStatus: "pending", paymentIntentId: "pi_testguard1", chargeId: "ch_testguard1" }),
    }))
    const dispute = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_dp", eventType: "charge.dispute.created", objectId: "dp_guard1" },
      rpc: rpc.asJob,
    })
    expect(dispute).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("guard_apply_subscription_event_v1", expect.objectContaining({
      p_type: "charge.dispute.created",
      p_object_id: "dp_guard1",
      p_payload: expect.objectContaining({ chargeId: "ch_testguard1" }),
    }))
  })

  it("replays a Guard recovery SetupIntent onto one update-payment-method operation", async () => {
    fake.objects.set("seti_guard_replay", {
      id: "seti_guard_replay",
      status: "succeeded",
      usage: "off_session",
      customerId: "cus_guard",
      paymentMethodId: "pm_guard1",
      metadata: {
        guardSubscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        customerId,
        serviceOrderId: orderId,
        providerOperationId: operationId,
      },
    })
    fake.objects.set("sub_guard1", { id: "sub_guard1", status: "past_due", customerId: "cus_guard" })
    const update = vi.spyOn(fake, "updateSubscriptionPaymentMethod")
    const rpc = rpcMock()
    const updateOp = "99999999-9999-4999-8999-999999999999"
    rpc.rpc.mockImplementation((async (name: string) => {
      if (name === "guard_apply_subscription_event_v1") return { status: "success" }
      if (name === "guard_apply_recovery_setup_v1") {
        return { status: "success", providerOperationId: updateOp, idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stripeSubscriptionId: "sub_guard1", providerOperationStatus: "PENDING" }
      }
      return { status: "success" }
    }) as typeof rpc.rpc)
    const first = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_seti_replay_a", eventType: "setup_intent.succeeded", objectId: "seti_guard_replay" },
      rpc: rpc.asJob,
    })
    expect(first).toEqual({ ok: true })
    rpc.rpc.mockImplementation((async (name: string) => {
      if (name === "guard_apply_subscription_event_v1") return { status: "success" }
      if (name === "guard_apply_recovery_setup_v1") {
        return { status: "success", providerOperationId: updateOp, idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stripeSubscriptionId: "sub_guard1", providerOperationStatus: "SUCCEEDED" }
      }
      return { status: "success" }
    }) as typeof rpc.rpc)
    const second = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_seti_replay_b", eventType: "setup_intent.succeeded", objectId: "seti_guard_replay" },
      rpc: rpc.asJob,
    })
    expect(second).toEqual({ ok: true })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      id: "sub_guard1",
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }))
    expect(rpc.rpc.mock.calls.filter(call => call[0] === "guard_confirm_payment_method_v1")).toHaveLength(1)
  })

  it("sends charge.refunded as supplemental Charge evidence only", async () => {
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_ch_ref", eventType: "charge.refunded", objectId: "ch_testguard1" },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("guard_apply_subscription_event_v1", expect.objectContaining({
      p_type: "charge.refunded",
      p_object_id: "ch_testguard1",
      p_payload: expect.objectContaining({ chargeId: "ch_testguard1", supplemental: true }),
    }))
  })
})
