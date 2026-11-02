import type { CustomerDashboard } from "@/lib/portal/cases/parse"
import { requestAccessAction } from "./enquiry"

/**
 * My Products presentation.
 *
 * ProfileRelaunch covers Recovery, Review Protection and Relaunch Guard.
 * Telloya is the AI receptionist. A card is not a purchase. A case is not a
 * subscription. A failed authoritative read stays unavailable and is not
 * treated as unpurchased. No purchase path and no Telloya workspace are linked.
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
const CASE_IS_NOT_SUBSCRIPTION = "A case is not a subscription."

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

/** Lower rank is the more cautious summary. One active location must not hide a location that is not active. */
const STATUS_RANK: Record<CommercialStatus, number> = {
  unavailable: 0,
  suspended: 1,
  expired: 2,
  cancelled: 3,
  pending: 4,
  setup: 5,
  not_subscribed: 6,
  ready_for_provider: 7,
  pilot: 8,
  active: 9,
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

function worstStatus(statuses: readonly CommercialStatus[]): CommercialStatus {
  return statuses.reduce((worst, status) => STATUS_RANK[status] < STATUS_RANK[worst] ? status : worst)
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
  let statusLabel: string | undefined

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
      context.push(CASE_IS_NOT_SUBSCRIPTION)
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
    statusLabel = STATUS_UNAVAILABLE
    if (sources.guard.status === "ready") {
      unavailableReason = GUARD_DETAILS_UNAVAILABLE
      status = "open"
    } else {
      status = "unavailable"
      unavailableReason = UNAVAILABLE
    }
  } else if (commercial) {
    const locations = commercial.businesses.flatMap(business => business.guard.locations.map(location => ({
      businessName: business.businessName,
      ...location,
    })))
    const businessStatuses = commercial.businesses
      .filter(business => business.guard.locations.length === 0 && business.guard.status !== "not_subscribed")
      .map(business => business.guard.status)
    if (locations.length === 0 && businessStatuses.length === 0) {
      statusLabel = "Not subscribed"
      actions.push(requestAccessAction.profile)
    } else {
      const summary = worstStatus([...locations.map(location => location.status), ...businessStatuses])
      statusLabel = STATUS_LABEL[summary]
      const detail = [
        ...locations.map(location => `${location.businessName}, ${location.locationName}: ${STATUS_LABEL[location.status]}`),
        ...commercial.businesses
          .filter(business => business.guard.locations.length === 0 && business.guard.status !== "not_subscribed")
          .map(business => `${business.businessName}: ${STATUS_LABEL[business.guard.status]}`),
      ].join(". ")
      if (detail) context.push(sentence(detail))
      const keepsMonitoring = locations.some(location => location.allocation === "preview" && location.monitoringRecorded)
      if (keepsMonitoring) context.push("Your existing Guard monitoring is unchanged.")
      const next = locations.find(location => location.nextStep)?.nextStep ?? null
      if (next && !attention) attention = next
      if (summary === "not_subscribed") actions.push(requestAccessAction.profile)
    }
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
    statusLabel,
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
  const locations = commercial.businesses.flatMap(business => business.telloya.locations.map(location => ({
    businessName: business.businessName,
    ...location,
  })))
  const businessStatuses = commercial.businesses
    .filter(business => business.telloya.locations.length === 0 && business.telloya.status !== "not_subscribed")
    .map(business => business.telloya.status)
  if (locations.length === 0 && businessStatuses.length === 0) {
    return {
      ...base,
      status: "exploring",
      statusLabel: "Not subscribed",
      context: "There is no Telloya subscription on this account.",
      actions: [requestAccessAction.telloya],
      attention: null,
      unavailableReason: TELLOYA_NO_WORKSPACE,
    }
  }
  const status = worstStatus([...locations.map(location => location.status), ...businessStatuses])
  const next = locations.find(location => location.nextStep)?.nextStep
    ?? (status === "pending" || businessStatuses.includes("pending") ? TELLOYA_NOT_ACTIVE : null)
  const context = [
    ...locations.map(location => `${location.businessName}, ${location.locationName}: ${STATUS_LABEL[location.status]}`),
    ...commercial.businesses
      .filter(business => business.telloya.locations.length === 0 && business.telloya.status !== "not_subscribed")
      .map(business => `${business.businessName}: ${STATUS_LABEL[business.telloya.status]}`),
  ].join(". ")
  return {
    ...base,
    status: status === "unavailable" ? "unavailable" : "exploring",
    statusLabel: STATUS_LABEL[status],
    context: context ? sentence(context) : context,
    actions: status === "not_subscribed" ? [requestAccessAction.telloya] : [],
    attention: next,
    unavailableReason: status === "unavailable" ? UNAVAILABLE : TELLOYA_NO_WORKSPACE,
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
