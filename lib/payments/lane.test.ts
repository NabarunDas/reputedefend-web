import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  constructed: [] as string[],
  invoices: [] as Array<Record<string, unknown>>,
  paymentIntents: 0,
}))

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(key: string) {
      mocks.constructed.push(key)
    }
    customers = {
      create: async () => ({ id: "cus_lane", livemode: mocks.constructed.at(-1)?.includes("live") === true }),
    }
    invoices = {
      create: async (body: Record<string, unknown>, options: { idempotencyKey: string }) => {
        mocks.invoices.push({ ...body, idempotencyKey: options.idempotencyKey })
        return { id: "in_lane", livemode: mocks.constructed.at(-1)?.includes("live") === true }
      },
      addLines: async () => ({ id: "in_lane" }),
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
  mocks.paymentIntents = 0
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
      metadata,
    })
    expect(first.dueAt).toBe(new Date(1_779_000_000 * 1000).toISOString())
    expect(first.livemode).toBe(false)
    expect(mocks.invoices[0]).toMatchObject({ days_until_due: HOSTED_INVOICE_DAYS_UNTIL_DUE, idempotencyKey: "11111111-1111-4111-8111-111111111111" })
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
      metadata,
    })
    expect(liveInvoice.livemode).toBe(true)
    expect(mocks.invoices[1]).toMatchObject({ days_until_due: 14 })
    expect(mocks.paymentIntents).toBe(0)
  })
})
