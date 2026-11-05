# 03A-03-03-01 Commercial post-payment handover

This phase shows which paid Telloya and Complete subscriptions are waiting for service setup. It does not provision a provider, buy a telephone number, configure forwarding, activate Guard, grant an entitlement, start overage, or send mail.

There is no Telloya dashboard route. The customer surfaces are My Products and `/portal/onboarding/setup`. The Admin surface is `/commercial/setup`.

## Ledger

`20261104220000_customer_commercial_setup_handover_v1.sql` was applied once to DEV project `rmzozuiamjcclvtgutgd`. The verified DEV ledger contains 104 entries and ends at `20261104220000`. The previous ledger contained 103 entries and ended at `20261104190000`. The repository file is 25,436 characters. Its MD5 is `690e88917f0166f376d3e8189b60b427`. Its SHA-256 is `dbbc03ed138c1f2115d44e7c13923570bf1cbf6205e401bec85aef6df00552c3`. Its GitHub blob SHA is `639b5c553348537db401e46c15fa7af7bb6d95a3`. Public Admin and Customer handover RPCs are service-role-only. Existing `customer_portal_products_v1` permissions were preserved. Invalid Admin and customer sessions were rejected. No settlement, entitlement or provisioning data was created. `service_provisions_live_closed` remains enforced. Commercial feature flags remain OFF. Do not replay `20261104220000`. Do not apply `20261104220000` to Production. Do not replay `20261104190000`. Production and AWS ApprovedMigrationHead remain `20261014170000`. The applied SQL is unchanged.

The file adds no table. It adds one private classifier and two service-role-only read functions, and replaces `public.customer_portal_products_v1(text)` in place:

- `admin_private.commercial_setup_handover_v1(uuid)`
- `public.admin_commercial_setup_queue_v1(text)`
- `public.customer_portal_setup_handover_v1(text)`
- `public.customer_portal_products_v1(text)` — same signature, session check, and service-role grant

Anonymous and authenticated roles cannot execute the public functions. The private function is not granted to `service_role`. None of these functions insert, update, or delete. `service_provisions_live_closed` still rejects `LIVE`.

## Where the view comes from

Each row is derived from records that already exist:

| Fact | Source |
| --- | --- |
| Customer and business | `customers`, `businesses`, and a `verified` `business_memberships` row for that pair |
| Commercial reference, plan, monthly price | `commercial_subscriptions` joined to the immutable `commercial_offer_acceptances` row for the same customer, business, plan version, GBP amount, and monthly cadence |
| Selected locations | `onboarding_requests` and `admin_private.onboarding_request_locations` for that subscription, customer, and business, named from `locations` |
| Included Guard quantity | `commercial_offer_acceptances.guard_quantity` |
| Guard locations | Open `bundle_guard_allocations` rows (`RESERVED` or `PREVIEW`) for that subscription, customer, and business. Selected onboarding locations are not assignments |
| Payment | Exactly one `commercial_payment_evidence` row for the subscription's recorded `current_period_start` and `current_period_end`, with the accepted GBP amount, plus a `commercial_checkout_preparations` row for the same acceptance, customer, business, amount, and monthly cadence |
| Operational setup | Telloya `product_entitlements` in `PENDING` or `ELIGIBLE` and their `service_provisions` rows |

A missing acceptance, a mismatched acceptance, or a membership that is not exactly `verified` returns nothing. Two businesses with the same display name stay separate because the join uses the business id.

`PAYMENT_PENDING` is always `awaiting_payment`, even when an evidence row exists. `ACTIVE` is `verified` only when that single evidence row matches the subscription amount, the acceptance, the checkout preparation, and the subscription's recorded period. Any other financial combination is `unverified` and is shown as payment pending. A verified row is scoped to `initial_settlement`: it confirms that recorded period and does not show a later period as paid. The Admin queue includes a subscription only when the financial status is `verified` and the operational status is not `active`.

## Financial state and operational state

`commercial_subscriptions.state = ACTIVE` means the initial invoice was settled. It does not mean setup has started.

| Financial status | Operational status | Customer display | Next action |
| --- | --- | --- | --- |
| Awaiting payment, or payment not verified | Not started | Payment pending | None |
| Payment verified | Not started, including no provision row | Payment received — setup pending | Begin setup |
| Payment verified | A provision has left `NOT_STARTED` | Setup in progress | The first incomplete setup step |
| Payment verified | Every Telloya provision is `READY_FOR_PROVIDER_VERIFICATION`, and preferences, coverage of the selected locations, the agent, the provider and number, forwarding, the passed test call, and customer confirmation are all stored | Awaiting final verification | Approve activation |
| Payment verified | Every Telloya provision is `READY_FOR_PROVIDER_VERIFICATION`, but one of those checks is missing | Awaiting final verification | The first missing check |
| Payment verified | Every Telloya provision is `LIVE` with `live_at` | Service active | None |

Approve activation is reached only after every check above is stored. There is no business or voice-service preference confirmation in the schema, so that recommendation does not occur in this phase. A `READY_FOR_PROVIDER_VERIFICATION` state does not stand in for a missing check. `service_provisions_live_closed` still rejects `LIVE`.

Checklist steps are complete only from stored evidence:

- Payment confirmed: the verified initial-settlement rule above.
- Business and service preferences: an explicit stored confirmation of the business and voice-service preferences. No such record exists yet, so selected locations leave this step planned. Payment does not create one.
- AI receptionist configuration: every owned Telloya provision has `agent_configured_at`. The provision state alone does not complete this step.
- Telephone number and forwarding: every owned provision has a provider reference, `number_allocated_at`, and `forwarding_instructed_at`.
- Customer confirmation: `customer_confirmed_at` is set on every owned provision before activation can be recommended. It is not inferred from the provision state.
- Test call and verification: every owned Telloya provision has a non-blank `provider_test_call_ref`, `provider_test_outcome = PASSED`, and `agent_test_passed_at`. The provision state alone does not complete this step. The provision's business and location must match its entitlement.
- Service activation: state `LIVE` and `live_at` are set on every such provision.

A planned step is not described as done. The page does not claim that a telephone number, agent, or forwarding instruction exists.

## Complete and Telloya

A paid Complete acceptance keeps `guard_quantity`. Guard status is `pending_setup`. Locations are listed only when an open allocation records them. With no allocation, assignment is `pending_confirmation` and no selected location is described as the Guard location. `monitoringActive` is always false. No `guard_coverages` row and no allocation are created by this read.

A Telloya acceptance has Guard quantity 0, status `not_subscribed`, and no Guard locations. My Products continues to show Guard as an optional product that is not included.

`public.customer_portal_products_v1(text)` is replaced in this same applied file. The applied settlement body is not edited. The replacement keeps the function signature, the portal-session check, and the service-role grant. For a paid Complete package it keeps the accepted Guard quantity and status `pending`. It names a Guard location only from an open `bundle_guard_allocations` row for that customer, business, and subscription. With no allocation, `assignment` is `pending_confirmation` and `locations` is empty. A business that already has Guard locations from coverage or an allocation is left unchanged. Monitoring is not marked recorded.

## Access

The Admin function is `VOLATILE` because `admin_session_v1` records `last_seen_at`. It returns null unless that session is accepted. The customer function stays `STABLE` because the portal session read does not extend the idle window. It returns null unless `customer_portal_session_v1` accepts the portal session, and it then loads only that customer's billable `ACCEPTED`, `PAYMENT_PENDING`, and `ACTIVE` subscriptions. The customer payload drops `businessId`, the plan, the price, and the next internal action. Neither payload includes Stripe customer, event, Checkout, price, or product identifiers.

`ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED` and `CUSTOMER_COMMERCIAL_SETUP_HANDOVER_READ_ENABLED` default off. While they are off, the pages do not call the functions. No Vercel flag is changed. Commercial checkout, payment verification, settlement, Telloya provisioning, Guard activation, and overage charging stay off.

## Later commands

This page lists the next action and does not run it. There is no Mark active or Provision now control. A later phase can add one audited command for each of these, still without treating `ACTIVE` as setup:

1. Begin setup.
2. Confirm business preferences.
3. Confirm AI configuration.
4. Record provider and number allocation.
5. Record successful test call.
6. Request customer forwarding confirmation.
7. Approve activation.

Each command needs its own actor, request id, and prior-state check. Approve activation is the only command that may attempt `LIVE`, and only after business preferences, coverage of the selected locations, the agent, the provider and number, forwarding, the passed test call, and customer confirmation are already stored. This phase does not add that command, and the existing check continues to reject `LIVE`. A `READY_FOR_PROVIDER_VERIFICATION` state does not replace any of those records.
