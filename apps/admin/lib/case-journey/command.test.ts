import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { POST } from "@/app/api/cases/journey/route"
import { sessionCookie } from "@/lib/auth/config"
import { intakeDecisionArgs, verificationDecisionArgs } from "./decisions"

const origin = "https://admin-git-develop.vercel.app"
const devUrl = "https://rmzozuiamjcclvtgutgd.supabase.co"
const caseId = "22222222-2222-4222-8222-222222222222"
const key = "33333333-3333-4333-8333-333333333333"
const intake = { caseId, version: 1, kind: "intake", data: { outcome: "REVIEWED", nextAction: "", note: "Read the enquiry and the business name." } }

function req(body: unknown = intake, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/cases/journey`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", devUrl)
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_URL", "admin-git-develop.vercel.app")
  mocks.rpc.mockReset().mockResolvedValue({ status: "success" })
})
afterEach(() => vi.unstubAllEnvs())

describe("journey decision command", () => {
  it("sends the session hash and refuses a caller-supplied actor", async () => {
    expect((await POST(req())).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_case_journey_decision_v1", {
      p_case: caseId,
      p_version: 1,
      p_kind: "intake",
      p_data: intake.data,
      p_request: key,
      p_token: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))
    expect((await POST(req({ ...intake, actor: "staff" }))).status).toBe(400)
    expect((await POST(req({ ...intake, data: { ...intake.data, emailVerified: true } }))).status).toBe(400)
  })

  it("is absent outside the develop Preview and does not call the database", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect((await POST(req())).status).toBe(404)
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/other")
    expect((await POST(req())).status).toBe(404)
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    expect((await POST(req())).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a bad session, origin, key and oversized body", async () => {
    expect((await POST(req(intake, { origin: "https://evil.example" }))).status).toBe(403)
    expect((await POST(req(intake, { cookie: "" }))).status).toBe(401)
    expect((await POST(req(intake, { "idempotency-key": "nope" }))).status).toBe(400)
    expect((await POST(req("x".repeat(9000)))).status).toBe(413)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("keeps a storage failure private", async () => {
    mocks.rpc.mockRejectedValue(new Error("function admin_case_journey_decision_v1 does not exist"))
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("does not exist")
  })

  it("rejects an incomplete review with no next action and a discrepancy marked complete", () => {
    expect(intakeDecisionArgs({ outcome: "INCOMPLETE", nextAction: "", note: "The town is missing from the enquiry." })).toBeNull()
    expect(intakeDecisionArgs({ outcome: "REVIEWED", nextAction: "Ignore the gap", note: "Read the enquiry and the business name." })).toBeNull()
    expect(verificationDecisionArgs({
      outcome: "PRELIMINARY_COMPLETE", source: "The listing", listing: "ACCESSIBLE", website: "NONE",
      discrepancy: true, reason: "The town on the form is not the town on the listing.", note: "Held for a second look.",
    })).toBeNull()
    expect(verificationDecisionArgs({
      outcome: "LISTING_UNAVAILABLE", source: "The listing", listing: "ACCESSIBLE", website: "NONE",
      discrepancy: false, reason: "The listing could not be opened.", note: "Recorded the listing state.",
    })).toBeNull()
  })
})
