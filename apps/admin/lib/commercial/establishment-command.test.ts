import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { authConfig, sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("../auth/backend", async original => ({
  ...await original<typeof import("../auth/backend")>(),
  backend: () => mocks,
  tokenHash: (value: string) => `hash:${value}`,
}))
import { recordBusinessEstablishment } from "./establishment-command"

const deployment = "https://profilerelaunch-admin-kj0yz08w5-clientcove.vercel.app"
const branch = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
const production = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const payload = {
  businessId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  purchaserType: "SOLE_TRADER",
  countryCode: "GB",
  legalName: "Example Genuine Business",
  evidenceType: "OTHER",
  evidenceReference: "Operator directly checked the authentic business address.",
  outcome: "verified",
  confirmed: true,
}

function req(origin: string, body: unknown = payload, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/operations/business-establishment`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_URL", new URL(deployment).hostname)
  vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).hostname)
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
  mocks.rpc.mockImplementation(async (name: string, args?: { p_payload?: { verificationStatus?: string; countryCode?: string } }) => {
    if (name === "admin_session_v1") return { userId: "11111111-1111-4111-8111-111111111111", createdAt: new Date().toISOString() }
    if (name === "admin_record_business_establishment_v1") {
      return {
        status: "success",
        verificationStatus: args?.p_payload?.verificationStatus,
        countryCode: args?.p_payload?.countryCode,
      }
    }
    return null
  })
})
afterEach(() => vi.unstubAllEnvs())

describe("business establishment origin", () => {
  it("accepts a same-origin POST on either supported Preview hostname", async () => {
    for (const permitted of [deployment, branch]) {
      const response = await recordBusinessEstablishment(req(permitted))
      expect(response.status).toBe(200)
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(4)
    const saved = mocks.rpc.mock.calls.find(call => call[0] === "admin_record_business_establishment_v1")
    expect(saved?.[1].p_payload.evidenceReference).toMatch(/^Purchaser is a sole trader\. /)
    expect(saved?.[1].p_payload.verificationStatus).toBe("VERIFIED")
    expect(saved?.[1].p_payload).not.toHaveProperty("purchaserType")
    expect(saved?.[1].p_request).toBe(key)
  })

  it("accepts a valid Admin login up to 30 minutes old, retaining the purchaser evidence checks", async () => {
    const signedInAt = new Date(Date.now() - 29 * 60 * 1000).toISOString()
    mocks.rpc.mockImplementation(async (name: string, args?: { p_payload?: { verificationStatus?: string; countryCode?: string } }) => {
      if (name === "admin_session_v1") return {
        userId: "11111111-1111-4111-8111-111111111111", createdAt: signedInAt,
      }
      if (name === "admin_record_business_establishment_v1") {
        return { status: "success", verificationStatus: args?.p_payload?.verificationStatus, countryCode: args?.p_payload?.countryCode }
      }
      return null
    })
    const response = await recordBusinessEstablishment(req(branch))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_record_business_establishment_v1", expect.objectContaining({
      p_payload: expect.objectContaining({ countryCode: "GB", verificationStatus: "VERIFIED" }),
    }))
  })

  it("requires a fresh sign-in after 30 minutes, without recording any establishment", async () => {
    const signedInAt = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_session_v1") return {
        userId: "11111111-1111-4111-8111-111111111111", createdAt: signedInAt,
      }
      if (name === "admin_record_business_establishment_v1") return { status: "success" }
      return null
    })
    const response = await recordBusinessEstablishment(req(branch))
    expect(response.status).toBe(403)
    expect((await response.json() as { message: string }).message).toContain("30-minute")
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_session_v1"])
  })

  it("still rejects missing, malformed, or future-dated Admin sessions", async () => {
    const sessions = [
      null,
      { userId: "11111111-1111-4111-8111-111111111111", createdAt: "invalid-date" },
      { userId: "11111111-1111-4111-8111-111111111111", createdAt: new Date(Date.now() + 2 * 60 * 1000).toISOString() },
      { createdAt: new Date().toISOString() },
    ]
    for (const session of sessions) {
      mocks.rpc.mockReset().mockImplementation(async (name: string) =>
        name === "admin_session_v1" ? session : { status: "success" })
      const response = await recordBusinessEstablishment(req(branch))
      expect(response.status).toBe(403)
      expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_session_v1"])
    }
  })

  it("rejects a cross-origin POST and a cross-host pair of allowlisted Preview origins", async () => {
    expect((await recordBusinessEstablishment(req("https://evil.example", payload, deployment))).status).toBe(403)
    expect((await recordBusinessEstablishment(req(branch, payload, deployment))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects the webhook host and an unlisted preview alias", async () => {
    for (const forbidden of [
      "https://dev-hooks.profilerelaunch.com",
      "https://not-a-real-preview.vercel.app",
    ]) {
      expect((await recordBusinessEstablishment(req(forbidden))).status).toBe(403)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("uses the production admin origin and the production database only", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    expect(authConfig()?.allowedOrigins).toEqual([production])
    const saved = await recordBusinessEstablishment(req(production))
    expect(saved.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_record_business_establishment_v1", expect.objectContaining({
      p_payload: expect.objectContaining({ countryCode: "GB", verificationStatus: "VERIFIED" }),
    }))
    mocks.rpc.mockClear()
    for (const forbidden of [deployment, "https://dev-hooks.profilerelaunch.com"]) {
      expect((await recordBusinessEstablishment(req(forbidden))).status).toBe(403)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()

    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    expect(authConfig()).toBeNull()
    expect((await recordBusinessEstablishment(req(production))).status).toBe(503)
  })

  it("refuses synthetic evidence before the establishment command", async () => {
    const response = await recordBusinessEstablishment(req(deployment, {
      ...payload,
      evidenceReference: "DEV SYNTHETIC / NOT REAL simulated payer for this fictional business.",
    }))
    expect(response.status).toBe(400)
    const body = await response.json() as { message?: string }
    expect(body.message).toMatch(/synthetic test label/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("saves a pending sole trader without marking it verified", async () => {
    const response = await recordBusinessEstablishment(req(deployment, {
      businessId: payload.businessId,
      purchaserType: "SOLE_TRADER",
      countryCode: "GB",
      legalName: "Example Genuine Business",
      evidenceType: "OTHER",
      evidenceReference: "The customer described the trading name. No independent check yet.",
      outcome: "pending",
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as { message?: string }
    expect(body.message).toMatch(/Saved as not yet verified/)
    expect(body.message).toMatch(/new purchasing-establishment note/)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_record_business_establishment_v1", expect.objectContaining({
      p_payload: expect.objectContaining({ verificationStatus: "PENDING" }),
    }))
  })

  it("does not report a pending or rejected save when the verified record is reused", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_session_v1") return { userId: "11111111-1111-4111-8111-111111111111", createdAt: new Date().toISOString() }
      if (name === "admin_record_business_establishment_v1") return { status: "success", verificationStatus: "VERIFIED", countryCode: "GB" }
      return null
    })
    const pending = await recordBusinessEstablishment(req(deployment, {
      ...payload,
      outcome: "pending",
      confirmed: false,
      evidenceReference: "The customer described the trading name. No independent check yet.",
    }))
    expect(pending.status).toBe(409)
    const pendingBody = await pending.json() as { message?: string }
    expect(pendingBody.message).toMatch(/already current/)
    expect(pendingBody.message).toMatch(/was not saved/)
    expect(pendingBody.message).not.toMatch(/Saved as not yet verified|new purchasing-establishment note/)
    const rejected = await recordBusinessEstablishment(req(deployment, {
      ...payload,
      outcome: "rejected",
      confirmed: false,
      evidenceReference: "The documents supplied do not show the purchasing establishment.",
    }))
    expect(rejected.status).toBe(409)
    const rejectedBody = await rejected.json() as { message?: string }
    expect(rejectedBody.message).not.toMatch(/Recorded as not sufficient|new purchasing-establishment note/)
  })

  it("does not claim changed verified details were stored", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_session_v1") return { userId: "11111111-1111-4111-8111-111111111111", createdAt: new Date().toISOString() }
      if (name === "admin_record_business_establishment_v1") return { status: "success", verificationStatus: "VERIFIED", countryCode: "GB" }
      return null
    })
    const response = await recordBusinessEstablishment(req(deployment, {
      ...payload,
      legalName: "Replacement Name Ltd",
      evidenceReference: "A later check names a different office and must not replace the record.",
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as { message?: string }
    expect(body.message).toMatch(/already the current record/)
    expect(body.message).toMatch(/does not confirm that the name or evidence/)
    expect(body.message).not.toContain("Replacement Name Ltd")
  })

  it("reports an idempotent retry without describing a new save", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_session_v1") return { userId: "11111111-1111-4111-8111-111111111111", createdAt: new Date().toISOString() }
      if (name === "admin_record_business_establishment_v1") return { status: "replay", countryCode: "GB" }
      return null
    })
    const response = await recordBusinessEstablishment(req(deployment, {
      ...payload,
      outcome: "pending",
      confirmed: false,
      evidenceReference: "The customer described the trading name. No independent check yet.",
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as { message?: string }
    expect(body.message).toMatch(/already recorded/)
    expect(body.message).toMatch(/not overwritten/)
    expect(body.message).not.toMatch(/Saved as not yet verified|new purchasing-establishment note/)
  })

  it("reports a different verified country as a conflict to review", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_session_v1") return { userId: "11111111-1111-4111-8111-111111111111", createdAt: new Date().toISOString() }
      if (name === "admin_record_business_establishment_v1") return { status: "conflict", reason: "conflicting_establishment" }
      return null
    })
    const response = await recordBusinessEstablishment(req(deployment))
    expect(response.status).toBe(409)
    const body = await response.json() as { message?: string }
    expect(body.message).toMatch(/different verified purchasing establishment/)
  })
})
