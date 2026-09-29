import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"
import { Resend } from "resend"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { handleResendWebhook, parseBounceClassification, parseProviderOccurredAt, verifyResendSignature } from "./webhook"

const secret = "whsec_" + Buffer.from("webhook-secret-bytes").toString("base64")
const origin = "https://admin.profilerelaunch.com"

function sign(body: string, id = "evt_12345678", timestamp = String(Math.floor(Date.now() / 1000))) {
  const expected = createHmac("sha256", Buffer.from("webhook-secret-bytes")).update(`${id}.${timestamp}.${body}`).digest("base64")
  return { timestamp, signature: `v1,${expected}` }
}

function signed(body: string, id = "evt_12345678", extras: { timestamp?: string; signature?: string } = {}) {
  const signedHeaders = sign(body, id, extras.timestamp)
  return new NextRequest(`${origin}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": extras.timestamp || signedHeaders.timestamp,
      "svix-signature": extras.signature || signedHeaders.signature,
    },
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
    const body = '{"type":"email.delivered","created_at":"2026-09-29T12:00:00.000Z","data":{"email_id":"msg_1"}}'
    const request = signed(body, "evt_12345678", { signature: "v1,nope" })
    const response = await handleResendWebhook(request, process.env)
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(verifyResendSignature(body, "evt_12345678", String(Math.floor(Date.now() / 1000)), "v1,nope", secret)).toBe(false)
  })

  it("accepts a valid official Resend/Svix signature and a second v1 candidate", async () => {
    const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-29T12:00:00.000Z", data: { email_id: "msg_1" } })
    const id = "evt_valid_sig"
    const { timestamp, signature } = sign(body, id)
    expect(verifyResendSignature(body, id, timestamp, signature, secret)).toBe(true)
    expect(verifyResendSignature(body, id, timestamp, `v1,aaaa ${signature}`, secret)).toBe(true)
    new Resend("re_webhook_verify_only").webhooks.verify({
      payload: body,
      webhookSecret: secret,
      headers: { id, timestamp, signature },
    })
  })

  it("rejects a stale timestamp, a changed body, and a malformed secret", async () => {
    const body = '{"type":"email.delivered","data":{"email_id":"msg_1"}}'
    const id = "evt_stale_sig"
    const stale = String(Math.floor(Date.now() / 1000) - 10 * 60)
    const { signature } = sign(body, id, stale)
    expect(verifyResendSignature(body, id, stale, signature, secret)).toBe(false)
    const fresh = sign(body, id)
    expect(verifyResendSignature(body + " ", id, fresh.timestamp, fresh.signature, secret)).toBe(false)
    expect(verifyResendSignature(body, id, fresh.timestamp, fresh.signature, "not-a-whsec-secret")).toBe(false)
  })

  it("applies a verified event with the provider timestamp and hides secrets", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", duplicate: false, applied: true })
    const createdAt = "2026-09-29T12:00:00.000Z"
    const response = await handleResendWebhook(signed(JSON.stringify({ type: "email.delivered", created_at: createdAt, data: { email_id: "msg_1" } })), process.env)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("communication_apply_provider_event_v1", expect.objectContaining({
      p_provider: "resend", p_event_type: "email.delivered", p_provider_message_id: "msg_1", p_occurred_at: createdAt, p_bounce_class: null,
    }))
    expect(JSON.stringify(await response.json())).not.toMatch(/whsec_|RESEND_WEBHOOK_SECRET/i)
  })

  it("does not apply an unparseable provider timestamp", () => {
    expect(parseProviderOccurredAt("not-a-date")).toBeNull()
    expect(parseProviderOccurredAt("1999-01-01T00:00:00.000Z")).toBeNull()
    expect(parseProviderOccurredAt("2099-01-01T00:00:00.000Z")).toBeNull()
  })

  it("extracts only a bounded bounce classification and never stores raw webhook JSON", async () => {
    expect(parseBounceClassification("email.bounced", { bounce: { type: "Permanent" } })).toBe("permanent")
    expect(parseBounceClassification("email.bounced", { bounce: { type: "Transient" } })).toBe("transient")
    expect(parseBounceClassification("email.bounced", { bounce: { type: "Undetermined" } })).toBe("undetermined")
    expect(parseBounceClassification("email.bounced", {})).toBe("undetermined")
    expect(parseBounceClassification("email.delivered", { bounce: { type: "Permanent" } })).toBeNull()
    mocks.rpc.mockResolvedValue({ status: "success", duplicate: false, applied: true })
    const body = JSON.stringify({
      type: "email.bounced",
      created_at: "2026-09-29T12:00:00.000Z",
      data: { email_id: "msg_bounce", bounce: { type: "Transient", message: "mailbox full" } },
    })
    const response = await handleResendWebhook(signed(body, "evt_bounce_class"), process.env)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("communication_apply_provider_event_v1", expect.objectContaining({
      p_event_type: "email.bounced", p_bounce_class: "transient", p_provider_message_id: "msg_bounce",
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toMatch(/mailbox full|raw|payload/i)
  })
})
