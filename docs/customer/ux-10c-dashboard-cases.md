# UX-10C — Customer dashboard and cases

UX-10C is the first authenticated customer data in the portal. It adds the customer dashboard and the cases list. It does not launch the Customer Portal. `CUSTOMER_PORTAL_ENABLED` stays off.

The customer can see whether they have an active case, whether ProfileRelaunch currently needs something from them, which service and business or location the case is for, a coarse status, and their previous cases.

## Authorisation

A portal session identifies one customer. Case ownership for this phase is only:

```text
cases.customer_id = portal session customer
```

The session comes from `admin_private.customer_portal_session_v1(p_token_hash)`. Neither read RPC accepts a customer id, a case id, a business id, or an email. Sharing a business with another customer does not reveal that customer's cases. Business membership is not an authorisation path.

An invalid, expired, revoked, or identity-invalid portal session makes both RPCs return NULL. The page then redirects to `/login`. A database or parser failure is shown as a load error, not as an empty list.

The browser never receives the service key. The server reads the portal cookie, checks the token shape, hashes it, and calls the RPC. It does not call `getPortalSession()` and then pass a customer id onward. The proxy check remains the first gate. The data RPC is the second.

## Safe projection

Each case row exposes only:

```text
reference, caseType, serviceTrack, businessName, locationName,
status, workStage, submittedAt, closedAt, attentionItems
```

`status` and `workStage` are inputs to the presentation model. The page does not render the raw enums. The projection does not include internal ids, issue text, intake data, review URLs, priority, Admin next action, closure notes, emails, secret hashes, storage keys, or provider ids.

Business and location names are taken from the case's own business and from that exact location. The location must belong to the same business. If those facts disagree, the case is omitted.

## Attention

Action needed means there is a real, currently usable customer obligation. `cases.status = AWAITING_CUSTOMER` is not enough.

The private helper `admin_private.customer_portal_case_attention_v1` proves the case belongs to the customer and is not `CLOSED` or `CANCELLED`. It returns customer-safe codes only. Display order is presentation-only and authorises nothing:

1. `EVIDENCE_REQUIRED`
2. `QUOTE_ACCEPTANCE`
3. `SERVICE_AGREEMENT`
4. `CASE_PERMISSION`
5. `GUIDED_PAYMENT`
6. `MANAGED_PAYMENT_SETUP`
7. `PAYMENT_RECOVERY`
8. `INVOICE_PAYMENT`

Evidence is `EVIDENCE_REQUIRED` only when the request is `OPEN`, a current unexpired `COMMUNICATION_ACCESS` action points at that exact request for the same customer and case, the action's email snapshot still matches the portal session email, and no CUSTOMER evidence version for that request has reached `UPLOADED`. An open request without that link is not shown. After a customer upload, scanning and review are ProfileRelaunch work, so the upload prompt disappears. Replacement evidence is UX-10E.

A secure action counts only while it is `OPEN`, unexpired, owned by the portal customer and case, and still addressed to the session email. `QUOTE_ACCEPTANCE` maps to itself. `AGREEMENT_ACCEPTANCE` maps to `SERVICE_AGREEMENT` or `CASE_PERMISSION` from the agreement kind. The four payment kinds map to themselves. `CASE_ACCESS`, `COMMUNICATION_ACCESS` by itself, `AUTHORIZATION_REVOCATION`, and Guard actions are not case attention.

An expired link is not a usable action. The customer is not told to use it, and the page does not expose the action id or an admin reissue state.

Customer-owned `case_tasks` are not shown. Their free-text titles are not a customer-safe contract yet. That is deliberate fail-closed behaviour.

Attention items carry `dueAt` for evidence and `expiresAt` for a secure action. They do not carry internal ids. The supporting copy tells the customer to use the secure link in the ProfileRelaunch email. The portal does not complete those steps in this phase.

## Coarse status

The presentation state is resolved in this order, and it does not change the case:

1. `CANCELLED` status → Cancelled
2. `CLOSED` status → Complete
3. Any live attention item → Action needed
4. Work stage `WAITING_GOOGLE` → Waiting for Google
5. Work stage `SUBMITTED` → Submitted
6. Status `RECEIVED` and work stage `INITIAL_REVIEW` → Received
7. Everything else active → In progress

Closed and cancelled cases return `attentionItems: []` even if a stale open action row is still present.

Service labels are Guided service and Managed service. `UNDECIDED` shows no service label.

## Dashboard and cases

`/portal` is the dashboard. It shows an attention section (at most five cases, newest submission first), a definition list of active, attention, and previous counts, and up to three recent cases. Recent cases put active cases before previous cases, then newest submission. There is no urgency ranking and no `updated_at`.

`/portal/cases` lists cases in views `active`, `previous`, and `all`. The default is active. An invalid view or a half-present cursor is a 404, not a query. Pages are fixed at 20 rows. The next-page cursor is `submitted_at` plus the public reference. It does not contain a case UUID. There is no previous-page control and no search box.

At the end of UX-10C the case cards were not links, and there was no `/portal/cases/[id]` route. UX-10D adds a textual "View case" link to `/portal/cases/{public reference}`. The UUID route still does not exist.

Dashboard and Cases stay server-rendered. Only the portal navigation reads the pathname in the browser, so Dashboard is current only on `/portal` and Cases is current on `/portal/cases` and its descendants. Documents, Payments, Relaunch Guard, and Account stay unavailable. There is no Messages destination.

## Security boundary

These reads do not weaken UX-10A. Portal sessions and action sessions stay separate. A portal session still cannot open `/case` or an action API. An action session still cannot open the portal. The provider JWT is still revoked after OTP. Email and Auth identity changes still invalidate the portal session. Sign-out still works. The portal gate stays off.

## Migration

`supabase/migrations/20261003154314_customer_portal_dashboard_cases_v1.sql` is additive. It creates the private attention helper and the two public RPCs. It creates no table and no index. The public RPCs are `SECURITY DEFINER`, with an empty search path, revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`. The private helper is also revoked from `service_role`.

The migration was applied to `profilerelaunch-dev` on 2026-10-03 after independent review. Supabase MCP initially registered `20261003180252`; that single history row was repaired immediately to repository version `20261003154314`. `appliedMigrationHead` remains `20261003154314_customer_portal_dashboard_cases_v1.sql`. UX-10D later added `20261003183002_customer_portal_case_workspace_v1.sql`, which is in the repository and is not applied, so `pendingMigrations()` contains that file. The UX-10C migration is immutable.
