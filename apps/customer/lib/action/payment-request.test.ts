import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "@/lib/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

import { command } from "./http"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "a".repeat(64)

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/action/command`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const accept = { operation: "accept", accepted: true }
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

function paymentRequest() {
  const hash = createHash("sha1").update(`guided-payment-request:${key}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const id = hash.subarray(0, 16).toString("hex")
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`
}

function enableMail() {
  vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
  vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_EMAIL", "cases@profilerelaunch.com")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "monitored")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("quotation acceptance payment request", () => {
  it("queues one immediate action-session payment email after Guided acceptance", async () => {
    enableMail()
    mocks.rpc.mockResolvedValueOnce(accepted).mockResolvedValueOnce({ status: "success", replay: false })
    const response = await command(req(accept))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok", message: "This action is complete." })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc.mock.calls[0][0]).toBe("customer_action_command_v1")
    const queued = mocks.rpc.mock.calls[1]
    expect(queued[0]).toBe("customer_action_queue_guided_payment_request_v1")
    expect(queued[1]).toMatchObject({
      p_token_hash: `hash-${token.slice(0, 8)}`,
      p_request: paymentRequest(),
      p_payload: {
        serviceOrderId: orderId,
        customerOrigin: origin,
        fromAddress: "ops@example.com",
        replyTo: "cases@profilerelaunch.com",
        sendEnabled: true,
      },
    })
    const payload = queued[1].p_payload as { subject: string; bodyText: string; bodyHtml: string }
    expect(payload.subject).toBe("Pay for your ProfileRelaunch Guided Relaunch — SO-26-ABCDEF")
    expect(payload.bodyText).toContain("Business: North Bakery")
    expect(payload.bodyText).toContain("Case reference: PR-26-ABCDEF")
    expect(payload.bodyText).toContain("Amount: £99.00 GBP")
    expect(payload.bodyText).toContain("Pay £99.00 securely")
    expect(payload.bodyText).toContain(`${origin}/portal/cases/PR-26-ABCDEF/payments`)
    expect(payload.bodyText).toContain("Opening this email does not start a card payment.")
    expect(`${payload.bodyText}\n${payload.bodyHtml}`).not.toMatch(/#t=|\/action\/|payment is complete|already paid/i)
    expect(JSON.stringify(queued[1])).not.toMatch(/useCurrentVersion|dispatchHoldSeconds|actorType|actionUrl|customer_queue_guided_payment_request_v1/)
  })

  it("reuses the same payment-request id when the acceptance command is replayed", async () => {
    enableMail()
    mocks.rpc.mockResolvedValueOnce(accepted).mockResolvedValueOnce({ status: "success" })
    expect((await command(req(accept))).status).toBe(200)
    mocks.rpc.mockResolvedValueOnce(accepted).mockResolvedValueOnce({ status: "success", replay: true })
    expect((await command(req(accept))).status).toBe(200)
    const requests = mocks.rpc.mock.calls.filter(call => call[0] === "customer_action_queue_guided_payment_request_v1")
    expect(requests).toHaveLength(2)
    expect(requests[0][1].p_request).toBe(paymentRequest())
    expect(requests[1][1].p_request).toBe(paymentRequest())
  })

  it("does not queue a second email when acceptance has no snapshot, and leaves acceptance intact when queueing fails", async () => {
    enableMail()
    mocks.rpc.mockResolvedValueOnce({ status: "success", orderId, orderRef: "SO-26-ABCDEF" })
    expect((await command(req(accept))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)

    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValueOnce({
      ...accepted,
      snapshot: { ...accepted.snapshot, serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", amountMinor: 29900 },
    })
    expect((await command(req(accept))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)

    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValueOnce(accepted).mockRejectedValueOnce(new Error("relation communications does not exist"))
    const failed = await command(req(accept))
    const body = await failed.json()
    expect(failed.status).toBe(200)
    expect(body).toEqual({ status: "ok", message: "This action is complete." })
    expect(JSON.stringify(body)).not.toMatch(/communications|SQL/)

    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValueOnce({ status: "success" })
    expect((await command(req({ operation: "decline" }))).status).toBe(200)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_action_command_v1"])
  })

  it("does not queue when outgoing mail is not confirmed", async () => {
    mocks.rpc.mockResolvedValueOnce(accepted)
    expect((await command(req(accept))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
