import { afterEach, describe, expect, it, vi } from "vitest"
import {
  confirmEmailAddress,
  confirmationCustomerMessage,
  readEmailConfirmation,
  resendEmailConfirmation,
} from "@/lib/cases/email-confirmation-command"
import { deriveEmailConfirmationToken } from "@/lib/cases/email-confirmation"
import type { EnquiryProvider } from "@/lib/enquiry-provider"
import type { SupabaseServerClient } from "@/lib/supabase/server"

const challengeId = "11111111-1111-4111-8111-111111111111"
const secret = "email-confirmation-command-secret-32"
const csrf = "a".repeat(64)

afterEach(() => {
  vi.unstubAllEnvs()
})

function openDevelopment() {
  vi.stubEnv("VERCEL_ENV", "")
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("VERCEL_URL", "127.0.0.1:3000")
  vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
}

function client(handler: (name: string, args: Record<string, unknown>) => unknown) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpc = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: handler(name, args), error: null }
    },
  }
  return { calls, rpc: rpc as unknown as SupabaseServerClient }
}

describe("email confirmation commands", () => {
  it("reads a challenge without confirming it", async () => {
    openDevelopment()
    const { calls, rpc } = client(() => ({
      status: "pending",
      publicRef: "PR-26-7K4M2Q",
      maskedEmail: "a***@example.com",
      caseType: "PROFILE_RECOVERY",
    }))
    const view = await readEmailConfirmation(rpc, challengeId)
    expect(view.status).toBe("pending")
    expect(calls.map(call => call.name)).toEqual(["read_email_confirmation_challenge_v1"])
    expect(JSON.stringify(view)).not.toMatch(/token|hash/i)
  })

  it("requires the matching confirmation and does not echo the bearer", async () => {
    openDevelopment()
    const token = deriveEmailConfirmationToken(challengeId, secret, 1)
    const { calls, rpc } = client(name => name === "confirm_email_challenge_v1"
      ? { status: "confirmed", publicRef: "PR-26-7K4M2Q", maskedEmail: "a***@example.com" }
      : null)
    const refused = await confirmEmailAddress({
      client: rpc,
      challengeId,
      token,
      csrfCookie: csrf,
      csrf: "b".repeat(64),
    })
    expect(refused.status).toBe("csrf")
    expect(calls).toEqual([])
    const confirmed = await confirmEmailAddress({
      client: rpc,
      challengeId,
      token,
      csrfCookie: csrf,
      csrf,
    })
    expect(confirmed).toEqual({ status: "confirmed", publicRef: "PR-26-7K4M2Q", maskedEmail: "a***@example.com" })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe("confirm_email_challenge_v1")
    expect(JSON.stringify(confirmed)).not.toContain(token)
    expect(confirmationCustomerMessage("confirmed")).toContain("already saved")
    expect(confirmationCustomerMessage("confirmed")).not.toMatch(/delivered|token|hash/i)
  })

  it("abandons a resend when the provider does not accept it", async () => {
    openDevelopment()
    const token = deriveEmailConfirmationToken(challengeId, secret, 1)
    const { calls, rpc } = client(name => {
      if (name === "resend_email_confirmation_challenge_v1") {
        return {
          status: "ready",
          publicRef: "PR-26-7K4M2Q",
          maskedEmail: "a***@example.com",
          caseType: "PROFILE_RECOVERY",
          email: "alex@example.com",
        }
      }
      return { status: "abandoned" }
    })
    const provider: EnquiryProvider = { send: async () => ({ ok: false, reason: "rejected" }) }
    const result = await resendEmailConfirmation({
      client: rpc,
      provider,
      fromEmail: "enquiries@reputedefend.com",
      challengeId,
      token,
      csrfCookie: csrf,
      csrf,
    })
    expect(result.status).toBe("unavailable")
    expect(calls.map(call => call.name)).toEqual([
      "resend_email_confirmation_challenge_v1",
      "abandon_email_confirmation_resend_v1",
    ])
    expect(JSON.stringify(result)).not.toContain(token)
    expect(JSON.stringify(result)).not.toContain("alex@example.com")
  })

  it("withholds a preview resend for any address other than the one allowlisted mailbox", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    vi.stubEnv("VERCEL_URL", "reputedefend-web-git-develop.example.com")
    vi.stubEnv("DEV_MAIL_ALLOWED_RECIPIENTS", "owner-alias@example.com")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    const token = deriveEmailConfirmationToken(challengeId, secret, 1)
    const { calls, rpc } = client(() => ({
      status: "ready",
      publicRef: "PR-26-7K4M2Q",
      maskedEmail: "a***@example.com",
      caseType: "PROFILE_RECOVERY",
      email: "alex@example.com",
    }))
    const sent: string[] = []
    const provider: EnquiryProvider = {
      send: async message => {
        sent.push(message.to)
        return { ok: true, id: "email_should_not_send" }
      },
    }
    const result = await resendEmailConfirmation({
      client: rpc,
      provider,
      fromEmail: "enquiries@reputedefend.com",
      challengeId,
      token,
      csrfCookie: csrf,
      csrf,
    })
    expect(result.status).toBe("withheld")
    expect(sent).toEqual([])
    expect(calls.at(-1)?.name).toBe("abandon_email_confirmation_resend_v1")
    expect(calls[0]?.args.p_expected_email).toBe("owner-alias@example.com")
  })

  it("records provider acceptance before saying a replacement was sent", async () => {
    openDevelopment()
    const token = deriveEmailConfirmationToken(challengeId, secret, 1)
    const { calls, rpc } = client(name => {
      if (name === "record_email_confirmation_delivery_v1") return { status: "accepted" }
      return {
        status: "ready",
        publicRef: "PR-26-7K4M2Q",
        maskedEmail: "a***@example.com",
        caseType: "PROFILE_RECOVERY",
        email: "alex@example.com",
      }
    })
    const provider: EnquiryProvider = { send: async () => ({ ok: true, id: "email_confirmation" }) }
    const result = await resendEmailConfirmation({
      client: rpc,
      provider,
      fromEmail: "enquiries@reputedefend.com",
      challengeId,
      token,
      csrfCookie: csrf,
      csrf,
    })
    expect(result.status).toBe("sent")
    expect(calls.map(call => call.name)).toEqual([
      "resend_email_confirmation_challenge_v1",
      "record_email_confirmation_delivery_v1",
    ])
    expect(calls[1]?.args.p_outcome).toBe("accepted")
    expect(JSON.stringify(calls)).not.toContain(token)
  })

  it("does not read a challenge when the lane is missing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    const { calls, rpc } = client(() => ({ status: "pending", publicRef: "PR-26-7K4M2Q", maskedEmail: "a***@example.com" }))
    const view = await readEmailConfirmation(rpc, challengeId)
    expect(view.status).toBe("unavailable")
    expect(calls).toEqual([])
  })
})
