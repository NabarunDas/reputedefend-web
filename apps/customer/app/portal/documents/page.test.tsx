import { beforeEach, describe, expect, it, vi } from "vitest"

const load = vi.hoisted(() => vi.fn())
const gate = vi.hoisted(() => vi.fn(() => true))

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND") },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock("@/lib/portal/config", () => ({ portalAvailable: gate }))
vi.mock("@/lib/portal/documents/queries", () => ({ loadCustomerDocuments: load }))

describe("documents page", () => {
  beforeEach(() => {
    load.mockReset()
    gate.mockReset()
    gate.mockReturnValue(true)
  })

  it("sends a signed-out customer to login and hides the portal when the gate is off", async () => {
    const { default: Page } = await import("./page")
    gate.mockReturnValue(false)
    await expect(Page()).rejects.toThrow("REDIRECT:/")
    expect(load).not.toHaveBeenCalled()
    gate.mockReturnValue(true)
    load.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
    load.mockResolvedValueOnce({ status: "unavailable" })
    expect(await Page()).toBeTruthy()
    load.mockResolvedValueOnce({ status: "ready", documents: { needs: [], submissions: [], documents: [] } })
    expect(await Page()).toBeTruthy()
  })
})
