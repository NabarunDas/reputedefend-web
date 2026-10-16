import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { authConfig, sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("../auth/backend", async original => ({
  ...await original<typeof import("../auth/backend")>(),
  backend: () => mocks,
  tokenHash: (value: string) => `hash:${value}`,
}))
import { recordDevBusinessEstablishment } from "./establishment-command"

const deployment = "https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app"
const branch = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
const key = "33333333-3333-4333-8333-333333333333"
const payload = {
  businessId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  countryCode: "GB",
  legalName: "Example Genuine Business Ltd",
  evidenceType: "OTHER",
  evidenceReference: "Operator directly checked the authentic business address.",
  verificationStatus: "VERIFIED",
  confirmed: true,
}

function req(origin: string, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/operations/business-establishment`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_URL", new URL(deployment).hostname)
  vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).hostname)
  vi.stubEnv("DEV_BUSINESS_ESTABLISHMENT_EDITOR_ENABLED", "true")
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_session_v1") return { userId: "11111111-1111-4111-8111-111111111111", createdAt: new Date().toISOString() }
    if (name === "admin_record_business_establishment_v1") return { status: "success" }
    return null
  })
})
afterEach(() => vi.unstubAllEnvs())

describe("business establishment origin", () => {
  it("accepts a same-origin POST on either supported Preview hostname", async () => {
    for (const permitted of [deployment, branch]) {
      const response = await recordDevBusinessEstablishment(req(permitted))
      expect(response.status).toBe(200)
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(4)
  })

  it("rejects a cross-origin POST and a cross-host pair of allowlisted Preview origins", async () => {
    expect((await recordDevBusinessEstablishment(req("https://evil.example", deployment))).status).toBe(403)
    expect((await recordDevBusinessEstablishment(req(branch, deployment))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects the webhook host, the production admin host, and an unlisted preview alias", async () => {
    for (const forbidden of [
      "https://dev-hooks.profilerelaunch.com",
      "https://admin.profilerelaunch.com",
      "https://not-a-real-preview.vercel.app",
    ]) {
      expect((await recordDevBusinessEstablishment(req(forbidden))).status).toBe(403)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("stays closed in Production and the allowlist is only the canonical admin origin", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    expect(authConfig()?.allowedOrigins).toEqual(["https://admin.profilerelaunch.com"])
    for (const origin of ["https://admin.profilerelaunch.com", deployment, "https://dev-hooks.profilerelaunch.com"]) {
      expect((await recordDevBusinessEstablishment(req(origin))).status).toBe(404)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
