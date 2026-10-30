import { Zip, ZipPassThrough } from "fflate"
import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig, customerRequestOriginAllowed } from "@/lib/config"
import { canDownloadItem, isOpaqueEvidenceKey, MAX_EVIDENCE_BYTES } from "@/lib/case/model"
import { contentDisposition, createCustomerEvidenceStorage, type CustomerEvidenceStorage } from "@/lib/case/storage"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { parseCaseDocuments } from "./parse"
import { archiveEntryName, submissionPackFilename } from "./archive-entry"
import { ARCHIVE_TOGETHER_LIMIT, MAX_ARCHIVE_BYTES, MAX_ARCHIVE_FILES } from "./model"

const UNAVAILABLE = "These documents are no longer available."
const RETRY = "These documents can't be downloaded together right now. Please try again shortly."
const SIGN_IN = "Sign in again to download these documents."
const DOCUMENT_SELECTOR = /^pd-[1-9][0-9]{0,3}$/
export { MAX_ARCHIVE_BYTES, MAX_ARCHIVE_FILES }

function textReply(message: string, http: number) {
  return new NextResponse(message, { status: http, headers: { ...privateResponseHeaders, "content-type": "text/plain; charset=utf-8" } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type ResolvedFile = {
  selector: string
  filename: string
  contentType: string
  storageKey: string
  entryName: string
  maxBytes: number
}

async function resolveOwnedFile(
  token: string,
  reference: string,
  selector: string,
  storage: CustomerEvidenceStorage,
  declaredBytes: number,
): Promise<ResolvedFile | "unauthenticated" | "unavailable"> {
  const resolved = await backend().rpc<unknown>("customer_portal_document_resolve_v1", {
    p_token_hash: tokenHash(token),
    p_reference: reference,
    p_selector: selector,
  })
  if (resolved == null) return "unauthenticated"
  if (!isRecord(resolved) || resolved.found !== true) return "unavailable"
  if (resolved.available !== true) return "unavailable"
  const filename = resolved.filename
  const contentType = resolved.contentType
  const storageKey = resolved.storageKey
  const storageBucket = resolved.storageBucket
  if (typeof filename !== "string" || typeof contentType !== "string" || typeof storageKey !== "string" || typeof storageBucket !== "string") {
    return "unavailable"
  }
  if (storageBucket !== storage.bucket || !isOpaqueEvidenceKey(storageKey, filename) || !canDownloadItem({ contentType })) {
    return "unavailable"
  }
  const probe = await storage.probeObject(storageKey)
  if (!probe.exists || probe.scan !== "NO_THREATS_FOUND") return "unavailable"
  const maxBytes = Math.min(MAX_EVIDENCE_BYTES, declaredBytes)
  if (maxBytes < 1) return "unavailable"
  return { selector, filename, contentType, storageKey, entryName: "", maxBytes }
}

export async function portalDocumentArchive(
  request: NextRequest,
  storage: CustomerEvidenceStorage | null = createCustomerEvidenceStorage(),
) {
  const config = customerBackendConfig()
  if (!portalAvailable() || !config || !customerRequestOriginAllowed(null, request.nextUrl.origin, false)) return textReply(UNAVAILABLE, 404)
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (!validToken(token)) return textReply(SIGN_IN, 401)
  const params = request.nextUrl.searchParams
  const names = [...params.keys()]
  if (names.length !== 1 || names[0] !== "reference") return textReply(UNAVAILABLE, 404)
  const reference = params.get("reference") ?? ""
  if (!isPublicCaseReference(reference)) return textReply(UNAVAILABLE, 404)
  if (!storage) return textReply(RETRY, 503)
  try {
    const row = await backend().rpc<unknown>("customer_portal_case_documents_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
    })
    if (row == null) return textReply(SIGN_IN, 401)
    const documents = parseCaseDocuments(row)
    if (documents === "not_found" || !documents) return textReply(UNAVAILABLE, 404)
    if (documents.case.reference !== reference) return textReply(UNAVAILABLE, 404)
    const published = documents.documents
    if (published.length < 1) return textReply(UNAVAILABLE, 404)
    if (published.length > MAX_ARCHIVE_FILES) return textReply(ARCHIVE_TOGETHER_LIMIT, 413)
    const declaredTotal = published.reduce((sum, file) => sum + file.sizeBytes, 0)
    if (declaredTotal > MAX_ARCHIVE_BYTES) return textReply(ARCHIVE_TOGETHER_LIMIT, 413)
    const used = new Set<string>()
    const resolved: ResolvedFile[] = []
    for (const file of published) {
      if (!DOCUMENT_SELECTOR.test(file.selector)) return textReply(UNAVAILABLE, 404)
      const authorised = await resolveOwnedFile(token, reference, file.selector, storage, file.sizeBytes)
      if (authorised === "unauthenticated") return textReply(SIGN_IN, 401)
      if (authorised === "unavailable") return textReply(UNAVAILABLE, 404)
      const entryName = archiveEntryName(authorised.filename, used)
      if (!entryName) return textReply(UNAVAILABLE, 404)
      resolved.push({ ...authorised, entryName })
    }
    for (const file of resolved) {
      const audited = await backend().rpc<{ status?: string } | null>("customer_portal_document_access_v1", {
        p_token_hash: tokenHash(token),
        p_request: crypto.randomUUID(),
        p_reference: reference,
        p_selector: file.selector,
      })
      if (!audited || audited.status !== "success") return textReply(UNAVAILABLE, 404)
    }
    const first = await openOwnedObject(storage, resolved[0])
    if (first === "missing") return textReply(UNAVAILABLE, 404)
    if (request.signal.aborted) {
      await first.body.cancel().catch(() => undefined)
      return textReply(UNAVAILABLE, 404)
    }
    const stream = archiveDownloadStream(resolved, storage, first, request.signal)
    return new NextResponse(stream, {
      status: 200,
      headers: {
        ...privateResponseHeaders,
        "content-type": "application/zip",
        "content-disposition": contentDisposition(submissionPackFilename(reference), "attachment"),
        "x-content-type-options": "nosniff",
      },
    })
  } catch {
    return textReply(RETRY, 503)
  }
}

type OpenedObject = { body: ReadableStream<Uint8Array>; contentLength: number }

async function openOwnedObject(storage: CustomerEvidenceStorage, file: ResolvedFile): Promise<OpenedObject | "missing"> {
  const object = await storage.openObject(file.storageKey)
  const length = object.contentLength
  if (!object.body || length == null || length < 1 || length > file.maxBytes) {
    if (object.body) await object.body.cancel().catch(() => undefined)
    return "missing"
  }
  return { body: object.body, contentLength: length }
}

/**
 * One S3 body is open at a time. Bytes are read only while the response
 * stream still has room, and cancellation closes the active reader.
 */
function archiveDownloadStream(
  files: ResolvedFile[],
  storage: CustomerEvidenceStorage,
  first: OpenedObject,
  signal: AbortSignal,
) {
  let stopped = false
  let zip: Zip | null = null
  let failed: unknown = null
  const output: Uint8Array[] = []
  let zipFinished = false
  let zipEnded = false
  let index = 0
  let entry: ZipPassThrough | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let body: ReadableStream<Uint8Array> | null = first.body
  let expected = first.contentLength
  let readBytes = 0
  let total = 0
  let onAbort: (() => void) | null = null

  async function closeActive(mode: "release" | "cancel") {
    const currentReader = reader
    const currentBody = body
    reader = null
    body = null
    if (currentReader) {
      try { currentReader.releaseLock() } catch { /* The lock was already released. */ }
    }
    if (mode === "cancel" && currentBody) {
      try { await currentBody.cancel() } catch { /* The body is already closed or has failed. */ }
    }
  }

  async function stop(controller: ReadableStreamDefaultController<Uint8Array> | null, error?: unknown) {
    if (stopped) return
    stopped = true
    if (onAbort) signal.removeEventListener("abort", onAbort)
    try { zip?.terminate() } catch { /* The archive has already stopped. */ }
    await closeActive("cancel")
    if (!controller || !error) return
    try { controller.error(error instanceof Error ? error : new Error("archive")) } catch { /* The response is already closed. */ }
  }

  function enqueueAvailable(controller: ReadableStreamDefaultController<Uint8Array>) {
    while (!stopped && output.length > 0 && (controller.desiredSize ?? 0) > 0) {
      const next = output.shift()
      if (next) controller.enqueue(next)
    }
  }

  async function pumpOne() {
    if (stopped || !zip) return false
    if (!entry) {
      if (index >= files.length) return false
      if (!body) {
        const opened = await openOwnedObject(storage, files[index])
        if (opened === "missing") throw new Error("missing")
        if (stopped) {
          await opened.body.cancel().catch(() => undefined)
          return false
        }
        body = opened.body
        expected = opened.contentLength
      }
      entry = new ZipPassThrough(files[index].entryName)
      zip.add(entry)
      reader = body.getReader()
    }
    const current = reader
    if (!current) return false
    const chunk = await current.read()
    if (stopped) return false
    if (failed) throw failed
    if (chunk.done) {
      if (readBytes !== expected) throw new Error("missing")
      entry.push(new Uint8Array(), true)
      if (failed) throw failed
      entry = null
      readBytes = 0
      await closeActive("release")
      index += 1
      if (index >= files.length && !zipEnded) {
        zipEnded = true
        zip.end()
      }
      return true
    }
    const size = chunk.value.byteLength
    if (readBytes + size > expected || readBytes + size > files[index].maxBytes || total + size > MAX_ARCHIVE_BYTES) {
      throw new Error("limit")
    }
    readBytes += size
    total += size
    entry.push(chunk.value, false)
    if (failed) throw failed
    return true
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((error, data, final) => {
        if (stopped) return
        if (error) {
          failed = error
          return
        }
        if (data.byteLength > 0) output.push(data)
        if (final) zipFinished = true
      })
      onAbort = () => {
        void stop(controller, signal.reason instanceof Error ? signal.reason : new Error("aborted"))
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener("abort", onAbort, { once: true })
    },
    async pull(controller) {
      if (stopped) return
      try {
        while (!stopped && (controller.desiredSize ?? 0) > 0) {
          enqueueAvailable(controller)
          if (stopped || (controller.desiredSize ?? 0) <= 0) break
          if (index >= files.length && output.length === 0 && zipFinished) {
            await stop(null)
            controller.close()
            break
          }
          const progressed = await pumpOne()
          if (stopped) break
          enqueueAvailable(controller)
          if (!progressed && output.length === 0 && zipFinished) {
            await stop(null)
            controller.close()
            break
          }
          if (!progressed) break
        }
      } catch (error) {
        if (!stopped) await stop(controller, error)
      }
    },
    cancel() {
      return stop(null)
    },
  }, new CountQueuingStrategy({ highWaterMark: 1 }))
}
