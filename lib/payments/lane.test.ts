import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ constructed: [] as string[] }))

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(key: string) {
      mocks.constructed.push(key)
    }
    customers = {
      create: async () => ({ id: "cus_lane", livemode: mocks.constructed.at(-1)?.includes("live") === true }),
    }
  },
}))

import { paymentLane, paymentsEnabled, resolvePaymentProviderMode } from "./config"
import { paymentProvider } from "./index"
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

beforeEach(() => {
  mocks.constructed.length = 0
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
      ...devPins,
    }
    expect(paymentsEnabled(preview)).toBe(true)
    expect(paymentsEnabled({ ...preview, SUPABASE_URL: prodPins.SUPABASE_URL })).toBe(false)
    expect(paymentsEnabled({ ...preview, AWS_EVIDENCE_BUCKET: prodPins.AWS_EVIDENCE_BUCKET })).toBe(false)
    expect(paymentsEnabled({ ...preview, SUPABASE_URL: "http://rmzozuiamjcclvtgutgd.supabase.co" })).toBe(false)
    const production = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
      ...prodPins,
    }
    expect(paymentsEnabled(production)).toBe(true)
    expect(paymentsEnabled({ ...production, SUPABASE_URL: devPins.SUPABASE_URL })).toBe(false)
    expect(paymentsEnabled({ ...production, AWS_EVIDENCE_BUCKET: devPins.AWS_EVIDENCE_BUCKET })).toBe(false)
    expect(paymentsEnabled({ ...production, STRIPE_SECRET_KEY: testKey })).toBe(false)
    expect(paymentsEnabled({ ...production, STRIPE_LIVE_ACTIVATION: undefined })).toBe(false)
  })

  it("never constructs a Stripe client for a live key outside Production", () => {
    const preview = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_live",
      STRIPE_LIVE_ACTIVATION: "enabled",
      STRIPE_SECRET_KEY: liveKey,
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
      ...prodPins,
    })).toThrow(PaymentsDisabledError)
    expect(mocks.constructed).toEqual([])
  })

  it("constructs the client only after the lane, key and object livemode agree", async () => {
    const preview = createStripePaymentProvider({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: testKey,
      ...devPins,
    })
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
      ...prodPins,
    })
    await expect(production.createCustomer({
      customerId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    })).resolves.toEqual({ id: "cus_lane", livemode: true })
    expect(mocks.constructed).toEqual([testKey, liveKey])
  })
})
