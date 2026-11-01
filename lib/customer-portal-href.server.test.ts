import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEV_CUSTOMER_PORTAL_HREF, PRODUCTION_CUSTOMER_PORTAL_HREF } from "@/lib/customer-portal-href"
import { marketingCustomerPortalHref } from "@/lib/customer-portal-href.server"

const DEV_ORIGIN = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const PRODUCTION_ORIGIN = "https://customer.profilerelaunch.com"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("marketing customer portal destination", () => {
  it("uses the same hosts the customer message allowlist already verifies", () => {
    const present = readFileSync(new URL("../apps/customer/lib/portal/messages/present.ts", import.meta.url), "utf8")
    expect(present).toContain(new URL(DEV_CUSTOMER_PORTAL_HREF).host)
    expect(present).toContain(new URL(PRODUCTION_CUSTOMER_PORTAL_HREF).host)
    expect(DEV_CUSTOMER_PORTAL_HREF).toBe(`${DEV_ORIGIN}/portal`)
    expect(PRODUCTION_CUSTOMER_PORTAL_HREF).toBe(`${PRODUCTION_ORIGIN}/portal`)
  })

  it("publishes the canonical production portal only when the link is release-approved", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("CUSTOMER_ORIGIN", PRODUCTION_ORIGIN)
    vi.stubEnv("CUSTOMER_PORTAL_LINK", "approved")
    expect(marketingCustomerPortalHref()).toBe(PRODUCTION_CUSTOMER_PORTAL_HREF)
  })

  it("keeps production closed until approval, and never points it at a preview", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("CUSTOMER_ORIGIN", PRODUCTION_ORIGIN)
    expect(marketingCustomerPortalHref()).toBeNull()

    for (const flag of ["true", "TRUE", "Approved", "yes", ""]) {
      vi.stubEnv("CUSTOMER_PORTAL_LINK", flag)
      expect(marketingCustomerPortalHref()).toBeNull()
    }

    vi.stubEnv("CUSTOMER_PORTAL_LINK", "approved")
    vi.stubEnv("CUSTOMER_ORIGIN", DEV_ORIGIN)
    expect(marketingCustomerPortalHref()).toBeNull()
    vi.stubEnv("CUSTOMER_ORIGIN", "https://profilerelaunch-customer-git-feature-clientcove.vercel.app")
    expect(marketingCustomerPortalHref()).toBeNull()
  })

  it("publishes the verified DEV portal on preview and local development", () => {
    for (const vercel of ["preview", "development", ""]) {
      vi.stubEnv("VERCEL_ENV", vercel)
      vi.stubEnv("NODE_ENV", vercel === "" ? "development" : "production")
      vi.stubEnv("CUSTOMER_ORIGIN", `${DEV_ORIGIN}/`)
      vi.stubEnv("CUSTOMER_PORTAL_LINK", "approved")
      expect(marketingCustomerPortalHref()).toBe(DEV_CUSTOMER_PORTAL_HREF)
    }
  })

  it("never sends preview or local visitors to production", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("CUSTOMER_PORTAL_LINK", "approved")
    vi.stubEnv("CUSTOMER_ORIGIN", PRODUCTION_ORIGIN)
    expect(marketingCustomerPortalHref()).toBeNull()

    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("NODE_ENV", "test")
    expect(marketingCustomerPortalHref()).toBeNull()
  })

  it("fails closed for a missing, malformed, or unverified destination", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("CUSTOMER_PORTAL_LINK", "")
    const rejected = [
      undefined,
      "",
      "http://profilerelaunch-customer-git-develop-clientcove.vercel.app",
      "https://user:secret@profilerelaunch-customer-git-develop-clientcove.vercel.app",
      "https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal",
      "https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal?next=https://evil.example",
      "https://profilerelaunch-customer-git-develop-clientcove.vercel.app.evil.example",
      "https://evil.profilerelaunch-customer-git-develop-clientcove.vercel.app",
      "https://profilerelaunch-customer-git-develop-attacker.vercel.app",
      "https://profilerelaunch-customer-abc123-clientcove.vercel.app",
      "javascript:alert(1)",
      `${DEV_ORIGIN}/portal?next=/`,
    ]
    for (const origin of rejected) {
      if (origin === undefined) vi.stubEnv("CUSTOMER_ORIGIN", "")
      else vi.stubEnv("CUSTOMER_ORIGIN", origin)
      expect(marketingCustomerPortalHref()).toBeNull()
    }

    vi.stubEnv("CUSTOMER_ORIGIN", DEV_ORIGIN)
    vi.stubEnv("VERCEL_ENV", "staging")
    expect(marketingCustomerPortalHref()).toBeNull()

    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(marketingCustomerPortalHref()).toBeNull()
  })
})
