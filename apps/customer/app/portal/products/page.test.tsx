import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const gate = vi.hoisted(() => vi.fn(() => true))
const hub = vi.hoisted(() => vi.fn(() => false))
const session = vi.hoisted(() => vi.fn(async () => null as { customerId: string } | null))
const loadHub = vi.hoisted(() => vi.fn())
const loadDashboard = vi.hoisted(() => vi.fn())
const loadName = vi.hoisted(() => vi.fn(async () => "Ada Okonkwo"))

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock("@/lib/portal/config", () => ({ portalAvailable: gate }))
vi.mock("@/lib/portal/products-hub", () => ({ productsHubEnabled: hub }))
vi.mock("@/lib/portal/session", () => ({ getPortalSession: session }))
vi.mock("@/lib/portal/products/load", () => ({ loadProductHub: loadHub }))
vi.mock("@/lib/portal/cases/queries", () => ({ loadCustomerDashboard: loadDashboard }))
vi.mock("@/lib/portal/account/header", () => ({ loadPortalHeaderName: loadName }))

const readyDashboard = {
  status: "ready" as const,
  dashboard: {
    summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
    attentionCases: [],
    recentCases: [],
  },
}

describe("product hub routes", () => {
  beforeEach(() => {
    gate.mockReset().mockReturnValue(true)
    hub.mockReset().mockReturnValue(false)
    session.mockReset().mockResolvedValue(null)
    loadHub.mockReset()
    loadDashboard.mockReset()
    loadName.mockClear()
  })

  it("keeps /portal on the original Recovery dashboard", () => {
    const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8")
    expect(source).toContain("loadCustomerDashboard()")
    expect(source).toContain("<PortalHome")
    expect(source).not.toContain("productsHubEnabled")
    expect(source).not.toContain("/portal/products")
    expect(source).not.toContain("/portal/recovery")
  })

  it("closes My Products when the flag is off and refuses a missing session", async () => {
    const { default: Page } = await import("./page")
    gate.mockReturnValue(false)
    await expect(Page()).rejects.toThrow("REDIRECT:/")
    expect(session).not.toHaveBeenCalled()
    expect(loadHub).not.toHaveBeenCalled()

    gate.mockReturnValue(true)
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
    expect(loadHub).not.toHaveBeenCalled()

    session.mockResolvedValueOnce({ customerId: "customer-1" })
    await expect(Page()).rejects.toThrow("REDIRECT:/portal")
    expect(loadHub).not.toHaveBeenCalled()

    hub.mockReturnValue(true)
    loadHub.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page()).rejects.toThrow("REDIRECT:/login")

    loadHub.mockResolvedValueOnce({
      status: "ready",
      accountName: "Ada Okonkwo",
      products: [],
    })
    expect(await Page()).toBeTruthy()
  })

  it("reuses the Recovery dashboard only while the hub flag is on", async () => {
    const { default: Page } = await import("../recovery/page")
    gate.mockReturnValue(false)
    await expect(Page()).rejects.toThrow("REDIRECT:/")
    expect(loadDashboard).not.toHaveBeenCalled()

    gate.mockReturnValue(true)
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
    expect(loadDashboard).not.toHaveBeenCalled()

    session.mockResolvedValueOnce({ customerId: "customer-1" })
    await expect(Page()).rejects.toThrow("REDIRECT:/portal")
    expect(loadDashboard).not.toHaveBeenCalled()

    hub.mockReturnValue(true)
    loadDashboard.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
    loadDashboard.mockResolvedValueOnce({ status: "unavailable" })
    expect(await Page()).toBeTruthy()
    loadDashboard.mockResolvedValueOnce(readyDashboard)
    const view = await Page()
    expect(view).toBeTruthy()
    expect(loadName).toHaveBeenCalled()
  })
})
