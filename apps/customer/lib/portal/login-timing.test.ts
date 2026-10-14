import { createServer, type Server } from "node:http"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Characterizes portal login timing with an injected provider delay.
 * Figures are not Production Supabase measurements and no OTP is sent.
 * The assertions lock the generic HTTP contract and the rule that an
 * eligible send waits for the provider instead of being detached.
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

const DELAY_MS = 100
const ROUNDS = 30
const WARMUP = 2
const origin = "https://customer.profilerelaunch.com"
const knownEmail = "alex@example.com"
const authUser = "66666666-6666-4666-8666-666666666666"
const pending = "c".repeat(64)
const confirmedAt = "2026-09-28T12:00:00.000Z"

const KINDS = [
  "start-unknown",
  "start-unverified",
  "start-admin",
  "start-cooldown",
  "start-success",
  "start-provider-error",
  "start-existing",
  "resend-missing",
  "resend-unavailable",
  "resend-cooldown",
  "resend-success",
  "resend-provider-error",
] as const

type Kind = (typeof KINDS)[number]

const FAST = new Set<Kind>([
  "start-unknown",
  "start-unverified",
  "start-admin",
  "start-cooldown",
  "resend-missing",
  "resend-unavailable",
  "resend-cooldown",
])

const PROVIDER = new Set<Kind>([
  "start-success",
  "start-provider-error",
  "start-existing",
  "resend-success",
  "resend-provider-error",
])

type Delay = {
  label: "deterministic-timer" | "local-http"
  wait: () => Promise<void>
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

function emailFor(kind: Kind) {
  if (kind === "start-unknown") return "missing@example.com"
  if (kind === "start-admin") return "admin@profilerelaunch.com"
  return knownEmail
}

function beginStatus(kind: Kind) {
  if (kind === "start-cooldown" || kind === "resend-cooldown") return "rate_limited"
  if (kind === "resend-unavailable") return "unavailable"
  if (kind === "start-unknown" || kind === "start-unverified" || kind === "start-admin") return "ineligible"
  return "ok"
}

function arm(kind: Kind, delay: Delay) {
  state.rpc.mockReset()
  state.createUser.mockReset()
  state.listUsers.mockReset()
  state.updateUserById.mockReset()
  state.signInWithOtp.mockReset()
  state.rpc.mockImplementation(async (name: string) => {
    if (name === "customer_portal_confirm_otp_sent_v1") return { status: "ok" }
    if (beginStatus(kind) === "ok") return { status: "ok", email: knownEmail, customerId: "22222222-2222-4222-8222-222222222222" }
    return { status: beginStatus(kind) }
  })
  if (kind === "start-existing") {
    state.createUser.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } })
    state.listUsers.mockImplementation(async () => {
      await delay.wait()
      return { data: { users: [{ id: authUser, email: knownEmail, email_confirmed_at: confirmedAt }] }, error: null }
    })
  } else {
    state.createUser.mockResolvedValue({
      data: { user: { id: authUser, email: knownEmail, email_confirmed_at: confirmedAt } },
      error: null,
    })
  }
  state.signInWithOtp.mockImplementation(async () => {
    await delay.wait()
    if (kind === "start-provider-error" || kind === "resend-provider-error") return { error: { message: "provider down" } }
    return { error: null }
  })
}

function cookieShape(line: string) {
  return line
    .replace(/pr-portal-pending-dev=[^;]*/, "pr-portal-pending-dev=<redacted>")
    .replace(/Expires=[^;]*/i, "Expires=<ignored>")
}

async function sample(kind: Kind, delay: Delay) {
  arm(kind, delay)
  const started = performance.now()
  const response = kind.startsWith("resend")
    ? await resendPost(resendRequest(kind !== "resend-missing"))
    : await startPost(startRequest(emailFor(kind)))
  const elapsed = performance.now() - started
  const body = await response.json() as { message?: string }
  const setCookie = response.headers.getSetCookie()
  const calls = state.rpc.mock.calls.map(call => call[0])
  const leaked = JSON.stringify({
    body,
    cache: response.headers.get("cache-control"),
    robots: response.headers.get("x-robots-tag"),
    cookies: setCookie,
  })
  expect(response.status, kind).toBe(200)
  expect(body, kind).toEqual({ message: PORTAL_LOGIN_MESSAGE })
  expect(response.headers.get("cache-control"), kind).toBe("private, no-store, max-age=0")
  expect(response.headers.get("x-robots-tag"), kind).toBe("noindex, nofollow, noarchive")
  expect(leaked, kind).not.toMatch(/alex@example\.com|missing@example\.com|admin@profilerelaunch\.com|customerId|rate_limited|ineligible|unavailable|not found|not verified|already registered|provider down/i)
  if (kind.startsWith("start")) {
    expect(setCookie, kind).toHaveLength(1)
    const cookie = setCookie[0]
    expect(cookie, kind).toContain("pr-portal-pending-dev=")
    expect(cookie, kind).toMatch(/HttpOnly/i)
    expect(cookie, kind).toMatch(/SameSite=Strict/i)
    expect(cookie, kind).toMatch(/Path=\//)
    expect(cookie, kind).toMatch(/Max-Age=600/i)
    expect(cookie, kind).not.toMatch(/Domain=/i)
    expect(cookie, kind).not.toMatch(/Secure/i)
    expect(calls[0], kind).toBe("customer_portal_begin_login_v1")
  } else if (kind === "resend-missing") {
    expect(setCookie, kind).toEqual([])
    expect(calls, kind).toEqual([])
    expect(state.signInWithOtp, kind).not.toHaveBeenCalled()
  } else {
    expect(setCookie, kind).toEqual([])
    expect(calls[0], kind).toBe("customer_portal_begin_resend_v1")
  }
  if (PROVIDER.has(kind)) {
    expect(state.signInWithOtp, kind).toHaveBeenCalledTimes(1)
    expect(state.signInWithOtp, kind).toHaveBeenCalledWith({ email: knownEmail, options: { shouldCreateUser: false } })
  } else {
    expect(state.signInWithOtp, kind).not.toHaveBeenCalled()
  }
  const confirmed = calls.includes("customer_portal_confirm_otp_sent_v1")
  expect(confirmed, kind).toBe(kind === "start-success" || kind === "start-existing" || kind === "resend-success")
  if (kind === "start-existing") expect(state.listUsers, kind).toHaveBeenCalledTimes(1)
  return { elapsed, cookie: setCookie[0] ? cookieShape(setCookie[0]) : "" }
}

function shuffle(items: readonly Kind[], seed: number) {
  const copy = [...items]
  let state = seed >>> 0
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const swap = state % (index + 1)
    const current = copy[index]
    copy[index] = copy[swap]
    copy[swap] = current
  }
  return copy
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]
}

function median(sorted: number[]) {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    n: sorted.length,
    min: round(sorted[0]),
    median: round(median(sorted)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1]),
    spreadP95Min: round(percentile(sorted, 0.95) - sorted[0]),
  }
}

async function measure(delay: Delay) {
  const buckets = Object.fromEntries(KINDS.map(kind => [kind, [] as number[]])) as Record<Kind, number[]>
  const startCookies = new Set<string>()
  for (let round = 0; round < WARMUP + ROUNDS; round += 1) {
    for (const kind of shuffle(KINDS, 0x5ec07 + round)) {
      const { elapsed, cookie } = await sample(kind, delay)
      if (kind.startsWith("start")) startCookies.add(cookie)
      if (round >= WARMUP) buckets[kind].push(elapsed)
    }
  }
  expect([...startCookies], "pending cookie attributes differ between start branches").toEqual([
    expect.stringContaining("pr-portal-pending-dev=<redacted>"),
  ])
  expect(startCookies.size, [...startCookies].join(" | ")).toBe(1)
  const stats = Object.fromEntries(KINDS.map(kind => [kind, summarize(buckets[kind])]))
  const med = (kind: Kind) => median([...buckets[kind]].sort((left, right) => left - right))
  const gaps = {
    "start-success-minus-unknown": round(med("start-success") - med("start-unknown")),
    "start-provider-error-minus-unknown": round(med("start-provider-error") - med("start-unknown")),
    "start-cooldown-minus-unknown": round(med("start-cooldown") - med("start-unknown")),
    "start-unverified-minus-unknown": round(med("start-unverified") - med("start-unknown")),
    "start-admin-minus-unknown": round(med("start-admin") - med("start-unknown")),
    "start-existing-minus-success": round(med("start-existing") - med("start-success")),
    "resend-success-minus-missing": round(med("resend-success") - med("resend-missing")),
    "resend-provider-error-minus-missing": round(med("resend-provider-error") - med("resend-missing")),
    "resend-cooldown-minus-missing": round(med("resend-cooldown") - med("resend-missing")),
    "resend-unavailable-minus-missing": round(med("resend-unavailable") - med("resend-missing")),
  }
  const report = {
    experiment: delay.label,
    evidence: delay.label === "deterministic-timer"
      ? "Injected setTimeout inside the mocked signInWithOtp (and listUsers for an existing auth user). RPC and createUser resolve immediately. Not a live network."
      : "signInWithOtp and the existing-user listUsers await fetch() to 127.0.0.1, where the server holds the response for the injected delay. Local socket time only, not Production Supabase.",
    delayMs: DELAY_MS,
    rounds: ROUNDS,
    warmupDiscarded: WARMUP,
    order: "interleaved; each round shuffles every path once",
    stats,
    gapsMs: gaps,
  }
  console.log(`SEC07_TIMING ${JSON.stringify(report)}`)
  const fastSpread = Math.max(...[...FAST].map(kind => med(kind))) - Math.min(...[...FAST].map(kind => med(kind)))
  expect(fastSpread, `${delay.label} fast-path median spread ${round(fastSpread)}`).toBeLessThan(DELAY_MS * 0.5)
  expect(med("start-success") - med("start-unknown"), delay.label).toBeGreaterThan(DELAY_MS * 0.6)
  expect(med("start-provider-error") - med("start-unknown"), delay.label).toBeGreaterThan(DELAY_MS * 0.6)
  expect(med("start-existing") - med("start-success"), delay.label).toBeGreaterThan(DELAY_MS * 0.6)
  expect(med("resend-success") - med("resend-missing"), delay.label).toBeGreaterThan(DELAY_MS * 0.6)
  expect(med("resend-provider-error") - med("resend-missing"), delay.label).toBeGreaterThan(DELAY_MS * 0.6)
  return report
}

function timerDelay(): Delay {
  return { label: "deterministic-timer", wait: () => new Promise(resolve => { setTimeout(resolve, DELAY_MS) }) }
}

describe("portal login timing characterization", () => {
  let server: Server | null = null
  let localUrl = ""

  beforeEach(() => {
    enable()
    state.issued = 0
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    if (server) await new Promise<void>((resolve, reject) => server?.close(error => error ? reject(error) : resolve()))
  })

  it("separates eligible provider waits from ineligible branches with a deterministic timer", async () => {
    await measure(timerDelay())
  }, 120_000)

  it("separates the same branches when the provider delay is a local HTTP response", async () => {
    server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(204)
        res.end()
      }, DELAY_MS)
    })
    await new Promise<void>((resolve, reject) => {
      server?.once("error", reject)
      server?.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("delay server did not bind")
    localUrl = `http://127.0.0.1:${address.port}/otp`
    await measure({
      label: "local-http",
      wait: async () => {
        const response = await fetch(localUrl)
        await response.arrayBuffer()
      },
    })
  }, 120_000)
})
