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
const selector = `mc-${"ab".repeat(32)}`
const at = "2026-09-04T12:00:00Z"
const page = {
  threads: [],
  complete: true,
}
const detail = {
  found: true,
  thread: {
    selector,
    subject: "About your case",
    activityAt: at,
    state: "Open conversation",
    preview: "Plain update.",
    entries: [{ role: "ProfileRelaunch", at, body: "Plain update.", delivery: "Delivered by email" }],
    complete: true,
  },
}

describe("customer portal message loaders", () => {
  beforeEach(() => {
    jar.clear()
    rpc.mockReset()
  })

  it("hashes the portal cookie and does not send a customer id", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue(page)
    const { loadCustomerMessages } = await import("./queries")
    await expect(loadCustomerMessages({ before: null, selector: null })).resolves.toEqual({
      status: "ready",
      page: { threads: [], complete: true, nextCursor: null },
    })
    expect(rpc).toHaveBeenCalledWith("customer_portal_messages_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
      p_before_time: null,
      p_before_selector: null,
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/customerId|p_customer|authUser/)
  })

  it("treats a null row as signed out and a bad payload as unavailable", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValueOnce(null)
    const { loadCustomerMessages, loadCustomerMessage } = await import("./queries")
    await expect(loadCustomerMessages({ before: null, selector: null })).resolves.toEqual({ status: "unauthenticated" })
    rpc.mockResolvedValueOnce({ threads: [{ selector }], complete: true })
    await expect(loadCustomerMessages({ before: null, selector: null })).resolves.toEqual({ status: "unavailable" })
    rpc.mockResolvedValueOnce({ found: false })
    await expect(loadCustomerMessage(selector)).resolves.toEqual({ status: "not_found" })
    rpc.mockRejectedValueOnce(new Error("database down"))
    await expect(loadCustomerMessage(selector)).resolves.toEqual({ status: "unavailable" })
  })

  it("sends only the opaque selector when opening one thread", async () => {
    jar.set("pr-portal-dev", token)
    rpc.mockResolvedValue(detail)
    const { loadCustomerMessage } = await import("./queries")
    const loaded = await loadCustomerMessage(selector)
    expect(loaded.status).toBe("ready")
    expect(rpc).toHaveBeenCalledWith("customer_portal_message_v1", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
      p_selector: selector,
    })
  })

  it("does not call the database without a portal cookie", async () => {
    const { loadCustomerMessages } = await import("./queries")
    await expect(loadCustomerMessages({ before: at, selector })).resolves.toEqual({ status: "unauthenticated" })
    expect(rpc).not.toHaveBeenCalled()
  })
})
