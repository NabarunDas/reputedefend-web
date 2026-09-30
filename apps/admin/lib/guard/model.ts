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
  "issue_subscription_start_action",
  "create_included_continuation",
  "issue_price_change_action",
  "schedule_period_end_cancellation",
  "undo_scheduled_cancellation",
  "request_immediate_cancellation",
  "approve_refund",
  "approve_service_credit",
  "map_provider_price",
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

export type GuardSubscription = {
  id: string
  locationId: string
  coverageId?: string | null
  continuationId?: string | null
  customerId: string
  businessId: string
  serviceOrderId: string
  locationName?: string | null
  customerName?: string | null
  businessName?: string | null
  lifecycleState: string
  providerStatus: string
  amountMinor: number
  currency: string
  stripePriceId?: string | null
  stripeSubscriptionId?: string | null
  paidThroughAt?: string | null
  billingState?: string | null
  coverageState?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
  latestPaidInvoiceId?: string | null
  latestInvoiceFailure?: string | null
  priceChangeStatus?: string | null
  disputeStatus?: string | null
  refundStatus?: string | null
  reconciliationOpen?: boolean
  version: number
}

export type GuardContinuation = {
  id: string
  includedCoverageId: string
  serviceOrderId: string
  status: string
  locationId: string
  scheduledStartAt?: string | null
  version: number
}

export type GuardReminder = {
  id: string
  coverageId: string
  offsetDays: number
  dueAt: string
  status: string
}

export type GuardAdjustment = {
  id: string
  subscriptionId: string
  kind: string
  status: string
  amountMinor: number
  approvedAmountMinor?: number | null
}

export type GuardList = {
  requests: GuardRequest[]
  coverages: GuardCoverage[]
  guardOrders: GuardOrder[]
  locations: GuardLocation[]
  subscriptions?: GuardSubscription[]
  continuations?: GuardContinuation[]
  reminders?: GuardReminder[]
  adjustments?: GuardAdjustment[]
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
