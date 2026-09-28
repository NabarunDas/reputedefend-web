import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), createUser: vi.fn(), listUsers: vi.fn(), updateUserById: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(),
}))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({
    rpc: mocks.rpc,
    identity: { auth: { signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp } },
    database: { auth: { admin: { createUser: mocks.createUser, listUsers: mocks.listUsers, updateUserById: mocks.updateUserById, signOut: mocks.signOut } } },
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
  mocks.createUser.mockReset().mockResolvedValue({
    data: { user: { id: "66666666-6666-4666-8666-666666666666", email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
    error: null,
  })
  mocks.listUsers.mockReset()
  mocks.updateUserById.mockReset()
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
    expect(mocks.createUser).toHaveBeenCalledWith({ email: "alex@example.com", email_confirm: true })
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_action_begin_otp_v1",
      "customer_action_confirm_otp_sent_v1",
    ])
    expect(JSON.stringify(await response.json())).not.toContain("alex@example.com")
    expect(mocks.signInWithOtp.mock.calls[0][0]).not.toHaveProperty("shouldCreateUser", true)
  })
  it("does not confirm OTP_SENT when the provider rejects the send", async () => {
    mocks.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", maskedEmail: "a***@example.com" })
    mocks.signInWithOtp.mockResolvedValue({ error: { message: "provider exploded with secrets" } })
    const response = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    const payload = await response.json()
    expect(response.status).toBe(503)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_action_begin_otp_v1"])
    expect(JSON.stringify(payload)).not.toMatch(/provider exploded|secrets|alex@example.com/)
  })
  it("reuses a confirmed identity and confirms an unconfirmed one before sending OTP", async () => {
    mocks.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", maskedEmail: "a***@example.com" })
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } })
    mocks.listUsers.mockResolvedValue({
      data: { users: [{ id: "66666666-6666-4666-8666-666666666666", email: "alex@example.com", email_confirmed_at: "2026-09-18T12:00:00.000Z" }] },
      error: null,
    })
    const confirmed = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(confirmed.status).toBe(200)
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    mocks.signInWithOtp.mockClear()
    mocks.updateUserById.mockResolvedValue({
      data: { user: { id: "66666666-6666-4666-8666-666666666666", email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
      error: null,
    })
    mocks.listUsers.mockResolvedValue({
      data: { users: [{ id: "66666666-6666-4666-8666-666666666666", email: "alex@example.com", email_confirmed_at: null }] },
      error: null,
    })
    const recovered = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(recovered.status).toBe(200)
    expect(mocks.updateUserById).toHaveBeenCalledWith("66666666-6666-4666-8666-666666666666", { email_confirm: true })
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    expect(JSON.stringify(await recovered.json())).not.toContain("alex@example.com")
  })
  it("returns a generic 503 when identity provisioning fails and never leaks Auth details", async () => {
    mocks.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", maskedEmail: "a***@example.com" })
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { message: "create exploded with secrets" } })
    const created = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(created.status).toBe(503)
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_action_begin_otp_v1"])
    expect(JSON.stringify(await created.json())).not.toMatch(/create exploded|secrets|alex@example.com/)
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { message: "already exists" } })
    mocks.listUsers.mockResolvedValue({ data: null, error: { message: "list exploded" } })
    const listed = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(listed.status).toBe(503)
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    mocks.listUsers.mockResolvedValue({
      data: { users: [{ id: "66666666-6666-4666-8666-666666666666", email: "alex@example.com", email_confirmed_at: null }] },
      error: null,
    })
    mocks.updateUserById.mockResolvedValue({ data: { user: null }, error: { message: "update exploded" } })
    const updated = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(updated.status).toBe(503)
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    expect(JSON.stringify(await updated.json())).not.toMatch(/update exploded|alex@example.com/)
  })
  it("does not provision an identity for the Admin email or an ineligible action", async () => {
    mocks.rpc.mockResolvedValue({ status: "ok", email: "admin@profilerelaunch.com", maskedEmail: "a***@profilerelaunch.com" })
    const admin = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(admin.status).toBe(401)
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.listUsers).not.toHaveBeenCalled()
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ status: "unavailable" })
    const denied = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(denied.status).toBe(401)
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })
  it("rejects extra OTP fields and never uses a caller-chosen email", async () => {
    const ignored = await otpPost(req("/api/action/otp", { email: "attacker@example.com" }, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(ignored.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
    const noType = await otpPost(req("/api/action/otp", {}, { cookie: `${pendingCookie}=${"c".repeat(64)}`, "content-type": "text/plain" }))
    expect(noType.status).toBe(401)
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })
  it("rejects extra command fields", async () => {
    const extra = await commandPost(req("/api/action/command", { operation: "accept", accepted: true, email: "attacker@example.com" }, {
      cookie: `${sessionCookie}=${"c".repeat(64)}`,
      "idempotency-key": "33333333-3333-4333-8333-333333333333",
    }))
    expect(extra.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    const declineExtra = await commandPost(req("/api/action/command", { operation: "decline", confirmed: true }, {
      cookie: `${sessionCookie}=${"c".repeat(64)}`,
      "idempotency-key": "33333333-3333-4333-8333-333333333333",
    }))
    expect(declineExtra.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects extra verify fields", async () => {
    const response = await verifyPost(req("/api/action/verify", { code: "123456", email: "attacker@example.com" }, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
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
  it("does not set the action cookie when the session projection is unexpectedly null", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ status: "ok", email: "alex@example.com" })
      .mockResolvedValueOnce({ status: "ok" })
      .mockResolvedValueOnce(null)
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "jwt-must-not-leak", refresh_token: "refresh-must-not-leak" },
        user: { id: "66666666-6666-4666-8666-666666666666", email: "alex@example.com", email_confirmed_at: "2026-09-18T12:00:00.000Z" },
      },
      error: null,
    })
    const response = await verifyPost(req("/api/action/verify", { code: "123456" }, { cookie: `${pendingCookie}=${"c".repeat(64)}` }))
    const payload = await response.json()
    expect(response.status).toBe(401)
    expect(payload.message).toMatch(/unavailable or has expired/)
    expect(payload.session).toBeUndefined()
    expect(JSON.stringify(payload)).not.toMatch(/jwt-must-not-leak|refresh-must-not-leak|alex@example.com/)
    expect(response.cookies.get(sessionCookie)?.value).toBeFalsy()
    expect(response.cookies.get(pendingCookie)?.value).toBe("")
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_action_attempt_otp_v1",
      "customer_action_finish_otp_v1",
      "customer_action_session_v1",
    ])
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
