import { describe, expect, it } from "vitest"
import { createIdempotentMailProvider, createResendMailProvider, resolveMailProvider, type ResendEmailPayload, type ResendSendOptions } from "./mail"

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

  it("passes the stable idempotency key as the Resend SDK second argument", async () => {
    const calls: Array<{ payload: ResendEmailPayload; options?: ResendSendOptions }> = []
    const provider = createResendMailProvider("re_secret", "ops@example.com", {
      emails: {
        send: async (payload, options) => {
          calls.push({ payload, options })
          return { data: { id: "msg_live" }, error: null }
        },
      },
    })
    const result = await provider.send({
      idempotencyKey: "send-email:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:v1",
      to: "alex@example.com",
      subject: "S",
      text: "T",
    })
    expect(result).toEqual({ ok: true, providerMessageId: "msg_live", replay: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].payload).toEqual({ from: "ops@example.com", to: "alex@example.com", subject: "S", text: "T", html: undefined })
    expect(calls[0].payload).not.toHaveProperty("headers")
    expect(calls[0].options).toEqual({ idempotencyKey: "send-email:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:v1" })
    expect(JSON.stringify(result)).not.toMatch(/re_secret/)
  })

  it("treats a provider timeout as unknown acceptance", async () => {
    const provider = createResendMailProvider("re_secret", "ops@example.com", {
      emails: { send: async () => { throw new Error("timeout") } },
    })
    expect(await provider.send({ idempotencyKey: "send-email:1:v1", to: "alex@example.com", subject: "S", text: "T" })).toEqual({
      ok: false, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown",
    })
  })
})
