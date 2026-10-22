import { describe, expect, it } from "vitest"
import { renderQuotationOffer } from "../../../../lib/email/quotation-offer"
import { deliveryLabel } from "./model"
import { devQuoteAllowlistedRecipient, devQuoteRecipientAllowed } from "./dev-lane"
import { sendEmailHandler } from "./handler"
import {
  communicationAccessTokenHash,
  deriveCommunicationAccessToken,
  deriveQuoteAcceptanceToken,
  prepareQuoteAcceptanceLink,
} from "./link"
import { createIdempotentMailProvider } from "./mail"

const secret = "quotation-link-secret-for-tests-32b"
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const origin = "https://customer.example"
const rendered = renderQuotationOffer({
  publicRef: "QT-26-ABCDEF",
  serviceName: "Guided Relaunch",
  amountMinor: 9900,
  currency: "GBP",
  paymentModel: "UPFRONT",
  scope: "Recover the suspended profile for this location.",
  exclusions: "Google decisions stay outside this quotation.",
  validUntil: "2026-11-03T12:00:00.000Z",
  actionUrl: `${origin}/action/${actionId}`,
})!

function loaded(overrides: Record<string, unknown> = {}) {
  return {
    status: "success",
    lifecycle: "QUEUED",
    contentLocked: true,
    deliveryStatus: "NONE",
    recipient: "alex@example.com",
    subject: rendered.subject,
    bodyText: rendered.text,
    bodyHtml: rendered.html,
    templateKey: "QUOTE_OFFER",
    customerActionId: actionId,
    customerOrigin: origin,
    contentVersion: 1,
    senderAddress: "ops@example.com",
    linkKeyVersion: 1,
    suppressed: false,
    ...overrides,
  }
}

function rpcFor(row: Record<string, unknown>, calls: string[] = []) {
  return {
    async rpc<T>(name: string): Promise<T> {
      calls.push(name)
      if (name === "communication_load_send_v1") return row as T
      if (name === "communication_begin_provider_attempt_v1") {
        return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: "2026-10-22T12:00:00.000Z" } as T
      }
      return { status: "success" } as T
    },
  }
}

const devEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  CUSTOMER_ORIGIN: "https://profilerelaunch-customer-git-develop-clientcove.vercel.app",
}

describe("quotation email materialisation", () => {
  it("adds the quote-acceptance bearer only in the provider payload", async () => {
    const token = deriveQuoteAcceptanceToken(actionId, secret)
    const sentTexts: string[] = []
    const calls: string[] = []
    const result = await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, {
      async send(message) {
        sentTexts.push(message.text)
        return { ok: true, providerMessageId: "msg_quote", replay: false }
      },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded(), calls),
    })
    expect(result.ok).toBe(true)
    expect(rendered.text).not.toContain("#t=")
    expect(rendered.text).not.toContain(token)
    expect(sentTexts[0]).toContain(`#t=${token}`)
    expect(sentTexts[0]).not.toContain(deriveCommunicationAccessToken(actionId, secret))
    expect(calls).toContain("communication_begin_provider_attempt_v1")
    expect(deliveryLabel({ deliveryStatus: "PROVIDER_ACCEPTED", legacyStatus: null })).toBe("Accepted by email provider")
    expect(deliveryLabel({ deliveryStatus: "PROVIDER_ACCEPTED", legacyStatus: null })).not.toMatch(/delivered/i)
  })

  it("keeps an evidence request on the communication-access token", async () => {
    const evidence = deriveCommunicationAccessToken(actionId, secret)
    const quote = deriveQuoteAcceptanceToken(actionId, secret)
    let sent = ""
    await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, {
      async send(message) {
        sent = message.text
        return { ok: true, providerMessageId: "msg_evidence", replay: false }
      },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded({ templateKey: "EVIDENCE_REQUEST" })),
    })
    expect(sent).toContain(`#t=${evidence}`)
    expect(sent).not.toContain(quote)
    expect(prepareQuoteAcceptanceLink(actionId, { COMMUNICATIONS_LINK_SECRET: secret })?.tokenHash).toBe(communicationAccessTokenHash(quote))
  })

  it("refuses a missing link key and a non-test mailbox on the development lane", async () => {
    const missing = await sendEmailHandler({}, {
      async send() { return { ok: true, providerMessageId: "msg", replay: false } },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded()),
    })
    expect(missing).toMatchObject({ ok: false, error: "Secure acceptance link cannot be materialised" })
    const devOrigin = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
    const devRendered = renderQuotationOffer({
      publicRef: "QT-26-ABCDEF",
      serviceName: "Guided Relaunch",
      amountMinor: 9900,
      currency: "GBP",
      paymentModel: "UPFRONT",
      scope: "Recover the suspended profile for this location.",
      exclusions: "Google decisions stay outside this quotation.",
      validUntil: "2026-11-03T12:00:00.000Z",
      actionUrl: `${devOrigin}/action/${actionId}`,
    })!
    const denied = await sendEmailHandler({ ...devEnv, COMMUNICATIONS_LINK_SECRET: secret }, {
      async send() { return { ok: true, providerMessageId: "msg", replay: false } },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded({
        recipient: "customer@gmail.com",
        customerOrigin: devOrigin,
        bodyText: devRendered.text,
        bodyHtml: devRendered.html,
      })),
    })
    expect(denied).toMatchObject({ ok: false, error: "Recipient is not the development mailbox named for this preview" })
    expect(devQuoteAllowlistedRecipient(devEnv)).toBeNull()
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "alex@example.com,other@example.com" }, "alex@example.com")).toBe(false)
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "*@example.com" }, "alex@example.com")).toBe(false)
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "@example.com" }, "alex@example.com")).toBe(false)
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "notalex@example.com" }, "alex@example.com")).toBe(false)
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: " alex@example.com" }, "alex@example.com")).toBe(false)
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "" }, "alex@example.com")).toBe(false)
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "alex@example.com.invalid" }, "alex@example.com")).toBe(false)
    expect(devQuoteRecipientAllowed({ ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "Alex@Example.com" }, "ALEX@example.com")).toBe(true)
    const named = { ...devEnv, DEV_MAIL_ALLOWED_RECIPIENTS: "alex@example.com", COMMUNICATIONS_LINK_SECRET: secret }
    expect(devQuoteAllowlistedRecipient(named)).toBe("alex@example.com")
    const delivered = await sendEmailHandler(named, {
      async send() { return { ok: true, providerMessageId: "msg_dev", replay: false } },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded({
        recipient: "alex@example.com",
        customerOrigin: devOrigin,
        bodyText: devRendered.text,
        bodyHtml: devRendered.html,
      })),
    })
    expect(delivered.ok).toBe(true)
    const allowed = await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, {
      async send() { return { ok: true, providerMessageId: "msg_prod", replay: false } },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded({ recipient: "customer@gmail.com" })),
    })
    expect(allowed.ok).toBe(true)
  })

  it("does not send a second provider effect for the same job or after acceptance", async () => {
    const provider = createIdempotentMailProvider()
    const row = loaded()
    const handler = sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, provider)
    const input = {
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(row),
    }
    expect((await handler.execute(input)).ok).toBe(true)
    expect((await handler.execute(input)).ok).toBe(true)
    expect(provider.effects).toBe(1)
    expect(provider.calls).toBe(2)
    row.deliveryStatus = "PROVIDER_ACCEPTED"
    expect((await handler.execute(input)).ok).toBe(true)
    expect(provider.effects).toBe(1)
    expect(provider.calls).toBe(2)
  })

  it("records provider rejection and an unknown acceptance without a second live secret", async () => {
    const rejectedCalls: string[] = []
    const rejected = await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, {
      async send() { return { ok: false, retryable: false, error: "rejected" } },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded(), rejectedCalls),
    })
    expect(rejected).toMatchObject({ ok: false, retryable: false })
    expect(rejectedCalls).toContain("communication_mark_provider_rejected_v1")
    const unknownCalls: string[] = []
    const unknown = await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, {
      async send() { return { ok: false, retryable: true, acceptanceUnknown: true, error: "timeout" } },
    }).execute({
      idempotencyKey: "send-email:comm:v1",
      payload: { communicationId: "comm", contentVersion: 1 },
      rpc: rpcFor(loaded(), unknownCalls),
    })
    expect(unknown).toMatchObject({ ok: false, retryable: true })
    expect(unknownCalls).toContain("communication_mark_acceptance_unknown_v1")
    expect(unknownCalls.join(" ")).not.toContain(deriveQuoteAcceptanceToken(actionId, secret))
  })
})
