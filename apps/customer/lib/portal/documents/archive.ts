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

const UNAVAILABLE = "These documents are no longer available."
const RETRY = "These documents can't be downloaded together right now. Please try again shortly."
const SIGN_IN = "Sign in again to download these documents."
const TOO_LARGE = "This pack is too large to download together. Download the files individually."
const DOCUMENT_SELECTOR = /^pd-[1-9][0-9]{0,3}$/
export const MAX_ARCHIVE_FILES = 20
export const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024

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
    if (published.length > MAX_ARCHIVE_FILES) return textReply(TOO_LARGE, 413)
    const declaredTotal = published.reduce((sum, file) => sum + file.sizeBytes, 0)
    if (declaredTotal > MAX_ARCHIVE_BYTES) return textReply(TOO_LARGE, 413)
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
    const opened: Array<ResolvedFile & { body: ReadableStream<Uint8Array> }> = []
    try {
      for (const file of resolved) {
        const object = await storage.openObject(file.storageKey)
        const length = object.contentLength
        if (!object.body || length == null || length < 1 || length > file.maxBytes) {
          if (object.body) await object.body.cancel()
          throw new Error("missing")
        }
        opened.push({ ...file, body: object.body })
      }
    } catch {
      await Promise.all(opened.map(file => file.body.cancel().catch(() => undefined)))
      return textReply(UNAVAILABLE, 404)
    }
    for (const file of resolved) {
      const audited = await backend().rpc<{ status?: string } | null>("customer_portal_document_access_v1", {
        p_token_hash: tokenHash(token),
        p_request: crypto.randomUUID(),
        p_reference: reference,
        p_selector: file.selector,
      })
      if (!audited || audited.status !== "success") {
        await Promise.all(opened.map(item => item.body.cancel().catch(() => undefined)))
        return textReply(UNAVAILABLE, 404)
      }
    }
    const stream = zipBodies(opened)
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

function zipBodies(files: Array<{ entryName: string; body: ReadableStream<Uint8Array>; maxBytes: number }>) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let stopped = false
      const fail = (error: unknown) => {
        if (stopped) return
        stopped = true
        try { zip.terminate() } catch { /* The archive has already stopped. */ }
        controller.error(error instanceof Error ? error : new Error("archive"))
      }
      const zip = new Zip((error, data, final) => {
        if (stopped) return
        if (error) {
          fail(error)
          return
        }
        if (data.byteLength > 0) controller.enqueue(data)
        if (final) {
          stopped = true
          controller.close()
        }
      })
      try {
        let total = 0
        for (const file of files) {
          const entry = new ZipPassThrough(file.entryName)
          zip.add(entry)
          const reader = file.body.getReader()
          let size = 0
          try {
            while (true) {
              const chunk = await reader.read()
              if (chunk.done) {
                entry.push(new Uint8Array(), true)
                break
              }
              size += chunk.value.byteLength
              total += chunk.value.byteLength
              if (size > file.maxBytes || total > MAX_ARCHIVE_BYTES) throw new Error("limit")
              entry.push(chunk.value, false)
            }
          } finally {
            reader.releaseLock()
          }
        }
        zip.end()
      } catch (error) {
        fail(error)
      }
    },
  })
}
