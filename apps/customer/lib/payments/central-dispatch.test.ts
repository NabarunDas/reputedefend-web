import { createHash } from "node:crypto"
import { readFileSync as readSource } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetchImpl: vi.fn() }))
vi.mock("@/lib/backend", () => ({
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: async () => "oidc-test-token",
}))

import { customerDispatchLaneOpen, requestCentralDispatch } from "./central-dispatch"
import { queueAcceptedGuidedPayment } from "./queue-accepted-guided-payment"

const teamOrigin = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const orderId = "44444444-4444-4444-8444-444444444444"
const accepted = {
  status: "success",
  orderId,
  orderRef: "SO-26-ABCDEF",
  snapshot: {
    serviceCode: "GUIDED_RELAUNCH",
    paymentModel: "UPFRONT",
    amountMinor: 9900,
    currency: "GBP",
    quotationSnapshot: {
      serviceName: "Guided Relaunch",
      caseReference: "PR-26-ABCDEF",
      businessName: "North Bakery",
    },
  },
}

function paymentRequest(key: string) {
  const hash = createHash("sha1").update(`guided-payment-request:${key}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const id = hash.subarray(0, 16).toString("hex")
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`
}

const identity = {
  status: "success",
  customerOrigin: teamOrigin,
  fromAddress: "quotes@profilerelaunch.com",
  replyTo: "cases@profilerelaunch.com",
}

function openLane() {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-customer-git-develop-clientcove.vercel.app")
  vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
  vi.stubEnv("CUSTOMER_ORIGIN", "")
  vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "")
  vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_EMAIL", "")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "")
  vi.stubEnv("JOB_WORKER_ENABLED", "")
  vi.stubEnv("RESEND_API_KEY", "")
  vi.stubEnv("JOB_PROVIDER_MODE", "")
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.fetchImpl.mockReset()
  openLane()
})
afterEach(() => vi.unstubAllEnvs())

describe("central payment dispatch", () => {
  it("posts only the stored request id to the Admin develop dispatcher", async () => {
    expect(customerDispatchLaneOpen()).toBe(true)
    mocks.fetchImpl.mockResolvedValue(new Response(JSON.stringify({ status: "accepted" }), { status: 200 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("provider_accepted")
    expect(mocks.fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = mocks.fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://profilerelaunch-admin-git-develop-clientcove.vercel.app/api/internal/mail/dispatch")
    expect(init.method).toBe("POST")
    expect(init.body).toBe(JSON.stringify({ requestId }))
    expect(JSON.parse(String(init.body))).toEqual({ requestId })
    expect((init.headers as Record<string, string>)["x-vercel-trusted-oidc-idp-token"]).toBe("oidc-test-token")
    expect(String(init.body)).not.toMatch(/@|recipient|communication|origin/i)
  })

  it("does not call Admin when the lane is closed or the token is missing", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main")
    expect(customerDispatchLaneOpen()).toBe(false)
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("dispatch_not_configured")
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: null })).toBe("dispatch_not_configured")
    openLane()
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: null })).toBe("dispatch_not_configured")
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
    mocks.fetchImpl.mockResolvedValueOnce(new Response("no", { status: 401 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("queue_unavailable")
    mocks.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ status: "disabled" }), { status: 404 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("dispatch_not_configured")
    mocks.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ status: "unknown" }), { status: 409 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("acceptance_unknown")
    mocks.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ status: "dead" }), { status: 409 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("provider_dead")
    mocks.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ status: "conflict" }), { status: 409 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("dispatch_conflict")
    mocks.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ status: "paid" }), { status: 409 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("already_paid")
    mocks.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ status: "held" }), { status: 200 }))
    expect(await requestCentralDispatch({ requestId, fetchImpl: mocks.fetchImpl, oidcToken: "oidc-test-token" })).toBe("dispatch_held")
    expect(mocks.fetchImpl).toHaveBeenCalledTimes(7)
  })

  it("queues both acceptance routes and asks Admin to dispatch the same request", async () => {
    const key = "33333333-3333-4333-8333-333333333333"
    vi.stubGlobal("fetch", mocks.fetchImpl)
    mocks.fetchImpl.mockImplementation(async () => new Response(JSON.stringify({ status: "accepted" }), { status: 200 }))
    mocks.rpc.mockResolvedValueOnce(identity).mockResolvedValueOnce({ status: "success" }).mockResolvedValueOnce({ status: "recorded" })
    await queueAcceptedGuidedPayment({
      token: "a".repeat(64),
      acceptanceKey: key,
      result: accepted,
      rpc: "customer_queue_guided_payment_request_v1",
    })
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_guided_payment_mail_identity_v1",
      "customer_queue_guided_payment_request_v1",
      "customer_record_guided_payment_handover_v1",
    ])
    const queued = mocks.rpc.mock.calls[1][1] as { p_payload: Record<string, unknown> }
    expect(queued.p_payload).not.toHaveProperty("fromAddress")
    expect(queued.p_payload).not.toHaveProperty("replyTo")
    expect(queued.p_payload).not.toHaveProperty("customerOrigin")
    expect(queued.p_payload).not.toHaveProperty("sendEnabled")
    expect(String(queued.p_payload.bodyText)).toContain(`${teamOrigin}/portal/cases/PR-26-ABCDEF/payments`)
    expect(mocks.rpc.mock.calls[2][1]).toMatchObject({
      p_request: paymentRequest(key),
      p_reason: "provider_accepted",
      p_service_order: orderId,
    })
    expect(JSON.parse(String((mocks.fetchImpl.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      requestId: paymentRequest(key),
    })

    mocks.rpc.mockResolvedValueOnce(identity).mockResolvedValueOnce({ status: "success" }).mockResolvedValueOnce({ status: "recorded" })
    await queueAcceptedGuidedPayment({
      token: "b".repeat(64),
      acceptanceKey: key,
      result: accepted,
      rpc: "customer_action_queue_guided_payment_request_v1",
    })
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_reason: "provider_accepted" })

    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-customer-git-feature-clientcove.vercel.app")
    mocks.fetchImpl.mockClear()
    mocks.rpc.mockResolvedValueOnce(identity).mockResolvedValueOnce({ status: "success" }).mockResolvedValueOnce({ status: "recorded" })
    await queueAcceptedGuidedPayment({
      token: "c".repeat(64),
      acceptanceKey: key,
      result: accepted,
      rpc: "customer_action_queue_guided_payment_request_v1",
    })
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_reason: "dispatch_not_configured" })

    mocks.rpc.mockResolvedValueOnce(identity).mockResolvedValueOnce({ status: "success" })
    await queueAcceptedGuidedPayment({
      token: "d".repeat(64),
      acceptanceKey: key,
      result: accepted,
      rpc: "customer_queue_guided_payment_request_v1",
    })
    expect(mocks.rpc.mock.calls.at(-1)?.[0]).toBe("customer_queue_guided_payment_request_v1")
    expect(mocks.fetchImpl).not.toHaveBeenCalled()
  })

  it("does not give the Customer app a Resend credential or a second provider", () => {
    const dispatch = readSource(new URL("./central-dispatch.ts", import.meta.url), "utf8")
    const queue = readSource(new URL("./queue-accepted-guided-payment.ts", import.meta.url), "utf8")
    const pkg = readSource(new URL("../../package.json", import.meta.url), "utf8")
    expect(dispatch).not.toMatch(/RESEND_API_KEY|JOB_PROVIDER_MODE|CUSTOMER_ORIGIN|from \"resend\"/)
    expect(queue).not.toMatch(/RESEND_API_KEY|JOB_PROVIDER_MODE|CUSTOMER_ORIGIN|COMMUNICATIONS_|JOB_WORKER_ENABLED|from \"resend\"/)
    expect(pkg).not.toContain("\"resend\"")
    expect(pkg).toContain("\"@vercel/oidc\"")
  })
})
