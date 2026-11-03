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
vi.mock("@/lib/portal/onboarding/load", () => ({ loadOnboardingStatus: load }))

describe("setup progress route", () => {
  beforeEach(() => {
    gate.mockReset().mockReturnValue(true)
    hub.mockReset().mockReturnValue(false)
    session.mockReset().mockResolvedValue(null)
    load.mockReset()
  })

  it("stays behind the portal gate and the products hub", async () => {
    const { default: Page } = await import("./page")
    gate.mockReturnValue(false)
    await expect(Page()).rejects.toThrow("REDIRECT:/")
    expect(load).not.toHaveBeenCalled()

    gate.mockReturnValue(true)
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
    expect(load).not.toHaveBeenCalled()

    session.mockResolvedValueOnce({ customerId: "customer-1" })
    await expect(Page()).rejects.toThrow("REDIRECT:/portal")
    expect(load).not.toHaveBeenCalled()

    hub.mockReturnValue(true)
    load.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page()).rejects.toThrow("REDIRECT:/login")

    load.mockResolvedValueOnce({ status: "unavailable" })
    const unavailable = await Page()
    expect(unavailable.props).toEqual({})

    load.mockResolvedValueOnce({ status: "ready", requests: [] })
    const ready = await Page()
    expect(ready.props.requests).toEqual([])
  })
})
