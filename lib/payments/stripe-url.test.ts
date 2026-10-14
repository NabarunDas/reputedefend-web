import { describe, expect, it } from "vitest"
import { assignTrustedStripeCheckout, stripUntrustedHostedInvoice, trustedStripeUrl } from "./stripe-url"

const open = { NODE_ENV: "test", VERCEL_ENV: "preview" }
const locked = { NODE_ENV: "production", VERCEL_ENV: "production" }

const rejected = [
  "https://checkout.stripe.com.evil.example/pay",
  "https://checkout.stripe.com@evil.example/pay",
  "https://evil.example/checkout.stripe.com",
  "javascript:alert(1)",
  "//evil.example",
  "https://checkout.stripe.com:444/pay",
  "https://user:pass@checkout.stripe.com/pay",
  "https://checkout.stripe.com/pay\n",
  "https://checkout.stripe.com/pay\u0000",
  "https://checkout.stripe.com/%00",
  "https://checkout.stripe.com/%1F",
  "https://checkout.stripe.com/%7F",
  "https://checkout.stripe.com/%",
  "https://checkout.stripe.com/%ZZ",
  "https://checkout.stripe.com/%0",
  " http://checkout.stripe.com/pay",
  "https://checkout.stripe.com/pay ",
  "http://checkout.stripe.com/pay",
  "https://checkout.stripe.com./pay",
  "https://checkout-stripe.com/pay",
  "https://checkout.stripe.co/pay",
  "https://notcheckout.stripe.com/pay",
  "https://pay.stripe.com/receipts/x",
  "https://invoice.stripe.com/i/secret",
  "https://checkout.stripe.com\\@evil.example/pay",
]

describe("trusted Stripe URLs", () => {
  it("accepts canonical Checkout and hosted-invoice URLs", () => {
    expect(trustedStripeUrl("https://checkout.stripe.com/c/pay_test", "checkout", open)).toBe("https://checkout.stripe.com/c/pay_test")
    expect(trustedStripeUrl("https://invoice.stripe.com/i/secret-hosted", "invoice", open)).toBe("https://invoice.stripe.com/i/secret-hosted")
    expect(trustedStripeUrl("https://CHECKOUT.STRIPE.COM/c/pay_test", "checkout", locked)).toBe("https://checkout.stripe.com/c/pay_test")
    expect(trustedStripeUrl("https://checkout.stripe.com:443/c/pay_test", "checkout", locked)).toBe("https://checkout.stripe.com/c/pay_test")
    expect(trustedStripeUrl("https://checkout.stripe.com/pay?email=a@b.com", "checkout", locked)).toBe("https://checkout.stripe.com/pay?email=a@b.com")
  })

  it("keeps the fixed fake-provider hosts outside production and rejects them in production", () => {
    expect(trustedStripeUrl("https://checkout.stripe.test/new", "checkout", open)).toBe("https://checkout.stripe.test/new")
    expect(trustedStripeUrl("https://invoice.stripe.test/in_test", "invoice", open)).toBe("https://invoice.stripe.test/in_test")
    expect(trustedStripeUrl("https://checkout.stripe.test/new", "checkout", locked)).toBeNull()
    expect(trustedStripeUrl("https://invoice.stripe.test/in_test", "invoice", locked)).toBeNull()
    expect(trustedStripeUrl("https://checkout.stripe.test/new", "checkout", { VERCEL_ENV: "production" })).toBeNull()
    expect(trustedStripeUrl("https://invoice.stripe.test/in_test", "invoice", { NODE_ENV: "production" })).toBeNull()
    expect(trustedStripeUrl("https://checkout.stripe.com/c/pay_test", "checkout", locked)).toBe("https://checkout.stripe.com/c/pay_test")
    expect(trustedStripeUrl("https://invoice.stripe.com/i/secret", "invoice", { VERCEL_ENV: "production" })).toBe("https://invoice.stripe.com/i/secret")
  })

  it("rejects lookalikes, credentials, schemes, ports, and malformed encodings", () => {
    for (const value of rejected) {
      expect(trustedStripeUrl(value, "checkout", open), value).toBeNull()
      expect(trustedStripeUrl(value, "checkout", locked), value).toBeNull()
    }
    expect(trustedStripeUrl("https://invoice.stripe.com.evil.example/i/x", "invoice", locked)).toBeNull()
    expect(trustedStripeUrl("https://invoice.stripe.com@evil.example/i/x", "invoice", open)).toBeNull()
    expect(trustedStripeUrl("https://evil.example/invoice.stripe.com", "invoice", open)).toBeNull()
    expect(trustedStripeUrl("https://invoice.stripe.com:8443/i/x", "invoice", locked)).toBeNull()
    expect(trustedStripeUrl("https://checkout.stripe.com/pay", "invoice", open)).toBeNull()
    expect(trustedStripeUrl("https://checkout.example/pay", "checkout", open)).toBeNull()
    expect(trustedStripeUrl(null, "checkout", open)).toBeNull()
    expect(trustedStripeUrl(`https://checkout.stripe.com/${"a".repeat(2000)}`, "checkout", open)).toBeNull()
  })

  it("does not navigate when there is no browser window", () => {
    expect(assignTrustedStripeCheckout("https://checkout.stripe.com/c/pay_test")).toBe(false)
    expect(assignTrustedStripeCheckout("javascript:alert(1)")).toBe(false)
  })

  it("removes an untrusted hosted invoice without treating the session as paid", () => {
    const evil = stripUntrustedHostedInvoice({
      kind: "INVOICE_PAYMENT",
      payment: { obligationState: "DUE", hostedInvoiceUrl: "https://invoice.stripe.com.evil.example/i/x" },
    })
    expect(evil.payment.hostedInvoiceUrl).toBeNull()
    expect(evil.payment.obligationState).toBe("DUE")
    const kept = stripUntrustedHostedInvoice({
      kind: "INVOICE_PAYMENT",
      payment: { hostedInvoiceUrl: "https://invoice.stripe.test/in_test" },
    })
    expect(kept.payment.hostedInvoiceUrl).toBe("https://invoice.stripe.test/in_test")
    const untouched = { kind: "AGREEMENT_ACCEPTANCE" }
    expect(stripUntrustedHostedInvoice(untouched)).toBe(untouched)
  })
})
