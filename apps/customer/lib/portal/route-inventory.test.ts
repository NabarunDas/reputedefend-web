import { readdirSync, readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const sessions = vi.hoisted(() => ({
  action: vi.fn(async (_token?: string) => null as Record<string, unknown> | null),
  portal: vi.fn(async (_token?: string) => null as Record<string, unknown> | null),
}))
vi.mock("../../lib/backend", () => ({ actionSessionFromToken: sessions.action }))
vi.mock("../../lib/portal/session", () => ({ portalSessionFromToken: sessions.portal }))

import { proxy } from "../../proxy"
import { sessionCookie } from "@/lib/config"
import { portalSessionCookieName } from "./config"
import { PORTAL_NAV_HREFS, PORTAL_ROUTES, type PortalRoute } from "./route-inventory"

const customerRoot = new URL("../..", import.meta.url)
const origin = "https://customer.profilerelaunch.com"
const portalToken = "b".repeat(64)
const actionToken = "a".repeat(64)

function files(directory: URL, name: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const next = new URL(`${entry.name}/`, directory)
    if (entry.isDirectory()) found.push(...files(next, name))
    else if (entry.name === name) found.push(directory.pathname + entry.name)
  }
  return found
}

function routePath(file: string, root: string) {
  const relative = file.slice(root.length).replace(/\/(?:page\.tsx|route\.ts)$/, "")
  const trimmed = relative.replace(/^app/, "").replace(/\/$/, "")
  return trimmed || "/"
}

function sample(path: string) {
  return path
    .replace("[reference]", "PR-26-AAAAAA")
    .replace("[selector]", path.includes("/guard/") ? `gd-${"ab".repeat(32)}` : `mc-${"ab".repeat(32)}`)
}

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

describe("customer portal route inventory", () => {
  it("lists every portal page and API, and no other portal route", () => {
    const root = customerRoot.pathname
    const pages = files(new URL("app/portal/", customerRoot), "page.tsx").map(file => routePath(file, root))
    const apis = files(new URL("app/api/portal/", customerRoot), "route.ts").map(file => routePath(file, root))
    const login = routePath(`${root}app/login/page.tsx`, root)
    expect(pages).not.toContain("/portal/relaunch-guard")
    expect([...pages, ...apis, login].sort()).toEqual(PORTAL_ROUTES.map(route => route.path).sort())
    expect(new Set(PORTAL_ROUTES.map(route => route.path)).size).toBe(PORTAL_ROUTES.length)
    for (const route of PORTAL_ROUTES) {
      expect(readFileSync(new URL(route.file, customerRoot), "utf8").length).toBeGreaterThan(0)
    }
  })

  it("makes each page and API re-check the portal gate itself", () => {
    for (const route of PORTAL_ROUTES.filter(item => item.kind === "page")) {
      const source = readFileSync(new URL(route.file, customerRoot), "utf8")
      expect(source).toContain("portalAvailable()")
      if (route.proxyClass === "portal-page") expect(source).toContain("unauthenticated")
    }
    for (const route of PORTAL_ROUTES.filter(item => item.kind === "api")) {
      const source = readFileSync(new URL(route.file, customerRoot), "utf8")
      expect(source).toMatch(/from "@\/lib\/portal\//)
      expect(source).not.toMatch(/actionSessionFromToken|customer_action_session/)
    }
    const handlers = [
      "lib/portal/http.ts",
      "lib/portal/documents/upload.ts",
      "lib/portal/documents/download.ts",
      "lib/portal/service/command.ts",
      "lib/portal/payments/command.ts",
      "lib/portal/payments/receipt.ts",
      "lib/portal/payments/invoice.ts",
      "lib/portal/guard/command.ts",
    ]
    for (const file of handlers) {
      expect(readFileSync(new URL(file, customerRoot), "utf8")).toContain("portalAvailable()")
    }
  })

  it("keeps portal navigation pointed at inventoried pages", () => {
    const nav = readFileSync(new URL("app/portal/portal-nav.tsx", customerRoot), "utf8")
    for (const href of PORTAL_NAV_HREFS) {
      expect(nav).toContain(`href: "${href}"`)
      expect(PORTAL_ROUTES.some(route => route.path === href && route.kind === "page")).toBe(true)
    }
    expect(nav).not.toContain("/portal/relaunch-guard")
    expect(nav).not.toContain("aria-disabled")
  })

  it("refuses an unclassified portal API even when an action or portal session is present", async () => {
    const portalCookie = `${portalSessionCookieName()}=${portalToken}`
    const actionCookie = `${sessionCookie}=${actionToken}`
    const both = `${portalCookie}; ${actionCookie}`
    for (const path of ["/api/portal/not-a-route", "/api/portal/auth/start/extra", "/api/portal/evidence/extra"]) {
      sessions.action.mockClear()
      sessions.portal.mockClear()
      const open = await ask(path, "POST", both)
      expect(open.status).toBe(401)
      expect(open.headers.get("x-middleware-next")).toBeNull()
      expect(sessions.action).not.toHaveBeenCalled()
      expect(sessions.portal).not.toHaveBeenCalled()
      vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
      expect((await ask(path, "POST", both)).status).toBe(404)
      vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    }
  })

  it("matches the proxy behaviour recorded for every classified route", async () => {
    const portalCookie = `${portalSessionCookieName()}=${portalToken}`
    const actionCookie = `${sessionCookie}=${actionToken}`
    for (const route of PORTAL_ROUTES) {
      const path = sample(route.path)
      await expect(proxyOutcome(route, path, portalCookie, actionCookie), route.path).resolves.toBe(true)
    }
  })
})

async function proxyOutcome(route: PortalRoute, path: string, portalCookie: string, actionCookie: string) {
  const next = async (method: string, cookie = "") => (await ask(path, method, cookie)).headers.get("x-middleware-next") === "1"
  const status = async (method: string, cookie = "") => (await ask(path, method, cookie)).status
  const location = async (method: string, cookie = "") => (await ask(path, method, cookie)).headers.get("location")
  if (route.proxyClass === "login") {
    expect(await next("GET")).toBe(true)
    expect(await next("HEAD")).toBe(true)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect(await status("GET")).toBe(303)
    expect(await location("GET")).toBe(`${origin}/`)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    return true
  }
  if (route.proxyClass === "portal-page") {
    expect(await status("GET")).toBe(303)
    expect(await location("GET")).toBe(`${origin}/login`)
    expect(await status("GET", actionCookie)).toBe(303)
    expect(await location("GET", actionCookie)).toBe(`${origin}/login`)
    expect(await next("GET", portalCookie)).toBe(true)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect(await status("GET", portalCookie)).toBe(303)
    expect(await location("GET", portalCookie)).toBe(`${origin}/`)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    return true
  }
  if (route.proxyClass === "pre-auth" || route.proxyClass === "sign-out") {
    expect(await next("POST")).toBe(true)
    expect(await status("GET")).toBe(401)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect(await next("POST")).toBe(true)
    expect(await status("GET")).toBe(404)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    return true
  }
  const method = route.proxyClass === "session-read" ? "GET" : "POST"
  const other = method === "GET" ? "POST" : "GET"
  expect(await status(method)).toBe(401)
  expect(await status(method, actionCookie)).toBe(401)
  expect(await next(method, portalCookie)).toBe(true)
  expect(await status(other, portalCookie)).toBe(401)
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
  expect(await status(method, portalCookie)).toBe(404)
  expect(await status(other, portalCookie)).toBe(404)
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  return true
}
