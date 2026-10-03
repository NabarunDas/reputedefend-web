import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const sessions = vi.hoisted(() => ({
  action: vi.fn(async (_token?: string) => null as Record<string, unknown> | null),
  portal: vi.fn(async (_token?: string) => null as Record<string, unknown> | null),
}))
vi.mock("./lib/backend", () => ({ actionSessionFromToken: sessions.action }))
vi.mock("./lib/portal/session", () => ({ portalSessionFromToken: sessions.portal }))
import { proxy } from "./proxy"
import { sessionCookie } from "./lib/config"
import { portalSessionCookieName } from "./lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const actionToken = "a".repeat(64)
const portalToken = "b".repeat(64)

function ask(path: string, method = "GET", cookie = "") {
  return proxy(new NextRequest(`${origin}${path}`, { method, headers: cookie ? { cookie } : {} }))
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  sessions.action.mockReset().mockResolvedValue(null)
  sessions.portal.mockReset().mockResolvedValue(null)
  sessions.action.mockImplementation(async token => token === actionToken ? { actionId: "action" } : null)
  sessions.portal.mockImplementation(async token => token === portalToken ? { customerId: "customer" } : null)
})
afterEach(() => vi.unstubAllEnvs())

describe("customer portal proxy isolation", () => {
  it("keeps existing public reads and action pre-auth posts", async () => {
    for (const path of ["/", "/robots.txt", "/pay/return", "/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/icon.png", "/apple-icon.png", "/brand/profile-relaunch-logo.png", "/brand/profile-relaunch-logo-light.png"]) {
      expect((await ask(path)).headers.get("x-middleware-next")).toBe("1")
    }
    const otherBrand = await ask("/brand/profile-relaunch-source.png")
    expect(otherBrand.status).toBe(303)
    expect(otherBrand.headers.get("location")).toBe(`${origin}/`)
    for (const path of ["/api/action/exchange", "/api/action/otp", "/api/action/verify", "/api/action/command"]) {
      expect((await ask(path, "POST")).headers.get("x-middleware-next")).toBe("1")
    }
  })

  it("allows only the exact Next image optimiser path", async () => {
    for (const method of ["GET", "HEAD"]) {
      expect((await ask("/_next/image", method)).headers.get("x-middleware-next")).toBe("1")
    }
    const posted = await ask("/_next/image", "POST")
    expect(posted.headers.get("x-middleware-next")).toBeNull()
    expect(posted.status).toBe(401)
    for (const path of ["/_next/image/extra", "/_next/data", "/_next/webpack"]) {
      const blocked = await ask(path)
      expect(blocked.headers.get("x-middleware-next")).toBeNull()
      expect(blocked.status).toBe(303)
      expect(blocked.headers.get("location")).toBe(`${origin}/`)
    }
    const portal = await ask("/portal")
    expect(portal.status).toBe(303)
    expect(portal.headers.get("location")).toBe(`${origin}/login`)
    const casePage = await ask("/case")
    expect(casePage.status).toBe(303)
    expect(casePage.headers.get("location")).toBe(`${origin}/`)
    expect((await ask("/api/action/payment", "POST")).status).toBe(401)
    expect((await ask("/api/action/exchange", "GET")).status).toBe(401)
    expect((await ask("/api/portal/auth/start", "GET")).status).toBe(401)
    expect((await ask("/api/portal/auth/verify", "GET")).status).toBe(401)
    expect((await ask("/api/portal/auth/start", "POST")).headers.get("x-middleware-next")).toBe("1")
    expect((await ask("/api/portal/auth/sign-out", "POST")).headers.get("x-middleware-next")).toBe("1")
  })

  it("renders login only while the portal gate is on", async () => {
    expect((await ask("/login")).headers.get("x-middleware-next")).toBe("1")
    expect((await ask("/login", "POST")).status).toBe(401)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    const closed = await ask("/login")
    expect(closed.status).toBe(303)
    expect(closed.headers.get("location")).toBe(`${origin}/`)
  })

  it("requires a portal session for /portal and does not accept an action session", async () => {
    const anonymous = await ask("/portal")
    expect(anonymous.status).toBe(303)
    expect(anonymous.headers.get("location")).toBe(`${origin}/login`)
    const actionOnly = await ask("/portal", "GET", `${sessionCookie}=${actionToken}`)
    expect(actionOnly.status).toBe(303)
    expect(actionOnly.headers.get("location")).toBe(`${origin}/login`)
    expect(sessions.action).not.toHaveBeenCalled()
    const signedIn = await ask("/portal", "GET", `${portalSessionCookieName()}=${portalToken}`)
    expect(signedIn.headers.get("x-middleware-next")).toBe("1")
    expect(signedIn.headers.get("cache-control")).toContain("no-store")
    expect(signedIn.headers.get("x-robots-tag")).toContain("noindex")
  })

  it("does not let a portal session open /case or an action-scoped API", async () => {
    const page = await ask("/case", "GET", `${portalSessionCookieName()}=${portalToken}`)
    expect(page.status).toBe(303)
    expect(page.headers.get("location")).toBe(`${origin}/`)
    expect(sessions.portal).not.toHaveBeenCalled()
    expect(sessions.action).toHaveBeenCalledWith(undefined)
    const upload = await ask("/api/case/evidence/upload", "POST", `${portalSessionCookieName()}=${portalToken}`)
    expect(upload.status).toBe(401)
    const payment = await ask("/api/action/payment", "POST", `${portalSessionCookieName()}=${portalToken}`)
    expect(payment.status).toBe(401)
    const allowed = await ask("/case", "GET", `${sessionCookie}=${actionToken}`)
    expect(allowed.headers.get("x-middleware-next")).toBe("1")
  })

  it("lets portal pre-auth and sign-out through so an expired cookie can still be cleared", async () => {
    for (const path of ["/api/portal/auth/start", "/api/portal/auth/resend", "/api/portal/auth/verify", "/api/portal/auth/sign-out"]) {
      expect((await ask(path, "POST")).headers.get("x-middleware-next")).toBe("1")
      expect((await ask(path, "GET")).status).toBe(401)
    }
  })

  it("opens the portal while the customer-action flag is off", async () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false")
    expect((await ask("/login")).headers.get("x-middleware-next")).toBe("1")
    const signedIn = await ask("/portal", "GET", `${portalSessionCookieName()}=${portalToken}`)
    expect(signedIn.headers.get("x-middleware-next")).toBe("1")
    expect(sessions.portal).toHaveBeenCalled()
  })

  it("hides the portal when the gate is off", async () => {
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    const portal = await ask("/portal", "GET", `${portalSessionCookieName()}=${portalToken}`)
    expect(portal.status).toBe(303)
    expect(portal.headers.get("location")).toBe(`${origin}/`)
    expect(sessions.portal).not.toHaveBeenCalled()
    const home = await ask("/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    expect(home.headers.get("x-middleware-next")).toBe("1")
  })
})
