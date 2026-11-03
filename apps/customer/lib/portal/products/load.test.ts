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
    expect(rpc).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith("customer_portal_products_v1", expect.anything())
    expect(JSON.stringify(loaded.products)).not.toMatch(/Not subscribed|Subscribe|\/portal\/telloya/)
  })

  it("sends only the session token hash and keeps a failed read from becoming not subscribed", async () => {
    jar.set("pr-portal-dev", token)
    vi.stubEnv("CUSTOMER_PRODUCTS_READ_ENABLED", "true")
    const hash = createHash("sha256").update(token).digest("hex")
    vi.stubEnv("CUSTOMER_ONBOARDING_STATUS_READ_ENABLED", "true")
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

  it("reads onboarding only when its flag is exactly true", async () => {
    jar.set("pr-portal-dev", token)
    const hash = createHash("sha256").update(token).digest("hex")
    const commercial = {
      reads: { telloya: "ok", guard: "ok" },
      businesses: [{
        businessName: "Harbour Bakery",
        telloya: { status: "not_subscribed", locations: [] },
        guard: { status: "not_subscribed", locations: [] },
      }],
    }
    const progress = {
      product: "Telloya",
      stage: "under_review",
      statusLabel: "Request in progress",
      waitingFor: "us",
      customerActionRequired: false,
      businessName: "Harbour Bakery",
      locations: ["High Street"],
      completed: ["Request received", "Under review"],
      nextStep: "We are reviewing this request.",
      receivedAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-01T09:30:00.000Z",
    }
    vi.stubEnv("CUSTOMER_PRODUCTS_READ_ENABLED", "true")
    rpc.mockResolvedValue(commercial)
    const closed = await loadProductHub()
    expect(closed.status).toBe("ready")
    if (closed.status !== "ready") return
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("customer_portal_products_v1", { p_token_hash: hash })
    expect(closed.products[2].statusLabel).toBe("Not subscribed")
    expect(closed.products[2].group).toBe("explore")
    expect(closed.products[2].actions.map(action => action.label)).not.toContain("Track setup")

    vi.stubEnv("CUSTOMER_ONBOARDING_STATUS_READ_ENABLED", "true")
    rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_products_v1") return commercial
      if (name === "customer_portal_onboarding_status_v1") return { requests: [progress] }
      throw new Error(name)
    })
    const open = await loadProductHub()
    expect(open.status).toBe("ready")
    if (open.status !== "ready") return
    expect(rpc).toHaveBeenCalledWith("customer_portal_onboarding_status_v1", { p_token_hash: hash })
    expect(open.products[2].statusLabel).toBe("Request in progress")
    expect(open.products[2].group).toBe("yours")
    expect(open.products[2].statusLabel).not.toBe("Active")
    expect(open.products[2].actions).toEqual([{ label: "Track setup", href: "/portal/onboarding" }])
  })

  it("does not turn a missing or unreadable onboarding read into Not subscribed", async () => {
    jar.set("pr-portal-dev", token)
    vi.stubEnv("CUSTOMER_PRODUCTS_READ_ENABLED", "true")
    vi.stubEnv("CUSTOMER_ONBOARDING_STATUS_READ_ENABLED", "true")
    const commercial = {
      reads: { telloya: "ok", guard: "ok" },
      businesses: [{
        businessName: "Harbour Bakery",
        telloya: { status: "not_subscribed", locations: [] },
        guard: { status: "active", locations: [] },
      }],
    }
    rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_products_v1") return commercial
      throw new Error("function customer_portal_onboarding_status_v1 does not exist")
    })
    const missing = await loadProductHub()
    expect(missing.status).toBe("ready")
    if (missing.status !== "ready") return
    expect(missing.products[2].statusLabel).toBe("Status temporarily unavailable")
    expect(missing.products[2].statusLabel).not.toBe("Not subscribed")
    expect(missing.products[2].statusLabel).not.toBe("Active")
    expect(missing.products[2].group).toBe("unconfirmed")
    expect(missing.products[1].statusLabel).toBe("Active")

    rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_products_v1") return {
        ...commercial,
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: { status: "setup", locations: [] },
          guard: { status: "not_subscribed", locations: [] },
        }],
      }
      return { requests: [{ statusLabel: "Active", extra: true }] }
    })
    const preserved = await loadProductHub()
    expect(preserved.status).toBe("ready")
    if (preserved.status !== "ready") return
    expect(preserved.products[2].statusLabel).toBe("Setup in progress")
    expect(preserved.products[2].group).toBe("yours")

    rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_products_v1") return commercial
      return { unexpected: true }
    })
    const unreadable = await loadProductHub()
    expect(unreadable.status).toBe("ready")
    if (unreadable.status !== "ready") return
    expect(unreadable.products[2].statusLabel).toBe("Status temporarily unavailable")
    expect(unreadable.products[2].statusLabel).not.toBe("Not subscribed")
    expect(JSON.stringify(unreadable.products[2])).not.toMatch(/\bActive\b/)
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
