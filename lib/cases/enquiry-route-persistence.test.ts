import { afterEach, describe, expect, it, vi } from "vitest"
import type { EnquiryInput } from "@/lib/enquiry"
import { ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import { resetEnquiryRateLimit } from "@/lib/enquiry-rate-limit"

const { persistGetHelpCase } = vi.hoisted(() => ({
  persistGetHelpCase: vi.fn(),
}))

vi.mock("@/lib/cases/intake", () => ({
  persistGetHelpCase: (...args: unknown[]) => persistGetHelpCase(...args),
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

afterEach(() => {
  persistGetHelpCase.mockReset()
  vi.unstubAllEnvs()
  resetEnquiryRateLimit()
})

describe("POST /api/enquiry persistence branch", () => {
  it("keeps Get Help on the legacy path when the flag is unset", async () => {
    const { POST } = await import("@/app/api/enquiry/route")
    const response = await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validCase, submissionKey: SUBMISSION_KEY }),
    }))
    const json = await response.json() as { ok?: boolean; persisted?: boolean; caseRef?: string }
    expect(persistGetHelpCase).not.toHaveBeenCalled()
    expect(json.persisted).not.toBe(true)
    expect(json.caseRef).toBeUndefined()
  })

  it("does not turn homepage or contact into formal cases", async () => {
    vi.stubEnv("CASE_PERSISTENCE_ENABLED", "true")
    const { POST } = await import("@/app/api/enquiry/route")
    for (const payload of [
      {
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        businessName: "Lee & Co",
        service: "general",
        details: "A homepage question about reviews.",
        source: "homepage",
      },
      {
        fullName: "Sam Patel",
        email: "sam@example.com",
        subject: "general-question",
        details: "A contact question about the service.",
        source: "contact",
      },
    ]) {
      persistGetHelpCase.mockClear()
      const response = await POST(new Request("http://localhost/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, submissionKey: SUBMISSION_KEY }),
      }))
      const json = await response.json() as { persisted?: boolean; caseRef?: string }
      expect(persistGetHelpCase).not.toHaveBeenCalled()
      expect(json.persisted).not.toBe(true)
      expect(json.caseRef).toBeUndefined()
      expect(response.status).toBe(503)
    }
  })

  it("requires a valid submission UUID for the persistent Get Help path", async () => {
    vi.stubEnv("CASE_PERSISTENCE_ENABLED", "true")
    const { POST } = await import("@/app/api/enquiry/route")
    const response = await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validCase, submissionKey: "not-a-uuid" }),
    }))
    const json = await response.json() as { ok?: boolean; caseRef?: string }
    expect(response.status).toBe(400)
    expect(json.ok).toBe(false)
    expect(json.caseRef).toBeUndefined()
    expect(persistGetHelpCase).not.toHaveBeenCalled()
  })

  it("returns the persisted case reference from the intake module", async () => {
    vi.stubEnv("CASE_PERSISTENCE_ENABLED", "true")
    persistGetHelpCase.mockResolvedValue({
      ok: true,
      persisted: true,
      caseRef: "PR-26-7K4M2Q",
      caseType: "PROFILE_RECOVERY",
      receiptEmailSent: true,
      message: "Your assessment has been received.",
    })
    const { POST } = await import("@/app/api/enquiry/route")
    const response = await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validCase, submissionKey: SUBMISSION_KEY }),
    }))
    const json = await response.json() as {
      ok?: boolean
      persisted?: boolean
      caseRef?: string
      caseType?: string
      receiptEmailSent?: boolean
    }
    expect(response.status).toBe(200)
    expect(persistGetHelpCase).toHaveBeenCalledTimes(1)
    expect(persistGetHelpCase.mock.calls[0]?.[1]).toBe(SUBMISSION_KEY)
    expect(json).toMatchObject({
      ok: true,
      persisted: true,
      caseRef: "PR-26-7K4M2Q",
      caseType: "PROFILE_RECOVERY",
      receiptEmailSent: true,
    })
    expect(JSON.stringify(json)).not.toMatch(/case_id|customer_id|supabase/i)
  })

  it("does not invent a case reference on the legacy path", async () => {
    const { POST } = await import("@/app/api/enquiry/route")
    const response = await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCase),
    }))
    const json = await response.json() as { ok?: boolean; caseRef?: string; persisted?: boolean; message?: string }
    expect(json.ok).toBe(false)
    expect(json.message).toBe(ENQUIRY_UNAVAILABLE)
    expect(json.caseRef).toBeUndefined()
    expect(json.persisted).not.toBe(true)
  })
})
