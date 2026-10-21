import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "@/lib/auth/config"
import { devSendEmailCommand, fenceDevSendRpc, type DevSendClaim } from "./dev-send"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
}))

const origin = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const key = "33333333-3333-4333-8333-333333333333"
const communicationId = "55555555-5555-4555-8555-555555555555"
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const lease = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const session = "a".repeat(64)
const linkSecret = "communication-link-secret-for-tests-32b"
const resendKey = "re_dev_placeholder"

const lane = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  SUPABASE_SECRET_KEY: "test-secret",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  CUSTOMER_ORIGIN: portal,
  ADMIN_AUTH_ENABLED: "true",
  COMMUNICATIONS_SEND_ENABLED: "true",
  JOB_PROVIDER_MODE: "production",
  RESEND_API_KEY: resendKey,
  COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
  COMMUNICATIONS_LINK_SECRET: linkSecret,
  JOB_WORKER_CADENCE_SECONDS: "86400",
}

function req(body: unknown, headers: Record<string, string> = {}, url = `${origin}/api/operations/dev-send-email`) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      origin: new URL(url).origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${session}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function loaded(customerOrigin: string) {
  return {
    status: "success",
    lifecycle: "QUEUED",
    deliveryStatus: "NONE",
    contentLocked: true,
    contentVersion: 1,
    recipient: "alex@example.com",
    subject: "Evidence needed",
    bodyText: `Please upload at ${customerOrigin}/action/${actionId}`,
    bodyHtml: null,
    templateKey: "EVIDENCE_REQUEST",
    customerActionId: actionId,
    customerOrigin,
    senderAddress: "ops@example.com",
    linkKeyVersion: 1,
    firstProviderAttemptAt: null,
    suppressed: false,
  }
}

function claim(extra: Partial<DevSendClaim> = {}): DevSendClaim {
  return {
    status: "success",
    replay: false,
    jobId,
    jobType: "SEND_EMAIL",
    idempotencyKey: `send-email:${communicationId}:v1`,
    payload: { communicationId, contentVersion: 1 },
    leaseToken: lease,
    ...extra,
  }
}

beforeEach(() => {
  mocks.rpc.mockReset()
  for (const [name, value] of Object.entries(lane)) vi.stubEnv(name, value)
})
afterEach(() => vi.unstubAllEnvs())

describe("DEV queued email command", () => {
  it("stays unavailable outside the develop DEV lane and does not claim a job", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const hidden = await devSendEmailCommand(req({ communicationId, confirmed: true }))
    expect(hidden.status).toBe(404)
    expect(await hidden.json()).toEqual({ message: "Unavailable." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("requires a session and an exact confirmed body", async () => {
    const signedOut = await devSendEmailCommand(req({ communicationId, confirmed: true }, { cookie: "" }))
    expect(signedOut.status).toBe(401)
    const extra = await devSendEmailCommand(req({ communicationId, confirmed: true, recipient: "alex@example.com" }))
    expect(extra.status).toBe(400)
    const unconfirmed = await devSendEmailCommand(req({ communicationId, confirmed: false }))
    expect(unconfirmed.status).toBe(400)
    expect(await unconfirmed.json()).toEqual({ message: "Confirm the queued email before sending." })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(JSON.stringify(await extra.json())).not.toMatch(/alex@example.com/)
  })

  it("refuses to claim when the development sender is not configured", async () => {
    vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "")
    const closed = await devSendEmailCommand(req({ communicationId, confirmed: true }))
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({
      message: "Outgoing customer email is not enabled on this development preview. Reviewed drafts are preserved until the development sender, customer portal, and evidence bucket are configured.",
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not call the provider when the stored upload host is the production portal", async () => {
    const calls: string[] = []
    const send = vi.fn()
    mocks.rpc.mockImplementation(async (name: string) => {
      calls.push(name)
      if (name === "admin_dev_send_email_claim_v1") return claim()
      if (name === "communication_load_send_v1") return loaded("https://customer.profilerelaunch.com")
      if (name === "job_fail_v1") return { status: "success" }
      throw new Error(`unexpected ${name}`)
    })
    const response = await devSendEmailCommand(req({ communicationId, confirmed: true }), { provider: { send } })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: "The queued email was not accepted. It was not submitted again." })
    expect(send).not.toHaveBeenCalled()
    expect(calls).toEqual(["admin_dev_send_email_claim_v1", "communication_load_send_v1", "job_fail_v1"])
    expect(calls).not.toEqual(expect.arrayContaining(["job_promote_outbox_v1", "job_claim_batch_v1"]))
    const fail = mocks.rpc.mock.calls.find(call => call[0] === "job_fail_v1")
    expect(fail?.[1]).toMatchObject({ p_retryable: false, p_error: "Secure upload link cannot be materialised" })
  })

  it("submits one approved email through the durable job and hides credentials", async () => {
    const calls: string[] = []
    const send = vi.fn(async () => ({ ok: true as const, providerMessageId: "msg_test", replay: false }))
    mocks.rpc.mockImplementation(async (name: string) => {
      calls.push(name)
      if (name === "admin_dev_send_email_claim_v1") return claim()
      if (name === "communication_load_send_v1") return loaded(portal)
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-21T11:00:00.000Z" }
      }
      if (name === "communication_mark_provider_accepted_v1" || name === "job_complete_v1") return { status: "success" }
      throw new Error(`unexpected ${name}`)
    })
    const response = await devSendEmailCommand(req({ communicationId, confirmed: true }), { provider: { send } })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ message: "The queued email was submitted to the email provider." })
    expect(JSON.stringify(body)).not.toMatch(new RegExp(`${resendKey}|${linkSecret}|${session}|alex@example.com`))
    expect(send).toHaveBeenCalledTimes(1)
    const sent = send.mock.calls[0] as unknown as [{ idempotencyKey: string; text: string }]
    expect(sent[0].idempotencyKey).toBe(`send-email:${communicationId}:v1`)
    expect(sent[0].text).toContain(`${portal}/action/${actionId}#t=`)
    expect(sent[0].text).not.toContain("customer.profilerelaunch.com")
    expect(mocks.rpc.mock.calls[0]).toEqual(["admin_dev_send_email_claim_v1", {
      p_token: createHash("sha256").update(session).digest("hex"),
      p_request: key,
      p_communication: communicationId,
      p_confirmed: true,
      p_customer_origin: portal,
    }])
    expect(calls).not.toEqual(expect.arrayContaining([
      "job_promote_outbox_v1",
      "job_claim_batch_v1",
      "guard_enqueue_daily_reconcile_v1",
    ]))
  })

  it("does not send again when the same request is replayed", async () => {
    const send = vi.fn()
    mocks.rpc.mockResolvedValue(claim({ replay: true, currentJobStatus: "SUCCEEDED" }))
    const done = await devSendEmailCommand(req({ communicationId, confirmed: true }), { provider: { send } })
    expect(done.status).toBe(200)
    expect(await done.json()).toEqual({ message: "That queued email was already processed." })
    expect(send).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("leaves a job that is not SEND_EMAIL unchanged", async () => {
    const send = vi.fn()
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "not_send_email" })
    const refused = await devSendEmailCommand(req({ communicationId, confirmed: true }), { provider: { send } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ message: "That job is not an approved email and was left unchanged." })
    expect(send).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("blocks batch, payment and Guard calls inside the email handler", async () => {
    const calls: string[] = []
    const fenced = fenceDevSendRpc({
      async rpc<T>(name: string): Promise<T> {
        calls.push(name)
        return { status: "success" } as T
      },
    })
    await expect(fenced.rpc("job_promote_outbox_v1", {})).rejects.toThrow(/Only the queued email job/)
    await expect(fenced.rpc("job_claim_batch_v1", {})).rejects.toThrow(/Only the queued email job/)
    await expect(fenced.rpc("guard_enqueue_daily_reconcile_v1", {})).rejects.toThrow(/Only the queued email job/)
    expect(calls).toEqual([])
    await fenced.rpc("communication_load_send_v1", {})
    expect(calls).toEqual(["communication_load_send_v1"])
  })
})
