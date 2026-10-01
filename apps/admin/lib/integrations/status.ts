import { capabilityAllowsAutomation } from "../../../../lib/google-business-profile/capability"
import type { GoogleBusinessProfileEnv } from "../../../../lib/google-business-profile/config"
import { isProviderFailureCode, type ProviderFailureCode } from "../../../../lib/google-business-profile/errors"
import type { GoogleBusinessProfileProvider } from "../../../../lib/google-business-profile/provider"
import { resolveGoogleBusinessProfileProvider } from "../../../../lib/google-business-profile/resolve"
import {
  blockerLabel,
  capabilityText,
  connectDisabledNotice,
  connectionLabel,
  type ConnectionStatus,
  connectionStatuses,
  failureLabel,
  type IntegrationHealthView,
} from "./model"

// The only connection facts the Admin surface is allowed to see. Ciphertext,
// IV, auth tag and key version are deliberately absent, matching what
// provider_connection_public_json_v1 returns.
export type ConnectionSnapshot = {
  status?: string | null
  connectedAt?: string | null
  revokedAt?: string | null
  tokenExpiresAt?: string | null
  lastSuccessAt?: string | null
  lastErrorCode?: string | null
}

function connectionStatusOf(value: string | null | undefined): ConnectionStatus {
  return (connectionStatuses as readonly string[]).includes(value ?? "")
    ? (value as ConnectionStatus)
    : "NOT_CONNECTED"
}

function failureCodeOf(value: string | null | undefined): ProviderFailureCode | null {
  return isProviderFailureCode(value) ? value : null
}

export type IntegrationHealthInput = {
  env?: GoogleBusinessProfileEnv
  // Null whenever the Step 21 tables are not present, which is the case until
  // the migration is applied. The surface degrades to the configured state.
  connection?: ConnectionSnapshot | null
  lastManualCheckAt?: string | null
  // Injected by a test or by a future activation path. Never by configuration.
  liveProvider?: GoogleBusinessProfileProvider
}

// Builds the Admin-safe health view. Everything it reports comes from fixed
// labels, resolver output and a scrubbed connection row, so no provider
// payload, secret or token can reach the page.
export async function googleIntegrationHealth(
  input: IntegrationHealthInput = {},
): Promise<IntegrationHealthView> {
  const resolution = resolveGoogleBusinessProfileProvider({
    env: input.env,
    manual: { lastManualCheckAt: input.lastManualCheckAt ?? null },
    liveProvider: input.liveProvider,
  })
  const health = await resolution.provider.health()
  const connection = input.connection ?? null
  const storedStatus = connectionStatusOf(connection?.status)
  const lastErrorCode = failureCodeOf(connection?.lastErrorCode) ?? health.lastFailure?.code ?? null
  const blockers = [...resolution.configuration.blockers]
  if (resolution.fallbackReason && !blockers.includes(resolution.fallbackReason)) {
    blockers.push(resolution.fallbackReason)
  }
  // A connection can only be reported when the live provider actually resolved.
  const connectionStatus = resolution.provider.kind === "google" ? storedStatus : "NOT_CONNECTED"
  return {
    key: "google_business_profile",
    label: "Google Business Profile",
    mode: health.capability.mode,
    requestedMode: resolution.requestedMode,
    capability: health.capability.state,
    capabilityText: capabilityText(health.capability.state),
    connection: connectionStatus,
    connectionText: connectionLabel(connectionStatus),
    lastSuccessAt: connection?.lastSuccessAt ?? health.lastSuccessAt ?? null,
    lastErrorCode,
    lastErrorText: lastErrorCode ? failureLabel(lastErrorCode) : null,
    manualFallbackActive: health.capability.manualFallbackActive,
    connectAvailable: blockers.length === 0 && capabilityAllowsAutomation(health.capability.state),
    blockers,
    blockerText: blockers.map(blockerLabel),
    notice: connectDisabledNotice,
  }
}
