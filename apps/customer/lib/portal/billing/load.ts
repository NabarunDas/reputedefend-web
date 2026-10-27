import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "@/lib/portal/config"
import type { BillingDocument } from "../../../../../lib/billing/document"
import { documentFromGuard, documentFromInvoice, documentFromQuotation, documentFromReceipt } from "./present"
import { parseGuardDocument, parseGuardDocuments, parseInvoiceDocument, parseQuotationDocument, type GuardDocumentSummary } from "./parse"
import { parseReceiptDownload } from "../payments/parse"

export type DocumentLoad =
  | { status: "ready"; document: BillingDocument }
  | { status: "paused" }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

export async function loadReceiptDocument(selector: string): Promise<DocumentLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_receipt_v1", {
      p_token_hash: tokenHash(token),
      p_selector: selector,
    })
    if (row == null) return { status: "unauthenticated" }
    const receipt = parseReceiptDownload(row)
    if (receipt === "not_found") return { status: "not_found" }
    if (!receipt) return { status: "unavailable" }
    const document = documentFromReceipt(receipt)
    return document ? { status: "ready", document } : { status: "not_found" }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadInvoiceDocument(reference: string, selector: string): Promise<DocumentLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_invoice_document_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
      p_selector: selector,
    })
    if (row == null) return { status: "unauthenticated" }
    const invoice = parseInvoiceDocument(row)
    if (invoice === "collection_paused") return { status: "paused" }
    if (invoice === "not_found") return { status: "not_found" }
    if (!invoice) return { status: "unavailable" }
    const document = documentFromInvoice(invoice)
    return document ? { status: "ready", document } : { status: "not_found" }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadQuotationDocument(reference: string): Promise<DocumentLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_quotation_document_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
    })
    if (row == null) return { status: "unauthenticated" }
    const quote = parseQuotationDocument(row)
    if (quote === "not_found") return { status: "not_found" }
    if (!quote) return { status: "unavailable" }
    return { status: "ready", document: documentFromQuotation(quote) }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadGuardDocument(selector: string): Promise<DocumentLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_guard_document_v1", {
      p_token_hash: tokenHash(token),
      p_selector: selector,
    })
    if (row == null) return { status: "unauthenticated" }
    const parsed = parseGuardDocument(row)
    if (parsed === "not_found") return { status: "not_found" }
    if (!parsed) return { status: "unavailable" }
    const document = documentFromGuard(parsed)
    return document ? { status: "ready", document } : { status: "not_found" }
  } catch {
    return { status: "unavailable" }
  }
}

/** Missing or unapplied Guard document history must not hide the Guard page. */
export async function loadGuardBillingDocuments(): Promise<GuardDocumentSummary[]> {
  const token = await portalToken()
  if (!token) return []
  try {
    const row = await backend().rpc<unknown>("customer_portal_guard_documents_v1", { p_token_hash: tokenHash(token) })
    return parseGuardDocuments(row)?.documents ?? []
  } catch {
    return []
  }
}
