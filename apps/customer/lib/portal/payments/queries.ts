import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { parseCasePayments, parsePayments, type CustomerCasePayments, type CustomerPayments } from "./parse"

export type PaymentsLoad =
  | { status: "ready"; payments: CustomerPayments }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export type CasePaymentsLoad =
  | { status: "ready"; payments: CustomerCasePayments }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

/** The portal session cookie is the only credential. The RPC derives the customer. */
export async function loadCustomerPayments(): Promise<PaymentsLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_payments_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return { status: "unauthenticated" }
    const payments = parsePayments(row)
    if (!payments) return { status: "unavailable" }
    return { status: "ready", payments }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadCustomerCasePayments(reference: string): Promise<CasePaymentsLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_case_payments_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
    })
    if (row == null) return { status: "unauthenticated" }
    const payments = parseCasePayments(row)
    if (payments === "not_found") return { status: "not_found" }
    if (!payments) return { status: "unavailable" }
    return { status: "ready", payments }
  } catch {
    return { status: "unavailable" }
  }
}
