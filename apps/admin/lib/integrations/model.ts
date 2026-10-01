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

// What a browser may ask for. Consuming a state and storing a connection are
// deliberately absent: those only ever happen inside the server-side callback,
// so a client cannot drive a token exchange or plant a connection row.
export const browserIntegrationOperations = [
  "begin_connect",
  "cancel_connect",
  "revoke_connection",
  "disconnect_connection",
] as const
export type BrowserIntegrationOperation = (typeof browserIntegrationOperations)[number]

export function isBrowserIntegrationOperation(value: unknown): value is BrowserIntegrationOperation {
  return typeof value === "string" && (browserIntegrationOperations as readonly string[]).includes(value)
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
  connection_not_implemented: "This build has no Google connection implementation, so connecting cannot be switched on by configuration.",
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

// Every refusal and cancellation sentence is written here, from the fixed
// classification alone. Nothing a browser or Google sent reaches this wording.
const reasonMessages: Record<string, string> = {
  google_api_disabled: connectDisabledNotice,
  connection_not_implemented: connectDisabledNotice,
  provider_not_configured: "Google Business Profile is not configured on this server.",
  state_replayed: "That authorization link was already used.",
  state_expired: "That authorization link expired. Start again.",
  state_unknown: "That authorization link is not valid.",
  state_malformed: "That authorization link is not valid.",
  state_missing: "That authorization link is not valid.",
  context_mismatch: "That authorization did not start in this session.",
  redirect_mismatch: "That authorization did not start in this session.",
  access_denied: "The Google authorization was declined, so nothing was connected.",
  authorization_failed: "The Google authorization did not complete, so nothing was connected.",
  cancelled_by_admin: "That connection attempt was cancelled.",
  code_missing: "The Google authorization did not complete, so nothing was connected.",
  scope_customer_required: "Choose the customer this connection belongs to.",
  scope_customer_unknown: "Choose the customer this connection belongs to.",
  scope_business_mismatch: "That business does not belong to the chosen customer.",
  scope_location_requires_business: "Choose the business before choosing a location.",
  scope_location_mismatch: "That location does not belong to the chosen business.",
}

export function commandMessage(status?: string, reason?: string): string {
  if (status === "unauthorized") return "Please sign in again."
  if (status === "reauth_required") {
    return "For security, sign out and sign in with a new email code, then try again within five minutes."
  }
  if (status === "conflict") return "That connection changed. Refresh and try again."
  const known = reason ? reasonMessages[reason] : undefined
  if (status === "cancelled") return known ?? "That connection attempt ended without connecting."
  if (status === "rejected") return known ?? "That authorization link is not valid."
  if (status === "denied") return known ?? "That integration action is not allowed."
  if (status === "invalid") return known ?? "Check the form and try again."
  if (status === "success" || status === "accepted") {
    return "The integration record was updated. No Google request was made."
  }
  return "The integration could not be updated."
}
