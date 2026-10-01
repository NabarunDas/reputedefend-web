import type { ProviderMode } from "./capability"
import {
  type GoogleBusinessProfileEnv,
  googleBusinessProfileMode,
  googleLiveReadiness,
  type LiveReadiness,
} from "./config"
import { manualGoogleBusinessProfileProvider, type ManualAdapterOptions } from "./manual-adapter"
import type { GoogleBusinessProfileProvider } from "./provider"

export type ProviderResolution = {
  provider: GoogleBusinessProfileProvider
  // The mode the configuration asked for, which is not always what resolved.
  requestedMode: ProviderMode
  readiness: LiveReadiness
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
  const readiness = googleLiveReadiness(env)
  const manual = manualGoogleBusinessProfileProvider(options.manual)

  if (!readiness.ready) {
    return { provider: manual, requestedMode, readiness, fallbackReason: readiness.blockers[0] ?? null }
  }
  if (!options.liveProvider) {
    // Fail closed: every gate passed but no live transport was supplied.
    return { provider: manual, requestedMode, readiness, fallbackReason: "live_transport_unavailable" }
  }
  if (options.liveProvider.kind !== "google") {
    // Defence in depth. A non-Google adapter can never be promoted to live.
    return { provider: manual, requestedMode, readiness, fallbackReason: "live_provider_rejected" }
  }
  return { provider: options.liveProvider, requestedMode, readiness, fallbackReason: null }
}
