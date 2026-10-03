import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { customerConfig } from "@/lib/config"
import { portalAvailable, portalCookieOptions, portalPendingCookieName, portalSessionCookieName } from "./config"

const origin = "https://customer.profilerelaunch.com"

function customerEnv() {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
}

afterEach(() => vi.unstubAllEnvs())

describe("portal feature gate", () => {
  it("stays closed unless the portal flag and the existing customer backend config are both valid", () => {
    expect(portalAvailable()).toBe(false)
    customerEnv()
    expect(customerConfig()?.origin).toBe(origin)
    expect(portalAvailable()).toBe(false)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "TRUE")
    expect(portalAvailable()).toBe(false)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    expect(portalAvailable()).toBe(true)
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false")
    expect(customerConfig()).toBeNull()
    expect(portalAvailable()).toBe(false)
  })

  it("uses host-only production cookie names and development names otherwise", () => {
    expect(portalSessionCookieName()).toBe("pr-portal-dev")
    expect(portalPendingCookieName()).toBe("pr-portal-pending-dev")
    expect(portalCookieOptions()).toEqual({ httpOnly: true, secure: false, sameSite: "strict", path: "/" })
    vi.stubEnv("NODE_ENV", "production")
    expect(portalSessionCookieName()).toBe("__Host-pr-portal")
    expect(portalPendingCookieName()).toBe("__Host-pr-portal-pending")
    expect(portalCookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: "strict", path: "/" })
    expect(portalCookieOptions()).not.toHaveProperty("domain")
  })

  it("does not keep a Supabase browser session or store portal tokens in web storage", () => {
    const files = [
      "lib/portal/http.ts",
      "lib/portal/session.ts",
      "lib/portal/config.ts",
      "app/login/login-client.tsx",
      "app/portal/page.tsx",
    ]
    const source = files.map(file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")).join("\n")
    expect(source).not.toMatch(/getSession\(|localStorage|sessionStorage|@supabase\/ssr/)
    expect(source).not.toMatch(/customer_action_session_v1|actionSessionFromToken/)
    expect(source).toMatch(/customer_portal_session_v1/)
    const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8")
    expect(proxy).toContain("portalSessionFromToken")
    expect(proxy).toContain("actionSessionFromToken")
    expect(proxy).not.toMatch(/getSession\(|localStorage|@supabase\/ssr/)
  })
})
