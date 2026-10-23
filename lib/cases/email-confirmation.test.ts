import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  confirmationRuntime,
  deriveEmailConfirmationChallengeId,
  deriveEmailConfirmationToken,
  emailConfirmationAllowed,
  emailConfirmationResendContent,
  emailConfirmationTokenHash,
  planInitialEmailConfirmation,
  usableConfirmationUrl,
} from "@/lib/cases/email-confirmation"

const caseId = "11111111-1111-4111-8111-111111111111"
const secret = "email-confirmation-test-secret-32ch"
const devHost = "https://rmzozuiamjcclvtgutgd.supabase.co"

afterEach(() => {
  vi.unstubAllEnvs()
})

function preview(recipient: string | undefined) {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("SUPABASE_URL", devHost)
  vi.stubEnv("VERCEL_URL", "reputedefend-web-git-develop.example.com")
  vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
  if (recipient === undefined) vi.stubEnv("DEV_MAIL_ALLOWED_RECIPIENTS", undefined)
  else vi.stubEnv("DEV_MAIL_ALLOWED_RECIPIENTS", recipient)
}

describe("case receipt email confirmation", () => {
  it("uses a distinct HMAC domain and stores only the hash", () => {
    const challengeId = deriveEmailConfirmationChallengeId(caseId, 1)
    expect(deriveEmailConfirmationChallengeId(caseId, 1)).toBe(challengeId)
    expect(deriveEmailConfirmationChallengeId(caseId, 2)).not.toBe(challengeId)
    const token = deriveEmailConfirmationToken(challengeId, secret, 1)
    expect(token).toBe(createHmac("sha256", secret).update(`email-confirmation:${challengeId}:v1`).digest("hex"))
    expect(token).not.toBe(createHmac("sha256", secret).update(`quote-acceptance:${challengeId}:v1`).digest("hex"))
    expect(token).not.toBe(createHmac("sha256", secret).update(`communication-access:${challengeId}:v1`).digest("hex"))
    expect(emailConfirmationTokenHash(token)).not.toBe(token)
    expect(emailConfirmationTokenHash(token)).toHaveLength(64)
  })

  it("stays closed in production and when the secret is missing", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    expect(confirmationRuntime()).toBeNull()
    expect(planInitialEmailConfirmation(caseId, "alex@example.com")).toBeNull()
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", "short")
    expect(planInitialEmailConfirmation(caseId, "alex@example.com")).toBeNull()
  })

  it("accepts one exact develop mailbox and refuses lists, wildcards and other addresses", () => {
    preview("owner-alias@example.com")
    const plan = planInitialEmailConfirmation(caseId, "owner-alias@example.com")
    expect(plan?.environment).toBe("preview")
    expect(plan?.email).toBe("owner-alias@example.com")
    expect(plan?.deliveryUrl.startsWith("https://reputedefend-web-git-develop.example.com/confirm-email/")).toBe(true)
    expect(plan?.deliveryUrl).toContain("#t=")
    expect(plan?.deliveryUrl).not.toContain("?t=")
    expect(emailConfirmationAllowed("owner-alias@example.com")).toBe(true)
    for (const refused of [
      "other@example.com",
      "owner-alias@example.com,other@example.com",
      "*@example.com",
      "owner-alias@example.net",
      "not-owner-alias@example.com",
    ]) {
      expect(planInitialEmailConfirmation(caseId, refused), refused).toBeNull()
    }
    preview(undefined)
    expect(planInitialEmailConfirmation(caseId, "owner-alias@example.com")).toBeNull()
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature")
    vi.stubEnv("DEV_MAIL_ALLOWED_RECIPIENTS", "owner-alias@example.com")
    expect(planInitialEmailConfirmation(caseId, "owner-alias@example.com")).toBeNull()
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    expect(planInitialEmailConfirmation(caseId, "owner-alias@example.com")).toBeNull()
  })

  it("builds one plain-text and one mobile confirmation button", () => {
    const url = `https://reputedefend-web-git-develop.example.com/confirm-email/${caseId}#t=${"ab".repeat(32)}`
    const content = emailConfirmationResendContent({
      publicRef: "PR-26-7K4M2Q",
      caseType: "PROFILE_RECOVERY",
      url,
    })
    expect(content?.subject).toBe("[ProfileRelaunch] Confirm your email for your Profile Recovery case — PR-26-7K4M2Q")
    expect(content?.text.match(/Confirm my email address/g)).toHaveLength(1)
    expect(content?.html.match(/Confirm my email address/g)).toHaveLength(1)
    expect(content?.text).toContain("Your assessment is already saved.")
    expect(content?.text).toContain("Google password")
    expect(content?.html).toContain('name="viewport"')
    expect(content?.html).toContain("max-width:600px")
    expect(content?.html).not.toContain(emailConfirmationTokenHash("ab".repeat(32)))
    expect(usableConfirmationUrl(url)).toBe(url)
    expect(usableConfirmationUrl(url.replace("https://", "http://"))).toBeNull()
    expect(usableConfirmationUrl(url.replace("#t=", "?t="))).toBeNull()
    expect(usableConfirmationUrl(`https://profilerelaunch.com/confirm-email/${caseId}#t=${"ab".repeat(32)}`)).toBeNull()
    expect(usableConfirmationUrl(`https://customer.profilerelaunch.com/confirm-email/${caseId}#t=${"ab".repeat(32)}`)).toBeNull()
  })

  it("refuses a missing production lane and will not point a local link at Production", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", secret)
    vi.stubEnv("VERCEL_URL", "profilerelaunch.com")
    expect(confirmationRuntime()).toBeNull()
    expect(planInitialEmailConfirmation(caseId, "alex@example.com")).toBeNull()

    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("VERCEL_URL", "profilerelaunch.com")
    expect(planInitialEmailConfirmation(caseId, "alex@example.com")).toBeNull()
    expect(planInitialEmailConfirmation(caseId, "alex@example.com")?.deliveryUrl ?? "").not.toContain("profilerelaunch.com")

    vi.stubEnv("VERCEL_URL", "127.0.0.1:3000")
    const local = planInitialEmailConfirmation(caseId, "alex@example.com")
    expect(local?.origin).toBe("http://127.0.0.1:3000")
    expect(local?.deliveryUrl.startsWith(`http://127.0.0.1:3000/confirm-email/`)).toBe(true)
    expect(local?.deliveryUrl).not.toContain("profilerelaunch.com")

    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("SUPABASE_URL", devHost)
    vi.stubEnv("VERCEL_URL", "profilerelaunch.com")
    expect(planInitialEmailConfirmation(caseId, "alex@example.com")).toBeNull()
    vi.stubEnv("VERCEL_URL", "")
    expect(planInitialEmailConfirmation(caseId, "alex@example.com")).toBeNull()
  })
})
