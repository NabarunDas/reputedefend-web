import { allProviderReads, noProviderReads, type ProviderCapability } from "../capability"
import { failureCapabilityState, type ProviderFailureCode, providerFailure } from "../errors"
import {
  type GoogleBusinessProfileProvider,
  type ProviderAccount,
  type ProviderConnectionState,
  type ProviderHealth,
  type ProviderLocation,
  type ProviderProfileSnapshot,
  type ProviderResult,
  providerError,
  providerOk,
  type ProviderReviewSnapshot,
  type ProviderSnapshotRequest,
} from "../provider"

// Every synthetic identifier carries this prefix so a fixture can never be
// mistaken for a real Google resource if one ever reached a database.
export const syntheticPrefix = "SYNTHETIC-TEST-"

export function isSyntheticRef(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(syntheticPrefix)
}

function assertTestRuntime(env: Record<string, string | undefined>): void {
  const underTest = env.VITEST === "true" || env.NODE_ENV === "test"
  if (!underTest) {
    throw new Error("The Google Business Profile mock adapter is test-only and cannot be constructed here")
  }
}

export type MockAdapterOptions = {
  env?: Record<string, string | undefined>
  failWith?: ProviderFailureCode
  connection?: Partial<ProviderConnectionState>
  accounts?: ProviderAccount[]
  locations?: ProviderLocation[]
  profile?: Partial<ProviderProfileSnapshot>
  reviews?: Partial<ProviderReviewSnapshot>
}

const syntheticAccount: ProviderAccount = {
  accountRef: `${syntheticPrefix}account/1`,
  displayName: "Synthetic Test Account",
  kind: "ORGANIZATION",
}

const syntheticLocation: ProviderLocation = {
  locationRef: `${syntheticPrefix}location/1`,
  accountRef: syntheticAccount.accountRef,
  displayName: "Synthetic Test Location",
  address: "1 Synthetic Way, Testville, TE5 7ST",
  profileUrl: null,
  verified: true,
}

const connectedState: ProviderConnectionState = {
  status: "CONNECTED",
  connectionRef: `${syntheticPrefix}connection/1`,
  grantedScopes: ["https://www.googleapis.com/auth/business.manage"],
  connectedAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
}

// Test-only fake. It is never referenced by the resolver, so no configuration
// value can select it; a test must hand it to the caller under test.
export function mockGoogleBusinessProfileProvider(options: MockAdapterOptions = {}): GoogleBusinessProfileProvider {
  assertTestRuntime(options.env ?? process.env)
  const connection: ProviderConnectionState = { ...connectedState, ...options.connection }
  const failure = options.failWith

  const fail = <T>(): ProviderResult<T> => providerError<T>(providerFailure(failure!))

  function capability(): ProviderCapability {
    if (failure) {
      return {
        state: failureCapabilityState(failure),
        mode: "google",
        manualFallbackActive: true,
        reads: noProviderReads(),
        detail: providerFailure(failure).message,
      }
    }
    return {
      state: "AVAILABLE",
      mode: "google",
      manualFallbackActive: false,
      reads: allProviderReads(),
      detail: "Synthetic test provider is connected.",
    }
  }

  return {
    kind: "mock",
    async capability() {
      return capability()
    },
    async listAccounts() {
      return failure ? fail<ProviderAccount[]>() : providerOk(options.accounts ?? [syntheticAccount])
    },
    async listLocations() {
      return failure ? fail<ProviderLocation[]>() : providerOk(options.locations ?? [syntheticLocation])
    },
    async profileSnapshot(request: ProviderSnapshotRequest) {
      if (failure) return fail<ProviderProfileSnapshot>()
      return providerOk<ProviderProfileSnapshot>({
        locationRef: request.locationRef,
        availability: "AVAILABLE",
        displayedBusinessName: "Synthetic Test Location",
        profileUrl: null,
        reviewCount: 12,
        rating: 4.5,
        ratingAvailable: true,
        observedAt: "2026-01-02T09:00:00.000Z",
        ...options.profile,
      })
    },
    async reviewSnapshot(request: ProviderSnapshotRequest) {
      if (failure) return fail<ProviderReviewSnapshot>()
      return providerOk<ProviderReviewSnapshot>({
        locationRef: request.locationRef,
        reviewCount: 12,
        latestReviewReference: `${syntheticPrefix}review/1`,
        latestReviewAt: "2026-01-02T08:00:00.000Z",
        observedAt: "2026-01-02T09:00:00.000Z",
        ...options.reviews,
      })
    },
    async connectionState() {
      return { ...connection }
    },
    async health(): Promise<ProviderHealth> {
      return {
        capability: capability(),
        connection: { ...connection },
        lastSuccessAt: failure ? null : "2026-01-02T09:00:00.000Z",
        lastFailure: failure ? providerFailure(failure) : null,
      }
    },
  }
}
