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
- **The connection flow cannot be executed in this build at all.** There is no token
  exchange and no live transport, and that is a property of the code rather than of
  configuration, so setting every Google environment variable still cannot start OAuth.
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

Configuration and execution are two separate things, and the distinction matters. The four
configuration conditions are:

1. `GOOGLE_BUSINESS_PROFILE_PROVIDER` is exactly `google`.
2. `GOOGLE_BUSINESS_PROFILE_API_ENABLED` is exactly `true`. Unset, `yes`, `1` and `TRUE`
   all remain disabled.
3. A complete server-side OAuth client is configured with an `https://` redirect URI.
4. A server-side token encryption key of at least 32 characters is configured.

`googleLiveConfiguration()` answers only that question, and its result is named
`configured` rather than `ready` precisely because satisfying it does not mean anything can
run. Two further conditions are code facts, not settings:

5. A live transport must have been injected by a caller that built one deliberately, or
   `resolveGoogleBusinessProfileProvider` returns the manual adapter with
   `live_transport_unavailable`.
6. An implemented live stack must exist in the running build, or `googleConnectExecution()`
   reports `connection_not_implemented` and nothing may start a connection.

Condition 6 is the gate that makes Step 21 readiness-only. `googleLiveStack` in
`lib/google-business-profile/live-stack.ts` is `null` in this build, so
`googleConnectionExecutionAvailable()` is false. There is deliberately no environment
variable, header or request field that can change it: opening the flow means shipping a
token exchange and transport implementation, which is a code change that has to be written
and reviewed. Adding a flag that let production enable an unfinished flow would defeat the
point.

The HTTP integration command checks condition 6 before anything else, so a direct POST to
`/api/operations/integrations` with every Google variable set still gets a 403, no
authorization URL, and no database call. The Admin UI being disabled is a consequence of
this, not the mechanism.

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
- State expires after ten minutes and is single-use.
- Token exchange and revocation are abstracted behind `GoogleTokenExchange`. No production
  implementation exists in this step.

While live Google integration is disabled, the connect and callback routes never exchange a
code. They return a safe not-configured state and discard what Google sent.

Access tokens, refresh tokens and client secrets never appear in browser state, URL query
strings beyond the OAuth protocol itself, application logs, audit details, error messages,
client JSON or analytics.

### Terminal callbacks

Every callback that carries a syntactically valid state goes through the same single-use
operation, not only a successful one. A denial, a provider error and a redirect with no
code are all terminal, so an attempt that ended cannot sit unconsumed until it expires and
cannot be presented again later.

A missing or malformed state is refused before any database work, because it names no
attempt. Consuming by guess would be worse than leaving it: it would let anyone end
somebody else's authorization.

`provider_oauth_consume_v1` proves actor, initiating session binding and exact redirect URI
before it writes anything, and the distinction between a code callback and a cancellation
decides what happens on a mismatch:

| Callback | Context matches | Context does not match |
| --- | --- | --- |
| Carries a code | Consumed as `ACCEPTED`, or `REJECTED` if expired | Consumed as `REJECTED`; a mismatched exchange attempt is an attack and the attempt should not survive it |
| Cancellation or no code | Consumed as `CANCELLED` with the fixed reason | Refused, and the row is left untouched, so one Admin session cannot end another's attempt |

`provider_oauth_cancel_v1` is the Admin abandoning their own attempt. It is the same
context-bound operation with the single reason this surface may record, so it inherits all
of the above rather than offering a looser path.

### Fixed reason vocabulary

Nothing a browser or Google writes is ever persisted. A cancellation is classified into one
of four values before it leaves TypeScript — `access_denied`, `authorization_failed`,
`cancelled_by_admin`, `code_missing` — and PostgreSQL independently refuses anything else
with `reason_not_normalised`. The same closed vocabulary constrains
`provider_oauth_states.rejection_reason` and `provider_connection_events.detail` as CHECK
constraints, and the audit writer drops a reason it does not recognise rather than
recording it. Admin wording is generated from the classification, so no provider sentence
reaches a page or an API response either.

The browser cancel payload no longer carries a reason at all, and
`containsTokenMaterial` now matches credential-shaped values as well as field names, so an
access token, refresh token, authorization code or client secret smuggled into an
unexpected field is still caught.

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

### What a connection row may change

A connection row records one authorization, so everything identifying that authorization is
immutable: `customer_id`, `business_id`, `location_id`, `account_ref`, `granted_scopes`,
`token_expires_at`, the ciphertext, IV, auth tag, key version, `connected_at` and
`created_by`. Only `status`, `revoked_at`, the last normalised error and `record_version`
may move. A new authorization means a new row, which `provider_connection_store_v1` creates
after revoking the previous one.

`granted_scopes` and `token_expires_at` are the two that could reasonably be called
lifecycle metadata, and the decision is to keep them immutable for now. A refresh would
change the expiry and a re-consent would change the scopes, but this build has no token
exchange, so neither can happen. Leaving them writable would mean shipping an unaudited
mutation path before there is anything to mutate. At live activation they get an explicit
refresh operation with its own allowed transitions, a record-version concurrency check and
a normalised audit event, rather than an arbitrary `UPDATE`.

### Connection scope

A Google grant has to belong to someone identifiable, so `customer_id` is `NOT NULL` on
both `provider_oauth_states` and `provider_connections`, and a location always implies a
business. `provider_scope_fault_v1` then proves the chain against the existing data model
rather than trusting an Admin form: `business_memberships` must carry a `verified`
membership linking the customer to the business, and `locations.business_id` must link that
business to the location. A pending or revoked membership is not evidence that a customer
may authorise anything.

Both the OAuth begin and the connection store call it, so another customer's business or
another business's location is refused before a state row or an encrypted token can exist.
Valid scopes are customer only, customer and business, or customer, business and location.

## Audit

Connection lifecycle events are recorded through the existing audit architecture as
`INTEGRATION_CHANGED`, with a parallel append-only `provider_connection_events` history
covering connection initiated, callback rejected, connection established, authorization
revoked, re-authorization required, provider fallback activated and connection disconnected.

Audit details carry the operation, the provider and, where relevant, a rejection reason
drawn from the fixed vocabulary above. A reason outside that vocabulary is dropped rather
than written. OAuth codes, tokens and ciphertext are never audited.

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
plus the unmet conditions in plain wording, including that this build has no connection
implementation. It displays no client secret, token, encrypted payload, raw provider error
body or environment value.

The connect action is present but unavailable, with the wording
`Google Business Profile connection is not enabled yet.` There is no working Connect button
and no Customer Portal work in this step.
