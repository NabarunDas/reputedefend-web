import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { jobWorkerConfig } from "./config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", () => ({ backend: () => mocks }))

import {
  checkoutSessionIsGuard,
  devPaymentEventWorkerBlock,
  fenceDevPaymentRpc,
  parseDevPaymentCadenceSeconds,
  runDevPaymentEventRequest,
} from "./dev-payment-events"
import type { JobRpc } from "./model"

const secret = "d".repeat(32)
const preview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  DEV_PAYMENT_EVENT_WORKER_ENABLED: "true",
  DEV_PAYMENT_EVENT_WORKER_SECRET: secret,
  PAYMENTS_PROVIDER_MODE: "stripe_test",
  STRIPE_SECRET_KEY: "sk_test_placeholdernotarealkey",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
  STRIPE_LIVE_ACTIVATION: "",
}

function apply(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value)
}

beforeEach(() => {
  mocks.rpc.mockReset()
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

describe("DEV payment event worker gate", () => {
  it("stays closed unless every DEV Preview condition is present", () => {
    expect(devPaymentEventWorkerBlock(preview)).toBeNull()
    expect(devPaymentEventWorkerBlock({ ...preview, VERCEL_ENV: "production" })).toBe("wrong_environment")
    expect(devPaymentEventWorkerBlock({ ...preview, VERCEL_ENV: undefined })).toBe("wrong_environment")
    expect(devPaymentEventWorkerBlock({ ...preview, VERCEL_GIT_COMMIT_REF: "main" })).toBe("wrong_branch")
    expect(devPaymentEventWorkerBlock({ ...preview, SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" })).toBe("wrong_project")
    expect(devPaymentEventWorkerBlock({ ...preview, AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-prod-euw2-337909767363" })).toBe("wrong_bucket")
    expect(devPaymentEventWorkerBlock({ ...preview, DEV_PAYMENT_EVENT_WORKER_ENABLED: undefined })).toBe("disabled")
    expect(devPaymentEventWorkerBlock({ ...preview, PAYMENTS_PROVIDER_MODE: "stripe_live" })).toBe("wrong_mode")
    expect(devPaymentEventWorkerBlock({ ...preview, STRIPE_LIVE_ACTIVATION: "enabled" })).toBe("live_activation")
    expect(devPaymentEventWorkerBlock({ ...preview, STRIPE_SECRET_KEY: "sk_live_placeholdernotarealkey" })).toBe("wrong_key")
    expect(devPaymentEventWorkerBlock({ ...preview, DEV_PAYMENT_EVENT_WORKER_SECRET: "short" })).toBe("missing_secret")
    expect(devPaymentEventWorkerBlock({ ...preview, STRIPE_WEBHOOK_SECRET: undefined })).toBe("payments_disabled")
    expect(jobWorkerConfig({ ...preview, JOB_WORKER_ENABLED: "true", CRON_SECRET: "c".repeat(32) }).enabled).toBe(false)
  })

  it("defaults the DEV cadence to five minutes and ignores the production daily default", () => {
    expect(parseDevPaymentCadenceSeconds({})).toBe(300)
    expect(parseDevPaymentCadenceSeconds({ DEV_PAYMENT_EVENT_WORKER_CADENCE_SECONDS: "120" })).toBe(120)
    expect(parseDevPaymentCadenceSeconds({ DEV_PAYMENT_EVENT_WORKER_CADENCE_SECONDS: "30" })).toBe(300)
    expect(parseDevPaymentCadenceSeconds({ DEV_PAYMENT_EVENT_WORKER_CADENCE_SECONDS: "86400" })).toBe(300)
    expect(parseDevPaymentCadenceSeconds({ JOB_WORKER_CADENCE_SECONDS: "86400" })).toBe(300)
  })

  it("refuses a Guard checkout and a fenced Guard call before any payment RPC", async () => {
    await expect(checkoutSessionIsGuard({
      retrieveCheckout: async () => ({
        id: "cs_guard",
        mode: "subscription",
        status: "complete",
        paymentStatus: "paid",
        paymentIntentId: null,
        setupIntentId: null,
        customerId: "cus_guard",
        url: null,
        metadata: { guardSubscriptionId: "gsub" },
        livemode: false,
        amountMinor: 0,
        currency: "gbp",
      }),
    }, "cs_guard")).resolves.toBe(true)
    const rpc = { rpc: vi.fn() } as unknown as JobRpc
    await expect(fenceDevPaymentRpc(rpc).rpc("guard_apply_subscription_event_v1", {})).rejects.toMatchObject({
      name: "DevPaymentIsolationError",
    })
    expect(rpc.rpc).not.toHaveBeenCalled()
  })
})

describe("DEV payment event route", () => {
  function req(authorization?: string) {
    return new NextRequest("https://admin.example.test/api/internal/jobs/dev-payment-events", {
      headers: authorization ? { authorization } : {},
    })
  }

  it("refuses a closed gate before any database call", async () => {
    apply({ ...preview, VERCEL_ENV: "production", DEV_PAYMENT_EVENT_WORKER_SECRET: secret })
    const response = await runDevPaymentEventRequest(req(`Bearer ${secret}`))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ status: "disabled", reason: "wrong_environment" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("refuses a missing or wrong bearer before any database call", async () => {
    apply({ ...preview, DEV_PAYMENT_EVENT_WORKER_SECRET: "" })
    const missing = await runDevPaymentEventRequest(req(`Bearer ${secret}`))
    expect(missing.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()

    apply(preview)
    const wrong = await runDevPaymentEventRequest(req("Bearer wrong-secret-value-here-32ch"))
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ status: "unauthorized" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("runs only the payment-event queue when the gate and bearer agree", async () => {
    apply(preview)
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "job_heartbeat_v1") return { status: "success" }
      if (name === "dev_payment_event_candidates_v1") return { status: "success", events: [] }
      throw new Error(name)
    })
    const response = await runDevPaymentEventRequest(req(`Bearer ${secret}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "success", claimed: 0, succeeded: 0, retried: 0, deadLettered: 0, released: 0, skipped: 0,
    })
    const names = mocks.rpc.mock.calls.map(call => call[0])
    expect(names).toEqual([
      "job_heartbeat_v1",
      "dev_payment_event_candidates_v1",
      "job_heartbeat_v1",
      "job_heartbeat_v1",
    ])
    expect(names).not.toContain("job_promote_outbox_v1")
    expect(names).not.toContain("job_claim_batch_v1")
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(secret)
  })
})
