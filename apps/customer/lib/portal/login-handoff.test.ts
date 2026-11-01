import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Proves provider handoff with deferred promises. It does not measure or
 * require a wall-clock gap. Synthetic timings are in
 * docs/customer/sec-07-login-timing.md. GitHub issue #183 tracks the
 * remaining risk.
 */
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
import { PORTAL_LOGIN_MESSAGE } from "@/lib/portal/email"
import { portalPendingCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const knownEmail = "alex@example.com"
const authUser = "66666666-6666-4666-8666-666666666666"
const customerId = "22222222-2222-4222-8222-222222222222"
const pending = "c".repeat(64)
const confirmedAt = "2026-09-28T12:00:00.000Z"

type Gate<T> = { promise: Promise<T>; resolve: (value: T) => void }

function gate<T>(): Gate<T> {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function turn() {
  await Promise.resolve()
}

async function until(ready: () => boolean) {
  for (let attempt = 0; attempt < 40 && !ready(); attempt += 1) await turn()
  expect(ready()).toBe(true)
}

async function finish<T>(work: Promise<T>) {
  let slot: { ok: true; value: T } | { ok: false; error: unknown } | undefined
  work.then(
    value => { slot = { ok: true, value } },
    error => { slot = { ok: false, error } },
  )
  for (let attempt = 0; slot === undefined && attempt < 40; attempt += 1) await turn()
  if (!slot) throw new Error("response still pending")
  if (!slot.ok) throw slot.error
  return slot.value
}

function enable() {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
}

function startRequest(email: string) {
  return new NextRequest(`${origin}/api/portal/auth/start`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email }),
  })
}

function resendRequest(includeCookie: boolean) {
  return new NextRequest(`${origin}/api/portal/auth/resend`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(includeCookie ? { cookie: `${portalPendingCookieName()}=${pending}` } : {}),
    },
    body: "{}",
  })
}

function createdUser() {
  state.createUser.mockResolvedValue({
    data: { user: { id: authUser, email: knownEmail, email_confirmed_at: confirmedAt } },
    error: null,
  })
}

function beginOk() {
  state.rpc.mockImplementation(async (name: string) => {
    if (name === "customer_portal_confirm_otp_sent_v1") return { status: "ok" }
    return { status: "ok", email: knownEmail, customerId }
  })
}

function cookieShape(line: string) {
  return line
    .replace(/pr-portal-pending-dev=[^;]*/, "pr-portal-pending-dev=<redacted>")
    .replace(/Expires=[^;]*/i, "Expires=<ignored>")
}

async function expectGeneric(response: Response, cookie: "pending" | "none") {
  const body = await response.json() as { message?: string }
  const leaked = JSON.stringify({
    body,
    cache: response.headers.get("cache-control"),
    robots: response.headers.get("x-robots-tag"),
    cookies: response.headers.getSetCookie(),
  })
  expect(response.status).toBe(200)
  expect(body).toEqual({ message: PORTAL_LOGIN_MESSAGE })
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive")
  expect(leaked).not.toMatch(/alex@example\.com|missing@example\.com|admin@profilerelaunch\.com|customerId|rate_limited|ineligible|unavailable|not found|not verified|already registered|provider down/i)
  const setCookie = response.headers.getSetCookie()
  if (cookie === "none") {
    expect(setCookie).toEqual([])
    return ""
  }
  expect(setCookie).toHaveLength(2)
  const line = setCookie.find(item => item.startsWith("pr-portal-pending-dev="))
  const invite = setCookie.find(item => item.startsWith("pr-portal-invite-dev="))
  expect(line).toBeTruthy()
  expect(invite).toMatch(/^pr-portal-invite-dev=;/)
  expect(invite).toMatch(/Max-Age=0/i)
  expect(line).toMatch(/HttpOnly/i)
  expect(line).toMatch(/SameSite=Strict/i)
  expect(line).toMatch(/Path=\//)
  expect(line).toMatch(/Max-Age=600/i)
  expect(line).not.toMatch(/Domain=/i)
  expect(line).not.toMatch(/Secure/i)
  return cookieShape(line ?? "")
}

beforeEach(() => {
  enable()
  state.issued = 0
  state.rpc.mockReset()
  state.createUser.mockReset()
  state.listUsers.mockReset()
  state.updateUserById.mockReset()
  state.signInWithOtp.mockReset()
  state.verifyOtp.mockReset()
  state.signOut.mockReset()
})

describe("portal login provider handoff", () => {
  it("keeps an eligible start pending until the provider promise settles, then confirms", async () => {
    beginOk()
    createdUser()
    const provider = gate<{ error: null }>()
    state.signInWithOtp.mockImplementation(() => provider.promise)
    let settled = false
    const pendingResponse = startPost(startRequest(knownEmail)).then(response => {
      settled = true
      return response
    })
    await until(() => state.signInWithOtp.mock.calls.length === 1)
    for (let attempt = 0; attempt < 20; attempt += 1) await turn()
    expect(settled).toBe(false)
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: knownEmail, options: { shouldCreateUser: false } })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_login_v1"])
    provider.resolve({ error: null })
    const response = await pendingResponse
    expect(settled).toBe(true)
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_login_v1",
      "customer_portal_confirm_otp_sent_v1",
    ])
    expect(await expectGeneric(response, "pending")).toContain("pr-portal-pending-dev=<redacted>")
  })

  it("awaits a provider failure and does not record OTP_SENT", async () => {
    beginOk()
    createdUser()
    const provider = gate<{ error: { message: string } }>()
    state.signInWithOtp.mockImplementation(() => provider.promise)
    let settled = false
    const pendingResponse = startPost(startRequest(knownEmail)).then(response => {
      settled = true
      return response
    })
    await until(() => state.signInWithOtp.mock.calls.length === 1)
    for (let attempt = 0; attempt < 20; attempt += 1) await turn()
    expect(settled).toBe(false)
    provider.resolve({ error: { message: "provider down" } })
    const response = await pendingResponse
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_login_v1"])
    await expectGeneric(response, "pending")
  })

  it("awaits an existing auth-user lookup before the provider call", async () => {
    beginOk()
    state.createUser.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } })
    const directory = gate<{ data: { users: Array<{ id: string; email: string; email_confirmed_at: string }> }; error: null }>()
    const provider = gate<{ error: null }>()
    state.listUsers.mockImplementation(() => directory.promise)
    state.signInWithOtp.mockImplementation(() => provider.promise)
    let settled = false
    const pendingResponse = startPost(startRequest(knownEmail)).then(response => {
      settled = true
      return response
    })
    await until(() => state.listUsers.mock.calls.length === 1)
    for (let attempt = 0; attempt < 20; attempt += 1) await turn()
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(settled).toBe(false)
    directory.resolve({
      data: { users: [{ id: authUser, email: knownEmail, email_confirmed_at: confirmedAt }] },
      error: null,
    })
    await until(() => state.signInWithOtp.mock.calls.length === 1)
    for (let attempt = 0; attempt < 20; attempt += 1) await turn()
    expect(settled).toBe(false)
    provider.resolve({ error: null })
    await pendingResponse
    expect(state.listUsers).toHaveBeenCalledTimes(1)
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_login_v1",
      "customer_portal_confirm_otp_sent_v1",
    ])
  })

  it("resolves unknown, unverified, admin, and cooldown starts without an OTP send", async () => {
    const shapes: string[] = []
    for (const [email, status] of [
      ["missing@example.com", "ineligible"],
      [knownEmail, "ineligible"],
      ["admin@profilerelaunch.com", "ineligible"],
      [knownEmail, "rate_limited"],
    ] as const) {
      state.rpc.mockReset().mockResolvedValue({ status })
      state.signInWithOtp.mockReset().mockImplementation(() => new Promise(() => {}))
      state.createUser.mockClear()
      const response = await finish(startPost(startRequest(email)))
      expect(state.signInWithOtp).not.toHaveBeenCalled()
      expect(state.createUser).not.toHaveBeenCalled()
      shapes.push(await expectGeneric(response, "pending"))
    }
    expect(new Set(shapes).size).toBe(1)
  })

  it("keeps an eligible resend pending until the provider promise settles", async () => {
    beginOk()
    createdUser()
    const provider = gate<{ error: null }>()
    state.signInWithOtp.mockImplementation(() => provider.promise)
    let settled = false
    const pendingResponse = resendPost(resendRequest(true)).then(response => {
      settled = true
      return response
    })
    await until(() => state.signInWithOtp.mock.calls.length === 1)
    for (let attempt = 0; attempt < 20; attempt += 1) await turn()
    expect(settled).toBe(false)
    expect(state.signInWithOtp).toHaveBeenCalledWith({ email: knownEmail, options: { shouldCreateUser: false } })
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_resend_v1"])
    provider.resolve({ error: null })
    const response = await pendingResponse
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_resend_v1",
      "customer_portal_confirm_otp_sent_v1",
    ])
    await expectGeneric(response, "none")
  })

  it("awaits a failed resend and does not record OTP_SENT", async () => {
    beginOk()
    createdUser()
    const provider = gate<{ error: { message: string } }>()
    state.signInWithOtp.mockImplementation(() => provider.promise)
    let settled = false
    const pendingResponse = resendPost(resendRequest(true)).then(response => {
      settled = true
      return response
    })
    await until(() => state.signInWithOtp.mock.calls.length === 1)
    for (let attempt = 0; attempt < 20; attempt += 1) await turn()
    expect(settled).toBe(false)
    provider.resolve({ error: { message: "provider down" } })
    const response = await pendingResponse
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(["customer_portal_begin_resend_v1"])
    await expectGeneric(response, "none")
  })

  it("resolves missing, unavailable, and cooldown resends without an OTP send", async () => {
    state.signInWithOtp.mockImplementation(() => new Promise(() => {}))
    const missing = await finish(resendPost(resendRequest(false)))
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    await expectGeneric(missing, "none")

    state.rpc.mockResolvedValue({ status: "unavailable" })
    const unavailable = await finish(resendPost(resendRequest(true)))
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    await expectGeneric(unavailable, "none")

    state.rpc.mockResolvedValue({ status: "rate_limited" })
    const cooldown = await finish(resendPost(resendRequest(true)))
    expect(state.signInWithOtp).not.toHaveBeenCalled()
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_begin_resend_v1",
      "customer_portal_begin_resend_v1",
    ])
    await expectGeneric(cooldown, "none")
  })
})
