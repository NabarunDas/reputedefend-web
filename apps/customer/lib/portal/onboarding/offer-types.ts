/**
 * Customer presentation of one commercial offer. The selector is the only
 * address. A failed parse is unavailable, which is not the same as having no
 * offer.
 */

export const OFFER_REF = /^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/

export type OfferProduct = "Telloya" | "Complete"
export type OfferCadence = "MONTH" | "YEAR" | "ONCE"
export type OfferTax = "NOT_APPLICABLE" | "INCLUSIVE" | "EXCLUSIVE"

export type OfferConfirmation = { key: string; label: string }

export type OfferTier = "Basic" | "Growth" | "Pro" | "Custom"

export type OfferAgreement = {
  title: string
  body: string
  cancellation: string
  versionRef: string
  confirmations: OfferConfirmation[]
}

export type OfferGuardLocation = {
  locationId: string
  locationName: string
}

export type OfferConditions = {
  tier: OfferTier
  includedMinutes: number | null
  minutesRollover: boolean
  baseAmountMinor: number
  guardIncluded: boolean
  guardUnitMinor: number | null
  guardQuantity: number
  overagePermitted: boolean
  overageRateMinor: number | null
}

export type AcceptedConditions = OfferConditions & {
  overageOptIn: boolean
  overageCapMinor: number | null
}

export type PricedOffer = {
  offerRef: string
  product: OfferProduct
  businessName: string
  locations: string[]
  guardLocations: OfferGuardLocation[]
  services: string[]
  priceMinor: number
  currency: "GBP"
  taxBehaviour: OfferTax
  taxMinor: number | null
  totalMinor: number
  cadence: OfferCadence
  recurring: boolean
  agreement: OfferAgreement
  conditions: OfferConditions
  nextStep: string
}

export type ReadyOffer = PricedOffer & { status: "ready"; offerVersion: number }
export type CommercialPaymentReadiness = {
  state: "preparing" | "started" | "unsupported"
  cadence: OfferCadence
  totalMinor: number
  guardChargeMinor: number | null
}

export type AcceptedOffer = Omit<PricedOffer, "conditions"> & {
  status: "accepted"
  acceptedAt: string
  conditions: AcceptedConditions
  payment?: CommercialPaymentReadiness
}

export type LimitedOffer = {
  status: "terms_pending" | "conditions_pending" | "withdrawn" | "expired" | "changed" | "superseded"
  offerRef: string
  product: OfferProduct
  businessName: string
  locations?: string[]
  nextStep: string
}

export type CommercialOfferRead =
  | ReadyOffer
  | AcceptedOffer
  | LimitedOffer
  | { status: "unavailable"; reason?: "authority"; nextStep?: string }
  | { status: "unauthenticated" }

const PRODUCTS = new Set<string>(["Telloya", "Complete"])
const TIERS = new Set<string>(["Basic", "Growth", "Pro", "Custom"])
const CADENCE = new Set<string>(["MONTH", "YEAR", "ONCE"])
const TAX = new Set<string>(["NOT_APPLICABLE", "INCLUSIVE", "EXCLUSIVE"])
const LIMITED = new Set(["withdrawn", "expired", "changed", "superseded"])
const PROVIDER_ID = /\b(?:cus|sub|si|pi|cs|pm|sk|whsec|price)_[A-Za-z0-9]+\b/
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|javascript:|<script/i
const CONFIRMATION_KEY = /^[a-z][a-z0-9_]{0,31}$/
const LOCATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONDITION_KEYS = [
  "tier", "includedMinutes", "minutesRollover", "baseAmountMinor", "guardIncluded",
  "guardUnitMinor", "guardQuantity", "overagePermitted", "overageRateMinor",
] as const

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function exactKeys(row: Record<string, unknown>, keys: readonly string[]) {
  const present = Object.keys(row)
  return present.length === keys.length && keys.every(key => present.includes(key))
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > max) return null
  if (PROVIDER_ID.test(trimmed) || UNSAFE.test(trimmed)) return null
  return trimmed
}

function names(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) return null
  const items: string[] = []
  for (const entry of value) {
    const name = text(entry, 200)
    if (!name) return null
    items.push(name)
  }
  return items
}

function guardLocations(value: unknown, covered: string[], quantity: number, product: OfferProduct): OfferGuardLocation[] | null {
  if (!Array.isArray(value) || value.length > covered.length || value.length > 20) return null
  const items: OfferGuardLocation[] = []
  const remaining = [...covered]
  for (const entry of value) {
    const row = record(entry)
    if (!row || !exactKeys(row, ["locationId", "locationName"])) return null
    const locationId = typeof row.locationId === "string" ? row.locationId.toLowerCase() : ""
    const locationName = text(row.locationName, 200)
    if (!LOCATION_ID.test(locationId) || !locationName) return null
    if (items.some(item => item.locationId === locationId)) return null
    const index = remaining.indexOf(locationName)
    if (index < 0) return null
    remaining.splice(index, 1)
    items.push({ locationId, locationName })
  }
  if (product === "Telloya" && items.length !== quantity) return null
  if (product === "Complete" && items.length !== 0 && items.length !== quantity) return null
  return items
}

function money(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100_000_000) return null
  return value
}

function agreement(value: unknown): OfferAgreement | null {
  const row = record(value)
  if (!row || !exactKeys(row, ["title", "body", "cancellation", "versionRef", "confirmations"])) return null
  const title = text(row.title, 200)
  const body = text(row.body, 50000)
  const cancellation = text(row.cancellation, 5000)
  const versionRef = text(row.versionRef, 200)
  if (!title || !body || body.length < 20 || !cancellation || cancellation.length < 10 || !versionRef) return null
  if (!Array.isArray(row.confirmations) || row.confirmations.length > 12) return null
  const confirmations: OfferConfirmation[] = []
  for (const entry of row.confirmations) {
    const item = record(entry)
    if (!item || !exactKeys(item, ["key", "label"])) return null
    const key = text(item.key, 32)
    const label = text(item.label, 160)
    if (!key || !CONFIRMATION_KEY.test(key) || !label || label.length < 10) return null
    if (confirmations.some(existing => existing.key === key)) return null
    confirmations.push({ key, label })
  }
  return { title, body, cancellation, versionRef, confirmations }
}

function priced(row: Record<string, unknown>, offerRef: string, product: OfferProduct, businessName: string, nextStep: string, commercial: OfferConditions): PricedOffer | null {
  const locations = names(row.locations, 20)
  const places = locations && guardLocations(row.guardLocations, locations, commercial.guardQuantity, product)
  const services = names(row.services, 4)
  const priceMinor = money(row.priceMinor)
  const taxBehaviour = typeof row.taxBehaviour === "string" ? row.taxBehaviour : ""
  const cadence = typeof row.cadence === "string" ? row.cadence : ""
  const terms = agreement(row.agreement)
  const guardCharge = commercial.guardIncluded ? (commercial.guardUnitMinor ?? 0) * commercial.guardQuantity : 0
  if (!locations || !places || !services || priceMinor == null || priceMinor < 1 || !TAX.has(taxBehaviour) || !CADENCE.has(cadence) || !terms) return null
  if (commercial.baseAmountMinor + guardCharge !== priceMinor) return null
  if (row.currency !== "GBP" || typeof row.recurring !== "boolean") return null
  if (row.recurring !== (cadence !== "ONCE")) return null
  const taxMinor = row.taxMinor == null ? null : money(row.taxMinor)
  if (row.taxMinor != null && taxMinor == null) return null
  if (taxBehaviour === "NOT_APPLICABLE" && taxMinor != null) return null
  if (taxBehaviour !== "NOT_APPLICABLE" && taxMinor == null) return null
  const totalMinor = money(row.totalMinor)
  const expected = taxBehaviour === "EXCLUSIVE" ? priceMinor + (taxMinor ?? 0) : priceMinor
  if (totalMinor == null || totalMinor !== expected) return null
  return {
    offerRef,
    product,
    businessName,
    locations,
    guardLocations: places,
    services,
    priceMinor,
    currency: "GBP",
    taxBehaviour: taxBehaviour as OfferTax,
    taxMinor,
    totalMinor,
    cadence: cadence as OfferCadence,
    recurring: row.recurring,
    agreement: terms,
    conditions: commercial,
    nextStep,
  }
}

function nullableMinutes(value: unknown): number | null | undefined {
  if (value == null) return null
  const minutes = money(value)
  if (minutes == null || minutes < 1) return undefined
  return minutes
}

function conditions(value: unknown, accepted: boolean): OfferConditions | AcceptedConditions | null {
  const row = record(value)
  if (!row) return null
  const keys = accepted ? [...CONDITION_KEYS, "overageOptIn", "overageCapMinor"] : [...CONDITION_KEYS]
  if (!exactKeys(row, keys)) return null
  const tier = text(row.tier, 20)
  if (!tier || !TIERS.has(tier)) return null
  const includedMinutes = nullableMinutes(row.includedMinutes)
  if (includedMinutes === undefined) return null
  if (tier !== "Custom" && includedMinutes == null) return null
  if (typeof row.minutesRollover !== "boolean" || typeof row.guardIncluded !== "boolean") return null
  if (typeof row.overagePermitted !== "boolean") return null
  const baseAmountMinor = money(row.baseAmountMinor)
  const guardQuantity = money(row.guardQuantity)
  if (baseAmountMinor == null || baseAmountMinor < 1 || guardQuantity == null) return null
  const guardUnitMinor = row.guardUnitMinor == null ? null : money(row.guardUnitMinor)
  if (row.guardUnitMinor != null && (guardUnitMinor == null || guardUnitMinor < 1)) return null
  if (row.guardIncluded !== (guardQuantity > 0)) return null
  if (row.guardIncluded && guardUnitMinor == null) return null
  const overageRateMinor = row.overageRateMinor == null ? null : money(row.overageRateMinor)
  if (row.overageRateMinor != null && (overageRateMinor == null || overageRateMinor < 1)) return null
  if (row.overagePermitted !== (overageRateMinor != null)) return null
  const facts: OfferConditions = {
    tier: tier as OfferTier,
    includedMinutes,
    minutesRollover: row.minutesRollover,
    baseAmountMinor,
    guardIncluded: row.guardIncluded,
    guardUnitMinor,
    guardQuantity,
    overagePermitted: row.overagePermitted,
    overageRateMinor,
  }
  if (!accepted) return facts
  if (typeof row.overageOptIn !== "boolean") return null
  const overageCapMinor = row.overageCapMinor == null ? null : money(row.overageCapMinor)
  if (row.overageCapMinor != null && (overageCapMinor == null || overageCapMinor < 1)) return null
  if (row.overageOptIn && (overageCapMinor == null || !row.overagePermitted)) return null
  if (!row.overageOptIn && overageCapMinor != null) return null
  return { ...facts, overageOptIn: row.overageOptIn, overageCapMinor }
}

const PAYMENT_STATES = new Set(["preparing", "started", "unsupported"])
const PAYMENT_KEYS = ["state", "cadence", "totalMinor", "guardChargeMinor"]

function paymentReadiness(
  value: unknown,
  cadence: OfferCadence,
  totalMinor: number,
  commercial: AcceptedConditions,
): CommercialPaymentReadiness | null {
  const row = record(value)
  if (!row || !exactKeys(row, PAYMENT_KEYS)) return null
  if (typeof row.state !== "string" || !PAYMENT_STATES.has(row.state)) return null
  if (row.cadence !== cadence) return null
  const total = money(row.totalMinor)
  if (total !== totalMinor) return null
  const expectedGuard = commercial.guardIncluded && commercial.guardUnitMinor != null
    ? commercial.guardUnitMinor * commercial.guardQuantity
    : null
  if (expectedGuard == null) {
    if (row.guardChargeMinor !== null) return null
  } else if (row.guardChargeMinor !== expectedGuard) return null
  return {
    state: row.state as CommercialPaymentReadiness["state"],
    cadence,
    totalMinor,
    guardChargeMinor: expectedGuard,
  }
}

export function parseCommercialOffer(value: unknown): Exclude<CommercialOfferRead, { status: "unauthenticated" }> | null {
  const row = record(value)
  if (!row) return null
  const status = row.status
  if (status === "unavailable") {
    if (exactKeys(row, ["status"])) return { status: "unavailable" }
    const nextStep = text(row.nextStep, 300)
    if (row.reason === "authority" && nextStep && exactKeys(row, ["status", "reason", "nextStep"])) {
      return { status: "unavailable", reason: "authority", nextStep }
    }
    return null
  }
  const offerRef = text(row.offerRef, 20)
  const product = text(row.product, 20)
  const businessName = text(row.businessName, 200)
  const nextStep = text(row.nextStep, 300)
  if (!offerRef || !OFFER_REF.test(offerRef) || !product || !PRODUCTS.has(product) || !businessName || !nextStep) return null
  if (status === "terms_pending" || status === "conditions_pending") {
    if (!exactKeys(row, ["status", "offerRef", "product", "businessName", "locations", "nextStep"])) return null
    const locations = names(row.locations, 20)
    if (!locations) return null
    return { status, offerRef, product: product as OfferProduct, businessName, locations, nextStep }
  }
  if (typeof status === "string" && LIMITED.has(status)) {
    if (!exactKeys(row, ["status", "offerRef", "product", "businessName", "nextStep"])) return null
    return { status: status as LimitedOffer["status"], offerRef, product: product as OfferProduct, businessName, nextStep }
  }
  if (status === "ready") {
    if (!exactKeys(row, [
      "status", "offerRef", "offerVersion", "product", "businessName", "locations", "guardLocations", "services",
      "priceMinor", "currency", "taxBehaviour", "taxMinor", "totalMinor", "cadence", "recurring",
      "agreement", "conditions", "nextStep",
    ])) return null
    const offerVersion = money(row.offerVersion)
    const commercial = conditions(row.conditions, false)
    const price = commercial && priced(row, offerRef, product as OfferProduct, businessName, nextStep, commercial)
    if (!offerVersion || offerVersion < 1 || !price) return null
    return { ...price, status: "ready", offerVersion }
  }
  if (status === "accepted") {
    const acceptedKeys = [
      "status", "offerRef", "product", "businessName", "locations", "guardLocations", "services",
      "priceMinor", "currency", "taxBehaviour", "taxMinor", "totalMinor", "cadence", "recurring",
      "agreement", "conditions", "acceptedAt", "nextStep",
    ]
    const withPayment = exactKeys(row, [...acceptedKeys, "payment"])
    if (!withPayment && !exactKeys(row, acceptedKeys)) return null
    const acceptedAt = text(row.acceptedAt, 40)
    const recorded = conditions(row.conditions, true)
    if (!acceptedAt || Number.isNaN(new Date(acceptedAt).getTime()) || !recorded || !("overageOptIn" in recorded)) return null
    const price = priced(row, offerRef, product as OfferProduct, businessName, nextStep, recorded)
    if (!price) return null
    if (!withPayment) return { ...price, conditions: recorded, status: "accepted", acceptedAt }
    const payment = paymentReadiness(row.payment, price.cadence, price.totalMinor, recorded)
    if (!payment) return null
    return { ...price, conditions: recorded, status: "accepted", acceptedAt, payment }
  }
  return null
}
