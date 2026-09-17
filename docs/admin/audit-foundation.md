# Admin authorisation and activity foundation

## Delivered in this stage

Built from main after PRs #85 and #86 merged. The user confirmed working OTP login; a read-only database check also confirmed the singleton is enabled, bound, and has a successful sign-in event. Existing login length/configuration is unchanged.

- Account & sessions navigation and a protected Activity page.
- Action/result filters; 50-row keyset pagination with one lookahead row. IDs stay strings to preserve bigint precision. Times use Europe/London, including daylight saving.
- Existing and future sign-in/sign-out events appear automatically. Source event IDs prevent duplicate historical imports.
- End one other active session with an explicit confirmation. Current-session and all-device sign-out retain their existing behaviour.
- A successful email OTP sign-in within five minutes is required to end another session. An older session receives clear instructions to sign out and sign back in; a page refresh or ordinary activity cannot refresh this verification time.
- Append-only activity storage with actor, action, outcome, target, time and request reference. No tokens, OTPs, customer details or free-form payloads are stored.

This is the authorisation foundation for the currently implemented operations. It does not introduce client records, enquiries, payments, account management or generic write access. Those later modules need their own command, record-version, audit field projection and domain tests.

## Access contract

| Operation | Server/database rule |
| --- | --- |
| View activity | Bound, enabled, confirmed admin identity and a live opaque session; checked in the page/query and again in the database RPC |
| End another session | Same identity/session checks, sign-in age at most five minutes, target belongs to that identity, target active, target is not current session |
| Modify identity or invite staff | No portal endpoint; single-account operator bootstrap remains outside the application |
| Write audit | Private database writer or auth-event trigger only; no service-role, browser or public execute grant |
| Edit/delete audit | No application grants; immutable trigger rejects update, delete and truncate, including accidental privileged SQL |

All user-facing writes have a fixed RPC and payload. POST requires the configured exact Origin and URL origin, JSON content type, a valid cookie shape, a body no larger than 1 KiB and an exact payload schema. Neither actor, role, RPC name nor token hash is accepted from the browser payload. Proxy checks are additional protection, not the route's authorisation.

The server service credential may execute two narrowly scoped RPCs. It cannot directly read/write the audit table or call its writer. Security-definer RPCs use an empty search path and derive identity from the opaque session. Browser roles have neither table nor function access. No permissive RLS policies are added.

## Transactions, conflicts and failure behaviour

Session changes use row locks and compare-and-set on active state/ownership. An already ended, expired, idle or unrelated session returns HTTP 409 and remains unchanged. Repeated requests never revoke a different record. There is no external side effect requiring a provider idempotency key.

A successful change and audit insert commit together. If audit insertion fails, the change rolls back. Authenticated business denials (current session, stale target, reauthentication required) return a result rather than throwing, so their audit event commits. Invalid/expired credentials and malformed/CSRF requests are rejected without claiming an authenticated actor or filling the audit table with anonymous traffic.

A database outage or uncertain network response returns 503 with instructions to refresh before retrying. No database system can durably record its own total outage; provider monitoring remains part of the later operational-health stage. No raw provider errors or request bodies are logged.

The audit list is bounded to 51 rows; the UI displays 50 and provides an older-page link only when needed. Filter changes restart pagination. A revoked session between page validation and RPC redirects to login instead of showing an empty successful result.

## Deployment and verification

Apply the additive `admin_audit_foundation_v1` migration once after `single_admin_auth_v1`. It creates one table, a private helper schema, triggers and two scoped RPCs. It backfills existing auth events. It does not change marketing data, existing auth RPC signatures, account binding or SMTP. Existing deployed login remains compatible before and after application rollout.

Automated acceptance covers:

- Direct route calls without proxy, CSRF, missing cookie, forged actor/RPC fields, malformed and oversized bodies, safe errors and non-cacheable responses.
- Actual PostgreSQL migration/RPC execution through PGlite: browser/service grants, cross-identity targets, disabled identity, expiry, revocation, freshness, current-session denial, replay conflicts, atomic rollback when audit fails, existing auth-event capture and audit tampering.
- Historical backfill, pagination without duplicate rows, filtering and bigint bounds; UK summer/winter formatting.
- Admin production build, repository lint and production HTTP protection of `/activity` and `/api/sessions/revoke`.

After deployment, visit Activity, confirm the existing sign-in is listed, and use a second real browser session to verify its sign-out and activity result. Automated local tests do not replace this live authenticated browser acceptance.

Rollback: revert the application PR first; the additive schema remains compatible with the old app. Keep audit records. Do not drop the table, disable its immutable trigger, replay the baseline or remove auth triggers as routine rollback. Database-owner access can alter triggers/schema and must remain restricted; this is application-level append-only history, not an external tamper-proof ledger.

## Next implementation stage

Step 5: shared records and client workspace, explicit verified business memberships, safe customer-field projections, client/business/location views, contact verification and reviewed relationship changes. Customer-submitted case/Guard links are not proof of account ownership. Each new mutation must add domain-specific version checks and redacted audit fields before exposure.

## Connected-project verification — 17 September 2026

Applied as version `20260917160740` to `profilerelaunch-dev` (`rmzozuiamjcclvtgutgd`), matching the provider's migration history. Live checks confirmed RLS enabled, both triggers present, one existing auth event backfilled, anonymous/authenticated roles denied table/RPC access, and service-role access restricted to the two public RPCs. Invalid credentials returned null/unauthorized. No real session was revoked during verification.

The advisor found no new warning from this change. The audit table's [RLS-without-policies informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is intentional: it is accessible only inside authorised server RPCs. Existing notices remain for the case-reference function's [mutable search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), the auto-RLS event trigger's [public execute grant](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated execute grant](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [password leak protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). They predate this migration; email OTP remains the admin login method.
