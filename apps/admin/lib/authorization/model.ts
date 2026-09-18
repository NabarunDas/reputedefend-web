export const agreementKinds = ["SERVICE_AGREEMENT", "CASE_MANAGEMENT_PERMISSION"] as const
export type AgreementKind = (typeof agreementKinds)[number]
export const authorizationOperations = [
  "create_agreement_action", "revoke_action", "create_revocation_action", "admin_revoke_authorization",
] as const
export type AuthorizationOperation = (typeof authorizationOperations)[number]
export const managerOperations = ["verify", "revoke"] as const
export type ManagerOperation = (typeof managerOperations)[number]
export const managerLevels = ["MANAGER", "OWNER"] as const
export type ManagerLevel = (typeof managerLevels)[number]

export const AGREEMENT_WORDING_NOTICE = "Use only owner-approved service wording."
export const AUTHORIZATION_READINESS_NOTE =
  "Authorisation readiness is not payment, quote acceptance, permission to submit, or a workflow transition."
export const MANAGER_PASSWORD_WARNING =
  "Never request or record the customer's Google password or one-time security code."
export const SERVICE_ACCEPTANCE =
  "I have read and agree to this service agreement and scope."
export const PERMISSION_ACCEPTANCE =
  "I authorise ProfileRelaunch to carry out the agreed case-management work described in this permission. This is not payment, Google Manager access, or permission to submit."
export const ACTION_UNAVAILABLE =
  "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link."
export const LOST_LINK_NOTE =
  "This link is shown once. If it is lost, revoke the action and create a new one. The secret cannot be reconstructed from the database."

export type AuthorizationReadiness = {
  businessAuthorityVerified: boolean
  customerEmailVerified: boolean
  serviceAgreementAccepted: boolean
  caseManagementPermissionActive: boolean
  managerAccessVerified: boolean
  authorizationReady: boolean
}

export type CaseAuthorization = {
  caseId: string
  reference: string
  customerId: string
  businessId: string
  locationId: string | null
  track: string
  stage: string
  emailMasked: string
  membershipStatus: string
  readiness: AuthorizationReadiness
  readinessNote: string
  agreements: Array<{ id: string; kind: string; versionNumber: number; title: string; scope: string; contentHash: string; createdAt: string }>
  authorizations: Array<{
    id: string; kind: string; status: string; acceptedAt: string; acceptedEmailMasked: string
    source: string; agreementVersionId: string; recordVersion: number; revokedAt: string | null
  }>
  actions: Array<{
    id: string; kind: string; status: string; expiresAt: string; createdAt: string
    agreementVersionId: string | null; authorizationId: string | null; recordVersion: number
  }>
  managerAccess: {
    id: string; status: string; accessLevel: string; verifiedAt: string | null
    evidence: string; recordVersion: number; revokedAt: string | null
  } | null
}

export function defaultExpiryIso(hours = 48): string {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString()
}

export function isAgreementKind(value: string): value is AgreementKind {
  return (agreementKinds as readonly string[]).includes(value)
}
