import {
  allProviderReads,
  type ProviderCapability,
  noProviderReads,
} from "./capability"
import {
  failureCapabilityState,
  type ProviderFailure,
  type ProviderFailureCode,
  providerFailure,
} from "./errors"
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
} from "./provider"

// Raw provider payloads only ever appear behind this transport. Nothing above
// the adapter sees a Google URL, status code or response body.
export type GoogleTransportResponse = {
  status: number
  body: unknown
}

export type GoogleTransport = {
  get(path: string): Promise<GoogleTransportResponse>
}

export type GoogleAdapterOptions = {
  transport: GoogleTransport
  connection: ProviderConnectionState
  lastSuccessAt?: string | null
  now?: () => Date
}

type GoogleErrorBody = {
  error?: {
    status?: unknown
    message?: unknown
    details?: Array<{ reason?: unknown }>
  }
}

function reasonOf(body: unknown): string {
  const error = (body as GoogleErrorBody | null)?.error
  if (!error) return ""
  const status = typeof error.status === "string" ? error.status : ""
  const detail = Array.isArray(error.details)
    ? error.details.map(item => (typeof item?.reason === "string" ? item.reason : "")).find(Boolean) ?? ""
    : ""
  // Google mixes SCREAMING_SNAKE statuses with camelCase detail reasons, so
  // both are flattened to one underscore-free uppercase string before matching.
  return `${status} ${detail}`.trim().toUpperCase().replace(/_/g, "")
}

// Maps Google transport outcomes onto the normalised failure codes. This is the
// only place Google status codes are interpreted.
export function mapGoogleFailure(response: GoogleTransportResponse): ProviderFailureCode {
  const reason = reasonOf(response.body)
  if (response.status === 401) return "AUTH_REVOKED"
  if (response.status === 403) {
    if (reason.includes("INSUFFICIENT") || reason.includes("SCOPE")) return "INSUFFICIENT_SCOPE"
    if (reason.includes("RATELIMIT") || reason.includes("QUOTA") || reason.includes("RESOURCEEXHAUSTED")) {
      return "QUOTA_EXCEEDED"
    }
    return "PERMISSION_DENIED"
  }
  if (response.status === 404) return "LOCATION_UNAVAILABLE"
  if (response.status === 409) return "ACCOUNT_INACCESSIBLE"
  if (response.status === 429) return "QUOTA_EXCEEDED"
  if (response.status >= 500) return "TRANSIENT_FAILURE"
  if (response.status >= 400) return "PERMISSION_DENIED"
  return "MALFORMED_RESPONSE"
}

// An invalid_grant response is Google telling us the authorization is gone,
// whatever status code carried it.
export function mapGoogleGrantFailure(body: unknown): ProviderFailureCode | null {
  const value = (body as { error?: unknown } | null)?.error
  if (typeof value !== "string") return null
  if (value === "invalid_grant") return "AUTH_REVOKED"
  if (value === "insufficient_scope") return "INSUFFICIENT_SCOPE"
  if (value === "access_denied") return "PERMISSION_DENIED"
  return null
}

function connectionFailure(connection: ProviderConnectionState): ProviderFailureCode | null {
  if (connection.status === "REVOKED") return "AUTH_REVOKED"
  if (connection.status === "EXPIRED") return "AUTH_REVOKED"
  if (connection.status !== "CONNECTED") return "CONFIGURATION_MISSING"
  return null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null
}

function rating(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5 ? value : null
}

export function googleBusinessProfileProvider(options: GoogleAdapterOptions): GoogleBusinessProfileProvider {
  const now = options.now ?? (() => new Date())
  let lastFailure: ProviderFailure | null = null
  let lastSuccessAt: string | null = options.lastSuccessAt ?? null

  const fail = <T>(code: ProviderFailureCode): ProviderResult<T> => {
    lastFailure = providerFailure(code)
    return providerError<T>(lastFailure)
  }

  const succeed = <T>(value: T): ProviderResult<T> => {
    lastFailure = null
    lastSuccessAt = now().toISOString()
    return providerOk(value)
  }

  async function call<T>(path: string, read: (body: unknown) => T | null): Promise<ProviderResult<T>> {
    const blocked = connectionFailure(options.connection)
    if (blocked) return fail<T>(blocked)
    let response: GoogleTransportResponse
    try {
      response = await options.transport.get(path)
    } catch {
      // A thrown transport error must never surface its message to a caller.
      return fail<T>("TRANSIENT_FAILURE")
    }
    if (response.status < 200 || response.status >= 300) {
      return fail<T>(mapGoogleGrantFailure(response.body) ?? mapGoogleFailure(response))
    }
    let parsed: T | null
    try {
      parsed = read(response.body)
    } catch {
      return fail<T>("MALFORMED_RESPONSE")
    }
    if (parsed === null) return fail<T>("MALFORMED_RESPONSE")
    return succeed(parsed)
  }

  function capability(): ProviderCapability {
    const blocked = connectionFailure(options.connection)
    if (blocked) {
      return {
        state: failureCapabilityState(blocked),
        mode: "google",
        manualFallbackActive: true,
        reads: noProviderReads(),
        detail: providerFailure(blocked).message,
      }
    }
    if (lastFailure) {
      return {
        state: failureCapabilityState(lastFailure.code),
        mode: "google",
        manualFallbackActive: true,
        reads: noProviderReads(),
        detail: lastFailure.message,
      }
    }
    return {
      state: "AVAILABLE",
      mode: "google",
      manualFallbackActive: false,
      reads: allProviderReads(),
      detail: "Google Business Profile access is connected.",
    }
  }

  return {
    kind: "google",
    async capability() {
      return capability()
    },
    async listAccounts() {
      return call<ProviderAccount[]>("/accounts", body => {
        const rows = (body as { accounts?: unknown })?.accounts
        if (!Array.isArray(rows)) return null
        const mapped: ProviderAccount[] = []
        for (const row of rows) {
          const accountRef = text((row as { name?: unknown })?.name)
          if (!accountRef) return null
          const type = text((row as { type?: unknown })?.type)?.toUpperCase()
          mapped.push({
            accountRef,
            displayName: text((row as { accountName?: unknown })?.accountName) ?? accountRef,
            kind: type === "PERSONAL" ? "PERSONAL" : type === "LOCATION_GROUP" || type === "ORGANIZATION" ? "ORGANIZATION" : "UNKNOWN",
          })
        }
        return mapped
      })
    },
    async listLocations(accountRef: string) {
      return call<ProviderLocation[]>(`/${accountRef}/locations`, body => {
        const rows = (body as { locations?: unknown })?.locations
        if (!Array.isArray(rows)) return null
        const mapped: ProviderLocation[] = []
        for (const row of rows) {
          const locationRef = text((row as { name?: unknown })?.name)
          if (!locationRef) return null
          const storefront = (row as { storefrontAddress?: { addressLines?: unknown; locality?: unknown; postalCode?: unknown } })?.storefrontAddress
          const lines = Array.isArray(storefront?.addressLines)
            ? storefront.addressLines.filter((line): line is string => typeof line === "string")
            : []
          mapped.push({
            locationRef,
            accountRef,
            displayName: text((row as { title?: unknown })?.title) ?? locationRef,
            address: [...lines, text(storefront?.locality), text(storefront?.postalCode)].filter(Boolean).join(", "),
            profileUrl: text((row as { metadata?: { mapsUri?: unknown } })?.metadata?.mapsUri),
            verified: (row as { metadata?: { hasVoiceOfMerchant?: unknown } })?.metadata?.hasVoiceOfMerchant === true,
          })
        }
        return mapped
      })
    },
    async profileSnapshot(request: ProviderSnapshotRequest) {
      return call<ProviderProfileSnapshot>(`/${request.locationRef}`, body => {
        const name = text((body as { title?: unknown })?.title)
        if (!name) return null
        const open = (body as { openInfo?: { status?: unknown } })?.openInfo?.status
        const availability = open === "CLOSED_PERMANENTLY" ? "UNAVAILABLE" : open === undefined ? "UNKNOWN" : "AVAILABLE"
        const score = rating((body as { averageRating?: unknown })?.averageRating)
        return {
          locationRef: request.locationRef,
          availability,
          displayedBusinessName: name,
          profileUrl: text((body as { metadata?: { mapsUri?: unknown } })?.metadata?.mapsUri),
          reviewCount: count((body as { totalReviewCount?: unknown })?.totalReviewCount),
          rating: score,
          ratingAvailable: score !== null,
          observedAt: now().toISOString(),
        }
      })
    },
    async reviewSnapshot(request: ProviderSnapshotRequest) {
      return call<ProviderReviewSnapshot>(`/${request.locationRef}/reviews`, body => {
        const total = count((body as { totalReviewCount?: unknown })?.totalReviewCount)
        const rows = (body as { reviews?: unknown })?.reviews
        if (rows !== undefined && !Array.isArray(rows)) return null
        const latest = Array.isArray(rows) ? rows[0] : null
        return {
          locationRef: request.locationRef,
          reviewCount: total,
          latestReviewReference: text((latest as { reviewId?: unknown })?.reviewId),
          latestReviewAt: text((latest as { createTime?: unknown })?.createTime),
          observedAt: now().toISOString(),
        }
      })
    },
    async connectionState() {
      return { ...options.connection }
    },
    async health(): Promise<ProviderHealth> {
      return {
        capability: capability(),
        connection: { ...options.connection },
        lastSuccessAt,
        lastFailure,
      }
    },
  }
}
