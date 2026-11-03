import type { CustomerDashboard } from "@/lib/portal/cases/parse"
import type { OnboardingRead } from "@/lib/portal/onboarding/types"
import { requestAccessAction } from "./enquiry"

/**
 * My Products launcher.
 *
 * ProfileRelaunch is the company. Recovery & Review Support, Relaunch Guard
 * and Telloya are three services under that brand. A case is not a subscription.
 * Signing in does not start a subscription. Those rules stay in the presenter
 * and out of the customer-facing sentences. A failed authoritative read stays
 * unavailable and is not treated as unpurchased. A Guard query that succeeds
 * is not coverage and does not open a dashboard. No purchase path and no
 * Telloya workspace are linked.
 */

export type ProductKey = "recovery" | "guard" | "telloya"

export type ProductGroup = "yours" | "explore" | "unconfirmed"

export type ProductPresentationStatus = "open" | "exploring" | "unavailable"

export type ProductAction = {
  label: string
  href: string
}

export type ProductCard = {
  key: ProductKey
  name: string
  description: string
  mark: ProductKey
  group: ProductGroup
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
  /** Absent when the onboarding read was not attempted. Unavailable is not "no request". */
  onboarding?: OnboardingRead
}

const PROGRESS_HREF = "/portal/onboarding"

const UNAVAILABLE = "We couldn't confirm this service just now. Refresh the page. This does not say whether it has been set up."
const GUARD_UNCONFIRMED = "We couldn't confirm Relaunch Guard just now. This does not say whether it has been set up."
const GUARD_WORKSPACE_UNCONFIRMED = "We couldn't open Relaunch Guard just now. This does not say whether coverage has changed."
const STATUS_UNAVAILABLE = "Status temporarily unavailable"
const GUARD_DETAILS_UNAVAILABLE = "Some extra details are temporarily unavailable. Monitoring already recorded is unchanged."
const TELLOYA_NOT_ACTIVE = "Telloya is not active yet."
const TELLOYA_NO_WORKSPACE = "There is no Telloya workspace to open yet."
const TELLOYA_CLOSED = "Telloya is not open in your portal yet."
const PARTIALLY_ACTIVE = "Partially active"
const STATUS_VARIES = "Status varies by location"
const OPEN_DASHBOARD: ProductAction = { label: "Open dashboard", href: "" }

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

function openDashboard(href: "/portal/recovery" | "/portal/guard"): ProductAction {
  return { label: OPEN_DASHBOARD.label, href }
}

function recoveryTile(sources: ProductSources): ProductCard {
  const base = {
    key: "recovery" as const,
    name: "Recovery & Review Support",
    description: "Cases, documents and review help for your Google Business Profile.",
    mark: "recovery" as const,
  }
  if (sources.recovery.status !== "ready") {
    return {
      ...base,
      group: "unconfirmed",
      status: "unavailable",
      statusLabel: STATUS_UNAVAILABLE,
      context: null,
      actions: [],
      attention: null,
      unavailableReason: UNAVAILABLE,
    }
  }
  const dashboard = sources.recovery.dashboard
  if (!hasCases(dashboard)) {
    return {
      ...base,
      group: "explore",
      status: "exploring",
      context: "No cases are open on this account.",
      actions: [requestAccessAction.recovery],
      attention: null,
      unavailableReason: null,
    }
  }
  const rows = [...dashboard.attentionCases, ...dashboard.recentCases]
  const names = businessContext(rows.map(row => row.businessName))
  const attentionCount = dashboard.summary.attentionCases
  const active = dashboard.summary.activeCases > 0 || dashboard.summary.attentionCases > 0
  return {
    ...base,
    group: "yours",
    status: "open",
    statusLabel: active ? "Cases open" : "Previous cases",
    context: names ? sentence(names) : null,
    actions: [openDashboard("/portal/recovery")],
    attention: attentionCount > 0
      ? `${attentionCount} ${attentionCount === 1 ? "case needs" : "cases need"} your attention`
      : null,
    unavailableReason: null,
  }
}

function recordedMonitoring(sources: ProductSources): number {
  if (sources.guard.status !== "ready") return 0
  return sources.guard.locations.filter(location => location.monitoringActive).length
}

function operationalGuardContext(sources: ProductSources): string | null {
  if (sources.guard.status !== "ready") return null
  const locations = sources.guard.locations
  const names = businessContext(locations.map(location => location.businessName))
  const recorded = locations.filter(location => location.monitoringActive).length
  if (locations.length === 0) return "No covered locations are on file."
  const recordedText = recorded > 0
    ? `Monitoring is recorded for ${recorded} ${recorded === 1 ? "location" : "locations"}.`
    : null
  if (recordedText) return names ? `${names}. ${recordedText}` : recordedText
  return names ? sentence(names) : null
}

function guardTile(sources: ProductSources): ProductCard {
  const base = {
    key: "guard" as const,
    name: "Relaunch Guard",
    description: "Monitoring for covered Google Business Profile locations.",
    mark: "guard" as const,
  }
  const commercial = sources.commercial
  const readFailed = !!commercial && commercial.reads.guard !== "ok"
  const commercialOk = !!commercial && commercial.reads.guard === "ok"
  const statuses = commercialOk ? contributingStatuses(commercial.businesses, "guard") : []
  const label = commercialOk ? summaryLabel(statuses) : null
  const recorded = recordedMonitoring(sources)
  const verifiedActive = statuses.includes("active")
  const canOpen = sources.guard.status === "ready" && (verifiedActive || recorded > 0)
  const knownAbsence = label === STATUS_LABEL.not_subscribed
  const recordedEntitlement = label !== null && label !== STATUS_LABEL.not_subscribed && label !== STATUS_UNAVAILABLE
  const group: ProductGroup = recorded > 0 || recordedEntitlement
    ? "yours"
    : label === STATUS_UNAVAILABLE || (!knownAbsence && (readFailed || sources.guard.status === "unavailable"))
      ? "unconfirmed"
      : "explore"

  const context: string[] = []
  if (commercialOk) {
    const detail = detailLines(commercial.businesses, "guard")
    if (detail) context.push(sentence(detail))
    else if (knownAbsence) context.push("There is no Relaunch Guard coverage on this account.")
    const locations = commercial.businesses.flatMap(business => business.guard.locations)
    if (locations.some(location => location.allocation === "preview" && location.monitoringRecorded)) {
      context.push("Your existing Guard monitoring is unchanged.")
    }
    if (recorded > 0) context.push(`Monitoring is recorded for ${recorded} ${recorded === 1 ? "location" : "locations"}.`)
  } else if (sources.guard.status === "ready") {
    const operational = operationalGuardContext(sources)
    if (operational) context.push(operational)
  }
  if (readFailed) context.push("Status temporarily unavailable.")

  const locations = commercialOk ? commercial.businesses.flatMap(business => business.guard.locations) : []
  const next = locations.find(location => location.nextStep)?.nextStep ?? null
  let unavailableReason: string | null = null
  if (readFailed && recorded > 0) unavailableReason = GUARD_DETAILS_UNAVAILABLE
  else if (readFailed || (sources.guard.status === "unavailable" && !commercialOk)) unavailableReason = GUARD_UNCONFIRMED
  else if (sources.guard.status === "unavailable" && group === "yours") unavailableReason = GUARD_WORKSPACE_UNCONFIRMED

  const showLabel = label !== null && !(knownAbsence && recorded > 0) && label !== STATUS_UNAVAILABLE
  return {
    ...base,
    group,
    status: group === "unconfirmed" ? "unavailable" : canOpen ? "open" : "exploring",
    statusLabel: label === STATUS_UNAVAILABLE || group === "unconfirmed" ? STATUS_UNAVAILABLE : showLabel ? label : undefined,
    context: joinParts(context),
    actions: canOpen ? [openDashboard("/portal/guard")] : group === "explore" ? [requestAccessAction.guard] : [],
    attention: label === STATUS_UNAVAILABLE ? null : next,
    unavailableReason,
  }
}

function telloyaTile(commercial?: CommercialProjection): ProductCard {
  const base = {
    key: "telloya" as const,
    name: "Telloya",
    description: "AI receptionist for missed calls, enquiries and callback follow-up.",
    mark: "telloya" as const,
  }
  if (!commercial) {
    return {
      ...base,
      group: "explore",
      status: "exploring",
      context: null,
      actions: requestAccessAction.telloya ? [requestAccessAction.telloya] : [],
      attention: null,
      unavailableReason: TELLOYA_CLOSED,
    }
  }
  if (commercial.reads.telloya !== "ok") {
    return {
      ...base,
      group: "unconfirmed",
      status: "unavailable",
      statusLabel: STATUS_UNAVAILABLE,
      context: null,
      actions: [],
      attention: null,
      unavailableReason: UNAVAILABLE,
    }
  }
  const statuses = contributingStatuses(commercial.businesses, "telloya")
  const label = summaryLabel(statuses)
  const lines = detailLines(commercial.businesses, "telloya")
  if (label === STATUS_UNAVAILABLE) {
    return {
      ...base,
      group: "unconfirmed",
      status: "unavailable",
      statusLabel: STATUS_UNAVAILABLE,
      context: lines ? sentence(lines) : null,
      actions: [],
      attention: null,
      unavailableReason: UNAVAILABLE,
    }
  }
  const locations = commercial.businesses.flatMap(business => business.telloya.locations)
  const next = locations.find(location => location.nextStep)?.nextStep
    ?? (statuses.includes("pending") ? TELLOYA_NOT_ACTIVE : null)
  const subscribed = label !== STATUS_LABEL.not_subscribed
  return {
    ...base,
    group: subscribed ? "yours" : "explore",
    status: "exploring",
    statusLabel: label,
    context: label === STATUS_LABEL.not_subscribed
      ? "There is no Telloya subscription on this account."
      : lines ? sentence(lines) : null,
    actions: !subscribed && requestAccessAction.telloya ? [requestAccessAction.telloya] : [],
    attention: next,
    unavailableReason: TELLOYA_NO_WORKSPACE,
  }
}

function requestLines(requests: readonly { product: string; businessName: string | null; statusLabel: string }[]): string {
  return requests.map(request => {
    const place = request.businessName ? `${request.product} for ${request.businessName}` : request.product
    return `${place}: ${request.statusLabel}.`
  }).join(" ")
}

/**
 * A recorded onboarding request is less authoritative than a real entitlement.
 * It never replaces that status, and a failed read never becomes Not subscribed.
 */
function applyOnboarding(card: ProductCard, onboarding: ProductSources["onboarding"]): ProductCard {
  if (!onboarding || onboarding.status !== "ready" || onboarding.requests.length === 0) return card
  const lines = requestLines(onboarding.requests)
  const labels = [...new Set(onboarding.requests.map(request => request.statusLabel))]
  const summary = labels.length === 1 ? labels[0] : "Status varies by request"
  const authoritative = !!card.statusLabel
    && card.statusLabel !== STATUS_LABEL.not_subscribed
    && card.statusLabel !== STATUS_UNAVAILABLE
  const progress = {
    label: authoritative ? "View progress" : "Track setup",
    href: PROGRESS_HREF,
  }
  if (authoritative) {
    return {
      ...card,
      context: joinParts([card.context, lines]),
      actions: [...card.actions.filter(action => action.href !== PROGRESS_HREF), progress],
    }
  }
  const serviceUnknown = card.statusLabel === STATUS_UNAVAILABLE || card.group === "unconfirmed"
  return {
    ...card,
    group: "yours",
    status: "exploring",
    statusLabel: summary,
    context: lines,
    actions: [progress],
    attention: onboarding.requests.length === 1 ? onboarding.requests[0].nextStep : null,
    unavailableReason: serviceUnknown
      ? "We couldn't confirm the service status just now. This does not say whether the service is active."
      : TELLOYA_NO_WORKSPACE,
  }
}

export function presentProducts(sources: ProductSources): ProductCard[] {
  return [recoveryTile(sources), guardTile(sources), applyOnboarding(telloyaTile(sources.commercial), sources.onboarding)]
}
