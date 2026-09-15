export const CASE_TYPES = ["PROFILE_RECOVERY", "REVIEW_PROTECTION"] as const
export type CaseType = (typeof CASE_TYPES)[number]

export const CASE_STATUSES = [
  "RECEIVED",
  "UNDER_REVIEW",
  "AWAITING_CUSTOMER",
  "RECOMMENDATION_READY",
  "CLOSED",
  "CANCELLED",
] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const COMMUNICATION_CHANNELS = ["EMAIL"] as const
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number]

export const COMMUNICATION_DIRECTIONS = ["OUTBOUND", "INBOUND"] as const
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number]

export const COMMUNICATION_STATUSES = ["PENDING", "SENT", "FAILED"] as const
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number]

export const CASE_PUBLIC_REF_PATTERN = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/

const CASE_TYPE_SET = new Set<string>(CASE_TYPES)
const CASE_STATUS_SET = new Set<string>(CASE_STATUSES)

export function isCaseType(value: string): value is CaseType {
  return CASE_TYPE_SET.has(value)
}

export function isCaseStatus(value: string): value is CaseStatus {
  return CASE_STATUS_SET.has(value)
}

/**
 * Validates a database-generated public case reference.
 * TypeScript must not generate these values; PostgreSQL owns generation.
 */
export function isCasePublicRef(value: string): boolean {
  return CASE_PUBLIC_REF_PATTERN.test(value)
}

export function caseTypePrefix(caseType: CaseType): "PR" | "RV" {
  return caseType === "PROFILE_RECOVERY" ? "PR" : "RV"
}

export function isCasePublicRefForType(value: string, caseType: CaseType): boolean {
  return isCasePublicRef(value) && value.startsWith(`${caseTypePrefix(caseType)}-`)
}

/**
 * Maps current /get-help form values onto v1 case types.
 * Does not change the form. `general` has no formal case.
 */
export function mapFormServiceToCaseType(service: string): CaseType | null {
  switch (service) {
    case "profile-recovery":
    case "profile-access":
      return "PROFILE_RECOVERY"
    case "review-protection":
      return "REVIEW_PROTECTION"
    case "general":
      return null
    default:
      return null
  }
}

export function mapFormServiceToIssueSubtype(service: string): string | null {
  if (service === "profile-access") return "ACCESS_VERIFICATION"
  return null
}

export function caseTypeLabel(caseType: CaseType) {
  return caseType === "PROFILE_RECOVERY" ? "Profile Recovery" : "Review Protection"
}
