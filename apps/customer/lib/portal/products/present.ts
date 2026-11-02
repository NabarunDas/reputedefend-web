import type { CustomerDashboard } from "@/lib/portal/cases/parse"

/**
 * Phase 1 presentation for My Products.
 *
 * Phase 2 can pass the same card contract from session-scoped reads:
 * - customer_portal_dashboard_v1 for Recovery case summaries
 * - customer_portal_guard_v1 for Guard locations and recorded monitoring
 * - a future session-scoped Telloya entitlement projection
 *
 * A product being described here is not a purchase, an entitlement, completed
 * setup, or an active service. A failed authoritative read stays unavailable.
 * It is not treated as unpurchased. No checkout redirect is read here.
 */

export type ProductKey = "recovery" | "guard" | "telloya"

/** What the customer can do with the card. Not a subscription state. */
export type ProductPresentationStatus = "open" | "exploring" | "unavailable"

export type ProductAction = {
  label: string
  href: "/portal/recovery" | "/portal/guard"
}

export type ProductCard = {
  key: ProductKey
  name: string
  description: string
  mark: ProductKey
  status: ProductPresentationStatus
  /** Customer phrase. Absent when the commercial projection is not in use. */
  statusLabel?: string
  context: string | null
  action: ProductAction | null
  attention: string | null
  unavailableReason: string | null
}

export type CommercialStatus =
  | "not_subscribed"
  | "pending"
  | "pilot"
  | "setup"
  | "ready_for_provider"
  | "active"
  | "suspended"
  | "expired"
  | "cancelled"
  | "unavailable"

export type CommercialTelloyaLocation = {
  locationName: string
  status: CommercialStatus
  nextStep: string | null
}

export type CommercialGuardLocation = {
  locationName: string
  status: CommercialStatus
  monitoringRecorded: boolean
  allocation: "preview" | "reserved" | null
  nextStep: string | null
}

export type CommercialBusiness = {
  businessName: string
  telloya: { status: CommercialStatus; locations: CommercialTelloyaLocation[] }
  guard: { status: CommercialStatus; locations: CommercialGuardLocation[] }
}

export type CommercialProjection = {
  reads: { telloya: "ok" | "unavailable"; guard: "ok" | "unavailable" }
  businesses: CommercialBusiness[]
}

export type GuardProductLocation = {
  businessName: string
  monitoringActive: boolean
}

export type ProductSources = {
  recovery: { status: "ready"; dashboard: CustomerDashboard } | { status: "unavailable" }
  guard: { status: "ready"; locations: readonly GuardProductLocation[] } | { status: "unavailable" }
  /** Absent when CUSTOMER_PRODUCTS_READ_ENABLED is not exactly true. */
  commercial?: CommercialProjection
}

const UNAVAILABLE = "We couldn't confirm this service just now. Refresh the page. This does not say whether it has been set up."
const STATUS_UNAVAILABLE = "Status temporarily unavailable"

const STATUS_LABEL: Record<CommercialStatus, string> = {
  not_subscribed: "Not subscribed",
  pending: "Pending",
  pilot: "Pilot",
  setup: "Setup in progress",
  ready_for_provider: "Ready for provider verification",
  active: "Active",
  suspended: "Suspended",
  expired: "Expired",
  cancelled: "Cancelled",
  unavailable: STATUS_UNAVAILABLE,
}

const STATUS_RANK: Record<CommercialStatus, number> = {
  unavailable: 0,
  suspended: 1,
  expired: 2,
  cancelled: 3,
  pending: 4,
  setup: 5,
  ready_for_provider: 6,
  pilot: 7,
  active: 8,
  not_subscribed: 9,
}

function businessContext(names: readonly string[]): string | null {
  const unique = [...new Set(names.map(name => name.trim()).filter(name => name.length > 0))]
  if (unique.length === 0) return null
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique[0]} and ${unique.length - 1} other businesses`
}

function recoveryCard(source: ProductSources["recovery"]): ProductCard {
  const base = {
    key: "recovery" as const,
    name: "Recovery & Reviews",
    description: "Manage your ProfileRelaunch cases, documents, messages and payments.",
    mark: "recovery" as const,
  }
  if (source.status === "unavailable") {
    return { ...base, status: "unavailable", context: null, action: null, attention: null, unavailableReason: UNAVAILABLE }
  }
  const rows = [...source.dashboard.attentionCases, ...source.dashboard.recentCases]
  const attentionCount = source.dashboard.summary.attentionCases
  return {
    ...base,
    status: "open",
    context: businessContext(rows.map(row => row.businessName)),
    action: { label: "Open Recovery & Reviews", href: "/portal/recovery" },
    attention: attentionCount > 0
      ? `${attentionCount} ${attentionCount === 1 ? "case needs" : "cases need"} your attention`
      : null,
    unavailableReason: null,
  }
}

function guardCard(source: ProductSources["guard"], commercial?: CommercialProjection): ProductCard {
  const base = {
    key: "guard" as const,
    name: "Relaunch Guard",
    description: "Monitor supported Google Business Profile and review changes across covered locations.",
    mark: "guard" as const,
  }
  if (source.status === "unavailable") {
    const unavailable = { ...base, status: "unavailable" as const, context: null, action: null, attention: null, unavailableReason: UNAVAILABLE }
    if (!commercial || commercial.reads.guard === "ok") return unavailable
    return { ...unavailable, statusLabel: STATUS_UNAVAILABLE }
  }
  const names = businessContext(source.locations.map(location => location.businessName))
  const recorded = source.locations.filter(location => location.monitoringActive).length
  let context = names
  if (source.locations.length === 0) context = "No covered locations are on file."
  else if (recorded > 0) {
    const recordedText = `Monitoring is recorded for ${recorded} ${recorded === 1 ? "location" : "locations"}.`
    context = names ? `${names}. ${recordedText}` : recordedText
  }
  const card: ProductCard = {
    ...base,
    status: "open",
    context,
    action: { label: "Open Relaunch Guard", href: "/portal/guard" },
    attention: null,
    unavailableReason: null,
  }
  if (!commercial) return card
  if (commercial.reads.guard !== "ok") {
    return { ...card, status: "unavailable", statusLabel: STATUS_UNAVAILABLE, unavailableReason: UNAVAILABLE }
  }
  return enrichGuard(card, commercial)
}

function enrichGuard(card: ProductCard, commercial: CommercialProjection): ProductCard {
  const locations = commercial.businesses.flatMap(business => business.guard.locations.map(location => ({
    businessName: business.businessName,
    ...location,
  })))
  if (locations.length === 0) return card
  const detail = locations.map(location => `${location.businessName}, ${location.locationName}: ${STATUS_LABEL[location.status]}`).join(". ")
  const keepsMonitoring = locations.some(location => location.allocation === "preview" && location.monitoringRecorded)
  const context = [card.context, detail, keepsMonitoring ? "Your existing Guard monitoring is unchanged." : null]
    .filter((part): part is string => !!part)
    .join(" ")
  const next = locations.find(location => location.nextStep)?.nextStep ?? null
  return {
    ...card,
    statusLabel: STATUS_LABEL[worstStatus(locations.map(location => location.status))],
    context,
    attention: next,
  }
}

function telloyaCard(commercial?: CommercialProjection): ProductCard {
  const base = {
    key: "telloya" as const,
    name: "Telloya",
    description: "Your AI receptionist for missed-call handling, customer enquiries and callback follow-up.",
    mark: "telloya" as const,
    action: null,
  }
  if (!commercial) {
    return {
      ...base,
      status: "exploring",
      context: null,
      attention: null,
      unavailableReason: "Telloya is not open in your portal yet.",
    }
  }
  if (commercial.reads.telloya !== "ok") {
    return {
      ...base,
      status: "unavailable",
      statusLabel: STATUS_UNAVAILABLE,
      context: null,
      attention: null,
      unavailableReason: UNAVAILABLE,
    }
  }
  const locations = commercial.businesses.flatMap(business => business.telloya.locations.map(location => ({
    businessName: business.businessName,
    ...location,
  })))
  if (locations.length === 0) {
    return {
      ...base,
      status: "exploring",
      statusLabel: "Not subscribed",
      context: "There is no Telloya subscription on this account.",
      attention: null,
      unavailableReason: null,
    }
  }
  const status = worstStatus(locations.map(location => location.status))
  const next = locations.find(location => location.nextStep)?.nextStep ?? null
  return {
    ...base,
    status: status === "unavailable" ? "unavailable" : status === "active" ? "open" : "exploring",
    statusLabel: STATUS_LABEL[status],
    context: locations.map(location => `${location.businessName}, ${location.locationName}: ${STATUS_LABEL[location.status]}`).join(". "),
    attention: next,
    unavailableReason: status === "unavailable" ? UNAVAILABLE : null,
  }
}

function worstStatus(statuses: readonly CommercialStatus[]): CommercialStatus {
  return statuses.reduce((worst, status) => STATUS_RANK[status] < STATUS_RANK[worst] ? status : worst)
}

export function presentProducts(sources: ProductSources): ProductCard[] {
  return [recoveryCard(sources.recovery), guardCard(sources.guard, sources.commercial), telloyaCard(sources.commercial)]
}

export function productStatusLabel(status: ProductPresentationStatus): string {
  if (status === "open") return "You can open this"
  if (status === "exploring") return "Being explored"
  return "Unavailable right now"
}
