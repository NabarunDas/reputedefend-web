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
const selector = `ca-${"cd".repeat(32)}`
const service = {
  found: true,
  case: { reference: "PR-26-ABCDEF", businessName: "Harbour Bakery", locationName: "High Street", serviceTrack: "GUIDED" },
  quote: null,
  serviceAgreement: null,
  casePermission: null,
  actions: [{ selector, kind: "quote", target: null }],
}

describe("customer case service loader", () => {
  beforeEach(() => {
    jar.clear()
    rpc.mockReset()
  })

  it("loads from the portal token hash and the public reference only", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue(service)
    const { loadCustomerCaseService } = await import("./queries")
    await expect(loadCustomerCaseService("PR-26-ABCDEF")).resolves.toEqual({ status: "ready", service })
    expect(rpc).toHaveBeenCalledWith("customer_portal_case_service_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
      p_reference: "PR-26-ABCDEF",
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/customerId|caseId/)
  })

  it("maps a null session, a missing case and a bad payload to different states", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValueOnce(null)
    const { loadCustomerCaseService } = await import("./queries")
    await expect(loadCustomerCaseService("PR-26-ABCDEF")).resolves.toEqual({ status: "unauthenticated" })
    rpc.mockResolvedValueOnce({ found: false })
    await expect(loadCustomerCaseService("PR-26-ABCDEF")).resolves.toEqual({ status: "not_found" })
    rpc.mockResolvedValueOnce({ found: true, secret: "action-secret" })
    await expect(loadCustomerCaseService("PR-26-ABCDEF")).resolves.toEqual({ status: "unavailable" })
    rpc.mockRejectedValueOnce(new Error("rpc customer_portal_case_service_v1 failed"))
    await expect(loadCustomerCaseService("PR-26-ABCDEF")).resolves.toEqual({ status: "unavailable" })
  })
})
