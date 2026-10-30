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

function req(query = "reference=PR-26-ABCDEF", cookie = `${portalSessionCookieName()}=${token}`, signal?: AbortSignal) {
  return new NextRequest(`${origin}/api/portal/documents/archive?${query}`, {
    headers: cookie ? { cookie } : {},
    signal,
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

    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf")])).mockResolvedValueOnce(resolved("letter.pdf", keyA)).mockResolvedValueOnce({ status: "success" })
    const missingStore = storage({})
    const missing = await portalDocumentArchive(req(), missingStore)
    expect(missing.status).toBe(404)
    expect(missingStore.openObject).toHaveBeenCalledTimes(1)

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

    const exact = Array.from({ length: MAX_ARCHIVE_FILES }, (_, index) => file(`pd-${index + 1}`, `file-${index + 1}.pdf`, MAX_ARCHIVE_BYTES / MAX_ARCHIVE_FILES))
    expect(exact.reduce((sum, item) => sum + item.sizeBytes, 0)).toBe(MAX_ARCHIVE_BYTES)
    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", exact)).mockResolvedValueOnce({ found: true, available: false })
    const atLimit = await portalDocumentArchive(req(), storage())
    expect(atLimit.status).toBe(404)

    const share = MAX_ARCHIVE_BYTES / MAX_ARCHIVE_FILES
    const over = Array.from({ length: MAX_ARCHIVE_FILES }, (_, index) => file(`pd-${index + 1}`, `file-${index + 1}.pdf`, index === MAX_ARCHIVE_FILES - 1 ? share + 1 : share))
    expect(over.reduce((sum, item) => sum + item.sizeBytes, 0)).toBe(MAX_ARCHIVE_BYTES + 1)
    mocks.rpc.mockResolvedValueOnce(projection("PR-26-ABCDEF", over))
    const oneByteOver = await portalDocumentArchive(req(), storage())
    expect(oneByteOver.status).toBe(413)
    expect(await oneByteOver.text()).toMatch(/Download the files individually/)
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

  it("reads the next file only after a slow consumer drains the previous one", async () => {
    const first = paced("a".repeat(128), 4)
    const second = paced("b".repeat(128), 4)
    const opens: string[] = []
    mocks.rpc
      .mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf", first.text.length), file("pd-2", "notes.pdf", second.text.length)]))
      .mockResolvedValueOnce(resolved("letter.pdf", keyA))
      .mockResolvedValueOnce(resolved("notes.pdf", keyB))
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "success" })
    const store = storage({})
    store.openObject = vi.fn(async (key: string) => {
      opens.push(key)
      const source = key === keyA ? first : second
      return { body: source.stream, contentLength: source.text.length }
    })
    const response = await portalDocumentArchive(req(), store)
    expect(response.status).toBe(200)
    expect(opens).toEqual([keyA])
    expect(first.reads).toBeLessThan(first.chunks)
    const reader = response.body!.getReader()
    const received: Uint8Array[] = []
    const firstChunk = await reader.read()
    if (firstChunk.value) received.push(firstChunk.value)
    expect(first.reads).toBeLessThan(first.chunks)
    expect(opens).toEqual([keyA])
    while (true) {
      const chunk = await reader.read()
      if (chunk.value) received.push(chunk.value)
      if (chunk.done) break
    }
    expect(opens).toEqual([keyA, keyB])
    expect(first.reads).toBeGreaterThan(1)
    expect(second.reads).toBeGreaterThan(1)
    expect(first.stream.locked).toBe(false)
    expect(second.stream.locked).toBe(false)
    expect(first.cancelled).toBe(false)
    expect(second.cancelled).toBe(false)
    const bytes = concat(received)
    const entries = unzipSync(bytes)
    expect(strFromU8(entries["letter.pdf"])).toBe(first.text)
    expect(strFromU8(entries["notes.pdf"])).toBe(second.text)
  })

  it("cancels the open object when the consumer or the request stops early", async () => {
    const source = paced("alpha-file-contents", 4)
    mocks.rpc
      .mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf", source.text.length), file("pd-2", "notes.pdf", 4)]))
      .mockResolvedValueOnce(resolved("letter.pdf", keyA))
      .mockResolvedValueOnce(resolved("notes.pdf", keyB))
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "success" })
    const store = storage({})
    const opens: string[] = []
    store.openObject = vi.fn(async (key: string) => {
      opens.push(key)
      return { body: source.stream, contentLength: source.text.length }
    })
    const response = await portalDocumentArchive(req(), store)
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(source.cancelled).toBe(true)
    expect(source.stream.locked).toBe(false)
    expect(opens).toEqual([keyA])

    const aborted = paced("alpha-file-contents", 4)
    const controller = new AbortController()
    mocks.rpc
      .mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf", aborted.text.length)]))
      .mockResolvedValueOnce(resolved("letter.pdf", keyA))
      .mockResolvedValueOnce({ status: "success" })
    const abortStore = storage({})
    abortStore.openObject = vi.fn(async () => ({ body: aborted.stream, contentLength: aborted.text.length }))
    const abortResponse = await portalDocumentArchive(req(undefined, undefined, controller.signal), abortStore)
    expect(abortResponse.status).toBe(200)
    controller.abort()
    await expect(abortResponse.body!.getReader().read()).rejects.toThrow()
    expect(aborted.cancelled).toBe(true)
    expect(aborted.stream.locked).toBe(false)
  })

  it("stops a partial transfer when a later object cannot be read", async () => {
    const first = paced("alpha-file-contents", 4)
    const failed = { cancelled: false, reads: 0 }
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        failed.reads += 1
        controller.enqueue(new Uint8Array(8))
      },
      cancel() { failed.cancelled = true },
    })
    mocks.rpc
      .mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf", first.text.length), file("pd-2", "notes.pdf", 4)]))
      .mockResolvedValueOnce(resolved("letter.pdf", keyA))
      .mockResolvedValueOnce(resolved("notes.pdf", keyB))
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "success" })
    const store = storage({})
    const opens: string[] = []
    store.openObject = vi.fn(async (key: string) => {
      opens.push(key)
      if (key === keyB) return { body: failing, contentLength: 4 }
      return { body: first.stream, contentLength: first.text.length }
    })
    const response = await portalDocumentArchive(req(), store)
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const received: Uint8Array[] = []
    await expect((async () => {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return
        received.push(chunk.value)
      }
    })()).rejects.toThrow()
    expect(received.length).toBeGreaterThan(0)
    expect(() => unzipSync(concat(received))).toThrow()
    expect(opens).toEqual([keyA, keyB])
    expect(failed.cancelled).toBe(true)
    expect(failing.locked).toBe(false)
    expect(first.stream.locked).toBe(false)
    expect(store.createReadUrl).not.toHaveBeenCalled()
  })

  it("releases a reader when the object body fails mid-transfer", async () => {
    const failing = new ReadableStream<Uint8Array>({
      pull() { throw new Error("s3 read failed") },
    })
    mocks.rpc
      .mockResolvedValueOnce(projection("PR-26-ABCDEF", [file("pd-1", "letter.pdf", 4)]))
      .mockResolvedValueOnce(resolved("letter.pdf", keyA))
      .mockResolvedValueOnce({ status: "success" })
    const store = storage({})
    store.openObject = vi.fn(async () => ({ body: failing, contentLength: 4 }))
    const response = await portalDocumentArchive(req(), store)
    await expect(response.arrayBuffer()).rejects.toThrow()
    expect(failing.locked).toBe(false)
  })
})

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function paced(text: string, size: number) {
  const bytes = new TextEncoder().encode(text)
  const state = { text, reads: 0, cancelled: false, chunks: Math.ceil(bytes.length / size), stream: null as unknown as ReadableStream<Uint8Array> }
  let offset = 0
  state.stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.reads += 1
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      const next = bytes.subarray(offset, Math.min(bytes.length, offset + size))
      offset += next.byteLength
      controller.enqueue(next)
    },
    cancel() { state.cancelled = true },
  })
  return state
}
