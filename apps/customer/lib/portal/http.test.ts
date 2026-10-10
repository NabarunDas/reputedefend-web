import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const state = vi.hoisted(() => ({
  issued: 0,
  rpc: vi.fn(),
  createUser: vi.fn(),
  listUsers: vi.fn(),
  updateUserById: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock("@/lib/backend", async original => {
  const { createHash } = await import("node:crypto")
  return {
    ...await original<typeof import("@/lib/backend")>(),
    backend: () => ({
      rpc: state.rpc,
      identity: { auth: { signInWithOtp: state.signInWithOtp, verifyOtp: state.verifyOtp } },
      database: { auth: { admin: { createUser: state.createUser, listUsers: state.listUsers, updateUserById: state.updateUserById, signOut: state.signOut } } },
      revokeProviderSession: state.signOut,
    }),
    newToken: () => {
      state.issued += 1
      return (state.issued % 2 === 0 ? "b" : "a").repeat(64)
    },
    tokenHash: (value: string) => createHash("sha256").update(value).digest("hex"),
  }
})
import { POST as startPost } from "@/app/api/portal/auth/start/route"
import { POST as resendPost } from "@/app/api/portal/auth/resend/route"
import { POST as verifyPost } from "@/app/api/portal/auth/verify/route"
import { POST as signOutPost } from "@/app/api/portal/auth/sign-out/route"
import { POST as commandPost } from "@/app/api/action/command/route"
import { POST as exchangePost } from "@/app/api/action/exchange/route"
import { pendingCookie, sessionCookie } from "@/lib/config"
import { PORTAL_LOGIN_MESSAGE, PORTAL_VERIFY_ERROR } from "@/lib/portal/email"
import { portalPendingCookieName, portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const customerId = "22222222-2222-4222-8222-222222222222"
const authUser = "66666666-6666-4666-8666-666666666666"
const pending = "c".repeat(64)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function enable(portal = true) {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", portal ? "true" : "")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
}

beforeEach(() => {
  enable()
  state.issued = 0
  state.rpc.mockReset()
  state.createUser.mockReset().mockResolvedValue({
    data: { user: { id: authUser, email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
    error: null,
  })
  state.listUsers.mockReset()
  state.updateUserById.mockReset()
  state.signInWithOtp.mockReset().mockResolvedValue({ error: null })
  state.verifyOtp.mockReset()
  state.signOut.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe("portal login start", () => {
  it("refuses when the portal gate is off and leaves action configuration usable", async () => {
    enable(false)
    const response = await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))
    expect(response.status).toBe(404)
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("refuses a missing origin, the wrong content type, and a malformed or oversized body", async () => {
    expect((await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }, { origin: "https://evil.example" }))).status).toBe(401)
    expect((await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }, { "content-type": "text/plain" }))).status).toBe(401)
    expect((await startPost(req("/api/portal/auth/start", { email: "alex@example.com", next: "/case" }))).status).toBe(401)
    expect((await startPost(req("/api/portal/auth/start", "{"))).status).toBe(401)
    expect((await startPost(req("/api/portal/auth/start", { email: "a".repeat(3000) }))).status).toBe(401)
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.signInWithOtp).not.toHaveBeenCalled()
  })

  it("rejects a syntactically bad email without a pending cookie or a provider call", async () => {
    for (const email of ["", "alex", "alex@ex\nample.com", "alex@example.com\u0000", ` ${"a".repeat(320)}@example.com`]) {
      const response = await startPost(req("/api/portal/auth/start", { email }))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: "Enter a valid email address." })
      expect(response.headers.getSetCookie()).toEqual([])
    }
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.signInWithOtp).not.toHaveBeenCalled()
  })

  it("returns the same browser response for unknown, unverified, admin, and known emails", async () => {
    state.rpc.mockResolvedValueOnce({ status: "ineligible" })
    const unknown = await startPost(req("/api/portal/auth/start", { email: "missing@example.com" }))
    state.rpc.mockResolvedValueOnce({ status: "ineligible" })
    const unverified = await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))
    state.rpc.mockResolvedValueOnce({ status: "ineligible" })
    const admin = await startPost(req("/api/portal/auth/start", { email: "admin@profilerelaunch.com" }))
    state.rpc.mockResolvedValueOnce({ status: "ok", email: "alex@example.com", customerId })
    const known = await startPost(req("/api/portal/auth/start", { email: "Alex@Example.com" }))
    expect(unknown.status).toBe(200)
    expect(unknown.status).toBe(unverified.status)
    expect(unknown.status).toBe(admin.status)
    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    expect(await unverified.json()).toEqual(await admin.json())
    const knownBody = await known.json()
    expect(knownBody).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    expect(JSON.stringify(knownBody)).not.toMatch(/customerId|alex@example.com|not found|not verified|rate/i)
    expect(state.signInWithOtp).toHaveBeenCalledTimes(1)
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    expect(state.createUser).toHaveBeenCalledWith({ email: "alex@example.com", email_confirm: true })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_login_v1",
      "customer_portal_begin_login_v1",
      "customer_portal_begin_login_v1",
      "customer_portal_begin_login_v1",
      "customer_portal_confirm_otp_sent_v1",
    ])
    expect(state.rpc.mock.calls[3][1].p_email).toBe("alex@example.com")
  })

  it("does not call the OTP provider for an unknown customer or the Admin email", async () => {
    state.rpc.mockResolvedValue({ status: "ineligible" })
    await startPost(req("/api/portal/auth/start", { email: "missing@example.com" }))
    state.rpc.mockResolvedValue({ status: "ok", email: "admin@profilerelaunch.com", customerId })
    await startPost(req("/api/portal/auth/start", { email: "admin@profilerelaunch.com" }))
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(state.createUser).not.toHaveBeenCalled()
  })

  it("keeps the generic message when the provider fails and does not record OTP_SENT", async () => {
    state.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", customerId })
    state.signInWithOtp.mockResolvedValue({ error: { message: "provider exploded with secrets" } })
    const response = await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_login_v1"])
    expect(JSON.stringify(payload)).not.toMatch(/provider exploded|secrets/)
  })

  it("sets an opaque HttpOnly Strict pending cookie for known and unknown acceptable emails", async () => {
    state.rpc.mockResolvedValueOnce({ status: "ineligible" })
    const unknown = await startPost(req("/api/portal/auth/start", { email: "missing@example.com" }))
    state.rpc.mockResolvedValueOnce({ status: "ok", email: "alex@example.com", customerId })
    const known = await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))
    for (const response of [unknown, known]) {
      const cookie = response.headers.getSetCookie().join("\n")
      expect(cookie).toContain(`${portalPendingCookieName()}=`)
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=Strict/i)
      expect(cookie).toMatch(/Path=\//)
      expect(cookie).toMatch(/Max-Age=600/i)
      expect(cookie).not.toMatch(/Domain=/i)
      expect(cookie).not.toContain("alex@example.com")
      expect(response.cookies.get(portalPendingCookieName())?.value).toMatch(/^[a-f0-9]{64}$/)
    }
  })
})

describe("portal login resend", () => {
  it("stays generic when there is no valid challenge", async () => {
    const missing = await resendPost(req("/api/portal/auth/resend", {}))
    expect(missing.status).toBe(200)
    expect(await missing.json()).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    state.rpc.mockResolvedValue({ status: "unavailable" })
    const unknown = await resendPost(req("/api/portal/auth/resend", {}, { cookie: `${portalPendingCookieName()}=${pending}` }))
    expect(await unknown.json()).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    expect(state.signInWithOtp).not.toHaveBeenCalled()
  })

  it("does not call the provider inside the cooldown or over the account send limit", async () => {
    state.rpc.mockResolvedValue({ status: "rate_limited" })
    const response = await resendPost(req("/api/portal/auth/resend", {}, { cookie: `${portalPendingCookieName()}=${pending}` }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_resend_v1"])
  })

  it("calls the provider once for a valid resend and does not record OTP_SENT when that call fails", async () => {
    state.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", customerId })
    const sent = await resendPost(req("/api/portal/auth/resend", {}, { cookie: `${portalPendingCookieName()}=${pending}` }))
    expect(sent.status).toBe(200)
    expect(state.signInWithOtp).toHaveBeenCalledTimes(1)
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_resend_v1",
      "customer_portal_confirm_otp_sent_v1",
    ])
    state.signInWithOtp.mockResolvedValue({ error: { message: "provider exploded" } })
    state.rpc.mockClear()
    const failed = await resendPost(req("/api/portal/auth/resend", {}, { cookie: `${portalPendingCookieName()}=${pending}` }))
    expect(failed.status).toBe(200)
    expect(await failed.json()).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_resend_v1"])
  })
})

describe("portal login verify", () => {
  it("requires exactly eight digits and a valid pending cookie", async () => {
    expect((await verifyPost(req("/api/portal/auth/verify", { code: "123456789" }, { cookie: `${portalPendingCookieName()}=${pending}` }))).status).toBe(401)
    expect((await verifyPost(req("/api/portal/auth/verify", { code: "1234567" }, { cookie: `${portalPendingCookieName()}=${pending}` }))).status).toBe(401)
    expect((await verifyPost(req("/api/portal/auth/verify", { code: "1234567a" }, { cookie: `${portalPendingCookieName()}=${pending}` }))).status).toBe(401)
    expect((await verifyPost(req("/api/portal/auth/verify", { code: "12345678", email: "alex@example.com" }, { cookie: `${portalPendingCookieName()}=${pending}` }))).status).toBe(401)
    const missing = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }))
    expect(missing.status).toBe(401)
    expect(await missing.json()).toEqual({ message: PORTAL_VERIFY_ERROR })
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.verifyOtp).not.toHaveBeenCalled()
  })

  it("denies an expired, unsent, or exhausted challenge without a portal session", async () => {
    state.rpc.mockResolvedValue({ status: "unavailable" })
    const response = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `${portalPendingCookieName()}=${pending}` }))
    const payload = await response.json()
    expect(response.status).toBe(401)
    expect(payload).toEqual({ message: PORTAL_VERIFY_ERROR })
    expect(JSON.stringify(payload)).not.toMatch(/attempt|expired|locked|not found/i)
    expect(state.verifyOtp).not.toHaveBeenCalled()
    expect(response.cookies.get(portalSessionCookieName())).toBeUndefined()
  })

  it("does not create a session on provider error, email mismatch, or an unconfirmed email", async () => {
    state.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", customerId })
    state.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: "bad code" } })
    const provider = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `${portalPendingCookieName()}=${pending}` }))
    state.verifyOtp.mockResolvedValueOnce({
      data: { session: { access_token: "jwt" }, user: { id: authUser, email: "other@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
      error: null,
    })
    const mismatch = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `${portalPendingCookieName()}=${pending}` }))
    state.verifyOtp.mockResolvedValueOnce({
      data: { session: { access_token: "jwt" }, user: { id: authUser, email: "alex@example.com", email_confirmed_at: null } },
      error: null,
    })
    const unconfirmed = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `${portalPendingCookieName()}=${pending}` }))
    state.verifyOtp.mockResolvedValueOnce({
      data: { session: { access_token: "jwt-no-user" }, user: { email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
      error: null,
    })
    const missingUser = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `${portalPendingCookieName()}=${pending}` }))
    for (const response of [provider, mismatch, unconfirmed, missingUser]) {
      expect(response.status).toBe(401)
      expect(response.cookies.get(portalSessionCookieName())).toBeUndefined()
    }
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_attempt_otp_v1",
      "customer_portal_attempt_otp_v1",
      "customer_portal_attempt_otp_v1",
      "customer_portal_attempt_otp_v1",
    ])
    expect(state.signOut).toHaveBeenCalledTimes(3)
    expect(state.signOut).toHaveBeenNthCalledWith(1, "jwt")
    expect(state.signOut).toHaveBeenNthCalledWith(2, "jwt")
    expect(state.signOut).toHaveBeenNthCalledWith(3, "jwt-no-user")
    for (const response of [mismatch, unconfirmed]) {
      expect(JSON.stringify(await response.json())).not.toMatch(/jwt|refresh/)
    }
  })

  it("does not create a portal session when provider revocation fails", async () => {
    state.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", customerId })
    state.signOut.mockResolvedValue({ error: { message: "revoke failed jwt-must-not-leak" } })
    state.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "jwt-must-not-leak", refresh_token: "refresh-must-not-leak" },
        user: { id: authUser, email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" },
      },
      error: null,
    })
    const response = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `${portalPendingCookieName()}=${pending}` }))
    const payload = await response.json()
    expect(response.status).toBe(401)
    expect(payload).toEqual({ message: PORTAL_VERIFY_ERROR })
    expect(JSON.stringify(payload)).not.toMatch(/jwt-must-not-leak|refresh-must-not-leak|revoke failed/)
    expect(response.cookies.get(portalSessionCookieName())).toBeUndefined()
    expect(state.signOut).toHaveBeenCalledTimes(1)
    expect(state.signOut).toHaveBeenCalledWith("jwt-must-not-leak")
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_attempt_otp_v1"])
  })

  it("revokes the provider session and sets a different host-only portal cookie", async () => {
    state.rpc
      .mockResolvedValueOnce({ status: "ok", email: "alex@example.com", customerId })
      .mockResolvedValueOnce({ status: "ok" })
      .mockResolvedValueOnce({ customerId, authUserId: authUser, email: "alex@example.com", authenticatedAt: "t", expiresAt: "t" })
    state.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "jwt-must-not-leak", refresh_token: "refresh-must-not-leak" },
        user: { id: authUser, email: "Alex@Example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" },
      },
      error: null,
    })
    const response = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `${portalPendingCookieName()}=${pending}` }))
    const payload = await response.json()
    const sessionToken = response.cookies.get(portalSessionCookieName())?.value
    expect(response.status).toBe(200)
    expect(payload).toEqual({ status: "ok" })
    expect(JSON.stringify(payload)).not.toMatch(/jwt-must-not-leak|refresh-must-not-leak|alex@example.com|customerId/)
    expect(sessionToken).toMatch(/^[a-f0-9]{64}$/)
    expect(sessionToken).not.toBe(pending)
    expect(state.signOut).toHaveBeenCalledTimes(1)
    expect(state.signOut).toHaveBeenCalledWith("jwt-must-not-leak")
    expect(state.rpc.mock.calls[1][1].p_session_hash).toBe(hash(sessionToken ?? ""))
    expect(state.rpc.mock.calls[1][1].p_session_hash).not.toBe(hash(pending))
    expect(state.rpc.mock.calls[1][1].p_email).toBe("alex@example.com")
    expect(response.cookies.get(portalPendingCookieName())?.value).toBe("")
    const setCookie = response.headers.getSetCookie().join("\n")
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Strict/i)
    expect(setCookie).toMatch(/Path=\//)
    expect(setCookie).toMatch(/Max-Age=28800/i)
    expect(setCookie).not.toMatch(/Domain=/i)
    expect(setCookie).not.toContain(sessionCookie)
    expect(setCookie).not.toContain(pendingCookie)
  })

  it("uses a Secure __Host- portal cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    state.rpc
      .mockResolvedValueOnce({ status: "ok", email: "alex@example.com", customerId })
      .mockResolvedValueOnce({ status: "ok" })
      .mockResolvedValueOnce({ customerId, authUserId: authUser, email: "alex@example.com", authenticatedAt: "t", expiresAt: "t" })
    state.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "jwt" },
        user: { id: authUser, email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" },
      },
      error: null,
    })
    const response = await verifyPost(req("/api/portal/auth/verify", { code: "12345678" }, { cookie: `__Host-pr-portal-pending=${pending}` }))
    const setCookie = response.headers.getSetCookie().join("\n")
    expect(response.cookies.get("__Host-pr-portal")?.value).toMatch(/^[a-f0-9]{64}$/)
    expect(setCookie).toContain("__Host-pr-portal=")
    expect(setCookie).toMatch(/Secure/i)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Strict/i)
    expect(setCookie).not.toMatch(/Domain=/i)
  })
})

describe("portal sign-out", () => {
  it("revokes the portal session, clears portal cookies, and can be repeated", async () => {
    state.rpc.mockResolvedValue({ status: "ok" })
    const first = await signOutPost(req("/api/portal/auth/sign-out", {}, { cookie: `${portalSessionCookieName()}=${pending}; ${portalPendingCookieName()}=${"d".repeat(64)}` }))
    const second = await signOutPost(req("/api/portal/auth/sign-out", {}, { cookie: `${portalSessionCookieName()}=${pending}` }))
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.json()).toEqual({ status: "ok" })
    expect(state.rpc).toHaveBeenCalledWith("customer_portal_sign_out_v1", { p_token_hash: hash(pending) })
    for (const response of [first, second]) {
      expect(response.cookies.get(portalSessionCookieName())?.value).toBe("")
      expect(response.cookies.get(portalPendingCookieName())?.value).toBe("")
    }
  })

  it("does not alter a customer-action session cookie", async () => {
    state.rpc.mockResolvedValue({ status: "ok" })
    const response = await signOutPost(req("/api/portal/auth/sign-out", {}, {
      cookie: `${portalSessionCookieName()}=${pending}; ${sessionCookie}=${"e".repeat(64)}; ${pendingCookie}=${"f".repeat(64)}`,
    }))
    const setCookie = response.headers.getSetCookie().join("\n")
    expect(setCookie).not.toContain(sessionCookie)
    expect(setCookie).not.toContain(pendingCookie)
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_sign_out_v1"])
  })
})

describe("independent action and portal gates", () => {
  const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

  function sharedBackend() {
    vi.stubEnv("CUSTOMER_ORIGIN", origin)
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_SECRET_KEY", "test")
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  }

  it("keeps actions available while the portal is closed", async () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "false")
    sharedBackend()
    state.rpc.mockResolvedValue({ status: "unavailable" })
    expect((await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))).status).toBe(404)
    expect(state.rpc).not.toHaveBeenCalled()
    const action = await exchangePost(req("/api/action/exchange", { actionId, secret: "b".repeat(64) }))
    expect(action.status).toBe(401)
    expect(state.rpc).toHaveBeenCalledWith("customer_action_exchange_v1", expect.any(Object))
  })

  it("keeps portal authentication available while actions are closed", async () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false")
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    sharedBackend()
    state.rpc.mockResolvedValue({ status: "ineligible" })
    const portal = await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))
    expect(portal.status).toBe(200)
    expect(await portal.json()).toEqual({ message: PORTAL_LOGIN_MESSAGE })
    expect(state.rpc).toHaveBeenCalledWith("customer_portal_begin_login_v1", expect.objectContaining({ p_email: "alex@example.com" }))
    state.rpc.mockClear()
    expect((await exchangePost(req("/api/action/exchange", { actionId, secret: "b".repeat(64) }))).status).toBe(401)
    expect(state.rpc).not.toHaveBeenCalled()
    state.rpc.mockResolvedValue({ status: "ok" })
    const signedOut = await signOutPost(req("/api/portal/auth/sign-out", {}, { cookie: `${portalSessionCookieName()}=${pending}` }))
    expect(signedOut.status).toBe(200)
    expect(state.rpc).toHaveBeenCalledWith("customer_portal_sign_out_v1", expect.any(Object))
  })

  it("lets both capabilities operate when both gates are on", async () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    sharedBackend()
    state.rpc.mockResolvedValueOnce({ status: "ineligible" }).mockResolvedValueOnce({ status: "unavailable" })
    expect((await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))).status).toBe(200)
    expect((await exchangePost(req("/api/action/exchange", { actionId, secret: "b".repeat(64) }))).status).toBe(401)
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_login_v1",
      "customer_action_exchange_v1",
    ])
  })

  it("closes both capabilities when both gates are off", async () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false")
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "false")
    sharedBackend()
    expect((await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))).status).toBe(404)
    expect((await exchangePost(req("/api/action/exchange", { actionId, secret: "b".repeat(64) }))).status).toBe(401)
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it("closes both capabilities when the shared origin or Supabase configuration is missing", async () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    sharedBackend()
    vi.stubEnv("SUPABASE_URL", "")
    expect((await startPost(req("/api/portal/auth/start", { email: "alex@example.com" }))).status).toBe(404)
    expect((await exchangePost(req("/api/action/exchange", { actionId, secret: "b".repeat(64) }))).status).toBe(401)
    expect(state.rpc).not.toHaveBeenCalled()
  })
})

describe("portal and action session isolation at the action API", () => {
  it("does not let a portal cookie satisfy an action command", async () => {
    const response = await commandPost(req("/api/action/command", { operation: "decline" }, {
      cookie: `${portalSessionCookieName()}=${pending}`,
      "idempotency-key": "33333333-3333-4333-8333-333333333333",
    }))
    expect(response.status).toBe(401)
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.verifyOtp).not.toHaveBeenCalled()
  })
})
