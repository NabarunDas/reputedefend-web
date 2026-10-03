export const serviceCodes = ["GUIDED_RELAUNCH", "MANAGED_RELAUNCH", "GUIDED_REVIEW", "MANAGED_REVIEW", "RELAUNCH_GUARD"] as const
export type ServiceCode = (typeof serviceCodes)[number]
export const priceStatuses = ["DRAFT", "APPROVED", "RETIRED"] as const
export const quoteStatuses = ["DRAFT", "OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "SUPERSEDED", "CANCELLED"] as const
export const taxBehaviours = ["UNCONFIRMED", "INCLUSIVE", "EXCLUSIVE", "NOT_APPLICABLE"] as const
export const catalogueOperations = ["create_price_version", "approve_price_version", "retire_price_version"] as const
export const quoteOperations = [
  "create_draft", "create_version", "set_draft_tax", "offer", "supersede", "cancel",
  "record_qualification", "create_quote_acceptance_action", "revoke_action",
] as const
export type CatalogueOperation = (typeof catalogueOperations)[number]
export type QuoteOperation = (typeof quoteOperations)[number]

export const LOST_QUOTE_LINK_NOTE = "Copy the customer link now. The secret cannot be shown again."

export type PriceVersion = {
  id: string
  serviceCode: string
  displayName: string
  amountMinor: number
  currency: string
  paymentModel: string
  billingCadence: string
  billingUnit: string
  effectiveFrom: string
  effectiveTo: string | null
  status: string
  taxBehaviour: string
  taxJurisdiction: string | null
  taxRateBps: number | null
  taxCode: string | null
  createdAt: string
  approvedAt: string | null
  retiredAt: string | null
  version: number
  seedKey: string | null
}

export type QuoteListItem = {
  id: string
  publicRef: string
  status: string
  version: number
  customerId: string
  customerName: string
  businessName: string
  locationName: string | null
  caseId: string | null
  caseReference: string | null
  monitoringRequestId: string | null
  acceptedAt: string | null
  orderId: string | null
  orderRef: string | null
  action: { id: string; status: string; expiresAt: string; kind: string } | null
  currentVersion: {
    id: string
    versionNumber: number
    status: string
    serviceCode: string
    serviceName: string
    paymentModel: string
    scope: string
    exclusions: string
    successDefinition: string
    standardAmountMinor: number
    discountPolicyId: string
    discountBps: number
    discountAmountMinor: number
    quotedSubtotalMinor: number
    taxBehaviour: string
    taxAmountMinor: number
    totalAmountMinor: number
    currency: string
    validUntil: string
    paymentTiming: string
    offeredAt: string | null
    discountSnapshot: {
      result: string
      reasonCode: string
      policyId: string
      coverageBasis: string
      coverageStatus: string
      paidVsIncluded: string
      issuePredatesPaidCoverage: boolean
    } | null
  }
}

export type ServiceOrder = {
  id: string
  publicRef: string
  quoteId: string
  quoteRef: string
  quoteVersionId: string
  customerName: string
  businessName: string
  caseReference: string | null
  /** Present on `admin_order_list_v1`. Null when the order is not on a case. */
  caseId?: string | null
  serviceCode: string
  amountMinor: number
  currency: string
  paymentModel: string
  taxBehaviour: string
  taxAmountMinor: number
  state: string
  acceptedAt: string
}

export type CatalogueList = { prices: PriceVersion[] }
export type QuoteList = { quotes: QuoteListItem[] }
export type OrderList = { orders: ServiceOrder[] }

export function formatGbp(minor: number): string {
  if (!Number.isInteger(minor)) return "—"
  const sign = minor < 0 ? "-" : ""
  const absolute = Math.abs(minor)
  return `${sign}£${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

export function serviceLabel(code: string): string {
  if (code === "GUIDED_RELAUNCH") return "Guided Relaunch"
  if (code === "MANAGED_RELAUNCH") return "Managed Relaunch"
  if (code === "GUIDED_REVIEW") return "Guided Review"
  if (code === "MANAGED_REVIEW") return "Managed Review"
  if (code === "RELAUNCH_GUARD") return "Relaunch Guard"
  return code
}

export function paymentModelLabel(value: string): string {
  if (value === "UPFRONT") return "Upfront"
  if (value === "SUCCESS_FEE") return "Success fee"
  if (value === "RECURRING_MONTHLY") return "Recurring monthly"
  return value
}

export function taxLabel(value: string): string {
  if (value === "UNCONFIRMED") return "Unconfirmed"
  if (value === "INCLUSIVE") return "Inclusive"
  if (value === "EXCLUSIVE") return "Exclusive"
  if (value === "NOT_APPLICABLE") return "Not applicable"
  return value
}

export function quoteStatusLabel(value: string): string {
  if (value === "DRAFT") return "Draft"
  if (value === "OFFERED") return "Offered"
  if (value === "ACCEPTED") return "Accepted"
  if (value === "DECLINED") return "Declined"
  if (value === "EXPIRED") return "Expired"
  if (value === "SUPERSEDED") return "Superseded"
  if (value === "CANCELLED") return "Cancelled"
  return value
}

export function orderStateLabel(value: string): string {
  if (value === "ACCEPTED_AWAITING_PAYMENT") return "Accepted — awaiting later payment"
  if (value === "ACCEPTED_SUCCESS_FEE") return "Accepted success-fee order"
  if (value === "ACCEPTED_RECURRING") return "Accepted recurring Guard order"
  return value
}
