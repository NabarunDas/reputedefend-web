import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { parseCasePage, parseDashboard, type CasesQuery, type CustomerCasePage, type CustomerDashboard } from "./parse"

export type DashboardLoad =
  | { status: "ready"; dashboard: CustomerDashboard }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export type CasesLoad =
  | { status: "ready"; page: CustomerCasePage }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

/**
 * The portal proxy already checked the session cookie. This call is the data
 * check: the RPC derives the customer from the token hash and returns null
 * when that session is no longer valid. The customer id is not read here and
 * is not sent.
 */
export async function loadCustomerDashboard(): Promise<DashboardLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_dashboard_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return { status: "unauthenticated" }
    const dashboard = parseDashboard(row)
    if (!dashboard) return { status: "unavailable" }
    return { status: "ready", dashboard }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadCustomerCases(query: CasesQuery): Promise<CasesLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_cases_v1", {
      p_token_hash: tokenHash(token),
      p_view: query.view,
      p_before_time: query.before,
      p_before_ref: query.reference,
    })
    if (row == null) return { status: "unauthenticated" }
    const page = parseCasePage(row)
    if (!page) return { status: "unavailable" }
    return { status: "ready", page }
  } catch {
    return { status: "unavailable" }
  }
}
