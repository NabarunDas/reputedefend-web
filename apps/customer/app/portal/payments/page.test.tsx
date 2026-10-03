import { beforeEach, describe, expect, it, vi } from "vitest"

const load = vi.hoisted(() => vi.fn())
const caseLoad = vi.hoisted(() => vi.fn())
const gate = vi.hoisted(() => vi.fn(() => true))

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND") },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock("@/lib/portal/config", () => ({ portalAvailable: gate }))
vi.mock("@/lib/portal/payments/queries", () => ({
  loadCustomerPayments: load,
  loadCustomerCasePayments: caseLoad,
}))

const ready = {
  status: "ready" as const,
  payments: { cases: [] },
}

describe("payments pages", () => {
  beforeEach(() => {
    load.mockReset()
    caseLoad.mockReset()
    gate.mockReset()
    gate.mockReturnValue(true)
  })

  it("sends a signed-out customer to login and hides the list when the gate is off", async () => {
    const { default: Page } = await import("./page")
    gate.mockReturnValue(false)
    await expect(Page()).rejects.toThrow("REDIRECT:/")
    expect(load).not.toHaveBeenCalled()
    gate.mockReturnValue(true)
    load.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
    load.mockResolvedValueOnce({ status: "unavailable" })
    expect(await Page()).toBeTruthy()
    load.mockResolvedValueOnce(ready)
    expect(await Page()).toBeTruthy()
  })

  it("hides another customer's case and a forged reference", async () => {
    const { default: Page } = await import("../cases/[reference]/payments/page")
    gate.mockReturnValue(false)
    await expect(Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("REDIRECT:/")
    gate.mockReturnValue(true)
    await expect(Page({ params: Promise.resolve({ reference: "not-a-case" }) })).rejects.toThrow("NOT_FOUND")
    caseLoad.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("REDIRECT:/login")
    caseLoad.mockResolvedValueOnce({ status: "not_found" })
    await expect(Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("NOT_FOUND")
    caseLoad.mockResolvedValueOnce({
      status: "ready",
      payments: { found: true, case: { reference: "PR-26-ABCDEF", businessName: "Harbour Bakery", locationName: null, serviceTrack: "GUIDED", orders: [], actions: [] } },
    })
    expect(await Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).toBeTruthy()
  })
})
