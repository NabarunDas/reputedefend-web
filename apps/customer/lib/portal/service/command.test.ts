import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

import { portalServiceCommand } from "./command"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "c".repeat(64)
const selector = `ca-${"ab".repeat(32)}`

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/portal/service`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${portalSessionCookieName()}=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const accept = {
  reference: "PR-26-ABCDEF",
  selector,
  operation: "accept_quote",
  confirmation: { accepted: true },
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("portal service command", () => {
  it("stays closed when the portal gate is off and rejects unexpected keys", async () => {
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect((await portalServiceCommand(req(accept))).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    const extra = await portalServiceCommand(req({ ...accept, actionId: "11111111-1111-4111-8111-111111111111" }))
    expect(extra.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("sends the portal hash, public reference, selector and confirmation only", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "success" })
    const response = await portalServiceCommand(req(accept))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "success" })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_service_command_v1", {
      p_token_hash: `hash-${token.slice(0, 8)}`,
      p_request: key,
      p_reference: "PR-26-ABCDEF",
      p_selector: selector,
      p_operation: "accept_quote",
      p_data: { accepted: true },
    })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/customerId|caseId|quoteId|actionId/)
  })

  it("keeps missing, unsigned, stale, denied and failed outcomes distinct", async () => {
    const missing = await portalServiceCommand(req({ ...accept, reference: "not-a-case" }))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ message: "We couldn't find that case." })

    const unsigned = await portalServiceCommand(req({ ...accept, confirmation: {} }))
    expect(unsigned.status).toBe(400)
    expect(await unsigned.json()).toMatchObject({ message: "Confirm this step before continuing." })

    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    const stale = await portalServiceCommand(req(accept))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ message: "This page is out of date. Refresh it and try again." })

    mocks.rpc.mockResolvedValueOnce({ status: "denied" })
    const denied = await portalServiceCommand(req(accept))
    expect(denied.status).toBe(401)
    expect(await denied.json()).toMatchObject({ message: "This quote is no longer available to accept." })

    mocks.rpc.mockResolvedValueOnce({ status: "unavailable" })
    const gone = await portalServiceCommand(req({ ...accept, operation: "decline_quote", confirmation: { confirmed: true } }))
    expect(gone.status).toBe(401)
    expect(await gone.json()).toMatchObject({ message: "This action is no longer available." })

    mocks.rpc.mockResolvedValueOnce(null)
    expect((await portalServiceCommand(req(accept))).status).toBe(401)

    mocks.rpc.mockRejectedValueOnce(new Error("relation customer_actions does not exist"))
    const failed = await portalServiceCommand(req(accept))
    const body = await failed.json()
    expect(failed.status).toBe(503)
    expect(body.message).toBe("We couldn't complete that step. Please try again shortly.")
    expect(JSON.stringify(body)).not.toMatch(/customer_actions|SQL|supabase|uuid/i)
  })

  it("forwards separate quote acknowledgements and rejects a caller-supplied quote id", async () => {
    const hash = "0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4"
    mocks.rpc.mockResolvedValueOnce({ status: "success" })
    const rich = await portalServiceCommand(req({
      ...accept,
      confirmation: {
        accepted: true,
        businessPurpose: { accepted: true },
        terms: { accepted: true, version: "PS-2026-10-14.2", hash },
        feeBasis: null,
      },
    }))
    expect(rich.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_service_command_v1", expect.objectContaining({
      p_data: {
        accepted: true,
        businessPurpose: { accepted: true },
        terms: { accepted: true, version: "PS-2026-10-14.2", hash },
        feeBasis: null,
      },
    }))
    mocks.rpc.mockClear()
    const injected = await portalServiceCommand(req({
      ...accept,
      confirmation: {
        accepted: true,
        quoteVersionId: "11111111-1111-4111-8111-111111111111",
        businessPurpose: { accepted: true },
        terms: { accepted: true, version: "PS-2026-10-14.2", hash },
        feeBasis: null,
      },
    }))
    expect(injected.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("refuses a foreign origin and an agreement confirmation on a quote accept", async () => {
    const foreign = await portalServiceCommand(req(accept, { origin: "https://evil.example" }))
    expect(foreign.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    const wrong = await portalServiceCommand(req({ ...accept, confirmation: { confirmed: true } }))
    expect(wrong.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("queues one Guided payment email after acceptance and still accepts when that queue fails", async () => {
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
        quotationSnapshot: { serviceName: "Guided Relaunch", caseReference: "PR-26-ABCDEF" },
      },
    }
    const hash = createHash("sha1").update(`guided-payment-request:${key}`).digest()
    hash[6] = (hash[6] & 0x0f) | 0x50
    hash[8] = (hash[8] & 0x3f) | 0x80
    const requestId = hash.subarray(0, 16).toString("hex")
    const paymentRequest = `${requestId.slice(0, 8)}-${requestId.slice(8, 12)}-${requestId.slice(12, 16)}-${requestId.slice(16, 20)}-${requestId.slice(20, 32)}`
    vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
    vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
    vi.stubEnv("COMMUNICATIONS_REPLY_TO_EMAIL", "cases@profilerelaunch.com")
    vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "monitored")
    mocks.rpc.mockResolvedValueOnce(accepted).mockResolvedValueOnce({ status: "success" })
    const response = await portalServiceCommand(req(accept))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "success" })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    const queued = mocks.rpc.mock.calls[1]
    expect(queued[0]).toBe("customer_queue_guided_payment_request_v1")
    expect(queued[1]).toMatchObject({
      p_token_hash: `hash-${token.slice(0, 8)}`,
      p_request: paymentRequest,
      p_payload: {
        serviceOrderId: orderId,
        customerOrigin: origin,
        fromAddress: "ops@example.com",
        replyTo: "cases@profilerelaunch.com",
        sendEnabled: true,
      },
    })
    const payload = queued[1].p_payload as { subject: string; bodyText: string; bodyHtml: string }
    const paymentsUrl = `${origin}/portal/cases/PR-26-ABCDEF/payments`
    expect(payload.subject).toContain("SO-26-ABCDEF")
    expect(payload.bodyText).toContain("Pay £99.00 securely")
    expect(payload.bodyText).toContain("£99.00 GBP")
    expect(payload.bodyText).toContain(paymentsUrl)
    expect(payload.bodyText).toContain("simply reply to this email")
    expect(payload.bodyHtml).toContain(paymentsUrl)
    expect(`${payload.bodyText}\n${payload.bodyHtml}`).not.toMatch(/#t=|\/action\//)
    expect(JSON.stringify(queued[1])).not.toMatch(/useCurrentVersion|dispatchHoldSeconds|RESEND|actionUrl/)
    mocks.rpc.mockClear()
    mocks.rpc.mockResolvedValueOnce(accepted).mockResolvedValueOnce({ status: "success", replay: true })
    expect((await portalServiceCommand(req(accept))).status).toBe(200)
    expect(mocks.rpc.mock.calls[1][1].p_request).toBe(paymentRequest)

    mocks.rpc.mockReset()
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    mocks.rpc.mockResolvedValueOnce(accepted)
    expect((await portalServiceCommand(req(accept))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    vi.stubEnv("JOB_WORKER_ENABLED", "true")
    mocks.rpc.mockResolvedValueOnce(accepted).mockResolvedValueOnce({ status: "success" })
    expect((await portalServiceCommand(req(accept))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(3)

    mocks.rpc.mockReset()
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    mocks.rpc.mockResolvedValueOnce({
      ...accepted,
      snapshot: { ...accepted.snapshot, serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", amountMinor: 29900 },
    })
    expect((await portalServiceCommand(req(accept))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)

    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValueOnce(accepted).mockRejectedValueOnce(new Error("relation communications does not exist"))
    const failedQueue = await portalServiceCommand(req(accept))
    const failedBody = await failedQueue.json()
    expect(failedQueue.status).toBe(200)
    expect(failedBody).toEqual({ status: "success" })
    expect(JSON.stringify(failedBody)).not.toMatch(/communications|SQL/)

    mocks.rpc.mockReset()
    vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "")
    mocks.rpc.mockResolvedValueOnce({
      ...accepted,
      snapshot: { ...accepted.snapshot, amountMinor: 7920 },
    })
    expect((await portalServiceCommand(req(accept))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
