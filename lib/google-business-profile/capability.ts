// Capability states a caller may observe. Callers must read these rather than
// re-deriving availability from configuration fragments.
export const providerCapabilityStates = [
  "MANUAL",
  "NOT_CONFIGURED",
  "AVAILABLE",
  "DEGRADED",
  "REVOKED",
  "QUOTA_LIMITED",
  "AUTH_REQUIRED",
  "ERROR",
] as const

export type ProviderCapabilityState = (typeof providerCapabilityStates)[number]

export const providerModes = ["manual", "google"] as const
export type ProviderMode = (typeof providerModes)[number]

// `mock` is deliberately absent from `providerModes`: it can never be named by
// configuration and is only reachable by passing the adapter in directly.
export type ResolvedProviderKind = ProviderMode | "mock"

export type ProviderReadPermissions = {
  accounts: boolean
  locations: boolean
  profile: boolean
  reviews: boolean
  automatedGuardObservations: boolean
}

export type ProviderCapability = {
  state: ProviderCapabilityState
  mode: ProviderMode
  // True whenever Guard must keep using the Step 17 manual workflow.
  manualFallbackActive: boolean
  reads: ProviderReadPermissions
  // Safe for Admin display. Never carries provider payloads or secrets.
  detail: string
}

const noReads: ProviderReadPermissions = {
  accounts: false,
  locations: false,
  profile: false,
  reviews: false,
  automatedGuardObservations: false,
}

export function noProviderReads(): ProviderReadPermissions {
  return { ...noReads }
}

export function allProviderReads(): ProviderReadPermissions {
  return {
    accounts: true,
    locations: true,
    profile: true,
    reviews: true,
    automatedGuardObservations: true,
  }
}

const capabilityLabels: Record<ProviderCapabilityState, string> = {
  MANUAL: "Manual mode",
  NOT_CONFIGURED: "Not configured",
  AVAILABLE: "Connected",
  DEGRADED: "Provider degraded",
  REVOKED: "Authorization revoked",
  QUOTA_LIMITED: "Quota limited",
  AUTH_REQUIRED: "Needs re-authorization",
  ERROR: "Provider error",
}

export function capabilityLabel(state: ProviderCapabilityState): string {
  return capabilityLabels[state]
}

// Only AVAILABLE permits automation. Every other state keeps Guard manual so a
// provider problem can never be mistaken for a healthy profile.
export function capabilityAllowsAutomation(state: ProviderCapabilityState): boolean {
  return state === "AVAILABLE"
}

export function manualCapability(detail = "Google Business Profile checks are recorded manually by an Admin."): ProviderCapability {
  return { state: "MANUAL", mode: "manual", manualFallbackActive: true, reads: noProviderReads(), detail }
}

export function notConfiguredCapability(detail: string): ProviderCapability {
  return { state: "NOT_CONFIGURED", mode: "google", manualFallbackActive: true, reads: noProviderReads(), detail }
}
