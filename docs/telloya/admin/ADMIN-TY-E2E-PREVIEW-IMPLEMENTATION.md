# Telloya — Complete Admin-to-Customer Journey | Cursor Preview-Only Runbook

**Status:** IMPLEMENTATION INSTRUCTIONS, NOT AUTHORISATION TO LAUNCH OR COLLECT PAYMENT.
**Owner's operating decisions:** Demo is performed manually/offline in Retell. Admin ONLY records whether the demo is booked or completed. No demo scheduling engine, Retell agent creation, Retell API booking, call analysis or automated demo provisioning. One TY enquiry leads to a personalised, versioned offer, amendments/acceptance, approved service terms, recurring monthly payment, then operator-led setup using the current ProfileRelaunch platform.
**Repository:** NabarunDas/reputedefend-web
**Plan branch:** plans/telloya-admin-e2e-preview-20261112
**Cursor implementation:** create ONE separate dedicated branch based on this plan branch, e.g. cursor/telloya-admin-e2e-preview-20261112. Open ONE draft PR targeting develop. Commit independently at the end of each phase. Never merge.
**Deployment:** Vercel Preview ONLY via the draft PR branch. Do not merge to develop/main, promote deployments, change Production, modify Vercel environment variables, apply Supabase migrations to hosted environments, seed hosted plans/agreements, create Stripe objects, configure Retell, send real emails or perform real charge/call actions. All test data must be synthetic and local/disposable. No Production secrets. Feature flags remain OFF by default.
**Implementation order:** ADMIN-TY-00 through ADMIN-TY-08 below, in order. Continue automatically from one phase to the next if tests pass; record blockers, do not silently bypass a blocked safety gate. Do not require a separate instruction between phases.
**As-of source state, 11 Nov 2026:** Latest marketing merged PR #485 provides TY enquiry acknowledgement, PR #484 simplified demo enquiry, PR #478 persists requestIntent and receptionistQuestions, shared enquiry foundation PR #398. Hosted DEV DB had 119 applied migrations, head 20261111130000, 0 Telloya hosted plan_versions, 0 commercial_agreement_versions, 0 commercial_plan_conditions, 0 commercial_subscriptions. Recheck HEAD and migration state before editing; this snapshot may move. Independent voice ingestion PR #457 remains open, and 20261107130000_telloya_inbound_admission_usage_ingest_v1.sql is not applied. Do not touch, cherry-pick or merge it.

## Mission and fundamental architecture

Finish a polished, end-to-end Telloya SALES AND ADMIN workflow on the existing shared ProfileRelaunch platform. Do not build another CRM, case system, customer account database, email dispatcher, quote engine, payment ledger or messaging service. Telloya is a ProfileRelaunch product. Maintain TY-26-XXXXXX as permanent enquiry reference, with a linked onboarding/offer/subscription identity rather than inventing an unrelated QT/SO case as the customer-facing primary reference. Preserve historical case, payment and audit IDs internally. Where existing commercial models require an internal identifier, link it to the TY enquiry. ProfileRelaunch Guided, Guard and current customer portal flows must remain unchanged.

Reference and reuse, tracing actual current imports and RPCs first:
- apps/admin/app/enquiries/[id]/page.tsx, enquiries/page.tsx, enquiries/forms.tsx, enquiries/onboarding.tsx, enquiries/telloya-interest.tsx.
- apps/admin/lib/enquiries/model.ts, enquiries/queries.ts, commercial/onboarding.ts and existing commercial database functions.
- lib/enquiries/intake.ts, lib/enquiry-delivery.ts, lib/enquiry-email.ts, shared branded email templates and Resend durable queue + delivery tracking.
- Existing Customer Portal product selection, product-specific dashboards, Messages, offer read/accept, terms confirmation, verified login, payment and receipts.
- Commercial subscription, plan version, acceptance, plan conditions, agreement version, checkout preparation, Stripe webhook, settlement, setup and provisioning commands.
- The existing audited ProfileRelaunch quote/acceptance/amendment approach; reuse its UX and versioning patterns without mixing one-off Guided settlement with Telloya monthly subscriptions.
- apps/telloya/lib/pricing.ts, apps/telloya/lib/enquiry-contract.ts and current marketing /enquire?intent=personalised-demo behavior.
- docs/telloya/phase-c/commercial-readiness.md, docs/telloya/phase-c/06a-commercial-agreement-decision-pack.md, docs/telloya/phase-c/06b-usage-privacy-foundation.md.
- Current Auth, RLS, server-only RPC, concurrency/idempotency, email delivery and audit conventions. Read current code: do not implement from assumptions based on old PR descriptions.

Do not alter Telloya marketing form, approved prices or public wording unless essential to preserve its intake contract; if necessary, keep changes minimal and covered by tests.

## Canonical commercial rules — do not modify

Telloya Basic GBP49/month, 120 included minutes; Growth GBP79/month, 300 minutes; Pro GBP120/month, 500 minutes; Custom requires a bespoke approved quotation, with no fixed catalogue price. One operating voice location and one number for each standard tier. Further operating voice locations or numbers require Custom quotation. Standard setup included; complex setup separately quoted. Optional Relaunch Guard GBP9.99 per explicitly selected paid Guard location per month; Guard-only locations DO NOT imply additional receptionist locations. Overage GBP0.25 per extra minute only after separate explicit opt-in and positive monthly cap accepted in the final offer. Unused minutes expire with no rollover. Prices shown as GBP; do not imply local-currency checkout is implemented. No final international tax promise until approved. No spontaneous discounts, tax, trials, overage charges or one-off setup fees. Do not count demo calls as customer usage.

Important legal blockers: the paid Telloya Service Agreement and applicable tax treatment are NOT approved/seeded in hosted DEV; draft terms are NOT publishable. Owner/legal signoff is required before customer-facing real acceptance, hosted catalogue seeding or payment activation. Build protected source-only paths and synthetic fixture previews; do not invent an approved legal version. Marketing website terms are NOT the paid service agreement.

## Canonical lifecycle and UX

Marketing TY received -> Admin triage -> Demo not booked -> Demo booked -> Demo completed -> Prepare approved-plan offer -> Review/approve draft -> Send personalised offer email (secure authenticated review link) -> Customer requests amendment OR proceeds -> Revised offer version if required -> Customer accepts exact final offer -> Customer explicitly accepts versioned service agreement + recurring billing consent -> Stripe MONTHLY subscription checkout (test-mode implementation only, not activated) -> Verified initial invoice/payment webhook -> Paid setup handover -> Existing step-by-step Admin configuration, telephone number, forwarding guidance and QA call -> Explicit activation after all safety gates -> Customer dashboard, renewal, invoices, support, change/cancel flows. Do not mark an enquiry as converted or service as ACTIVE prematurely.

Represent the workflow as a derived progress indicator on the TY record, not by replacing existing enquiry statuses or duplicating Product subscription states. Track source enquiry and immutable history at all times. Only expose controls that are allowed in the current stage; hide/disable invalid actions with concise explanatory text.

## ADMIN-TY-00 — Inventory / contracts / preview protection

1. Read current develop, capture immutable baseline SHA, list existing implementations and function/route names; create docs/telloya/admin/ADMIN-TY-REUSE-MATRIX.md with columns: current component, reuse as-is, minimal extension, new work, tests, and risks.
2. Confirm the current enquiry TY source and requestIntent=personalised-demo; general enquiries MUST also follow the same Admin flow, with demo status initially NOT_BOOKED.
3. Confirm exact IDs, acceptance state, payment state, customer login and provisioning rules. Never infer a one-off payment equals monthly recurring.
4. Create a consolidated feature-flag strategy. New Admin read-only display can render safe data; any new workflow writes, outbound emails, Customer Portal offer review/accept, recurring Checkout and provisioning are OFF by default and must have server-side gates. No preview flag may override missing legal or tax approval.
5. Add a Preview banner or section-level status explaining 'Preview / test only, not available to customers' only where a synthetic fixture is rendered. Never expose real lead PII in a public fixture.
6. Audit full path for app variants (Admin, Customer Portal, Telloya marketing, main marketing), CI, database/preview boundaries. Produce a dependency map before coding phases.

Deliverable: reuse matrix + dependency map + no behavioural change, commit checkpoint.

## ADMIN-TY-01 — TY enquiry workspace

Reuse existing Admin /enquiries list/detail and triage. Do not build a second enquiry queue.
- Make product=Telloya/Request type visibly identifiable; display TY reference, optional plan interest, overage interest (not consent), Guard interest (not purchase), business and receptionist questions. General enquiry may have no selected plan: display 'Plan to be confirmed', not 'required plan'.
- One clear progress bar across Enquiry, Demo, Offer, Agreement, Payment, Setup, Active. Highlight next valid step, owner and follow-up deadline. Distinguish all non-final states.
- Integrate with existing matching for customer, business, location and staff assignment. Do not auto-verify email/business authority.
- Offer an elegant premium layout: concise summary, next action, expandable details, activity timeline with timestamps and source references; no repetitive fields or long caution paragraphs.
- Add product-based filtering or an explicit Telloya view only if current filters cannot already do it without schema duplication.
- Ensure one TY record is the hub; existing ProfileRelaunch enquiries stay pixel/behaviour compatible.

Deliverable: Admin TY workspace UI, tests including legacy enquiries and missing optional plan, no data writes without an approved source-only migration. Commit checkpoint.

## ADMIN-TY-02 — OFFLINE demo status tracker ONLY

Owner explicitly decided: Actual demo preparation, booking, delivery and all Retell activity happen OFFLINE/outside this platform. Do not implement Retell API calls, calendar bookings, appointment emails, demo number allocation, playback, transcript capture or automated reminders in this phase.

At most one current demo status per TY enquiry with audited history:
- NOT_BOOKED (default).
- BOOKED: operator manually records scheduled date/time + timezone, optional internal note. Label action 'Mark demo booked'.
- COMPLETED: operator manually confirms actual completion time and optional outcome note. Label action 'Mark demo completed'.
- Optional follow-up actions: reschedule manually with audit and return to NOT_BOOKED if cancelled/no-show; keep status model minimal. Do not require a Retell call ID. Do not fabricate 'completed' from elapsed appointment time.
- Only authenticated authorised Admin users can write; use optimistic version/idempotency and audit who/when/previous/new status. No customer or cross-tenant write.
- Demo completed is the default gate before preparing/sending the first offer. If operator requests an exception, do NOT silently bypass the gate: record 'requires owner decision' and leave offer sending blocked until a separately approved exception policy exists.
- Offline data is an Admin management record, not proof that a customer consumed any paid usage minutes.
- Keep 90-day marketing enquiry retention and customer-data minimisation policy in mind; associate notes with retained enquiry and avoid free-form call content.

Deliverable: source-only migration for tracker if needed; status actions and tests for replay, invalid transition, stale version, missing enquiry, staff permissions, timeline. No hosted migration apply. Commit checkpoint.

## ADMIN-TY-03 — Offer catalogue eligibility & personalised composer

Reuse existing commercial onboarding customer/business/location matching, approved plan lookup, prepare_offer DB/UX, plan versions, commercial agreement versions and Guard location selection. Extend as minimally as possible, never bypass current eligibility.
- Only after manually COMPLETED demo and verified business authority may Admin prepare a customer offer (or a safe preview fixture).
- Select one approved Basic/Growth/Pro version or individually approved Custom version. Use actual approved DB price, currency, cadence, included minutes and conditions; never use marketing form value to create a purchase or hardcode an approved price into persisted ledger.
- Independently confirm Guard paid locations; format full monthly breakdown. Overage remains OFF until explicitly selected in the final accepted offer with cap.
- Confirm business address/country, receptionist location/number entitlement and phone setup assumptions, chosen voice/language preferences (requested, not guaranteed), intended setup, desired start date, contact name.
- For Custom, create a quote request and revision process subject to Admin/owner approval; no arbitrary price or auto-approval. Show commercial blockers and keep real Send disabled while plan/agreement/tax unapproved.
- Compose clear preview of actual price, recurring interval, included minutes, overage, Guard line-items, setup inclusion, and next steps. Differentiate sales proposal from already-accepted terms.
- Versioned offer should link to TY, business, customer, canonical plan version, Guard locations, offer status, canonical terms hash, issued/expires timestamps; immutable once sent/accepted. One current actionable version; previous sent versions superseded atomically.
- Do not create duplicate subscription records when re-preparing; use existing onboarding and subscription identity.
- Use source-only schema amendments if existing model lacks offer draft/revision/expiry. Include RLS/service role, audit trail, version constraints and transaction-scoped locks.

Deliverable: Admin offer composer + versioning, synthetic fixtures, test for fixed and Custom, Guard calculation, one number/one location, duplicate submits. Commit checkpoint.

## ADMIN-TY-04 — Offer approval, customer-facing review, amendments, branded outbound email

Reuse the existing durable email dispatch (queue -> automatic processing -> provider accepted -> delivered/failed/blocked), branded email templates, login/invitation, Customer Portal message workflows, and existing accepted-offer read controls. Never email a bare public payment link before customer acceptance.
- After Admin explicitly approves an eligible offer, action 'Send offer' queues one idempotent personalised email per exact version; separate provider-accepted from delivered. Keep a manual resend/retry path with audit; no duplicate payments/acceptances.
- Email variants by actual approved product: Basic/Growth/Pro; Custom bespoke offer; Telloya + Guard combination; ideally use shared generic template with plan/price/allowance/Guard line-items as data, not separate brittle HTML implementations.
- Example subjects: 'Your Telloya Growth proposal — TY-26-XXXXXX'; 'Your Telloya + Relaunch Guard proposal — TY-26-XXXXXX'; 'Your personalised Telloya proposal — TY-26-XXXXXX'.
- Professional succinct branded email: TY ref once prominently, business, precise monthly price and core entitlement, overview, single CTA 'Review your offer and subscribe', optional expiry and contact route. Avoid 'guaranteed every call' and misleading activation claims. HTML + plain text, send through existing Resend infrastructure; no direct send from button if queueing is standard.
- CTA opens authenticated verified Customer Portal offer page. New customers use existing secure invitation and product selection; returning customer lands on Telloya offer. Never rely on an unverified email as authorisation, and never expose commercial terms via guessing TY IDs.
- Customer may 'Request changes' with bounded message, optional change categories; create an audited amendment request, notify Admin in existing message/notification hub, and mark pending; do not mutate sent offer.
- Admin may accept/reject request with reason, create a new complete version, preview and resend; supersede old acceptance/action links. Customer can proceed only on current offer version. No customer self-modification of prices.
- Admin sees Sent, Viewed (only if privacy-safe and reliably measurable), Amendment requested, Superseded, Accepted with timestamps and version history. Do not imply email was delivered from provider acceptance.
- Avoid new customer-facing product dashboards beyond the minimum offer/revision screens needed for this journey; reuse current components.

Deliverable: branded templates, email outbox integration, Customer Portal secure offer screen and amendment loop, idempotent notifications, tests for double-send, race of amend vs accept, stale links, RLS. Commit checkpoint.

## ADMIN-TY-05 — Versioned agreement, recurring consent, Stripe MONTHLY checkout

Do not treat one-time Guided checkout as recurring subscription billing. Reuse existing Stripe abstractions, price/acceptance snapshot, payment evidence, webhook signature verification, invoices and receipt design; extend only the recurring boundary.
- The approved paid Telloya Service Agreement must be in APPROVED state with authoritative immutable hash and appropriate tax configuration before any real acceptance/checkout can be enabled. Draft marketing terms or test fixture agreement must not pass gates. Owner/legal approval is EXTERNAL and cannot be granted by Cursor. In code-only fixtures, clearly label TEST ONLY.
- Customer sees final exact version: plan, GBP recurring total, included allowance, Guard locations, optional separately accepted overage + cap, standard setup, service constraints, cancellation/renewal position and current service agreement. Required authority, agreement hash, recurring consent and overage cap fields are independently validated and durably audited.
- On acceptance, atomically freeze offer/terms/price; no email CTA triggers a charge, no acceptance without verified identity; old versions cannot be accepted.
- Prepare Stripe Checkout in subscription mode ONLY from an accepted, eligible offer with verified business/payment eligibility. Use idempotency keys, verified signed Checkout session, recurrence interval month, amount/currency check and one subscription identity per business. No live Stripe keys, Stripe API calls, price/customer/product creation or hosted Checkout test sessions while Cursor runs; implement behind OFF flags and mocked test adapters.
- On success redirect, show 'Payment being verified' until webhook confirms payment and active recurring subscription; never mark paid based on return URL alone.
- Verify webhook origin and dedupe event; separate initial invoice paid, recurring invoice paid, payment failed, subscription past due/cancel at period end/cancelled. Reconcile customer ID, Stripe subscription ID, line items, accepted amount, period and currency; audit disputes/errors, no double charge. No fabricated overage meter or overage invoice.
- Provide Admin and Customer payment history and clear monthly renewal date/status with existing shared UI. Don't duplicate ProfileRelaunch's payment ledger. Cancellation/update must use approved business rules and prevent accidental second subscription. No live activation on payment alone.
- Test mode and Preview only, with DB and Stripe synthetic mocks. If tested end-to-end against Stripe test mode would need hosted configs or objects, document and stop for owner approval. No Preview env changes.

Deliverable: recurring billing source-only implementation, signed webhook parser and idempotent state machine, Customer Portal acceptance/checkout UI, tests including retries, payment failure, subscription cancellation, currency mismatch and duplicate Checkout. Commit checkpoint.

## ADMIN-TY-06 — Paid handover, existing Admin setup & explicit activation

On the verified first paid invoice, reuse existing commercial paid handover into setup:
- Begin setup only after verified, immutable settlement.
- Confirm customer preferences, AI configuration and required operator attestation.
- Allocate/record provider number and responsible business/location identity.
- Record and share forwarding instructions. Do NOT actually turn on forwarding or assume sharing turns it on.
- Record test-call outcome and confirm customer connection explicitly.
- Display a coherent operator checklist and Next valid action, reuse existing setup commands (no duplicate Retell integration, no demo Retell integration).
- Relaunch Guard add-on entitlement must be tracked separately; Guard paid locations do not increase voice number/location limits, and Guard monitoring is not silently activated.
- Go Live remains BLOCKED until all separate voice safety gates verified: provider fail-closed inbound default, admission metadata echoed, provider in-progress stop, admission/usage DB integration, approved call privacy/storage, real test call and customer authorisation. Do not fake service_provision LIVE or bypass DB constraint.
- Maintain customer-facing status 'Preparing your receptionist', 'Testing', 'Ready for activation' and 'Active' only after real authorised transition.

Deliverable: cohesive Admin setup UI and Customer Portal status integration, independent tests, source-only changes, no real calls. Commit checkpoint.

## ADMIN-TY-07 — Active subscription operations & support

Design and code guarded lifecycle UIs using shared Customer Portal account, payments, messages and support:
- Customer views plan, allowance, agreed Guard locations, paid/unpaid invoice, next renewal, current service status and support history. Never display simulated call usage as real.
- Customer can request a plan/Guard amendment. Changes must generate an eligible new version with consent/proration policy decision rather than silently altering the Stripe subscription.
- Customer can request cancellation at the approved period end; record request, guard pending-payment condition and webhook status; no unapproved pro-rata refund guarantee.
- Admin handles payment failure, retries, suspension, cancellation, reactivation and support cases within existing account; do not leave voice answering for an inactive subscription.
- All real usage reports and automated cap enforcement remain flagged OFF until independently tested. Stub read-only explanations rather than fake usage.
- Keep existing ProfileRelaunch products visible under same login, but separate entitlements.
- Preserve minimum necessary customer data and RLS.

Deliverable: safe guarded source-only operational screens + tests. Commit checkpoint.

## ADMIN-TY-08 — Comprehensive preview regression, handover and PR

1. Use fully synthetic, local/disposable PostgreSQL or PGlite data to test full journey: TY enquiry -> manually booked demo -> manually completed demo -> approved fixture Growth + 2 Guard locations GBP98.98 -> initial offer email queued -> customer amendment -> superseded version -> accepted revised offer and test-only agreement -> Stripe subscription mocked Checkout -> verified synthetic invoice event -> paid handover -> Admin setup checklist -> readiness blocked for real live provider -> customer plan/payment/messages view. Run additional Basic GBP49, Pro GBP120, Custom quote and no-plan-interest flows.
2. Negative tests: duplicate TY/enquiry, staff permission, customer business mismatch, missing email verification, stale version, invalid state transition, duplicate email, send before legal approval, accept superseded quote, unapproved overage, invalid Guard count, extra voice location, price mismatch, spoofed webhook, duplicate invoice, unpaid setup, retry, cancellation, international tax unsupported, mixed products on same login and historical ProfileRelaunch customer flows.
3. Run root/marketing/Admin/Customer/DB/Stripe-adapter tests, lint, typecheck, builds and smoke checks. Keep failing unrelated changes noted, do not force through. Capture Vercel Preview deployment statuses for Admin and Customer as well as Telloya marketing if touched. No Production deployment.
4. Open/maintain ONE draft PR to develop with full phase checklist, exact phase commits and SHAs, files, fixtures, test results, source-only migration filenames, service-role/permission review, runtime OFF flags, pending approvals and launch blockers. DO NOT merge the PR, apply migrations, enable flags, send real emails, create Stripe objects, schedule calls or activate service.
5. Deliver handover in docs/telloya/admin/ADMIN-TY-PREVIEW-HANDOVER.md: what actually works with local fixtures, what can render in Vercel Preview with current hosted DEV schema, what needs new DEV migrations/approved legal+tax rules, which steps are blocked, links to draft PR and Preview deployments, exact manual acceptance checklist. Do not claim full live E2E works merely because mocks pass.

## Critical test and architecture principles

- Track data by real shared IDs, TY reference is human-facing not the auth key.
- Server-side permission checks, validated forms, versioned optimistic concurrency, read/write RLS, audited actions, immutable accepted/paid evidence; no client-computed amount trusted.
- Flag-gated state changes OFF by default. The Preview deployment can show non-transactional UI without performing actions. No external provider activity with the user asleep.
- Use local/disposable DB for schema tests; hosted DEV/Prod writes require separate explicit owner approval and assistant-run infrastructure changes. Do not do Supabase CLI push/seed/reset, or Vercel env edits.
- Product-specific email templates come from data; one shared durable queue and dedupe key per customer/version/message type. User privacy and unsubscribe/transactional classification must follow existing policy.
- Do not break ProfileRelaunch Guided, Guard, messaging, Admin client identity, customer product selection, invoices or cases.
- Where legal/tax or provider facts are unknown, fail closed, annotate the blocker and keep developing unrelated UI, tests and documentation. Do not assume a business decision.
- Document exactly what you verified vs what still requires real provider/hosted tests.

## Autonomous Cursor execution requirements

Start from the plan branch, create ONE implementation branch and ONE draft PR. Execute phases 00 -> 08 in order, commit after every phase, run the smallest relevant tests per phase and full CI-equivalent suite at the end. Do not wait for a separate 'done' response from the owner between phases. If a phase depends on external approval, build source and fixture tests behind a default-OFF gate, mark it BLOCKED FOR REAL USE, and proceed to independent next phases; never defeat the gate to make demo look green. If schema conflicts occur, prefer the existing authorised shared model and document the smallest source-only migration; do not write to hosted databases. Never modify independent open voice-ingestion PR #457. Final report must be a concise phase-by-phase table of DONE / PARTIAL / BLOCKED with links, migrations, previews and approvals required.

This document is a coding brief, not proof Cursor has started or a guarantee it can complete all phases in one session.