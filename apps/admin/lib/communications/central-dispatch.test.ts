import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  verify: vi.fn(),
  send: vi.fn(),
}))

vi.mock("@/lib/auth/backend", () => ({ backend: () => ({ rpc: mocks.rpc }) }))
vi.mock("@vercel/oidc", () => ({
  verifyVercelOidcToken: (...args: unknown[]) => mocks.verify(...args),
}))
vi.mock("./mail", async () => {
  const actual = await vi.importActual<typeof import("./mail")>("./mail")
  return { ...actual, resolveMailProvider: () => ({ send: mocks.send }) }
})

import { readFileSync } from "node:fs"
import { centralDispatchCommand, dispatchPublishedPackMail, dispatchQueuedMailRequest } from "./central-dispatch"

const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const communicationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const token = "oidc-test-token-value-0123456789"

function lane() {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
  vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
  vi.stubEnv("AWS_EVIDENCE_BUCKET", "profilerelaunch-evidence-dev-01")
  vi.stubEnv("CUSTOMER_ORIGIN", portal)
  vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
  vi.stubEnv("JOB_PROVIDER_MODE", "production")
  vi.stubEnv("RESEND_API_KEY", "re_dev_placeholder")
  vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
  vi.stubEnv("VERCEL_ORG_ID", "team_test")
  vi.stubEnv("DEV_MAIL_DISPATCH_WORKER_ENABLED", "")
}

function customerToken() {
  mocks.verify.mockResolvedValue({
    payload: {
      owner_id: "team_test",
      environment: "preview",
      sub: "owner:team_test:project:profilerelaunch-customer:environment:preview",
    },
  })
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/mail/dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-trusted-oidc-idp-token": token,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function claim() {
  return {
    status: "success",
    replay: false,
    jobType: "SEND_EMAIL",
    jobId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    idempotencyKey: `send-email:${communicationId}:v1`,
    leaseToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    payload: { communicationId, contentVersion: 1 },
  }
}

function loaded() {
  const page = `${portal}/portal/cases/PR-26-ABCDEF/payments`
  return {
    status: "success",
    lifecycle: "QUEUED",
    contentLocked: true,
    recipient: "alex@example.com",
    subject: "Pay now",
    bodyText: `Pay at ${page}`,
    bodyHtml: `<p>Pay at ${page}</p>`,
    templateKey: "GUIDED_PAYMENT_REQUEST",
    deliveryStatus: "NONE",
    contentVersion: 1,
    senderAddress: "ops@example.com",
    customerOrigin: portal,
  }
}

beforeEach(() => {
  lane()
  customerToken()
  mocks.rpc.mockReset()
  mocks.verify.mockClear()
  mocks.send.mockReset()
  mocks.send.mockResolvedValue({ ok: true, providerMessageId: "msg_test", replay: false })
})
afterEach(() => vi.unstubAllEnvs())

describe("central mail dispatch", () => {
  it("sends one stored request with the Admin provider and hides the credential", async () => {
    const calls: string[] = []
    mocks.rpc.mockImplementation(async (name: string) => {
      calls.push(name)
      if (name === "dev_mail_dispatch_claim_request_v1") return claim()
      if (name === "communication_load_send_v1") return loaded()
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-30T12:00:00.000Z" }
      }
      if (name === "communication_mark_provider_accepted_v1" || name === "job_complete_v1") return { status: "success" }
      throw new Error(`unexpected ${name}`)
    })
    const response = await centralDispatchCommand(post({ requestId }))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({ status: "accepted" })
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.verify.mock.calls[0][1]).toMatchObject({
      projectId: "*",
      environment: "preview",
      ownerId: "team_test",
    })
    expect(mocks.rpc.mock.calls[0]).toEqual(["dev_mail_dispatch_claim_request_v1", {
      p_request: requestId,
      p_customer_origin: portal,
    }])
    expect(calls).toEqual([
      "dev_mail_dispatch_claim_request_v1",
      "communication_load_send_v1",
      "communication_begin_provider_attempt_v1",
      "communication_mark_provider_accepted_v1",
      "job_complete_v1",
    ])
    expect(JSON.stringify(payload)).not.toMatch(/re_dev_placeholder|alex@example.com/)
    expect(process.env.DEV_MAIL_DISPATCH_WORKER_ENABLED).toBe("")
  })

  it("does not send again for a live lease, a processed job, or unknown provider acceptance", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "conflict", reason: "leased" })
    const leased = await centralDispatchCommand(post({ requestId }))
    expect(leased.status).toBe(409)
    expect(await leased.json()).toEqual({ status: "conflict" })

    mocks.rpc.mockResolvedValueOnce({ status: "denied", reason: "already_processed" })
    const done = await centralDispatchCommand(post({ requestId }))
    expect(done.status).toBe(200)
    expect(await done.json()).toEqual({ status: "accepted" })

    mocks.rpc.mockResolvedValueOnce({ status: "denied", reason: "acceptance_unknown" })
    const unknown = await centralDispatchCommand(post({ requestId }))
    expect(unknown.status).toBe(409)
    expect(await unknown.json()).toEqual({ status: "unknown" })

    mocks.rpc.mockResolvedValueOnce({ status: "denied", reason: "not_ready" })
    const held = await centralDispatchCommand(post({ requestId }))
    expect(held.status).toBe(200)
    expect(await held.json()).toEqual({ status: "held" })

    mocks.rpc.mockResolvedValueOnce({ status: "denied", reason: "already_paid" })
    const paid = await centralDispatchCommand(post({ requestId }))
    expect(paid.status).toBe(409)
    expect(await paid.json()).toEqual({ status: "paid" })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("records a retryable unknown provider result and does not send a second time from the route", async () => {
    mocks.send.mockResolvedValue({ ok: false, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown" })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "dev_mail_dispatch_claim_request_v1") return claim()
      if (name === "communication_load_send_v1") return loaded()
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-30T12:00:00.000Z" }
      }
      if (name === "communication_mark_acceptance_unknown_v1" || name === "job_fail_v1") return { status: "success" }
      throw new Error(`unexpected ${name}`)
    })
    const response = await centralDispatchCommand(post({ requestId }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "retry" })
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toContain("communication_mark_acceptance_unknown_v1")
    mocks.send.mockClear()
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "acceptance_unknown" })
    const again = await centralDispatchCommand(post({ requestId }))
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ status: "unknown" })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("rejects a body that names a recipient, a communication, or any extra field", async () => {
    for (const body of [
      { requestId, recipient: "alex@example.com" },
      { requestId, communicationId },
      { requestId, customerOrigin: portal },
      {},
      { requestId: "not-a-uuid" },
    ]) {
      const response = await centralDispatchCommand(post(body))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ status: "unavailable" })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("leases one published pack and does not send a second copy", async () => {
    const packId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "dev_mail_dispatch_claim_pack_v1") return claim()
      if (name === "communication_load_send_v1") return loaded()
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-30T12:00:00.000Z" }
      }
      if (name === "communication_mark_provider_accepted_v1" || name === "job_complete_v1") return { status: "success" }
      throw new Error(`unexpected ${name}`)
    })
    expect(await dispatchPublishedPackMail(packId)).toBe("accepted")
    expect(mocks.rpc.mock.calls[0]).toEqual(["dev_mail_dispatch_claim_pack_v1", {
      p_pack: packId,
      p_customer_origin: portal,
    }])
    expect(mocks.send).toHaveBeenCalledTimes(1)
    mocks.send.mockClear()
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "already_processed" })
    expect(await dispatchPublishedPackMail(packId)).toBe("accepted")
    expect(mocks.send).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ status: "conflict", reason: "leased" })
    expect(await dispatchPublishedPackMail(packId)).toBe("conflict")
    expect(process.env.DEV_MAIL_DISPATCH_WORKER_ENABLED).toBe("")
    const page = readFileSync(new URL("../../app/cases/[id]/journey/page.tsx", import.meta.url), "utf8")
    expect(page).not.toContain("recoverPublishedCustomerMail")
    expect(page).not.toContain("dispatchPublishedPackMail")
    expect(page).not.toContain("dev_mail_dispatch_claim")
  })

  it("keeps a failed pack send retryable and stays closed off the develop lane", async () => {
    const packId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    mocks.send.mockResolvedValue({ ok: false, retryable: true, error: "temporary" })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "dev_mail_dispatch_claim_pack_v1") return claim()
      if (name === "communication_load_send_v1") return loaded()
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-30T12:00:00.000Z" }
      }
      if (name === "communication_mark_provider_rejected_v1" || name === "job_fail_v1") return { status: "success" }
      throw new Error(`unexpected ${name}`)
    })
    expect(await dispatchPublishedPackMail(packId)).toBe("retry")
    expect(mocks.rpc.mock.calls.map(call => call[0])).toContain("job_fail_v1")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(await dispatchPublishedPackMail(packId)).toBe("disabled")
  })

  it("accepts only a Customer preview token and stays closed off the develop lane", async () => {
    mocks.verify.mockResolvedValue({
      payload: {
        owner_id: "team_test",
        environment: "preview",
        sub: "owner:team_test:project:profilerelaunch-admin:environment:preview",
      },
    })
    const otherProject = await centralDispatchCommand(post({ requestId }))
    expect(otherProject.status).toBe(401)
    mocks.verify.mockRejectedValue(new Error("bad token"))
    const bad = await centralDispatchCommand(post({ requestId }))
    expect(bad.status).toBe(401)
    const missing = await centralDispatchCommand(post({ requestId }, { "x-vercel-trusted-oidc-idp-token": "" }))
    expect(missing.status).toBe(401)
    vi.stubEnv("VERCEL_ORG_ID", "")
    customerToken()
    const noTeam = await centralDispatchCommand(post({ requestId }))
    expect(noTeam.status).toBe(401)
    vi.stubEnv("VERCEL_ENV", "production")
    const production = await centralDispatchCommand(post({ requestId }))
    expect(production.status).toBe(404)
    expect(await production.json()).toEqual({ status: "disabled" })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(await dispatchQueuedMailRequest({
      requestId,
      provider: { async send() { throw new Error("must not send") } },
    })).toBe("disabled")
  })
})
