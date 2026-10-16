import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { POST } from "@/app/api/cases/journey/wording/route"
import { sessionCookie } from "@/lib/auth/config"
import { evidenceWording } from "./wording-text"

const origin = "https://admin-git-develop.vercel.app"
const devUrl = "https://rmzozuiamjcclvtgutgd.supabase.co"
const key = "33333333-3333-4333-8333-333333333333"
const communicationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const message = "Please send the shop licence and the suspension notice. A photo of the shop front is enough."
const body = { communicationId, version: 2, subject: "Documents for your profile", message }

function req(payload: unknown = body, headers: Record<string, string> = {}, url = origin) {
  return new NextRequest(`${url}/api/cases/journey/wording`, {
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
  mocks.rpc.mockReset().mockResolvedValue({ status: "success", id: communicationId, version: 1 })
})
afterEach(() => vi.unstubAllEnvs())

describe("evidence wording", () => {
  it("accepts plain wording and rejects links and markup", () => {
    expect(evidenceWording(" Documents for your profile ", `  ${message}  `)).toEqual({
      subject: "Documents for your profile",
      message,
    })
    expect(evidenceWording("Bad\nsubject", message)).toBeNull()
    expect(evidenceWording("Subject", "Please send <b>the licence</b> today.")).toBeNull()
    expect(evidenceWording("Subject", "Please upload it at https://evil.example/steal today.")).toBeNull()
    expect(evidenceWording("Subject", "Please use javascript:alert(1) in the browser.")).toBeNull()
    expect(evidenceWording("Subject", "Please include #t=abcdef in this message.")).toBeNull()
    expect(evidenceWording("Subject", "Short")).toBeNull()
  })
})

describe("journey wording command", () => {
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

  it("saves staff wording and refuses a recipient, a link, or a sender", async () => {
    const ok = await POST(req())
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ message: "The wording was saved. The email has not been sent.", id: communicationId, version: 1 })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_communication_revise_evidence_draft_v1", {
      p_token: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_request: key,
      p_communication: communicationId,
      p_version: 2,
      p_subject: "Documents for your profile",
      p_body: message,
    })
    expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))
    mocks.rpc.mockClear()
    expect((await POST(req({ ...body, recipient: "other@example.com" }))).status).toBe(400)
    expect((await POST(req({ ...body, fromAddress: "attacker@example.com" }))).status).toBe(400)
    expect((await POST(req({ ...body, message: "Please use https://evil.example/steal for the upload." }))).status).toBe(400)
    expect((await POST(req({ ...body, message: "<p>Please send the shop licence today.</p>" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("accepts both preview hostnames and rejects the others", async () => {
    const branch = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    const deployment = "https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app"
    vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).hostname)
    vi.stubEnv("VERCEL_URL", new URL(deployment).hostname)
    for (const permitted of [branch, deployment]) {
      expect((await POST(req(body, {}, permitted))).status).toBe(200)
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    mocks.rpc.mockClear()
    expect((await POST(req(body, { origin: branch }, deployment))).status).toBe(403)
    for (const forbidden of ["https://dev-hooks.profilerelaunch.com", "https://not-a-real-preview.vercel.app", "https://admin.profilerelaunch.com"]) {
      expect((await POST(req(body, {}, forbidden))).status).toBe(403)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("keeps a stale version and a failed save from looking successful", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    expect((await POST(req())).status).toBe(409)
    mocks.rpc.mockResolvedValueOnce({ status: "denied" })
    expect((await POST(req())).status).toBe(403)
    mocks.rpc.mockRejectedValueOnce(new Error("function admin_communication_revise_evidence_draft_v1 does not exist"))
    const failed = await POST(req())
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain("does not exist")
  })
})
