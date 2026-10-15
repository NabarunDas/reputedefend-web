import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const stripeCalls = vi.hoisted(() => ({
  constructed: [] as string[],
  retrieves: [] as string[],
  checkout: {} as Record<string, Record<string, unknown>>,
  invoice: {} as Record<string, Record<string, unknown>>,
}))

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(key: string) {
      stripeCalls.constructed.push(key)
    }
    checkout = {
      sessions: {
        retrieve: async (id: string) => {
          stripeCalls.retrieves.push(`checkout:${id}`)
          return stripeCalls.checkout[id]
        },
      },
    }
    invoices = {
      retrieve: async (id: string) => {
        stripeCalls.retrieves.push(`invoice:${id}`)
        return stripeCalls.invoice[id]
      },
    }
  },
}))

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  execute: vi.fn(),
}))

vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
}))
vi.mock("../payments/handlers", () => ({
  processStripeEventHandler: () => ({ jobType: "PROCESS_STRIPE_EVENT", execute: mocks.execute }),
}))

import { sessionCookie } from "@/lib/auth/config"
import { devStripeOneShotCommand } from "./dev-stripe-one-shot"
import { paymentProvider } from "../../../../lib/payments"

const origin = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
const eventId = "evt_lane_checkout"
const testKey = "sk_test_placeholdernotarealkey"
const preview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  SUPABASE_SECRET_KEY: "test-secret",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  PAYMENTS_PROVIDER_MODE: "stripe_test",
  STRIPE_SECRET_KEY: testKey,
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
  ADMIN_AUTH_ENABLED: "true",
  DEV_STRIPE_ONE_SHOT_ENABLED: "true",
}
const testLane = { configured: false, mode: "stripe_test" as const, expectedLivemode: false }

function req(body: unknown) {
  return new NextRequest(`${origin}/api/operations/dev-stripe-reconcile`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": "55555555-5555-4555-8555-555555555555",
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify(body),
  })
}

function preflight(eventType: string, objectId: string) {
  return { status: "preflight_required", eventId, eventType, objectId }
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.execute.mockReset()
  stripeCalls.constructed.length = 0
  stripeCalls.retrieves.length = 0
  stripeCalls.checkout = {}
  stripeCalls.invoice = {}
  for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
  vi.stubEnv("STRIPE_LIVE_ACTIVATION", "")
  mocks.execute.mockResolvedValue({ ok: true, retryable: false })
})
afterEach(() => vi.unstubAllEnvs())

describe("DEV Stripe one-shot provider lane", () => {
  it("keeps a bare provider disabled and classifies through the real factory only after the database lane agrees", async () => {
    expect(paymentProvider().mode).toBe("disabled")
    expect(paymentProvider(process.env, { databaseLane: testLane }).mode).toBe("stripe_test")
    expect(paymentProvider(process.env, {
      databaseLane: { configured: true, mode: "stripe_live" as const, expectedLivemode: true },
    }).mode).toBe("disabled")
    expect(stripeCalls.constructed).toEqual([])

    stripeCalls.checkout.cs_pay = {
      id: "cs_pay", mode: "payment", status: "complete", payment_status: "paid", livemode: false, metadata: {},
    }
    stripeCalls.invoice.in_plain = {
      id: "in_plain", status: "paid", livemode: false, amount_due: 100, amount_paid: 100, currency: "gbp",
      hosted_invoice_url: null, metadata: {}, parent: null, lines: { data: [] },
    }
    const claims: boolean[] = []
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
      if (name === "payment_provider_lane_status_v1") return testLane
      if (name === "admin_dev_stripe_one_shot_claim_v1") {
        claims.push(Boolean(args.p_preflight_clear))
        if (!args.p_preflight_clear) return preflight("checkout.session.completed", "cs_pay")
        return {
          status: "success", replay: false, eventId, jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          jobType: "PROCESS_STRIPE_EVENT", idempotencyKey: `process-stripe-event:${eventId}`,
          payload: { eventId, eventType: "checkout.session.completed", objectId: "cs_pay", livemode: false },
          leaseToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", attempts: 1, maxAttempts: 5,
        }
      }
      if (name === "job_complete_v1") return { status: "success", jobStatus: "SUCCEEDED" }
      throw new Error(name)
    })
    const checkout = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(checkout.status).toBe(200)
    expect(claims).toEqual([false, true])
    expect(stripeCalls.retrieves).toEqual(["checkout:cs_pay"])
    expect(stripeCalls.constructed).toEqual([testKey])

    claims.length = 0
    stripeCalls.constructed.length = 0
    stripeCalls.retrieves.length = 0
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
      if (name === "payment_provider_lane_status_v1") return testLane
      if (name === "admin_dev_stripe_one_shot_claim_v1") {
        claims.push(Boolean(args.p_preflight_clear))
        if (!args.p_preflight_clear) return preflight("invoice.paid", "in_plain")
        return {
          status: "success", replay: false, eventId, jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          jobType: "PROCESS_STRIPE_EVENT", idempotencyKey: `process-stripe-event:${eventId}`,
          payload: { eventId, eventType: "invoice.paid", objectId: "in_plain", livemode: false },
          leaseToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", attempts: 1, maxAttempts: 5,
        }
      }
      if (name === "job_complete_v1") return { status: "success", jobStatus: "SUCCEEDED" }
      throw new Error(name)
    })
    const invoice = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(invoice.status).toBe(200)
    expect(claims).toEqual([false, true])
    expect(stripeCalls.retrieves).toEqual(["invoice:in_plain"])
  })

  it("leaves a Guard checkout unclaimed and makes no provider call when the lane disagrees", async () => {
    stripeCalls.checkout.cs_guard = {
      id: "cs_guard", mode: "subscription", status: "complete", payment_status: "paid", livemode: false, metadata: {},
    }
    const claims: boolean[] = []
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
      if (name === "payment_provider_lane_status_v1") return testLane
      if (name === "admin_dev_stripe_one_shot_claim_v1") {
        claims.push(Boolean(args.p_preflight_clear))
        return preflight("checkout.session.completed", "cs_guard")
      }
      throw new Error(name)
    })
    const guard = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(guard.status).toBe(403)
    expect(await guard.json()).toMatchObject({ message: expect.stringMatching(/left queued/) })
    expect(claims).toEqual([false])
    expect(stripeCalls.retrieves).toEqual(["checkout:cs_guard"])
    expect(mocks.execute).not.toHaveBeenCalled()

    claims.length = 0
    stripeCalls.constructed.length = 0
    stripeCalls.retrieves.length = 0
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
      if (name === "payment_provider_lane_status_v1") return { configured: true, mode: "stripe_live", expectedLivemode: true }
      if (name === "admin_dev_stripe_one_shot_claim_v1") {
        claims.push(Boolean(args.p_preflight_clear))
        return preflight("invoice.paid", "in_plain")
      }
      throw new Error(name)
    })
    const mismatch = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(mismatch.status).toBe(503)
    expect(claims).toEqual([false])
    expect(stripeCalls.retrieves).toEqual([])
    expect(stripeCalls.constructed).toEqual([])
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
