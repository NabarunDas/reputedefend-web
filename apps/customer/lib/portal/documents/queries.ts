import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { parseCaseDocuments, parseDocuments, type CustomerCaseDocuments, type CustomerDocuments } from "./parse"

export type DocumentsLoad =
  | { status: "ready"; documents: CustomerDocuments }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export type CaseDocumentsLoad =
  | { status: "ready"; documents: CustomerCaseDocuments }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

/**
 * The portal session cookie is the only credential. The RPC derives the
 * customer and returns null when that session is no longer valid.
 */
export async function loadCustomerDocuments(): Promise<DocumentsLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_documents_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return { status: "unauthenticated" }
    const documents = parseDocuments(row)
    if (!documents) return { status: "unavailable" }
    return { status: "ready", documents }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadCustomerCaseDocuments(reference: string): Promise<CaseDocumentsLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_case_documents_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
    })
    if (row == null) return { status: "unauthenticated" }
    const documents = parseCaseDocuments(row)
    if (documents === "not_found") return { status: "not_found" }
    if (!documents) return { status: "unavailable" }
    return { status: "ready", documents }
  } catch {
    return { status: "unavailable" }
  }
}
