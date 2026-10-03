import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
const jar = new Map<string, string>()

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined }),
}))

vi.mock("@/lib/backend", () => ({
  validToken: (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token),
  tokenHash: (token: string) => createHash("sha256").update(token).digest("hex"),
  backend: () => ({ rpc }),
}))

const token = "a".repeat(64)
const submittedAt = "2026-10-08T12:00:00.000Z"
const dashboard = {
  summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
  attentionCases: [],
  recentCases: [],
}

describe("customer portal case loaders", () => {
  beforeEach(() => {
    jar.clear()
    rpc.mockReset()
  })

  it("hashes the portal cookie and does not send a customer id", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue(dashboard)
    const { loadCustomerDashboard } = await import("./queries")
    await expect(loadCustomerDashboard()).resolves.toEqual({ status: "ready", dashboard })
    expect(rpc).toHaveBeenCalledWith("customer_portal_dashboard_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("customerId")
  })

  it("treats a null RPC result as a signed-out session and a bad payload as unavailable", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValueOnce(null)
    const { loadCustomerDashboard, loadCustomerCases } = await import("./queries")
    await expect(loadCustomerDashboard()).resolves.toEqual({ status: "unauthenticated" })
    rpc.mockResolvedValueOnce({ summary: { activeCases: "0" } })
    await expect(loadCustomerDashboard()).resolves.toEqual({ status: "unavailable" })
    rpc.mockRejectedValueOnce(new Error("database down"))
    await expect(loadCustomerCases({ view: "active", before: null, reference: null })).resolves.toEqual({ status: "unavailable" })
    expect(String(rpc.mock.calls)).not.toMatch(/customer_id|p_customer/)
  })

  it("sends the cases cursor without a case id", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue({ cases: [], nextCursor: null })
    const { loadCustomerCases } = await import("./queries")
    await expect(loadCustomerCases({ view: "previous", before: submittedAt, reference: "PR-26-ABCDEF" })).resolves.toEqual({
      status: "ready",
      page: { cases: [], nextCursor: null },
    })
    expect(rpc).toHaveBeenCalledWith("customer_portal_cases_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
      p_view: "previous",
      p_before_time: submittedAt,
      p_before_ref: "PR-26-ABCDEF",
    })
  })

  it("does not call the database when the cookie is missing or the wrong shape", async () => {
    const { loadCustomerDashboard } = await import("./queries")
    await expect(loadCustomerDashboard()).resolves.toEqual({ status: "unauthenticated" })
    jar.set("pr-portal-dev", "short")
    await expect(loadCustomerDashboard()).resolves.toEqual({ status: "unauthenticated" })
    expect(rpc).not.toHaveBeenCalled()
  })
})
