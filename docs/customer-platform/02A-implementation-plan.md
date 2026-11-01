# 02A — Implementation plan

Status: **sequence only**, revised against review comments `6559957225`, `6560133090`, and `6560349430`. This PR stops at the documents. Phase 02B does not start until the decisions in `02A-decisions.md` are accepted.

Base for that future work: latest `develop` after this documentation PR. DEV ledger at planning time: `20261031160000`, 91 entries. Re-read `apps/admin/lib/recovery/manifest.ts` and `history.test.ts` immediately before writing a migration. Do not apply anything to Production.

## Principles

- One migration per phase, additive, registered in the manifest, `appliedToDev: false` until a human applies it on DEV.
- No migration rewrites a previous file.
- Do not edit `apps/customer/lib/portal/products/present.ts`, the hub routes, or the Phase 1 flag in the schema phases. A later portal PR may call the new RPC and pass the result into the existing presenter.
- Do not edit `apps/telloya` marketing files.
- Reuse `admin_guard_command_v1` inside 02J only to request `guard_schedule_cancellation_v1` for one location. 02H does not call it. Do not call immediate cancellation, and do not treat `guard_approve_credit_v1` or `guard_approve_refund_v1` as funding. Do not call `guard_set_billing_entitlement_v1`. Do not call `guard_activate_v1` to invent a Complete coverage. Reuse `customer_portal_session_v1` for identity. Reuse `communications` and `SEND_EMAIL` for mail. Reuse `stripe_event_receipts` for webhooks. Reuse `stripe_customer_maps` for the Stripe customer. Reuse `provider_operations` idempotency for the cancellation request.
- Tests are SQL or RPC tests in the admin recovery style, plus customer tests that the Phase 1 hub is unchanged.

## Phases

### 02B — Empty commercial schema

Migration only. Tables, checks, indexes, RLS, revokes, and append-only event tables from `02A-data-model.md`. Includes `bundle_guard_allocations` with `guard_coverage_id` check-forced null, per-location entitlements, per-location provisions, snapshot columns, and `commercial_payment_evidence` with no foreign key to `payment_receipts`. No RPCs that change state except the internal event writer if tests need it. No seeds. No Stripe. No portal change. No `BUNDLE_COMPLETE` origin.

Depends on: accepted decisions D1–D4 and D7–D15. D5 and D6 are accepted as "no price and no manual-paid grant", not as numbers.

Tests:

- A second occupying subscription for one business is rejected. A second business for the same customer is accepted. An incoming row without `succeeds_subscription_id` is rejected while an occupying row exists.
- `location_id` null is rejected on entitlements, allocations, and provisions. Two `PENDING` or `ELIGIBLE` rows for the same business, location, and component are rejected. A location whose `business_id` does not match the parent is rejected by the composite foreign key.
- A Guard entitlement or allocation insert does not add a `guard_coverages` row, and a non-null `guard_coverage_id` is rejected.
- Open allocations above `quantity_limit_snapshot` are rejected, including two concurrent commands.
- A billable row with null `amount_minor`, null `tax_behaviour`, or a changed snapshot is rejected. A pilot row with a non-null amount, or with a `commercial_payment_evidence` row, is rejected.
- Onboarding uniqueness is `enquiry_id`, and `(business_id, plan_family)` after match. Two unmatched requests with the same email are accepted. Two open requests for the same business and `VOICE` are rejected.
- `provider_binding_ref` and `provider_test_call_ref` cannot be shared. A `LIVE` row with either null, or with `provider_test_outcome` other than `PASSED`, is rejected. Allocation state `PREVIEW` is valid beside an open Guard subscription. `RECONCILING` is not a state.
- A raw invitation token column does not exist.
- `anon` and `authenticated` cannot select the new tables.

Rollback: drop the new objects if no foreign key from old tables points at them. None should. The new unique index on `locations (id, business_id)` is dropped with them only if 02B added it and no new table still references it.

### 02C — Admin onboarding commands

`admin_commercial_command_v1` with session actor, `p_request`, receipts, and audit. Operations: create request from an enquiry, match customer, match or create business and location through the existing record commands, leave membership `pending` when the email is unverified, decline, offer an approved billable plan, queue one invitation.

The match command must not call `admin_contact_verify_v1`. It must not insert `customer_contact_verifications`. It must not create a portal session. It must not send mail until the template is approved. The command may insert a `QUEUED` communication only when the template exists; otherwise it stops at `OFFERED` and records "mail not configured".

Depends on: 02B, an approved invitation template (can be a later small PR if copy is not ready).

Tests: an existing verified customer is reused and can take a second business; an unknown email does not become a session; approval does not write a verification row; a duplicate open enquiry returns the existing request; a duplicate `event_key` does not queue a second send; a revoked membership cannot be offered; `admin_membership_save_v1` still refuses `verified` without a contact proof; enquiry conversion XOR is unchanged.

Rollback: stop calling the RPC. Leave rows. Do not drop tables that hold requests.

### 02C-auth — Invited mailbox proof

Ship this before any invitation email is sent. It is not part of 02B, and it does not change `begin_login`.

Add `proof_kind` to `customer_contact_verifications`, default `ADMIN_RECORDED` for existing rows, and allow `verified_by` null only for `MAILBOX_OTP`. Add `customer_portal_begin_invited_login_v1`, the invited confirm, resend, and attempt functions, and `customer_portal_finish_invited_otp_v1`, as specified in `02A-data-model.md`. They share `customer_portal_login_challenges`, `customer_portal_reserve_send_v1`, and `customer_portal_sessions`. They do not call `begin_login`, `confirm_otp_sent`, `begin_resend`, `attempt_otp`, or `finish_otp`.

Depends on: 02C, and the column change above.

Tests: `begin_login` still returns `ineligible` for an unverified customer; a bad invitation hash and an expired hash return the same `unavailable` and no challenge; an already verified email is refused by the invited begin; invited finish inserts `MAILBOX_OTP` before the session and then `customer_portal_session_v1` succeeds; calling `finish_otp` on that challenge still fails before the verification insert; the sixth OTP attempt is refused; the shared send reservation still rate-limits; approval still does not write a verification row.

Rollback: stop the invited functions. Do not delete verification rows that already record a real OTP.

### 02D — Portal read

`customer_portal_products_v1(p_token_hash)`. Returns per-location rows and an aggregate that is Active only when every entitled location is live. Wire it behind a new server flag that defaults off, in a PR that only reads. The Phase 1 presenter stays the renderer. When the flag is off, the hub behaviour shipped in PR #384 is byte-for-byte the same.

Depends on: 02B. 02C is not required for a read of empty tables.

Tests: another customer's business is absent; two businesses for one session both appear when both memberships are verified; idle session is unauthenticated; a thrown Guard read returns unknown rather than unpurchased; Telloya with one location `LIVE` and another `READY_FOR_PROVIDER_VERIFICATION` is not Active; a `PREVIEW` allocation is shown as the existing Guard service, not as bundle monitoring; a `PAST_DUE` row whose `current_period_end` is in the future is not shown as expired; no `customer_id` parameter exists. Customer route inventory still lists the hub routes and does not add `/portal/telloya`.

Rollback: flag off.

### 02E — Provisioning commands

Admin commands set the setup timestamps on one location and record customer confirmation from the portal session for that location. The furthest state is `READY_FOR_PROVIDER_VERIFICATION`. `LIVE`, `provider_binding_ref`, `provider_test_call_ref`, and `provider_test_outcome` are rejected from this phase. No Retell, Twilio, or phone-number provider calls.

Depends on: 02B, 02D for the customer confirmation path.

Tests: six timestamps plus customer confirmation do not set `LIVE`; a null binding or a missing test-call id does not set `LIVE`; an admin-supplied `agent_test_passed_at` is rejected; location A can be `LIVE` only from the later provider command, and location B stays `READY_FOR_PROVIDER_VERIFICATION`; a shared binding or call id is rejected; a renewal failure inside paid-through does not suspend A; a suspension command with a reason does; a member of another business is rejected.

Rollback: stop the commands. Do not delete provision rows.

### 02F — Non-billable pilot only

An admin command may grant `NON_BILLABLE_PILOT` with `admin_session_v1`, a reason, and `pilot_ends_at`. `amount_minor` stays null. The portal label is pilot. The command must refuse to insert `commercial_payment_evidence` and must refuse to move a `BILLABLE` subscription to `ACTIVE`.

There is no manual-paid operation. A checkout redirect is not a pilot and not a payment. This phase is not a stand-in for Stripe.

Depends on: 02B, 02C.

Tests: an expired pilot becomes `EXPIRED` and its allocations `LAPSED`; a pilot cannot be labelled paid; a billable row stays out of `ACTIVE` with no evidence; a second occupying subscription for the business fails; a second business for the same customer can hold its own pilot.

Rollback: stop the command. Do not delete financial history.

### 02G — Stripe evidence, only after prices exist

Out of scope until a plan version has verified `amount_minor`, currency, tax behaviour, and terms, and a human has created the Stripe product outside this repository's planning. That phase reuses `stripe_customer_maps`, `provider_operations.idempotency_key`, and `stripe_event_receipts`.

`ACTIVE` for a billable subscription is inserted only with `commercial_payment_evidence` whose `provider_event_id` is an already processed paid invoice and whose amount and currency match the snapshot. `checkout.session.completed` and Stripe subscription `active` are not evidence. The writer is not `guard_apply_invoice_paid_v1` and it does not insert `guard_subscription_invoices`. It does not reference `payment_receipts`.

A non-Stripe rail stays pending. 02G does not add one unless a separate decision names the rail and its receipt table.

Depends on: 02F and a price decision (D5).

This plan does not schedule 02G.

### 02H — Guard reservation preview

Create one `bundle_guard_allocations` row per Complete Guard location. A location with an open Guard subscription is `PREVIEW` and stores `standalone_guard_subscription_id`. A location with none is `RESERVED`. This phase is read and insert against the new table only. It does not call Guard cancel, Guard credit, `guard_activate_v1`, or `guard_apply_invoice_paid_v1`. It does not update `guard_subscriptions`, `guard_coverages`, or `guard_billing`. It does not set `PROVIDER_PENDING` or `FUNDED`. Leave `guard_coverage_id` null.

Depends on: 02B. Does not require Telloya to be live, 02I, or a Complete charge. Does not make Guard activatable.

Tests: Dock and Yard both become `PREVIEW` without any change to lifecycle, coverage state, or `paid_through_at`; cancel and credit invocation counts stay zero; a Complete charge overlapping either paid-through is refused; quantity above the snapshot is rejected; the portal does not call either location bundle Guard; `guard_set_billing_entitlement_v1` is still not executable by `service_role`.

Rollback: delete or ignore the preview rows only while no later phase has funded them. Guard ledger is already unchanged.

### 02I — Gated Guard schema, not part of accepting 02A

A later PR, after 02H and its own review, may add the bundle origin, `entitlement_source = BUNDLE`, and `admin_private.guard_apply_bundle_paid_through_v1` described in `02A-data-model.md`. It is idempotent on `(allocation_id, period_end)` and it refuses to move `paid_through_at` backwards. It is not `guard_set_billing_entitlement_v1`.

02I does not end a standalone subscription and does not call the writer for a location that still has one open. Scheduling and cutover are 02J.

Tests required before any customer is told they can activate a new Complete-funded location: renewal extends `paid_through_at` once; the same `period_end` does not extend it again; a failed renewal leaves `paid_through_at` unchanged while it is in the future; lapse at that timestamp sets the allocation `LAPSED` and `guard_activate_v1` refuses a new activation; `service_role` still cannot execute `guard_set_billing_entitlement_v1`. Applying 02I to a database with Dock and Yard in `PREVIEW` changes none of their Guard rows.

This plan does not schedule 02I. Until it is applied, no document and no portal copy may say a Complete customer can activate Guard.

### 02J — Per-location cutover saga, only after 02I

Not one command that ends Stripe and funds the bundle together. The steps are reserve, request `guard_schedule_cancellation_v1`, wait for `guard_confirm_cancellation_v1`, then a database-only call to `guard_apply_bundle_paid_through_v1`. Each step has its own idempotency key. The provider step reuses `provider_operations`. The funding step is idempotent on `(allocation_id, period_end)`.

Preconditions for the request: 02I is present, the Complete period is evidenced and still open, and this allocation is `PREVIEW` for the same open standalone subscription. The request sets `PROVIDER_PENDING`. It does not set the subscription to `CANCELED` and it does not end coverage. Funding is rejected until that same operation is `SUCCEEDED` with cancel-at-period-end confirmed, and the effective date is the existing `paid_through_at`.

`PENDING_APPLICATION` credits, unconfirmed refunds, and `CANCEL_SUBSCRIPTION_IMMEDIATE` do not unlock funding. Early credit migration stays disabled until a later review. A location left `PREVIEW` gets no provider operation.

Tests: 02J before 02I inserts nothing; a queued cancellation leaves coverage and paid-through unchanged and does not fund; Dock can reach `PROVIDER_CONFIRMED` and then `FUNDED` while Yard stays `PREVIEW`; a funding failure after provider success opens an admin issue, keeps coverage, and does not call immediate cancellation; the same funding key can be retried; an out-of-order cancel flag does not fund; a still-pending operation at the Guard reconciliation sweep does not fund; a failed renewal after `FUNDED` does not shorten paid-through.

This plan does not schedule 02J. Until the funding step commits for a location, that location's standalone Guard service remains the service the customer has.

## Suggested PR order

| PR | Ships | Does not ship |
| --- | --- | --- |
| 02A (this PR) | These documents | SQL, UI, flags |
| 02B | Empty tables on a branch, unapplied until DEV approval | RPCs used by apps, Guard origin changes |
| 02C | Admin match, offer, invite, without verifying email | Portal session, Stripe |
| 02C-auth | Invited OTP into the existing session table | A second login, an admin-marked verified email |
| 02D | Session-scoped per-location read, flag off | `/portal` cutover, Telloya route |
| 02E | Per-location setup through `READY_FOR_PROVIDER_VERIFICATION` | `LIVE`, provider bindings, shared phone mappings |
| 02F | Non-billable pilot recording | Manual paid, Stripe prices |
| 02H | Preview reservations beside existing Guard | Cancel, credit, coverage changes, activation |
| 02I | Gated Guard origin and bundle paid-through writer | Ending a standalone subscription |
| 02J | Saga: queue period-end cancellation, wait for provider confirmation, then fund in the database | Early credit, immediate cancellation, funding from a queued operation |
| Later | Stripe evidence, provider verification that can set `LIVE`, a named non-Stripe rail if approved, `/portal` becoming My Products | Anything not accepted in a fresh design note |

02D can follow 02B before 02C if the read of empty data is useful. 02C-auth is required before an invitation email is sent. 02H can proceed in parallel with 02E once 02B exists. 02G, 02I, and 02J wait. 02J waits on 02I.

## Test layers to keep

- Manifest and history tests for every new filename.
- Constraint tests for occupying versus incoming subscriptions, two businesses, non-null locations, composite location ownership, source shape, snapshot immutability, and "payment evidence is not Active".
- RPC tests that a forged customer id is impossible because the parameter does not exist.
- Journey tests for the examples in `02A-customer-journey.md`: two businesses, mixed Telloya locations with and without provider evidence, Complete preview of two Guard locations with only one ready to schedule, renewal failure inside paid-through, expiry at paid-through, and first-time versus already verified login.
- Customer tests that `/portal` still renders `PortalHome` when the hub flag is off, and that Telloya still has no href.
- Security tests that `anon` and `authenticated` cannot select the new tables, and that approval does not write `MAILBOX_OTP`.
- No live DEV data inserted for UI fixtures.

## Dependencies that are not code

- Approved Telloya and Complete terms, prices, tax behaviour, pilot length, and per-location caps (D5). All of these stay pending. No number in these documents is a default.
- Invitation email copy and from-address, using the existing mail gate.
- Confirmation that a second business member must not see Recovery cases or Guard invoices (D3, recommended: they must not).
- A named admin who may record a non-billable pilot (D6). That grant is not a paid entitlement.
- A separate review before 02I changes Guard constraints.

## Rollback of the whole programme

Turn every new flag off. `/portal`, Guard, Recovery payments, and portal OTP keep working because their tables and functions were not replaced. Dropping tables is allowed only while they are empty and only on DEV. After the first real subscription, rollback is flags plus a forward migration that revokes entitlements, not a drop.
