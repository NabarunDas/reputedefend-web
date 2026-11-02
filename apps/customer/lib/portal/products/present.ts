import type { CustomerDashboard } from "@/lib/portal/cases/parse"
import { requestAccessAction } from "./enquiry"

/**
 * My Products presentation.
 *
 * ProfileRelaunch covers Recovery, Review Protection and Relaunch Guard.
 * Telloya is the AI receptionist. A card is not a purchase. A case is not a subscription.
 * Signing in does not start a subscription. Those rules stay in
 * the presenter and out of the customer-facing sentences. A failed authoritative
 * read stays unavailable and is not treated as unpurchased. Guard subscription
 * state is labelled as Relaunch Guard, not as a ProfileRelaunch verdict. No
 * purchase path and no Telloya workspace are linked.
 */

export type ProductKey = "profilerelaunch" | "telloya"

export type ProductPresentationStatus = "open" | "exploring" | "unavailable"

export type ProductAction = {
  label: string
  href: string
}

export type ProductCard = {
  key: ProductKey
  name: string
  description: string
  services: readonly string[]
  mark: ProductKey
  status: ProductPresentationStatus
  /** Customer phrase. Absent when no authoritative commercial state is shown. */
  statusLabel?: string
  context: string | null
  actions: readonly ProductAction[]
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
const GUARD_DETAILS_UNAVAILABLE = "Some extra details are temporarily unavailable. Monitoring already recorded is unchanged."
const TELLOYA_NOT_ACTIVE = "Telloya is not active yet."
const TELLOYA_NO_WORKSPACE = "There is no Telloya workspace to open yet."
const PARTIALLY_ACTIVE = "Partially active"
const STATUS_VARIES = "Status varies by location"

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

const PROFILE_SERVICES = [
  "Recovery: cases, documents, messages and payments.",
  "Review Protection: help when a review needs attention.",
  "Relaunch Guard: monitoring for covered Google Business Profile locations.",
] as const

const TELLOYA_SERVICES = [
  "Missed-call handling.",
  "Customer enquiries.",
  "Callback follow-up.",
] as const

function businessContext(names: readonly string[]): string | null {
  const unique = [...new Set(names.map(name => name.trim()).filter(name => name.length > 0))]
  if (unique.length === 0) return null
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique[0]} and ${unique.length - 1} other businesses`
}

type CommercialSide = "guard" | "telloya"

function contributingStatuses(businesses: readonly CommercialBusiness[], side: CommercialSide): CommercialStatus[] {
  const statuses: CommercialStatus[] = []
  for (const business of businesses) {
    const product = business[side]
    if (product.locations.length === 0) statuses.push(product.status)
    else for (const location of product.locations) statuses.push(location.status)
  }
  return statuses
}

function detailLines(businesses: readonly CommercialBusiness[], side: CommercialSide): string {
  return businesses.flatMap(business => {
    const product = business[side]
    if (product.locations.length === 0) return [`${business.businessName}: ${STATUS_LABEL[product.status]}`]
    return product.locations.map(location => `${business.businessName}, ${location.locationName}: ${STATUS_LABEL[location.status]}`)
  }).join(". ")
}

/** One active place does not speak for the rest. One gap does not cancel a live place. */
function summaryLabel(statuses: readonly CommercialStatus[]): string {
  if (statuses.length === 0) return STATUS_LABEL.not_subscribed
  if (statuses.some(status => status === "unavailable")) return STATUS_UNAVAILABLE
  const distinct = new Set(statuses)
  if (distinct.size === 1) return STATUS_LABEL[statuses[0]]
  if (statuses.includes("active")) return PARTIALLY_ACTIVE
  return STATUS_VARIES
}

function hasCases(dashboard: CustomerDashboard): boolean {
  return dashboard.summary.activeCases + dashboard.summary.previousCases > 0
    || dashboard.attentionCases.length > 0
    || dashboard.recentCases.length > 0
}

function sentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`
}

function joinParts(parts: readonly (string | null | undefined)[]): string | null {
  const text = parts.filter((part): part is string => !!part && part.length > 0).join(" ")
  return text.length > 0 ? text : null
}

function profileCard(sources: ProductSources): ProductCard {
  const actions: ProductAction[] = []
  const context: string[] = []
  let attention: string | null = null
  let unavailableReason: string | null = null
  let status: ProductPresentationStatus = "exploring"

  if (sources.recovery.status === "ready") {
    const dashboard = sources.recovery.dashboard
    if (hasCases(dashboard)) {
      actions.push({ label: "Open Recovery dashboard", href: "/portal/recovery" })
      const rows = [...dashboard.attentionCases, ...dashboard.recentCases]
      const names = businessContext(rows.map(row => row.businessName))
      if (names) context.push(sentence(names))
      const attentionCount = dashboard.summary.attentionCases
      if (attentionCount > 0) {
        attention = `${attentionCount} ${attentionCount === 1 ? "case needs" : "cases need"} your attention`
      }
    }
  } else {
    unavailableReason = UNAVAILABLE
    status = "unavailable"
  }

  if (sources.guard.status === "ready") {
    actions.push({ label: "Open Relaunch Guard", href: "/portal/guard" })
    const locations = sources.guard.locations
    const names = businessContext(locations.map(location => location.businessName))
    const recorded = locations.filter(location => location.monitoringActive).length
    if (locations.length === 0) context.push("No covered locations are on file.")
    else if (recorded > 0) {
      const recordedText = `Monitoring is recorded for ${recorded} ${recorded === 1 ? "location" : "locations"}.`
      context.push(names ? `${names}. ${recordedText}` : recordedText)
    } else if (names) context.push(sentence(names))
    if (status === "unavailable" && sources.recovery.status === "unavailable") status = "open"
    else if (sources.recovery.status === "ready") status = "open"
  } else if (sources.recovery.status === "ready") {
    status = actions.length > 0 ? "open" : "exploring"
    unavailableReason = unavailableReason ?? "We couldn't confirm Relaunch Guard just now. This does not say whether it has been set up."
  }

  const commercial = sources.commercial
  if (commercial && commercial.reads.guard !== "ok") {
    context.push("Relaunch Guard: Status temporarily unavailable.")
    if (sources.guard.status === "ready") {
      unavailableReason = sources.recovery.status === "unavailable" && unavailableReason
        ? `${unavailableReason} ${GUARD_DETAILS_UNAVAILABLE}`
        : GUARD_DETAILS_UNAVAILABLE
      status = "open"
    }
  } else if (commercial) {
    const statuses = contributingStatuses(commercial.businesses, "guard")
    const label = summaryLabel(statuses)
    context.push(sentence(`Relaunch Guard: ${label}`))
    const detail = detailLines(commercial.businesses, "guard")
    if (detail) context.push(sentence(detail))
    const locations = commercial.businesses.flatMap(business => business.guard.locations)
    if (locations.some(location => location.allocation === "preview" && location.monitoringRecorded)) {
      context.push("Your existing Guard monitoring is unchanged.")
    }
    const next = locations.find(location => location.nextStep)?.nextStep ?? null
    if (next && !attention) attention = next
    if (label === STATUS_LABEL.not_subscribed && requestAccessAction.profile) actions.push(requestAccessAction.profile)
  }

  if (sources.recovery.status === "ready" && hasCases(sources.recovery.dashboard) && status === "unavailable") {
    status = "open"
  }

  return {
    key: "profilerelaunch",
    name: "ProfileRelaunch",
    description: "Recovery, Review Protection and Relaunch Guard sit under ProfileRelaunch.",
    services: PROFILE_SERVICES,
    mark: "profilerelaunch",
    status,
    context: joinParts(context),
    actions,
    attention,
    unavailableReason,
  }
}

function telloyaCard(commercial?: CommercialProjection): ProductCard {
  const base = {
    key: "telloya" as const,
    name: "Telloya",
    description: "Your AI receptionist for missed-call handling, customer enquiries and callback follow-up.",
    services: TELLOYA_SERVICES,
    mark: "telloya" as const,
    actions: [] as ProductAction[],
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
  const statuses = contributingStatuses(commercial.businesses, "telloya")
  const label = summaryLabel(statuses)
  const locations = commercial.businesses.flatMap(business => business.telloya.locations)
  const next = locations.find(location => location.nextStep)?.nextStep
    ?? (statuses.includes("pending") ? TELLOYA_NOT_ACTIVE : null)
  const lines = detailLines(commercial.businesses, "telloya")
  const context = label === STATUS_LABEL.not_subscribed
    ? "There is no Telloya subscription on this account."
    : lines
  return {
    ...base,
    status: label === STATUS_UNAVAILABLE ? "unavailable" : "exploring",
    statusLabel: label,
    context: context ? sentence(context) : context,
    actions: label === STATUS_LABEL.not_subscribed && requestAccessAction.telloya ? [requestAccessAction.telloya] : [],
    attention: label === STATUS_UNAVAILABLE ? null : next,
    unavailableReason: label === STATUS_UNAVAILABLE ? UNAVAILABLE : TELLOYA_NO_WORKSPACE,
  }
}

export function presentProducts(sources: ProductSources): ProductCard[] {
  return [profileCard(sources), telloyaCard(sources.commercial)]
}

export function productStatusLabel(status: ProductPresentationStatus): string {
  if (status === "open") return "You can open this"
  if (status === "exploring") return "Being explored"
  return "Unavailable right now"
}
