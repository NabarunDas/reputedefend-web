import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { readFileSync } from "node:fs"

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
}))

vi.mock("@/lib/auth/backend", () => ({ backend: () => mocks }))
vi.mock("../communications/mail", async () => {
  const actual = await vi.importActual<typeof import("../communications/mail")>("../communications/mail")
  return { ...actual, resolveMailProvider: () => ({ send: mocks.send }) }
})

import { devMailPackRetryBlock, runDevMailPackRetry, runDevMailPackRetryRequest } from "./dev-mail-pack-retry"

const secret = "d".repeat(32)
const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const preview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  CUSTOMER_ORIGIN: portal,
  COMMUNICATIONS_SEND_ENABLED: "true",
  JOB_PROVIDER_MODE: "production",
  RESEND_API_KEY: "re_dev_placeholder",
  COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
  DEV_MAIL_DISPATCH_WORKER_SECRET: secret,
}

const communicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function claim() {
  return {
    status: "success",
    replay: false,
    jobId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    jobType: "SEND_EMAIL",
    idempotencyKey: `send-email:${communicationId}:v1`,
    leaseToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    payload: { communicationId, contentVersion: 1 },
  }
}

function loaded() {
  return {
    status: "success",
    lifecycle: "QUEUED",
    contentLocked: true,
    recipient: "alex@example.com",
    subject: "Your pack is ready",
    bodyText: `https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal/cases/PR-26-PACK2A/documents`,
    bodyHtml: `<p>https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal/cases/PR-26-PACK2A/documents</p>`,
    templateKey: "GUIDED_PACK_READY",
    deliveryStatus: "NONE",
    contentVersion: 1,
    senderAddress: "ops@example.com",
    suppressed: false,
  }
}

describe("Guided pack retry", () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.send.mockReset()
    mocks.send.mockResolvedValue({ ok: true, providerMessageId: "re_msg_1" })
    for (const [key, value] of Object.entries(preview)) vi.stubEnv(key, value)
    vi.stubEnv("DEV_MAIL_DISPATCH_WORKER_ENABLED", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("stays closed without the bearer and does not read the general worker flag", () => {
    expect(devMailPackRetryBlock(preview)).toBeNull()
    expect(devMailPackRetryBlock({ ...preview, DEV_MAIL_DISPATCH_WORKER_ENABLED: undefined })).toBeNull()
    expect(devMailPackRetryBlock({ ...preview, DEV_MAIL_DISPATCH_WORKER_ENABLED: "false" })).toBeNull()
    expect(devMailPackRetryBlock({ ...preview, DEV_MAIL_DISPATCH_WORKER_SECRET: undefined })).toBe("missing_secret")
    expect(devMailPackRetryBlock({ ...preview, VERCEL_ENV: "production" })).toBe("wrong_environment")
    const source = readFileSync(new URL("./dev-mail-pack-retry.ts", import.meta.url), "utf8")
    expect(source).not.toContain("DEV_MAIL_DISPATCH_WORKER_ENABLED")
    expect(source).not.toContain("dev_mail_dispatch_claim_v1")
    expect(source).not.toContain("dev_mail_dispatch_candidates_v1")
    expect(source).toContain("dev_mail_dispatch_claim_pack_retry_v1")
  })

  it("retries one due pack job and does not send when nothing is due", async () => {
    let claims = 0
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "dev_mail_dispatch_claim_pack_retry_v1") {
        claims += 1
        return claims === 1 ? claim() : { status: "denied", reason: "not_queued" }
      }
      if (name === "communication_load_send_v1") return loaded()
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-31T10:00:00.000Z" }
      }
      if (name === "communication_mark_provider_accepted_v1" || name === "job_complete_v1") return { status: "success" }
      throw new Error(`unexpected ${name}`)
    })
    const ran = await runDevMailPackRetry({ rpc: mocks, mailProvider: { send: mocks.send } })
    expect(ran.status).toBe("success")
    expect(ran.counts.claimed).toBe(1)
    expect(ran.counts.succeeded).toBe(1)
    expect(mocks.rpc.mock.calls[0][0]).toBe("dev_mail_dispatch_claim_pack_retry_v1")
    expect(mocks.rpc.mock.calls.map(call => call[0])).not.toContain("dev_mail_dispatch_claim_v1")
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "not_queued" })
    mocks.send.mockClear()
    const idle = await runDevMailPackRetry({ rpc: mocks, mailProvider: { send: mocks.send } })
    expect(idle.counts.claimed).toBe(0)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("keeps a temporary provider failure retryable without a second communication", async () => {
    mocks.send.mockResolvedValue({ ok: false, retryable: true, error: "temporary" })
    let claims = 0
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "dev_mail_dispatch_claim_pack_retry_v1") {
        claims += 1
        return claims === 1 ? claim() : { status: "denied", reason: "not_queued" }
      }
      if (name === "communication_load_send_v1") return loaded()
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-31T10:00:00.000Z" }
      }
      if (name === "job_fail_v1") return { status: "success", jobStatus: "RETRY" }
      throw new Error(`unexpected ${name}`)
    })
    const ran = await runDevMailPackRetry({ rpc: mocks, mailProvider: { send: mocks.send } })
    expect(ran.counts.retried).toBe(1)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toContain("job_fail_v1")
    expect(mocks.rpc.mock.calls.filter(call => call[0] === "dev_mail_dispatch_claim_pack_retry_v1")).toHaveLength(2)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it("does not send when provider acceptance is unknown", async () => {
    mocks.send.mockResolvedValue({ ok: false, retryable: false, acceptanceUnknown: true, error: "unknown" })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "dev_mail_dispatch_claim_pack_retry_v1") {
        return { status: "denied", reason: "acceptance_unknown" }
      }
      throw new Error(`unexpected ${name}`)
    })
    const ran = await runDevMailPackRetry({ rpc: mocks, mailProvider: { send: mocks.send } })
    expect(ran.counts.claimed).toBe(0)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("refuses a browser request and a closed lane before it reads the queue", async () => {
    const closed = await runDevMailPackRetryRequest(new NextRequest("https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/jobs/dev-mail-pack-retry"))
    expect(closed.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    vi.stubEnv("VERCEL_ENV", "production")
    const production = await runDevMailPackRetryRequest(new NextRequest("https://admin.profilerelaunch.com/api/internal/jobs/dev-mail-pack-retry", {
      headers: { authorization: `Bearer ${secret}` },
    }))
    expect(production.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
