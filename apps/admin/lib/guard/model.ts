export const guardOperations = [
  "identify_location",
  "remove_location",
  "mark_mapping_ready",
  "create_direct_coverage",
  "create_included_offer",
  "issue_permission_action",
  "record_baseline",
  "assign_rota",
  "activate",
  "record_activation_exception",
  "acknowledge_exception",
  "revoke_permission",
] as const
export type GuardOperation = (typeof guardOperations)[number]

export type GuardReadiness = {
  coverageId?: string
  state?: string
  projectedState?: string
  coverageBasis?: string
  mappingReady: boolean
  businessMembershipReady: boolean
  permissionReady: boolean
  accessReady: boolean
  contactReady: boolean
  baselineReady: boolean
  rotaReady: boolean
  commercialOrderReady: boolean
  billingReady: boolean
  includedEligibilityReady: boolean
  includedChoiceReady: boolean
  readyToActivate: boolean
  blockerCodes: string[]
  billingState?: string | null
  includedOfferStatus?: string | null
}

export type GuardMapping = {
  id: string
  locationId: string
  locationName?: string | null
  source: string
  status: string
  ordinal: number
  version: number
}

export type GuardRequest = {
  id: string
  status: string
  numberOfLocations: number
  customerId: string
  businessId: string
  locationId: string
  customerName?: string | null
  businessName?: string | null
  locationName?: string | null
  identifiedCount: number
  stillRequired: number
  createdAt: string
  mappings: GuardMapping[]
}

export type GuardCoverage = {
  id: string
  state: string
  coverageBasis: string
  coverageOrigin: string
  customerId: string
  businessId: string
  locationId: string
  customerName?: string | null
  businessName?: string | null
  locationName?: string | null
  monitoringRequestId?: string | null
  serviceOrderId?: string | null
  sourceRecoveryCaseId?: string | null
  sourceManagedOrderId?: string | null
  activatedAt?: string | null
  includedStartAt?: string | null
  includedEndAt?: string | null
  version: number
  billingState: string
  entitlementSource: string
  readiness: GuardReadiness
  exceptionId?: string | null
  exceptionStatus?: string | null
}

export type GuardOrder = {
  id: string
  publicRef: string
  customerId: string
  businessId: string
  locationId: string | null
  monitoringRequestId?: string | null
  state: string
  covered: boolean
}

export type GuardLocation = {
  id: string
  businessId: string
  name?: string | null
  country?: string | null
}

export type GuardList = {
  requests: GuardRequest[]
  coverages: GuardCoverage[]
  guardOrders: GuardOrder[]
  locations: GuardLocation[]
}

export function coverageStateLabel(state: string): string {
  switch (state) {
    case "REQUESTED": return "Requested"
    case "AWAITING_AUTHORIZATION": return "Awaiting authorization"
    case "VERIFYING_ACCESS": return "Verifying access"
    case "BASELINE_REQUIRED": return "Baseline required"
    case "AWAITING_PAYMENT": return "Awaiting payment"
    case "READY_TO_ACTIVATE": return "Ready to activate"
    case "ACTIVE": return "Active"
    case "PAUSED": return "Paused"
    case "ENDING": return "Ending"
    case "ENDED": return "Ended"
    default: return state
  }
}

export function billingStateLabel(state: string): string {
  switch (state) {
    case "NOT_REQUIRED": return "Not required"
    case "PENDING": return "Pending"
    case "CURRENT": return "Current"
    case "PAST_DUE": return "Past due"
    case "PAUSED": return "Paused"
    case "ENDED": return "Ended"
    default: return state
  }
}

export function requestProgressLabel(request: GuardRequest): string {
  return `${request.numberOfLocations} requested / ${request.identifiedCount} identified / ${request.stillRequired} still required`
}
