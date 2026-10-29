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

  it("uses the Resend adapter on the develop DEV lane without calling it", () => {
    const provider = resolveMailProvider({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "develop",
      VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
      SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
      CUSTOMER_ORIGIN: "https://profilerelaunch-customer-git-develop-clientcove.vercel.app",
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      RESEND_API_KEY: "re_dev_placeholder",
      COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
      JOB_WORKER_CADENCE_SECONDS: "86400",
    })
    expect(provider).not.toBe("disabled")
    if (provider !== "disabled") expect(provider.send).toEqual(expect.any(Function))
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

  it("treats an explicit 429 as a retryable rejection", async () => {
    const provider = createResendMailProvider("re_secret", "ops@example.com", {
      emails: { send: async () => ({ data: null, error: { message: "Too many requests (429)" } }) },
    })
    const result = await provider.send({ idempotencyKey: "send-email:1:v1", to: "alex@example.com", subject: "S", text: "T" })
    expect(result).toEqual({ ok: false, retryable: true, error: "Email provider rejected the message" })
    expect(result).not.toHaveProperty("acceptanceUnknown")
  })

  it("treats a dropped connection as unknown acceptance", async () => {
    const provider = createResendMailProvider("re_secret", "ops@example.com", {
      emails: { send: async () => ({ data: null, error: { message: "connect ECONNRESET" } }) },
    })
    expect(await provider.send({ idempotencyKey: "send-email:1:v1", to: "alex@example.com", subject: "S", text: "T" })).toEqual({
      ok: false, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown",
    })
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
