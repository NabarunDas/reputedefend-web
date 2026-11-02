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
    const loaded = await loadProductHub()
    expect(loaded.status).toBe("ready")
    if (loaded.status !== "ready") return
    expect(loaded.products[2].unavailableReason).toBe("Telloya is not open in your portal yet.")
    expect(loaded.products[2].statusLabel).toBeUndefined()
    expect(loaded.products[1].action).toEqual({ label: "Open Relaunch Guard", href: "/portal/guard" })
    expect(rpc).not.toHaveBeenCalled()
    expect(JSON.stringify(loaded.products)).not.toMatch(/Not subscribed|Subscribe|\/portal\/telloya/)
  })

  it("sends only the session token hash and keeps a failed read from becoming not subscribed", async () => {
    jar.set("pr-portal-dev", token)
    vi.stubEnv("CUSTOMER_PRODUCTS_READ_ENABLED", "true")
    rpc.mockRejectedValueOnce(new Error("products read failed"))
    const failed = await loadProductHub()
    expect(failed.status).toBe("ready")
    if (failed.status !== "ready") return
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("customer_portal_products_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    })
    expect(Object.keys(rpc.mock.calls[0][1])).toEqual(["p_token_hash"])
    expect(failed.products[0].status).toBe("open")
    expect(failed.products[1].action?.href).toBe("/portal/guard")
    expect(failed.products[1].statusLabel).toBe("Status temporarily unavailable")
    expect(failed.products[2].statusLabel).toBe("Status temporarily unavailable")
    expect(JSON.stringify(failed.products)).not.toMatch(/Not subscribed/)

    rpc.mockResolvedValueOnce(null)
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
  })
})
