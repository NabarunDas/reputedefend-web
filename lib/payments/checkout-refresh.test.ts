import { describe, expect, it } from "vitest"
import { decideCheckoutRefresh, type CheckoutRefreshAttempt } from "./checkout-refresh"
import type { RetrievedCheckout } from "./model"

const attempt: CheckoutRefreshAttempt = {
  providerOperationId: "44444444-4444-4444-8444-444444444444",
  customerId: "22222222-2222-4222-8222-222222222222",
  serviceOrderId: "33333333-3333-4333-8333-333333333333",
  obligationId: "55555555-5555-4555-8555-555555555555",
  amountMinor: 9900,
  currency: "GBP",
  mode: "payment",
}

function session(overrides: Partial<RetrievedCheckout> = {}): RetrievedCheckout {
  return {
    id: "cs_test_open",
    mode: "payment",
    status: "open",
    paymentStatus: "unpaid",
    paymentIntentId: null,
    setupIntentId: null,
    customerId: "cus_test",
    url: "https://checkout.stripe.com/c/pay/cs_test_open",
    metadata: {
      customerId: attempt.customerId,
      serviceOrderId: attempt.serviceOrderId,
      obligationId: attempt.obligationId,
      providerOperationId: attempt.providerOperationId,
    },
    livemode: false,
    amountMinor: 9900,
    currency: "gbp",
    ...overrides,
  }
}

describe("decideCheckoutRefresh", () => {
  it("expires only an open unpaid session that matches the accepted order", () => {
    expect(decideCheckoutRefresh({ attempt, session: session(), expectedLivemode: false })).toBe("expire")
    expect(decideCheckoutRefresh({
      attempt,
      session: session({ status: "expired", url: null }),
      expectedLivemode: false,
    })).toBe("replace_expired")
  })

  it("leaves a paid, processing, live, foreign, or stale session untouched", () => {
    expect(decideCheckoutRefresh({
      attempt, session: session({ status: "complete", paymentStatus: "paid" }), expectedLivemode: false,
    })).toBe("confirming")
    expect(decideCheckoutRefresh({
      attempt, session: session(), paymentIntentStatus: "processing", expectedLivemode: false,
    })).toBe("confirming")
    expect(decideCheckoutRefresh({
      attempt, session: session(), paymentIntentStatus: "succeeded", expectedLivemode: false,
    })).toBe("confirming")
    expect(decideCheckoutRefresh({
      attempt, session: session({ livemode: true }), expectedLivemode: false,
    })).toBe("reject")
    expect(decideCheckoutRefresh({
      attempt,
      session: session({ metadata: { ...session().metadata, customerId: "99999999-9999-4999-8999-999999999999" } }),
      expectedLivemode: false,
    })).toBe("reject")
    expect(decideCheckoutRefresh({
      attempt, session: session({ amountMinor: 100 }), expectedLivemode: false,
    })).toBe("reject")
    expect(decideCheckoutRefresh({
      attempt, session: session({ currency: "usd" }), expectedLivemode: false,
    })).toBe("reject")
    expect(decideCheckoutRefresh({
      attempt, session: null, expectedLivemode: false,
    })).toBe("reject")
    expect(decideCheckoutRefresh({
      attempt, session: session({ metadata: { customerId: attempt.customerId } }), expectedLivemode: false,
    })).toBe("reject")
  })
})
