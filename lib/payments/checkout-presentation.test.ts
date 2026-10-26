import { describe, expect, it } from "vitest"
import {
  CHECKOUT_EMAIL_UNVERIFIED_MESSAGE,
  CHECKOUT_SERVICE_PRESENTATIONS,
  CheckoutEmailUnverifiedError,
  emailSyncIdempotencyKey,
  GUARD_PRODUCT_NAME,
  readCheckoutPresentation,
} from "./checkout-presentation"
import { createFakePaymentProvider } from "./fake"
import { PaymentsDisabledError } from "./provider"

const customerId = "22222222-2222-4222-8222-222222222222"
const serviceOrderId = "33333333-3333-4333-8333-333333333333"

describe("checkout presentation", () => {
  it("maps each accepted one-time service and leaves Guard billing named Relaunch Guard", () => {
    expect(CHECKOUT_SERVICE_PRESENTATIONS.GUIDED_RELAUNCH.name).toBe("Guided Relaunch")
    expect(CHECKOUT_SERVICE_PRESENTATIONS.GUIDED_REVIEW.name).toBe("Guided Review")
    expect(CHECKOUT_SERVICE_PRESENTATIONS.MANAGED_RELAUNCH.name).toBe("Managed Profile Recovery")
    expect(CHECKOUT_SERVICE_PRESENTATIONS.MANAGED_REVIEW.name).toBe("Managed Review Protection")
    expect(GUARD_PRODUCT_NAME).toBe("Relaunch Guard")
    for (const presentation of Object.values(CHECKOUT_SERVICE_PRESENTATIONS)) {
      expect(presentation.description).not.toMatch(/reinstate|£|9900|subscription/i)
      expect(presentation.name).not.toBe("ProfileRelaunch service")
    }
  })

  it("keeps the idempotency key free of the email address and stable for the same customer", () => {
    const first = emailSyncIdempotencyKey(customerId, "buyer@example.com")
    const second = emailSyncIdempotencyKey(customerId, "buyer@example.com")
    expect(first).toBe(second)
    expect(first).toMatch(/^cus-email-[a-f0-9]{40}$/)
    expect(first).not.toContain("buyer@")
    expect(emailSyncIdempotencyKey(customerId, "other@example.com")).not.toBe(first)
  })

  it("rejects a browser email, a mismatched amount and an unknown service before Stripe", async () => {
    const calls: string[] = []
    const rpc = async (name: string) => {
      calls.push(name)
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_RELAUNCH", amountMinor: 4500, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      return { status: "success" }
    }
    await expect(readCheckoutPresentation(rpc, {
      customerId, serviceOrderId, amountMinor: 4500, mode: "payment",
    })).resolves.toMatchObject({ serviceCode: "GUIDED_RELAUNCH", verifiedEmail: "buyer@example.com", amountMinor: 4500, name: "Guided Relaunch" })
    expect(calls).toEqual(["payment_checkout_presentation_v1"])
    await expect(readCheckoutPresentation(rpc, {
      customerId, serviceOrderId, amountMinor: 9900, mode: "payment",
    })).rejects.toThrow(/amount/)
    await expect(readCheckoutPresentation(async () => ({ status: "denied", reason: "email_unverified", verifiedEmail: "attacker@example.com" }), {
      customerId, serviceOrderId, amountMinor: 4500,
    })).rejects.toBeInstanceOf(CheckoutEmailUnverifiedError)
    await expect(readCheckoutPresentation(async () => ({ status: "denied", reason: "order_mismatch", verifiedEmail: "other@example.com", serviceCode: "GUIDED_REVIEW" }), {
      customerId, serviceOrderId, amountMinor: 4500,
    })).rejects.toBeInstanceOf(PaymentsDisabledError)
    const provider = createFakePaymentProvider()
    await expect(provider.createPaymentCheckout({
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      stripeCustomerId: "cus_test",
      amountMinor: 4500,
      currency: "GBP",
      serviceCode: "NOT_A_SERVICE",
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: { customerId, serviceOrderId, orderRef: "SO-26-ABCDE2" },
    })).rejects.toThrow(/not recognised/)
    expect(provider.checkouts).toBe(0)
    const created = await provider.createCustomer({
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      customerId,
      email: "buyer@example.com",
    })
    await provider.syncCustomerEmail({
      idempotencyKey: emailSyncIdempotencyKey(customerId, "buyer@example.com"),
      stripeCustomerId: created.id,
      customerId,
      email: "buyer@example.com",
    })
    expect(provider.customerEmailUpdates).toBe(0)
    await provider.syncCustomerEmail({
      idempotencyKey: emailSyncIdempotencyKey(customerId, "buyer@example.net"),
      stripeCustomerId: created.id,
      customerId,
      email: "Buyer@Example.NET",
    })
    expect(provider.customerEmailUpdates).toBe(1)
    expect(provider.lastCustomer).toMatchObject({ customerId, email: "buyer@example.net" })
    await expect(provider.syncCustomerEmail({
      idempotencyKey: "cus-email-cross",
      stripeCustomerId: created.id,
      customerId: serviceOrderId,
      email: "other@example.com",
    })).rejects.toThrow(/mapping/)
    expect(provider.lastCustomer?.email).toBe("buyer@example.net")
    const checkout = await provider.createPaymentCheckout({
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
      stripeCustomerId: created.id,
      amountMinor: 4500,
      currency: "GBP",
      serviceCode: "GUIDED_RELAUNCH",
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: { customerId, serviceOrderId, orderRef: "SO-26-ABCDE2" },
    })
    expect(checkout.amountMinor).toBe(4500)
    expect(provider.lastCheckout).toMatchObject({ productName: "Guided Relaunch", amountMinor: 4500 })
    expect(provider.lastCheckout?.paymentIntentMetadata).not.toHaveProperty("email")
    expect(JSON.stringify(provider.lastCheckout)).not.toContain("buyer@")
    expect(CHECKOUT_EMAIL_UNVERIFIED_MESSAGE).toContain("verified")
  })
})
