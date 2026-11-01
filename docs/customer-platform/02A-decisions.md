# 02A — Decisions

Status: **needed before 02B**, revised against review comments `6559957225`, `6560133090`, and `6560349430`. Each item has a recommended default so implementation can start without another open-ended design. A different choice should be written down here before the migration.

The recommendations follow the schema that is already on `develop` at `bb03642c`. They do not approve a price, a pilot length, or a location cap. They do not say a Complete customer can activate Guard.

## D1. Where Guard billing lives

**Recommended:** `guard_subscriptions`, `guard_subscription_invoices`, and `guard_billing` remain the only Guard money and paid-through records through 02H and through the 02I schema change. 02H does not write them. The commercial subscription stores no Guard Stripe subscription id and no single reconciled Guard subscription id. A planned Complete period on an allocation is not copied into `guard_billing`.

A later gated PR (02I) may add `entitlement_source = BUNDLE` and `guard_apply_bundle_paid_through_v1`. That writer is the only proposed way for a bundle period to become Guard paid-through. It refuses to move `paid_through_at` backwards. It is not `guard_set_billing_entitlement_v1`. The 02J funding step is the only phase that may call it for a location that still has a standalone subscription, and only after `guard_confirm_cancellation_v1` has accepted period-end cancellation. The funding call does not include the Stripe request. Until 02I is applied, Complete does not activate Guard. Until funding commits, the standalone subscription remains the Guard service.

**If rejected:** a second Guard ledger, a forged included-recovery coverage, or a forged Guard invoice will diverge from `invoice.paid` and from `guard_activate_v1`. Do not reject this without a replacement that still respects `guard_coverages_basis_origin` and the 30-day included-period check.

## D2. What the commercial subscription is allowed to sell

**Recommended:** `TELLOYA` and `COMPLETE` only, both in `plan_family = VOICE`. Recovery stays on cases and `payment_obligations`. Standalone Guard stays on Guard.

**If rejected:** extending `price_versions.service_code` is the alternative for a one-off, not for a bundle. A bundle still needs component rows.

## D3. What a second member of a business can see

**Recommended:** Telloya setup and live/paused status for each location of that business. Not Recovery cases belonging to another customer. Not Guard or Telloya invoice amounts, Stripe ids, or call content. Guard operational status for a location stays on `customer_portal_guard_v1` until a PR explicitly changes it. An allocation without a coverage is shown as waiting, not as monitoring on.

**If rejected:** widening case visibility changes `customer_portal_dashboard_v1` and needs its own threat review. Do not hide that inside the commercial migration.

## D4. How an existing customer is recognised, and how a new mailbox is proved

**Recommended:** `lower(email)` on `customers`, then `verified_current_email_v1`. An already verified email uses `customer_portal_begin_login_v1` only. A new mailbox uses the invited functions. Begin writes a row in the existing challenge table before the OTP. Finish writes `MAILBOX_OTP` and a normal `customer_portal_sessions` row only after `verifyOtp`. Those functions do not call `begin_login` or `finish_otp`, both of which reject an unverified email today. Admin approval creates neither an Auth session, nor a portal session, nor a contact verification. `admin_contact_verify_v1` is not mailbox proof.

**If rejected:** calling `admin_contact_verify_v1` during approval would mark an unproved mailbox verified. A secret that inserts a session by itself would be a second authentication authority. Do not add either.

## D5. Prices, pilot length, and location caps

**Recommended:** no numeric default. `plan_versions.amount_minor`, tax behaviour, and terms stay unset and a billable offer is refused until a named approver sets them. Pilot length is not a catalogue cadence and is not chosen here. It is `pilot_ends_at` on a later grant, and the allowed duration stays pending. Telloya and Guard `quantity_limit` values stay unset until approved. This document does not choose £ amounts, a pilot length, or a location count.

**If rejected:** seeding `lib/pricing.ts` into Telloya would publish an unverified price. Do not do that.

## D6. Who may grant a non-billable pilot

**Recommended:** only an admin command with `admin_session_v1`, a reason, and `pilot_ends_at`. `amount_minor` is null. The grant is labelled pilot, never paid, and it cannot insert `commercial_payment_evidence`. There is no manual-paid state and no silent pilot. A checkout redirect cannot grant it. Billable `ACTIVE` waits for 02G payment evidence.

**If rejected:** a self-serve pilot needs a separate abuse review. Recording "paid" from an admin sentence would grant a billable entitlement with no evidence. Neither is part of 02B–02F.

## D7. Enquiry conversion

**Recommended:** Telloya and Complete requests store `enquiries.id` and do not call `admin_enquiry_convert_v1`. The case-or-monitoring XOR stays as it is. Open-request uniqueness is the enquiry id, and `(business_id, plan_family)` after the business is matched. The same email may enquire for two businesses.

**If rejected:** adding a third conversion target means a new migration of `enquiries` checks and the admin convert form. A unique `(email, product)` key would block the second business. Leave both out of 02B.

## D8. Invitation secret and first login

**Recommended:** store only a hash, expire it in 7 days, one unconsumed row per request. Unknown and expired hashes return the same generic unavailable result. The hash alone never creates a session.

If the email is not verified, `begin_invited_login` writes a normal login challenge and the existing rate limit, then the person completes the existing Supabase OTP. `finish_invited_otp` writes `MAILBOX_OTP` with `verified_by` null before it inserts the session. That needs a later migration: `proof_kind` does not exist today, and `verified_by` is `NOT NULL`. If the email is already verified, the invited functions return `unavailable` and ordinary `begin_login` consumes the invitation when the session email matches. No `next` parameter. Membership stays `pending` until mailbox proof exists.

**If rejected:** a secret that logs the person in, or an admin evidence string stored as a verified email, fails the review. Do not ship either.

## D9. When the UI may say Active

**Recommended:** for one Telloya location, only when that location is `LIVE` after a provider command has stored a unique binding and a passed test call. Admin timestamps stop at `READY_FOR_PROVIDER_VERIFICATION`, which is not Active. For the product aggregate, only when every entitled location is `LIVE`. For Guard, only when an existing coverage is `ACTIVE` under the current readiness function. A `PREVIEW` allocation does not change that. Mixed locations are partial setup. Commercial `ACTIVE`, and `PAST_DUE` inside an evidenced period, are displayed as paid through a date, with the setup step for each location that is not live.

**If rejected:** showing Active from typed timestamps, at `invoice.paid`, or for the whole product because one location is live, would tell the customer a service exists that has not been verified.

## D10. Complete double charge and several locations

**Recommended:** one occupying commercial subscription per business, plus at most one incoming replacement with `succeeds_subscription_id`. Two businesses are two subscriptions. One open `bundle_guard_allocations` row per location, capped by `quantity_limit_snapshot`. One open `guard_subscriptions` row and one non-ended coverage per location, already true. 02H records a `PREVIEW` and leaves that Guard subscription open. A Complete charge that overlaps its `paid_through_at` is refused until period-end cancellation is provider-confirmed. 02J requests that cancellation for one ready location and funds only after confirmation. A location that is not ready is not included. Do not insert a second open Guard subscription, a Guard invoice, or a second coverage.

**If rejected:** cancelling Guard in 02H leaves the customer without monitoring until 02I exists, and one shared cutover column cannot represent Dock and Yard. Do not reject this for a launch shortcut.

## D11. First migration contents

**Recommended:** 02B is tables, constraints, RLS, and revokes only. `guard_coverage_id` on an allocation is forced null. No backfill, no update of existing customers, cases, sessions, payments, or Guard rows, no portal change, DEV only, not Production. Adding `UNIQUE (id, business_id)` on `locations` is allowed so the composite foreign key can enforce location ownership. The `proof_kind` change on `customer_contact_verifications` is 02C-auth, not 02B.

**If rejected:** putting RPCs, Guard origin changes, and UI in the same migration makes rollback a data migration. Keep them separate. 02I is a different PR.

## D12. Phase 1 hub

**Recommended:** do not modify PR #384's components in 02B–02H. `customer_portal_products_v1` is written to feed `presentProducts` later, with per-location rows and an aggregate that is not Active unless every entitled location is live. `/portal` is not retargeted at My Products in this programme.

**If rejected:** a hub rewrite before the read exists will show fixture states to real customers. The Phase 1 code already forbids that.

## D13. When a Guard upgrade may end the old subscription

**Recommended:** 02H is a reservation preview. It does not cancel, credit, or reduce coverage. 02I adds the funding machinery and also does not end the standalone subscription. 02J is a per-location saga, after both a verified Complete period and 02I exist. It requests `CANCEL_SUBSCRIPTION_PERIOD_END`, stays `PROVIDER_PENDING` until `guard_confirm_cancellation_v1`, and only then runs the database funding switch at that location's `paid_through_at`. A queued operation, a `PENDING_APPLICATION` credit, and an unconfirmed refund do not unlock funding. Immediate cancellation and early credit stay disabled. If provider confirmation succeeds and funding fails, coverage and paid-through stay, an admin issue is opened, and the funding step can be retried. One ready location does not drag an unready location with it.

**If rejected:** promising that a credit and a bundle apply commit together ignores the existing provider operations. A queued cancel is not a Stripe result, and immediate cancellation ends coverage before funding can hold it. Do not do that.

## D14. What may set Telloya LIVE

**Recommended:** only a provider command that stores a unique binding ref, a unique test-call id, and `PASSED`. 02E stops at `READY_FOR_PROVIDER_VERIFICATION`. Timestamps entered by an admin are not evidence. A manual DEV exception is not approved in this document.

**If rejected:** `LIVE` from timestamps would show Active when no reachable number or agent has been verified. Do not do that.

## D15. Renewal failure and paid-through

**Recommended:** follow the existing Guard rule. A failed renewal sets `PAST_DUE` and leaves access in place until the evidenced `current_period_end` or `guard_billing.paid_through_at`. Expiry is that timestamp with no newer evidence. The failure must not shorten either timestamp. The first charge, which has no evidence, entitles nothing. Suspension and fraud may stop access earlier, and they require an actor and a reason. A billing webhook must not use that path.

**If rejected:** treating `PAST_DUE` as immediate expiry takes away a period the customer has already paid for. Do not do that.

## Acceptance

02B is unblocked when D1–D4 and D7–D15 are accepted as recommended, and D5–D6 are accepted as "no price, no pilot length, no location cap, and no manual-paid grant". D5 does not need a number before the empty schema. It needs a number before any billable offer succeeds and before 02G.

Accepting these decisions does not unblock Guard activation or a Guard cutover. 02I and 02J need their own reviews. Until 02I is applied, Complete must not be described as able to activate Guard. Until 02J commits for a location, that location's standalone Guard subscription stays in force.
