import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { createHash } from "node:crypto"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async (original) => ({
  ...(await original<typeof import("@/lib/auth/backend")>()),
  backend: () => mocks,
}))

import { POST } from "@/app/api/cases/intake-mail/route"
import { sessionCookie } from "@/lib/auth/config"
import { marketingDevelopOrigin } from "./command"

const branchHost = "profilerelaunch-admin-git-develop-clientcove.vercel.app"
const origin = `https://${branchHost}`
const devUrl = "https://rmzozuiamjcclvtgutgd.supabase.co"
const caseId = "11111111-1111-4111-8111-111111111111"
const key = "33333333-3333-4333-8333-333333333333"
const token = "a".repeat(64)
const body = { caseId, publicRef: "PR-26-RZYCE4" }

function req(payload: unknown = body, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/cases/intake-mail`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${token}`,
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("SUPABASE_URL", devUrl)
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_BRANCH_URL", branchHost)
  vi.stubEnv("VERCEL_URL", branchHost)
  mocks.rpc.mockReset().mockResolvedValue({
    id: caseId,
    userId: caseId,
    createdAt: "2026-10-20T00:00:00.000Z",
    expiresAt: "2026-10-20T12:00:00.000Z",
  })
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, receiptEmailStatus: "sent" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("intake mail retry command", () => {
  it("derives only the matching marketing develop host", () => {
    expect(marketingDevelopOrigin(branchHost)).toBe("https://reputedefend-web-git-develop-clientcove.vercel.app")
    expect(marketingDevelopOrigin("profilerelaunch-admin-git-feature-clientcove.vercel.app")).toBeNull()
    expect(marketingDevelopOrigin("reputedefend-web-git-develop-clientcove.vercel.app")).toBeNull()
    expect(marketingDevelopOrigin(undefined)).toBeNull()
  })

  it("is absent outside the develop DEV lane and does not call Marketing", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect((await POST(req())).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a missing session, a public reference alone, and a caller-supplied recipient", async () => {
    expect((await POST(req(body, { cookie: "" }))).status).toBe(401)
    expect((await POST(req({ publicRef: "PR-26-RZYCE4" }))).status).toBe(400)
    expect((await POST(req({ ...body, email: "person@example.com" }))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("forwards the session to the derived Marketing origin and no other host", async () => {
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]))
    expect(calls).toEqual([
      "https://reputedefend-web-git-develop-clientcove.vercel.app/api/staff/case-intake-mail",
    ])
    const marketingCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes("reputedefend-web-git-develop-"))
    const [url, init] = marketingCall ?? []
    expect(url).toBe("https://reputedefend-web-git-develop-clientcove.vercel.app/api/staff/case-intake-mail")
    const headers = new Headers(init?.headers)
    expect(headers.get("authorization")).toBe(`Bearer ${token}`)
    expect(headers.get("idempotency-key")).toBe(key)
    expect(init?.redirect).toBe("manual")
    expect(JSON.parse(String(init?.body))).toEqual(body)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_session_v1", {
      p_token: createHash("sha256").update(token).digest("hex"),
    })
    expect(JSON.stringify(init)).not.toMatch(/person@example.com/)
  })

  it("does not call Marketing when the branch host cannot be derived", async () => {
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-abc123-clientcove.vercel.app")
    vi.stubEnv("VERCEL_URL", branchHost)
    expect((await POST(req())).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
})
