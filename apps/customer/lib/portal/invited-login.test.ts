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
  users: [] as Array<{ id: string; email: string; email_confirmed_at: string | null }>,
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

import { POST as ordinaryVerify } from "@/app/api/portal/auth/verify/route"
import { POST as startPost } from "@/app/api/portal/auth/invite/start/route"
import { POST as resendPost } from "@/app/api/portal/auth/invite/resend/route"
import { POST as verifyPost } from "@/app/api/portal/auth/invite/verify/route"
import { INVITED_LOGIN_MESSAGE, INVITED_LOGIN_UNAVAILABLE, PORTAL_VERIFY_ERROR } from "@/lib/portal/email"
import { portalInviteCookieName, portalPendingCookieName, portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const customerId = "22222222-2222-4222-8222-222222222222"
const authUser = "66666666-6666-4666-8666-666666666666"
const token = "d".repeat(64)
const pending = "c".repeat(64)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function enable(portal = true, invited = true) {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", portal ? "true" : "")
  vi.stubEnv("CUSTOMER_INVITED_LOGIN_ENABLED", invited ? "true" : "")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
}

function confirmedUser() {
  return {
    data: {
      user: { id: authUser, email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" },
      session: { access_token: "provider-access" },
    },
    error: null,
  }
}

beforeEach(() => {
  enable()
  state.issued = 0
  state.users = []
  state.rpc.mockReset()
  state.createUser.mockReset().mockImplementation(async ({ email, email_confirm }: { email: string; email_confirm: boolean }) => {
    const existing = state.users.find(user => user.email === email)
    if (existing) return { data: { user: null }, error: { message: "User already registered" } }
    const user = { id: authUser, email, email_confirmed_at: email_confirm ? "2026-09-28T12:00:00.000Z" : null }
    state.users.push(user)
    return { data: { user: { ...user } }, error: null }
  })
  state.listUsers.mockReset().mockImplementation(async () => ({ data: { users: state.users.map(user => ({ ...user })) }, error: null }))
  state.updateUserById.mockReset()
  state.signInWithOtp.mockReset().mockResolvedValue({ error: null })
  state.verifyOtp.mockReset().mockImplementation(async ({ token: code }: { token: string }) => {
    const user = state.users[0]
    if (!user || code !== "12345678") return { data: { user: null, session: null }, error: { message: "bad code" } }
    user.email_confirmed_at = "2026-11-01T21:00:00.000Z"
    return {
      data: { user: { ...user }, session: { access_token: "provider-access" } },
      error: null,
    }
  })
  state.signOut.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe("invited portal login routes", () => {
  it("stays closed when the invited flag is off and does not call a provider", async () => {
    enable(true, false)
    const response = await startPost(req("/api/portal/auth/invite/start", { token }))
    expect(response.status).toBe(404)
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toEqual([])
    enable(false, true)
    expect((await startPost(req("/api/portal/auth/invite/start", { token }))).status).toBe(404)
    expect(state.signInWithOtp).not.toHaveBeenCalled()
  })

  it("uses one public message for an unknown token and a rate-limited invitation", async () => {
    state.rpc.mockResolvedValueOnce({ status: "unavailable" })
    const unknown = await startPost(req("/api/portal/auth/invite/start", { token }))
    state.rpc.mockResolvedValueOnce({ status: "rate_limited" })
    const limited = await startPost(req("/api/portal/auth/invite/start", { token: "e".repeat(64) }))
    const malformed = await startPost(req("/api/portal/auth/invite/start", { token: "short" }))
    const unknownBody = await unknown.json()
    const limitedBody = await limited.json()
    const malformedBody = await malformed.json()
    expect(unknown.status).toBe(401)
    expect(unknownBody).toEqual({ message: INVITED_LOGIN_UNAVAILABLE })
    expect(limitedBody).toEqual(unknownBody)
    expect(malformedBody).toEqual({ message: INVITED_LOGIN_UNAVAILABLE })
    expect(JSON.stringify(unknownBody)).not.toMatch(/alex@|customerId|business|rate/i)
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(unknown.headers.getSetCookie()).toEqual([])
  })

  it("emails a Supabase code only after the invitation is eligible and hides the address", async () => {
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_begin_invited_login_v1") return { status: "ok", email: "alex@example.com", customerId }
      if (name === "customer_portal_confirm_invited_otp_sent_v1") return { status: "ok" }
      return { status: "unavailable" }
    })
    const response = await startPost(req("/api/portal/auth/invite/start", { token }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ message: INVITED_LOGIN_MESSAGE })
    expect(JSON.stringify(body)).not.toMatch(/alex@example.com|customerId|Bakery|Telloya/)
    expect(state.signInWithOtp).toHaveBeenCalledTimes(1)
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_invited_login_v1",
      "customer_portal_confirm_invited_otp_sent_v1",
    ])
    expect(state.rpc.mock.calls[0][1]).toEqual({
      p_invitation_hash: hash(token),
      p_pending_hash: hash("a".repeat(64)),
    })
    expect(state.rpc.mock.calls[1][1]).toEqual({
      p_pending_hash: hash("a".repeat(64)),
      p_invitation_hash: hash(token),
    })
    const cookies = response.headers.getSetCookie().join("\n")
    expect(cookies).toContain(`${portalPendingCookieName()}=${"a".repeat(64)}`)
    expect(cookies).toContain(`${portalInviteCookieName()}=${hash(token)}`)
    expect(cookies).not.toContain(token)
    expect(cookies).toMatch(/HttpOnly/i)
    expect(cookies).toMatch(/SameSite=Strict/i)
    expect(response.cookies.get(portalSessionCookieName())).toBeUndefined()
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(JSON.stringify(body)).not.toContain(token)
    expect(JSON.stringify(body)).not.toContain(hash(token))
    expect(state.createUser).toHaveBeenCalledWith({ email: "alex@example.com", email_confirm: false })
    expect(state.updateUserById).not.toHaveBeenCalled()
    expect(state.users).toEqual([{ id: authUser, email: "alex@example.com", email_confirmed_at: null }])
  })

  it("does not send a code when identity setup would admin-confirm the mailbox", async () => {
    state.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", customerId })
    state.createUser.mockResolvedValue({
      data: { user: { id: authUser, email: "alex@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
      error: null,
    })
    const response = await startPost(req("/api/portal/auth/invite/start", { token }))
    const body = await response.json()
    expect(response.status).toBe(401)
    expect(body).toEqual({ message: INVITED_LOGIN_UNAVAILABLE })
    expect(JSON.stringify(body)).not.toContain(token)
    expect(state.createUser).toHaveBeenCalledWith({ email: "alex@example.com", email_confirm: false })
    expect(state.updateUserById).not.toHaveBeenCalled()
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  })

  it("confirms the auth identity only when the provider accepts the code", async () => {
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_begin_invited_login_v1" || name === "customer_portal_confirm_invited_otp_sent_v1") return { status: "ok", email: "alex@example.com", customerId }
      if (name === "customer_portal_attempt_invited_otp_v1") return { status: "ok", email: "alex@example.com", customerId }
      if (name === "customer_portal_finish_invited_otp_v1") return { status: "ok" }
      if (name === "customer_portal_session_v1") return { customerId }
      return { status: "unavailable" }
    })
    const started = await startPost(req("/api/portal/auth/invite/start", { token }))
    expect(started.status).toBe(200)
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: "alex@example.com", options: { shouldCreateUser: false } })
    expect(state.users[0].email_confirmed_at).toBeNull()
    expect(state.updateUserById).not.toHaveBeenCalled()
    const cookie = `${portalPendingCookieName()}=${"a".repeat(64)}; ${portalInviteCookieName()}=${hash(token)}`
    const abandoned = state.users[0].email_confirmed_at
    expect(abandoned).toBeNull()
    const rejected = await verifyPost(req("/api/portal/auth/invite/verify", { code: "00000000" }, { cookie }))
    const rejectedBody = await rejected.json()
    expect(rejected.status).toBe(401)
    expect(rejectedBody).toEqual({ message: PORTAL_VERIFY_ERROR })
    expect(JSON.stringify(rejectedBody)).not.toContain(token)
    expect(state.users[0].email_confirmed_at).toBeNull()
    expect(state.rpc.mock.calls.map(call => call[0])).not.toContain("customer_portal_finish_invited_otp_v1")
    expect(rejected.cookies.get(portalSessionCookieName())).toBeUndefined()
    const accepted = await verifyPost(req("/api/portal/auth/invite/verify", { code: "12345678" }, { cookie }))
    expect(accepted.status).toBe(200)
    expect(state.users[0].email_confirmed_at).toBe("2026-11-01T21:00:00.000Z")
    expect(state.updateUserById).not.toHaveBeenCalled()
    expect(state.rpc.mock.calls.map(call => call[0])).toContain("customer_portal_finish_invited_otp_v1")
    expect(accepted.headers.get("referrer-policy")).toBe("no-referrer")
  })

  it("does not keep a pending cookie when the provider refuses the code", async () => {
    state.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", customerId })
    state.signInWithOtp.mockResolvedValue({ error: { message: "provider exploded with secrets" } })
    const response = await startPost(req("/api/portal/auth/invite/start", { token }))
    const body = await response.json()
    expect(response.status).toBe(401)
    expect(body).toEqual({ message: INVITED_LOGIN_UNAVAILABLE })
    expect(JSON.stringify(body)).not.toMatch(/provider exploded|secrets/)
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_invited_login_v1"])
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("keeps the same resend message when the send limit refuses another code", async () => {
    const invitation = hash(token)
    const cookie = `${portalPendingCookieName()}=${pending}; ${portalInviteCookieName()}=${invitation}`
    state.rpc.mockResolvedValueOnce({ status: "rate_limited" })
    const limited = await resendPost(req("/api/portal/auth/invite/resend", {}, { cookie }))
    state.rpc.mockResolvedValueOnce({ status: "ok", email: "alex@example.com", customerId })
    state.rpc.mockResolvedValueOnce({ status: "ok" })
    const sent = await resendPost(req("/api/portal/auth/invite/resend", {}, { cookie }))
    const limitedBody = await limited.json()
    const sentBody = await sent.json()
    expect(limited.status).toBe(200)
    expect(limitedBody).toEqual({ message: INVITED_LOGIN_MESSAGE })
    expect(sentBody).toEqual(limitedBody)
    expect(state.signInWithOtp).toHaveBeenCalledTimes(1)
    expect(state.rpc.mock.calls[0][0]).toBe("customer_portal_begin_invited_resend_v1")
    expect(state.rpc.mock.calls[0][1]).toEqual({ p_pending_hash: hash(pending), p_invitation_hash: invitation })
  })

  it("does not finish a session when the code is rejected", async () => {
    const invitation = hash(token)
    const cookie = `${portalPendingCookieName()}=${pending}; ${portalInviteCookieName()}=${invitation}`
    state.rpc.mockResolvedValue({ status: "ok", email: "alex@example.com", customerId })
    state.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "bad code" } })
    const response = await verifyPost(req("/api/portal/auth/invite/verify", { code: "12345678" }, { cookie }))
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toEqual({ message: PORTAL_VERIFY_ERROR })
    expect(JSON.stringify(body)).not.toContain(token)
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_attempt_invited_otp_v1"])
    expect(response.cookies.get(portalSessionCookieName())).toBeUndefined()
    expect(state.updateUserById).not.toHaveBeenCalled()
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  })

  it("opens the ordinary portal session after a verified invited code", async () => {
    const invitation = hash(token)
    const cookie = `${portalPendingCookieName()}=${pending}; ${portalInviteCookieName()}=${invitation}`
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_attempt_invited_otp_v1") return { status: "ok", email: "alex@example.com", customerId }
      if (name === "customer_portal_finish_invited_otp_v1") return { status: "ok" }
      if (name === "customer_portal_session_v1") return { customerId, email: "alex@example.com" }
      return { status: "unavailable" }
    })
    state.verifyOtp.mockResolvedValue(confirmedUser())
    const response = await verifyPost(req("/api/portal/auth/invite/verify", { code: "12345678" }, { cookie }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ status: "ok" })
    expect(state.verifyOtp).toHaveBeenCalledWith({ email: "alex@example.com", token: "12345678", type: "email" })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_attempt_invited_otp_v1",
      "customer_portal_finish_invited_otp_v1",
      "customer_portal_session_v1",
    ])
    expect(state.rpc.mock.calls[1][1].p_invitation_hash).toBe(invitation)
    expect(state.rpc.mock.calls[1][1].p_auth_user).toBe(authUser)
    const cookies = response.headers.getSetCookie().join("\n")
    expect(cookies).toContain(`${portalSessionCookieName()}=`)
    expect(cookies).toMatch(new RegExp(`${portalPendingCookieName()}=;`))
    expect(cookies).toMatch(new RegExp(`${portalInviteCookieName()}=;`))
    expect(JSON.stringify(body)).not.toMatch(/alex@example.com|Bakery/)
    expect(JSON.stringify(body)).not.toContain(token)
    expect(state.updateUserById).not.toHaveBeenCalled()
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  })

  it("keeps an ordinary verify call on the ordinary finish function", async () => {
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_attempt_otp_v1") return { status: "ok", email: "alex@example.com", customerId }
      if (name === "customer_portal_finish_otp_v1") return { status: "ok" }
      if (name === "customer_portal_session_v1") return { customerId }
      return { status: "unavailable" }
    })
    state.verifyOtp.mockResolvedValue(confirmedUser())
    const cookie = `${portalPendingCookieName()}=${pending}; ${portalInviteCookieName()}=${hash(token)}`
    const response = await ordinaryVerify(req("/api/portal/auth/verify", { code: "12345678" }, { cookie }))
    expect(response.status).toBe(200)
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_attempt_otp_v1",
      "customer_portal_finish_otp_v1",
      "customer_portal_session_v1",
    ])
    expect(state.rpc.mock.calls[1][1]).not.toHaveProperty("p_invitation_hash")
  })
})
