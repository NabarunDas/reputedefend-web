import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { handleResendWebhook, verifyResendSignature } from "./webhook"

const secret = "whsec_" + Buffer.from("webhook-secret-bytes").toString("base64")
const origin = "https://admin.profilerelaunch.com"

function signed(body: string, id = "evt_12345678") {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const expected = createHmac("sha256", Buffer.from("webhook-secret-bytes")).update(`${id}.${timestamp}.${body}`).digest("base64")
  return new NextRequest(`${origin}/api/webhooks/resend`, {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${expected}` },
    body,
  })
}

beforeEach(() => {
  mocks.rpc.mockReset()
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret)
})
afterEach(() => vi.unstubAllEnvs())

describe("resend webhook", () => {
  it("fails closed when the webhook secret is missing", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "")
    const response = await handleResendWebhook(signed("{}"), process.env)
    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects an invalid signature before parsing event JSON", async () => {
    const request = new NextRequest(`${origin}/api/webhooks/resend`, {
      method: "POST",
      headers: { "svix-id": "evt_12345678", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,nope" },
      body: '{"type":"email.delivered","data":{"email_id":"msg_1"}}',
    })
    const response = await handleResendWebhook(request, process.env)
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(verifyResendSignature("body", "evt_12345678", String(Math.floor(Date.now() / 1000)), "v1,nope", secret)).toBe(false)
  })

  it("applies a verified event without exposing secrets", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", duplicate: false, applied: true })
    const response = await handleResendWebhook(signed(JSON.stringify({ type: "email.delivered", data: { email_id: "msg_1" } })), process.env)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("communication_apply_provider_event_v1", expect.objectContaining({
      p_provider: "resend", p_event_type: "email.delivered", p_provider_message_id: "msg_1",
    }))
    expect(JSON.stringify(await response.json())).not.toMatch(/whsec_|RESEND_WEBHOOK_SECRET/i)
  })
})
