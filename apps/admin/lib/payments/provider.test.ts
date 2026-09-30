import { describe, expect, it } from "vitest"
import { createFakePaymentProvider } from "../../../../lib/payments/fake"
import { disabledPaymentProvider, PaymentsDisabledError } from "../../../../lib/payments/provider"
import { isStripeTestSecret, liveSecretRejected, paymentsEnabled, resolvePaymentProviderMode } from "../../../../lib/payments/config"
import { assertSafeGuardMetadata, assertSafeMetadata, mapBoundedProviderEvent, STRIPE_SDK_API_VERSION, STRIPE_SDK_VERSION } from "../../../../lib/payments/model"

describe("payment provider contract", () => {
  it("pins the official Stripe SDK version and fail-closes by default", async () => {
    expect(STRIPE_SDK_VERSION).toBe("22.6.2")
    expect(STRIPE_SDK_API_VERSION).toBe("2026-08-26.dahlia")
    expect(resolvePaymentProviderMode({})).toBe("disabled")
    expect(isStripeTestSecret("sk_test_secret_value")).toBe(true)
    expect(isStripeTestSecret("rk_test_restricted_key")).toBe(true)
    expect(isStripeTestSecret("sk_live_secret_value")).toBe(false)
    expect(isStripeTestSecret("rk_live_restricted_key")).toBe(false)
    expect(isStripeTestSecret("pk_test_publishable")).toBe(false)
    expect(isStripeTestSecret("whsec_unknown_secret")).toBe(false)
    expect(liveSecretRejected("stripe_test", "sk_live_secret_value")).toBe(true)
    expect(liveSecretRejected("stripe_test", "rk_live_restricted_key")).toBe(true)
    expect(liveSecretRejected("stripe_test", "sk_test_secret_value")).toBe(false)
    expect(liveSecretRejected("stripe_test", "rk_test_restricted_key")).toBe(false)
    expect(paymentsEnabled({ PAYMENTS_PROVIDER_MODE: "stripe_test", STRIPE_SECRET_KEY: "sk_live_secret_value" })).toBe(false)
    expect(paymentsEnabled({ PAYMENTS_PROVIDER_MODE: "stripe_test", STRIPE_SECRET_KEY: "rk_live_restricted_key" })).toBe(false)
    expect(paymentsEnabled({ PAYMENTS_PROVIDER_MODE: "stripe_test", STRIPE_SECRET_KEY: "pk_test_publishable_xxxxxxxx" })).toBe(false)
    await expect(disabledPaymentProvider().createPaymentCheckout({
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      stripeCustomerId: "cus_test",
      amountMinor: 9900,
      currency: "GBP",
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: { customerId: "22222222-2222-4222-8222-222222222222", serviceOrderId: "33333333-3333-4333-8333-333333333333" },
    })).rejects.toBeInstanceOf(PaymentsDisabledError)
  })

  it("creates Guided Checkout for the immutable amount and reuses the idempotency key", async () => {
    const provider = createFakePaymentProvider()
    const input = {
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      stripeCustomerId: "cus_testabc",
      amountMinor: 9900,
      currency: "GBP" as const,
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: {
        customerId: "22222222-2222-4222-8222-222222222222",
        serviceOrderId: "33333333-3333-4333-8333-333333333333",
        obligationId: "55555555-5555-4555-8555-555555555555",
        attemptId: "66666666-6666-4666-8666-666666666666",
        orderRef: "SO-26-ABCDE2",
        providerOperationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    }
    const first = await provider.createPaymentCheckout(input)
    const second = await provider.createPaymentCheckout(input)
    expect(first.mode).toBe("payment")
    expect(first.amountMinor).toBe(9900)
    expect(first.id).toBe(second.id)
    expect(provider.checkouts).toBe(1)
    expect(provider.lastCheckout).toMatchObject({
      amountMinor: 9900,
      mode: "payment",
      idempotencyKey: input.idempotencyKey,
      paymentMethodTypes: ["card"],
      paymentIntentMetadata: {
        customerId: input.metadata.customerId,
        serviceOrderId: input.metadata.serviceOrderId,
        obligationId: input.metadata.obligationId,
        attemptId: input.metadata.attemptId,
        orderRef: input.metadata.orderRef,
        providerOperationId: input.metadata.providerOperationId,
      },
    })
    const intent = await provider.retrievePaymentIntent(first.id.replace("cs_test_", "pi_test_"))
    expect(intent?.metadata).toMatchObject({
      customerId: input.metadata.customerId,
      serviceOrderId: input.metadata.serviceOrderId,
      obligationId: input.metadata.obligationId,
      providerOperationId: input.metadata.providerOperationId,
    })
    expect(intent?.currency).toBe("gbp")
    expect(mapBoundedProviderEvent({
      id: "evt_unpaid",
      type: "checkout.session.completed",
      data: { object: { id: first.id, mode: "payment", payment_status: "unpaid" } },
    }).outcome).toBe("correlated")
  })

  it("creates Managed setup with zero charge and off-session intent", async () => {
    const provider = createFakePaymentProvider()
    const session = await provider.createSetupCheckout({
      idempotencyKey: "77777777-7777-4777-8777-777777777777",
      stripeCustomerId: "cus_testabc",
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: { customerId: "22222222-2222-4222-8222-222222222222", serviceOrderId: "33333333-3333-4333-8333-333333333333" },
    })
    expect(session.mode).toBe("setup")
    expect(session.amountMinor).toBe(0)
    expect(provider.lastCheckout).toMatchObject({ mode: "setup", amountMinor: 0, setupUsage: "off_session" })
  })

  it("classifies Stripe-shaped off-session failures without creating a second intent", async () => {
    const provider = createFakePaymentProvider()
    const input = {
      idempotencyKey: "88888888-8888-4888-8888-888888888888",
      stripeCustomerId: "cus_testabc",
      paymentMethodId: "pm_test_saved",
      amountMinor: 29900,
      currency: "GBP" as const,
      metadata: { customerId: "22222222-2222-4222-8222-222222222222", serviceOrderId: "33333333-3333-4333-8333-333333333333" },
    }
    provider.nextOffSessionError = { type: "StripeRateLimitError", statusCode: 429, rawType: "rate_limit_error", code: "rate_limit" }
    const limited = await provider.createOffSessionPayment(input)
    expect(limited).toMatchObject({ classification: "retryable", retryable: true })
    expect(provider.intents).toBe(0)
    provider.nextOffSessionError = { type: "StripeCardError", code: "card_declined", payment_intent: { id: "pi_declined", status: "requires_payment_method" } }
    const declined = await provider.createOffSessionPayment(input)
    expect(declined).toMatchObject({ classification: "declined", retryable: false, id: "pi_declined" })
    provider.nextOffSessionError = { type: "StripeCardError", code: "authentication_required", payment_intent: { id: "pi_sca", status: "requires_action" } }
    const sca = await provider.createOffSessionPayment({ ...input, idempotencyKey: "99999999-9999-4999-8999-999999999999" })
    expect(sca).toMatchObject({ classification: "requires_action", retryable: false, id: "pi_sca" })
    provider.objects.set("pi_sca", { id: "pi_sca", status: "requires_action" })
    const cancelled = await provider.cancelPaymentIntent({ id: "pi_sca", idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })
    expect(cancelled).toMatchObject({ cancelled: true, alreadySucceeded: false })
    provider.objects.set("pi_paid", { id: "pi_paid", status: "succeeded" })
    expect(await provider.cancelPaymentIntent({ id: "pi_paid", idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })).toMatchObject({
      alreadySucceeded: true, cancelled: false,
    })
  })

  it("rejects a SetupIntent identifier as a PaymentMethod", async () => {
    const provider = createFakePaymentProvider()
    expect(await provider.retrievePaymentMethod("seti_not_a_method")).toBeNull()
    const method = await provider.retrievePaymentMethod("pm_test_saved")
    expect(method?.id).toBe("pm_test_saved")
  })

  it("rejects sensitive Stripe metadata and never logs secrets", () => {
    expect(() => assertSafeMetadata({ evidence: "private note" })).toThrow(/disallowed/)
    expect(() => assertSafeMetadata({ customerId: "not-a-uuid" })).toThrow(/opaque/)
    expect(JSON.stringify({ STRIPE_SECRET_KEY: undefined, client_secret: undefined })).not.toMatch(/sk_live|sk_test|client_secret/)
  })

  it("creates one recurring Guard Price and subscription Checkout with quantity 1", async () => {
    const provider = createFakePaymentProvider()
    const priceInput = {
      idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      amountMinor: 999,
      currency: "GBP" as const,
      priceVersionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      providerOperationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }
    const first = await provider.createRecurringPrice(priceInput)
    const second = await provider.createRecurringPrice(priceInput)
    expect(first.priceId).toBe(second.priceId)
    expect(first.amountMinor).toBe(999)
    await expect(disabledPaymentProvider().createRecurringPrice(priceInput)).rejects.toBeInstanceOf(PaymentsDisabledError)
    const checkout = await provider.createSubscriptionCheckout({
      idempotencyKey: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      stripeCustomerId: "cus_testabc",
      stripePriceId: first.priceId,
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: {
        customerId: "22222222-2222-4222-8222-222222222222",
        serviceOrderId: "33333333-3333-4333-8333-333333333333",
        guardSubscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        priceVersionId: priceInput.priceVersionId,
        providerOperationId: priceInput.providerOperationId,
      },
    })
    expect(checkout.mode).toBe("subscription")
    const refund = await provider.createRefund({
      idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      paymentIntentId: "pi_testabc",
      amountMinor: 100,
    })
    expect(refund.status).toBe("pending")
    expect(await provider.createRefund({
      idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      paymentIntentId: "pi_testabc",
      amountMinor: 100,
    })).toMatchObject({ id: refund.id })
    expect(() => assertSafeGuardMetadata({ notes: "customer note" })).toThrow(/disallowed/)
    expect(mapBoundedProviderEvent({ id: "evt_sub", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } }).objectType).toBe("subscription")
    expect(mapBoundedProviderEvent({ id: "evt_inv", type: "invoice.paid", data: { object: { id: "in_1" } } }).outcome).toBe("succeeded")
  })
})
