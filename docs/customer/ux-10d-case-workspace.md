# UX-10D — Customer case workspace

UX-10D is the first individual case workspace in the Customer Portal. It is read-only. A customer can open one case they directly own and see what the case is, where it currently sits, whether ProfileRelaunch needs anything, what has happened, and what happens next.

The Customer Portal is not launched. `CUSTOMER_PORTAL_ENABLED` stays unset. This document describes the UX-10D workspace. UX-10E later added documents and evidence. UX-10F later added quote, agreement, and permission actions. Payment, Guard, messaging, and account editing remain outside it.

## Route

`/portal/cases/[reference]` uses the public case reference, for example `/portal/cases/PR-26-ABC234` or `/portal/cases/RV-26-XYZ567`. The reference is checked with the UX-10C pattern `^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$` before the RPC is called. An invalid format calls `notFound()`. The case UUID is not used in the URL, HTML, React keys, query strings, or data attributes.

## Ownership

`public.customer_portal_case_v1(p_token_hash text, p_reference text)` accepts only the portal token hash and the public reference. It does not accept a customer id, case UUID, business id, email, or Auth user id.

Inside PostgreSQL it calls `admin_private.customer_portal_session_v1(p_token_hash)` and then looks up `cases.public_ref = p_reference AND cases.customer_id = portal customer`. Business membership, and sharing a business or location, does not authorise a case. The business and location join fails closed when the location does not belong to the case business, matching the UX-10C list.

An invalid, expired, revoked, or identity-invalid portal session returns SQL `NULL`. The page redirects to `/login`.

A valid session with a missing reference, another customer's reference, or an ill-formed reference returns exactly `{ "found": false }`. The page calls `notFound()`. The two not-found results are the same object. There is no forbidden response, no owner mismatch, and no case id.

A valid owned case returns `{ found, case, timeline, timelineTruncated }`.

## Safe projection

The case object contains only `reference`, `caseType`, `serviceTrack`, `businessName`, `locationName`, `status`, `workStage`, `submittedAt`, `closedAt`, `attentionItems`, and `outcomeCode`.

`outcomeCode` is not the raw `cases.outcome` column. It is `RESTORED` only for `PROFILE_RECOVERY`, `REMOVED` only for `REVIEW_PROTECTION`, and `null` otherwise. Unknown outcome text is not returned.

The workspace does not call `resolveCaseFlow` and does not recreate Admin phases, waiting-on, primary actions, blockers, or reason codes.

## Progress

The six customer steps are a current-position presentation owned by TypeScript. They are not workflow authority and they are not stored.

| Work stage | Step |
| --- | --- |
| `INITIAL_REVIEW` | Case received |
| `EVIDENCE_COLLECTION`, `ASSESSMENT_READY` | Information |
| `SERVICE_SELECTION`, `PAYMENT_REQUIRED`, `AUTHORIZATION_REQUIRED` | Service setup |
| `PREPARATION`, `READY_TO_SUBMIT` | Preparing your case |
| `SUBMITTED`, `WAITING_GOOGLE`, `OWNER_ACTION`, `FURTHER_REVIEW` | Submitted to Google |
| `OUTCOME_REVIEW`, `FINISHED` | Decision |

`CLOSED` is always shown at Decision. `CANCELLED` does not show the tracker. If the authoritative case moves backward, the visual current step may move backward. Earlier steps are labelled "earlier step", not "Completed". The current step has `aria-current="step"`. The steps are not links.

## What happens next

Attention is not reimplemented. The case RPC calls `admin_private.customer_portal_case_attention_v1`, the same helper the dashboard and cases list use. The first item in that display order is shown with the existing `presentAttention()` label and support sentence. Further items are listed under "You also have {n} other step(s) waiting for you."

When there is no attention, the wording follows the UX-10C customer case state: received, in progress, submitted, waiting for Google, a recognised complete outcome, the generic complete fallback, or cancelled. The page does not promise a Google response time and does not imply a refund.

UX-10E later made evidence upload a portal action. UX-10F later moved quote, agreement, and permission review into `/portal/cases/[reference]/service`. Payment support copy still points at the secure link in the ProfileRelaunch email until UX-10G.

## Timeline

`Case updates` is curated. PostgreSQL returns `code` and `occurredAt` only. TypeScript owns the sentence. The database does not read `case_events` or `event_data`, and it does not turn arbitrary event types into labels.

| Code | Source |
| --- | --- |
| `CASE_RECEIVED` | `cases.submitted_at` |
| `EVIDENCE_SUBMITTED` | Customer version, uploaded, with `uploaded_at`, joined document → evidence request → this case |
| `EVIDENCE_ACCEPTED` | Customer version, accepted, with `reviewed_at`, same chain |
| `QUOTE_ACCEPTED` | `quote_acceptances` through the quote version for this case and customer |
| `SERVICE_AGREEMENT_ACCEPTED` / `SERVICE_AGREEMENT_WITHDRAWN` | `authorization_records` for this case and customer |
| `CASE_PERMISSION_CONFIRMED` / `CASE_PERMISSION_WITHDRAWN` | `authorization_records` for this case and customer |
| `PAYMENT_RECEIVED` | `payment_receipts` whose obligation and service order both belong to this case and customer |
| `SUBMITTED_TO_GOOGLE` | `case_submissions` for this case |
| `GOOGLE_DECISION_RECORDED` | `case_submission_results.result = DECIDED` only |
| `CASE_COMPLETED` / `CASE_CANCELLED` | `closed_at` when the status is `CLOSED` or `CANCELLED` |

`WITHDRAWN` submission results are not customer events in this phase. Amounts, filenames, Google references, reviewer notes, revocation reasons, and provider ids are not returned. Separate receipts stay separate.

Events are newest first. The query reads 21 rows and returns 20. `timelineTruncated` is true only when a 21st row existed. There is no timeline pagination. The tie-break used to keep that order stable is not returned.

## Migration

`supabase/migrations/20261003183002_customer_portal_case_workspace_v1.sql` is additive. It creates `admin_private.customer_portal_case_timeline_v1(uuid, uuid)` and `public.customer_portal_case_v1(text, text)`. It creates no table and no index.

The public function is `SECURITY DEFINER`, with an empty search path, revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`. The private timeline helper is also revoked from `service_role`. No new table grant is made.

The migration was applied to `profilerelaunch-dev` on 2026-10-03 after independent review. Supabase MCP initially registered `20261003191113`; that single history row was repaired immediately to repository version `20261003183002`. At UX-10D completion, `appliedMigrationHead` and `migrationHead` both pointed at `20261003183002_customer_portal_case_workspace_v1.sql`. UX-10E later added and applied `20261003194353_customer_portal_documents_evidence_v1.sql`; UX-10D remains immutable and is not replayed.
