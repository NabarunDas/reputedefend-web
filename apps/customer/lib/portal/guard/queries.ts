import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { parseGuard, parseGuardDetail, type CustomerGuard, type CustomerGuardLocation } from "./parse"

export type GuardLoad =
  | { status: "ready"; guard: CustomerGuard }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export type GuardLocationLoad =
  | { status: "ready"; location: Extract<CustomerGuardLocation, { found: true }>["location"] }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

export async function loadCustomerGuard(): Promise<GuardLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_guard_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return { status: "unauthenticated" }
    const guard = parseGuard(row)
    if (!guard) return { status: "unavailable" }
    return { status: "ready", guard }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadCustomerGuardLocation(selector: string): Promise<GuardLocationLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_guard_location_v1", {
      p_token_hash: tokenHash(token),
      p_selector: selector,
    })
    if (row == null) return { status: "unauthenticated" }
    const parsed = parseGuardDetail(row)
    if (!parsed) return { status: "unavailable" }
    if (!parsed.found) return { status: "not_found" }
    return { status: "ready", location: parsed.location }
  } catch {
    return { status: "unavailable" }
  }
}
