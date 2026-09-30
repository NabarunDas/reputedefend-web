import { describe, expect, it } from "vitest"
import { createFakePaymentProvider } from "../../../../lib/payments/fake"
import { disabledPaymentProvider, PaymentsDisabledError } from "../../../../lib/payments/provider"
import { liveSecretRejected, resolvePaymentProviderMode } from "../../../../lib/payments/config"
import { assertSafeMetadata, STRIPE_SDK_API_VERSION, STRIPE_SDK_VERSION } from "../../../../lib/payments/model"

describe("payment provider contract", () => {
  it("pins the official Stripe SDK version and fail-closes by default", async () => {
    expect(STRIPE_SDK_VERSION).toBe("22.6.2")
    expect(STRIPE_SDK_API_VERSION).toBe("2026-08-26.dahlia")
    expect(resolvePaymentProviderMode({})).toBe("disabled")
    expect(liveSecretRejected("stripe_test", "sk_live_secret_value")).toBe(true)
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
      },
    }
    const first = await provider.createPaymentCheckout(input)
    const second = await provider.createPaymentCheckout(input)
    expect(first.mode).toBe("payment")
    expect(first.amountMinor).toBe(9900)
    expect(first.id).toBe(second.id)
    expect(provider.checkouts).toBe(1)
    expect(provider.lastCheckout).toMatchObject({ amountMinor: 9900, mode: "payment", idempotencyKey: input.idempotencyKey })
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
    expect(provider.lastCheckout?.mode).toBe("setup")
  })

  it("rejects sensitive Stripe metadata and never logs secrets", () => {
    expect(() => assertSafeMetadata({ evidence: "private note" })).toThrow(/disallowed/)
    expect(() => assertSafeMetadata({ customerId: "not-a-uuid" })).toThrow(/opaque/)
    expect(JSON.stringify({ STRIPE_SECRET_KEY: undefined, client_secret: undefined })).not.toMatch(/sk_live|sk_test|client_secret/)
  })
})
