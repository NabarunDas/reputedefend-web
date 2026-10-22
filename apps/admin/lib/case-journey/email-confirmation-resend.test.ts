import { afterEach, describe, expect, it, vi } from "vitest"
import type { OutgoingMailProvider } from "../communications/mail"
import {
  runStaffEmailResend,
  STAFF_RESEND_NOT_SENT,
  STAFF_RESEND_SENT,
} from "./email-confirmation-resend"

const caseId = "11111111-1111-4111-8111-111111111111"
const secret = "staff-email-confirmation-secret-32"

afterEach(() => {
  vi.unstubAllEnvs()
})

function provider(ok: boolean): OutgoingMailProvider & { sent: number } {
  const state = { sent: 0 }
  return {
    get sent() { return state.sent },
    async send() {
      state.sent += 1
      return ok
        ? { ok: true, providerMessageId: "email_test", replay: false }
        : { ok: false, retryable: true, error: "provider refused" }
    },
  }
}

describe("exceptional staff confirmation resend", () => {
  it("does not contact the database or a provider in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    const calls: string[] = []
    const mail = provider(true)
    const result = await runStaffEmailResend({
      database: { rpc: async name => { calls.push(name); return null } },
      tokenHash: "a".repeat(64),
      caseId,
      provider: mail,
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(result).toEqual({ message: STAFF_RESEND_NOT_SENT, sent: false })
    expect(calls).toEqual([])
    expect(mail.sent).toBe(0)
  })

  it("abandons the challenge when sending fails and does not say the address is verified", async () => {
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    const calls: string[] = []
    const result = await runStaffEmailResend({
      database: {
        rpc: async name => {
          calls.push(name)
          if (name === "admin_email_confirmation_status_v1") return { state: "pending", nextGeneration: 2 }
          if (name === "admin_prepare_email_confirmation_resend_v1") {
            return {
              status: "ready",
              publicRef: "PR-26-7K4M2Q",
              caseType: "PROFILE_RECOVERY",
              email: "alex@example.com",
            }
          }
          return { status: "abandoned" }
        },
      },
      tokenHash: "a".repeat(64),
      caseId,
      provider: provider(false),
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(result).toEqual({ message: STAFF_RESEND_NOT_SENT, sent: false })
    expect(calls).toEqual([
      "admin_email_confirmation_status_v1",
      "admin_prepare_email_confirmation_resend_v1",
      "abandon_email_confirmation_resend_v1",
    ])
    expect(JSON.stringify(result)).not.toContain("alex@example.com")
    expect(result.message).toContain("not marked verified")
  })

  it("sends once on an open development lane and still does not record verification", async () => {
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    const mail = provider(true)
    const result = await runStaffEmailResend({
      database: {
        rpc: async name => {
          if (name === "admin_email_confirmation_status_v1") return { state: "pending", nextGeneration: 2 }
          return {
            status: "ready",
            publicRef: "PR-26-7K4M2Q",
            caseType: "PROFILE_RECOVERY",
            email: "alex@example.com",
          }
        },
      },
      tokenHash: "a".repeat(64),
      caseId,
      provider: mail,
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(result).toEqual({ message: STAFF_RESEND_SENT, sent: true })
    expect(mail.sent).toBe(1)
    expect(result.message).toContain("not marked verified")
  })
})
