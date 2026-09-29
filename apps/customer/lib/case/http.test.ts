import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
import { caseEvidenceAccess } from "./http"
import { sessionCookie } from "@/lib/config"
import type { CustomerEvidenceStorage } from "./storage"
import { READ_EXPIRES_SECONDS } from "./model"

const origin = "https://customer.profilerelaunch.com"
const versionId = "77777777-7777-4777-8777-777777777777"
const key = "33333333-3333-4333-8333-333333333333"
const version = {
  versionId,
  documentTitle: "Supporting invoice",
  originalFilename: "invoice.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
  storageBucket: "test-evidence",
  storageKey: "cases/55555555-5555-4555-8555-555555555555/documents/66666666-6666-4666-8666-666666666666/versions/77777777-7777-4777-8777-777777777777",
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/case/evidence/access`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"c".repeat(64)}`, ...headers },
    body: JSON.stringify(body),
  })
}

function storage(overrides: Partial<CustomerEvidenceStorage> = {}): CustomerEvidenceStorage {
  return {
    bucket: "test-evidence",
    createUpload: vi.fn(async () => ({ url: "https://s3.example/post", fields: { key: "cases/x" }, expiresSeconds: 300, conditions: [] })),
    probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })),
    createReadUrl: vi.fn(async () => "https://s3.example/object?X-Amz-Expires=60"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("customer case file access", () => {
  it("rejects caller-supplied case, bucket, email and missing session", async () => {
    const store = storage()
    expect((await caseEvidenceAccess(req({ operation: "view", versionId, caseId: "55555555-5555-4555-8555-555555555555" }), store)).status).toBe(401)
    expect((await caseEvidenceAccess(req({ operation: "view", versionId, storageKey: "cases/x" }), store)).status).toBe(401)
    expect((await caseEvidenceAccess(req({ operation: "view", versionId }, { cookie: "" }), store)).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(store.probeObject).not.toHaveBeenCalled()
  })

  it("returns a 60-second URL only after live GuardDuty and a successful audit re-check", async () => {
    const store = storage()
    mocks.rpc.mockResolvedValueOnce(version).mockResolvedValueOnce({ status: "success", versionId, action: "view" })
    const response = await caseEvidenceAccess(req({ operation: "view", versionId }), store)
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.url).toBe("https://s3.example/object?X-Amz-Expires=60")
    expect(payload.url).toMatch(/X-Amz-Expires=60/)
    expect(READ_EXPIRES_SECONDS).toBe(60)
    expect(store.probeObject).toHaveBeenCalledWith(version.storageKey)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_case_pack_version_v1", "customer_case_pack_access_v1"])
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/X-Amz|presigned|https:\/\/s3/)
  })

  it("fails closed when publication is removed before the audit check", async () => {
    const store = storage()
    mocks.rpc.mockResolvedValueOnce(version).mockResolvedValueOnce({ status: "unavailable" })
    const response = await caseEvidenceAccess(req({ operation: "download", versionId }), store)
    const payload = await response.json()
    expect(response.status).toBe(401)
    expect(payload.url).toBeUndefined()
    expect(payload.message).toMatch(/unavailable or has expired/)
  })

  it("denies DOCX view and allows DOCX download", async () => {
    const store = storage()
    const docx = { ...version, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", originalFilename: "letter.docx" }
    mocks.rpc.mockResolvedValueOnce(docx)
    const viewed = await caseEvidenceAccess(req({ operation: "view", versionId }), store)
    expect(viewed.status).toBe(403)
    expect(JSON.parse(await viewed.text()).url).toBeUndefined()
    expect(store.createReadUrl).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce(docx).mockResolvedValueOnce({ status: "success", action: "download" })
    const downloaded = await caseEvidenceAccess(req({ operation: "download", versionId }), store)
    expect(downloaded.status).toBe(200)
    expect((await downloaded.json()).url).toMatch(/^https:\/\//)
  })

  it("does not mint a URL when the live GuardDuty tag is not clean", async () => {
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan: "THREATS_FOUND" as const })) })
    mocks.rpc.mockResolvedValueOnce(version)
    const response = await caseEvidenceAccess(req({ operation: "view", versionId }), store)
    expect(response.status).toBe(401)
    expect(store.createReadUrl).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_case_pack_version_v1"])
  })
})
