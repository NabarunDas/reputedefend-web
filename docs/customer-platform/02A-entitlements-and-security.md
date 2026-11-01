# 02A — Entitlements and security

Status: **proposed rules**, revised against review comments `6559957225` and `6560133090`. Production is unchanged. No privilege grant is made by this PR.

## Four different facts

| Fact | Question | Authority |
| --- | --- | --- |
| Authentication | Did this browser complete OTP for the current verified email? | `customer_portal_session_v1` after ordinary login, or after invited OTP has written `MAILBOX_OTP` and a normal session |
| Membership | May this customer act for this business now? | `business_memberships.status = verified`, which `admin_membership_save_v1` refuses until a real contact verification exists |
| Commercial entitlement | Is a paid-through period or a non-billable pilot still open for this location? | `product_entitlements` for that `location_id`, through `eligible_to`. A `PAST_DUE` renewal does not clear a future `eligible_to`. Recovery money stays on the obligation. Standalone Guard paid-through stays on `guard_billing`. |
| Operational readiness | Is the service actually usable at this location? | That location's Telloya `service_provisions.state = LIVE`, or an existing Guard `guard_coverages.state = ACTIVE` after the current readiness checks |

A checkout redirect, an admin approval, a membership, a `PREVIEW` allocation, six admin timestamps, and a Stripe subscription status of `active` do not satisfy the next row by themselves.

## Portal projection

Proposed RPC: `public.customer_portal_products_v1(p_token_hash text)`.

It follows `customer_portal_dashboard_v1` and `customer_portal_guard_v1`:

- The only identity input is the portal token hash.
- The function loads `customer_portal_session_v1` rules, including idle and absolute expiry. A missing, revoked, idle, or expired session returns the same unauthenticated result the other portal reads use. It does not return product rows.
- It does not accept `customer_id`, `business_id`, entitlement flags, or a product list from the client.
- It does not accept an action-session token or an invitation hash.

### Returned shape

The read returns one row per entitled location, then one aggregate per product for that business. Complete is not a fourth card. Its Telloya rows and its Guard allocation rows surface on the Telloya and Guard cards.

| Field | Rule |
| --- | --- |
| Product | `TELLOYA`, `GUARD`, or Recovery as the existing case summary. |
| Scope | Business display name and location name. `location_id` is required for Telloya and for a Complete Guard seat. Only businesses with a verified membership for this session customer. |
| Commercial state | Per location: `none`, `pending`, `past_due`, `paid`, `pilot`, `expired`, `canceled`, or `unknown`. |
| Operational state | Per location: `not_started`, `setup`, `live`, `paused`, `ended`, `guard_waiting`, or `unknown`. `guard_waiting` is an allocation that is not yet a coverage. |
| User-facing status | A phrase from those two states. The word Active is returned for a location only when that location is operationally live. The business aggregate uses Active only when every entitled location of that product is live. |
| Permitted action | An existing route (`/portal/recovery`, `/portal/guard`) or none. No action when the state is unknown, revoked, waiting on Guard schema, or not provisioned. This RPC must not invent `/portal/telloya`. |
| Attention | From real rows only: Recovery attention count, Guard actions that already exist, or the earliest missing Telloya step at that location. |
| Next action | One sentence, or null. |
| Read failure | Per product `unknown` with no purchase inference. |

### Who can see what

- Session customer A sees a business only when A has a verified membership.
- A does not see business B's subscriptions, invoices, calls, or provisions.
- Invoice amounts and Stripe ids are omitted from this RPC. Billing detail stays on the existing payment and Guard pages for the customer who already owns those records.
- A second member sees Telloya setup status for a shared business, per location. They do not see another member's Recovery cases. Case visibility stays `cases.customer_id` until a separate decision changes `customer_portal_dashboard_v1`.
- A second member does not see Guard invoice amounts. Guard operational status for a location is included only when a coverage already exists and the membership check passes. An allocation without a coverage is `guard_waiting`, not monitoring on. Changing `customer_portal_guard_v1` is a later PR. This design does not silently widen it.

### Empty, partial, and expired

| Situation | Result |
| --- | --- |
| Valid session, no cases, no Guard coverage, no entitlement | Three honest cards: Recovery empty, Guard with no locations, Telloya not set up. No Active badge. |
| One product read throws | That product is `unknown` / unavailable. The others still return. The page must not treat unknown as unpurchased. |
| Entitlement `REVOKED` or membership revoked | The product is hidden or shown as ended, with no operational action. |
| Pilot `eligible_to` in the past, or paid `current_period_end` reached with no newer evidence | `expired`. Provisions cannot stay `LIVE`. Funded allocations are `LAPSED`. |
| Renewal failed and `current_period_end` is still in the future | Paid through that date. Not expired. Not suspended. Existing Guard `paid_through_at` unchanged. |
| Subscription in force, one location `LIVE`, another `READY_FOR_PROVIDER_VERIFICATION` | The verified location can say live. The aggregate says partial setup. Timestamps alone are not the live location. |
| Complete allocation `PREVIEW` | Guard card keeps the existing standalone status. It does not say the bundle replaced it or that the customer can activate Guard. |
| Session idle | Unauthenticated. No product payload. |

The Phase 1 presenter already returns `unavailable` without a link when a read fails. The new RPC must be able to feed that branch.

## Telloya Active

All of the following are required at that location before the projection returns Active for the location. The business aggregate also requires every entitled location to pass them.

1. Commercial approval: plan version `APPROVED`, subscription not `DRAFT`.
2. Eligibility: `now()` is before `eligible_to`. For a billable term that is the evidenced `period_end`, including when the subscription is `PAST_DUE` after a failed renewal. For a pilot it is `pilot_ends_at`. Checkout completion is neither.
3. Entitlement `ELIGIBLE` for this business and this `location_id`, and the session customer has a verified membership.
4. This location's profile recorded (`profile_ready_at`).
5. This location's agent request recorded (`agent_configured_at`). This is not provider proof.
6. This location's number request recorded (`number_allocated_at`). This is not proof a provider issued it.
7. This location's forwarding recorded (`forwarding_instructed_at`).
8. This location's customer confirmation (`customer_confirmed_at`) from the portal session.
9. Unique `provider_binding_ref`, written by the provider command. Two locations must not share it. The browser cannot submit it.
10. Unique `provider_test_call_ref` and `provider_test_outcome = PASSED`, written by that same command. `agent_test_passed_at` is set only then.
11. This location's provision state `LIVE` and `live_at` set by that provider command.

Steps 4 to 8 without 9 to 11 stop at `READY_FOR_PROVIDER_VERIFICATION`. That state is not Active. A renewal failure does not move `LIVE` to `SUSPENDED` while `eligible_to` is in the future. Suspension still can, and it records a reason. Missing provider evidence is not deleted when a later verification succeeds.

No operational function (calls, leads, settings, usage) exists in this phase. When those RPCs are added, each one repeats the checks for the location it is about to touch. The portal projection is not a capability token.

Tests for this rule use two locations of one business. Location A has a unique binding and a passed test call, so it is `LIVE`. Location B has the six admin timestamps and customer confirmation, so it is `READY_FOR_PROVIDER_VERIFICATION` and the command that sets `LIVE` is rejected. The aggregate is not Active. A's binding ref and call id are rejected if copied onto B. A renewal failure while A's paid-through is in the future leaves A `LIVE`.

## Guard Active

Do not add a path around the current functions.

`guard_coverage_readiness_v1` and `guard_activate_v1` remain the only way to reach coverage `ACTIVE`. They already require mapping, `guard_location_authorized_v1`, permission, verified manager access, contact, baseline, rota, the commercial basis, and `guard_billing` `CURRENT` with `paid_through_at` for direct paid Guard, or `NOT_REQUIRED` / included for an included period.

A `product_entitlements` row of component `GUARD` is not an input to those functions. Neither is `bundle_guard_allocations`. `admin_private.guard_set_billing_entitlement_v1` stays unavailable to `service_role`. Complete does not call it, and Complete does not call `guard_apply_invoice_paid_v1` to forge a Guard invoice.

`guard_coverages_basis_origin` admits only `DIRECT_GUARD`, `INCLUDED_RECOVERY`, and `INCLUDED_CONTINUATION`. None of those fit a Complete-funded location. `guard_coverages_included_period` would also force an included window to 30 days. Until the gated Guard PR adds `BUNDLE_COMPLETE`, a new non-included basis, `entitlement_source = BUNDLE`, and `guard_apply_bundle_paid_through_v1`, the portal must not say a Complete customer can activate Guard. 02H must not cancel an existing coverage to wait for that PR. 02J keeps an already `ACTIVE` coverage `ACTIVE` across the funding change. A failed Complete renewal does not clear `guard_billing.paid_through_at` while it is still in the future, which is the same split `docs/admin/guard-subscriptions-billing.md` already requires for provider renewals.

Portal Guard copy can say monitoring is recorded only when the existing projection says `monitoringActive`, which is what Phase 1 already does.

## Complete

Complete is a plan with two location-scoped components. The customer portal shows Telloya and Guard, not a Complete workspace.

- Telloya and Guard quantity limits on the pinned plan version are location caps. They are pending numbers (D5), snapshotted onto the items, and enforced with a row lock plus a deferred constraint trigger.
- Billing is one occupying commercial subscription per business. Each Guard location has its own `bundle_guard_allocations` row. `standalone_guard_subscription_id` records an open Guard subscription without ending it. There is no single `reconciled_guard_subscription_id`.
- 02H may set `RESERVED` or `PREVIEW` only. It does not cancel, credit, or shorten standalone Guard. Existing coverage and `guard_billing.paid_through_at` stay authoritative. A second open Guard subscription or a second non-ended coverage is still forbidden.
- 02J, and only 02J, performs the cutover, and only after 02I. The default is the standalone paid-through boundary. An earlier move credits the remainder in the same transaction as the bundle apply. One location can be `FUNDED` while another stays `PREVIEW`.
- Complete payment evidence is refused when it overlaps a `PREVIEW` location's Guard paid-through. If the charge cannot exclude that location, the charge is refused and the standalone subscription keeps running.
- `paid_through_at` on the allocation is not written to `guard_billing` in 02B through 02H. After 02J it is applied by `guard_apply_bundle_paid_through_v1`, which must not move paid-through backwards.
- `guard_coverage_id` stays null until 02J stores the preserved coverage. There is no `LINKED` state in 02B.
- Downgrade refuses a new cap while more locations are open than that cap. Ending one location leaves the others. The commercial handoff uses `succeeds_subscription_id` and sets `eligible_to` and `eligible_from` to the same timestamp.
- Cancellation of a `PREVIEW` seat removes the reservation and leaves the standalone Guard subscription running. Cancellation after `FUNDED` revokes the Telloya entitlements at the chosen time and ends the bundle funding. It does not delete coverages, invoices, or events. It does not use 02H.
- Partial suspension can suspend one Telloya location while another stays `LIVE`. Guard pause, when a coverage exists, stays on Guard's own command.
- Historical plan version, amount, currency, tax, cadence, terms, and item caps stay pinned by the snapshot trigger.

No price and no included-location count are approved merely by appearing in this document.

## First-time mailbox proof

`customer_portal_begin_login_v1` rejects an email that is not already in `customer_contact_verifications`. `admin_contact_verify_v1` must not be used to satisfy that check for a customer who has never proved the mailbox.

The invited functions are the only addition, and they do not call the existing login functions. `begin_login`, confirm, resend, attempt, and `finish_otp` all require `customer_portal_email_current_v1`. That check reads `verified_current_email_v1` and rejects a new customer. `customer_portal_session_v1` does the same on every later request.

- `customer_portal_begin_invited_login_v1` requires an unconsumed, unexpired invitation whose email still matches `customers.email`. It writes a `customer_portal_login_challenges` row and uses `customer_portal_reserve_send_v1`. Unknown, expired, consumed, and already-verified invitations return one generic `unavailable` result.
- Invited confirm, resend, and attempt keep the five-attempt cap. They accept only a challenge created for an open invitation.
- `customer_portal_finish_invited_otp_v1` runs only after `verifyOtp` and `customer_portal_auth_identity_current_v1`. It inserts `MAILBOX_OTP` with `verified_by` null and evidence equal to the challenge hash, then consumes the invitation and inserts a normal portal session. The verification insert comes first, because `customer_portal_session_v1` returns null without it.
- A later migration has to add `proof_kind` and allow that null. Today `verified_by` is `NOT NULL` and `proof_kind` does not exist. `admin_contact_verify_v1` continues to write an admin user id and is not this proof.
- An already verified email uses `begin_login` only.
- The invitation hash never inserts a session by itself.
- Membership stays `pending` until after mailbox proof. Then `admin_membership_save_v1` can verify it. Membership evidence is not a substitute for the OTP.

This is not a second login authority. The challenge row, session row, rate limit, idle timeout, and absolute lifetime are the existing portal objects.

## Admin trace

Every privileged change uses the existing command shape:

- `admin_session_v1` supplies `actor_id`.
- Client supplies `p_request` UUID.
- Receipt fingerprint is the operation plus the canonical payload.
- Same request returns the stored response.
- `write_record_audit_v1` records actor, action, outcome, target, reason, and request id.
- Domain event row stores previous state, new state, and reason. Allocation events also store the superseded Guard subscription id when relevant.
- Two admins racing the same transition: the state check is in the update (`WHERE state = expected`). One wins. The other gets a conflict response and writes no second event.
- The allocation quantity check takes a row lock on the subscription and a deferred constraint, so two locations cannot both pass a cap of one.

Webhook handlers do not take an admin actor. They take a verified provider event id that is already a processed paid invoice. Replay hits `stripe_event_receipts` and the unique `provider_event_id` on `commercial_payment_evidence`, and returns duplicate without a second state change.

## Isolation

- New tables: RLS on, no policies, privileges revoked from `PUBLIC`, `anon`, and `authenticated`.
- RPCs are `SECURITY DEFINER` in `admin_private` with a public wrapper, `search_path` empty, `EXECUTE` for `service_role` only. That is the portal and Guard pattern.
- The browser never selects these tables and never receives a provider secret, phone-number credential, or Stripe secret.
- Invitation lookup is by hash. The raw token is not logged.
- Invitation expiry is checked before any read of the request. An expired token returns the same generic unavailable response as an unknown token.
- Onboarding commands re-read the customer and membership inside the transaction. They do not trust ids in the admin form without a foreign key and the membership check.
- Entitlement and allocation rows use a composite foreign key `(location_id, business_id)` → `locations (id, business_id)`, after `UNIQUE (id, business_id)` is added on `locations`. A location of another business cannot be attached by id alone.
- A portal products call that is asked, via a forged body, for another customer id ignores the body. The SQL function has no such parameter.

## Financial consistency

- One `stripe_customer_maps` row per customer. Commercial checkout later reuses it.
- Guard `stripe_subscription_id` and commercial `stripe_subscription_id` are disjoint.
- One occupying commercial subscription per business. One incoming replacement may exist only with `succeeds_subscription_id`. Two businesses for one customer are two occupying rows.
- One open bundle allocation per location. Open allocations for a subscription cannot exceed `quantity_limit_snapshot`.
- One non-ended Guard coverage per location, and one open Guard subscription per location, already enforced.
- Recovery obligations stay on the service order. A bundle price does not void them. `payment_receipts.obligation_id` stays a Recovery receipt and is not a commercial evidence pointer.
- At acceptance, a trigger copies and then freezes `amount_minor`, `currency`, `tax_behaviour`, `tax_amount_minor`, `cadence_snapshot`, `terms_ref`, and each item's `quantity_limit_snapshot`. A later price is a new subscription, not an update. `amount_minor` is null only for `NON_BILLABLE_PILOT`. A billable offer is refused while amount, currency, tax behaviour, or terms are null.
- `current_period_start` and `current_period_end` are written from `commercial_payment_evidence`, or from the pilot window. They are not typed in by an admin on a billable row. A failed renewal does not update them. Access uses `current_period_end` even when the state is `PAST_DUE`. Expiry is that timestamp, reached with no newer evidence.
- Billable `ACTIVE` requires evidence whose amount and currency match the snapshot and whose `provider_event_id` is a processed paid invoice. There is no manual-paid state.
- Pilot `ACTIVE` requires the pilot command, a reason, an actor, and a future `pilot_ends_at`. It must not have an evidence row. The portal label is pilot.
- A non-Stripe payment rail is pending. It would be its own receipt table. It is not in 02B or 02F.
- Refunds and disputes for Guard stay in `guard_refunds` and `guard_disputes`. Telloya refunds, when they exist, get their own child table in the payment phase rather than overloading Guard.
- A refused 02J attempt inserts an event and leaves both ledgers unchanged. It does not guess a credit and it does not mark the allocation `FUNDED`. 02H does not call the credit command at all.

## Release safety

- First migration is additive and contains no `UPDATE` of customers, cases, sessions, payments, or Guard rows, except the new unique `(id, business_id)` on `locations` if that constraint is added as a unique index over existing primary keys. It must not rewrite location rows.
- It is not applied to Production.
- It is not safe to replay once applied.
- Rollback of an unreleased empty schema is dropping the new tables in reverse dependency order. Rollback after any live row exists is a forward fix, not a drop.
- Feature flags default off. Turning the commercial flag off hides new portal behaviour. It does not delete data and does not change `/portal`, Guard, or Recovery.
- Concurrent with Telloya marketing work: this design does not edit `apps/telloya` or PR #383.
