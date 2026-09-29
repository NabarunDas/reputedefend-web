import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
import { caseEvidenceUpload } from "./upload"
import { sessionCookie } from "@/lib/config"
import { MAX_EVIDENCE_BYTES, UPLOAD_EXPIRES_SECONDS } from "./model"
import type { CustomerEvidenceStorage } from "./storage"

const origin = "https://customer.profilerelaunch.com"
const requestId = "88888888-8888-4888-8888-888888888888"
const versionId = "77777777-7777-4777-8777-777777777777"
const key = "33333333-3333-4333-8333-333333333333"
const storageKey = "cases/55555555-5555-4555-8555-555555555555/documents/66666666-6666-4666-8666-666666666666/versions/77777777-7777-4777-8777-777777777777"
const beginBody = {
  operation: "begin",
  evidenceRequestId: requestId,
  filename: "bill.pdf",
  contentType: "application/pdf",
  size: 1024,
}
const version = {
  documentId: "66666666-6666-4666-8666-666666666666",
  versionId,
  evidenceRequestId: requestId,
  storageBucket: "test-evidence",
  storageKey,
  contentType: "application/pdf",
  sizeBytes: 1024,
  uploadStatus: "PENDING_UPLOAD",
  submissionSource: "CUSTOMER",
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/case/evidence/upload`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"c".repeat(64)}`, ...headers },
    body: JSON.stringify(body),
  })
}

function storage(overrides: Partial<CustomerEvidenceStorage> = {}): CustomerEvidenceStorage {
  return {
    bucket: "test-evidence",
    createUpload: vi.fn(async ({ key: objectKey, contentType }) => ({
      url: "https://s3.example/post",
      fields: { key: objectKey, "Content-Type": contentType },
      expiresSeconds: 300,
      conditions: [["eq", "$key", objectKey], ["eq", "$Content-Type", contentType], ["content-length-range", 1, MAX_EVIDENCE_BYTES]],
    })),
    probeObject: vi.fn(async () => ({ exists: true, scan: "PENDING" as const })),
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

describe("customer evidence upload HTTP", () => {
  it("rejects caller-supplied case, storage, identity and unknown fields", async () => {
    const store = storage()
    expect((await caseEvidenceUpload(req({ ...beginBody, caseId: "55555555-5555-4555-8555-555555555555" }), store)).status).toBe(401)
    expect((await caseEvidenceUpload(req({ ...beginBody, storageKey: "cases/x" }), store)).status).toBe(401)
    expect((await caseEvidenceUpload(req({ ...beginBody, storageBucket: "other" }), store)).status).toBe(401)
    expect((await caseEvidenceUpload(req({ ...beginBody, email: "alex@example.com" }), store)).status).toBe(401)
    expect((await caseEvidenceUpload(req({ ...beginBody, customerId: "22222222-2222-4222-8222-222222222222" }), store)).status).toBe(401)
    expect((await caseEvidenceUpload(req({ ...beginBody, businessId: "33333333-3333-4333-8333-333333333333" }), store)).status).toBe(401)
    expect((await caseEvidenceUpload(req({ ...beginBody, extra: true }), store)).status).toBe(401)
    expect((await caseEvidenceUpload(req({ operation: "finalize", versionId, caseId: "55555555-5555-4555-8555-555555555555" }), store)).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(store.createUpload).not.toHaveBeenCalled()
  })

  it("rejects unsupported MIME, extension mismatch, zero-byte and oversized files", async () => {
    const store = storage()
    expect((await caseEvidenceUpload(req({ ...beginBody, contentType: "application/zip", filename: "bill.zip" }), store)).status).toBe(400)
    expect((await caseEvidenceUpload(req({ ...beginBody, filename: "bill.png" }), store)).status).toBe(400)
    expect((await caseEvidenceUpload(req({ ...beginBody, size: 0 }), store)).status).toBe(400)
    expect((await caseEvidenceUpload(req({ ...beginBody, size: MAX_EVIDENCE_BYTES + 1 }), store)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("mints a constrained presigned POST without returning storageKey as a normal field", async () => {
    const store = storage()
    mocks.rpc.mockResolvedValueOnce({ status: "success", versionId }).mockResolvedValueOnce(version)
    const response = await caseEvidenceUpload(req(beginBody), store)
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.versionId).toBe(versionId)
    expect(payload.maxBytes).toBe(MAX_EVIDENCE_BYTES)
    expect(payload.upload).toEqual({
      url: "https://s3.example/post",
      fields: { key: storageKey, "Content-Type": "application/pdf" },
      expiresSeconds: UPLOAD_EXPIRES_SECONDS,
    })
    expect(payload.storageKey).toBeUndefined()
    expect(payload.caseId).toBeUndefined()
    expect(store.createUpload).toHaveBeenCalledWith({ key: storageKey, contentType: "application/pdf" })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/X-Amz|presigned|https:\/\/s3/)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_evidence_begin_v1", "customer_evidence_upload_version_v1"])
  })

  it("does not finalize when the object is missing", async () => {
    const store = storage({ probeObject: vi.fn(async () => ({ exists: false, scan: "PENDING" as const })) })
    mocks.rpc.mockResolvedValueOnce(version)
    const response = await caseEvidenceUpload(req({ operation: "finalize", versionId }), store)
    expect(response.status).toBe(409)
    expect(store.createReadUrl).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_evidence_upload_version_v1"])
  })

  it("finalizes only after the object is present and keeps scan pending", async () => {
    const store = storage()
    mocks.rpc.mockResolvedValueOnce(version).mockResolvedValueOnce({
      status: "success", uploadStatus: "UPLOADED", scanStatus: "PENDING", validationStatus: "PENDING",
    })
    const response = await caseEvidenceUpload(req({ operation: "finalize", versionId }), store)
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      message: "Uploaded — awaiting security review",
      versionId,
      uploadStatus: "UPLOADED",
      scanStatus: "PENDING",
      validationStatus: "PENDING",
    })
    expect(payload.storageKey).toBeUndefined()
    expect(store.probeObject).toHaveBeenCalledWith(storageKey)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["customer_evidence_upload_version_v1", "customer_evidence_finalize_v1"])
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/X-Amz|presigned|https:\/\/s3/)
  })
})
