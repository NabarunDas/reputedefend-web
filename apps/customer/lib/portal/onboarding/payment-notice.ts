import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { commercialCheckoutEnabled, commercialOfferReadEnabled } from "./flag"
import { OFFER_REF, type CommercialPaymentReadiness, type OfferCadence, type OfferProduct } from "./offer-types"

export type CommercialPaymentNotice = {
  offerRef: string
  product: OfferProduct
  totalMinor: number
  cadence: OfferCadence
  guardChargeMinor: number | null
  state: CommercialPaymentReadiness["state"]
}

const CADENCE = new Set(["MONTH", "YEAR", "ONCE"])
const PRODUCTS = new Set(["Telloya", "Complete"])
const STATES = new Set(["preparing", "started", "unsupported"])
const KEYS = ["offerRef", "product", "totalMinor", "cadence", "guardChargeMinor", "state"]

function one(value: unknown): CommercialPaymentNotice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(row, key))) return null
  if (typeof row.offerRef !== "string" || !OFFER_REF.test(row.offerRef)) return null
  if (typeof row.product !== "string" || !PRODUCTS.has(row.product)) return null
  if (typeof row.cadence !== "string" || !CADENCE.has(row.cadence)) return null
  if (typeof row.state !== "string" || !STATES.has(row.state)) return null
  if (typeof row.totalMinor !== "number" || !Number.isInteger(row.totalMinor) || row.totalMinor < 1) return null
  if (row.guardChargeMinor !== null && (typeof row.guardChargeMinor !== "number" || !Number.isInteger(row.guardChargeMinor) || row.guardChargeMinor < 1)) return null
  if (JSON.stringify(row).match(/\b(?:cus|sub|si|pi|cs|pm|sk|whsec|price)_[A-Za-z0-9]+\b/)) return null
  return {
    offerRef: row.offerRef,
    product: row.product as OfferProduct,
    totalMinor: row.totalMinor,
    cadence: row.cadence as OfferCadence,
    guardChargeMinor: row.guardChargeMinor,
    state: row.state as CommercialPaymentReadiness["state"],
  }
}

/** Unpaid accepted commercial offers for the signed-in customer. Flags off, or a missing function, leave Billing unchanged. */
export async function loadCommercialPaymentNotices(): Promise<CommercialPaymentNotice[]> {
  if (!commercialOfferReadEnabled() && !commercialCheckoutEnabled()) return []
  try {
    const jar = await cookies()
    const token = jar.get(portalSessionCookieName())?.value
    if (!validToken(token)) return []
    const row = await backend().rpc<unknown>("customer_portal_commercial_payment_notice_v1", {
      p_token_hash: tokenHash(token),
    })
    if (!Array.isArray(row)) return []
    return row.flatMap(item => {
      const parsed = one(item)
      return parsed ? [parsed] : []
    })
  } catch {
    return []
  }
}
