import { afterEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

describe("POST /api/dev/case-intake-mail", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is not available outside the develop DEV Preview", async () => {
    const response = await POST(new Request("http://localhost/api/dev/case-intake-mail", {
      method: "POST",
      body: JSON.stringify({
        publicRef: "PR-26-7K4M2Q",
        email: "alex@example.com",
        to: "owner@example.com",
      }),
    }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ ok: false })
  })

  it("does not accept a supplied recipient on the develop DEV lane", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    const response = await POST(new Request("http://localhost/api/dev/case-intake-mail", {
      method: "POST",
      body: JSON.stringify({ email: "alex@example.com", to: "owner@example.com" }),
    }))
    expect(response.status).toBe(404)
    expect(JSON.stringify(await response.json())).not.toMatch(/alex@example.com|owner@example.com/)
  })
})
