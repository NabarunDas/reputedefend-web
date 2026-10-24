import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { POST } from "@/app/api/cases/journey/reconcile/route"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin-git-develop.vercel.app"
const devUrl = "https://rmzozuiamjcclvtgutgd.supabase.co"
const caseId = "22222222-2222-4222-8222-222222222222"
const key = "33333333-3333-4333-8333-333333333333"

function req(body: unknown = { caseId, version: 4 }, headers: Record<string, string> = {}, url = origin) {
  return new NextRequest(`${url}/api/cases/journey/reconcile`, {
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

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", devUrl)
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_URL", "admin-git-develop.vercel.app")
  mocks.rpc.mockReset().mockResolvedValue({ status: "success", reason: "reconciled" })
})

afterEach(() => vi.unstubAllEnvs())

describe("accepted service reconciliation command", () => {
  it("sends only the case and version, and does not mark a payment", async () => {
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: "The accepted service is recorded on the case. The payment stays outstanding until Stripe confirms settlement and a receipt is stored.",
    })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_reconcile_accepted_service_v1", {
      p_case: caseId,
      p_version: 4,
      p_request: key,
      p_token: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("rejects a service choice, a payment mark, a mismatched origin, and a replayed key shape", async () => {
    expect((await POST(req({ caseId, version: 4, serviceCode: "GUIDED_RELAUNCH" }))).status).toBe(400)
    expect((await POST(req({ caseId, version: 4, obligationState: "PAID" }))).status).toBe(400)
    expect((await POST(req(undefined, { origin: "https://admin.example.invalid" }))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ status: "conflict", reason: "stale_version" })
    expect((await POST(req())).status).toBe(409)
    mocks.rpc.mockResolvedValue({ status: "prerequisite", reason: "unmatched_payment" })
    const unmatched = await POST(req())
    expect(unmatched.status).toBe(409)
    expect(await unmatched.json()).toEqual({ message: "The payment obligation does not match the accepted order, so the case was not changed." })
  })
})
