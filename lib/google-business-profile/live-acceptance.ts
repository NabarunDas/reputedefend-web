import { type GoogleBusinessProfileEnv, googleLiveAcceptanceEnabled, googleLiveReadiness } from "./config"
import type { GoogleBusinessProfileProvider } from "./provider"

// The sequence to run once Google grants API access and an operator chooses to
// verify it. Each step is a description only; nothing here contacts Google.
export const liveAcceptanceSteps = [
  "oauth_connection",
  "account_listing",
  "location_listing",
  "profile_retrieval",
  "review_retrieval",
  "token_refresh",
  "revoked_authorization",
  "permission_loss",
  "quota_rate_limit",
  "manual_fallback",
] as const

export type LiveAcceptanceStep = (typeof liveAcceptanceSteps)[number]

export const liveAcceptanceStepDescriptions: Record<LiveAcceptanceStep, string> = {
  oauth_connection: "Begin a connection, complete consent and confirm a single-use state is consumed exactly once.",
  account_listing: "List accounts and confirm each maps to a ProfileRelaunch account object.",
  location_listing: "List locations for one account and confirm addresses normalise to a single line.",
  profile_retrieval: "Retrieve one location profile and confirm availability, name, rating and review count map correctly.",
  review_retrieval: "Retrieve reviews for the same location and confirm the latest review reference and timestamp.",
  token_refresh: "Force an access-token refresh and confirm no plaintext token is written or logged.",
  revoked_authorization: "Revoke the grant in the Google account and confirm the capability becomes REVOKED.",
  permission_loss: "Remove the location permission and confirm the failure maps to PERMISSION_DENIED, not HEALTHY.",
  quota_rate_limit: "Drive a 429 and confirm the capability becomes QUOTA_LIMITED and Guard stays manual.",
  manual_fallback: "Disable the API gate mid-run and confirm Guard returns to the manual workflow unchanged.",
}

export type LiveAcceptanceGate =
  | { runnable: true }
  | { runnable: false; reason: "acceptance_flag_missing" | "live_conditions_unmet"; blockers: string[] }

// Fails closed in two independent ways: the dedicated opt-in flag must be
// exactly "true", and every ordinary live condition must also pass. Normal CI
// satisfies neither, so the harness never makes a provider call there.
export function liveAcceptanceGate(env: GoogleBusinessProfileEnv = process.env): LiveAcceptanceGate {
  if (!googleLiveAcceptanceEnabled(env)) {
    return { runnable: false, reason: "acceptance_flag_missing", blockers: ["GOOGLE_LIVE_ACCEPTANCE_ENABLED"] }
  }
  const readiness = googleLiveReadiness(env)
  if (!readiness.ready) return { runnable: false, reason: "live_conditions_unmet", blockers: readiness.blockers }
  return { runnable: true }
}

export type LiveAcceptanceResult =
  | { status: "skipped"; reason: string; blockers: string[] }
  | { status: "completed"; steps: LiveAcceptanceStep[] }

// Runs nothing unless the gate opens. A caller that passes no provider is
// skipped rather than silently treated as a pass.
export async function runLiveAcceptance(options: {
  env?: GoogleBusinessProfileEnv
  provider?: GoogleBusinessProfileProvider
  run?: (step: LiveAcceptanceStep, provider: GoogleBusinessProfileProvider) => Promise<void>
} = {}): Promise<LiveAcceptanceResult> {
  const gate = liveAcceptanceGate(options.env)
  if (!gate.runnable) return { status: "skipped", reason: gate.reason, blockers: gate.blockers }
  if (!options.provider || options.provider.kind !== "google") {
    return { status: "skipped", reason: "live_provider_unavailable", blockers: [] }
  }
  const completed: LiveAcceptanceStep[] = []
  for (const step of liveAcceptanceSteps) {
    if (options.run) await options.run(step, options.provider)
    completed.push(step)
  }
  return { status: "completed", steps: completed }
}
