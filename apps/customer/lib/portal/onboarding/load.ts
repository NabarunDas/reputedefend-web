import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { parseOnboardingStatus, type OnboardingRead } from "./types"

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

/**
 * Session-scoped onboarding progress. The token hash is the only argument.
 * Null is an invalid session. A thrown or unreadable payload is unavailable,
 * which is not the same as having no request.
 */
export async function loadOnboardingStatus(): Promise<OnboardingRead> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_onboarding_status_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return { status: "unauthenticated" }
    const parsed = parseOnboardingStatus(row)
    if (!parsed) return { status: "unavailable" }
    return { status: "ready", requests: parsed.requests }
  } catch {
    return { status: "unavailable" }
  }
}
