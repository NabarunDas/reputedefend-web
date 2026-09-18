import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createUser: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({
    rpc: mocks.rpc,
    identity: { auth: { signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp } },
    database: { auth: { admin: { createUser: mocks.createUser, signOut: mocks.signOut } } },
    revokeProviderSession: mocks.signOut,
  }),
  newToken: () => "c".repeat(64),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
import { POST as exchangePost } from "@/app/api/action/exchange/route"
import { POST as otpPost } from "@/app/api/action/otp/route"
import { POST as verifyPost } from "@/app/api/action/verify/route"
import { POST as commandPost } from "@/app/api/action/command/route"
import { pendingCookie, sessionCookie } from "@/lib/config"

const origin = "https://customer.profilerelaunch.com"
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
  mocks.createUser.mockReset().mockResolvedValue({ error: null })
  mocks.signInWithOtp.mockReset().mockResolvedValue({ error: null })
  mocks.verifyOtp.mockReset()
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe("customer action HTTP", () => {
  it("fails guessed IDs generically and does not echo the secret", async () => {
    mocks.rpc.mockResolvedValue({ status: "unavailable" })
    const response = await exchangePost(req("/api/action/exchange", { actionId, secret: "b".repeat(64) }))
    const payload = await response.json()
    expect(response.status).toBe(401)
    expect(payload.message).toMatch(/unavailable or has expired/)
    expect(JSON.stringify(payload)).not.toContain("b".repeat(64))
    expect((await exchangePost(req("/api/action/exchange", { actionId, secret: "b".repeat(64) }, { origin: "https://admin.profilerelaunch.com" }))).status).toBe(401)
  })
  it("sends OTP only to the expected email and never accepts an arbitrary destination", async () => {
    mocks.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", maskedEmail: "a***@example.com" })
    const response = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(response.status).toBe(200)
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    expect(mocks.createUser).toHaveBeenCalledWith({ email: "alex@example.com", email_confirm: false })
    expect(JSON.stringify(await response.json())).not.toContain("alex@example.com")
    expect(mocks.signInWithOtp.mock.calls[0][0]).not.toHaveProperty("shouldCreateUser", true)
  })
  it("ignores an Admin cookie and caller-chosen email, and binds OTP to the action email", async () => {
    mocks.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", maskedEmail: "a***@example.com" })
    const ignored = await otpPost(req("/api/action/otp", { email: "sam@example.com" }, { cookie: `pr-admin-dev=${"c".repeat(64)}` }))
    expect(ignored.status).toBe(401)
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    const response = await otpPost(req("/api/action/otp", { email: "sam@example.com" }, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(response.status).toBe(200)
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    expect(JSON.stringify(await response.json())).not.toContain("sam@example.com")
  })
  it("discards provider tokens and sets only the opaque action cookie", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ status: "ok", email: "alex@example.com" })
      .mockResolvedValueOnce({ status: "ok" })
      .mockResolvedValueOnce({ actionId, kind: "AGREEMENT_ACCEPTANCE", maskedEmail: "a***@example.com" })
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "jwt-must-not-leak", refresh_token: "refresh-must-not-leak" },
        user: { id: "66666666-6666-4666-8666-666666666666", email: "alex@example.com", email_confirmed_at: "2026-09-18T12:00:00.000Z" },
      },
      error: null,
    })
    const response = await verifyPost(req("/api/action/verify", { code: "123456" }, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(mocks.signOut).toHaveBeenCalledWith("jwt-must-not-leak")
    expect(JSON.stringify(payload)).not.toMatch(/jwt-must-not-leak|refresh-must-not-leak/)
    expect(response.cookies.get(sessionCookie)?.value).toBe("c".repeat(64))
  })
  it("ignores an Admin cookie on customer commands", async () => {
    const response = await commandPost(req("/api/action/command", { operation: "accept", accepted: true }, {
      cookie: `pr-admin-dev=${"c".repeat(64)}`,
      "idempotency-key": "33333333-3333-4333-8333-333333333333",
    }))
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
