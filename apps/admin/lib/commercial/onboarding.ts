import { isUuid } from "../records/model"

export const onboardingProducts = ["TELLOYA", "COMPLETE"] as const
export type OnboardingProduct = (typeof onboardingProducts)[number]
export const productLabels: Record<OnboardingProduct, string> = { TELLOYA: "Telloya", COMPLETE: "Complete" }

export const onboardingOperations = [
  "classify",
  "review",
  "match_customer",
  "match_business",
  "select_locations",
  "mark_ready",
  "decline",
  "prepare_offer",
] as const
export type OnboardingOperation = (typeof onboardingOperations)[number]

export const operationLabels: Record<OnboardingOperation, string> = {
  classify: "Product chosen",
  review: "Review recorded",
  match_customer: "Customer matched",
  match_business: "Business matched",
  select_locations: "Locations chosen",
  mark_ready: "Ready for a later invitation",
  decline: "Declined",
  prepare_offer: "Offer prepared from the approved plan",
}

export const stateLabels: Record<string, string> = {
  RECEIVED: "Received",
  IN_REVIEW: "In review",
  MAILBOX_REQUIRED: "Waiting for email verification",
  OFFERED: "Offer prepared",
  INVITED: "Invitation recorded",
  AWAITING_PAYMENT: "Awaiting payment",
  PROVISIONING: "Provisioning",
  READY: "Ready",
  CLOSED: "Closed",
  DECLINED: "Declined",
}

type Person = { id: string; name: string; emailVerified: boolean }
type BusinessMatch = { id: string; name: string; membership: "pending" | "verified" | "revoked"; membershipVersion: number }
type LocationMatch = { id: string; name: string; country: string; selected: boolean }
type HistoryEvent = { id: string; operation: OnboardingOperation; fromState: string | null; toState: string; reason: string; createdAt: string }

export type OnboardingRequest = {
  id: string
  product: OnboardingProduct
  state: string
  version: number
  customerId: string | null
  businessId: string | null
  declineReason: string | null
  subscriptionId: string | null
}

export type OnboardingView =
  | { supported: false }
  | {
      supported: true
      productHint: OnboardingProduct | null
      step: "classify" | "customer" | "business" | "locations" | "next"
      termsConfigured: boolean
      invitationReady: boolean
      invitationSent: false
      emailVerified: boolean
      contactVerified: boolean
      membership: "pending" | "verified" | "revoked" | null
      outstanding: string[]
      nextAction: string | null
      request: OnboardingRequest | null
      customer: (Person & { version: number }) | null
      candidates: Person[]
      businesses: BusinessMatch[]
      locations: LocationMatch[]
      history: HistoryEvent[]
    }

export type OnboardingCommand = {
  operation: OnboardingOperation
  version: number
  payload: Record<string, unknown>
}

const reasonOf = (value: unknown) => (typeof value === "string" && value.trim().length >= 10 && value.trim().length <= 1000 ? value.trim() : null)
const productOf = (value: unknown): OnboardingProduct | null => (value === "TELLOYA" || value === "COMPLETE" ? value : null)
const membershipOf = (value: unknown) => (value === "pending" || value === "verified" ? value : null)
const textOf = (value: unknown, max: number) => (typeof value === "string" && value.length <= max ? value : null)
const versionOf = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null)
const idsOf = (value: unknown) => (Array.isArray(value) && value.every(isUuid) && value.length <= 20 ? value : null)

export function parseOnboardingCommand(body: unknown): OnboardingCommand | null {
  if (!body || typeof body !== "object") return null
  const raw = body as Record<string, unknown>
  const operation = onboardingOperations.find(item => item === raw.operation)
  const version = versionOf(raw.version)
  const enquiryId = isUuid(raw.enquiryId) ? raw.enquiryId : null
  const reason = reasonOf(raw.reason)
  if (!operation || version === null || !enquiryId || !reason) return null
  const base = { enquiryId, reason }
  if (operation === "classify") {
    const product = productOf(raw.product)
    if (version !== 0 || !product) return null
    return { operation, version, payload: { ...base, product } }
  }
  if (operation === "match_customer") {
    if (raw.customerId !== undefined && !isUuid(raw.customerId)) return null
    if (raw.create !== undefined && raw.create !== true) return null
    if (raw.customerId === undefined && raw.create !== true) return null
    return { operation, version, payload: { ...base, ...(isUuid(raw.customerId) ? { customerId: raw.customerId } : {}), ...(raw.create === true ? { create: true } : {}) } }
  }
  if (operation === "match_business") {
    const membership = membershipOf(raw.membership)
    if (!membership) return null
    if (raw.businessId !== undefined && !isUuid(raw.businessId)) return null
    if (isUuid(raw.businessId)) return { operation, version, payload: { ...base, businessId: raw.businessId, membership } }
    const name = textOf(raw.name, 200)
    const website = textOf(raw.website, 2048)
    if (raw.create !== true || !name || name.trim().length < 1 || website === null) return null
    return { operation, version, payload: { ...base, create: true, name: name.trim(), website, membership } }
  }
  if (operation === "select_locations") {
    const locationIds = idsOf(raw.locationIds) ?? []
    const create = raw.create === true
    if (raw.create !== undefined && raw.create !== true) return null
    if (!create && locationIds.length < 1) return null
    const locationName = textOf(raw.locationName, 200)
    const country = textOf(raw.country, 100)
    if (create && (locationName === null || country === null || country.trim().length < 1)) return null
    return {
      operation,
      version,
      payload: {
        ...base,
        locationIds,
        ...(create ? { create: true, locationName: locationName ?? "", country: country?.trim() ?? "" } : {}),
      },
    }
  }
  if (operation === "prepare_offer") {
    if (raw.planVersionId !== undefined && !isUuid(raw.planVersionId)) return null
    return { operation, version, payload: { ...base, ...(isUuid(raw.planVersionId) ? { planVersionId: raw.planVersionId } : {}) } }
  }
  return { operation, version, payload: base }
}
