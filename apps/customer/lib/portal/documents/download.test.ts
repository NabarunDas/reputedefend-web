import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
import { portalDocumentDownload } from "./download"
import { portalSessionCookieName } from "@/lib/portal/config"
import type { CustomerEvidenceStorage } from "@/lib/case/storage"

const origin = "https://customer.profilerelaunch.com"
const storageKey = "cases/55555555-5555-4555-8555-555555555555/documents/66666666-6666-4666-8666-666666666666/versions/77777777-7777-4777-8777-777777777777"
const token = "c".repeat(64)
const signed = "https://uploads.example/letter.pdf?X-Amz-Expires=60&X-Amz-Signature=abc"

function req(query = "reference=PR-26-ABCDEF&selector=pd-1", cookie = `${portalSessionCookieName()}=${token}`) {
  return new NextRequest(`${origin}/api/portal/documents/download?${query}`, {
    headers: cookie ? { cookie } : {},
  })
}

function storage(overrides: Partial<CustomerEvidenceStorage> = {}): CustomerEvidenceStorage {
  return {
    bucket: "test-evidence",
    createUpload: vi.fn(),
    probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })),
    createReadUrl: vi.fn(async () => signed),
    ...overrides,
  }
}

const resolved = {
  found: true,
  available: true,
  filename: "letter.pdf",
  contentType: "application/pdf",
  storageBucket: "test-evidence",
  storageKey,
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("portal document download", () => {
  it("rechecks eligibility at download time and redirects only when the file is still published", async () => {
    mocks.rpc.mockResolvedValueOnce(resolved).mockResolvedValueOnce({ status: "success" })
    const response = await portalDocumentDownload(req(), storage())
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(signed)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_document_resolve_v1",
      "customer_portal_document_access_v1",
    ])
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_reference: "PR-26-ABCDEF", p_selector: "pd-1" })
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_version")
  })

  it("refuses a stale or unpublished document and a missing case the same way to the customer", async () => {
    mocks.rpc.mockResolvedValueOnce({ found: true, available: false })
    const stale = await portalDocumentDownload(req(), storage())
    const staleText = await stale.text()
    expect(stale.status).toBe(404)
    expect(staleText).toMatch(/no longer available/)
    expect(staleText).not.toMatch(/unpublished|bucket|storage/i)

    mocks.rpc.mockResolvedValueOnce({ found: false })
    const missing = await portalDocumentDownload(req("reference=PR-26-ZZZZZ9&selector=pd-1"), storage())
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe(staleText)
  })

  it("asks a signed-out customer to sign in and does not use a storage key from the query", async () => {
    const signedOut = await portalDocumentDownload(req("reference=PR-26-ABCDEF&selector=pd-1", ""))
    expect(signedOut.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    const keyed = await portalDocumentDownload(req(`reference=PR-26-ABCDEF&selector=pd-1&key=${storageKey}`))
    expect(keyed.status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
