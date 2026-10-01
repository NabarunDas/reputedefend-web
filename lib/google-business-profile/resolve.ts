import {
  capabilityLabel,
  type ProviderCapabilityState,
  type ProviderMode,
} from "./capability"
import {
  googleBusinessProfileApiEnabled,
  type GoogleBusinessProfileEnv,
  googleBusinessProfileMode,
  googleLiveConfiguration,
  type LiveConfiguration,
} from "./config"
import { manualGoogleBusinessProfileProvider, type ManualAdapterOptions } from "./manual-adapter"
import type { GoogleBusinessProfileProvider } from "./provider"

export type ProviderResolution = {
  provider: GoogleBusinessProfileProvider
  // The mode the configuration asked for, which is not always what resolved.
  requestedMode: ProviderMode
  // Configuration only. A complete configuration still resolves to manual
  // unless a caller also supplies a live provider built on a real transport.
  configuration: LiveConfiguration
  // Why the live adapter was not used, if it was not.
  fallbackReason: string | null
}

export type ResolveOptions = {
  env?: GoogleBusinessProfileEnv
  manual?: ManualAdapterOptions
  // Supplied only by a caller that has already built a live adapter with a
  // real transport. No production code path passes this today, so live
  // execution remains unavailable even if every gate were switched on.
  liveProvider?: GoogleBusinessProfileProvider
}

// The single place a provider is chosen. There is no branch that can produce
// the mock adapter: the mock is reachable only by passing it to a caller
// directly in a test, never by configuration.
export function resolveGoogleBusinessProfileProvider(options: ResolveOptions = {}): ProviderResolution {
  const env = options.env ?? process.env
  const requestedMode = googleBusinessProfileMode(env)
  const configuration = googleLiveConfiguration(env)
  const manual = manualGoogleBusinessProfileProvider(options.manual)

  if (!configuration.configured) {
    return { provider: manual, requestedMode, configuration, fallbackReason: configuration.blockers[0] ?? null }
  }
  if (!options.liveProvider) {
    // Fail closed: configuration is complete but no live transport exists.
    return { provider: manual, requestedMode, configuration, fallbackReason: "live_transport_unavailable" }
  }
  if (options.liveProvider.kind !== "google") {
    // Defence in depth. A non-Google adapter can never be promoted to live.
    return { provider: manual, requestedMode, configuration, fallbackReason: "live_provider_rejected" }
  }
  return { provider: options.liveProvider, requestedMode, configuration, fallbackReason: null }
}

// The capability implied by configuration alone, with no adapter constructed
// and no provider call. Used by the synchronous Admin system-configuration
// list so it reports the same thing the resolver would.
export function configuredCapabilityState(env: GoogleBusinessProfileEnv = process.env): ProviderCapabilityState {
  if (googleBusinessProfileMode(env) !== "google") return "MANUAL"
  return "NOT_CONFIGURED"
}

export type ConfiguredStatusLabel = "Manual mode" | "Disabled" | "Not configured"

// Admin-facing label for the system configuration list. "Disabled" is shown
// only when Google was asked for and the API gate is the thing holding it
// back, so an Admin can tell "never set up" from "set up but switched off".
export function configuredStatusLabel(env: GoogleBusinessProfileEnv = process.env): ConfiguredStatusLabel {
  if (googleBusinessProfileMode(env) !== "google") return capabilityLabel("MANUAL") as "Manual mode"
  if (!googleBusinessProfileApiEnabled(env)) return "Disabled"
  return capabilityLabel("NOT_CONFIGURED") as "Not configured"
}
