import { afterEach, describe, expect, it, vi } from "vitest"
import type { OutgoingMailProvider } from "../communications/mail"
import {
  runStaffEmailResend,
  STAFF_RECORD_FAILED,
  STAFF_RESEND_NOT_SENT,
  STAFF_RESEND_SENT,
  STAFF_SEND_SENT,
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

function database(reply: (name: string) => unknown) {
  return {
    async rpc<T>(name: string, _args: Record<string, unknown>): Promise<T> {
      return reply(name) as T
    },
  }
}

function openLocal() {
  vi.stubEnv("VERCEL_ENV", "")
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("VERCEL_URL", "127.0.0.1:3000")
  vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
}

describe("exceptional staff confirmation resend", () => {
  it("does not contact the database or a provider in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    const calls: string[] = []
    const mail = provider(true)
    const result = await runStaffEmailResend({
      database: database(name => { calls.push(name); return null }),
      tokenHash: "a".repeat(64),
      caseId,
      provider: mail,
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(result).toEqual({ message: STAFF_RESEND_NOT_SENT, sent: false })
    expect(calls).toEqual([])
    expect(mail.sent).toBe(0)
  })

  it("does not contact the database when the lane is missing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("VERCEL_URL", "profilerelaunch.com")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    const calls: string[] = []
    const result = await runStaffEmailResend({
      database: database(name => { calls.push(name); return null }),
      tokenHash: "a".repeat(64),
      caseId,
      provider: provider(true),
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(result).toEqual({ message: STAFF_RESEND_NOT_SENT, sent: false })
    expect(calls).toEqual([])
    expect(result.message).not.toContain("profilerelaunch.com")
  })

  it("abandons the challenge when sending fails and does not say the address is verified", async () => {
    openLocal()
    const calls: string[] = []
    const result = await runStaffEmailResend({
      database: database(name => {
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
      }),
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
    openLocal()
    const mail = provider(true)
    const calls: string[] = []
    const result = await runStaffEmailResend({
      database: database(name => {
        calls.push(name)
        if (name === "admin_email_confirmation_status_v1") return { state: "none", recovery: "send", nextGeneration: 1 }
        if (name === "record_email_confirmation_delivery_v1") return { status: "accepted" }
        return {
          status: "ready",
          publicRef: "PR-26-7K4M2Q",
          caseType: "PROFILE_RECOVERY",
          email: "alex@example.com",
        }
      }),
      tokenHash: "a".repeat(64),
      caseId,
      provider: mail,
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(result).toEqual({ message: STAFF_SEND_SENT, sent: true })
    expect(mail.sent).toBe(1)
    expect(calls).toEqual([
      "admin_email_confirmation_status_v1",
      "admin_prepare_email_confirmation_resend_v1",
      "record_email_confirmation_delivery_v1",
    ])
    expect(result.message).toContain("not marked verified")
    expect(result.message).not.toContain("case receipt")
  })

  it("uses the case-bound recipient on develop DEV Preview without a mailbox allowlist", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    vi.stubEnv("VERCEL_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    vi.stubEnv("DEV_MAIL_ALLOWED_RECIPIENTS", "owner-alias@example.com")
    const calls: string[] = []
    const mail = provider(true)
    const result = await runStaffEmailResend({
      database: database(name => {
        calls.push(name)
        if (name === "admin_email_confirmation_status_v1") {
          return { state: "none", recovery: "send", nextGeneration: 1 }
        }
        if (name === "record_email_confirmation_delivery_v1") return { status: "accepted" }
        return { status: "ready", publicRef: "PR-26-7K4M2Q", caseType: "PROFILE_RECOVERY", email: "another-customer@example.com" }
      }),
      tokenHash: "a".repeat(64),
      caseId,
      provider: mail,
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(result).toEqual({ message: STAFF_SEND_SENT, sent: true })
    expect(mail.sent).toBe(1)
    expect(calls).toEqual([
      "admin_email_confirmation_status_v1",
      "admin_prepare_email_confirmation_resend_v1",
      "record_email_confirmation_delivery_v1",
    ])
  })

  it("names a later recovery email only after the provider acceptance is recorded", async () => {
    openLocal()
    const recorded = await runStaffEmailResend({
      database: database(name => {
        if (name === "admin_email_confirmation_status_v1") return { state: "pending", provenance: "initial_receipt", recovery: "resend", nextGeneration: 2 }
        if (name === "record_email_confirmation_delivery_v1") return { status: "accepted" }
        return { status: "ready", publicRef: "PR-26-7K4M2Q", caseType: "PROFILE_RECOVERY", email: "alex@example.com" }
      }),
      tokenHash: "a".repeat(64),
      caseId,
      provider: provider(true),
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(recorded).toEqual({ message: STAFF_RESEND_SENT, sent: true })
    expect(recorded.message).toContain("separate recovery email")
    expect(recorded.message).not.toContain("case receipt")

    const unrecorded = await runStaffEmailResend({
      database: database(name => {
        if (name === "admin_email_confirmation_status_v1") return { state: "none", recovery: "send", nextGeneration: 1 }
        if (name === "record_email_confirmation_delivery_v1") return { status: "conflict" }
        return { status: "ready", publicRef: "PR-26-7K4M2Q", caseType: "PROFILE_RECOVERY", email: "alex@example.com" }
      }),
      tokenHash: "a".repeat(64),
      caseId,
      provider: provider(true),
      fromEmail: "enquiries@reputedefend.com",
    })
    expect(unrecorded).toEqual({ message: STAFF_RECORD_FAILED, sent: false })
    expect(unrecorded.message).not.toContain("case receipt")
  })
})
