import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  constructed: [] as string[],
  invoices: [] as Array<Record<string, unknown>>,
  lines: [] as Array<Record<string, unknown>>,
  checkouts: [] as Array<Record<string, unknown>>,
  customerUpdates: [] as Array<Record<string, unknown>>,
  paymentIntents: 0,
  customer: null as { id: string; email: string | null; metadata: Record<string, string>; livemode: boolean } | null,
}))

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(key: string) {
      mocks.constructed.push(key)
    }
    customers = {
      create: async (params: { email?: string; metadata?: Record<string, string> }) => {
        const livemode = mocks.constructed.at(-1)?.includes("live") === true
        mocks.customer = { id: "cus_lane", email: params.email ?? null, metadata: params.metadata ?? {}, livemode }
        return { id: "cus_lane", livemode, email: params.email ?? null, metadata: params.metadata ?? {} }
      },
      retrieve: async () => mocks.customer,
      update: async (_id: string, params: { email?: string }) => {
        mocks.customerUpdates.push(params)
        mocks.customer = { ...mocks.customer!, email: params.email ?? null }
        return { ...mocks.customer, livemode: mocks.customer.livemode }
      },
    }
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          mocks.checkouts.push(params)
          return {
            id: "cs_lane",
            url: "https://checkout.stripe.com/c/pay/cs_lane",
            livemode: mocks.constructed.at(-1)?.includes("live") === true,
            mode: "payment",
          }
        },
      },
    }
    invoices = {
      create: async (body: Record<string, unknown>, options: { idempotencyKey: string }) => {
        mocks.invoices.push({ ...body, idempotencyKey: options.idempotencyKey })
        return { id: "in_lane", livemode: mocks.constructed.at(-1)?.includes("live") === true }
      },
      addLines: async (_id: string, body: Record<string, unknown>) => {
        mocks.lines.push(body)
        return { id: "in_lane" }
      },
      finalizeInvoice: async () => ({
        id: "in_lane",
        livemode: mocks.constructed.at(-1)?.includes("live") === true,
        amount_due: 29900,
        currency: "gbp",
        hosted_invoice_url: "https://invoice.stripe.com/i/lane",
        status: "open",
        due_date: 1_779_000_000,
      }),
    }
    paymentIntents = {
      create: async () => {
        mocks.paymentIntents += 1
        return { id: "pi_lane", livemode: false, status: "succeeded", amount: 29900 }
      },
    }
  },
}))

import { paymentLane, paymentsEnabled, resolvePaymentProviderMode } from "./config"
import { paymentProvider } from "./index"
import { databaseLaneAgrees } from "./lane-agreement"
import { HOSTED_INVOICE_DAYS_UNTIL_DUE } from "./model"
import { LiveStripeKeyError, PaymentsDisabledError } from "./provider"
import { createStripePaymentProvider } from "./stripe"

const testKey = "sk_test_placeholdernotarealkey"
const liveKey = "sk_live_placeholdernotarealkey"
const devPins = {
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
}
const prodPins = {
  SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-prod-euw2-337909767363",
}
const webhook = { STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value" }
const testLane = { configured: false, mode: "stripe_test" as const, expectedLivemode: false }
const liveLane = { configured: true, mode: "stripe_live" as const, expectedLivemode: true }

beforeEach(() => {
  mocks.constructed.length = 0
  mocks.invoices.length = 0
  mocks.lines.length = 0
  mocks.checkouts.length = 0
  mocks.customerUpdates.length = 0
  mocks.paymentIntents = 0
  mocks.customer = null
})

describe("payment lanes", () => {
  it("selects the lane from VERCEL_ENV and fails closed on a production NODE_ENV spoof", () => {
    expect(paymentLane({})).toBe("local")
    expect(paymentLane({ NODE_ENV: "test" })).toBe("local")
    expect(paymentLane({ NODE_ENV: "development" })).toBe("local")
    expect(paymentLane({ NODE_ENV: "production" })).toBe("unrecognised")
    expect(paymentLane({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe("preview")
    expect(paymentLane({ NODE_ENV: "production", VERCEL_ENV: "development" })).toBe("preview")
    expect(paymentLane({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe("production")
    expect(paymentLane({ VERCEL_ENV: "staging" })).toBe("unrecognised")
    expect(resolvePaymentProviderMode({ NODE_ENV: "production", PAYMENTS_PROVIDER_MODE: "stripe_live", STRIPE_LIVE_ACTIVATION: "enabled" })).toBe("disabled")
    expect(resolvePaymentProviderMode({ VERCEL_ENV: "preview", PAYMENTS_PROVIDER_MODE: "stripe_live", STRIPE_LIVE_ACTIVATION: "enabled" })).toBe("disabled")
    expect(resolvePaymentProviderMode({ VERCEL_ENV: "production", PAYMENTS_PROVIDER_MODE: "stripe_test" })).toBe("disabled")
    expect(resolvePaymentProviderMode({ VERCEL_ENV: "production", PAYMENTS_PROVIDER_MODE: "stripe_live" })).toBe("disabled")
    expect(resolvePaymentProviderMode({ VERCEL_ENV: "production", PAYMENTS_PROVIDER_MODE: "stripe_live", STRIPE_LIVE_ACTIVATION: "Enabled" })).toBe("disabled")
    expect(resolvePaymentProviderMode({ VERCEL_ENV: "production", PAYMENTS_PROVIDER_MODE: "stripe_live", STRIPE_LIVE_ACTIVATION: "enabled" })).toBe("stripe_live")
    expect(resolvePaymentProviderMode({ PAYMENTS_PROVIDER_MODE: "stripe_test" })).toBe("stripe_test")
    expect(resolvePaymentProviderMode({ PAYMENTS_PROVIDER_MODE: "stripe_live" })).toBe("disabled")
  })

  it("refuses a pinned Supabase project or evidence bucket from the other lane", () => {
    const preview = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: testKey,
      ...webhook,
      ...devPins,
    }
    expect(paymentsEnabled(preview)).toBe(true)
    expect(paymentsEnabled({ ...preview, SUPABASE_URL: undefined })).toBe(false)
    expect(paymentsEnabled({ ...preview, AWS_EVIDENCE_BUCKET: undefined })).toBe(false)
    expect(paymentsEnabled({ ...preview, STRIPE_WEBHOOK_SECRET: undefined })).toBe(false)
    expect(paymentsEnabled({ ...preview, STRIPE_WEBHOOK_SECRET: "placeholder-stripe-webhook" })).toBe(false)
    expect(paymentsEnabled({ ...preview, SUPABASE_URL: prodPins.SUPABASE_URL })).toBe(false)
    expect(paymentsEnabled({ ...preview, AWS_EVIDENCE_BUCKET: prodPins.AWS_EVIDENCE_BUCKET })).toBe(false)
    expect(paymentsEnabled({ ...preview, SUPABASE_URL: "http://rmzozuiamjcclvtgutgd.supabase.co" })).toBe(false)
    const production = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...webhook,
      ...prodPins,
    }
    expect(paymentsEnabled(production)).toBe(true)
    expect(paymentsEnabled({ ...production, SUPABASE_URL: undefined })).toBe(false)
    expect(paymentsEnabled({ ...production, AWS_EVIDENCE_BUCKET: undefined })).toBe(false)
    expect(paymentsEnabled({ ...production, STRIPE_WEBHOOK_SECRET: undefined })).toBe(false)
    expect(paymentsEnabled({ ...production, SUPABASE_URL: devPins.SUPABASE_URL })).toBe(false)
    expect(paymentsEnabled({ ...production, AWS_EVIDENCE_BUCKET: devPins.AWS_EVIDENCE_BUCKET })).toBe(false)
    expect(paymentsEnabled({ ...production, STRIPE_SECRET_KEY: testKey })).toBe(false)
    expect(paymentsEnabled({ ...production, STRIPE_LIVE_ACTIVATION: undefined })).toBe(false)
    expect(paymentsEnabled({ PAYMENTS_PROVIDER_MODE: "stripe_test", STRIPE_SECRET_KEY: testKey })).toBe(true)
  })

  it("never constructs a Stripe client for a live key outside Production", () => {
    const preview = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...webhook,
      ...devPins,
    }
    expect(paymentProvider(preview).mode).toBe("disabled")
    expect(() => createStripePaymentProvider(preview)).toThrow(PaymentsDisabledError)
    expect(() => createStripePaymentProvider({ ...preview, PAYMENTS_PROVIDER_MODE: "stripe_test" })).toThrow(LiveStripeKeyError)
    expect(() => createStripePaymentProvider({
      NODE_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...webhook,
      ...prodPins,
    })).toThrow(PaymentsDisabledError)
    expect(mocks.constructed).toEqual([])
  })

  it("refuses Stripe until the database lane matches, including a missing Production row", () => {
    const preview = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: testKey,
      ...webhook,
      ...devPins,
    }
    const production = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...webhook,
      ...prodPins,
    }
    expect(databaseLaneAgrees(production, null)).toBe(false)
    expect(databaseLaneAgrees(production, testLane)).toBe(false)
    expect(databaseLaneAgrees(production, { configured: true, mode: "stripe_test", expectedLivemode: false })).toBe(false)
    expect(databaseLaneAgrees(preview, liveLane)).toBe(false)
    expect(databaseLaneAgrees(preview, testLane)).toBe(true)
    expect(databaseLaneAgrees(production, liveLane)).toBe(true)
    expect(paymentProvider(production).mode).toBe("disabled")
    expect(paymentProvider(production, { databaseLane: testLane }).mode).toBe("disabled")
    expect(paymentProvider(production, { databaseLane: { configured: true, mode: "stripe_test", expectedLivemode: false } }).mode).toBe("disabled")
    expect(paymentProvider(preview, { databaseLane: liveLane }).mode).toBe("disabled")
    expect(paymentProvider(preview, { databaseLane: testLane }).mode).toBe("stripe_test")
    expect(paymentProvider(production, { databaseLane: liveLane }).mode).toBe("stripe_live")
    expect(mocks.constructed).toEqual([])
  })

  it("constructs the client only after the lane, key and object livemode agree", async () => {
    const preview = createStripePaymentProvider({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: testKey,
      ...webhook,
      ...devPins,
    }, testLane)
    await expect(preview.createCustomer({
      customerId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    })).resolves.toEqual({ id: "cus_lane", livemode: false })
    expect(mocks.constructed).toEqual([testKey])

    const production = createStripePaymentProvider({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...webhook,
      ...prodPins,
    }, liveLane)
    await expect(production.createCustomer({
      customerId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    })).resolves.toEqual({ id: "cus_lane", livemode: true })
    expect(mocks.constructed).toEqual([testKey, liveKey])
  })

  it("issues a 14-day hosted invoice on both lanes and does not create an off-session PaymentIntent", async () => {
    const metadata = {
      customerId: "22222222-2222-4222-8222-222222222222",
      serviceOrderId: "33333333-3333-4333-8333-333333333333",
      obligationId: "55555555-5555-4555-8555-555555555555",
      providerOperationId: "66666666-6666-4666-8666-666666666666",
    }
    const preview = createStripePaymentProvider({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: testKey,
      ...webhook,
      ...devPins,
    }, testLane)
    const first = await preview.createHostedInvoice({
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      stripeCustomerId: "cus_lane",
      amountMinor: 29900,
      currency: "GBP",
      serviceCode: "MANAGED_RELAUNCH",
      metadata,
    })
    expect(first.dueAt).toBe(new Date(1_779_000_000 * 1000).toISOString())
    expect(first.livemode).toBe(false)
    expect(mocks.invoices[0]).toMatchObject({ days_until_due: HOSTED_INVOICE_DAYS_UNTIL_DUE, idempotencyKey: "11111111-1111-4111-8111-111111111111" })
    expect(mocks.invoices[0].metadata).not.toHaveProperty("email")
    expect(mocks.lines[0]).toMatchObject({
      lines: [{
        price_data: { unit_amount: 29900, product_data: { name: "Managed Profile Recovery" } },
      }],
    })
    await expect(preview.createOffSessionPayment({
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      stripeCustomerId: "cus_lane",
      paymentMethodId: "pm_saved",
      amountMinor: 29900,
      currency: "GBP",
      metadata,
    })).rejects.toThrow(/retired/)
    const production = createStripePaymentProvider({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...webhook,
      ...prodPins,
    }, liveLane)
    const liveInvoice = await production.createHostedInvoice({
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      stripeCustomerId: "cus_lane",
      amountMinor: 29900,
      currency: "GBP",
      serviceCode: "MANAGED_REVIEW",
      metadata,
    })
    expect(liveInvoice.livemode).toBe(true)
    expect(mocks.invoices[1]).toMatchObject({ days_until_due: 14 })
    expect(mocks.lines[1]).toMatchObject({
      lines: [{
        price_data: { unit_amount: 29900, product_data: { name: "Managed Review Protection" } },
      }],
    })
    expect(mocks.paymentIntents).toBe(0)
  })

  it("names Checkout from the accepted service and updates only the mapped customer email", async () => {
    const customerId = "22222222-2222-4222-8222-222222222222"
    const preview = createStripePaymentProvider({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: testKey,
      ...webhook,
      ...devPins,
    }, testLane)
    await preview.createCustomer({
      customerId,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      email: "buyer@example.com",
    })
    expect(mocks.customer).toMatchObject({ email: "buyer@example.com", metadata: { customerId } })
    expect(mocks.customer?.metadata).not.toHaveProperty("email")
    mocks.customer = { ...mocks.customer!, email: null }
    await preview.syncCustomerEmail({
      idempotencyKey: "cus-email-repeat",
      stripeCustomerId: "cus_lane",
      customerId,
      email: "buyer@example.com",
    })
    expect(mocks.customerUpdates).toEqual([{ email: "buyer@example.com" }])
    await preview.syncCustomerEmail({
      idempotencyKey: "cus-email-repeat",
      stripeCustomerId: "cus_lane",
      customerId,
      email: "buyer@example.com",
    })
    expect(mocks.customerUpdates).toHaveLength(1)
    await expect(preview.syncCustomerEmail({
      idempotencyKey: "cus-email-other",
      stripeCustomerId: "cus_lane",
      customerId: "33333333-3333-4333-8333-333333333333",
      email: "other@example.com",
    })).rejects.toThrow(/mapping/)
    expect(mocks.customer?.email).toBe("buyer@example.com")
    const checkout = await preview.createPaymentCheckout({
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      stripeCustomerId: "cus_lane",
      amountMinor: 5900,
      currency: "GBP",
      serviceCode: "GUIDED_REVIEW",
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: {
        customerId,
        serviceOrderId: "33333333-3333-4333-8333-333333333333",
        orderRef: "SO-26-ABCDE2",
      },
    })
    expect(checkout.amountMinor).toBe(5900)
    expect(checkout.livemode).toBe(false)
    expect(mocks.checkouts[0]).toMatchObject({
      line_items: [{ price_data: { unit_amount: 5900, product_data: { name: "Guided Review" } } }],
    })
    expect(JSON.stringify(mocks.checkouts[0])).not.toContain("buyer@example.com")
    expect(JSON.stringify(mocks.checkouts[0])).not.toContain("ProfileRelaunch service")
    await expect(preview.createPaymentCheckout({
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
      stripeCustomerId: "cus_lane",
      amountMinor: 5900,
      currency: "GBP",
      serviceCode: "RELAUNCH_GUARD",
      successUrl: "https://customer.example/pay/return",
      cancelUrl: "https://customer.example/pay/return",
      metadata: { customerId, serviceOrderId: "33333333-3333-4333-8333-333333333333" },
    })).rejects.toThrow(/not recognised/)
    expect(mocks.checkouts).toHaveLength(1)
    const production = createStripePaymentProvider({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...webhook,
      ...prodPins,
    }, liveLane)
    await expect(production.syncCustomerEmail({
      idempotencyKey: "cus-email-live",
      stripeCustomerId: "cus_lane",
      customerId,
      email: "buyer@example.com",
    })).rejects.toThrow(/lane/)
    expect(mocks.customerUpdates).toHaveLength(1)
  })
})
