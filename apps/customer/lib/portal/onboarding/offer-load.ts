import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { OFFER_REF, parseCommercialOffer, type CommercialOfferRead } from "./offer-types"

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

/**
 * Session-scoped offer read. The selector is a commercial public reference.
 * Null is an invalid session. A thrown or unreadable payload is unavailable,
 * which is not the same as having no offer.
 */
export async function loadCommercialOffer(selector: string): Promise<CommercialOfferRead> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  if (!OFFER_REF.test(selector)) return { status: "unavailable" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_commercial_offer_v1", {
      p_token_hash: tokenHash(token),
      p_selector: selector,
    })
    if (row == null) return { status: "unauthenticated" }
    const parsed = parseCommercialOffer(row)
    if (!parsed) return { status: "unavailable" }
    if ("offerRef" in parsed && parsed.offerRef !== selector) return { status: "unavailable" }
    return parsed
  } catch {
    return { status: "unavailable" }
  }
}
