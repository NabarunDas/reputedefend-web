import { describe, expect, it } from "vitest"
import { composeCustomerInvitationEmail } from "../../../../lib/email/customer-invitation"
import { sendEmailHandler } from "./handler"
import { communicationAccessTokenHash, deriveCustomerInvitationToken, materializeInvitationUrl } from "./link"

const secret = "invitation-link-secret-at-least-32"
const requestId = "55555555-5555-4555-8555-555555555555"
const origin = "https://profilerelaunch-customer-git-develop-preview.vercel.app"
const rendered = composeCustomerInvitationEmail({ origin })!

function loaded(overrides: Record<string, unknown> = {}) {
  const token = deriveCustomerInvitationToken(requestId, 1, secret, 1)
  return {
    status: "success",
    lifecycle: "QUEUED",
    contentLocked: true,
    deliveryStatus: "NONE",
    recipient: "guest@example.com",
    subject: rendered.subject,
    bodyText: rendered.text,
    bodyHtml: rendered.html,
    templateKey: "CUSTOMER_PORTAL_INVITATION",
    customerOrigin: origin,
    invitationRequestId: requestId,
    invitationGeneration: 1,
    invitationTokenHash: communicationAccessTokenHash(token),
    contentVersion: 1,
    senderAddress: "ops@example.com",
    linkKeyVersion: 1,
    suppressed: false,
    ...overrides,
  }
}

describe("invitation email materialisation", () => {
  it("puts the invitation token only in the provider payload", async () => {
    const sent: string[] = []
    const result = await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, {
      async send(message) {
        sent.push(message.text)
        return { ok: true, providerMessageId: "msg_invite", replay: false }
      },
    }).execute({
      idempotencyKey: "send-email:test:v1",
      payload: { communicationId: "66666666-6666-4666-8666-666666666666", contentVersion: 1 },
      rpc: {
        async rpc<T>(name: string): Promise<T> {
          if (name === "communication_load_send_v1") return loaded() as T
          if (name === "communication_begin_provider_attempt_v1") {
            return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: new Date().toISOString() } as T
          }
          return { status: "success" } as T
        },
      },
    })
    expect(result.ok).toBe(true)
    expect(rendered.text).toContain("/login/invite/ready")
    expect(rendered.text).not.toMatch(/\/login\/invite\/[a-f0-9]{64}/)
    expect(sent[0]).not.toContain("/login/invite/ready")
    const token = sent[0].match(/\/login\/invite\/([a-f0-9]{64})/)?.[1]
    expect(token).toBeTruthy()
    expect(communicationAccessTokenHash(token!)).toBe(loaded().invitationTokenHash)
    expect(materializeInvitationUrl(rendered.text, origin, token!)).toBe(sent[0])
  })

  it("refuses a stored body that already contains a token", async () => {
    const result = await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: secret }, {
      async send() { throw new Error("provider must not be called") },
    }).execute({
      idempotencyKey: "send-email:test:v1",
      payload: { communicationId: "66666666-6666-4666-8666-666666666666", contentVersion: 1 },
      rpc: {
        async rpc<T>(): Promise<T> {
          return loaded({ bodyText: rendered.text.replace("/login/invite/ready", `/login/invite/${"ab".repeat(32)}`) }) as T
        },
      },
    })
    expect(result).toMatchObject({ ok: false, retryable: false })
  })
})
