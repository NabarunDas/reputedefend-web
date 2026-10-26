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
  it("does not charge a saved card when an old COLLECT_PAYMENT job is still queued", async () => {
    const charge = vi.spyOn(fake, "createOffSessionPayment")
    const preview = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: "sk_test_placeholdernotarealkey",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
      SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
    }
    const production = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: "sk_live_placeholdernotarealkey",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
      SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co",
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-prod-euw2-337909767363",
    }
    for (const env of [preview, production]) {
      const rpc = rpcMock()
      const result = await collectPaymentHandler(env).execute({
        idempotencyKey: key,
        payload: { obligationId },
        rpc: rpc.asJob,
      })
      expect(result).toEqual({ ok: false, retryable: false, error: "Off-session Managed collection is retired." })
      expect(rpc.rpc).not.toHaveBeenCalled()
    }
    expect(charge).not.toHaveBeenCalled()
  })

  it("does not replay a webhook against a database lane that disagrees with the worker", async () => {
    const rpc = rpcMock()
    rpc.rpc.mockImplementation((async (name: string) => {
      if (name === "payment_provider_lane_status_v1") {
        return { configured: true, mode: "stripe_live", expectedLivemode: true }
      }
      return { status: "success" }
    }) as typeof rpc.rpc)
    const result = await processStripeEventHandler({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: "sk_test_placeholdernotarealkey",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
      SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
    }).execute({
      idempotencyKey: key,
      payload: { eventId: "evt_preview", eventType: "payment_intent.succeeded", objectId: "pi_preview", livemode: false },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: false, retryable: false, error: "Payment database lane does not match this environment." })
    expect(rpc.rpc.mock.calls.map(call => call[0])).toEqual(["payment_provider_lane_status_v1"])
  })

  it("rejects a live-mode PROCESS_STRIPE_EVENT before any database write when the lane is not live", async () => {
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_live", eventType: "payment_intent.succeeded", objectId: "pi_live", livemode: true },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: false, retryable: false, error: "Event livemode does not match the payment lane." })
    expect(rpc.rpc).not.toHaveBeenCalled()
  })

  it("treats Checkout as correlation-only and retries unmatched PaymentIntents", async () => {
    const rpc = rpcMock()
    const checkout = await fake.createPaymentCheckout({
      idempotencyKey: key,
      stripeCustomerId: "cus_test",
      amountMinor: 9900,
      currency: "GBP",
      serviceCode: "GUIDED_RELAUNCH",
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

  it("applies an invoice payment without storing an untrusted hosted URL", async () => {
    fake.objects.set("in_evil", {
      id: "in_evil",
      status: "paid",
      customerId: "cus_test",
      amountDueMinor: 9900,
      amountPaidMinor: 9900,
      currency: "gbp",
      hostedInvoiceUrl: "https://invoice.stripe.com.evil.example/i/x",
      metadata: { customerId, serviceOrderId: orderId, obligationId, providerOperationId: operationId },
    })
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_evil_invoice", eventType: "invoice.paid", objectId: "in_evil" },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    const apply = rpc.rpc.mock.calls.find(call => call[0] === "payment_apply_provider_event_v1")
    expect(apply?.[1]).toMatchObject({
      p_type: "invoice.paid",
      p_payload: expect.objectContaining({ hostedInvoiceUrl: null, amountPaidMinor: 9900 }),
    })
    expect(JSON.stringify(apply?.[1])).not.toContain("evil.example")
  })

  it("does not treat a Checkout URL as payment success", async () => {
    fake.objects.set("cs_evil_url", {
      id: "cs_evil_url",
      mode: "payment",
      status: "complete",
      paymentStatus: "unpaid",
      paymentIntentId: null,
      setupIntentId: null,
      customerId: "cus_test",
      url: "https://checkout.stripe.com.evil.example/pay",
      metadata: { customerId, serviceOrderId: orderId, obligationId, providerOperationId: operationId },
    })
    const rpc = rpcMock()
    const result = await processStripeEventHandler().execute({
      idempotencyKey: key,
      payload: { eventId: "evt_evil_checkout", eventType: "checkout.session.completed", objectId: "cs_evil_url" },
      rpc: rpc.asJob,
    })
    expect(result).toEqual({ ok: true })
    const apply = rpc.rpc.mock.calls.find(call => call[0] === "payment_apply_provider_event_v1")
    expect(apply?.[1]).toMatchObject({
      p_payload: expect.objectContaining({ paymentStatus: "unpaid" }),
    })
    expect(JSON.stringify(apply?.[1])).not.toContain("evil.example")
    expect(JSON.stringify(apply?.[1])).not.toContain("checkoutUrl")
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

  it("queues one Guided payment confirmation only when customer mail is enabled", async () => {
    const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
    const previousEnv = process.env.VERCEL_ENV
    const previousOrigin = process.env.CUSTOMER_ORIGIN
    const mailEnv = {
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "develop",
      VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
      SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
      CUSTOMER_ORIGIN: portal,
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      RESEND_API_KEY: "re_dev_placeholder",
      COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
      COMMUNICATIONS_REPLY_TO_EMAIL: "cases@profilerelaunch.com",
      COMMUNICATIONS_REPLY_TO_CONFIRMED: "monitored",
    }
    const context = {
      status: "applicable",
      alreadyQueued: false,
      caseRef: "PR-26-FULF99",
      orderRef: "SO-26-FULF99",
      amountMinor: 9900,
      currency: "GBP",
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
    }
    fake.objects.set("pi_guided_mail", {
      id: "pi_guided_mail",
      status: "succeeded",
      amountMinor: 9900,
      currency: "gbp",
      customerId: "cus_test",
      metadata: { customerId, serviceOrderId: orderId, obligationId, providerOperationId: operationId },
    })
    try {
      process.env.VERCEL_ENV = "preview"
      process.env.CUSTOMER_ORIGIN = portal
      const off = rpcMock()
      const skipped = await processStripeEventHandler().execute({
        idempotencyKey: key,
        payload: { eventId: "evt_mail_off", eventType: "payment_intent.succeeded", objectId: "pi_guided_mail" },
        rpc: off.asJob,
      })
      expect(skipped).toEqual({ ok: true })
      expect(off.rpc.mock.calls.map(call => call[0])).not.toContain("payment_confirmation_context_v1")
      expect(off.rpc.mock.calls.map(call => call[0])).not.toContain("payment_queue_confirmation_v1")

      const on = rpcMock()
      on.rpc.mockImplementation((async (name: string) => {
        if (name === "payment_confirmation_context_v1") return context
        if (name === "payment_queue_confirmation_v1") return { status: "success" }
        return { status: "success" }
      }) as typeof on.rpc)
      const queued = await processStripeEventHandler(mailEnv).execute({
        idempotencyKey: key,
        payload: { eventId: "evt_mail_on", eventType: "payment_intent.succeeded", objectId: "pi_guided_mail" },
        rpc: on.asJob,
      })
      expect(queued).toEqual({ ok: true })
      const queuedCall = on.rpc.mock.calls.find(call => call[0] === "payment_queue_confirmation_v1")
      expect(queuedCall?.[1]).toMatchObject({
        p_payload: {
          sendEnabled: true,
          paymentIntentId: "pi_guided_mail",
          fromAddress: "ops@example.com",
          customerOrigin: portal,
        },
      })
      const payload = (queuedCall?.[1] as { p_payload: { subject: string; bodyText: string; bodyHtml: string } }).p_payload
      expect(payload.subject).toContain("PR-26-FULF99")
      expect(payload.subject).toContain("SO-26-FULF99")
      expect(payload.bodyText).toContain("£99.00 GBP")
      expect(payload.bodyText.match(/\/portal\/cases\//g)).toHaveLength(1)
      expect(payload.bodyHtml.match(/\/portal\/cases\//g)).toHaveLength(1)
      expect(`${payload.subject}\n${payload.bodyText}\n${payload.bodyHtml}`).not.toMatch(/pi_|cus_|#t=|\/action\//)

      const replay = rpcMock()
      replay.rpc.mockImplementation((async (name: string) => {
        if (name === "payment_confirmation_context_v1") return { ...context, alreadyQueued: true }
        return { status: "success" }
      }) as typeof replay.rpc)
      const again = await processStripeEventHandler(mailEnv).execute({
        idempotencyKey: key,
        payload: { eventId: "evt_mail_replay", eventType: "payment_intent.succeeded", objectId: "pi_guided_mail" },
        rpc: replay.asJob,
      })
      expect(again).toEqual({ ok: true })
      expect(replay.rpc.mock.calls.map(call => call[0])).not.toContain("payment_queue_confirmation_v1")

      const refused = rpcMock()
      refused.rpc.mockImplementation((async (name: string) => {
        if (name === "payment_confirmation_context_v1") return context
        if (name === "payment_queue_confirmation_v1") return { status: "denied", reason: "snapshot" }
        return { status: "success" }
      }) as typeof refused.rpc)
      expect(await processStripeEventHandler(mailEnv).execute({
        idempotencyKey: key,
        payload: { eventId: "evt_mail_denied", eventType: "payment_intent.succeeded", objectId: "pi_guided_mail" },
        rpc: refused.asJob,
      })).toEqual({ ok: false, retryable: false, error: "Payment confirmation email was refused." })

      const retry = rpcMock()
      retry.rpc.mockImplementation((async (name: string) => {
        if (name === "payment_confirmation_context_v1") return context
        if (name === "payment_queue_confirmation_v1") return { status: "error" }
        return { status: "success" }
      }) as typeof retry.rpc)
      expect(await processStripeEventHandler(mailEnv).execute({
        idempotencyKey: key,
        payload: { eventId: "evt_mail_retry", eventType: "payment_intent.succeeded", objectId: "pi_guided_mail" },
        rpc: retry.asJob,
      })).toEqual({ ok: false, retryable: true, error: "Payment confirmation email was not queued." })
    } finally {
      if (previousEnv === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousEnv
      if (previousOrigin === undefined) delete process.env.CUSTOMER_ORIGIN
      else process.env.CUSTOMER_ORIGIN = previousOrigin
    }
  })
})
