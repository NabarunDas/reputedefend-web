import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/sessions/revoke/route"
import { sessionCookie } from "@/lib/auth/config"
const origin = "https://admin.profilerelaunch.com", target = "33333333-3333-4333-8333-333333333333"
const token = "a".repeat(64)
function call(body = JSON.stringify({ sessionId: target }), headers: Record<string, string> = {}, url = origin) {
  return POST(new NextRequest(`${url}/api/sessions/revoke`, { method: "POST", headers: { origin, "content-type": "application/json", cookie: `${sessionCookie}=${token}`, ...headers }, body }))
}
beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true"); vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "test"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset().mockResolvedValue("success")
})
afterEach(() => vi.unstubAllEnvs())
describe("session command HTTP boundary (without proxy)", () => {
  it.each(["", "null", "https://evil.example"])("blocks forged origin %s", async value => {
    expect((await call(undefined, { origin: value })).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("does not trust a forwarded host or origin", async () => {
    expect((await call(undefined, { "x-forwarded-host": "admin.profilerelaunch.com" }, "https://evil.example")).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(["", `${sessionCookie}=invalid`])("rejects missing or malformed session cookies", async cookie => {
    expect((await call(undefined, { cookie })).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("requires JSON and configuration", async () => {
    expect((await call(undefined, { "content-type": "text/plain" })).status).toBe(415)
    vi.stubEnv("ADMIN_AUTH_ENABLED", "false")
    expect((await call()).status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(["null", "[]", "{}", "bad json", '{"sessionId":"invalid"}', JSON.stringify({ sessionId: target, actorId: target }), JSON.stringify({ sessionId: target, rpc: "admin_identity" })])("rejects forged or invalid body %s", async body => {
    expect((await call(body)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("bounds the streamed body without content-length", async () => {
    expect((await call("x".repeat(1025))).status).toBe(413)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("hashes the cookie and uses a fixed command with a server-generated request reference", async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(mocks.rpc).toHaveBeenCalledWith("admin_revoke_session_v1", { p_token: expect.stringMatching(/^[a-f0-9]{64}$/), p_target: target, p_request: expect.stringMatching(/^[a-f0-9-]{36}$/) })
    expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe(token)
  })
  it.each([["unauthorized",401],["reauth_required",403],["denied",403],["conflict",409],["unknown",503]])("maps database rejection %s", async (result, status) => {
    mocks.rpc.mockResolvedValue(result)
    expect((await call()).status).toBe(status)
  })
  it("does not expose provider details on an uncertain result", async () => {
    mocks.rpc.mockRejectedValue(new Error("private secret"))
    const response = await call()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("private secret")
  })
})
