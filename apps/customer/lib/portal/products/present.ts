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
  context: string | null
  action: ProductAction | null
  attention: string | null
  unavailableReason: string | null
}

export type GuardProductLocation = {
  businessName: string
  monitoringActive: boolean
}

export type ProductSources = {
  recovery: { status: "ready"; dashboard: CustomerDashboard } | { status: "unavailable" }
  guard: { status: "ready"; locations: readonly GuardProductLocation[] } | { status: "unavailable" }
}

const UNAVAILABLE = "We couldn't confirm this service just now. Refresh the page. This does not say whether it has been set up."

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

function guardCard(source: ProductSources["guard"]): ProductCard {
  const base = {
    key: "guard" as const,
    name: "Relaunch Guard",
    description: "Monitor supported Google Business Profile and review changes across covered locations.",
    mark: "guard" as const,
  }
  if (source.status === "unavailable") {
    return { ...base, status: "unavailable", context: null, action: null, attention: null, unavailableReason: UNAVAILABLE }
  }
  const names = businessContext(source.locations.map(location => location.businessName))
  const recorded = source.locations.filter(location => location.monitoringActive).length
  let context = names
  if (source.locations.length === 0) context = "No covered locations are on file."
  else if (recorded > 0) {
    const recordedText = `Monitoring is recorded for ${recorded} ${recorded === 1 ? "location" : "locations"}.`
    context = names ? `${names}. ${recordedText}` : recordedText
  }
  return {
    ...base,
    status: "open",
    context,
    action: { label: "Open Relaunch Guard", href: "/portal/guard" },
    attention: null,
    unavailableReason: null,
  }
}

function telloyaCard(): ProductCard {
  return {
    key: "telloya",
    name: "Telloya",
    description: "Your AI receptionist for missed-call handling, customer enquiries and callback follow-up.",
    mark: "telloya",
    status: "exploring",
    context: null,
    action: null,
    attention: null,
    unavailableReason: "Telloya is not open in your portal yet.",
  }
}

export function presentProducts(sources: ProductSources): ProductCard[] {
  return [recoveryCard(sources.recovery), guardCard(sources.guard), telloyaCard()]
}

export function productStatusLabel(status: ProductPresentationStatus): string {
  if (status === "open") return "You can open this"
  if (status === "exploring") return "Being explored"
  return "Unavailable right now"
}
