import { beforeEach, describe, expect, it, vi } from "vitest"

const load = vi.hoisted(() => vi.fn())
const gate = vi.hoisted(() => vi.fn(() => true))

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND") },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock("@/lib/portal/config", () => ({ portalAvailable: gate }))
vi.mock("@/lib/portal/documents/queries", () => ({ loadCustomerCaseDocuments: load }))

describe("case documents page", () => {
  beforeEach(() => {
    load.mockReset()
    gate.mockReset()
    gate.mockReturnValue(true)
  })

  it("rejects a non-public reference before the RPC and treats unowned and missing the same way", async () => {
    const { default: Page } = await import("./page")
    await expect(Page({ params: Promise.resolve({ reference: "not-a-case" }) })).rejects.toThrow("NOT_FOUND")
    await expect(Page({ params: Promise.resolve({ reference: "11111111-1111-4111-8111-111111111111" }) })).rejects.toThrow("NOT_FOUND")
    expect(load).not.toHaveBeenCalled()
    gate.mockReturnValue(false)
    await expect(Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("REDIRECT:/")
    gate.mockReturnValue(true)
    load.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("REDIRECT:/login")
    load.mockResolvedValueOnce({ status: "not_found" })
    await expect(Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("NOT_FOUND")
    load.mockResolvedValueOnce({ status: "unavailable" })
    expect(await Page({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).toBeTruthy()
  })
})
