import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
const jar = new Map<string, string>()
const headerPath = { value: "" }

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => name === "x-customer-pathname" ? headerPath.value : null }),
  cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined }),
}))

vi.mock("@/lib/backend", () => ({
  validToken: (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token),
  tokenHash: (token: string) => createHash("sha256").update(token).digest("hex"),
  backend: () => ({ rpc }),
}))

import { displayedAccountName, isCustomerPortalPath, loadPortalHeaderName } from "./header"
import { withAccountRequest } from "./request-scope"

const token = "b".repeat(64)
const other = "c".repeat(64)

describe("portal header name", () => {
  beforeEach(() => {
    jar.clear()
    headerPath.value = ""
    rpc.mockReset()
  })

  it("uses only a portal path and the session account name", async () => {
    expect(isCustomerPortalPath("/")).toBe(false)
    expect(isCustomerPortalPath("/portal")).toBe(true)
    expect(displayedAccountName(false, "Aarshav Das")).toBeNull()
    expect(displayedAccountName(true, "Aarshav Das")).toBe("Aarshav Das")
    expect(displayedAccountName(true, "  ")).toBe("My account")
    expect(displayedAccountName(true, null)).toBe("My account")

    headerPath.value = "/"
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue({ name: "Aarshav Das", email: "aarshav@example.com", emailVerified: true, phoneVerified: false })
    await expect(loadPortalHeaderName()).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()

    headerPath.value = "/portal/documents"
    await expect(loadPortalHeaderName()).resolves.toBe("Aarshav Das")
    expect(rpc).toHaveBeenCalledWith("customer_portal_account_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/businessName|customerId|p_email/)

    jar.set("pr-portal-dev", other)
    rpc.mockResolvedValue({ name: "Mina Cole", email: "mina@example.com", emailVerified: true, phoneVerified: false })
    await expect(loadPortalHeaderName()).resolves.toBe("Mina Cole")
    expect(rpc).toHaveBeenLastCalledWith("customer_portal_account_v1", {
      p_token_hash: createHash("sha256").update(other).digest("hex"),
    })
  })

  it("reads the account projection once when a dashboard request renders the greeting", async () => {
    headerPath.value = "/portal"
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue({ name: "Aarshav Das", email: "aarshav@example.com", emailVerified: true, phoneVerified: false })

    await loadPortalHeaderName()
    await loadPortalHeaderName()
    expect(rpc).toHaveBeenCalledTimes(2)

    rpc.mockClear()
    await withAccountRequest({ type: "request" }, async () => {
      const [fromLayout, fromDashboard] = await Promise.all([loadPortalHeaderName(), loadPortalHeaderName()])
      expect(fromLayout).toBe("Aarshav Das")
      expect(fromDashboard).toBe("Aarshav Das")
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("customer_portal_account_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    })

    jar.set("pr-portal-dev", other)
    rpc.mockClear()
    rpc.mockResolvedValue({ name: "Mina Cole", email: "mina@example.com", emailVerified: true, phoneVerified: false })
    await withAccountRequest({ type: "request" }, async () => {
      await expect(loadPortalHeaderName()).resolves.toBe("Mina Cole")
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenLastCalledWith("customer_portal_account_v1", {
      p_token_hash: createHash("sha256").update(other).digest("hex"),
    })
  })

  it("falls back when the session cannot produce a name", async () => {
    headerPath.value = "/portal"
    await expect(loadPortalHeaderName()).resolves.toBe("My account")
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue(null)
    await expect(loadPortalHeaderName()).resolves.toBe("My account")
    rpc.mockRejectedValue(new Error("database down"))
    await expect(loadPortalHeaderName()).resolves.toBe("My account")
  })
})
