# Google Business Profile integration readiness (Step 21)

SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / GOOGLE API ACCESS DISABLED.

This step builds the integration boundary so ProfileRelaunch can later switch from the
manual operating model to Google Business Profile API automation without rewriting Guard,
alerts or the customer/business model. It does not turn any of that on.

## What is true today

- **Real Google API access is not currently enabled.** It remains an external dependency.
  No approval has been obtained and no approval date is assumed or stated anywhere.
- **Production continues using manual mode.** The Step 17 manual-check workflow is the only
  way a Guard observation is recorded, and nothing about it changed.
- **Mock mode is test-only.** It cannot be named by configuration and throws if constructed
  outside a test runtime.
- **There is no production mock data.** No synthetic account, location, profile or review can
  reach a production or preview database.
- **OAuth and token storage are ready but inactive.** The schema exists only as unapplied
  migration source; no connection row, state row or token has ever been written.
- **Live acceptance requires explicit approval and configuration.** It is behind its own
  opt-in flag, separate from the ordinary API gate.
- **Existing Guard behaviour remains manual** until a separate activation decision.

## Provider boundary

Everything lives behind one interface in `lib/google-business-profile/provider.ts`. Guard,
cases, monitoring and the Admin UI depend on that interface and never on a Google client.

| Operation | Purpose |
| --- | --- |
| `capability()` | Current capability state, provider mode and read permissions |
| `listAccounts()` | ProfileRelaunch account objects |
| `listLocations(accountRef)` | ProfileRelaunch location objects with a normalised address |
| `profileSnapshot(request)` | Profile state shaped like a Guard manual observation |
| `reviewSnapshot(request)` | Review count and latest review reference |
| `connectionState()` | Connection status, scopes and timestamps |
| `health()` | Capability, connection, last success and last normalised failure |

The domain types are ProfileRelaunch objects, not Google responses. All Google-specific
parsing and status interpretation lives inside `google-adapter.ts` and never escapes it.

## Provider modes

`GOOGLE_BUSINESS_PROFILE_PROVIDER` accepts `manual` or `google` and defaults to `manual`.
Any other value, including `mock`, resolves to manual rather than failing open.

- **MANUAL** is the production-safe adapter. It performs no network access, needs no
  credentials, fabricates no profile or review data, and never reports a manual check as
  API-verified. Every read fails closed with `PROVIDER_DISABLED` so a caller cannot mistake
  silence for an empty profile.
- **GOOGLE** is the live adapter boundary. Its contract and failure mapping exist; its
  execution does not. It requires an injected transport that no production code supplies.
- **MOCK** is test-only and is not a mode. It is absent from `providerModes`, the resolver
  has no branch that can produce it, and `resolveGoogleBusinessProfileProvider` rejects it
  even when it is injected directly with every gate open.

## Fail-closed resolution

A Google request is impossible unless every one of these passes:

1. `GOOGLE_BUSINESS_PROFILE_PROVIDER` is exactly `google`.
2. `GOOGLE_BUSINESS_PROFILE_API_ENABLED` is exactly `true`. Unset, `yes`, `1` and `TRUE`
   all remain disabled.
3. A complete server-side OAuth client is configured with an `https://` redirect URI.
4. A server-side token encryption key of at least 32 characters is configured.
5. A live transport has been injected by a caller that built one deliberately.

If any condition fails, the resolver returns the manual adapter and names the first unmet
condition. Today condition 1 fails in every environment, and condition 5 has no production
implementation at all, so the manual adapter is reached by two independent routes.

No `NEXT_PUBLIC_` Google variable exists. Client secrets, tokens and the encryption key are
server-side only.

## Capability model

| State | Admin label | Meaning |
| --- | --- | --- |
| `MANUAL` | Manual mode | Observations are recorded by an Admin |
| `NOT_CONFIGURED` | Not configured | Google was asked for but a live condition is unmet |
| `AVAILABLE` | Connected | Live reads are permitted |
| `DEGRADED` | Provider degraded | Transient or resource failure |
| `REVOKED` | Authorization revoked | The grant is gone; reconnect required |
| `QUOTA_LIMITED` | Quota limited | Rate or quota limit reached |
| `AUTH_REQUIRED` | Needs re-authorization | Scope or permission problem |
| `ERROR` | Provider error | Unreadable provider response |

Each capability carries explicit read permissions for accounts, locations, profile state,
reviews and automated Guard observations. Only `AVAILABLE` permits automation. The default
production state is manual.

## Error and fallback model

Provider failures normalise onto ten codes: `CONFIGURATION_MISSING`, `AUTH_REVOKED`,
`INSUFFICIENT_SCOPE`, `PERMISSION_DENIED`, `ACCOUNT_INACCESSIBLE`, `LOCATION_UNAVAILABLE`,
`QUOTA_EXCEEDED`, `TRANSIENT_FAILURE`, `MALFORMED_RESPONSE` and `PROVIDER_DISABLED`.

Every one of them sets `manualFallback`, so a provider problem can never be reported as a
healthy profile. Failures reuse the existing Guard, incident and service-action
architecture; this step adds no parallel alerting system and sends no customer alert merely
because Google integration failed. A persistent outage uses the Step 20 operational
incidents that already exist rather than a new incident table.

## Guard integration boundary

`apps/admin/lib/guard/provider-boundary.ts` decides whether automation is available and
keeps the answer in one place. With Google disabled it always answers manual, and the
existing Guard check obligations, classifications, manual review, duplicate suppression,
baseline logic, alert review and audit trail are untouched.

A provider snapshot never classifies itself. It can only propose the conservative
classification its availability permits, and that proposal must satisfy exactly the same
`guardCheckClassificationAllowed` rule a manual observation satisfies. A detected change
still requires the existing baseline comparison.

A provider-sourced observation cannot be persisted at all in this step:
`guard_check_observations.capture_method` still accepts only `MANUAL`, and this step does
not widen it. Enabling automated capture would need a further migration and a separate
activation decision.

## OAuth readiness

The OAuth boundary is server-side only.

- State is 32 random bytes rendered base64url. Only its SHA-256 hash is stored, so a reader
  of the database cannot replay an authorization.
- State is bound to the initiating actor and to a one-way hash of the initiating session.
- State expires after ten minutes and is single-use: every callback path consumes it,
  including rejections, so a retry cannot be made to look fresh.
- The callback validates state presence, format, existence, replay, expiry, actor, session
  binding, exact redirect URI and code presence, in that order.
- A denial or cancellation is normalised to `access_denied` or `authorization_failed`; the
  provider's error text is never echoed.
- Token exchange and revocation are abstracted behind `GoogleTokenExchange`. No production
  implementation exists in this step.

While live Google integration is disabled, the connect and callback routes never exchange a
code. They return a safe not-configured state and discard what Google sent.

Access tokens, refresh tokens and client secrets never appear in browser state, URL query
strings beyond the OAuth protocol itself, application logs, audit details, error messages,
client JSON or analytics.

## Token storage design

Tokens are encrypted with AES-256-GCM in the server process before they reach the database.
`provider_connections` stores the ciphertext, IV, auth tag, encryption key version, granted
scopes, token expiry, connection status, connected and revoked timestamps, last successful
interaction and last error classification. It stores no plaintext token.

The encryption key itself is server-side only and is never written to these tables.
`provider_connection_public_json_v1` deliberately omits ciphertext, IV, auth tag and key
version, so no Admin or customer RPC response can return encrypted token material. A CHECK
constraint additionally rejects a ciphertext that still looks like a readable OAuth token.

Token material is write-once. A revoked connection cannot be reopened. Connection history is
append-only so a revocation cannot be erased.

## Audit

Connection lifecycle events are recorded through the existing audit architecture as
`INTEGRATION_CHANGED`, with a parallel append-only `provider_connection_events` history
covering connection initiated, callback rejected, connection established, authorization
revoked, re-authorization required, provider fallback activated and connection disconnected.

Audit details carry the operation, the provider and, where relevant, a rejection reason.
OAuth codes, tokens and ciphertext are never audited.

## Live acceptance harness

`lib/google-business-profile/live-acceptance.ts` documents the sequence to run after Google
grants API access: OAuth connection, account listing, location listing, profile retrieval,
review retrieval, token refresh, revoked authorization, permission loss, quota and
rate-limit handling, and manual fallback.

It does not run in normal CI. It requires `GOOGLE_LIVE_ACCEPTANCE_ENABLED` to be exactly
`true` *and* every ordinary live condition to pass. Without both it skips without making a
provider call. No real Google credential was needed to complete this step.

## Migration

`supabase/migrations/20261001153235_google_integration_readiness_v1.sql` was generated with
`npx supabase migration new google_integration_readiness_v1`. It is SOURCE ONLY and has not
been applied to any environment.

It is additive: three new tables (`provider_oauth_states`, `provider_connections`,
`provider_connection_events`), their protective triggers, the supporting `admin_private`
functions, two service-role-only public RPCs, and one widened audit action check that adds
`INTEGRATION_CHANGED`. No already-applied migration is modified.

All three tables have row level security enabled with direct CRUD revoked from `PUBLIC`,
`anon`, `authenticated` and `service_role`. Both public RPCs are service-role-only and
require a fresh re-authentication.

## Admin surface

System configuration now shows a Google status backed by the capability resolver rather than
a hard-coded label: `Manual mode`, `Disabled` or `Not configured` today, with `Connected`,
`Needs re-authorization`, `Quota limited` and `Provider degraded` available once a live
connection exists.

A new Integrations section shows provider mode, API capability, connection state, last
successful check, last provider error classification and whether manual fallback is active,
plus the unmet live conditions in plain wording. It displays no client secret, token,
encrypted payload, raw provider error body or environment value.

The connect action is present but unavailable, with the wording
`Google Business Profile connection is not enabled yet.` There is no working Connect button
and no Customer Portal work in this step.
