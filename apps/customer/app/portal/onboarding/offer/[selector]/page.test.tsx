import { beforeEach, describe, expect, it, vi } from "vitest"

const gate = vi.hoisted(() => vi.fn(() => true))
const hub = vi.hoisted(() => vi.fn(() => false))
const session = vi.hoisted(() => vi.fn(async () => null as { customerId: string } | null))
const load = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock("@/lib/portal/config", () => ({ portalAvailable: gate }))
vi.mock("@/lib/portal/products-hub", () => ({ productsHubEnabled: hub }))
vi.mock("@/lib/portal/session", () => ({ getPortalSession: session }))
vi.mock("@/lib/portal/onboarding/offer-load", () => ({ loadCommercialOffer: load }))

describe("commercial offer route", () => {
  beforeEach(() => {
    gate.mockReset().mockReturnValue(true)
    hub.mockReset().mockReturnValue(false)
    session.mockReset().mockResolvedValue(null)
    load.mockReset()
    vi.unstubAllEnvs()
  })

  it("stays behind the portal, the products hub and the read flag", async () => {
    const { default: Page } = await import("./page")
    gate.mockReturnValue(false)
    await expect(Page({ params: Promise.resolve({ selector: "VC-26-AB2347" }) })).rejects.toThrow("REDIRECT:/")
    expect(load).not.toHaveBeenCalled()

    gate.mockReturnValue(true)
    await expect(Page({ params: Promise.resolve({ selector: "VC-26-AB2347" }) })).rejects.toThrow("REDIRECT:/login")
    expect(load).not.toHaveBeenCalled()

    session.mockResolvedValueOnce({ customerId: "customer-1" })
    await expect(Page({ params: Promise.resolve({ selector: "VC-26-AB2347" }) })).rejects.toThrow("REDIRECT:/portal")
    expect(load).not.toHaveBeenCalled()

    hub.mockReturnValue(true)
    await expect(Page({ params: Promise.resolve({ selector: "VC-26-AB2347" }) })).rejects.toThrow("REDIRECT:/login")
    expect(load).not.toHaveBeenCalled()

    session.mockResolvedValueOnce({ customerId: "customer-1" })
    await expect(Page({ params: Promise.resolve({ selector: "VC-26-AB2347" }) })).rejects.toThrow("REDIRECT:/portal/products")
    expect(load).not.toHaveBeenCalled()

    vi.stubEnv("CUSTOMER_COMMERCIAL_OFFER_READ_ENABLED", "true")
    load.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page({ params: Promise.resolve({ selector: "VC-26-AB2347" }) })).rejects.toThrow("REDIRECT:/login")

    load.mockResolvedValueOnce({ status: "unavailable" })
    const unavailable = await Page({ params: Promise.resolve({ selector: "VC-26-AB2347" }) })
    expect(unavailable.props.message).toBeUndefined()
  })
})
