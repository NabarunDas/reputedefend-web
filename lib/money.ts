export const GBP = "GBP" as const
export const GUARD_MANAGED_DISCOUNT_POLICY = "PAID_GUARD_MANAGED_20" as const
export const GUARD_MANAGED_DISCOUNT_BPS = 2000

export type TaxBehaviour = "UNCONFIRMED" | "INCLUSIVE" | "EXCLUSIVE" | "NOT_APPLICABLE"

export function assertMinor(value: number, label = "amount"): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer minor unit`)
  }
  return value
}

export function assertBps(value: number, label = "basis points"): number {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error(`${label} must be an integer from 0 to 10000`)
  }
  return value
}

export function discountMinor(standardMinor: number, discountBps: number): number {
  return Math.round(assertMinor(standardMinor, "standard") * assertBps(discountBps) / 10000)
}

export function discountedSubtotalMinor(standardMinor: number, discountBps: number): number {
  const standard = assertMinor(standardMinor, "standard")
  const discount = discountMinor(standard, discountBps)
  return standard - discount
}

export function taxMinor(subtotalMinor: number, behaviour: TaxBehaviour, taxRateBps: number | null = null): number {
  const subtotal = assertMinor(subtotalMinor, "subtotal")
  if (behaviour === "UNCONFIRMED" || behaviour === "NOT_APPLICABLE") return 0
  if (taxRateBps === null) throw new Error("tax rate is required when tax is configured")
  const rate = assertBps(taxRateBps, "tax rate")
  if (behaviour === "EXCLUSIVE") return Math.round(subtotal * rate / 10000)
  if (behaviour === "INCLUSIVE") return Math.round(subtotal * rate / (10000 + rate))
  throw new Error("unknown tax behaviour")
}

export function totalMinor(subtotalMinor: number, behaviour: TaxBehaviour, calculatedTaxMinor: number): number {
  const subtotal = assertMinor(subtotalMinor, "subtotal")
  const tax = assertMinor(calculatedTaxMinor, "tax")
  if (behaviour === "EXCLUSIVE") return subtotal + tax
  if (behaviour === "INCLUSIVE" || behaviour === "NOT_APPLICABLE" || behaviour === "UNCONFIRMED") return subtotal
  throw new Error("unknown tax behaviour")
}

export function quoteAmounts(standardMinor: number, discountBps: number, behaviour: TaxBehaviour, taxRateBps: number | null = null) {
  const standard = assertMinor(standardMinor, "standard")
  const discount = discountMinor(standard, discountBps)
  const subtotal = standard - discount
  const tax = taxMinor(subtotal, behaviour, taxRateBps)
  const total = totalMinor(subtotal, behaviour, tax)
  if (standard !== discount + subtotal) throw new Error("standard must equal discount plus discounted subtotal")
  return { standardMinor: standard, discountMinor: discount, quotedSubtotalMinor: subtotal, taxAmountMinor: tax, totalAmountMinor: total }
}

export function formatGbp(minor: number): string {
  return formatMoney(minor, GBP)
}

/** Formats stored minor units in the quote currency. 29900 GBP is £299.00. */
export function formatMoney(minor: number, currency: string): string {
  if (!Number.isInteger(minor)) throw new Error("amount must be an integer minor unit")
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter code")
  const sample = new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
  const digits = sample.resolvedOptions().maximumFractionDigits ?? 2
  const parts = sample.formatToParts(1)
  const symbol = parts.find(part => part.type === "currency")?.value ?? currency
  const symbolFirst = parts.findIndex(part => part.type === "currency") < parts.findIndex(part => part.type === "integer")
  const sign = minor < 0 ? "-" : ""
  const absolute = Math.abs(minor)
  const factor = 10 ** digits
  const whole = Math.floor(absolute / factor)
  const fraction = absolute % factor
  const amount = digits === 0 ? String(whole) : `${whole}.${String(fraction).padStart(digits, "0")}`
  return symbolFirst ? `${sign}${symbol}${amount}` : `${sign}${amount} ${symbol}`
}
