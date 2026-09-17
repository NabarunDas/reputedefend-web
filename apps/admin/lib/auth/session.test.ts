import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const rpc = vi.hoisted(() => vi.fn())
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc, auth: { admin: {} } }) }))
import { sessionFromToken, tokenHash } from "./backend"
import { authConfig } from "./config"
beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", "https://admin.profilerelaunch.com")
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-public")
  rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
describe("server session boundary", () => {
  it("accepts only a database-validated session and sends only a token hash", async () => {
    const session={id:"id",userId:"uid",createdAt:"now",expiresAt:"later"}
    rpc.mockResolvedValue({data:session,error:null})
    expect(await sessionFromToken("a".repeat(64))).toEqual(session)
    expect(rpc).toHaveBeenCalledWith("admin_session_v1",{p_token:tokenHash("a".repeat(64))})
  })
  it("rejects forged cookie formats without a database call", async () => {
    for(const cookie of [undefined,"staff=true","OWNER","ey.fake.jwt"]) expect(await sessionFromToken(cookie)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
  it("denies stale sessions and fails closed during a database outage",async () => {
    rpc.mockResolvedValue({data:null,error:null})
    expect(await sessionFromToken("a".repeat(64))).toBeNull()
    rpc.mockRejectedValue(new Error("offline"))
    expect(await sessionFromToken("a".repeat(64))).toBeNull()
  })
  it("does not accept sessions while the feature is disabled",async () => {
    vi.stubEnv("ADMIN_AUTH_ENABLED","false")
    expect(await sessionFromToken("a".repeat(64))).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each(["https://admin.profilerelaunch.com/", "https://user:pass@example.com", "http://admin.profilerelaunch.com"])("rejects unsafe or ambiguous origin %s", origin => {
    vi.stubEnv("ADMIN_ORIGIN",origin)
    expect(authConfig()).toBeNull()
  })
})
