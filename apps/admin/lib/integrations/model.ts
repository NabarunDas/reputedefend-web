import {
  capabilityLabel,
  type ProviderCapabilityState,
  type ProviderMode,
} from "../../../../lib/google-business-profile/capability"
import type { ProviderFailureCode } from "../../../../lib/google-business-profile/errors"
import { containsTokenMaterial } from "../../../../lib/google-business-profile/token-crypto"

export const integrationKeys = ["google_business_profile"] as const
export type IntegrationKey = (typeof integrationKeys)[number]

export function isIntegrationKey(value: unknown): value is IntegrationKey {
  return typeof value === "string" && (integrationKeys as readonly string[]).includes(value)
}

// Operations the Admin surface may ask the server to perform. Every one of
// them is refused while the Google API gate is off; they exist so the wiring
// and audit trail are in place for a later activation decision.
export const integrationOperations = [
  "begin_connect",
  "consume_state",
  "cancel_connect",
  "store_connection",
  "revoke_connection",
  "disconnect_connection",
  "record_fault",
] as const
export type IntegrationOperation = (typeof integrationOperations)[number]

export function isIntegrationOperation(value: unknown): value is IntegrationOperation {
  return typeof value === "string" && (integrationOperations as readonly string[]).includes(value)
}

export const connectionStatuses = ["NOT_CONNECTED", "CONNECTED", "REVOKED", "EXPIRED"] as const
export type ConnectionStatus = (typeof connectionStatuses)[number]

const connectionLabels: Record<ConnectionStatus, string> = {
  NOT_CONNECTED: "Not connected",
  CONNECTED: "Connected",
  REVOKED: "Authorization revoked",
  EXPIRED: "Authorization expired",
}

export function connectionLabel(status: ConnectionStatus): string {
  return connectionLabels[status]
}

const failureLabels: Record<ProviderFailureCode, string> = {
  CONFIGURATION_MISSING: "Integration not configured",
  AUTH_REVOKED: "Authorization revoked",
  INSUFFICIENT_SCOPE: "Missing required scope",
  PERMISSION_DENIED: "Permission denied",
  ACCOUNT_INACCESSIBLE: "Account inaccessible",
  LOCATION_UNAVAILABLE: "Location unavailable",
  QUOTA_EXCEEDED: "Quota or rate limit reached",
  TRANSIENT_FAILURE: "Temporary provider failure",
  MALFORMED_RESPONSE: "Unreadable provider response",
  PROVIDER_DISABLED: "Provider disabled",
}

export function failureLabel(code: ProviderFailureCode): string {
  return failureLabels[code]
}

const blockerLabels: Record<string, string> = {
  provider_mode_manual: "Provider mode is manual.",
  api_disabled: "Google Business Profile API access is disabled.",
  oauth_not_configured: "No Google OAuth client is configured on the server.",
  token_key_missing: "No server-side token encryption key is configured.",
  live_transport_unavailable: "No live Google transport is available in this build.",
  live_provider_rejected: "The supplied provider was not a Google adapter and was rejected.",
}

export function blockerLabel(code: string): string {
  return blockerLabels[code] ?? "A required live condition is not met."
}

// The one sentence the disabled connect surface shows. Fixed wording so the UI
// cannot imply a working connection.
export const connectDisabledNotice = "Google Business Profile connection is not enabled yet."

export type IntegrationHealthView = {
  key: IntegrationKey
  label: string
  mode: ProviderMode
  requestedMode: ProviderMode
  capability: ProviderCapabilityState
  capabilityText: string
  connection: ConnectionStatus
  connectionText: string
  lastSuccessAt: string | null
  lastErrorCode: ProviderFailureCode | null
  lastErrorText: string | null
  manualFallbackActive: boolean
  // False until a separate activation decision enables every live condition.
  connectAvailable: boolean
  blockers: string[]
  blockerText: string[]
  notice: string
}

// Belt and braces: an Admin view is built from fixed labels only, but it is
// also checked so a future field cannot smuggle token material into the page.
export function healthViewIsSafe(view: IntegrationHealthView): boolean {
  return !containsTokenMaterial(view)
}

export function capabilityText(state: ProviderCapabilityState): string {
  return capabilityLabel(state)
}

export function commandMessage(status?: string, reason?: string): string {
  if (status === "unauthorized") return "Please sign in again."
  if (status === "reauth_required") {
    return "For security, sign out and sign in with a new email code, then try again within five minutes."
  }
  if (status === "conflict") return "That connection changed. Refresh and try again."
  if (status === "denied" && reason === "google_api_disabled") {
    return connectDisabledNotice
  }
  if (status === "denied" && reason === "provider_not_configured") {
    return "Google Business Profile is not configured on this server."
  }
  if (status === "denied" && reason === "state_replayed") return "That authorization link was already used."
  if (status === "denied" && reason === "state_expired") return "That authorization link expired. Start again."
  if (status === "denied" && reason === "context_mismatch") return "That authorization did not start in this session."
  if (status === "denied") return "That integration action is not allowed."
  if (status === "invalid") return "Check the form and try again."
  if (status === "success") return "The integration record was updated. No Google request was made."
  return "The integration could not be updated."
}
