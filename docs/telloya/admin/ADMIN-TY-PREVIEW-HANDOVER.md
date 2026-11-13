# ADMIN-TY preview handover

**Status:** ADMIN-TY-R8 applied on DEV (123 migrations, applied head `20261112223000`). `pendingMigrations()` returns `20261113120000_telloya_offer_mail_test_allowlist_v1.sql` (source-only; `appliedToDev: false`). Applied head remains `20261112223000_telloya_approve_send_offer_v1.sql`; repository migration head is `20261113120000_telloya_offer_mail_test_allowlist_v1.sql`. Applied file `20261112223000_telloya_approve_send_offer_v1.sql` (45,006 characters; `appliedToDev: true`; `containsDataChange: true`; `safeToReplay: false`). Verified post-apply: receipts table RLS enabled; approve/send RPCs service-role-only; `TELLOYA_OFFER` remains DRAFT at `record_version` 2; 0 approved templates; 0 mail-control enabled; 0 commercial subscriptions; 0 Telloya offer communications. Customer-facing send stays closed and R8-D gated. Tip SHA `c4eef5478f21dfe9ad298febfaf816bd150dfda9`. Branch-scoped Preview keeps `TELLOYA_ADMIN_JOURNEY_ENABLED=true` for this PR only. This is not authorisation to launch, collect payment, send email, place a call, seed catalogue/agreements, merge the PR, or apply further hosted migrations.
**Baseline:** `origin/develop` `c3ba97a19492eb2b7ae27ec906f77e740ef12cae`. Plan branch `plans/telloya-admin-e2e-preview-20261112` at `a9d925204e39a9e590e5fe964a0314f0679f83cf`.

## Phase labels (R8)

| Item | Label | Notes |
| --- | --- | --- |
| Interactive draft calculator | DONE in source (R7-C-SIMPLE) | Plan dropdown + auto amounts; Custom editable GBP; Guard + live total; unsaved changes block Approve & Send |
| Draft save / reload | READY on DEV (draft storage applied) | Typed `enquiries.source`, Custom amount/minutes/requirements audited; Save works on Preview/DEV with applied RPC; never sends email |
| Server-side prepare-from-draft | DONE on DEV (R8-B) | Applied `telloya_prepare_offer_from_draft_v1` locks draft + matches approved plan/Custom amount/minutes/Guard IDs |
| Approve & Send Offer | DONE in source (R8-A/B) | One Admin action: prepare-from-draft then queue via existing `telloya_offer_mail_v1`; recoverable OFFERED / NOT_QUEUED |
| Personalised offer email | DONE in source (R8-C) | Telloya — a ProfileRelaunch company greeting, itemised totals, Review your offer portal CTA; still DRAFT template + empty mail control |
| Read-only email preview | DONE in source (R8-C) | `telloya_offer_preview_v1`; preview does not queue |
| Admin delivery status | DONE in source (R8-C) | Queued / Provider accepted / Delivered / Failed / Blocked / Awaiting approval from real communication fields |
| Progress stages | DONE in source (R8-A) | Enquiry → Demo → Quote → Offer Sent → Customer Response → Agreement → Payment → Setup → Active |
| Demo Completed → sales-context bootstrap | READY on DEV (composite applied) | `20261112180000` applied once to DEV; fail-closed when RPC unavailable |
| Shared commercial agreement / portal accept / durable mail / payment evidence | REUSED | No second terms or payment architecture |
| Monthly Stripe Checkout | BLOCKED | `startTelloyaCheckout` returns `not_created`; not operational |
| Hosted catalogue / Telloya service agreement / tax / mail enablement | BLOCKED (R8-D) | Official send stays not sendable until owner-approved catalogue, agreement, tax, template, and mail control. Decision pack: `ADMIN-TY-R8-D-00-commercial-enablement-decision-pack.md`. Bounded plan: `ADMIN-TY-R8-D-01-enablement-plan.md`. |
| `20261112120000` | DONE applied once to DEV | Byte-identical; do not replay or apply to Production |
| `20261112180000` | DONE applied once to DEV | Byte-identical 18,615 chars; do not replay or apply to Production |
| `20261112210000` | DONE applied once to DEV | Draft storage; 17,672 chars; do not replay or apply to Production |
| `20261112223000` | DONE applied once to DEV | R8 approve/send + draft preview + published price match + composer contract V1; 45,006 chars; do not replay or apply to Production |
| `20261113120000` | SOURCE-ONLY (not applied) | R2-FINAL fail-closed allowlist + `telloya_offer_mail_provider_ready_v1` last-mile (membership-for-that-business, mail_control, OFFERED, no pending amendment); `appliedToDev: false`; do not apply without owner approval |

## What is implemented

These functions write or read the shared ProfileRelaunch records. They stay closed unless `TELLOYA_ADMIN_JOURNEY_ENABLED` is exactly `true` and `20261112120000` has been applied. Neither is true on Preview by default.

- Offline demonstration booking and completion. The actor is the verified staff session. The command rejects a ProfileRelaunch enquiry, a stale version, a bad time zone, and a missing session. Demonstration rows cascade when an eligible Telloya enquiry is deleted. Destructive deletion stays off in the migration.
- After Demo Completed, Preview-only sales-context bootstrap opens or resumes a TELLOYA `onboarding_requests` row, matches or creates a provisional customer, and links a business only with matching enquiry evidence or Admin confirmation. A sole unrelated business or location is not selected automatically. Location confirmation and prepare-offer stay in the main offer workspace.
- Interactive Personalised Offer calculator: Admin chooses Basic / Growth / Pro / Custom and optional Relaunch Guard, sees a live itemised GBP draft total from `apps/telloya/lib/pricing.ts`, and can save or update a draft without approved catalogue, terms or tax. Draft persistence uses applied `20261112210000` (`admin_private.telloya_offer_drafts`). When storage is not installed the calculator still works for the session. An official offer still uses existing `prepare_offer` once catalogue, agreement, authority and location gates pass. Draft editing locks after an official offer exists.
- Applied composite `public.telloya_sales_context_command_v1` (`20261112180000`) provides single-transaction bootstrap with rollback on unsafe ambiguity, including expired recent Admin sign-in. When the composite RPC fails ambiguously, Admin fails closed: the offer draft stays visible and read-only, and no separate `admin_commercial_command_v1` onboarding writes run.
- Customer amendment requests stored against `public.commercial_subscriptions`. The Customer Portal proxy classifies `POST /api/portal/onboarding/offer/amendment` as a portal-session mutation. A pending request blocks acceptance of that offer. A revised offer is created only when the approved plan or the confirmed Guard locations change, and the monthly total is recalculated from those records. An identical selection returns `unchanged`. A receptionist or greeting request can be noted without a second subscription. Decline leaves the offer unchanged. Amendments and mail require a Telloya enquiry, a TELLOYA onboarding request, and the matching customer.
- Offer email through `public.communications` and the existing `SEND_EMAIL` outbox. The queued subject and body use the TY enquiry reference, the approved plan, the exact GBP monthly price, the included minutes, Guard add-on cost, and one Customer Portal review link. The VC subscription selector stays only in the authenticated link path. A first send also requires an APPROVED Telloya service agreement for the stored terms reference, `tax_behaviour = NOT_APPLICABLE`, verified business authority, and no REQUESTED amendment. An already queued message still returns the same row. The queue row stays `delivery_status = NONE` with a `QUEUED` delivery event. Queued is not provider-accepted and not delivered. The subscription is locked before the communication lookup, and a unique conflict returns the same row. The TELLOYA_OFFER template is inserted as DRAFT and must be approved through `admin_settings_command_v1`. The database mail control is empty, so the function queues nothing until that row is explicitly enabled.
- Admin progress on the enquiry page reads the recorded demonstration, offer, agreement, payment and provision states. Marking a demonstration completed moves the next step off Demo. Preparing or queueing a Telloya offer before that demonstration returns `demonstration_not_completed` from the authenticated command.
- Recurring-invoice classification after a provider verifier accepts the payload. The amount, currency and Stripe subscription id are compared with the stored commercial subscription. This does not create a Checkout session and does not mark the payment ledger paid. Applying a matched invoice remains the existing commercial settlement path.

## What is mocked or display-only

- The draft calculator total is a marketing-price estimate. It is not an approved commercial subscription amount. Official totals still come from approved `plan_versions` at `prepare_offer` time.
- The catalogue illustration, including the £98.98 Growth plus two Guard locations figure. That figure is not written to a subscription until Admin prepares a commercial offer.
- The in-memory offer, amendment and checkout helpers under `apps/admin/lib/commercial/telloya-offer.ts`, `telloya-offer-delivery.ts` and `telloya-checkout.ts`. They cover rules in unit tests. They are not the operating ledger.
- `startTelloyaCheckout` returns `not_created`. Monthly Stripe Checkout, recurring subscription creation, renewal/failure/cancel handling are not operational on this branch. A return from a payment page stays “Payment being verified”.
- The setup checklist and the operations view. They describe the existing step names and do not place a call, buy a number, or show usage.

## What is blocked

- Replaying `20261112120000` or `20261112180000`, or applying either to Production.
- Sending email. The journey flag is off, the mail control row is not inserted, and the new template is not approved in hosted databases.
- Stripe products, prices, customers, Checkout sessions, and live mode.
- Retell, number purchase, forwarding, and a real test call.
- Going live. Voice stays off after any payment classification.
- Owner and legal approval of the paid Telloya Service Agreement.
- Tax treatment for a recurring GBP subscription. International tax is unsupported.
- Hosted Telloya plan versions and commercial agreement versions. A real `prepare_offer` stays `terms_unconfigured` until those exist. This branch does not seed them.
- Production, Vercel environment variables, and PR #457 / `20261107130000`.

## Phase record

| Phase | Result after R2 | Commit | What it means now |
| --- | --- | --- | --- |
| ADMIN-TY-00 | DONE | `c79d1a33` | Reuse matrix. No behaviour change. |
| ADMIN-TY-01 | DONE | `60ea404f`, R2c `47192179` | Progress reads recorded demo, offer, agreement, payment and setup states. |
| ADMIN-TY-02 | IMPLEMENTED, gated | `ef46f7cf`, R1b `6972df15` | Staff demonstration command. Unapplied migration. Flag off. |
| ADMIN-TY-03 | PARTIAL | `717da3fd` | Catalogue illustration only. The operating offer is the commercial subscription. |
| ADMIN-TY-04 | IMPLEMENTED, gated | `ffd2d1ef`, R1c `03d67f0b`, R2a `a930d731`, R2b `a0f632dd` | Real revised offers, noted non-commercial requests, TY-referenced queued email, approval-gated template. Flag off. Mail control empty. |
| ADMIN-TY-05 | PARTIAL | `ead1c8c8`, R1d `09a757bd` | Verified-invoice classifier. No Checkout object and no ledger write. |
| ADMIN-TY-06 | BLOCKED | `912c4856` | Setup checklist. Going live stays blocked. |
| ADMIN-TY-07 | BLOCKED | `7bcd1a04` | Usage and voice stay unavailable. |
| ADMIN-TY-08 | DONE as documentation | `cf9880a2` | This handover. It is not an end-to-end launch test. |
| R1a | DONE | `4765097d` | Manifest records 119 applied DEV migrations, head `20261111130000`. |
| R2a | DONE | `a930d731` | Plan and Guard location revisions with recalculated totals. Unchanged clone refused. |
| R2b | DONE | `a0f632dd` | Persisted TY-referenced offer email. Template stays DRAFT until settings approval. |
| R2c | DONE | `47192179` | Progress from recorded states. Demo required before prepare_offer and mail. Scoped amendments and idempotent queue. |
| R2d | DONE | `84adb199` | Full disposable database and package verification. Honest statuses above. |
| R3-A | DONE | `ed4e3874` | Offer email refuses retired agreement, unsupported tax, revoked authority and a REQUESTED amendment. Replay stays idempotent. |
| R3-B | DONE | `ed4e3874` | Manifest marks `20261112120000` `containsDataChange: true` for the DRAFT template catalogue INSERT. |
| Post-migration reconcile | DONE | `cb692ad1` | Manifest records 120 applied DEV migrations, head `20261112120000`. |
| ADMIN-TY-R4 | PARTIAL | `15af6d75`, `08250127` | Offer-first workspace after Demo Completed. Sole-business/location auto-link and non-atomic reconcile required R5 correction. |
| ADMIN-TY-R5 | DONE for Preview path; PARTIAL for hosted composite | `5ef9eb43` | Evidence-safe matching, composite source-only `20261112180000`, offer workspace Prepare/confirm, disposable PG coverage. Hosted apply of `20261112180000` remains blocked pending owner approval. Monthly Stripe Checkout remains BLOCKED. |
| ADMIN-TY-R6 | DONE for source corrections | `f9819cb0` | Removed mutating exception fallback; composite reauth rolls back bootstrap writes; disposable PG covers expired sign-in, retry, concurrency and idempotency. Hosted apply of `20261112180000` still blocked. |
| Post-R6 migration reconcile | DONE | `06fe08b9` | Manifest records 121 applied DEV migrations, head `20261112180000`. |
| ADMIN-TY-R7 | DONE in source | `b4aaccd4` | Interactive draft calculator, draft persistence source-only `20261112210000`, prepare_offer unchanged, UI simplified. |
| ADMIN-TY-R7-B | DONE in source | `692db05c` | Typed source + active request, independent Guard locations, proposed-overage wording/GBP cap, prepare matches saved draft, draft audit events, Save disabled when storage unavailable. Do not apply the draft migration. |
| ADMIN-TY-R7-C-SIMPLE | DONE in source | `bddf0d26` | Plan dropdown, Custom editable amount, unsaved-draft prepare gate, Custom approval required before official offer. |
| Post-R7 migration reconcile | DONE | `0afda76da686ea6aa0054959ad99c6e09db51c86` | Manifest records 122 applied DEV migrations, head `20261112210000`; `pendingMigrations()` empty. |
| ADMIN-TY-R8-A/B/C | DONE in source | `82cef2f1350bcb9ed530e60e4fc385f25df8585e` | Approve & Send, prepare-from-draft, personalised email, preview, delivery status, progress stages. R8-D enablement remains blocked. |
| ADMIN-TY-R8-R1 | DONE in source | `06f0e48ee48d2419b38086cd574c931b87a84797` | Draft-estimate preview without catalogue/`CUSTOMER_ORIGIN`; advisory-lock receipt race fix; composer V1 contract; sandboxed HTML preview UI. |
| ADMIN-TY-R8-R2 | DONE in source | `da93bfa9b77594ea5d5a797ce947d98ac1ed8787` | Exact Basic/Growth/Pro quotation match; plain text without composer id; approved template body bound to `TELLOYA_OFFER_COMPOSER_CONTRACT_V1`. |
| Post-R8 migration reconcile | DONE | `8f789041f58f3aa81198287dfaabe2fe85ce8749` | Manifest records 123 applied DEV migrations, head `20261112223000`; `pendingMigrations()` empty. Send remains blocked; R8-D gated. |
| ADMIN-TY-R8-D-00 | DONE as documentation | `8bdcfc4630903e0723e8c8d8a5ca2f9e6ac88d3e` | Commercial reuse audit and owner decision pack only. Pricing/policy already approved are not re-asked. Open: agreement, privacy supplement, tax, hosted catalogue, template, sender/recipient, mail-control, controlled DEV send, Stripe Checkout deps (R9). |
| ADMIN-TY-R8-D-01 | PLANNED (not authorised) | — | Bounded enablement plan after owner signs R8-D-00 open rows. No seed, send, Stripe, or Production in this docs slice. |
| ADMIN-TY-R8-D-01A | DONE in source | `516a58dbf3e55c29068ebe292773d1201a530324` | Legal candidates + unresolved confirmations; source-only mail test allowlist migration; DRAFT catalogue runbook. No hosted apply, send, template approve, or Stripe. |
| ADMIN-TY-R8-D-01A-R1 | DONE in source | `e70f5a133f679c221712e195d4016c2b46a7b05b` | Owner-grant provision only; required customer_id + verified email; Admin authorize denied; TELLOYA_OFFER dispatch recheck; shutdown/revoke. Allowlist remains source-only. |
| ADMIN-TY-R8-D-01A-R2 | DONE in source | `c4eef5478f21dfe9ad298febfaf816bd150dfda9` | Grants bind `bound_customer_id` + `bound_email_hash`; automatic develop dispatcher leases TELLOYA_OFFER once; last-mile `communication_begin_provider_attempt_v1` recheck; Guided/Guard unchanged. Allowlist remains source-only. |
| ADMIN-TY-R8-D-01A-R2-FINAL | DONE in source | — (uncommitted in this agent turn) | Adds `telloya_offer_mail_provider_ready_v1`; candidates/claim/begin_provider require NULL ready reason; rechecks membership for that business, mail_control, OFFERED, no pending amendment, allowlist, composer contract. Allowlist remains source-only. |

## Test matrix

| Behaviour | Where it is tested |
| --- | --- |
| Applied head is `20261112223000`; repository head `20261113120000`; `pendingMigrations()` is the allowlist file | `apps/admin/lib/recovery/manifest.test.ts`, `history.test.ts`, `readiness.test.ts` |
| Draft calculator pence totals, Custom £150 + Guard, invalid Custom amounts, unsaved equality | `apps/admin/lib/commercial/telloya-offer-draft.test.ts` |
| Draft command parse rejects bad payloads | `apps/admin/lib/commercial/telloya-offer-draft-command.test.ts` |
| Draft save/reload/stale version/lock after prepare_offer/cascade | `apps/admin/lib/commercial/telloya-offer-draft.database.test.ts` |
| Approve-from-draft, Custom £150 + 2 Guard queue once, preview, stale/unresolved/custom mismatch | `apps/admin/lib/commercial/telloya-approve-send.database.test.ts` |
| Automatic TELLOYA_OFFER develop dispatch claim/revoke/origin + case-less denial + R2-FINAL provider_ready gates | `apps/admin/lib/commercial/telloya-offer-mail-dispatch.database.test.ts` |
| Evidence-safe sales-context bootstrap, sole-business/location confirmation, revoked ownership, concurrency, prepare_offer, expired recent sign-in rollback/retry | `apps/admin/lib/commercial/telloya-sales-context.database.test.ts` |
| Offer workspace calculator, Save draft, checklist, Approve & Send, Preview email | `apps/admin/app/enquiries/telloya-offer-workspace.test.tsx`, `telloya-sales-context.test.ts` |
| Fail-closed composite errors never trigger legacy commercial writes | `apps/admin/lib/commercial/telloya-sales-context-command.test.ts` |
| Staff session, non-Telloya rejection, spoofed session, stale version, time zone, retention cascade | `supabase/tests/database/telloya-admin-journey.database.test.ts` |
| Flag-off demonstration command does not call the database | `apps/admin/lib/commercial/telloya-demo-command.test.ts` |
| Growth + 2 Guard (£98.98) to Growth + 1 Guard (£88.99), unchanged selection, greeting note, Basic to Growth, demo gate, TY-referenced mail for Basic/Growth/Pro/Custom/Guard, wrong customer, phone-source ineligible, retired agreement, unsupported tax, revoked authority, pending amendment | `apps/admin/lib/commercial/telloya-commercial-readiness.database.test.ts` |
| Simultaneous mail queue returns one communication | `apps/admin/lib/commercial/guard-addon.concurrency.database.test.ts` |
| Completed demonstration advances the Admin next step | `apps/admin/app/enquiries/telloya-journey.test.tsx`, `telloya-admin-journey.test.ts` |
| Customer amendment route stays closed and rejects a non-offer selector | `apps/customer/lib/portal/onboarding/telloya-amendment-command.test.ts` |
| The amendment route is in the portal inventory and the proxy refuses an unclassified portal API | `apps/customer/lib/portal/route-inventory.test.ts` |
| Spoofed provider signature and stored-amount mismatch | `apps/admin/lib/commercial/telloya-checkout.test.ts` |

Disposable database tests use PGlite. Concurrent mail and commercial settlement checks use a disposable local PostgreSQL cluster. Neither connects to hosted DEV or Production.

## Applied DEV migration

`supabase/migrations/20261112120000_telloya_admin_journey_v1.sql`

`appliedToDev` is true. `containsDataChange` is true because the migration inserts one DRAFT `TELLOYA_OFFER` communication template catalogue row outside a function body. That catalogue row is not a customer, payment, subscription, invitation, communication or session record, and the template stays DRAFT until settings approval. `safeToReplay` is false. Public functions are executable by `service_role` only. Private tables have row level security and no policies. The repository file is 79,175 characters. The mail-control table has 0 rows. Zero demonstration rows, zero commercial subscriptions, zero amendments and zero Telloya offer emails were created. Do not edit or replay `20261112120000`. Do not apply `20261112120000` to Production.

The verified DEV ledger previously contained 120 entries and ended at `20261112120000`. The verified DEV ledger previously contained 121 entries and ended at `20261112180000`. The verified DEV ledger previously contained 122 entries and ended at `20261112210000`. The verified DEV ledger now contains 123 entries and ends at `20261112223000`. `20261111130000_telloya_marketing_enquiry_retention_v1.sql` remains applied once to DEV. The hosted `schema_migrations` statement for that retention file is 10,710 characters and the repository file is 10,712 characters. The two-byte difference is the dollar sign and closing quote at the end of the reason check, around character 1075. The installed `telloya_marketing_enquiry_holds_reason_check` is correct. Do not edit or replay the applied retention SQL. Do not apply `20261111130000` to Production.

## Applied DEV migration (sales-context composite)

`supabase/migrations/20261112180000_telloya_sales_context_v1.sql`

`appliedToDev` is true. `containsDataChange` is false. `safeToReplay` is false. The repository file is 18,615 characters. MD5 `914c95e0534e4d26cd07cbab1ae8aa18`. SHA-256 `7fbd26ade4d1250ae4a8ea934e3e9bf7a0dc8171b971f62af1cfc118756acfcb`. It adds `public.telloya_sales_context_command_v1` for single-transaction, evidence-safe bootstrap after a completed demonstration. The public composite is executable by `service_role` only. Zero commercial subscriptions, zero Telloya offer emails and zero enabled mail-control rows were created by the apply. Do not edit or replay `20261112180000`. Do not apply `20261112180000` to Production. Do not edit or replay `20261112120000`.

## Applied DEV migration (offer draft)

`supabase/migrations/20261112210000_telloya_offer_draft_v1.sql`

`appliedToDev` is true. `containsDataChange` is false. `safeToReplay` is false. The repository file is 17,672 characters. MD5 `199dbfa368261693ed869a134a5fc664`. SHA-256 `e152df8d7204214965aec5c5fe64a2f37b8a63135005479bfcb219f737415f55`. It adds `admin_private.telloya_offer_drafts` (including `custom_amount_minor`, `custom_included_minutes`, `custom_requirements`), append-only `admin_private.telloya_offer_draft_events`, plus service-role-only `public.telloya_offer_draft_v1` and `public.telloya_offer_draft_command_v1`. Reads/writes require typed `enquiries.source='telloya'` and the current active TELLOYA onboarding request. Custom amount is an internal proposed price only and is never written to `plan_versions` by draft save. This is Admin draft-selection storage and revision audit only. It is not a commercial offer, subscription, approved plan, customer quote, email, Stripe object, or Retell action. Post-apply DEV had zero draft rows, zero draft audit events, zero commercial subscriptions, zero Telloya offer emails and zero enabled mail-control rows. Do not edit or replay `20261112210000`. Do not apply `20261112210000` to Production. Do not edit or replay `20261112120000` or `20261112180000`.

## Applied DEV migration (approve and send)

`supabase/migrations/20261112223000_telloya_approve_send_offer_v1.sql`

`appliedToDev` is true. `containsDataChange` is true. `safeToReplay` is false. The repository file is 45,006 characters. MD5 `d8bdfefcb0bef55f8dcc8b62979e20bf`. SHA-256 `f5ba88fb55086cdbc409e53aa4d305864b729ebcf8a0905637c4f62c3fa8e6ea`. It adds approve/send orchestration including `public.telloya_prepare_offer_from_draft_v1`, `public.telloya_offer_preview_v1`, personalised `telloya_offer_mail_v1`, Admin delivery fields, and `admin_private.telloya_approve_send_receipts` with RLS. Verified post-apply: receipts RLS enabled; service-role-only RPCs; `TELLOYA_OFFER` still DRAFT at `record_version` 2; 0 approved templates; 0 mail-control enabled; 0 commercial subscriptions; 0 Telloya offer communications. Customer-facing send stays blocked and R8-D gated. Do not edit or replay `20261112223000`. Do not apply `20261112223000` to Production. Do not edit or replay `20261112210000`, `20261112180000`, or `20261112120000`. `pendingMigrations()` returns `20261113120000_telloya_offer_mail_test_allowlist_v1.sql` (not applied to DEV). Repository migration head is `20261113120000`.

## Flags

`TELLOYA_ADMIN_JOURNEY_ENABLED` is exactly `true` on the branch-scoped Admin Preview for `cursor/telloya-admin-e2e-preview-20261112` only. It remains absent/OFF outside that Preview. Exactly `true` opens the demonstration, amendment, revision, sales-context and draft commands. It does not approve a service agreement, a tax treatment, a payment, or live answering. Mail still requires the empty `telloya_offer_mail_control` row to be enabled and an APPROVED TELLOYA_OFFER template.

`TELLOYA_ENQUIRY_ENABLED`, `TELLOYA_USAGE_EVENTS_ENABLED`, and `TELLOYA_INBOUND_ADMISSION_ENABLED` were not enabled.

## Remaining approval

- Owner and legal approval of the paid Telloya Service Agreement.
- Tax treatment for a recurring GBP subscription. International tax stays unsupported.
- Approved hosted Telloya plan versions and agreement versions before a customer can be offered a real subscription.
- Stripe test-mode configuration before any Checkout session. This branch did not create a Stripe product, price, customer, or session.
- Retell, number purchase, forwarding, and a real test call remain outside this work.
- Production was not changed.

PR #457 and `20261107130000` were not edited.
