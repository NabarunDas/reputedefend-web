import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({rpc:vi.fn(), send:vi.fn(), verify:vi.fn(), revoke:vi.fn()}))
vi.mock("@/lib/auth/backend", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/auth/backend")>(),
  backend: () => ({rpc:mocks.rpc, identity:{auth:{signInWithOtp:mocks.send,verifyOtp:mocks.verify}},revokeProviderSession:mocks.revoke}),
}))
import { POST } from "./route"
import { challengeCookie, sessionCookie } from "@/lib/auth/config"
const origin = "https://admin.profilerelaunch.com"
const uid = "11111111-1111-4111-8111-111111111111"
function call(action:string, body:unknown={}, headers:Record<string,string>={}) {
  return POST(new NextRequest(`${origin}/auth/${action}`, {method:"POST",headers:{origin,"content-type":"application/json",cookie:`${challengeCookie}=${"a".repeat(64)}; ${sessionCookie}=${"b".repeat(64)}`,...headers},body:JSON.stringify(body)}),{params:Promise.resolve({action})})
}
beforeEach(()=> {
  vi.stubEnv("ADMIN_AUTH_ENABLED","true");vi.stubEnv("ADMIN_ORIGIN",origin)
  vi.stubEnv("SUPABASE_URL","https://example.supabase.co");vi.stubEnv("SUPABASE_SECRET_KEY","test-secret");vi.stubEnv("SUPABASE_PUBLISHABLE_KEY","test-publishable")
  vi.resetAllMocks()
  mocks.rpc.mockResolvedValue(uid);mocks.send.mockResolvedValue({error:null});mocks.revoke.mockResolvedValue({error:null})
  mocks.verify.mockResolvedValue({error:null,data:{session:{access_token:"provider-token"},user:{id:uid,email:"admin@profilerelaunch.com",email_confirmed_at:"2026-09-17"}}})
})
afterEach(()=>vi.unstubAllEnvs())
describe("admin OTP routes",()=> {
  it("sends only to the fixed admin and cannot create accounts",async()=> {
    const result=await call("send",{email:"attacker@example.com",role:"OWNER"})
    expect(result.status).toBe(200)
    expect(mocks.send).toHaveBeenCalledWith({email:"admin@profilerelaunch.com",options:{shouldCreateUser:false}})
    expect(result.headers.get("set-cookie")).toMatch(/HttpOnly/)
    expect(result.headers.get("set-cookie")).toMatch(/SameSite=strict/i)
    expect(result.headers.get("set-cookie")).not.toMatch(/Domain=/)
    expect(result.headers.get("cache-control")).toContain("no-store")
  })
  it.each(["https://evil.example", "null", ""])("rejects bad origin %s before provider access",async bad=> {
    expect((await call("send",{}, {origin:bad})).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("fails closed when not configured",async()=> {
    vi.stubEnv("ADMIN_AUTH_ENABLED","false")
    expect((await call("send")).status).toBe(503);expect(mocks.send).not.toHaveBeenCalled()
  })
  it("does not send when the database rejects or is unavailable",async()=> {
    mocks.rpc.mockResolvedValue(null)
    expect((await call("send")).status).toBe(429)
    mocks.rpc.mockRejectedValue(new Error("private database details"))
    const response=await call("send")
    expect(response.status).toBe(503);expect(await response.text()).not.toContain("private database")
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it("does not create a challenge cookie on email failure",async()=> {
    mocks.send.mockResolvedValue({error:{message:"provider secret"}})
    const response=await call("send")
    expect(response.status).toBe(503);expect(response.headers.get("set-cookie")).toBeNull()
  })
  it("rejects guesses without a challenge and malformed codes",async()=> {
    expect((await call("verify",{code:"123456"},{cookie:""})).status).toBe(400)
    expect((await call("verify",{code:"abc"})).status).toBe(400)
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it("does not call Supabase when attempts are exhausted",async()=> {
    mocks.rpc.mockResolvedValue(null)
    expect((await call("verify",{code:"123456"})).status).toBe(429)
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it("rejects invalid provider codes without issuing a session",async()=> {
    mocks.verify.mockResolvedValue({error:{message:"expired"},data:{}})
    const r=await call("verify",{code:"123456"})
    expect(r.status).toBe(401);expect(r.headers.get("set-cookie")).toBeNull()
  })
  it("rejects a valid OTP for an identity other than the bound admin",async()=> {
    mocks.verify.mockResolvedValue({error:null,data:{session:{access_token:"secret"},user:{id:"another-user",email:"admin@profilerelaunch.com",email_confirmed_at:"yes"}}})
    expect((await call("verify",{code:"123456"})).status).toBe(403)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it("issues only opaque cookie, hashes token in database and revokes provider session",async()=> {
    mocks.rpc.mockResolvedValueOnce(uid).mockResolvedValueOnce(true)
    const r=await call("verify",{code:"123456"})
    expect(r.status).toBe(200)
    expect(mocks.revoke).toHaveBeenCalledWith("provider-token")
    expect(r.headers.get("set-cookie")).toMatch(new RegExp(`${sessionCookie}=[a-f0-9]{64}`))
    const token=r.cookies.get(sessionCookie)!.value
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token)
    expect(await r.text()).not.toContain("provider-token")
  })
  it("fails closed if challenge completion loses a race",async()=> {
    mocks.rpc.mockResolvedValueOnce(uid).mockResolvedValueOnce(false)
    const r=await call("verify",{code:"123456"})
    expect(r.status).toBe(401);expect(r.headers.get("set-cookie")).toBeNull()
  })
  it("revokes server session before deleting cookie",async()=> {
    mocks.rpc.mockResolvedValue(true)
    const r=await call("logout-all")
    expect(r.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_revoke_sessions_v1",expect.objectContaining({p_all:true}))
    expect(r.headers.get("set-cookie")).toContain("Max-Age=0")
    mocks.rpc.mockRejectedValue(new Error("offline"))
    const failed=await call("logout")
    expect(failed.status).toBe(503);expect(failed.headers.get("set-cookie")).toBeNull()
  })
  it("bounds request size",async()=>expect((await call("send",{large:"x".repeat(1100)})).status).toBe(413))
})
