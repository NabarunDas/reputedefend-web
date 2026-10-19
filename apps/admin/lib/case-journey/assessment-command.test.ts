import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { POST } from "@/app/api/cases/journey/assessment/route"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin-git-develop.vercel.app"
const devUrl = "https://rmzozuiamjcclvtgutgd.supabase.co"
const caseId = "22222222-2222-4222-8222-222222222222"
const key = "33333333-3333-4333-8333-333333333333"
const draft = {
  recordVersion: 0,
  findings: "The profile was suspended and the ownership letter matches the account.",
  evidenceConsidered: "Accepted ownership letter on a fulfilled request.",
  profileIssue: "The listing is suspended.",
  policyConcerns: "",
  recommendedAction: "Recommend the Guided pathway.",
  servicePathway: "GUIDED",
  rationale: "The accepted evidence supports a guided recovery.",
  risks: "Google may still refuse the appeal.",
  outstandingInformation: "",
}
const body = { caseId, version: 1, operation: "save_draft", data: draft }

function req(payload: unknown = body, headers: Record<string, string> = {}, url = origin) {
  return new NextRequest(`${url}/api/cases/journey/assessment`, {
    method: "POST",
    headers: {
      origin: url,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
      ...headers,
    },
    body: JSON.stringify(payload),
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
  mocks.rpc.mockReset().mockResolvedValue({ status: "success", operation: "save_draft" })
})
afterEach(() => vi.unstubAllEnvs())

describe("assessment command", () => {
  it("sends the session hash and refuses a caller-supplied actor", async () => {
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/does not complete this step/) })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_case_assessment_command_v1", {
      p_case: caseId,
      p_version: 1,
      p_operation: "save_draft",
      p_data: draft,
      p_request: key,
      p_token: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))
    expect((await POST(req({ ...body, actor: "staff" }))).status).toBe(400)
  })

  it("is absent outside the develop Preview and does not call the database", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect((await POST(req())).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a bad session, origin, key and oversized body", async () => {
    expect((await POST(req(body, { origin: "https://evil.example" }))).status).toBe(403)
    expect((await POST(req(body, { cookie: "" }))).status).toBe(401)
    expect((await POST(req(body, { "idempotency-key": "nope" }))).status).toBe(400)
    expect((await POST(req("x".repeat(50000)))).status).toBe(413)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("keeps a missing function private and does not describe a draft as approval", async () => {
    mocks.rpc.mockRejectedValue(new Error("function admin_case_assessment_command_v1 does not exist"))
    const failed = await POST(req())
    expect(failed.status).toBe(503)
    const failure = await failed.text()
    expect(failure).not.toContain("does not exist")
    expect(failure).toMatch(/may not be applied yet/)
    mocks.rpc.mockResolvedValue({ status: "success", operation: "approve" })
    const approved = await POST(req({ ...body, operation: "approve", data: { recordVersion: 2 } }))
    expect(approved.status).toBe(200)
    const message = (await approved.json()).message as string
    expect(message).toMatch(/complete only while/)
    expect(message).not.toMatch(/service is activated|agreement accepted/)
  })

  it("reports evidence, staleness and a closed case without writing a local completion", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "prerequisite" })
    expect((await POST(req({ ...body, operation: "approve", data: { recordVersion: 2 } }))).status).toBe(409)
    mocks.rpc.mockResolvedValueOnce({ status: "stale" })
    expect((await POST(req({ ...body, operation: "approve", data: { recordVersion: 2 } }))).status).toBe(409)
    mocks.rpc.mockResolvedValueOnce({ status: "denied" })
    expect((await POST(req())).status).toBe(403)
    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    expect((await POST(req())).status).toBe(409)
  })
})
