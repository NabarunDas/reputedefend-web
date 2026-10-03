import { beforeEach, describe, expect, it, vi } from "vitest"

const load = vi.hoisted(() => vi.fn())
const gate = vi.hoisted(() => vi.fn(() => true))

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND") },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))

vi.mock("@/lib/portal/config", () => ({ portalAvailable: gate }))
vi.mock("@/lib/portal/cases/queries", () => ({ loadCustomerCase: load }))

const submittedAt = "2026-10-03T09:00:00.000Z"
const ready = {
  status: "ready",
  detail: {
    found: true,
    case: {
      reference: "PR-26-ABCDEF",
      caseType: "PROFILE_RECOVERY",
      serviceTrack: "GUIDED",
      businessName: "Harbour Bakery",
      locationName: null,
      status: "RECEIVED",
      workStage: "INITIAL_REVIEW",
      submittedAt,
      closedAt: null,
      attentionItems: [],
      outcomeCode: null,
    },
    timeline: [{ code: "CASE_RECEIVED", occurredAt: submittedAt }],
    timelineTruncated: false,
  },
}

describe("customer case page", () => {
  beforeEach(() => {
    load.mockReset()
    gate.mockReset()
    gate.mockReturnValue(true)
  })

  it("checks the public reference before calling the case RPC", async () => {
    const { default: CustomerCasePage } = await import("./page")
    await expect(CustomerCasePage({ params: Promise.resolve({ reference: "not-a-case" }) })).rejects.toThrow("NOT_FOUND")
    await expect(CustomerCasePage({ params: Promise.resolve({ reference: "11111111-1111-4111-8111-111111111111" }) })).rejects.toThrow("NOT_FOUND")
    expect(load).not.toHaveBeenCalled()
  })

  it("redirects an invalid portal session and treats an unowned reference as missing", async () => {
    const { default: CustomerCasePage } = await import("./page")
    gate.mockReturnValue(false)
    await expect(CustomerCasePage({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("REDIRECT:/")
    expect(load).not.toHaveBeenCalled()

    gate.mockReturnValue(true)
    load.mockResolvedValueOnce({ status: "unauthenticated" })
    await expect(CustomerCasePage({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("REDIRECT:/login")
    load.mockResolvedValueOnce({ status: "not_found" })
    await expect(CustomerCasePage({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })).rejects.toThrow("NOT_FOUND")
    load.mockResolvedValueOnce({ status: "unavailable" })
    const failed = await CustomerCasePage({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })
    expect(failed).toBeTruthy()
    load.mockResolvedValueOnce(ready)
    const shown = await CustomerCasePage({ params: Promise.resolve({ reference: "PR-26-ABCDEF" }) })
    expect(shown).toBeTruthy()
    expect(load).toHaveBeenLastCalledWith("PR-26-ABCDEF")
  })
})