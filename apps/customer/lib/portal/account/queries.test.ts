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

const token = "b".repeat(64)
const account = {
  name: "Alex Customer",
  email: "alex@example.com",
  emailVerified: true,
  phoneVerified: false,
}

describe("customer portal account loader", () => {
  beforeEach(() => {
    jar.clear()
    rpc.mockReset()
  })

  it("derives the account from the portal cookie and sends no customer id", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue(account)
    const { loadCustomerAccount } = await import("./queries")
    await expect(loadCustomerAccount()).resolves.toEqual({
      status: "ready",
      account: { ...account, phone: null, emailVerified: true },
    })
    expect(rpc).toHaveBeenCalledWith("customer_portal_account_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/customerId|p_customer|p_email|authUser/)
  })

  it("fails closed when the session or the payload is not usable", async () => {
    const { loadCustomerAccount } = await import("./queries")
    await expect(loadCustomerAccount()).resolves.toEqual({ status: "unauthenticated" })
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValueOnce(null)
    await expect(loadCustomerAccount()).resolves.toEqual({ status: "unauthenticated" })
    rpc.mockResolvedValueOnce({ ...account, customerId: "secret" })
    await expect(loadCustomerAccount()).resolves.toEqual({ status: "unavailable" })
    rpc.mockRejectedValueOnce(new Error("database down"))
    await expect(loadCustomerAccount()).resolves.toEqual({ status: "unavailable" })
  })
})
