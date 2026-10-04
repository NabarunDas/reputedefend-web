/**
 * Strict reader for the customer Guard projection.
 * Unexpected keys fail closed so a leaked identifier cannot be rendered.
 */

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const GUARD_SELECTOR = /^gd-[a-f0-9]{64}$/
const ACTION_SELECTOR = /^ca-[a-f0-9]{64}$/
const CURRENCY = /^[A-Z]{3}$/

const ARRANGEMENTS = [
  "Directly purchased Guard",
  "Included Guard from a recovery service",
  "Paid continuation from included Guard",
] as const
const STATUSES = [
  "Preparing Guard",
  "Permission required",
  "Access being verified",
  "Setup in progress",
  "Payment setup required",
  "Ready for activation",
  "Active",
  "Paused",
  "Ending",
  "Ended",
] as const
const PERMISSIONS = [
  "Permission recorded",
  "Permission needs review",
  "Permission required",
  "Permission not recorded",
] as const
const MONITORING = [
  "No issue detected",
  "Change detected — being reviewed",
  "Profile unavailable — being reviewed",
  "Check incomplete",
] as const
const TAX = ["INCLUSIVE", "EXCLUSIVE", "NOT_APPLICABLE"] as const

export type GuardArrangement = (typeof ARRANGEMENTS)[number]
export type GuardStatus = (typeof STATUSES)[number]
export type GuardPermissionLabel = (typeof PERMISSIONS)[number]
export type GuardMonitoring = (typeof MONITORING)[number]
export type GuardTax = (typeof TAX)[number]

export type GuardPermissionAction = {
  selector: string
  kind: "permission"
  permissionVersion: "GUARD_PERMISSION_V1"
  permissionText: string
}

export type GuardSubscriptionAction = {
  selector: string
  kind: "subscription"
  amountMinor: number
  currency: string
  taxBehaviour: GuardTax | null
  consentVersion: "GUARD_RECURRING_CONSENT_V1"
  consentText: string
  consentRecorded: boolean
  cancellationTerms: string
  checkout: boolean
  recovery: boolean
  periodEndCancellation: boolean
  undoPeriodEndCancellation: boolean
  immediateCancellationReview: boolean
}

export type GuardPriceAction = {
  selector: string
  kind: "price_change"
  oldAmountMinor: number
  newAmountMinor: number
  currency: string
  noticeVersion: "GUARD_PRICE_CHANGE_NOTICE_V1"
  noticeText: string
  effectiveAt: string | null
}

export type GuardAction = GuardPermissionAction | GuardSubscriptionAction | GuardPriceAction

export type GuardLocation = {
  selector: string
  businessName: string
  locationName: string
  arrangement: GuardArrangement
  status: GuardStatus
  monitoringActive: boolean
  permission: GuardPermissionLabel
  activatedAt: string | null
  includedEndsAt: string | null
  billing: string
  subscription: string | null
  amountMinor: number | null
  currency: string | null
  taxBehaviour: GuardTax | null
  periodEnd: string | null
  cancellation: string | null
  lastCheckedAt: string | null
  profileAvailable: boolean | null
  monitoring: GuardMonitoring | null
  issueUnderReview: boolean
  actions: GuardAction[]
}

export type CustomerGuard = { locations: GuardLocation[] }
export type CustomerGuardLocation = { found: true; location: GuardLocation } | { found: false }

const LOCATION_KEYS = [
  "selector", "businessName", "locationName", "arrangement", "status", "monitoringActive",
  "permission", "billing", "issueUnderReview", "actions",
] as const
const OPTIONAL_LOCATION = [
  "activatedAt", "includedEndsAt", "subscription", "amountMinor", "currency", "taxBehaviour",
  "periodEnd", "cancellation", "lastCheckedAt", "profileAvailable", "monitoring",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every(key => actual.includes(key))
}

function allowedKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]) {
  const actual = Object.keys(value)
  if (!required.every(key => actual.includes(key))) return false
  return actual.every(key => required.includes(key) || optional.includes(key))
}

function text(value: unknown, max = 500) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null
}

function time(value: unknown) {
  return typeof value === "string" && ISO_TIME.test(value) ? value : null
}

function money(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null
}

function permissionAction(value: unknown): GuardPermissionAction | null {
  if (!isRecord(value) || !sameKeys(value, ["selector", "kind", "permissionVersion", "permissionText"])) return null
  const selector = text(value.selector, 80)
  const permissionText = text(value.permissionText, 5000)
  if (!selector || !ACTION_SELECTOR.test(selector) || value.kind !== "permission" || value.permissionVersion !== "GUARD_PERMISSION_V1" || !permissionText) return null
  return { selector, kind: "permission", permissionVersion: "GUARD_PERMISSION_V1", permissionText }
}

function subscriptionAction(value: unknown): GuardSubscriptionAction | null {
  if (!isRecord(value) || !sameKeys(value, [
    "selector", "kind", "amountMinor", "currency", "taxBehaviour", "consentVersion", "consentText",
    "consentRecorded", "cancellationTerms", "checkout", "recovery", "periodEndCancellation",
    "undoPeriodEndCancellation", "immediateCancellationReview",
  ])) return null
  const selector = text(value.selector, 80)
  const amountMinor = money(value.amountMinor)
  const currency = text(value.currency, 3)
  const consentText = text(value.consentText, 5000)
  const cancellationTerms = text(value.cancellationTerms, 5000)
  const taxBehaviour = value.taxBehaviour === null ? null : oneOf(value.taxBehaviour, TAX)
  if (value.taxBehaviour !== null && !taxBehaviour) return null
  if (!selector || !ACTION_SELECTOR.test(selector) || value.kind !== "subscription" || amountMinor === null || !currency || !CURRENCY.test(currency)) return null
  if (value.consentVersion !== "GUARD_RECURRING_CONSENT_V1" || !consentText || !cancellationTerms) return null
  if (typeof value.consentRecorded !== "boolean" || typeof value.checkout !== "boolean" || typeof value.recovery !== "boolean") return null
  if (typeof value.periodEndCancellation !== "boolean" || typeof value.undoPeriodEndCancellation !== "boolean" || typeof value.immediateCancellationReview !== "boolean") return null
  return {
    selector, kind: "subscription", amountMinor, currency, taxBehaviour, consentVersion: "GUARD_RECURRING_CONSENT_V1",
    consentText, consentRecorded: value.consentRecorded, cancellationTerms, checkout: value.checkout, recovery: value.recovery,
    periodEndCancellation: value.periodEndCancellation, undoPeriodEndCancellation: value.undoPeriodEndCancellation,
    immediateCancellationReview: value.immediateCancellationReview,
  }
}

function priceAction(value: unknown): GuardPriceAction | null {
  if (!isRecord(value) || !allowedKeys(value, [
    "selector", "kind", "oldAmountMinor", "newAmountMinor", "currency", "noticeVersion", "noticeText",
  ], ["effectiveAt"])) return null
  const selector = text(value.selector, 80)
  const oldAmountMinor = money(value.oldAmountMinor)
  const newAmountMinor = money(value.newAmountMinor)
  const currency = text(value.currency, 3)
  const noticeText = text(value.noticeText, 2000)
  const effectiveAt = value.effectiveAt === undefined || value.effectiveAt === null ? null : time(value.effectiveAt)
  if (value.effectiveAt != null && !effectiveAt) return null
  if (!selector || !ACTION_SELECTOR.test(selector) || value.kind !== "price_change" || oldAmountMinor === null || newAmountMinor === null) return null
  if (!currency || !CURRENCY.test(currency) || value.noticeVersion !== "GUARD_PRICE_CHANGE_NOTICE_V1" || !noticeText) return null
  return {
    selector, kind: "price_change", oldAmountMinor, newAmountMinor, currency,
    noticeVersion: "GUARD_PRICE_CHANGE_NOTICE_V1", noticeText, effectiveAt,
  }
}

function action(value: unknown): GuardAction | null {
  if (!isRecord(value)) return null
  if (value.kind === "permission") return permissionAction(value)
  if (value.kind === "subscription") return subscriptionAction(value)
  if (value.kind === "price_change") return priceAction(value)
  return null
}

export function parseGuardLocation(value: unknown): GuardLocation | null {
  if (!isRecord(value) || !allowedKeys(value, LOCATION_KEYS, OPTIONAL_LOCATION)) return null
  const selector = text(value.selector, 80)
  const businessName = text(value.businessName, 200)
  const locationName = text(value.locationName, 200)
  const arrangement = oneOf(value.arrangement, ARRANGEMENTS)
  const status = oneOf(value.status, STATUSES)
  const permission = oneOf(value.permission, PERMISSIONS)
  const billing = text(value.billing, 200)
  if (!selector || !GUARD_SELECTOR.test(selector) || !businessName || !locationName || !arrangement || !status || !permission || !billing) return null
  if (typeof value.monitoringActive !== "boolean" || typeof value.issueUnderReview !== "boolean") return null
  if (!Array.isArray(value.actions) || value.actions.length > 12) return null
  const actions: GuardAction[] = []
  for (const item of value.actions) {
    const parsed = action(item)
    if (!parsed) return null
    actions.push(parsed)
  }
  const activatedAt = value.activatedAt === undefined ? null : value.activatedAt === null ? null : time(value.activatedAt)
  if (value.activatedAt != null && !activatedAt) return null
  const includedEndsAt = value.includedEndsAt === undefined ? null : value.includedEndsAt === null ? null : time(value.includedEndsAt)
  if (value.includedEndsAt != null && !includedEndsAt) return null
  const subscription = value.subscription === undefined ? null : text(value.subscription, 200)
  if (value.subscription != null && !subscription) return null
  const hasAmount = value.amountMinor !== undefined || value.currency !== undefined
  const amountMinor = value.amountMinor === undefined ? null : money(value.amountMinor)
  const currency = value.currency === undefined ? null : text(value.currency, 3)
  if (hasAmount && (amountMinor === null || !currency || !CURRENCY.test(currency))) return null
  const taxBehaviour = value.taxBehaviour === undefined || value.taxBehaviour === null ? null : oneOf(value.taxBehaviour, TAX)
  if (value.taxBehaviour != null && !taxBehaviour) return null
  const periodEnd = value.periodEnd === undefined ? null : value.periodEnd === null ? null : time(value.periodEnd)
  if (value.periodEnd != null && !periodEnd) return null
  const cancellation = value.cancellation === undefined ? null : text(value.cancellation, 300)
  if (value.cancellation != null && !cancellation) return null
  const lastCheckedAt = value.lastCheckedAt === undefined ? null : value.lastCheckedAt === null ? null : time(value.lastCheckedAt)
  if (value.lastCheckedAt != null && !lastCheckedAt) return null
  const profileAvailablePresent = Object.hasOwn(value, "profileAvailable")
  const profileAvailable = !profileAvailablePresent || value.profileAvailable === null
    ? null
    : value.profileAvailable === true || value.profileAvailable === false
      ? value.profileAvailable
      : undefined
  if (profileAvailable === undefined) return null
  const monitoring = value.monitoring === undefined ? null : oneOf(value.monitoring, MONITORING)
  if (value.monitoring != null && !monitoring) return null
  const monitoringKeys = (lastCheckedAt !== null ? 1 : 0) + (monitoring !== null ? 1 : 0) + (profileAvailablePresent ? 1 : 0)
  if (monitoringKeys !== 0 && monitoringKeys !== 3) return null
  return {
    selector, businessName, locationName, arrangement, status, monitoringActive: value.monitoringActive, permission,
    activatedAt, includedEndsAt, billing, subscription, amountMinor, currency, taxBehaviour, periodEnd, cancellation,
    lastCheckedAt, profileAvailable, monitoring, issueUnderReview: value.issueUnderReview, actions,
  }
}

export function parseGuard(value: unknown): CustomerGuard | null {
  if (!isRecord(value) || !sameKeys(value, ["locations"]) || !Array.isArray(value.locations) || value.locations.length > 50) return null
  const locations: GuardLocation[] = []
  for (const item of value.locations) {
    const parsed = parseGuardLocation(item)
    if (!parsed) return null
    locations.push(parsed)
  }
  return { locations }
}

export function parseGuardDetail(value: unknown): CustomerGuardLocation | null {
  if (!isRecord(value)) return null
  if (sameKeys(value, ["found"]) && value.found === false) return { found: false }
  if (!sameKeys(value, ["found", "location"]) || value.found !== true) return null
  const location = parseGuardLocation(value.location)
  if (!location) return null
  return { found: true, location }
}

export function isGuardSelector(value: string) {
  return GUARD_SELECTOR.test(value)
}
