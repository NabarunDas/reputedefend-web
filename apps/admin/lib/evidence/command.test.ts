import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/evidence/command/route"
import { runEvidenceCommand, retrieveCleanEvidence } from "./command"
import { sessionCookie } from "@/lib/auth/config"
import { declaredUpload, evidenceArgs } from "./validation"
import { MAX_EVIDENCE_BYTES, UPLOAD_EXPIRES_SECONDS, isOpaqueEvidenceKey, mayRetrieveBytes, READ_EXPIRES_SECONDS } from "./model"
import { contentDisposition, presignedPostInput, signedUrlExpiresSeconds } from "./storage"
import type { EvidenceStorage, ObjectProbe, PresignedUpload } from "./storage"
import type { EvidenceVersion } from "./model"

const origin = "https://admin.profilerelaunch.com"
const caseId = "55555555-5555-4555-8555-555555555555"
const otherCase = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const documentId = "66666666-6666-4666-8666-666666666666"
const versionId = "77777777-7777-4777-8777-777777777777"
const key = "33333333-3333-4333-8333-333333333333"
const storageKey = `cases/${caseId}/documents/${documentId}/versions/${versionId}`
const beginBody = {
  operation: "begin" as const,
  caseId,
  documentId: null,
  filename: "invoice.pdf",
  contentType: "application/pdf",
  size: 1024,
  title: "Supporting invoice",
  evidenceRequestId: null,
}
const versionBody = { operation: "finalize" as const, caseId, versionId }
const version: EvidenceVersion = {
  documentId, versionId, versionNumber: 1, storageKey, storageBucket: "test-evidence",
  uploadStatus: "PENDING_UPLOAD", scanStatus: "PENDING", validationStatus: "PENDING",
  contentType: "application/pdf", sizeBytes: 1024, customerVisible: false,
  originalFilename: "invoice.pdf", recordVersion: 1, reviewStatus: "UNREVIEWED",
}

function upload(overrides: Partial<PresignedUpload> = {}): PresignedUpload {
  const policy = presignedPostInput(storageKey, "application/pdf")
  return {
    url: "https://s3.eu-west-2.amazonaws.com/test-evidence",
    fields: { key: storageKey, "Content-Type": "application/pdf", Policy: "cG9saWN5", "X-Amz-Signature": "sig" },
    expiresSeconds: policy.Expires,
    conditions: policy.Conditions,
    ...overrides,
  }
}

function storage(overrides: Partial<EvidenceStorage> = {}): EvidenceStorage {
  return {
    bucket: "test-evidence",
    createUpload: vi.fn(async () => upload()),
    probeObject: vi.fn(async (): Promise<ObjectProbe> => ({ exists: true, scan: "PENDING" })),
    readScannedObject: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
    createReadUrl: vi.fn(async () => "https://s3.eu-west-2.amazonaws.com/test-evidence/object?X-Amz-Expires=60&X-Amz-Signature=sig"),
    ...overrides,
  }
}

function req(body: unknown = beginBody, headers: Record<string, string> = {}, path = "/api/evidence/command") {
  return new NextRequest(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("evidence commands without proxy", () => {
  it("rejects unauthenticated upload intent and malformed sessions", async () => {
    expect((await POST(req(beginBody, { cookie: "" }))).status).toBe(401)
    expect((await POST(req(beginBody, { cookie: `${sessionCookie}=short` }))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects the wrong Origin", async () => {
    expect((await POST(req(beginBody, { origin: "https://evil.example" }))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects invalid content type, missing idempotency key and oversized JSON", async () => {
    expect((await POST(req(beginBody, { "content-type": "text/plain" }))).status).toBe(415)
    expect((await POST(req(beginBody, { "idempotency-key": "" }))).status).toBe(400)
    expect((await POST(req("x".repeat(32769)))).status).toBe(413)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("fails closed when AWS storage is not configured and never uses access keys", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAEXAMPLE")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret")
    vi.stubEnv("AWS_REGION", "eu-west-2")
    vi.stubEnv("AWS_EVIDENCE_BUCKET", "evidence-test-bucket-01")
    vi.stubEnv("AWS_EVIDENCE_ROLE_ARN", "arn:aws:iam::123456789012:role/AdminEvidenceTestRole")
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toMatch(/AKIAEXAMPLE|secret|337909767363/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects unknown cases after session checks", async () => {
    mocks.rpc.mockResolvedValue({ status: "conflict" })
    const response = await runEvidenceCommand(req(), storage())
    expect(response.status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_evidence_begin_v1", expect.objectContaining({
      p_case: caseId, p_token: expect.stringMatching(/^[a-f0-9]{64}$/), p_request: key, p_bucket: "test-evidence",
    }))
    expect(mocks.rpc.mock.calls[0][1].p_token).not.toBe("a".repeat(64))
  })
  it("rejects invalid Admin sessions at the database", async () => {
    mocks.rpc.mockResolvedValue({ status: "unauthorized" })
    expect((await runEvidenceCommand(req(), storage())).status).toBe(401)
  })
  it.each([
    ["file >10 MB", { ...beginBody, size: MAX_EVIDENCE_BYTES + 1 }],
    ["zero-byte", { ...beginBody, size: 0 }],
    ["unsupported extension", { ...beginBody, filename: "notes.doc", contentType: "application/msword" }],
    ["rejected executable", { ...beginBody, filename: "notes.exe", contentType: "application/pdf" }],
    ["unsupported MIME", { ...beginBody, filename: "notes.pdf", contentType: "application/zip" }],
    ["extension/MIME mismatch", { ...beginBody, filename: "notes.pdf", contentType: "image/jpeg" }],
    ["forged actor", { ...beginBody, actor: "admin" }],
    ["forged operation", { ...beginBody, operation: "__proto__" }],
  ])("rejects %s", async (_label, body) => {
    expect((await runEvidenceCommand(req(body), storage())).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("returns a five-minute presigned POST bound to the opaque key and declared type", async () => {
    const store = storage()
    mocks.rpc.mockResolvedValue({ status: "success", documentId, versionId, versionNumber: 1, storageKey, contentType: "application/pdf" })
    const response = await runEvidenceCommand(req(), store)
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(isOpaqueEvidenceKey(payload.storageKey, beginBody.filename)).toBe(true)
    expect(payload.storageKey).not.toContain("invoice")
    expect(payload.storageKey).not.toContain(beginBody.filename)
    expect(payload.upload.expiresSeconds).toBeLessThanOrEqual(UPLOAD_EXPIRES_SECONDS)
    expect(payload.maxBytes).toBe(MAX_EVIDENCE_BYTES)
    expect(store.createUpload).toHaveBeenCalledWith({ key: storageKey, contentType: "application/pdf" })
    const policy = presignedPostInput(storageKey, "application/pdf")
    expect(policy.Expires).toBeLessThanOrEqual(300)
    expect(policy.Conditions).toEqual(expect.arrayContaining([
      ["eq", "$key", storageKey],
      ["eq", "$Content-Type", "application/pdf"],
      ["content-length-range", 1, MAX_EVIDENCE_BYTES],
    ]))
  })
  it("replays a committed begin without minting a second version", async () => {
    const store = storage()
    mocks.rpc.mockResolvedValue({ status: "success", documentId, versionId, versionNumber: 1, storageKey, contentType: "application/pdf" })
    expect((await runEvidenceCommand(req(), store)).status).toBe(200)
    expect((await runEvidenceCommand(req(), store)).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(store.createUpload).toHaveBeenCalledTimes(2)
  })
  it("rejects cross-case document access without exposing metadata", async () => {
    mocks.rpc.mockResolvedValue({ missing: true })
    const response = await runEvidenceCommand(req({ ...versionBody, caseId: otherCase }), storage())
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain(storageKey)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_evidence_version_v1", expect.objectContaining({ p_case: otherCase, p_version: versionId }))
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_evidence_finalize_v1")).toBe(false)
  })
  it("rejects finalize when the object is unknown", async () => {
    mocks.rpc.mockResolvedValue(version)
    const store = storage({ probeObject: vi.fn(async () => ({ exists: false, scan: "PENDING" as const }) ) })
    const response = await runEvidenceCommand(req(versionBody), store)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ message: "The uploaded file was not found. Ask for a new upload link and try again." })
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_evidence_version_v1"])
  })
  it("maps S3 AccessDenied to a generic 503 and does not treat it as missing", async () => {
    mocks.rpc.mockResolvedValue(version)
    const denied = Object.assign(new Error("User: arn:aws:sts::123456789012:assumed-role/AdminEvidenceTestRole is not authorized to perform: s3:GetObjectTagging on resource: arn:aws:s3:::prod-evidence-bucket"), { name: "AccessDenied", Code: "AccessDenied" })
    const store = storage({ probeObject: vi.fn(async () => { throw denied }) })
    const response = await runEvidenceCommand(req(versionBody), store)
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(text).not.toMatch(/AccessDenied|AdminEvidenceTestRole|prod-evidence-bucket|GetObjectTagging|123456789012|oidc/i)
    expect(store.probeObject).toHaveBeenCalledWith(storageKey)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_evidence_version_v1"])
  })
  it("maps generic AWS provider failures to a generic 503", async () => {
    mocks.rpc.mockResolvedValue(version)
    const store = storage({ probeObject: vi.fn(async () => { throw new Error("SlowDown throttling from s3.eu-west-2.amazonaws.com for role arn:aws:iam::123456789012:role/AdminEvidenceTestRole") }) })
    const response = await runEvidenceCommand(req({ operation: "refresh_scan", caseId, versionId }), store)
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(text).not.toMatch(/SlowDown|s3\.eu-west-2|AdminEvidenceTestRole|123456789012|throttling/i)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_evidence_version_v1"])
  })
  it("fails closed when the stored bucket does not match this environment", async () => {
    mocks.rpc.mockResolvedValue({ ...version, storageBucket: "other-evidence-bucket" })
    const store = storage()
    const response = await runEvidenceCommand(req(versionBody), store)
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(text).not.toMatch(/test-evidence|other-evidence-bucket/)
    expect(store.probeObject).not.toHaveBeenCalled()
    expect(store.readScannedObject).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_evidence_version_v1"])
  })
  it("finalizes only after GetObjectTagging confirms the key", async () => {
    mocks.rpc.mockResolvedValueOnce(version).mockResolvedValueOnce({ status: "success", uploadStatus: "UPLOADED", scanStatus: "PENDING", validationStatus: "PENDING" })
    const store = storage()
    const payload = await (await runEvidenceCommand(req(versionBody), store)).json()
    expect(store.probeObject).toHaveBeenCalledWith(storageKey)
    expect(store.readScannedObject).not.toHaveBeenCalled()
    expect(payload).toMatchObject({ uploadStatus: "UPLOADED", scanStatus: "PENDING", validationStatus: "PENDING" })
  })
  it("keeps scan PENDING when GuardDuty has not tagged the object", async () => {
    mocks.rpc.mockResolvedValueOnce({ ...version, uploadStatus: "UPLOADED" }).mockResolvedValueOnce({ status: "success", scanStatus: "PENDING", validationStatus: "PENDING" })
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan: "PENDING" as const })) })
    const payload = await (await runEvidenceCommand(req({ operation: "refresh_scan", caseId, versionId }), store)).json()
    expect(store.readScannedObject).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls[1]).toEqual(["admin_evidence_refresh_scan_v1", expect.objectContaining({ p_scan: "PENDING", p_validation: "PENDING", p_validation_error: null })])
    expect(payload).toMatchObject({ scanStatus: "PENDING", validationStatus: "PENDING" })
  })
  it.each(["THREATS_FOUND", "FAILED", "UNSUPPORTED", "ACCESS_DENIED"] as const)("keeps %s blocked and never reads bytes", async (scan) => {
    mocks.rpc.mockResolvedValueOnce({ ...version, uploadStatus: "UPLOADED" }).mockResolvedValueOnce({ status: "success", scanStatus: scan, validationStatus: "PENDING" })
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan })) })
    const payload = await (await runEvidenceCommand(req({ operation: "refresh_scan", caseId, versionId }), store)).json()
    expect(store.readScannedObject).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_scan: scan, p_validation: "PENDING" })
    expect(payload.scanStatus).toBe(scan)
    expect(mayRetrieveBytes(scan, "PENDING")).toBe(false)
  })
  it("maps NO_THREATS_FOUND and validates bytes only after a clean scan", async () => {
    mocks.rpc.mockResolvedValueOnce({ ...version, uploadStatus: "UPLOADED" }).mockResolvedValueOnce({ status: "success", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID" })
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })) })
    const payload = await (await runEvidenceCommand(req({ operation: "refresh_scan", caseId, versionId }), store)).json()
    expect(store.readScannedObject).toHaveBeenCalledWith(storageKey)
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_scan: "NO_THREATS_FOUND", p_validation: "VALID", p_validation_error: null })
    expect(payload).toMatchObject({ scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID" })
  })
  it("does not retrieve bytes for later download helpers unless the file is clean, valid and in the configured bucket", async () => {
    const store = storage()
    expect(await retrieveCleanEvidence(store, { ...version, scanStatus: "THREATS_FOUND", validationStatus: "PENDING" })).toBeNull()
    expect(await retrieveCleanEvidence(store, { ...version, scanStatus: "NO_THREATS_FOUND", validationStatus: "INVALID" })).toBeNull()
    expect(await retrieveCleanEvidence(store, { ...version, scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", storageBucket: "other-evidence-bucket" })).toBeNull()
    expect(store.readScannedObject).not.toHaveBeenCalled()
    expect(await retrieveCleanEvidence(store, { ...version, scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID" })).toBeInstanceOf(Uint8Array)
    expect(store.readScannedObject).toHaveBeenCalledTimes(1)
  })
  it("hides raw provider details", async () => {
    mocks.rpc.mockRejectedValue(new Error("oidc token"))
    const response = await runEvidenceCommand(req(), storage())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("oidc token")
  })
})

describe("declared upload validation", () => {
  it("accepts only the documented types and sizes", () => {
    expect(declaredUpload("file.pdf", "application/pdf", 1)).not.toBeNull()
    expect(declaredUpload("file.pdf", "application/pdf", MAX_EVIDENCE_BYTES)).not.toBeNull()
    expect(declaredUpload("file.pdf", "application/pdf", 0)).toBeNull()
    expect(declaredUpload("file.pdf", "application/pdf", MAX_EVIDENCE_BYTES + 1)).toBeNull()
    expect(evidenceArgs("begin", { ...beginBody, bucket: "other" })).toBeNull()
    expect(evidenceArgs("begin", { ...beginBody, storageKey: "cases/x" })).toBeNull()
  })
})

const requestBody = { operation: "create_request" as const, caseId, title: "Bank statements", requestText: "Please upload the latest statements.", dueAt: null }
const reviewBody = { operation: "accept" as const, caseId, versionId, recordVersion: 3, note: "Accepted after a clean scan." }
const viewBody = { operation: "view" as const, caseId, versionId }
const cleanVersion: EvidenceVersion = {
  ...version, uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", recordVersion: 3,
}

describe("evidence requests and review without S3", () => {
  it("creates an evidence request without AWS storage", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: "88888888-8888-4888-8888-888888888888", version: 1, requestStatus: "OPEN" })
    const response = await runEvidenceCommand(req(requestBody), null)
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ requestStatus: "OPEN" })
    expect(JSON.stringify(payload)).not.toMatch(/smtp|resend/i)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_evidence_request_v1", expect.objectContaining({ p_operation: "create", p_case: caseId, p_title: "Bank statements" }))
  })
  it("replays a matching request create", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: "88888888-8888-4888-8888-888888888888", version: 1, requestStatus: "OPEN" })
    expect((await runEvidenceCommand(req(requestBody), null)).status).toBe(200)
    expect((await runEvidenceCommand(req(requestBody), null)).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })
  it("maps version conflicts and cross-case denials without metadata", async () => {
    mocks.rpc.mockResolvedValue({ status: "conflict" })
    const response = await runEvidenceCommand(req({ operation: "fulfill_request", caseId: otherCase, requestId: "88888888-8888-4888-8888-888888888888", version: 1, note: "Completed from the other case files." }), null)
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain("storage")
  })
  it("accepts a clean version without calling S3", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: versionId, reviewStatus: "ACCEPTED", customerVisible: false, recordVersion: 4 })
    const response = await runEvidenceCommand(req(reviewBody), null)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_evidence_review_v1", expect.objectContaining({ p_operation: "accept", p_expected: 3, p_visible: null }))
    expect(await response.json()).toMatchObject({ reviewStatus: "ACCEPTED", customerVisible: false })
  })
})

describe("secure evidence access", () => {
  it("blocks view when the database scan is still pending", async () => {
    mocks.rpc.mockResolvedValue({ ...version, uploadStatus: "UPLOADED" })
    const store = storage()
    const response = await runEvidenceCommand(req(viewBody), store)
    expect(response.status).toBe(403)
    expect(store.createReadUrl).not.toHaveBeenCalled()
    expect(store.probeObject).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_evidence_version_v1"])
  })
  it.each(["THREATS_FOUND", "FAILED"] as const)("blocks %s before minting a URL", async (scan) => {
    mocks.rpc.mockResolvedValue({ ...cleanVersion, scanStatus: scan, validationStatus: "PENDING" })
    const store = storage()
    expect((await runEvidenceCommand(req(viewBody), store)).status).toBe(403)
    expect(store.createReadUrl).not.toHaveBeenCalled()
  })
  it("blocks invalid content even after a clean scan", async () => {
    mocks.rpc.mockResolvedValue({ ...cleanVersion, validationStatus: "INVALID" })
    const store = storage()
    expect((await runEvidenceCommand(req(viewBody), store)).status).toBe(403)
    expect(store.probeObject).not.toHaveBeenCalled()
  })
  it("rechecks the live GuardDuty tag and blocks a missing tag", async () => {
    mocks.rpc.mockResolvedValue(cleanVersion)
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan: "PENDING" as const })) })
    const response = await runEvidenceCommand(req(viewBody), store)
    expect(response.status).toBe(403)
    expect(store.probeObject).toHaveBeenCalledWith(storageKey)
    expect(store.createReadUrl).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_evidence_access_v1")).toBe(false)
  })
  it("fails closed on bucket mismatch without S3 reads or URLs", async () => {
    mocks.rpc.mockResolvedValue({ ...cleanVersion, storageBucket: "other-evidence-bucket" })
    const store = storage()
    const text = await (await runEvidenceCommand(req(viewBody), store)).text()
    expect(text).not.toMatch(/test-evidence|other-evidence-bucket|X-Amz/)
    expect(store.probeObject).not.toHaveBeenCalled()
    expect(store.createReadUrl).not.toHaveBeenCalled()
  })
  it("returns a 60-second inline URL for a clean PDF after live tag confirmation", async () => {
    mocks.rpc.mockResolvedValueOnce(cleanVersion).mockResolvedValueOnce({ status: "success", action: "view" })
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })) })
    const response = await runEvidenceCommand(req(viewBody), store)
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.url).toContain("X-Amz-Expires=60")
    expect(signedUrlExpiresSeconds(payload.url)).toBeLessThanOrEqual(READ_EXPIRES_SECONDS)
    expect(store.createReadUrl).toHaveBeenCalledWith({ key: storageKey, contentType: "application/pdf", filename: "invoice.pdf", disposition: "inline" })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(payload.url)
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/X-Amz-Signature/)
  })
  it("rejects DOCX view and allows DOCX download", async () => {
    const docx = { ...cleanVersion, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const, originalFilename: "letter.docx" }
    mocks.rpc.mockResolvedValue(docx)
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })) })
    expect((await runEvidenceCommand(req(viewBody), store)).status).toBe(403)
    expect(store.createReadUrl).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce(docx).mockResolvedValueOnce({ status: "success", action: "download" })
    const download = await runEvidenceCommand(req({ operation: "download", caseId, versionId }), store)
    expect(download.status).toBe(200)
    expect(store.createReadUrl).toHaveBeenCalledWith(expect.objectContaining({ disposition: "attachment", filename: "letter.docx" }))
  })
  it("sanitises CR/LF filenames before signing", async () => {
    expect(contentDisposition("safe.pdf", "inline")).toContain("filename=\"safe.pdf\"")
    expect(contentDisposition("evil\r\nLocation: https://evil.example\ninject.pdf", "attachment")).not.toMatch(/[\r\n]/)
    expect(contentDisposition("evil\r\nLocation: https://evil.example\ninject.pdf", "attachment")).not.toContain("Location:")
    mocks.rpc.mockResolvedValueOnce({ ...cleanVersion, originalFilename: "invoice\r\nSet-Cookie: a=b.pdf" }).mockResolvedValueOnce({ status: "success" })
    const store = storage({ probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })) })
    const response = await runEvidenceCommand(req({ operation: "download", caseId, versionId }), store)
    expect(response.status).toBe(200)
    expect(store.createReadUrl).toHaveBeenCalledWith(expect.objectContaining({ filename: "invoice\r\nSet-Cookie: a=b.pdf", disposition: "attachment" }))
    expect(contentDisposition("invoice\r\nSet-Cookie: a=b.pdf", "attachment")).toMatch(/^attachment;/)
    expect(contentDisposition("invoice\r\nSet-Cookie: a=b.pdf", "attachment")).not.toMatch(/Set-Cookie/)
  })
  it("maps provider errors without returning a URL", async () => {
    mocks.rpc.mockResolvedValue(cleanVersion)
    const store = storage({
      probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })),
      createReadUrl: vi.fn(async () => { throw new Error("OIDC token exchange failed for arn:aws:iam::123456789012:role/AdminEvidenceTestRole") }),
    })
    const response = await runEvidenceCommand(req(viewBody), store)
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(text).not.toMatch(/OIDC|123456789012|AdminEvidenceTestRole|https:\/\//)
  })
  it.each([
    ["https://s3.example/object?X-Amz-Expires=60", 200],
    ["https://s3.example/object?X-Amz-Expires=1", 200],
    ["https://s3.example/object?X-Amz-Expires=61", 503],
    ["https://s3.example/object", 503],
    ["https://s3.example/object?X-Amz-Expires=abc", 503],
    ["https://s3.example/object?X-Amz-Expires=0", 503],
  ] as const)("fail-closes read URLs unless X-Amz-Expires is 1..60 (%s)", async (url, status) => {
    mocks.rpc.mockResolvedValueOnce(cleanVersion).mockResolvedValueOnce({ status: "success", action: "view" })
    const store = storage({
      probeObject: vi.fn(async () => ({ exists: true, scan: "NO_THREATS_FOUND" as const })),
      createReadUrl: vi.fn(async () => url),
    })
    const response = await runEvidenceCommand(req(viewBody), store)
    const text = await response.text()
    expect(response.status).toBe(status)
    if (status === 503) {
      expect(text).not.toContain(url)
      expect(text).not.toMatch(/X-Amz-Expires|s3\.example/)
      expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_evidence_access_v1")).toBe(false)
    } else {
      expect(JSON.parse(text).url).toBe(url)
    }
  })
})

