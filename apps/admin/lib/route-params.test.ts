import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
const notFoundError = new Error("NEXT_NOT_FOUND")
const redirectError = new Error("NEXT_REDIRECT")

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "a".repeat(64) }) }) }))
vi.mock("next/navigation", () => ({
  notFound: () => { throw notFoundError },
  redirect: () => { throw redirectError },
}))
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("../require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/auth/backend", () => ({ tokenHash: (token: string) => `hash:${token}`, backend: () => ({ rpc }) }))
vi.mock("../auth/backend", () => ({ tokenHash: (token: string) => `hash:${token}`, backend: () => ({ rpc }) }))

import { getCase } from "./cases/queries"
import { getCaseAuthorization } from "./authorization/queries"
import { getEnquiry } from "./enquiries/queries"
import { getEvidenceCase } from "./evidence/queries"
import { getPreparedPackCase } from "./packs/queries"
import { loadGuardAlert } from "./guard/alerts-queries"
import { loadGuardCheck } from "./guard/checks-queries"
import { recordDetail } from "./records/queries"

/**
 * Every Admin page with a dynamic segment passes that segment straight to a
 * loader. The database parameters are typed `uuid`, so a loader that forwards a
 * malformed value raises a cast error and the operator gets a failure page
 * instead of a 404. These loaders must therefore decide before the round trip.
 */
const malformed = ["", " ", "new", "../../etc/passwd", "1 OR 1=1", "%00", "null", "undefined", "../cases", "<script>", "a".repeat(64)]

const loaders: Array<[string, (value: string) => Promise<unknown>]> = [
  ["case detail", id => getCase(id)],
  ["case authorization", id => getCaseAuthorization(id)],
  ["enquiry detail", id => getEnquiry(id)],
  ["evidence workspace", id => getEvidenceCase(id)],
  ["prepared pack workspace", id => getPreparedPackCase(id)],
  ["record detail", id => recordDetail("client", id)],
  ["guard alert detail", id => loadGuardAlert(id)],
  ["guard check detail", id => loadGuardCheck(id)],
]

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", "https://admin.profilerelaunch.com")
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  rpc.mockReset()
  rpc.mockResolvedValue({ missing: true })
})
afterEach(() => vi.unstubAllEnvs())

describe("malformed dynamic route parameters", () => {
  it.each(loaders)("%s never sends a malformed identifier to the database", async (_label, load) => {
    for (const value of malformed) {
      rpc.mockClear()
      // Either a clean 404 or a typed "no such record" result is acceptable.
      // Reaching the database with a non-uuid is not.
      await load(value).catch(error => {
        expect(error).toBe(notFoundError)
      })
      expect(rpc).not.toHaveBeenCalled()
    }
  })

  it("still loads a well-formed identifier", async () => {
    const id = "55555555-5555-4555-8555-555555555555"
    rpc.mockResolvedValue({ status: "success", alert: { id } })
    expect(await loadGuardAlert(id)).toMatchObject({ alert: { id } })
    expect(rpc).toHaveBeenCalledWith("admin_guard_alert_detail_v1", { p_token: `hash:${"a".repeat(64)}`, p_alert: id })
  })

  it("reports an unknown guard check as absent rather than as a failure", async () => {
    rpc.mockReset()
    rpc.mockResolvedValue({ status: "invalid" })
    const known = await loadGuardCheck("55555555-5555-4555-8555-555555555555")
    expect(known.obligation).toBeUndefined()
    rpc.mockClear()
    const malformedResult = await loadGuardCheck("not-a-uuid")
    expect(malformedResult.obligation).toBeUndefined()
    expect(rpc).not.toHaveBeenCalled()
  })
})
