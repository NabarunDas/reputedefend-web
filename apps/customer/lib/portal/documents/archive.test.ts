import { unzipSync, strFromU8 } from "fflate"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
import { MAX_ARCHIVE_BYTES, MAX_ARCHIVE_FILES, portalDocumentArchive } from "./archive"
import { portalSessionCookieName } from "@/lib/portal/config"
import type { CustomerEvidenceStorage } from "@/lib/case/storage"

const origin = "https://customer.profilerelaunch.com"
const keyA = "cases/55555555-5555-4555-8555-555555555555/documents/66666666-6666-4666-8666-666666666666/versions/77777777-7777-4777-8777-777777777777"
const keyB = "cases/55555555-5555-4555-8555-555555555555/documents/66666666-6666-4666-8666-666666666666/versions/88888888-8888-4888-8888-888888888888"
const token = "c".repeat(64)
const publishedAt = "2026-10-05T12:00:00.000Z"

function req(query = "reference=PR-26-ABCDEF", cookie = `${portalSessionCookieName()}=${token}`) {
  return new NextRequest(`${origin}/api/portal/documents/archive?${query}`, {
    headers: cookie ? { cookie } : {},
  })
}

function stream(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function storage(bodies: Record<string, string> = { [keyA]: "alpha" }, scan: "NO_THREATS_FOUND" | "THREATS_FOUND" | "PENDING" = "NO_THREATS_FOUND"): CustomerEvidenceStorage {
  return {
    bucket: "test-evidence",
    createUpload: vi.fn(),
    probeObject: vi.fn(async () => ({ exists: scan !== "PENDING", scan })),
    createReadUrl: vi.fn(async () => "https://uploads.example/should-not-be-used"),
    openObject: vi.fn(async (key: string) => bodies[key] ? { body: stream(bodies[key]), contentLength: bodies[key].length } : { body: null, contentLength: null }),
  }
}

function file(selector: string, filename: string, sizeBytes = 5) {
  return {
    selector,
    title: "Final document",
    filename,
    contentType: "application/pdf",
    sizeBytes,
    publishedAt,
  }
}

function projection(reference: string, documents: ReturnType<typeof file>[]) {
  return {
    found: true,
    case: {
      reference,
      caseType: "PROFILE_RECOVERY",
      serviceTrack: "GUIDED",
      businessName: "Harbour Bakery",
      locationName: null,
    },
    requests: [],
    submissions: [],
    documents,
    pack: null,
  }
}

function resolved(filename: string, key: string) {
  return {
    found: true,
    available: true,
    filename,
    contentType: "application/pdf",
    storageBucket: "test-evidence",
    storageKey: key,
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

describe("portal document archive", () => {
  it("zips the current published files for the authenticated case and audits each one", async () => {
    mocks.rpc
      .mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf"), file("pd-2", "letter.pdf")]))
      .mockResolvedValueOnce(resolved("letter.pdf", keyA))
      .mockResolvedValueOnce(resolved("letter.pdf", keyB))
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "success" })
    const store = storage({ [keyA]: "alpha", [keyB]: "beta" })
    const response = await portalDocumentArchive(req(), store)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/zip")
    expect(response.headers.get("content-disposition")).toContain("ProfileRelaunch_PR-26-ABCDEF_Submission_Pack.zip")
    const bytes = new Uint8Array(await response.arrayBuffer())
    const entries = unzipSync(bytes)
    expect(Object.keys(entries).sort()).toEqual(["letter (2).pdf", "letter.pdf"])
    expect(strFromU8(entries["letter.pdf"])).toBe("alpha")
    expect(strFromU8(entries["letter (2).pdf"])).toBe("beta")
    expect(Buffer.from(bytes).toString("utf8")).not.toContain(keyA)
    expect(store.createReadUrl).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "customer_portal_case_documents_v1",
      "customer_portal_document_resolve_v1",
      "customer_portal_document_resolve_v1",
      "customer_portal_document_access_v1",
      "customer_portal_document_access_v1",
    ])
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_reference: "PR-26-ABCDEF", p_selector: "pd-1" })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/customerId|p_customer|storageKey/)
  })

  it("rejects another case, a signed-out session, and a browser-supplied file id", async () => {
    const signedOut = await portalDocumentArchive(req("reference=PR-26-ABCDEF", ""))
    expect(signedOut.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValueOnce(null)
    const expired = await portalDocumentArchive(req(), storage())
    expect(expired.status).toBe(401)

    mocks.rpc.mockResolvedValueOnce({ found: false })
    const otherCase = await portalDocumentArchive(req("reference=PR-26-ZZZZZ9"), storage())
    const otherText = await otherCase.text()
    expect(otherCase.status).toBe(404)
    expect(otherText).toMatch(/no longer available/)
    expect(otherText).not.toMatch(/storage|bucket|rpc/i)

    const supplied = await portalDocumentArchive(req(`reference=PR-26-ABCDEF&selector=pd-1&key=${keyA}`))
    expect(supplied.status).toBe(404)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it("refuses unpublished, unsafe, missing and oversized files before sending an archive", async () => {
    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf")])).mockResolvedValueOnce({ found: true, available: false })
    const unpublished = await portalDocumentArchive(req(), storage())
    expect(unpublished.status).toBe(404)
    expect(unpublished.headers.get("content-type")).toContain("text/plain")

    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf")])).mockResolvedValueOnce(resolved("letter.pdf", keyA))
    const unsafe = await portalDocumentArchive(req(), storage({ [keyA]: "alpha" }, "THREATS_FOUND"))
    expect(unsafe.status).toBe(404)

    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf")])).mockResolvedValueOnce(resolved("letter.pdf", keyA))
    const missing = await portalDocumentArchive(req(), storage({}))
    expect(missing.status).toBe(404)

    const oversized = Array.from({ length: 5 }, (_, index) => file(`pd-${index + 1}`, `file-${index + 1}.pdf`, 10_485_760))
    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", oversized))
    const tooLarge = await portalDocumentArchive(req(), storage())
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.text()).toMatch(/too large/)
    expect(oversized.reduce((sum, item) => sum + item.sizeBytes, 0)).toBeGreaterThan(MAX_ARCHIVE_BYTES)

    const many = Array.from({ length: MAX_ARCHIVE_FILES + 1 }, (_, index) => file(`pd-${index + 1}`, `file-${index + 1}.pdf`, 10))
    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", many))
    const tooMany = await portalDocumentArchive(req(), storage())
    expect(tooMany.status).toBe(413)
  })

  it("renames a path-like filename and still downloads files listed for a closed case projection", async () => {
    mocks.rpc
      .mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "secret.txt")]))
      .mockResolvedValueOnce(resolved("../../secret.txt", keyA))
      .mockResolvedValueOnce({ status: "success" })
    const response = await portalDocumentArchive(req(), storage())
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    expect(Object.keys(entries)).toEqual(["secret.txt"])
    expect(Object.keys(entries).join(" ")).not.toMatch(/\.\./)
  })
})
