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

function req(body: unknown = intake, headers: Record<string, string> = {}, url = origin) {
  return new NextRequest(`${url}/api/cases/journey`, {
    method: "POST",
    headers: {
      origin: url,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const screening = {
  caseId,
  version: 1,
  kind: "verification",
  data: {
    outcome: "PRELIMINARY_COMPLETE",
    source: "The enquiry and the public listing",
    listing: "NOT_SUPPLIED",
    website: "NONE",
    discrepancy: false,
    reason: "The name and country agree with the records.",
    note: "Recorded the preliminary check.",
  },
}

function agree(events: unknown[]) {
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_case_detail_v1") return {
      customerId: caseId, businessId: caseId, locationId: caseId, events,
    }
    if (name === "admin_record_detail_v1") return { record: { name: "Bakery", email: "alex@example.com", emailVerified: false, country: "UK" } }
    if (name === "admin_membership_get_v1") return { missing: true }
    if (name === "admin_case_authorization_readiness_v1") return { customerEmailVerified: false, businessAuthorityVerified: false }
    if (name === "admin_case_journey_intake_v1") return { snapshot: null, events: [] }
    return { status: "success" }
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

  it("accepts the stable develop hostname and the deployment hostname", async () => {
    const branch = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    const deployment = "https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app"
    vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).hostname)
    vi.stubEnv("VERCEL_URL", new URL(deployment).hostname)
    for (const permitted of [branch, deployment]) {
      expect((await POST(req(intake, {}, permitted))).status).toBe(200)
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it("rejects cross-host, unlisted, webhook and production origins", async () => {
    const branch = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    const deployment = "https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app"
    vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).hostname)
    vi.stubEnv("VERCEL_URL", new URL(deployment).hostname)
    expect((await POST(req(intake, { origin: branch }, deployment))).status).toBe(403)
    for (const forbidden of ["https://dev-hooks.profilerelaunch.com", "https://not-a-real-preview.vercel.app"]) {
      expect((await POST(req(intake, {}, forbidden))).status).toBe(403)
    }
    vi.stubEnv("VERCEL_ENV", "production")
    expect((await POST(req(intake, {}, "https://admin.profilerelaunch.com"))).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not complete screening before a current intake review or over a record disagreement", async () => {
    agree([])
    expect((await POST(req(screening))).status).toBe(409)
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_case_journey_decision_v1")).toBe(false)
    agree([{ event: "INTAKE_REVIEW", createdAt: "2026-01-01T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } }])
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_case_detail_v1") return {
        customerId: caseId, businessId: caseId, locationId: caseId,
        events: [{ event: "INTAKE_REVIEW", createdAt: "2026-01-01T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } }],
      }
      if (name === "admin_record_detail_v1") return { record: { name: "Bakery", email: "alex@example.com", emailVerified: true, country: "GB" } }
      if (name === "admin_membership_get_v1") return { status: "pending" }
      if (name === "admin_case_authorization_readiness_v1") return { customerEmailVerified: false, businessAuthorityVerified: true }
      if (name === "admin_case_journey_intake_v1") return { snapshot: null, events: [] }
      return { status: "success" }
    })
    expect((await POST(req(screening))).status).toBe(409)
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_case_journey_decision_v1")).toBe(false)
  })

  it("keeps a storage failure private", async () => {
    mocks.rpc.mockRejectedValue(new Error("function admin_case_journey_decision_v1 does not exist"))
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("does not exist")
  })

  it("does not record no website or not supplied when those details are already stored, unless the operator escalates", async () => {
    const reviewed = [{ event: "INTAKE_REVIEW", createdAt: "2026-01-01T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } }]
    mocks.rpc.mockImplementation(async (name: string, args: { p_entity?: string }) => {
      if (name === "admin_case_detail_v1") return { customerId: caseId, businessId: caseId, locationId: caseId, events: reviewed }
      if (name === "admin_record_detail_v1" && args?.p_entity === "business") return { record: { name: "Bakery", website: "https://bakery.example" } }
      if (name === "admin_record_detail_v1") return { record: { name: "Alex", email: "alex@example.com", emailVerified: false, country: "UK", profileUrl: "https://maps.example/listing" } }
      if (name === "admin_membership_get_v1") return { missing: true }
      if (name === "admin_case_authorization_readiness_v1") return { customerEmailVerified: false, businessAuthorityVerified: false }
      if (name === "admin_case_journey_intake_v1") return { openedAt: "2026-01-15T12:00:00.000Z", snapshot: null, events: [] }
      return { status: "success" }
    })
    const contradicted = {
      ...screening,
      data: { ...screening.data, outcome: "FURTHER_INFORMATION", listing: "SUSPENDED_OR_MISSING", website: "NONE" },
    }
    expect((await POST(req(contradicted))).status).toBe(400)
    expect((await POST(req({ ...screening, data: { ...screening.data, outcome: "FURTHER_INFORMATION", website: "PRESENT", listing: "NOT_SUPPLIED" } }))).status).toBe(400)
    expect((await POST(req(screening))).status).toBe(400)
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_case_journey_decision_v1")).toBe(false)
    const escalated = { ...contradicted, data: { ...contradicted.data, outcome: "ESCALATE", discrepancy: true } }
    expect((await POST(req(escalated))).status).toBe(200)
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_case_journey_decision_v1")).toBe(true)
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
