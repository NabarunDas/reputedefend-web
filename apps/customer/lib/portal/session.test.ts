import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ rpc: vi.fn(), cookie: "" }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: state.rpc }),
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }),
}))
import { getPortalSession, portalSessionFromToken } from "./session"

const origin = "https://customer.profilerelaunch.com"
const token = "a".repeat(64)
const session = {
  customerId: "22222222-2222-4222-8222-222222222222",
  authUserId: "66666666-6666-4666-8666-666666666666",
  email: "alex@example.com",
  authenticatedAt: "2026-10-03T12:00:00.000Z",
  expiresAt: "2026-10-03T20:00:00.000Z",
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  state.rpc.mockReset()
  state.cookie = ""
})
afterEach(() => vi.unstubAllEnvs())

describe("portal session lookup", () => {
  it("returns null for a missing, malformed, or database-rejected token without throwing", async () => {
    expect(await portalSessionFromToken(undefined)).toBeNull()
    expect(await portalSessionFromToken("not-a-token")).toBeNull()
    state.rpc.mockResolvedValue(null)
    expect(await portalSessionFromToken(token)).toBeNull()
    state.rpc.mockRejectedValue(new Error("relation customer_portal_sessions does not exist"))
    expect(await portalSessionFromToken(token)).toBeNull()
    expect(state.rpc).toHaveBeenCalledWith("customer_portal_session_v1", expect.any(Object))
    expect(state.rpc).not.toHaveBeenCalledWith("customer_action_session_v1", expect.anything())
  })

  it("returns only the server projection and ignores a closed gate", async () => {
    state.rpc.mockResolvedValue({ ...session, businessId: "secret" })
    await expect(portalSessionFromToken(token)).resolves.toEqual(session)
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false")
    await expect(portalSessionFromToken(token)).resolves.toEqual(session)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect(await portalSessionFromToken(token)).toBeNull()
  })

  it("reads the portal cookie for the server page gate", async () => {
    state.cookie = token
    state.rpc.mockResolvedValue(session)
    await expect(getPortalSession()).resolves.toEqual(session)
  })
})
