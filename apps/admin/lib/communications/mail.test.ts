import { describe, expect, it } from "vitest"
import { createIdempotentMailProvider, createResendMailProvider, resolveMailProvider } from "./mail"

describe("outgoing mail adapters", () => {
  it("reuses a stable idempotency key without a second provider effect", async () => {
    const provider = createIdempotentMailProvider()
    const first = await provider.send({ idempotencyKey: "send-email:1:v1", to: "alex@example.com", subject: "S", text: "T" })
    const second = await provider.send({ idempotencyKey: "send-email:1:v1", to: "alex@example.com", subject: "S", text: "T" })
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) expect(second.providerMessageId).toBe(first.providerMessageId)
    expect(provider.calls).toBe(2)
    expect(provider.effects).toBe(1)
  })

  it("does not register a live Resend adapter outside production", () => {
    expect(resolveMailProvider({ JOB_PROVIDER_MODE: "production", VERCEL_ENV: "preview", RESEND_API_KEY: "re_test", COMMUNICATIONS_FROM_EMAIL: "ops@example.com" })).toBe("disabled")
    expect(resolveMailProvider({ JOB_PROVIDER_MODE: "disabled", VERCEL_ENV: "production" })).toBe("disabled")
  })

  it("sends the idempotency key to Resend and hides provider secrets", async () => {
    const send = async (input: Record<string, unknown>) => {
      expect(input.headers).toEqual({ "Idempotency-Key": "send-email:1:v1" })
      return { data: { id: "msg_live" }, error: null }
    }
    const provider = createResendMailProvider("re_secret", "ops@example.com", { emails: { send } })
    const result = await provider.send({ idempotencyKey: "send-email:1:v1", to: "alex@example.com", subject: "S", text: "T" })
    expect(result).toEqual({ ok: true, providerMessageId: "msg_live", replay: false })
    expect(JSON.stringify(result)).not.toMatch(/re_secret/)
  })
})
