# Customer Portal security

UX-10A authenticates a ProfileRelaunch customer. It does not authorise that customer to see a case, a document, a payment, a Guard service, or a message. Later phases add those projections. A portal session proves only this: the browser completed email OTP for the customer's currently verified email and holds a valid opaque portal session.

The Customer Portal is not launched. `CUSTOMER_PORTAL_ENABLED` is unset.

## Trust boundaries

| Boundary | What it may do |
| --- | --- |
| Browser | Submit an email and a six-digit code. Hold two HttpOnly cookies. It never sees a Supabase access token, a refresh token, a raw session token in a response body, or a database identifier. |
| Customer server | Checks origin, calls the public portal RPCs with the service role, asks Supabase Auth to send and verify OTP, then discards the provider session. |
| PostgreSQL | Decides eligibility, send limits, challenge state and session validity. The browser cannot call these functions. |
| Supabase Auth | Proves possession of the verified email during login. It is not the portal session. |

There is no `@supabase/ssr` client. The customer app does not call `supabase.auth.getSession()` for portal authorisation. Tokens are not written to `localStorage`, `sessionStorage`, a readable cookie, React state after verification, the URL, or logs.

The customer app sends no marketing analytics and no Google Analytics.

## Authentication and authorisation

Login is allowed when all of these are true:

- `CUSTOMER_PORTAL_ENABLED` is exactly `true` and the existing customer backend configuration is valid;
- a customer row exists for the normalised email;
- `admin_private.verified_current_email_v1(customer_id)` returns that same email;
- the address is not `admin@profilerelaunch.com`;
- Supabase OTP succeeds for the Auth user whose email matches that verified address, and `email_confirmed_at` is set.

`customers.email` alone, a row in `auth.users`, `email_confirmed_at` alone, and business membership are not proof that the ProfileRelaunch email is currently verified. An open case is not required. `customer_is_active_service_v1()` is not a login gate.

The unique index on `lower(customers.email)` stays in place. OTP is sent only to the email read back from that verified-email rule, with `shouldCreateUser: false`. The server creates or confirms the Auth identity only after the database has confirmed the customer, and it reuses `ensureCustomerAuthIdentity`.

## Action session and portal session

These are different capabilities. They use different cookies, different tables and different checks.

| | Action session | Portal session |
| --- | --- | --- |
| Entry | `/action/[actionId]#t=...` | `/login` |
| Cookies | `__Host-pr-action`, `__Host-pr-action-pending` | `__Host-pr-portal`, `__Host-pr-portal-pending` |
| Lifetime | 15 minutes, unchanged | 8 hours, absolute, no sliding extension |
| Scope | One action, including CASE_ACCESS, evidence, quote, payment and Guard actions | The customer identity only |

A portal session does not open `/case` or an action command API. An action session does not open `/portal`. Sign-out of the portal revokes that portal row and clears the portal cookies. It does not touch action rows or action cookies.

Development uses `pr-portal-dev` and `pr-portal-pending-dev`. Production names are host-only: no `Domain` attribute, `Path=/`, `HttpOnly`, `Secure`, `SameSite=Strict`.

## Lifetimes

| Control | Value |
| --- | --- |
| Portal pending challenge | 10 minutes after a successful OTP send |
| Resend cooldown | 60 seconds |
| Send limit | 5 sends per customer per 30-minute window |
| Verify attempts | 5 per challenge |
| Action session | 15 minutes, unchanged |
| Portal session | 8 hours absolute |

The resend countdown in the browser is a hint. The database is authoritative.

## Account enumeration

A syntactically acceptable email always receives the same status and the same sentence: "If this email is linked to a ProfileRelaunch account, we've sent a six-digit code." Unknown, unverified, admin and rate-limited addresses are not distinguished in the HTTP response. The server still sets an opaque pending cookie when there is no database challenge behind it, so the presence of the cookie is not an existence oracle. The server does not sleep to imitate work, and it does not send OTP to an address the database did not return.

Internal statuses such as `ineligible` and `rate_limited` stay on the server.

## OTP email bombing and brute force

Send limits are stored on `admin_private.customer_portal_login_rate`, keyed by customer, and taken under an advisory transaction lock plus a row lock. Clearing the browser cookie does not reset them. A second send inside 60 seconds is refused. A sixth send inside the 30-minute window is refused. Concurrent starts share the lock, so they cannot each observe a count below the cap.

The send attempt is reserved before the provider call. If the provider fails, `sent_at` stays unset. The reserved attempt is still consumed. That is safer than allowing an immediate retry storm.

Verification requires a sent, unconsumed, unexpired challenge. Each attempt increments in the same locked update and stops after five. A consumed challenge cannot be replayed. The browser is not told the remaining count.

## Session fixation, theft and expiry

The pending token and the session token are independent 256-bit values. Login never promotes the pending token into the session. Only SHA-256 hashes are stored. The raw session token exists only in the HttpOnly cookie. A failed verification writes no session row. Success clears the pending cookie.

Theft of the cookie is limited by `HttpOnly`, `SameSite=Strict`, host-only scope, the production `Secure` flag, and the eight-hour absolute expiry. Revocation is immediate on sign-out. Guessed and expired tokens return no session.

Requests that change login state are POST only, require `application/json`, a bounded body, an exact set of keys, and an `Origin` equal to `CUSTOMER_ORIGIN`. There is no `next` parameter. Success always continues to `/portal`.

## Stale verified email

`customer_portal_session_v1` returns null unless the session exists, is unrevoked, is unexpired, the customer still exists, and `verified_current_email_v1` still equals the email stored on the session. Changing the customer email, or leaving a verification that no longer matches the current email, invalidates the session on the next request. The server does not wait for the eight-hour expiry and does not depend on the browser deleting the cookie.

## Future IDOR and step-up

UX-10A does not assert business ownership, case ownership, manager access, agreement permission, payment authorisation, or Guard entitlement. Later phases must load those records through customer-scoped projections that take the portal customer id from the session and re-check it in the database. A portal session alone must not be treated as permission to read another customer's row.

Sensitive later actions, including payment and Guard changes, keep their own step-up. The eight-hour portal session is not that step-up.

## Service-role confinement

The three new tables live in `admin_private` with row-level security enabled and no direct grants to `PUBLIC`, `anon`, `authenticated`, or `service_role`. Private functions are not executable by those roles. The public wrappers revoke `PUBLIC`, `anon` and `authenticated`, and grant execute only to `service_role`. The browser never receives the service-role key. There is no Data API exposure and no `USING (true)` policy for `authenticated`.

## Feature gate

`CUSTOMER_PORTAL_ENABLED` is independent of `CUSTOMER_AUTH_ENABLED`. When it is off, `/login` does not offer portal login, the portal auth routes refuse, and `/portal` is unavailable. Existing `/action/...` flows stay as they are. This change does not set the variable in any deployed environment.
