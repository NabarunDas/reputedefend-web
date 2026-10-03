import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
import { portalEvidenceUpload } from "./upload"
import { portalSessionCookieName } from "@/lib/portal/config"
import type { CustomerEvidenceStorage } from "@/lib/case/storage"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const storageKey = "cases/55555555-5555-4555-8555-555555555555/documents/66666666-6666-4666-8666-666666666666/versions/77777777-7777-4777-8777-777777777777"
const token = "c".repeat(64)

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/portal/evidence`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${portalSessionCookieName()}=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function storage(overrides: Partial<CustomerEvidenceStorage> = {}): CustomerEvidenceStorage {
  return {
    bucket: "test-evidence",
    createUpload: vi.fn(async () => ({
      url: "https://uploads.example/post",
      fields: { key: storageKey, "Content-Type": "application/pdf" },
      expiresSeconds: 300,
      conditions: [],
    })),
    probeObject: vi.fn(async () => ({ exists: true, scan: "PENDING" as const })),
    createReadUrl: vi.fn(async () => "https://uploads.example/get"),
    ...overrides,
  }
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

describe("portal evidence upload", () => {
  it("stays closed when the portal gate is off and does not accept an action-shaped body", async () => {
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect((await portalEvidenceUpload(req({ operation: "begin" }), storage())).status).toBe(404)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    const rejected = await portalEvidenceUpload(req({
      operation: "begin",
      evidenceRequestId: "88888888-8888-4888-8888-888888888888",
      filename: "bill.pdf",
      contentType: "application/pdf",
      size: 1024,
    }), storage())
    expect(rejected.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("returns presigned fields without a storage key or version id of its own", async () => {
    mocks.rpc.mockResolvedValueOnce({
      status: "success",
      storageKey,
      storageBucket: "test-evidence",
      contentType: "application/pdf",
      maxBytes: 10485760,
    })
    const response = await portalEvidenceUpload(req({
      operation: "begin",
      reference: "PR-26-ABCDEF",
      selector: "er-1",
      filename: "bill.pdf",
      contentType: "application/pdf",
      size: 1024,
    }), storage())
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.versionId).toBeUndefined()
    expect(payload.storageKey).toBeUndefined()
    expect(payload.storageBucket).toBeUndefined()
    expect(payload.upload.url).toBe("https://uploads.example/post")
    expect(mocks.rpc.mock.calls[0][0]).toBe("customer_portal_evidence_begin_v1")
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_evidence_request")
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/customerId|caseId/)
  })

  it("keeps a file-constraint failure distinct from a storage failure", async () => {
    const invalid = await portalEvidenceUpload(req({
      operation: "begin",
      reference: "PR-26-ABCDEF",
      selector: "er-1",
      filename: "notes.exe",
      contentType: "application/octet-stream",
      size: 20,
    }), storage())
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ message: expect.stringMatching(/file type and size/) })
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    const conflict = await portalEvidenceUpload(req({
      operation: "begin",
      reference: "PR-26-ABCDEF",
      selector: "er-1",
      filename: "bill.pdf",
      contentType: "application/pdf",
      size: 1024,
    }), storage())
    expect(conflict.status).toBe(409)

    mocks.rpc.mockResolvedValueOnce({
      found: true,
      available: true,
      filename: "bill.pdf",
      storageBucket: "test-evidence",
      storageKey,
      contentType: "application/pdf",
      uploadStatus: "PENDING_UPLOAD",
    }).mockResolvedValueOnce(null)
    const missing = await portalEvidenceUpload(req({
      operation: "finalize",
      reference: "PR-26-ABCDEF",
      selector: "er-1",
    }), storage({ probeObject: vi.fn(async () => ({ exists: false, scan: "PENDING" as const })) }))
    expect(missing.status).toBe(409)
    const missingBody = await missing.json()
    expect(missingBody).toMatchObject({ message: expect.stringMatching(/did not arrive/) })
    expect(JSON.stringify(missingBody)).not.toMatch(/S3|AWS|bucket|supabase|SQL/i)
  })

  it("finalises without telling the customer the file was accepted", async () => {
    mocks.rpc.mockResolvedValueOnce({
      found: true,
      available: true,
      filename: "bill.pdf",
      storageBucket: "test-evidence",
      storageKey,
      contentType: "application/pdf",
      uploadStatus: "PENDING_UPLOAD",
    }).mockResolvedValueOnce({ status: "success" })
    const response = await portalEvidenceUpload(req({
      operation: "finalize",
      reference: "PR-26-ABCDEF",
      selector: "er-1",
    }), storage())
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.message).toMatch(/still needs to be checked/)
    expect(payload.message).not.toMatch(/accepted/i)
    expect(payload).not.toHaveProperty("uploadStatus")
    expect(payload).not.toHaveProperty("versionId")
    expect(mocks.rpc.mock.calls[1][0]).toBe("customer_portal_evidence_finalize_v1")
  })
})
