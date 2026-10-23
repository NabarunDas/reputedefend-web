/**
 * Step 6 purchasing and tax readiness.
 *
 * The database function is the only source. A missing session, a revoked
 * session, or a shape this screen does not understand is unavailable.
 * Unavailable is not a verified United Kingdom purchaser.
 */

export const quoteReadinessStatuses = ["verified", "missing", "pending", "conflicting", "unavailable"] as const
export type QuoteReadinessStatus = (typeof quoteReadinessStatuses)[number]

export const sellerVatPositions = ["NOT_VAT_REGISTERED", "REGISTERED", "UNKNOWN", "unavailable"] as const
export type SellerVatPosition = (typeof sellerVatPositions)[number]

export const quoteTaxPaths = ["uk_not_charged", "review", "unavailable"] as const
export type QuoteTaxPath = (typeof quoteTaxPaths)[number]

export type QuoteReadiness = {
  status: QuoteReadinessStatus
  countryCode: string | null
  countryLabel: string | null
  legalName: string | null
  sellerVat: SellerVatPosition
  taxPath: QuoteTaxPath
}

export const unavailableQuoteReadiness: QuoteReadiness = {
  status: "unavailable",
  countryCode: null,
  countryLabel: null,
  legalName: null,
  sellerVat: "unavailable",
  taxPath: "unavailable",
}

function countryLabel(code: string): string | null {
  if (code === "GB") return "United Kingdom"
  try {
    const name = new Intl.DisplayNames(["en-GB"], { type: "region" }).of(code)
    if (!name || name.toUpperCase() === code) return null
    return name
  } catch {
    return null
  }
}

function isStatus(value: unknown): value is QuoteReadinessStatus {
  return typeof value === "string" && (quoteReadinessStatuses as readonly string[]).includes(value)
}

function isSeller(value: unknown): value is Exclude<SellerVatPosition, "unavailable"> {
  return value === "NOT_VAT_REGISTERED" || value === "REGISTERED" || value === "UNKNOWN"
}

function isTaxPath(value: unknown): value is QuoteTaxPath {
  return typeof value === "string" && (quoteTaxPaths as readonly string[]).includes(value)
}

/** Fail closed. Null, a leaked identifier, or an unexpected status is unavailable. */
export function parseQuoteReadiness(value: unknown): QuoteReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailableQuoteReadiness
  const body = value as Record<string, unknown>
  if (!isStatus(body.status) || body.status === "unavailable") return unavailableQuoteReadiness
  if (!isSeller(body.sellerVat) || !isTaxPath(body.taxPath)) return unavailableQuoteReadiness
  const countryCode = body.countryCode == null ? null : body.countryCode
  const legalName = body.legalName == null ? null : body.legalName
  if (countryCode !== null && (typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode))) {
    return unavailableQuoteReadiness
  }
  if (legalName !== null && (typeof legalName !== "string" || legalName.trim().length < 2 || legalName.length > 200)) {
    return unavailableQuoteReadiness
  }
  if (body.status === "verified") {
    if (!countryCode || !legalName) return unavailableQuoteReadiness
    const label = countryLabel(countryCode)
    if (!label) return unavailableQuoteReadiness
    const taxPath = countryCode === "GB" && body.sellerVat === "NOT_VAT_REGISTERED" ? "uk_not_charged" : "review"
    if (body.taxPath !== taxPath) return unavailableQuoteReadiness
    return {
      status: "verified",
      countryCode,
      countryLabel: label,
      legalName: legalName.trim(),
      sellerVat: body.sellerVat,
      taxPath,
    }
  }
  if (countryCode !== null || legalName !== null) return unavailableQuoteReadiness
  if (body.status === "conflicting" && body.taxPath !== "review") return unavailableQuoteReadiness
  if ((body.status === "missing" || body.status === "pending") && body.taxPath !== "unavailable") {
    return unavailableQuoteReadiness
  }
  return {
    status: body.status,
    countryCode: null,
    countryLabel: null,
    legalName: null,
    sellerVat: body.sellerVat,
    taxPath: body.taxPath,
  }
}

export function purchaserStatusLabel(readiness: QuoteReadiness): string {
  if (readiness.status === "verified" && readiness.countryLabel) {
    return `Purchaser verified — ${readiness.countryLabel}`
  }
  if (readiness.status === "pending") return "Purchasing establishment not verified"
  if (readiness.status === "missing") return "Purchasing establishment not recorded"
  if (readiness.status === "conflicting") return "Purchasing records need review"
  return "Purchasing verification could not be confirmed"
}

export function pricingStatusLabel(readiness: QuoteReadiness, taxBehaviour: string | null, confirmed: boolean): string {
  if (readiness.taxPath === "uk_not_charged" && confirmed && taxBehaviour === "NOT_APPLICABLE") return "Pricing confirmed"
  if (readiness.taxPath === "uk_not_charged") return "Pricing ready to confirm"
  if (readiness.taxPath === "review" || readiness.status === "conflicting") return "Tax treatment needs review"
  return "Pricing cannot be confirmed yet"
}
