import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EnquiryInput } from "@/lib/enquiry"
import { ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import { resetEnquiryRateLimit } from "@/lib/enquiry-rate-limit"

const { persistGetHelpCase, deliverEnquiry } = vi.hoisted(() => ({
  persistGetHelpCase: vi.fn(),
  deliverEnquiry: vi.fn(),
}))

vi.mock("@/lib/cases/intake", () => ({
  persistGetHelpCase: (...args: unknown[]) => persistGetHelpCase(...args),
}))

vi.mock("@/lib/enquiry-delivery", () => ({
  ENQUIRY_UNAVAILABLE: "Enquiries are temporarily unavailable. Please try again shortly.",
  deliverEnquiry: (...args: unknown[]) => deliverEnquiry(...args),
}))

vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

const validCase = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  phone: "+44 7700 900123",
  service: "profile-recovery",
  websiteUrl: "https://harbourbakery.example",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  reviewUrl: "",
  details: "The profile was suspended on Monday.",
  informationAccurate: true,
  privacyAccepted: true,
  source: "get-help",
  subject: "",
} satisfies EnquiryInput

const SUBMISSION_KEY = "11111111-2222-4333-8444-555555555555"
const DEV_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"

function request() {
  return new Request("http://localhost/api/enquiry", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": "198.51.100.24" },
    body: JSON.stringify({ ...validCase, submissionKey: SUBMISSION_KEY }),
  })
}

beforeEach(() => {
  resetEnquiryRateLimit()
  persistGetHelpCase.mockReset()
  deliverEnquiry.mockReset()
  deliverEnquiry.mockRejectedValue(new Error("deliverEnquiry must not run"))
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnquiryRateLimit()
})

function previewCredentials() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key")
  vi.stubEnv("ENQUIRY_FROM_EMAIL", "enquiries@example.com")
  vi.stubEnv("ENQUIRY_TO_EMAIL", "owner@example.com")
  vi.stubEnv("SUPABASE_URL", DEV_URL)
}

describe("feature preview enquiry fallback", () => {
  it("does not call the legacy sender when a feature preview has no case persistence", async () => {
    previewCredentials()
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/mail")
    vi.stubEnv("CASE_PERSISTENCE_ENABLED", undefined)
    const errors: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errors.push(String(message))
    })
    const { POST } = await import("@/app/api/enquiry/route")
    const response = await POST(request())
    const json = await response.json() as { ok?: boolean; message?: string; receiptEmailStatus?: string; persisted?: boolean }
    spy.mockRestore()
    expect(response.status).toBe(503)
    expect(json).toMatchObject({ ok: false, message: ENQUIRY_UNAVAILABLE, receiptEmailStatus: "suppressed" })
    expect(json.persisted).not.toBe(true)
    expect(deliverEnquiry).not.toHaveBeenCalled()
    expect(persistGetHelpCase).not.toHaveBeenCalled()
    expect(errors.join("\n")).toContain("[case-intake] feature preview mail withheld vercel=preview ref=other database=exact-dev")
    expect(errors.join("\n")).not.toMatch(/@/)
  })

  it("keeps a feature preview with persistence on the case path", async () => {
    previewCredentials()
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/mail")
    vi.stubEnv("CASE_PERSISTENCE_ENABLED", "true")
    persistGetHelpCase.mockResolvedValue({
      ok: true,
      persisted: true,
      caseRef: "PR-26-7K4M2Q",
      receiptEmailStatus: "suppressed",
      message: "Your assessment has been received.",
    })
    const { POST } = await import("@/app/api/enquiry/route")
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(persistGetHelpCase).toHaveBeenCalledOnce()
    expect(deliverEnquiry).not.toHaveBeenCalled()
  })

  it("keeps the shared Production and develop paths on the legacy sender when persistence is off", async () => {
    deliverEnquiry.mockResolvedValue({ ok: false, message: ENQUIRY_UNAVAILABLE })
    const { POST } = await import("@/app/api/enquiry/route")
    for (const env of [
      { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop", SUPABASE_URL: DEV_URL },
    ]) {
      vi.unstubAllEnvs()
      resetEnquiryRateLimit()
      deliverEnquiry.mockClear()
      persistGetHelpCase.mockClear()
      previewCredentials()
      vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV)
      vi.stubEnv("VERCEL_GIT_COMMIT_REF", env.VERCEL_GIT_COMMIT_REF)
      vi.stubEnv("SUPABASE_URL", env.SUPABASE_URL)
      vi.stubEnv("CASE_PERSISTENCE_ENABLED", undefined)
      const response = await POST(request())
      expect(response.status).toBe(503)
      expect(deliverEnquiry).toHaveBeenCalledOnce()
      expect(persistGetHelpCase).not.toHaveBeenCalled()
    }
  })
})
