> **Approved scope update:** Admin access is now limited to the single account `admin@profilerelaunch.com`, with no staff levels or role-management UI. See `single-admin-auth.md` for the implemented identity, session and setup contract. References below to multiple owners, staff roles and staff invitations are superseded by this decision. Future sensitive financial actions still require fresh verification and audit.

# ProfileRelaunch Admin Portal
Detailed implementation plan
Version 1.0 | 16 September 2026

Build one reliable workspace for running the business: enquiries, clients, cases, evidence, permissions, payments, monitoring and customer communications.

The portal will live at admin.profilerelaunch.com. Staff will sign in with their approved email address and a one-time email code. There will be no admin link on the marketing website. Customer Login belongs to the separate customer portal.

The priority is clear information and dependable actions. Use a simple, accessible interface with useful tables, filters, queues and record histories. Visual effects and decorative dashboards are unnecessary.

This is the complete target scope, delivered through 24 bounded implementation steps. Manual Google operations are a supported production workflow. API approval changes how checks are collected; it does not change the underlying customer, case or billing records.

## How to use this plan
Sections 1–16 define the product, controls and technical contracts. Section 17 gives Cursor a sequenced build plan with deliverables and acceptance criteria. Sections 18–20 cover owner setup, launch acceptance and references.

Agreed business rules are distinguished from recommended operating defaults. Defaults can be changed through an explicit decision before the affected stage; they must not become invented customer promises.


# 1 Scope and delivery boundary
## What staff must be able to do
The admin portal must support the complete journey from a new enquiry to assessment, service agreement, evidence collection, case work, outcome, payment and closure. It must also support a healthy business subscribing to Guard without creating an artificial case.

| Workspace | Required capabilities |
| --- | --- |
| Today | Work due, unassigned work, missed checks, alerts, failed messages, payment exceptions and service health. |
| Clients | People, verified contacts, businesses, locations, access permissions, complete activity and duplicate resolution. |
| Enquiries and cases | Intake, triage, assessment, Guided and Managed workflows, deadlines, submissions, outcomes and complaints. |
| Documents | Secure uploads, evidence requests, review, versions, prepared packs and customer publication. |
| Guard | Onboarding, per-location activation, daily checks, baselines, alerts, pauses, cancellation and included periods. |
| Money | Quotes, orders, payment setup, invoices, success fees, subscriptions, refunds, disputes and reconciliation. |
| Communications | Incoming messages, outgoing replies, templates, delivery events, failed delivery and phone follow-up records. |
| Operations | Tasks, staff workload, reporting, audit, privacy requests, settings, integrations and incident handling. |

## What remains outside the portal
Google owner-only actions, Google review decisions, bank settlement, tax filing, domain ownership and cloud-provider account recovery remain with the responsible external systems. The portal should track their status, evidence and next action and provide approved provider links. It must not claim to perform actions the integration cannot support.

The customer portal is a separate build. This plan includes its shared data contracts and secure customer action pages needed for consent, evidence and payment. It does not require a fully designed customer dashboard before staff can work.

Marketing pricing and legal copy stay source-controlled initially. Admin can propose and approve changes; publication follows a reviewed release. A general-purpose website builder, payroll, bookkeeping ledger and mass marketing platform are outside this operational scope.


# 2 Existing foundation and required extensions
Repository baseline: main at a83739380718bf1697d5a69ebcf9f24bd0cfbeb9, including merged PR 84. Public contact copy now uses contact@profilerelaunch.com; public copy alone does not establish working inbound mail or a verified sending domain. [R1]

| Existing implementation | Admin implication |
| --- | --- |
| customers, businesses, locations | Extend and reuse these IDs. Do not create a second customer database. |
| cases and case_events | Intake exists; add assignments, workflow detail, visibility, outcome and deadlines. |
| PR/RV references generated in PostgreSQL | Preserve PR-YY-XXXXXX and RV-YY-XXXXXX with the current six-character alphabet. Do not revert to the four-character blueprint example. |
| monitoring_requests and events | These are onboarding records, not paid subscriptions or proof of active monitoring. |
| communications | Currently PENDING, SENT or FAILED; exactly one case or monitoring-request parent. Extend carefully for general enquiries and delivery history. |
| Atomic intake RPCs and submission keys | Preserve retry safety, saved snapshots and existing receipt references. |
| RLS enabled with browser access revoked | Add deliberate staff access policies and narrow commands. Never enable blanket authenticated access. |
| CASE_PERSISTENCE_ENABLED and MONITORING_PERSISTENCE_ENABLED | Preserve existing defaults. Check deployed values separately before changing intake behaviour. |

## Migration constraints
The current case statuses are RECEIVED, UNDER_REVIEW, AWAITING_CUSTOMER, RECOMMENDATION_READY, CLOSED and CANCELLED. Keep these compatible while adding a separate work_stage for fulfilment detail. Historical cases must retain their references, events and timestamps. [R2]

The current Guard request captures one location record plus number_of_locations. A request for ten locations is not ten billable or covered locations. Add an onboarding-location mapping and gather the other nine locations before quoting or activating them. [R3]

Businesses currently do not have a direct customer ownership column. Relationships can be inferred operationally through cases and monitoring requests, but these submissions are not proof of ownership. Add explicit verified business memberships before exposing records in the customer portal.

General contact enquiries need persistent records and an admin queue. Do not assume they already exist merely because their email was sent. Extend intake without duplicating PR/RV cases or silently enabling extra customer acknowledgements.


# 3 Architecture and deployment
## Recommended structure
Keep the existing marketing app at the repository root initially. Add an independent Next.js admin app under apps/admin, deployed as its own Vercel project. Extract shared domain types, validation and pricing into packages/domain and server commands into packages/server as they become necessary. Configure workspace builds explicitly; do not move every marketing file just to introduce admin.

Both portals use the existing Supabase database. Staff access and customer business membership are separate authorisation systems. A valid customer login must never imply staff access. Keep the same business IDs and events across marketing intake, admin and future customer views.

Use server-rendered pages and server endpoints for sensitive reads and mutations. The admin browser receives an opaque application session cookie; Supabase tokens remain in an encrypted server session store. No Supabase privileged key, payment secret or Google refresh token reaches the browser. All sensitive responses use private, no-store caching.

## Domain and environment rules
Production serves admin.profilerelaunch.com with TLS. Configure exact allowed origins and redirect URLs; validate mutations with origin/CSRF protection. Cookies must be host-only, Secure, HttpOnly and SameSite, without Domain=.profilerelaunch.com. Do not rely on hiding a link or noindex for protection.

All admin routes, APIs, file downloads and exports require staff permission checks. Preview deployments use separate test data and protected access. Add noindex and exclude admin from marketing sitemaps. An unauthenticated request must not reveal record data in HTML, page metadata or cached responses.

## Background work
Use a PostgreSQL outbox and durable jobs table, processed by a scheduled worker. A request commits the business change, audit event and job together. Workers claim jobs with leases, retry with backoff and move exhausted jobs to an exception queue. No essential work may depend on a browser tab staying open or a serverless process continuing after a response.

Recommended worker heartbeat: every five minutes. Record scheduled_at, started_at, completed_at, attempts and last_error. Alert when the worker is late. Provider calls use stable idempotency keys; retries cannot send duplicate invoices, alerts or case submissions.

The server command layer is the common API contract for admin and customer actions. Customer responses use explicit allowlists of fields; internal notes and raw provider payloads are never included by default.


# 4 Passwordless staff access
## Login and provisioning
Use Supabase email OTP, with a six-digit code and no password form. Supabase requires its email template to include the token to send a code rather than the default magic link. Use shouldCreateUser:false on sign-in. Only an Owner may provision an approved staff identity and active staff membership. Public signup never grants staff rights. [S1]

At login, check the approved email server-side, send a uniform response for allowed and unknown addresses, verify the OTP with Supabase, then check active staff membership again. Bind the resulting admin session to that authenticated user and staff membership version. Do not trust roles supplied by the client or editable user metadata.

Recommended defaults: code validity ten minutes; resend delay sixty seconds; five failed verification attempts per challenge; account and IP rate limits; thirty-minute idle timeout; twelve-hour absolute session limit. Enforce application limits in a shared datastore, not process memory. Validate provider limits as part of configuration. Code values must never appear in logs or audit payloads.

Require fresh OTP verification within five minutes for staff-role changes, refunds, exports of sensitive data and payment collection. Fresh email OTP is reauthentication, not independent MFA. Staff mailboxes should have MFA enabled. The user-facing admin login remains email and OTP.

## Session and recovery controls
Check active staff membership on every request, including downloads and jobs initiated by a user. Staff deactivation immediately invalidates admin sessions and prevents pending privileged jobs from running without reassignment. Provide sign out, sign out all sessions, session list and last successful login.

Maintain two named Owner accounts where staffing permits; never use shared logins. Prevent removal of the last active Owner. Bootstrap the first Owner using a reviewed one-off server script; record the action and remove the bootstrap mechanism after use. Account recovery requires verified ownership through the cloud account and an audited recovery procedure, never an email request alone.

Use production custom SMTP for Auth and test deliverability before launch; existing transactional API mail does not automatically configure Supabase Auth mail. Shared-project OTP template/expiry changes also affect customer authentication and must be tested together. [S2]

## Exact login text
Title: “Staff sign in”. Description: “Use your approved work email. We’ll send you a one-time code.” Button: “Send code”. Response: “If this email has access, a sign-in code is on its way.” Verification button: “Sign in”. Error: “That code is incorrect or has expired. Request a new code and try again.”


# 5 Roles and permissions
Authorise actions by capability and record scope. UI visibility is a convenience; the same rule must be enforced by the server and database. A staff account may have several explicit roles. New accounts start with no capabilities.

| Role | Allowed scope | Restrictions |
| --- | --- | --- |
| Owner | Staff access, settings, approvals, all operational areas and audit. | Cannot erase audit, alter settled payments or bypass recorded consent. |
| Operations lead | All clients/cases, assignments, outcomes, Guard, incidents and service communications. | No staff privilege changes or financial collection/refund without Finance capability. |
| Case specialist | Assigned cases, relevant contacts/evidence, assessments, packs and customer updates. | Cannot browse unrelated documents, change prices or collect money. |
| Monitoring analyst | Assigned locations, checks, access status, alert drafts and follow-up tasks. | No financial actions or unrelated case evidence. |
| Finance | Quotes, invoices, subscriptions, collection, refunds, disputes and reconciliation. | Only contact and outcome evidence needed for billing; no unrestricted sensitive evidence. |
| Support | Enquiry triage, contact details, approved summaries, incoming replies and customer follow-up. | Cannot authorise Google actions, approve success or change verified ownership. |
| Auditor | Read-only approved reports and audit records. | Sensitive document access and exports require separate permission. |

## Approval rules
Success-fee collection requires an accepted agreement, recorded successful outcome, supporting evidence and Finance/Owner approval. The specialist proposes the outcome. A different authorised person approves where staffing permits. If one Owner holds both functions, require fresh OTP and a recorded sole-operator exception; never fabricate a second approver.

Refunds, credits, write-offs, customer merges, business ownership changes, email recovery, legal holds and bulk exports require an explicit reason. Refunds cannot exceed unrefunded collected funds. Bulk actions display the affected records and amounts and enforce permissions per record.

Changes to staff access, published prices, legal templates and production integration modes are Owner-only. No one can approve their own role escalation. Prevent disabling the only Owner or removing the only responsible person from a live monitoring rota without a replacement.

## Security acceptance
Test a customer account, inactive staff, each restricted role, a forged role payload and direct API/file access. Test cross-customer identifiers and expired sessions. Service-role connections bypass ordinary RLS: reserve them for tightly scoped intake/provider jobs; user-driven admin reads should use the verified user's token and explicit RLS. Security-definer functions must validate identity/capability, restrict EXECUTE and use a fixed search_path. [S3]


# 6 Dashboard and navigation
Use a left sidebar: Today, Enquiries, Clients, Cases, Documents, Guard, Payments, Communications, Tasks, Reports, Audit, Settings. Show only authorised modules. Global search covers case reference, client name, verified email, business, location and invoice reference within the user's scope.

## Today page
Place “Needs attention” first: overdue work, unassigned enquiries, failed or missed checks, unreviewed alerts, failed customer email, access lost, payment exceptions and job failures. Every number opens the filtered records that produced it. Show refresh time and stale-data warnings.

| Metric | Definition |
| --- | --- |
| Clients | Distinct non-merged customer records, with separate counts for active service clients and enquiry-only contacts. Never label every enquiry a paying client. |
| Open enquiries | NEW, TRIAGED, AWAITING_CUSTOMER or READY_TO_CONVERT. Converted, spam and closed items excluded. |
| Open cases | Cases not CLOSED or CANCELLED; successful-but-unclosed work remains visible with its outcome. |
| Collected payments | Successful gross collections in selected period; show refunds and net collections separately. Exclude open invoices. |
| Outstanding money | Due, unpaid invoice balances; do not count unearned Managed success fees as debt. |
| Guard locations | Separate requested, onboarding, paid active, included active, paused and ended. |
| Guard recurring value | Current recurring paid commitments in GBP per month; exclude included periods, ended and paused coverage. Keep separate from cash received. |
| Check coverage | Completed qualifying checks / checks due for active locations in the period. Failed and missed checks remain failures, not healthy checks. |

Show case mix, upcoming deadlines, workload by staff, recent payments and today's monitoring windows beneath the action queue. Keep operational freshness separate from historical charts. Date filters: today, last seven days, current month and custom; display Europe/London boundaries and currency.

## Interface requirements
Tables need pagination, search, sorting, saved filters, count, clear empty/error states and permission-aware export. Record pages need a stable title/reference, status, owner, next action, timeline and related records. Use visible text with status colour, keyboard navigation, labelled forms, clear focus states and accessible confirmation dialogs.

Preserve drafts and warn about unsaved changes. Show conflict messages when another staff member changed a record. Do not show optimistic “Saved” messages before the server commits. Sensitive changes display a review summary with the exact affected customer, location and amount.


# 7 Clients enquiries and relationships
## Client record
Tabs: Overview, Businesses and locations, Cases, Guard, Documents, Money, Communications, Permissions and History. Display primary and billing contact separately; phone is optional and must not be assumed available. Record contact verification and reachability separately from account status.

Support one customer with multiple businesses, multiple contacts for one business, and multiple locations per business. Membership roles should distinguish business owner, authorised contact and billing-only contact. Invitations require proof of authority; matching a submitted email or website does not establish access rights.

Changing a login email requires verification of the new email and a controlled recovery process if the old email is unavailable. Notify the previous contact where appropriate, revoke affected sessions and record the reason. A phone conversation can start recovery; it does not by itself prove account ownership.

## Enquiry queue
Persist general web enquiries, manual phone enquiries and unlinked inbound messages. Required fields: source, received time, contact, message, service interest, assignee, status and next-action date. States: NEW, TRIAGED, AWAITING_CUSTOMER, READY_TO_CONVERT, CONVERTED, CLOSED and SPAM. Record closure/spam reason and retain the original message.

Convert to a PR/RV case using the existing database reference generator and an idempotent command. Convert monitoring interest to a monitoring request, not a case. Link the source enquiry and avoid sending duplicate receipt emails for the same intake. Existing formal cases should appear in case queues immediately without a second conversion.

## Duplicate handling
Suggest duplicates by normalised email, business name and profile URL; never auto-merge ownership because names match. Owner/Operations may propose a merge after reviewing memberships, cases, invoices, consent and location conflicts. Preserve a redirect from old IDs, original snapshots and an audit record. Do not merge Stripe customers automatically or rewrite settled financial records.

## Operational tasks
Record calls, failed call attempts, preferred contact times and promised follow-up dates. Customer requests, complaints and cancellation requests must create tracked work with an owner, due date and resolution. A complaint must not disappear when a case closes.

The customer view exposes only verified memberships and approved information. Add a read-only “Customer-visible preview” in admin that uses the customer field allowlist. Avoid unrestricted impersonation or issuing staff a customer login code.


# 8 Case management
## Record and workflow
Case fields: immutable public reference, type, subtype, business/location/customer, issue description, review URL where relevant, original snapshot, assignee, priority/reason, work_stage, outcome, first-response due date, next action and relevant Google reference. One review case must identify the exact review and agreed scope.

Preserve existing top-level statuses. Add work_stage for the operational journey: INITIAL_REVIEW, EVIDENCE_COLLECTION, ASSESSMENT_READY, SERVICE_SELECTION, PAYMENT_REQUIRED, AUTHORIZATION_REQUIRED, PREPARATION, READY_TO_SUBMIT, SUBMITTED, WAITING_GOOGLE, OWNER_ACTION, FURTHER_REVIEW, OUTCOME_REVIEW and FINISHED. Enforce allowed transitions in a central command service; do not offer an unrestricted status dropdown.

UNDER_REVIEW covers active internal work; AWAITING_CUSTOMER means a specific customer action exists; RECOMMENDATION_READY means the assessment is published. Closing requires an outcome, summary and resolution of open tasks. Reopening needs a reason, new tasks and history; it cannot trigger a second success fee automatically.

## Guided service
Review facts and evidence; publish the assessment and quote; customer accepts and pays upfront; staff prepare a versioned pack; reviewer approves it; publish instructions and pack; customer submits to Google; record their confirmation and subsequent outcome. Never label a Guided pack as submitted by ProfileRelaunch. A revised pack supersedes the previous version with a clear change note.

## Managed service
Publish scope and the defined success condition; collect acceptance, required permission and verified access; collect payment-method consent if using later off-session collection; prepare and submit through permitted channels; track Google reference, submitted evidence and follow-up dates. Owner-only actions create explicit customer tasks. Record success evidence, obtain billing approval, collect the agreed success fee and close with a customer summary.

## Outcomes and exceptions
Recovery outcomes: RESTORED, PARTIALLY_RESTORED, NOT_RESTORED or WITHDRAWN. Review outcomes: REMOVED, NOT_REMOVED, RESPONSE_RECOMMENDED or WITHDRAWN. Partial success does not automatically qualify for the full fee; compare the accepted agreement. Google decides outcomes; admin must not promise or fabricate removal/restoration.

Track appeals, rejection reasons, new evidence and submission attempts as separate immutable records. Prevent duplicate simultaneous submissions. A deadline has a source, timezone, owner and reminder policy; an internal reminder must not invent a Google deadline. Configure first-response service hours independently from seven-day Guard monitoring; do not inherit the blueprint's two-hour promise without approval.


# 9 Documents evidence and permission
## Evidence workflow
Create an evidence request with a plain-language explanation, accepted file types, due date and case/location context. States: REQUESTED, UPLOADED, UNDER_REVIEW, ACCEPTED, REPLACEMENT_REQUIRED and WITHDRAWN. Staff can accept or request replacement with a reason. Record who uploaded the file and whether it came from the customer or was added by staff after a call/email.

Use private Supabase Storage buckets and database metadata. Proposed initial limits: PDF, JPEG, PNG and DOCX; 20 MB per file; no executable files, HTML, SVG or archives. Validate bytes and MIME server-side, randomise storage keys, quarantine uploads for malware scanning and release only clean files. A scanner outage leaves files quarantined. Use an isolated safe preview; never render untrusted HTML inline.

Downloads require record-level permission and short-lived signed URLs, proposed expiry five minutes. Audit issuance of download links. Prevent public bucket access and path guessing. Customer uploads use an authenticated, scope-bound action page; do not accept a case reference as authentication.

## Versions and customer visibility
Store checksum, original filename, size, MIME, uploader, version, classification, scan result, review state and retention category. Never overwrite an accepted evidence file. Prepared packs have DRAFT, IN_REVIEW, APPROVED, PUBLISHED and SUPERSEDED states. Publishing is explicit; internal notes and drafts are private by default.

Document-request emails link to the secure action page and avoid sensitive attachments. If a file arrives by email, ingest through quarantine, link it to the correct record and confirm provenance. Show failed uploads and orphaned storage objects in an exception queue with safe cleanup.

## Permission records
Store a versioned agreement snapshot, accepting verified person, business/location scope, permitted actions, timestamps, source and revocation. Separate privacy acknowledgement, service agreement, Google Manager access, permission to manage a case and authority to collect a future fee. The marketing setup checkbox is not blanket consent for all of these.

Verify Manager access per location and record the staff verifier and evidence. Never request the customer's Google password or OTP. Manager access can permit edits, but Guard itself is observation and alerting; edits need a separate approved case/action. Revocation immediately blocks related actions and starts the service/billing pause workflow.


# 10 Guard onboarding and coverage
## Commercial rules
Guard costs £9.99 per month per named Business Profile/location. Customer copy uses the published price, without “introductory”, “early access” or a lifetime price promise. Monitoring is manual twice daily, morning and evening UK time, every day including bank holidays. No instant or continuous-detection promise.

Onboarding order: request received; confirm each location; obtain explicit permission; verify Manager access; capture baseline; accept price and recurring terms; collect payment; confirm activation. A requested location, an accepted payment or a Stripe subscription status alone cannot establish coverage.

Recommended exact windows for owner approval: 09:00–11:00 and 17:00–19:00 Europe/London. Generate schedules using this named timezone so BST/GMT changes are handled. Store timestamps in UTC and display UK local time. The rota must name a primary and backup for both windows, including weekends and holidays.

## State model
Keep monitoring_requests as intake history. Create separate per-location coverage records with REQUESTED, AWAITING_AUTHORIZATION, VERIFYING_ACCESS, BASELINE_REQUIRED, AWAITING_PAYMENT, READY_TO_ACTIVATE, ACTIVE, PAUSED, ENDING and ENDED. Store billing state separately: NOT_REQUIRED, PENDING, CURRENT, PAST_DUE, PAUSED or ENDED.

Activation command requires all onboarding gates, an assigned rota, a current reachable contact, paid-through entitlement or a valid included period, and a baseline. Record activated_at and the first scheduled check. If payment succeeds but activation fails, create an urgent exception; keep coverage inactive and resolve or refund. Never silently consume paid time before activation: align the first paid period to actual activation or credit the difference.

## Included coverage
After an eligible successful Managed recovery, offer an optional 30 days of Guard for the restored location. Obtain the customer's choice, permission and access. The 30 days start at activation. No automatic paid conversion. Recommended reminders: seven days and one day before expiry, with a final ended notification. Continue only after separate paid acceptance and payment.

## Discount eligibility
An eligible new issue at an active paid Guard location may receive 20% off standard Managed support: £239.20 recovery or £119.20 review. Exclude pre-existing issues, included-only coverage, Guided plans, Guard fees, bespoke/bulk prices and stacking. Snapshot eligibility and agreed quote so later cancellation does not remove an already-agreed discount. Retain the success-fee condition.


# 11 Guard daily operations and exceptions
## Check queue
Generate one obligation for each active location and each daily window. Each obligation includes both profile and review checks. Uniqueness key: location, local service date and window. An analyst claims the task; record actual observation time, completion time, method, source and individual profile/review results. Do not allow a “healthy” bulk completion without observations.

Show current baseline, profile link, access status, last successful observations and unresolved alerts. Record visible profile availability, relevant details changed, new reviews and specific concerns within the agreed scope. An unavailable observation is UNKNOWN or ERROR, never HEALTHY. Historical results cannot be silently edited; corrections append a new event.

At window end, incomplete obligations become MISSED and notify the lead/backup. Failed checks prompt a retry within the window where feasible. A late check is useful but remains late in coverage reporting. Measure handling minutes per location to understand capacity at £9.99. Warn before accepting more locations than the staffed rota can cover.

## Alert lifecycle
States: DETECTED, UNDER_REVIEW, READY_TO_NOTIFY, NOTIFIED, ACKNOWLEDGED, LINKED_TO_CASE, RESOLVED and DISMISSED. Deduplicate by location, issue identity and observation, while preserving each source check. A human reviews severity and evidence before customer notification. Store false-positive/dismissal reasons.

An alert describes what changed, when it was observed and the next practical step. It must not claim a review breaches policy before assessment. Link an alert to a new or existing PR/RV case only when intervention is needed and scope is accepted. Creating a case cannot silently authorise or charge for Managed support.

## Coverage and contact failures
Access revoked: mark affected coverage PAUSED, record the gap, notify the customer and stop future billing for unavailable coverage. Apply a credit/refund for unused paid coverage from the pause time under the accepted policy. Other locations remain independent.

Email hard bounce: suppress blind retries, create contact-recovery work, call the recorded number if available, verify any replacement email and log the outcome. If no reliable channel can be established, pause coverage and billing. A phone number is not mandatory today, so show “No phone available” as an actionable exception.

Worker outage, staff absence and provider failures create visible incidents. Resume only after access/contact/billing checks pass and a fresh baseline is captured where necessary. Record the uncovered interval; do not backfill fictitious checks. Customer case work already agreed remains separate from Guard cancellation or pauses.


# 12 Payments quotes and subscriptions
Use Stripe as the recommended payment provider. Store money as integer minor units with currency; £9.99 is 999 GBP pence. Never store card numbers, CVCs or banking credentials. Keep service agreement, order, invoice, payment, refund and coverage as distinct records.

| Service | Standard price | Payment gate |
| --- | --- | --- |
| Guided Relaunch | £99 | Accepted scope and successful upfront payment before pack preparation. |
| Managed Relaunch | £299 | No initial service fee; collect only after the agreed successful restoration. |
| Guided Review | £59 | Accepted scope and successful upfront payment before preparation. |
| Managed Review | £149 | No initial service fee; collect only after the agreed successful removal. |
| Relaunch Guard | £9.99 monthly per location | Access and baseline ready, accepted recurring terms and payment before activation. |

## Quotes and collection
Quotes contain version, named service/location, scope, exclusions, success definition, amount, discount basis, tax treatment, validity and acceptance record. Accepted prices are immutable; amendments require a new accepted version. Do not silently apply later catalogue prices to existing orders.

For Managed work, use a hosted payment-method setup flow with explicit consent to later collection. A saved method alone is not permission to charge. After approved success, create a single fee obligation and attempt collection idempotently. If additional authentication is required, send a secure payment action; do not mark it paid. Allow a hosted invoice payment path when collection cannot proceed. Never charge twice through both paths. [S4]

Finance screens show due invoices, unpaid earned success fees, payment attempts, receipts, refunds, credit notes, disputed charges and reconciliation differences. Show provider references and history. Provider-confirmed data determines payment state; a return from Checkout is not payment proof. [S5]

## Webhooks and reconciliation
Verify signatures against the raw body. Store each provider event with a unique provider/event ID, processing status and retry history. Handle duplicate and out-of-order events safely; fetch current provider state when needed. Commit local updates once and queue downstream work. Display failed events and controlled replay, with no duplicate side effects. [S6]

Reconcile invoices, collections, refunds and subscriptions daily against Stripe. Show gross collections, refunds, fees and payouts separately; payouts are not sales. Record manual bank payments only with Finance verification and reference evidence, if that method is enabled. Never offer a generic “Mark paid” shortcut for Stripe orders.


# 13 Billing changes and financial exceptions
## Per-location subscription design
Use one billable subscription per location initially, linked to the same Stripe customer. This makes activation dates, included periods, pauses and cancellation independent. The admin can present a consolidated client view. Bulk billing can be added through an explicit later billing design without changing location entitlements.

Cancellation offers period-end stop without a fee, or immediate stop with an unused-period refund under the accepted policy. Show end time, refund calculation and effect on coverage before confirmation. End future billing and revoke future check obligations at the correct time. Do not delete old checks or cancel separate case orders.

Proration recommendation: calculate unused service time against the actual paid period in UTC, round once to pence, cap at remaining refundable payment and record the calculation/version. Finance handles exceptional goodwill adjustments as separate credits with reasons. Confirm tax/credit-note treatment before live billing.

## Price changes
Maintain effective-dated price versions. Give at least 30 days' notice and require explicit acceptance before a higher renewal. If acceptance is absent, end before the first higher charge; do not silently migrate the subscription. Admin shows notice status, delivery failures, acceptance and affected renewal dates. Existing accepted case quotes remain unchanged.

## Failed renewals and pauses
Recommended rule: coverage can continue only through already-paid time. At paid-through expiry, pause rather than grant indefinite unpaid coverage. Notify the customer and provide a payment action. After settlement, revalidate access and contact before resuming. Do not backdate monitoring or charge for a service gap.

Stopping invoice collection is not necessarily the same as stopping invoice creation or service entitlement. Implement and test the selected Stripe pause/cancel/credit strategy explicitly. Show local coverage state alongside provider subscription and invoice state, and raise a mismatch alert. [S7]

## Disputes refunds and closeout
Disputes create an assigned case with provider deadline, evidence bundle, response status and financial exposure. Refund requests require amount, reason, affected payment and approval; track requested, pending, succeeded and failed separately. A refund failure remains visible until resolved.

Use sequential invoice identifiers through the chosen invoicing system. Confirm legal seller identity, billing address, tax status, invoice content and supported sales territories before activating live payments. Do not assume VAT registration or add “VAT included” by default. Accounting exports must preserve amounts/currencies and distinguish cash collection from earned service fees.


# 14 Communications and customer actions
## Unified communications workspace
Show conversations by customer and case/Guard context, with incoming unread items, staff assignment and next action. Keep email content, recipient snapshot, template version, provider ID, attachments, timestamps and delivery events. Historical messages retain the address used at the time; changing a contact does not rewrite history.

Extend the existing communications parent constraint through a reviewed migration. Add enquiry context and a validated context model for subscription/customer messages; preserve all existing case and monitoring-request relationships. Do not drop referential integrity merely to permit null parent fields.

Outbox states should distinguish queued, processing, provider accepted, delivered, delayed, bounced, complained and failed. Preserve SENT as legacy provider acceptance during migration; do not reinterpret it as delivered. Use a separate immutable delivery-events table. Verify provider webhook signatures and reject replays/duplicates. [S8]

## Incoming email
Select and configure an inbound provider route into the portal; an outbound Resend API setup does not prove incoming email is integrated. Use a dedicated reply routing address or controlled forwarding without breaking the existing mailbox. Match signed provider events and message thread IDs, quarantine attachments, sanitise content and place unmatched mail in triage.

Email sender text is not authentication. Requests to change ownership, login email, payment details or permissions must enter the verification workflow. A customer message cannot authorise code execution, privileged actions or changes to staff roles. Prevent mail loops and duplicate imports by provider message ID.

## Sending and customer action pages
Create versioned templates for receipts, evidence requests, assessment, quote acceptance, permissions, pack ready, submission update, owner action, outcome, payment due, Guard activation/alert/pause/end, cancellation, price changes and included-period reminders. Staff review factual case/alert messages before sending. Critical system receipts may be automatic after the corresponding committed event.

Provide secure, narrow customer pages for accepting a quote/permission, uploading evidence, viewing a published pack, responding to a task and making payment. Require customer OTP and verified record membership; any email token must be purpose-bound, expiring and revocable. Staff cannot tick “customer accepted” on their behalf without a separately approved, evidenced offline process.

No promotional email consent is implied by an enquiry or service signup. Keep service messages separate from marketing preferences. Never add an automatic upsell campaign as part of admin communications.


# 15 Data contracts audit and reliability
## Additive schema groups
| Group | New or extended records |
| --- | --- |
| Identity | staff_users, staff_roles/capabilities, admin_sessions, business_memberships, contact_verifications. |
| Intake and work | enquiries, case assignments/work_stage/outcome, case_status_history, tasks, task_events, submissions, complaints. |
| Documents and consent | evidence_requests, documents, document_versions, authorization_records, agreement_versions, customer_actions. |
| Commercial | price_versions, quotes, quote_versions, service_orders, invoices, payment_attempts, payments, refunds, credit_notes, disputes. |
| Guard | onboarding_locations, location_access, baselines, coverage, subscriptions, check_obligations, monitoring_checks, monitoring_alerts, rota. |
| Platform | communications extensions, delivery_events, threads, outbox, jobs, webhook_events, audit_logs, incidents, privacy_requests, settings_versions. |

Use foreign keys and constraints to enforce valid business/location/case relationships. Add unique keys for provider IDs, submission retries, one success-fee obligation per order, one check obligation per window and duplicate active coverage. Add indexes for scoped search, status, assignee and due date. Paginate at the server; never download all customer data to filter in the browser.

## Command contract
Every mutation validates authenticated actor, capability, record scope, input, expected record version and an idempotency key when external effects are possible. It returns the committed record/version and operation ID. Stale edits return a conflict; duplicate retries return the original result. Changes, audit and outbox are atomic. External work runs after commit with reconciliation for partial failures.

Audit records contain actor, role, entity, action, time, reason, correlation ID and redacted before/after values. Append corrections rather than editing history. Audit document access, exports, financial actions, consent changes and denied privileged actions. No OTPs, tokens or full sensitive document content in logs.

## Privacy and recovery
Classify data and configure retention separately for unsuccessful enquiries, case evidence, financial records, consent and security logs. Owner approves periods and legal holds before deletion automation. Provide verified access/export/correction/deletion requests, reviewable scope, due dates and completion evidence. Keep necessary financial/audit records under the approved retention policy; avoid cascading deletes that destroy history.

Back up database and stored files and test restoration together. Recommended recovery targets for approval: no more than one hour of data loss and four hours to restore core operations; select provider plans and backup jobs that can actually meet them. Maintain an outage runbook and reconcile any offline work after recovery. Signed exports expire, obey permissions, neutralise spreadsheet formula injection and are audited.


# 16 Reporting settings and Google integration
## Reporting
Provide enquiry-to-case conversion, accepted quote conversion, Guided/Managed mix, first-response performance, case age, outcomes by service, evidence turnaround, collected revenue, refunds, overdue invoices, Guard activation/churn, coverage failures and staff handling time. Define denominators: success rate uses cases with a decided outcome and excludes open work; show excluded counts. Date ranges use explicit timezone and consistent event dates.

Reports must drill into their records, enforce role scope and support permission-controlled CSV exports. Do not put GA4 or advertising trackers in either authenticated portal. Operational product events should minimise personal data and use internal IDs.

## Settings
Owner-managed settings: staff permissions, service hours, response targets, check windows, rota, approved prices/offers, template versions, retention policy, alert escalation, supported countries/currency and operational feature flags. Changes have validation, effective date, reason and history. Changes to public promises require aligned website/terms publication before taking effect.

Integration page: last successful connection/event, stale jobs, webhook failures, configuration present/missing and safe test actions. Never display full secrets. Store credentials in the hosting/provider secret manager. Key rotation, DNS and infrastructure administration use restricted provider access; the portal records the task and verification.

## Google adapter
Define a provider interface for verifying location access, collecting profile observations, collecting reviews and reporting supported capabilities. Implement the manual adapter as a real production workflow and a mock adapter restricted to tests. Every observation records MANUAL, API or EVENT provenance; downstream alerts and cases use the same model.

Build encrypted credential references, OAuth state/PKCE handling where applicable, scope tracking, revocation, quota/backoff handling, per-location feature flags and an integration status screen. Keep connection controls disabled with “Google connection is not available yet. Manual monitoring is active.” only when that location is actually active manually; otherwise say “Manual setup is available.”

Google API approval is an external gate, not a guaranteed 30-day milestone. After approval, verify supported endpoints/scopes and provider policies, test access and compare API observations with manual checks in shadow mode. Enable location by location, retain human alert review and keep manual fallback. Do not automatically overwrite the customer baseline when reconnecting. [S9]

“Full functionality” means complete business workflows and exception handling. It cannot mean simulating unavailable API access or promising that every Google case action will be automatable. The final live API acceptance test necessarily happens after access is granted.


# 17 Implementation steps
## Delivery rules for every Cursor task
One bounded PR per step, with smaller PRs if necessary. Start from current main and inspect AGENTS.md and existing tests. Implement only the stated scope. Preserve marketing behaviour and existing IDs. No live customer emails, charges, migrations or flag changes as an accidental side effect of tests.

Each PR includes changed schema/contracts, screens, permission rules, meaningful tests, screenshots for affected UI, environment-variable names without values, migration/backfill instructions and rollback/forward-fix notes. No fake success responses, placeholder operational buttons or invented customer copy. A step is done only when its acceptance checks pass and the reviewer confirms the result.

## Step 1 Baseline and architecture contract
Deliver: record current commit, deployed environment inventory, applied migrations, intake flags, shared entity map and architecture decision for the separate admin app. Document the reviewed capability matrix and proposed operating defaults from this plan. Create a requirements checklist keyed to sections 1–16.

Acceptance: existing database IDs and counts are captured without exporting sensitive content; baseline tests/build pass; no production writes. Identify schema drift before drafting migrations. This step precedes all code work.

## Step 2 Admin application and domain shell
Deliver: apps/admin, shared-package build configuration, isolated Vercel project, login route, protected empty shell, route map, error boundaries and noindex/no-store settings. Configure admin subdomain in staging first.

Acceptance: marketing build remains unchanged; admin cannot leak page data unauthenticated; preview uses test environment. No admin link is added to marketing. Depends on 1.

## Step 3 Staff schema and OTP access
Deliver: staff membership/roles, secure application sessions, first-Owner bootstrap, OTP pages, custom SMTP configuration checklist, logout and session revocation. Implement exact copy in section 4.

Acceptance: unknown email, expired/wrong code, resend limits, disabled staff, customer-only account and session expiry are tested. No public staff signup. Depends on 2.

## Step 4 Authorisation and audit foundation
Current implementation: see `audit-foundation.md`. The single-account decision supersedes last-Owner and role-management requirements: there is no identity disable/delete/rebind command in the portal. Fresh OTP is enforced using the server-recorded sign-in time; new sensitive domain commands must adopt the same database check.

Deliver: capability checks, RLS/grants, scoped server commands, audit writer, optimistic concurrency, CSRF protection and security tests. Add last-Owner protection and fresh-OTP confirmation for sensitive actions.

Acceptance: direct API, forged payload, cross-record access and revoked-session tests fail closed. Audit survives rejected/failed actions appropriately. Depends on 3.


# 17 Implementation steps continued
## Step 5 Shared records and client workspace
Deliver: verified business memberships, client/business/location pages, scoped search, contact verification, relationship editing and duplicate review. Build customer-visible field projections before any customer pages.

Acceptance: one client/many locations and many contacts/one business work; unverified submitters gain no ownership. Existing case/Guard links remain valid. Merge preview preserves financial history and references. Depends on 4.

## Step 6 Persistent enquiries and triage
Deliver: general enquiries table/queue, safe extension to contact intake, manual phone intake, assignment, triage/close/spam states and idempotent conversion to case or monitoring request.

Acceptance: ordinary contact requests appear even if notification mail fails; retries create one enquiry; formal intake does not create duplicate cases; current acknowledgement flag remains respected. Depends on 5.

## Step 7 Workflow engine tasks and case workspace
Deliver: additive work_stage/outcome schema, transition matrix, case detail/timeline, task assignment/deadlines, submission records, internal/customer visibility and closure/reopen rules.

Acceptance: invalid transitions fail server-side; two staff edits produce a conflict; waiting states have a next action; Guided and Managed tracks are distinct. Public reference format stays unchanged. Depends on 5–6.

## Step 8 Evidence storage and review
Deliver: private storage, quarantined upload pipeline, malware scan integration, evidence requests, staff review, versions, safe preview, controlled downloads and prepared-pack approval/publishing.

Acceptance: unauthorised/oversized/malicious uploads rejected; scanner failure quarantines; expired links fail; unpublished documents never reach customer projections. Upload/delete failures appear in exceptions. Depends on 4–7.

## Step 9 Agreements and secure customer actions
Deliver: versioned quotes/permissions acceptance records, verified customer OTP action pages, business authority checks, Manager-access verification and revocation flow. These are reusable customer-portal foundations.

As built in Step 9A: immutable `agreement_versions`, OTP customer actions in `apps/customer`, existing verified memberships reused, Manager access separately verified by Admin. Quotes/payments and customer evidence/pack access remain later. `PREPARATION` / `READY_TO_SUBMIT` stay prerequisite-blocked.

Acceptance: another customer cannot accept/upload/view using a guessed ID; expired actions fail; old agreement snapshots remain intact; setup-form consent cannot satisfy Managed authorisation. Depends on 5, 7–8.


# 17 Implementation steps continued
## Step 10 Jobs outbox and operational health
Deliver: transactional outbox, durable jobs, scheduled worker, leases, retries, dead-letter queue, heartbeat, replay controls and environment-safe provider adapters.

Acceptance: worker crash after provider call does not duplicate side effects; competing workers claim one job; exhausted work is visible; production credentials cannot be used by preview tests. Depends on 4 and 7.

## Step 11 Communications ledger and outgoing mail
Deliver: reviewed communications-context migration, templates, draft/review/send, provider acceptance/delivery events, bounce handling and resend rules. Preserve existing intake receipt semantics.

Acceptance: business changes survive email failure; accepted is not displayed as delivered; duplicate webhooks do not resend; historical recipients remain unchanged. Critical customer copy follows section 19. Depends on 9–10.

## Step 12 Incoming mail and conversations
Deliver: configured inbound route, thread linking, unmatched inbox, safe attachment ingestion, assignment, replies, phone notes and contact-recovery tasks. Add a verified-mailbox operational test procedure.

Acceptance: spoofed sender cannot change identity/permissions; duplicate imports and mail loops are blocked; unlinked email can be triaged without losing the original. Existing inbox keeps receiving mail during cutover. Depends on 8 and 11.

## Step 13 Catalogue quotes and service orders
Deliver: approved price versions, immutable accepted quotes, service orders, discount qualification snapshots, tax configuration fields and quote acceptance pages. Use existing lib/pricing.ts values as the migration seed after review.

Acceptance: pence arithmetic is correct; Guard discount yields £239.20/£119.20; ineligible/free-period locations cannot qualify; later price/cancellation changes do not rewrite accepted quotes. Depends on 9.

## Step 14 Stripe upfront and success-fee payments
Deliver: hosted Checkout, payment-method setup, fee obligations, webhook processing, payment ledger, invoices/receipts, authentication-required recovery and Finance approval of success fees.

Acceptance: no charge before defined success for Managed; return page cannot mark paid; retries and duplicate webhooks create one collection; failing/SCA-required cards remain unpaid and actionable. Test mode only until finance launch gate. Depends on 10–13.


# 17 Implementation steps continued
## Step 15 Guard onboarding and activation
Deliver: onboarding-location mapping, per-location permissions/access/baseline checklist, coverage state machine, assigned rota and activation command. Keep current monitoring request history compatible.

Acceptance: ten requested locations do not become ten active locations automatically; payment without access cannot activate; eligible included coverage activates without a paid subscription; activation failure after payment creates an exception. Depends on 9, 10 and 14.

## Step 16 Subscriptions cancellation and refunds
Deliver: per-location billing, paid-through entitlements, included-period expiry/reminders, cancellation choices, pause credits/refunds, price-change notices/acceptance, disputes and daily reconciliation.

Acceptance: cancellation of one location leaves others intact; no auto-charge after included period; no higher renewal without notice/acceptance; payment failure pauses at entitlement expiry; refund failures remain visible. Depends on 14–15.

## Step 17 Manual checks rota and baselines
Deliver: twice-daily obligation generator, morning/evening queues, claim/complete, profile/review observations, baseline comparison, missed/failed retries, holiday/weekend cover and handling-time tracking.

Acceptance: UK clock changes produce exactly two windows; duplicate schedulers create no extra obligations; paused/ended locations are excluded; incomplete observations never count healthy; late completion stays late in reporting. Depends on 10 and 15–16.

## Step 18 Alerts escalation and linked cases
Deliver: alert review/deduplication, approved email notification, acknowledgement/resolution, severity, escalation, contact-recovery pause workflow and case linking with discount assessment.

Acceptance: duplicate observations do not spam the customer; case creation does not authorise charges; bounce plus missing phone triggers visible service action; reactivation requires restored access/contact. Depends on 7, 11–12 and 17.

## Step 19 Dashboard search and reports
Deliver: Today queues and metrics from section 6, global scoped search, saved filters, workload and operational/financial reports, audited CSV exports and customer-visible preview.

Acceptance: each count reconciles to its drill-down; dates/timezones and currency are explicit; exports obey role scope and neutralise spreadsheet formula injection; no analytics trackers are introduced. Depends on 6–18.


# 17 Implementation steps continued
## Step 20 Settings staff and privacy operations
Deliver: staff management UI, session revocation, versioned settings, approved template lifecycle, service hours/rota settings, retention/holds and verified privacy request workflows. Add complaints and incident resolution views if not completed earlier.

Acceptance: last Owner cannot be removed; retroactive settings do not rewrite historical obligations; legal holds block deletion; removal requests preview retained financial/audit data. No secrets appear in settings or exports. Depends on 4 and 19.

## Step 21 Google integration readiness
Deliver: provider interface, production manual adapter, isolated mock adapter, encrypted-token design, OAuth callback/CSRF handling, capability flags, integration health and disabled connection UI. Write live-provider acceptance tests for execution after approval.

Acceptance: mock results never enter production; disabled API mode cannot attempt unavailable calls; revocation and quota errors lead to manual fallback/visible gaps. Real API access remains an explicit external dependency. Depends on 15–18.

## Step 22 Migration rehearsal and disaster recovery
Deliver: additive migrations/backfills, validation queries, staging copy using anonymised data, rollback/forward-fix runbook, database-plus-storage recovery rehearsal and incident communication templates.

Acceptance: existing references/intake retries survive; new constraints validate before enforcement; restored files match metadata; recovery targets are demonstrated or adjusted before launch. Never rerun baseline CREATE TABLE migrations against the existing database. Depends on all schema steps.

## Step 23 End to end acceptance and security review
Deliver: role-by-role review, full journeys in section 19, browser tests, accessibility checks, failure injection, representative pagination/load checks and operational handover. Resolve every critical defect before release.

Acceptance: customer data cannot leak through APIs, files, caches or exports; every charge and customer-visible event is supported by evidence; no dead buttons; staff can complete a real simulated workday without database edits. Depends on 19–22.

## Step 24 Production cutover and signoff
Deliver: verified admin DNS/TLS, production secrets and webhook registrations, approved migrations, first Owners, rota, live smoke tests and release record. Activate live money/monitoring only after their separate readiness gates pass.

Acceptance: staff OTP works, marketing intake still works, queues receive submissions, mail delivery is observed, reconciliation is clean and an actual backup owner can operate the system. Monitor closely through the first full billing/check cycle. API automation is enabled later through its own verified rollout, without replacing the manual platform.


# 18 Owner and provider setup
These are explicit operational decisions or account tasks. They do not require reopening the agreed product direction, but must be resolved before their affected implementation gate.

| Owner task | Recommended decision or verification | Gate |
| --- | --- | --- |
| Staff accounts | Name first Owner, backup Owner and who handles operations/finance. Verify work mailboxes and mailbox MFA. | Step 3 |
| Admin domain | Add admin.profilerelaunch.com to the admin Vercel project; use provider-supplied DNS records; verify TLS and exact redirects. | Steps 2 and 24 |
| Supabase | Confirm production vs staging projects, migration history, Auth SMTP, OTP settings, storage and backup plan. Do not recreate the existing DB. | Steps 1–4 |
| Email | Verify public contact@profilerelaunch.com receives replies; separately verify actual From/To configuration and Auth sender. Choose inbound route. | Steps 3, 11–12 |
| Check windows | Approve 09:00–11:00 and 17:00–19:00 Europe/London or replace with staffed windows. Seven-day/bank-holiday coverage already agreed. | Step 17 |
| Service response target | Approve case/enquiry hours and first-response target. Keep distinct from Guard schedule. | Steps 7 and 20 |
| Finance | Confirm Stripe business account, payout details, legal seller, supported territories/currency, tax status and invoice requirements. | Steps 13–14 |
| Collection policy | Approve success definition templates, later-charge consent, refund calculation and sole-operator approval exception. | Steps 9 and 14–16 |
| Privacy | Approve retention by category, legal-hold handling, evidence processors and updated notices before uploads launch. | Steps 8 and 20 |
| Recovery and capacity | Approve backup/restore targets, worker/scanner costs and maximum staffed location capacity. | Steps 10, 17 and 22 |
| Google | Prepare request using Google's current eligibility requirements; track submission/access decision. No fixed approval date in customer copy. | Step 21 and later API release |

## What requires access outside this repository
DNS, provider billing, SMTP verification, bank details, secret configuration and live migration execution require the appropriate account access. Code PRs should supply exact names, instructions and verification evidence without requesting or exposing secret values in chat.

Recommended delivery order is the numbered sequence, with review after each step. The full scope is several substantial modules; it should not be committed to a one-month deadline on the assumption that Google approval will arrive. Estimate implementation duration after Step 1 confirms environment access and team capacity. Do not reduce scope silently to fit an arbitrary date.


# 19 Acceptance checklist and approved wording
## Required end to end journeys
| Journey | Evidence required to pass |
| --- | --- |
| Guided recovery and Guided review | Intake reference, assessment, accepted quote, upfront payment, evidence, approved pack, customer submission record and closure. |
| Managed recovery and Managed review | Accepted success terms, permission/access, submission history, outcome evidence, approved single success-fee collection and receipt. |
| Unsuccessful or partial outcome | Accurate outcome, customer explanation and no unearned full success fee. |
| Direct Guard with several locations | Each named location passes gates independently; only covered locations billed and checked. |
| Included Guard to paid or expired | Explicit choice, 30 days from activation, reminders and no unapproved conversion charge. |
| Alert to intervention | Human-reviewed alert, duplicate suppression, scoped quote/discount eligibility and separate case approval. |
| Failure and recovery | Missed check, revoked access, bounce/no phone, worker outage and failed payment produce visible owned work and correct coverage/billing. |
| Cancellation and changed price | Correct date/refund, separate case preserved, no unaccepted higher renewal. |
| Security and restoration | Restricted roles denied, staff revocation immediate, exports audited, private files protected and backups restored. |

## Exact core messages
Guard request: “We’ve received your monitoring request. We’ll confirm access and setup before monitoring begins.”

Guard activation: “Relaunch Guard is active for {location_name}. We’ll check your profile and reviews each morning and evening, UK time, including weekends and bank holidays. We’ll email you if we find something that needs attention.”

Failed check: “We couldn’t complete the {window_name} check for {location_name}. We’re looking into it and will update you when access is restored.” Use the second sentence only when investigation is assigned; otherwise specify the real next action.

Coverage paused: “Monitoring for {location_name} is paused from {date_time}. {plain_reason} We’ll confirm with you before monitoring resumes. {verified_billing_effect}”

Evidence request: “To continue with {case_ref}, we need {specific_document}. Please upload it securely using the link below. If you’re unsure what to send, reply and we’ll help.”

Success fee: “{verified_outcome} The agreed fee for {case_ref} is {amount}. {accurate_payment_status_and_next_action}” Do not say payment was collected before confirmation.

Copy rule: describe the fact, its effect and one clear next step. Substitute only validated fields; do not send unresolved placeholders. Avoid “seamless”, “revolutionary”, invented urgency, guaranteed outcomes and claims of instant monitoring. A human reviews case facts and exceptional messages before sending.


# 20 Source register and build completion
## Repository and product sources
R1. Repository baseline and latest merged contact change, PR 84. Reviewed 16 September 2026. https://github.com/NabarunDas/reputedefend-web/commit/a83739380718bf1697d5a69ebcf9f24bd0cfbeb9

R2. Core tables, case statuses and intake contracts: supabase/migrations/20260915120000_core_data_foundation_v1.sql; lib/cases/domain.ts; lib/supabase/database.ts, at the baseline commit above.

R3. Guard onboarding and communication-parent constraints: supabase/migrations/20260916000000_relaunch_guard_data_foundation_v1.sql, at the same baseline.

R4. Deployment flags and email boundaries: docs/launch-readiness.md and package.json, at the same baseline. Source configuration and deployed configuration must be verified separately during Step 1.

Product basis: supplied ProfileRelaunch Product Portal Blueprint and subsequent user decisions. Email OTP replaces the blueprint's suggested staff SSO; public introductory wording is removed; manual checks include weekends and bank holidays; admin has its own subdomain and no marketing navigation link.

## Provider references
Official documentation checked 16 September 2026. Provider details must be rechecked when implementing the relevant integration.

S1. Supabase email OTP and signup behaviour. https://supabase.com/docs/guides/auth/auth-email-passwordless

S2. Supabase production custom SMTP. https://supabase.com/docs/guides/auth/auth-smtp

S3. Supabase row-level security. https://supabase.com/docs/guides/database/postgres/row-level-security

S4. Stripe saving a payment method for later use. https://docs.stripe.com/payments/save-and-reuse

S5. Stripe Checkout fulfilment. https://docs.stripe.com/checkout/fulfillment

S6. Stripe signed webhook processing. https://docs.stripe.com/webhooks

S7. Stripe subscription event handling. https://docs.stripe.com/billing/subscriptions/webhooks

S8. Resend webhook verification. https://resend.com/docs/webhooks/verify-webhooks-requests

S9. Google Business Profile API prerequisites. https://developers.google.com/my-business/content/prereqs

## Definition of complete
Admin is complete when authorised staff can run every agreed service, handle exceptions and reconcile money through the portal; customer actions are secure; audit and recovery work; and all 24 steps have accepted evidence. Google automation remains gated by genuine provider access. Until then, the complete manual workflow remains the production operating model.
