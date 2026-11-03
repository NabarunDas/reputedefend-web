import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
const jar = new Map<string, string>()
const dashboard = vi.fn()
const guard = vi.fn()

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined }),
}))

vi.mock("@/lib/backend", () => ({
  validToken: (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token),
  tokenHash: (token: string) => createHash("sha256").update(token).digest("hex"),
  backend: () => ({ rpc }),
}))

vi.mock("@/lib/portal/cases/queries", () => ({ loadCustomerDashboard: () => dashboard() }))
vi.mock("@/lib/portal/guard/queries", () => ({ loadCustomerGuard: () => guard() }))
vi.mock("@/lib/portal/account/header", () => ({ loadPortalHeaderName: async () => "Ada Okonkwo" }))

import { loadProductHub } from "./load"
import { parseCommercialProducts } from "./queries"

const token = "a".repeat(64)
const readyDashboard = {
  status: "ready" as const,
  dashboard: {
    summary: { activeCases: 1, attentionCases: 0, previousCases: 0 },
    attentionCases: [],
    recentCases: [],
  },
}

describe("My Products commercial read", () => {
  beforeEach(() => {
    jar.clear()
    rpc.mockReset()
    dashboard.mockReset().mockResolvedValue(readyDashboard)
    guard.mockReset().mockResolvedValue({
      status: "ready",
      guard: { locations: [{ businessName: "Harbour Bakery", monitoringActive: true }] },
    })
    vi.unstubAllEnvs()
  })

  it("does not call the products read while the flag is off", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_onboarding_status_v1") return { requests: [] }
      throw new Error(`unexpected ${name}`)
    })
    const loaded = await loadProductHub()
    expect(loaded.status).toBe("ready")
    if (loaded.status !== "ready") return
    expect(loaded.products).toHaveLength(3)
    expect(loaded.products.map(product => product.key)).toEqual(["recovery", "guard", "telloya"])
    expect(loaded.products[2].unavailableReason).toBe("Telloya is not open in your portal yet.")
    expect(loaded.products[2].statusLabel).toBeUndefined()
    expect(loaded.products[2].actions).toEqual([{ label: "Email us about Telloya", href: "mailto:contact@profilerelaunch.com" }])
    expect(loaded.products[2].actions.map(action => action.href).join(" ")).not.toMatch(/\/portal\/telloya|telloya\.com\/enquire/)
    expect(loaded.products[1].actions).toContainEqual({ label: "Open dashboard", href: "/portal/guard" })
    expect(loaded.products[0].actions).toContainEqual({ label: "Open dashboard", href: "/portal/recovery" })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("customer_portal_onboarding_status_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    })
    expect(rpc).not.toHaveBeenCalledWith("customer_portal_products_v1", expect.anything())
    expect(JSON.stringify(loaded.products)).not.toMatch(/Not subscribed|Subscribe|\/portal\/telloya/)
  })

  it("sends only the session token hash and keeps a failed read from becoming not subscribed", async () => {
    jar.set("pr-portal-dev", token)
    vi.stubEnv("CUSTOMER_PRODUCTS_READ_ENABLED", "true")
    const hash = createHash("sha256").update(token).digest("hex")
    rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_products_v1") throw new Error("products read failed")
      if (name === "customer_portal_onboarding_status_v1") return { requests: [] }
      throw new Error(name)
    })
    const failed = await loadProductHub()
    expect(failed.status).toBe("ready")
    if (failed.status !== "ready") return
    expect(rpc).toHaveBeenCalledWith("customer_portal_products_v1", { p_token_hash: hash })
    expect(rpc).toHaveBeenCalledWith("customer_portal_onboarding_status_v1", { p_token_hash: hash })
    expect(rpc.mock.calls.every(call => Object.keys(call[1]).join() === "p_token_hash")).toBe(true)
    expect(failed.products[0].status).toBe("open")
    expect(failed.products[0].actions).toContainEqual({ label: "Open dashboard", href: "/portal/recovery" })
    expect(failed.products[1].statusLabel).toBeUndefined()
    expect(failed.products[1].context).toContain("Status temporarily unavailable.")
    expect(failed.products[1].actions).toContainEqual({ label: "Open dashboard", href: "/portal/guard" })
    expect(failed.products[1].context).toContain("Monitoring is recorded for 1 location.")
    expect(failed.products[1].unavailableReason).toBe("Some extra details are temporarily unavailable. Monitoring already recorded is unchanged.")
    expect(JSON.stringify(failed.products[1])).not.toMatch(/stopped|no longer/)
    expect(failed.products[2].statusLabel).toBe("Status temporarily unavailable")
    expect(JSON.stringify(failed.products)).not.toMatch(/Not subscribed/)

    rpc.mockImplementation(async (name: string) => name === "customer_portal_products_v1" ? null : { requests: [] })
    await expect(loadProductHub()).resolves.toEqual({ status: "unauthenticated" })
  })

  it("drops a payload that carries a Stripe identifier or a provider reference", () => {
    expect(parseCommercialProducts({
      reads: { telloya: "ok", guard: "ok" },
      businesses: [{
        businessName: "Harbour Bakery",
        telloya: { status: "active", locations: [{ locationName: "High Street", status: "active", nextStep: null, stripeSubscriptionId: "sub_leak" }] },
        guard: { status: "not_subscribed", locations: [] },
      }],
    })).toBeNull()
    expect(parseCommercialProducts({
      reads: { telloya: "ok", guard: "ok" },
      businesses: [],
      stripeCustomerId: "cus_leak",
    })).toBeNull()
    const scoped = parseCommercialProducts({
      reads: { telloya: "ok", guard: "ok" },
      businesses: [{
        businessId: "a020d000-0000-4000-8000-000000000041",
        businessName: "Harbour Bakery",
        telloya: { status: "pending", locations: [] },
        guard: { status: "not_subscribed", locations: [] },
      }],
    })
    expect(scoped?.businesses).toEqual([{
      businessName: "Harbour Bakery",
      telloya: { status: "pending", locations: [] },
      guard: { status: "not_subscribed", locations: [] },
    }])
    expect(JSON.stringify(scoped)).not.toContain("businessId")
    expect(JSON.stringify(scoped)).not.toContain("a020d000-0000-4000-8000-000000000041")
  })
})
