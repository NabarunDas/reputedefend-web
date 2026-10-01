import type { ProviderCapabilityState } from "./capability"

// Normalised provider failures. Google-specific shapes are mapped to these
// inside the Google adapter so no caller ever sees a raw provider response.
export const providerFailureCodes = [
  "CONFIGURATION_MISSING",
  "AUTH_REVOKED",
  "INSUFFICIENT_SCOPE",
  "PERMISSION_DENIED",
  "ACCOUNT_INACCESSIBLE",
  "LOCATION_UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "TRANSIENT_FAILURE",
  "MALFORMED_RESPONSE",
  "PROVIDER_DISABLED",
] as const

export type ProviderFailureCode = (typeof providerFailureCodes)[number]

export type ProviderFailure = {
  code: ProviderFailureCode
  // Admin-safe sentence. Never contains a provider body, URL, token or secret.
  message: string
  retryable: boolean
  // Whether Guard should fall back to the manual workflow for this failure.
  manualFallback: boolean
}

const failureCapability: Record<ProviderFailureCode, ProviderCapabilityState> = {
  CONFIGURATION_MISSING: "NOT_CONFIGURED",
  AUTH_REVOKED: "REVOKED",
  INSUFFICIENT_SCOPE: "AUTH_REQUIRED",
  PERMISSION_DENIED: "AUTH_REQUIRED",
  ACCOUNT_INACCESSIBLE: "DEGRADED",
  LOCATION_UNAVAILABLE: "DEGRADED",
  QUOTA_EXCEEDED: "QUOTA_LIMITED",
  TRANSIENT_FAILURE: "DEGRADED",
  MALFORMED_RESPONSE: "ERROR",
  PROVIDER_DISABLED: "NOT_CONFIGURED",
}

const failureMessages: Record<ProviderFailureCode, string> = {
  CONFIGURATION_MISSING: "Google Business Profile integration is not configured.",
  AUTH_REVOKED: "The Google authorization was revoked. Reconnect before automated checks can resume.",
  INSUFFICIENT_SCOPE: "The Google authorization is missing a required scope.",
  PERMISSION_DENIED: "Google denied access to this profile.",
  ACCOUNT_INACCESSIBLE: "The Google account is no longer accessible.",
  LOCATION_UNAVAILABLE: "The Google location is no longer available.",
  QUOTA_EXCEEDED: "Google rate or quota limit reached. Automated checks are paused.",
  TRANSIENT_FAILURE: "Google did not respond successfully. This is usually temporary.",
  MALFORMED_RESPONSE: "Google returned a response that could not be read safely.",
  PROVIDER_DISABLED: "Google Business Profile API access is disabled.",
}

const retryableFailures: ProviderFailureCode[] = ["QUOTA_EXCEEDED", "TRANSIENT_FAILURE"]

export function providerFailure(code: ProviderFailureCode): ProviderFailure {
  return {
    code,
    message: failureMessages[code],
    retryable: retryableFailures.includes(code),
    // Every normalised failure keeps Guard on the manual workflow. A provider
    // problem must never be reported as a healthy profile.
    manualFallback: true,
  }
}

export function failureCapabilityState(code: ProviderFailureCode): ProviderCapabilityState {
  return failureCapability[code]
}

export function isProviderFailureCode(value: unknown): value is ProviderFailureCode {
  return typeof value === "string" && (providerFailureCodes as readonly string[]).includes(value)
}
