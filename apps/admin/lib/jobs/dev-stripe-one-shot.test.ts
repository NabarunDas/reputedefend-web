import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  execute: vi.fn(),
  retrieveCheckout: vi.fn(),
  retrieveSetupIntent: vi.fn(),
  retrieveRecurringInvoice: vi.fn(),
}))

vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
}))
vi.mock("../../../../lib/payments", () => ({
  paymentProvider: () => ({
    mode: "stripe_test",
    retrieveCheckout: mocks.retrieveCheckout,
    retrieveSetupIntent: mocks.retrieveSetupIntent,
    retrieveRecurringInvoice: mocks.retrieveRecurringInvoice,
  }),
}))
vi.mock("../payments/handlers", () => ({
  processStripeEventHandler: () => ({ jobType: "PROCESS_STRIPE_EVENT", execute: mocks.execute }),
}))

import { sessionCookie } from "@/lib/auth/config"
import { devStripeOneShotBlock, devStripeOneShotCommand, fenceDevStripeRpc, settleClaimedStripeEvent, stripeEventIsGuardLinked } from "./dev-stripe-one-shot"

const origin = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
const key = "33333333-3333-4333-8333-333333333333"
const eventId = "evt_test_one_shot"
const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const lease = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
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

function claim(extra: Record<string, unknown> = {}) {
  return {
    status: "success",
    replay: false,
    eventId,
    jobId,
    jobType: "PROCESS_STRIPE_EVENT",
    idempotencyKey: `process-stripe-event:${eventId}`,
    payload: { eventId, eventType: "payment_intent.succeeded", objectId: "pi_test_one", livemode: false },
    leaseToken: lease,
    attempts: 1,
    maxAttempts: 5,
    ...extra,
  }
}

function req(body: unknown, headers: Record<string, string> = {}, url = `${origin}/api/operations/dev-stripe-reconcile`) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      origin: new URL(url).origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.execute.mockReset()
  mocks.retrieveCheckout.mockReset()
  mocks.retrieveSetupIntent.mockReset()
  mocks.retrieveRecurringInvoice.mockReset()
  for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
  vi.stubEnv("STRIPE_LIVE_ACTIVATION", "")
})
afterEach(() => vi.unstubAllEnvs())

describe("DEV Stripe one-shot gate", () => {
  it("accepts only the complete DEV Preview develop configuration", () => {
    expect(devStripeOneShotBlock(preview)).toBeNull()
    expect(devStripeOneShotBlock({ ...preview, VERCEL_ENV: "production" })).toBe("wrong_environment")
    expect(devStripeOneShotBlock({ ...preview, VERCEL_ENV: undefined })).toBe("wrong_environment")
    expect(devStripeOneShotBlock({ ...preview, VERCEL_GIT_COMMIT_REF: "main" })).toBe("wrong_branch")
    expect(devStripeOneShotBlock({ ...preview, VERCEL_GIT_COMMIT_REF: undefined })).toBe("wrong_branch")
    expect(devStripeOneShotBlock({ ...preview, SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" })).toBe("wrong_project")
    expect(devStripeOneShotBlock({ ...preview, SUPABASE_URL: undefined })).toBe("wrong_project")
    expect(devStripeOneShotBlock({ ...preview, AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-prod-euw2-337909767363" })).toBe("wrong_bucket")
    expect(devStripeOneShotBlock({ ...preview, AWS_EVIDENCE_BUCKET: undefined })).toBe("wrong_bucket")
    expect(devStripeOneShotBlock({ ...preview, DEV_STRIPE_ONE_SHOT_ENABLED: undefined })).toBe("disabled")
    expect(devStripeOneShotBlock({ ...preview, DEV_STRIPE_ONE_SHOT_ENABLED: "false" })).toBe("disabled")
    expect(devStripeOneShotBlock({ ...preview, PAYMENTS_PROVIDER_MODE: "stripe_live" })).toBe("wrong_mode")
    expect(devStripeOneShotBlock({ ...preview, STRIPE_LIVE_ACTIVATION: "enabled" })).toBe("live_activation")
    expect(devStripeOneShotBlock({ ...preview, STRIPE_SECRET_KEY: "sk_live_placeholdernotarealkey" })).toBe("wrong_key")
    expect(devStripeOneShotBlock({ ...preview, STRIPE_SECRET_KEY: "sk_test_short" })).toBe("wrong_key")
    expect(devStripeOneShotBlock({ ...preview, STRIPE_WEBHOOK_SECRET: undefined })).toBe("payments_disabled")
  })
})

describe("DEV Stripe one-shot request boundary", () => {
  it("refuses a bad session, origin, body or replay before claiming a second time", async () => {
    const signedOut = await devStripeOneShotCommand(req({ eventId, confirmed: true }, { cookie: "" }))
    expect(signedOut.status).toBe(401)
    const foreign = await devStripeOneShotCommand(req({ eventId, confirmed: true }, { origin: "https://admin.profilerelaunch.com" }))
    expect(foreign.status).toBe(403)
    const hooks = await devStripeOneShotCommand(req(
      { eventId, confirmed: true },
      {},
      "https://dev-hooks.profilerelaunch.com/api/operations/dev-stripe-reconcile",
    ))
    expect(hooks.status).toBe(403)
    const malformed = await devStripeOneShotCommand(req("{"))
    expect(malformed.status).toBe(400)
    const huge = await devStripeOneShotCommand(req({ eventId, confirmed: true, padding: "x".repeat(3000) }))
    expect(huge.status).toBe(413)
    const badKey = await devStripeOneShotCommand(req({ eventId, confirmed: true }, { "idempotency-key": "not-a-uuid" }))
    expect(badKey.status).toBe(400)
    const unconfirmed = await devStripeOneShotCommand(req({ eventId, confirmed: false }))
    expect(unconfirmed.status).toBe(400)
    const typed = await devStripeOneShotCommand(req({ eventId, confirmed: true, jobType: "SEND_EMAIL" }))
    expect(typed.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("refuses Production, the wrong branch and a disabled flag before any database call", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    const production = await devStripeOneShotCommand(req(
      { eventId, confirmed: true },
      {},
      "https://admin.profilerelaunch.com/api/operations/dev-stripe-reconcile",
    ))
    expect(production.status).toBe(403)
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("SUPABASE_URL", preview.SUPABASE_URL)
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main")
    const branch = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(branch.status).toBe(403)
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("DEV_STRIPE_ONE_SHOT_ENABLED", "")
    const disabled = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(disabled.status).toBe(403)
    vi.stubEnv("DEV_STRIPE_ONE_SHOT_ENABLED", "true")
    vi.stubEnv("AWS_EVIDENCE_BUCKET", "profilerelaunch-evidence-prod-euw2-337909767363")
    const bucket = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(bucket.status).toBe(403)
    vi.stubEnv("AWS_EVIDENCE_BUCKET", preview.AWS_EVIDENCE_BUCKET)
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    const project = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(project.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(JSON.stringify([await production.json(), await branch.json(), await project.json()])).not.toMatch(/sk_test_|whsec_|leaseToken/)
  })

  it("settles one claimed event and does not run a replay that already succeeded", async () => {
    mocks.execute.mockResolvedValue({ ok: true, retryable: false })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_dev_stripe_one_shot_claim_v1") return claim()
      if (name === "job_complete_v1") return { status: "success", jobStatus: "SUCCEEDED" }
      throw new Error(name)
    })
    const ok = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(ok.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_dev_stripe_one_shot_claim_v1", expect.objectContaining({
      p_event_id: eventId, p_confirmed: true, p_preflight_clear: false,
    }))
    expect(mocks.rpc).toHaveBeenCalledWith("job_complete_v1", { p_job: jobId, p_lease: lease })
    expect(mocks.execute).toHaveBeenCalledTimes(1)

    mocks.rpc.mockResolvedValue({ ...claim(), replay: true, currentJobStatus: "SUCCEEDED" })
    mocks.execute.mockClear()
    const replay = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(replay.status).toBe(200)
    expect(mocks.execute).not.toHaveBeenCalled()

    mocks.rpc.mockClear()
    mocks.execute.mockClear()
    mocks.execute.mockRejectedValue(new Error("provider exploded"))
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_dev_stripe_one_shot_claim_v1") return claim()
      if (name === "job_fail_v1") return { status: "success", jobStatus: "RETRY" }
      throw new Error(name)
    })
    const failed = await devStripeOneShotCommand(req({ eventId, confirmed: true }, { "idempotency-key": "44444444-4444-4444-8444-444444444444" }))
    expect(failed.status).toBe(503)
    expect(mocks.rpc).toHaveBeenCalledWith("job_fail_v1", expect.objectContaining({
      p_job: jobId, p_lease: lease, p_retryable: true,
    }))
    expect(mocks.rpc).not.toHaveBeenCalledWith("job_complete_v1", expect.anything())
  })

  it("leaves a Guard invoice queued and blocks a Guard RPC from the Stripe handler", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "payment_provider_lane_status_v1") {
        return { configured: false, mode: "stripe_test", expectedLivemode: false }
      }
      if (name === "admin_dev_stripe_one_shot_claim_v1") {
        return { status: "preflight_required", eventId, eventType: "invoice.paid", objectId: "in_guard_invoice" }
      }
      throw new Error(name)
    })
    mocks.retrieveRecurringInvoice.mockResolvedValue({
      id: "in_guard_invoice", status: "paid", customerId: null, amountDueMinor: 0, amountPaidMinor: 0,
      currency: "gbp", hostedInvoiceUrl: null, metadata: { guardSubscriptionId: "gsub" }, livemode: false, subscriptionId: "sub_guard",
    })
    const refused = await devStripeOneShotCommand(req({ eventId, confirmed: true }))
    expect(refused.status).toBe(403)
    expect(mocks.rpc).toHaveBeenCalledWith("payment_provider_lane_status_v1", {})
    expect(mocks.rpc).toHaveBeenCalledWith("admin_dev_stripe_one_shot_claim_v1", expect.objectContaining({ p_preflight_clear: false }))
    expect(mocks.rpc).not.toHaveBeenCalledWith("admin_dev_stripe_one_shot_claim_v1", expect.objectContaining({ p_preflight_clear: true }))
    expect(await refused.json()).toMatchObject({ message: expect.stringMatching(/left queued/) })

    const calls: string[] = []
    const rpc = {
      async rpc<T>(name: string): Promise<T> {
        calls.push(name)
        if (name === "job_fail_v1") return { status: "success", jobStatus: "DEAD_LETTER" } as T
        if (name === "payment_provider_lane_status_v1") return { configured: false, mode: "stripe_test", expectedLivemode: false } as T
        throw new Error(`unexpected ${name}`)
      },
    }
    mocks.retrieveCheckout.mockResolvedValue({
      id: "cs_guard",
      mode: "subscription",
      status: "complete",
      paymentStatus: "paid",
      paymentIntentId: null,
      setupIntentId: null,
      customerId: null,
      url: null,
      metadata: {},
      livemode: false,
    })
    const actual = await vi.importActual<typeof import("../payments/handlers")>("../payments/handlers")
    const isolated = await settleClaimedStripeEvent({
      rpc,
      claim: claim({
        payload: { eventId, eventType: "checkout.session.completed", objectId: "cs_guard", livemode: false },
      }),
      handler: actual.processStripeEventHandler(),
    })
    expect(isolated.outcome).toBe("isolated")
    expect(calls).toEqual(["payment_provider_lane_status_v1", "job_fail_v1"])
    expect(calls.join(" ")).not.toMatch(/guard_/)
  })
})

describe("DEV Stripe one-shot settlement", () => {
  it("retries a provider failure, dead-letters a permanent failure, and reports a lost lease", async () => {
    const rpc = {
      async rpc<T>(name: string): Promise<T> {
        if (name === "job_fail_v1") return { status: "success", jobStatus: "RETRY" } as T
        throw new Error(name)
      },
    }
    const retried = await settleClaimedStripeEvent({
      rpc,
      claim: claim(),
      handler: { jobType: "PROCESS_STRIPE_EVENT", async execute() { return { ok: false, retryable: true, error: "Provider retrieval failed." } } },
    })
    expect(retried.outcome).toBe("retry")

    const dead = await settleClaimedStripeEvent({
      rpc: { async rpc<T>() { return { status: "success", jobStatus: "DEAD_LETTER" } as T } },
      claim: claim(),
      handler: { jobType: "PROCESS_STRIPE_EVENT", async execute() { return { ok: false, retryable: false, error: "Event payload is invalid." } } },
    })
    expect(dead.outcome).toBe("dead_letter")

    const lost = await settleClaimedStripeEvent({
      rpc: { async rpc<T>() { return { status: "conflict" } as T } },
      claim: claim(),
      handler: { jobType: "PROCESS_STRIPE_EVENT", async execute() { return { ok: true, retryable: false } } },
    })
    expect(lost.outcome).toBe("lease_lost")

    const calls: string[] = []
    const thrown = await settleClaimedStripeEvent({
      rpc: {
        async rpc<T>(name: string): Promise<T> {
          calls.push(name)
          if (name === "job_fail_v1") return { status: "success", jobStatus: "RETRY" } as T
          throw new Error(name)
        },
      },
      claim: claim(),
      handler: { jobType: "PROCESS_STRIPE_EVENT", async execute() { throw new Error("provider exploded") } },
    })
    expect(thrown.outcome).toBe("handler_error")
    expect(calls).toEqual(["job_fail_v1"])

    const stuck = await settleClaimedStripeEvent({
      rpc: { async rpc<T>(): Promise<T> { return Promise.reject<T>(new Error("database unavailable")) } },
      claim: claim(),
      handler: { jobType: "PROCESS_STRIPE_EVENT", async execute() { throw new Error("provider exploded") } },
    })
    expect(stuck.outcome).toBe("lease_lost")
    expect(stuck.detail).toMatch(/not marked paid/)
  })

  it("does not forward Guard, mail or generic job calls", async () => {
    const calls: string[] = []
    const fenced = fenceDevStripeRpc({
      async rpc<T>(name: string): Promise<T> {
        calls.push(name)
        return { status: "success" } as T
      },
    })
    await expect(fenced.rpc("guard_apply_subscription_event_v1", {})).rejects.toThrow(/not allowed/)
    await expect(fenced.rpc("job_promote_outbox_v1", { p_limit: 20 })).rejects.toThrow(/not allowed/)
    await expect(fenced.rpc("communication_mark_provider_accepted_v1", {})).rejects.toThrow(/not allowed/)
    expect(calls).toEqual([])
    await fenced.rpc("payment_apply_provider_event_v1", { p_event_id: eventId })
    expect(calls).toEqual(["payment_apply_provider_event_v1"])

    const provider = {
      retrieveCheckout: async () => ({ id: "cs", mode: "subscription" as const, status: "complete", paymentStatus: "paid", paymentIntentId: null, setupIntentId: null, customerId: null, url: null, metadata: {}, livemode: false }),
      retrieveSetupIntent: async () => ({ id: "seti", status: "succeeded", customerId: null, paymentMethodId: null, usage: "off_session", metadata: { guardSubscriptionId: "gsub" }, livemode: false }),
      retrieveRecurringInvoice: async () => ({ id: "in", status: "paid", customerId: null, amountDueMinor: 0, amountPaidMinor: 0, currency: "gbp", hostedInvoiceUrl: null, metadata: {}, livemode: false, subscriptionId: "sub" }),
    }
    expect(await stripeEventIsGuardLinked(provider, "checkout.session.completed", "cs")).toBe(true)
    expect(await stripeEventIsGuardLinked(provider, "setup_intent.succeeded", "seti")).toBe(true)
    expect(await stripeEventIsGuardLinked(provider, "invoice.paid", "in")).toBe(true)
    expect(await stripeEventIsGuardLinked({
      ...provider,
      retrieveRecurringInvoice: async () => ({ id: "in_plain", status: "paid", customerId: null, amountDueMinor: 100, amountPaidMinor: 100, currency: "gbp", hostedInvoiceUrl: null, metadata: {}, livemode: false, subscriptionId: null }),
    }, "invoice.paid", "in_plain")).toBe(false)
  })
})
