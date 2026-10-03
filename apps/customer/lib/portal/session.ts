import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalAvailable, portalSessionCookieName } from "./config"

/**
 * ProfileRelaunch Customer Portal session.
 *
 * This is not a customer-action session. Holding it does not authorise /case,
 * action commands, evidence, payments, Guard, business membership, case
 * ownership, or agreements. It means only that this browser completed OTP for
 * the customer's current verified email and still holds an unexpired,
 * unrevoked opaque portal token. A changed or no-longer-verified email makes
 * customer_portal_session_v1 return null immediately.
 */
export type PortalSession = {
  customerId: string
  authUserId: string
  email: string
  authenticatedAt: string
  expiresAt: string
}

function asPortalSession(value: unknown): PortalSession | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.customerId !== "string" || typeof row.authUserId !== "string" || typeof row.email !== "string") return null
  if (typeof row.authenticatedAt !== "string" || typeof row.expiresAt !== "string") return null
  return {
    customerId: row.customerId,
    authUserId: row.authUserId,
    email: row.email,
    authenticatedAt: row.authenticatedAt,
    expiresAt: row.expiresAt,
  }
}

export async function portalSessionFromToken(token: string | undefined): Promise<PortalSession | null> {
  if (!portalAvailable() || !validToken(token)) return null
  try {
    const row = await backend().rpc<unknown>("customer_portal_session_v1", { p_token_hash: tokenHash(token) })
    return asPortalSession(row)
  } catch {
    return null
  }
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const jar = await cookies()
  return portalSessionFromToken(jar.get(portalSessionCookieName())?.value)
}
