import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { handleResendInboundWebhook } from "./receive"
import { verifyResendSignature } from "../communications/webhook"

const secret = "whsec_" + Buffer.from("inbound-secret-bytes").toString("base64")
const origin = "https://admin.profilerelaunch.com"

function sign(body: string, id = "evt_inbound_1", timestamp = String(Math.floor(Date.now() / 1000))) {
  const expected = createHmac("sha256", Buffer.from("inbound-secret-bytes")).update(`${id}.${timestamp}.${body}`).digest("base64")
  return { timestamp, signature: `v1,${expected}` }
}

function signed(body: string, id = "evt_inbound_1") {
  const signedHeaders = sign(body, id)
  return new NextRequest(`${origin}/api/webhooks/resend/inbound`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": signedHeaders.timestamp,
      "svix-signature": signedHeaders.signature,
    },
    body,
  })
}

beforeEach(() => {
  mocks.rpc.mockReset()
  vi.stubEnv("RESEND_INBOUND_WEBHOOK_SECRET", secret)
})
afterEach(() => vi.unstubAllEnvs())

describe("inbound resend webhook", () => {
  it("fails closed without the inbound secret and does not persist", async () => {
    vi.stubEnv("RESEND_INBOUND_WEBHOOK_SECRET", "")
    const response = await handleResendInboundWebhook(signed("{}"), process.env)
    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects an invalid signature before any persistence", async () => {
    const body = JSON.stringify({ type: "email.received", data: { email_id: "email_1" } })
    const request = new NextRequest(`${origin}/api/webhooks/resend/inbound`, {
      method: "POST",
      headers: { "content-type": "application/json", "svix-id": "evt_bad", "svix-timestamp": "1", "svix-signature": "v1,nope" },
      body,
    })
    const response = await handleResendInboundWebhook(request, process.env)
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(verifyResendSignature(body, "evt_bad", "1", "v1,nope", secret)).toBe(false)
  })

  it("persists only bounded email.received fields and is idempotent", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", duplicate: false })
    const body = JSON.stringify({
      type: "email.received",
      created_at: "2026-09-29T12:00:00.000Z",
      data: { email_id: "email_abc", message_id: "<a@b>", from: "alex@example.com", subject: "Help", html: "<script>nope</script>" },
    })
    const first = await handleResendInboundWebhook(signed(body), process.env)
    mocks.rpc.mockResolvedValue({ status: "success", duplicate: true })
    const second = await handleResendInboundWebhook(signed(body), process.env)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("inbound_email_receive_event_v1", expect.objectContaining({
      p_provider: "resend",
      p_event_type: "email.received",
      p_provider_email_id: "email_abc",
      p_rfc_message_id: "<a@b>",
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/<script>|RESEND_INBOUND_WEBHOOK_SECRET|html/i)
  })
})
