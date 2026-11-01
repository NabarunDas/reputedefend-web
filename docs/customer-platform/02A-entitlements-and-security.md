# 02A — Entitlements and security

Status: **proposed rules**. Production is unchanged. No privilege grant is made by this PR.

## Four different facts

| Fact | Question | Authority |
| --- | --- | --- |
| Authentication | Did this browser complete OTP for the current verified email? | `customer_portal_session_v1` |
| Membership | May this customer act for this business now? | `business_memberships.status = verified` |
| Commercial entitlement | Is a paid term or authorised trial in force? | `commercial_subscriptions.state` and dates, or the existing Recovery obligation / `guard_billing` |
| Operational readiness | Is the service actually usable? | Telloya `service_provisions.state = LIVE`, or Guard `guard_coverages.state = ACTIVE` after the existing readiness checks |

A checkout redirect, an admin approval, a membership, and a paid invoice do not satisfy the next row by themselves.

## Portal projection

Proposed RPC: `public.customer_portal_products_v1(p_token_hash text)`.

It follows `customer_portal_dashboard_v1` and `customer_portal_guard_v1`:

- The only identity input is the portal token hash.
- The function loads `customer_portal_session_v1` rules, including idle and absolute expiry. A missing, revoked, idle, or expired session returns the same unauthenticated result the other portal reads use. It does not return product rows.
- It does not accept `customer_id`, `business_id`, entitlement flags, or a product list from the client.
- It does not accept an action-session token.

### Returned shape

Enough for the existing `ProductCard` contract, plus the fields Phase 1 left for a later summary:

| Field | Rule |
| --- | --- |
| Product | `TELLOYA`, `GUARD`, or Recovery as the existing case summary. Complete is not a fourth card. Its components surface on the Telloya and Guard cards. |
| Scope | Business display name, and location name when the component is per location. Only businesses with a verified membership for this session customer. |
| Commercial state | `none`, `pending`, `past_due`, `paid`, `trial`, `expired`, `canceled`, or `unknown`. |
| Operational state | `not_started`, `setup`, `live`, `paused`, `ended`, or `unknown`. |
| User-facing status | A single phrase from those two states. The word Active is returned only for operational `live`. |
| Permitted action | An existing route (`/portal/recovery`, `/portal/guard`) or a setup route that a later PR adds. No action when the state is unknown, revoked, or not provisioned. Telloya has no route in Phase 1, so this RPC must not invent `/portal/telloya` until that route exists. |
| Attention | From real rows only: Recovery attention count, Guard actions that already exist, or a Telloya setup step. |
| Next action | One sentence, or null. |
| Read failure | Per product `unknown` with no purchase inference. |

### Who can see what

- Session customer A sees a business only when A has a verified membership.
- A does not see business B's subscriptions, invoices, calls, or provisions.
- Invoice amounts and Stripe ids are omitted from this RPC. Billing detail stays on the existing payment and Guard pages for the customer who already owns those records.
- A second member sees Telloya setup status for a shared business. They do not see another member's Recovery cases. Case visibility stays `cases.customer_id` until a separate decision changes `customer_portal_dashboard_v1`.
- A second member does not see Guard invoice amounts. Guard operational status for a location is included only when a coverage is linked and the membership check passes. Changing `customer_portal_guard_v1` to do that is a later PR. This design does not silently widen it.

### Empty, partial, and expired

| Situation | Result |
| --- | --- |
| Valid session, no cases, no Guard, no entitlement | Three honest cards: Recovery empty, Guard with no locations, Telloya not set up. No Active badge. |
| One product read throws | That product is `unknown` / unavailable. The others still return. The page must not treat unknown as unpurchased. |
| Entitlement `REVOKED` or membership revoked | The product is hidden or shown as ended, with no operational action. |
| Trial `eligible_to` in the past | `expired`. Provision cannot stay `LIVE`. |
| Subscription `ACTIVE`, provision not `LIVE` | Paid or trial, plus the current setup step. Not Active. |
| Session idle | Unauthenticated. No product payload. |

The Phase 1 presenter already returns `unavailable` without a link when a read fails. The new RPC must be able to feed that branch.

## Telloya Active

All of the following are required before the projection returns Active or before any operational Telloya function runs:

1. Commercial approval: plan version `APPROVED`, subscription not `DRAFT`.
2. Eligibility: paid invoice applied, or an authorised trial whose `trial_ends_at` is still in the future.
3. Entitlement `ELIGIBLE` for this business, and the session customer has a verified membership.
4. Business profile recorded (`profile_ready_at`).
5. Agent configuration recorded (`agent_configured_at`).
6. Number allocation recorded (`number_allocated_at`).
7. Forwarding instructions recorded (`forwarding_instructed_at`).
8. Agent test recorded (`agent_test_passed_at`).
9. Customer activation confirmation (`customer_confirmed_at`) from the portal session, not from an admin acting as the customer without a recorded customer action.
10. Provision state `LIVE` and `live_at` set by that command.

Missing any step keeps the operational state at the earliest missing check. A failed payment moves provision to `SUSPENDED` if it was `LIVE`, and clears the user-facing Active phrase. It does not delete the provision timestamps.

No operational function (calls, leads, settings, usage) exists in this phase. When those RPCs are added, each one repeats the ten checks. The portal projection is not a capability token.

## Guard Active

Do not add a path around the current functions.

`guard_coverage_readiness_v1` and `guard_activate_v1` remain the only way to reach coverage `ACTIVE`. They already require mapping, `guard_location_authorized_v1`, permission, verified manager access, contact, baseline, rota, the commercial basis, and `guard_billing` `CURRENT` with `paid_through_at` for direct paid Guard, or `NOT_REQUIRED` / included for an included period.

A `product_entitlements` row of component `GUARD` is not an input to those functions. `admin_private.guard_set_billing_entitlement_v1` stays unavailable to `service_role`. Complete does not call it.

Portal Guard copy can say monitoring is recorded only when the existing projection says `monitoringActive`, which is what Phase 1 already does.

## Complete

Complete is a plan with two components. The customer portal shows Telloya and Guard, not a Complete workspace.

- The Guard quantity on the pinned plan version is the maximum number of linked locations.
- Billing is one commercial subscription. Standalone Guard money stays on `guard_subscriptions` until that subscription is reconciled.
- Upgrade onto Complete sets `reconciled_guard_subscription_id` only after the existing Guard cancel-at-period-end or an approved credit has been recorded by the existing Guard command. Until then the Complete Guard item stays unreconciled and must not start a second charge.
- Downgrade removes Guard seats by the existing coverage end/cancel path and can leave a new Telloya subscription. The unique open-subscription index forces the Complete row to end before the Telloya row opens.
- Cancellation of Complete revokes the Telloya entitlement at the chosen time and starts Guard cancellation through the Guard command for each linked coverage. It does not delete coverages, invoices, or events.
- Partial suspension can suspend Telloya provision while leaving Guard to its own pause command, or the reverse. Each command has its own reason.
- Historical plan version, items, and events stay pinned.

No price and no included-location count are approved merely by appearing in this document.

## Admin trace

Every privileged change uses the existing command shape:

- `admin_session_v1` supplies `actor_id`.
- Client supplies `p_request` UUID.
- Receipt fingerprint is the operation plus the canonical payload.
- Same request returns the stored response.
- `write_record_audit_v1` records actor, action, outcome, target, reason, and request id.
- Domain event row stores previous state, new state, and reason.
- Two admins racing the same transition: the state check is in the update (`WHERE state = expected`). One wins. The other gets a conflict response and writes no second event.

Webhook handlers do not take an admin actor. They take a verified provider event id. Replay hits `stripe_event_receipts` and returns duplicate without a second state change.

## Isolation

- New tables: RLS on, no policies, privileges revoked from `PUBLIC`, `anon`, and `authenticated`.
- RPCs are `SECURITY DEFINER` in `admin_private` with a public wrapper, `search_path` empty, `EXECUTE` for `service_role` only. That is the portal and Guard pattern.
- The browser never selects these tables and never receives a provider secret, phone-number credential, or Stripe secret.
- Invitation lookup is by hash. The raw token is not logged.
- Invitation expiry is checked before any read of the request. An expired token returns the same generic unavailable response as an unknown token.
- Onboarding commands re-read the customer and membership inside the transaction. They do not trust ids in the admin form without a foreign key and the membership check.
- A portal products call that is asked, via a forged body, for another customer id ignores the body. The SQL function has no such parameter.

## Financial consistency

- One `stripe_customer_maps` row per customer. Commercial checkout later reuses it.
- Guard `stripe_subscription_id` and commercial `stripe_subscription_id` are disjoint.
- One open commercial subscription per business.
- One non-ended Guard coverage per location, already enforced.
- Recovery obligations stay on the service order. A bundle price does not void them.
- `amount_minor` on a commercial subscription is copied from the pinned plan version at acceptance and is immutable afterwards, matching quote snapshots.
- Refunds and disputes for Guard stay in `guard_refunds` and `guard_disputes`. Telloya refunds, when they exist, get their own child table in the payment phase rather than overloading Guard.
- Failed reconciliation inserts an issue row and leaves both ledgers unchanged. It does not guess a credit.

## Release safety

- First migration is additive and contains no `UPDATE` of customers, cases, sessions, payments, or Guard rows.
- It is not applied to Production.
- It is not safe to replay once applied.
- Rollback of an unreleased empty schema is dropping the new tables in reverse dependency order. Rollback after any live row exists is a forward fix, not a drop.
- Feature flags default off. Turning the commercial flag off hides new portal behaviour. It does not delete data and does not change `/portal`, Guard, or Recovery.
- Concurrent with Telloya marketing work: this design does not edit `apps/telloya` or PR #383.
