import { manualCapability, type ProviderCapability } from "./capability"
import { providerFailure } from "./errors"
import {
  type GoogleBusinessProfileProvider,
  type ProviderAccount,
  type ProviderConnectionState,
  type ProviderHealth,
  type ProviderLocation,
  type ProviderProfileSnapshot,
  type ProviderResult,
  providerError,
  type ProviderReviewSnapshot,
} from "./provider"

const disconnected: ProviderConnectionState = {
  status: "NOT_CONNECTED",
  connectionRef: null,
  grantedScopes: [],
  connectedAt: null,
  revokedAt: null,
  expiresAt: null,
}

export type ManualAdapterOptions = {
  // Supplied by the Admin surface so health can show when an Admin last
  // recorded a manual Guard observation. Never provider-sourced.
  lastManualCheckAt?: string | null
}

// The production-safe adapter. It performs no network access of any kind and
// needs no Google credentials. Every read fails closed with PROVIDER_DISABLED
// so a caller cannot mistake silence for an empty profile.
export function manualGoogleBusinessProfileProvider(
  options: ManualAdapterOptions = {},
): GoogleBusinessProfileProvider {
  const unavailable = <T>(): ProviderResult<T> => providerError<T>(providerFailure("PROVIDER_DISABLED"))
  const capability = (): ProviderCapability => manualCapability()
  return {
    kind: "manual",
    async capability() {
      return capability()
    },
    async listAccounts(): Promise<ProviderResult<ProviderAccount[]>> {
      return unavailable<ProviderAccount[]>()
    },
    async listLocations(): Promise<ProviderResult<ProviderLocation[]>> {
      return unavailable<ProviderLocation[]>()
    },
    // Manual mode never fabricates profile or review data. An Admin records
    // what they observed through the existing Step 17 workflow instead.
    async profileSnapshot(): Promise<ProviderResult<ProviderProfileSnapshot>> {
      return unavailable<ProviderProfileSnapshot>()
    },
    async reviewSnapshot(): Promise<ProviderResult<ProviderReviewSnapshot>> {
      return unavailable<ProviderReviewSnapshot>()
    },
    async connectionState() {
      return { ...disconnected }
    },
    async health(): Promise<ProviderHealth> {
      return {
        capability: capability(),
        connection: { ...disconnected },
        lastSuccessAt: options.lastManualCheckAt ?? null,
        lastFailure: null,
      }
    },
  }
}
