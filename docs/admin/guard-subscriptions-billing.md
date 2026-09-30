# Guard subscriptions and billing — Step 16

Status: **DATABASE APPLIED / STRIPE & GUARD LIVE DISABLED**

The additive migration `20260930180050_guard_subscriptions_billing_v1.sql` is applied to `profilerelaunch-dev` exactly once after Step 15 as `20260930180050 guard_subscriptions_billing_v1`. Live migration history now continues with independently applied `20260930203750 guard_manual_checks_v1`. Step 16 exists remotely exactly once. Do not replay it. Do not create another Step 16 migration. Do not modify the applied SQL.

This step implements per-location Guard subscriptions, renewals, paid-through entitlement, included-period expiry, explicit included-to-paid continuation, cancellation, refunds/credits, price-change acceptance, disputes and daily billing reconciliation.

It does not implement Step 17 monitoring-check generation or Step 18 alerts.

## Independent live verification

Independent live verification confirmed:

- Step 16 migration count = 1
- all Step 16 Guard subscription/billing tables exist
- RLS enabled on all new public Step 16 tables
- anon direct table CRUD denied
- authenticated direct table CRUD denied
- service_role direct table CRUD denied
- reviewed Guard subscription RPCs executable by service_role only
- `admin_private.guard_set_billing_entitlement_v1` remains unavailable to service_role
- `RECONCILE_GUARD_BILLING` is an allowed Step 10 job type
- provider operations support the reviewed Guard subscription operations
- `CREATE_RECURRING_PRICE` / `GUARD_PRICE` may use `customer_id` NULL only in its tightly-scoped catalogue operation
- Guard recovery has source provider-operation lineage
- current live Step 16 data is empty: 0 Guard provider Price mappings, continuations, subscriptions, subscription events, recurring consents, recurring invoices, price-change offers, billing adjustments, refunds, disputes, reconciliation runs, reconciliation targets, reconciliation issues and `RECONCILE_GUARD_BILLING` jobs
- no Stripe Product, Price, Checkout Session, Subscription or Refund was created
- no money moved
- no Guard activation occurred
- Supabase security advisor produced no new Step-16-specific WARN
- existing project warnings remain outside this PR

This documentation-only update does not:

- request Supabase credentials
- access Supabase
- replay or modify the applied migration
- configure Stripe Dashboard
- configure Stripe or Vercel secrets
- create real Stripe test or live objects from deployed environments
- move money
- enable `GUARD_ACTIVATION_ENABLED`, `GUARD_SUBSCRIPTIONS_ENABLED` or `GUARD_REFUNDS_ENABLED`

Step 11 outgoing email remains disabled. Step 12 incoming email remains disabled. Step 14 Stripe provider remains disabled. Step 15 live Guard activation remains disabled. Worker cadence remains 86400 seconds. Current Cron remains `0 4 * * *`. Do not change Cron.

## Database-ready but not live

These contracts exist in the applied database and Admin/Customer source. They are **not** live operational services. Stripe/Guard feature gates remain unset, so none of the following provider effects are live:

- one subscription per Guard location
- recurring Guard consent
- recurring Stripe Price mapping
- subscription Checkout
- invoice-paid entitlement
- paid-through renewals
- included-to-paid continuation
- period-end cancellation
- immediate cancellation review
- refunds
- bounded service credits
- price-change acceptance/scheduling
- disputes
- payment-method recovery
- daily billing reconciliation

## What this is

One Stripe subscription per Guard-covered location. Quantity is always 1. Currency is GBP. Cadence is monthly. The accepted Step 13 `RELAUNCH_GUARD` order is the immutable commercial basis. One Stripe Customer may own several independent Guard subscriptions. Cancelling one location cannot change billing for another location. Subscription quantity is never used to represent several locations.

`public.guard_subscriptions` is the internal subscription. Stripe provider status is stored separately from internal lifecycle (`PENDING_CUSTOMER`, `PENDING_PROVIDER`, `INCOMPLETE`, `ACTIVE`, `PAST_DUE`, `CANCEL_AT_PERIOD_END`, `CANCELED`, `UNPAID`, `ENDED`). Stripe status is not Guard entitlement.

`public.guard_billing` remains the authoritative local entitlement projection from Step 15.

## Recurring Stripe Price mapping

`public.price_versions` remains the commercial source of truth. `public.guard_provider_price_maps` is an immutable mapping from an approved `RELAUNCH_GUARD` price version to one Stripe test Price. Provider Price must be GBP, recurring monthly, quantity/licensed, exact internal minor-unit amount, test mode, and immutable. A durable provider operation is created before any Stripe Price. A new internal price version gets a new Stripe Price mapping. Old Stripe Prices are not mutated.

No provider Product or Price is created because provider mode remains disabled and `GUARD_SUBSCRIPTIONS_ENABLED` remains unset.

## Recurring consent and customer action

`GUARD_RECURRING_CONSENT_V1` is an immutable per-location consent. It snapshots customer, business, location, Guard order, price version, accepted amount, GBP, monthly frequency, tax treatment, cancellation wording/version, accepted timestamp and customer identity. One consent does not cover several locations. Consent from one price version is not reused after an unaccepted price increase.

`GUARD_SUBSCRIPTION_START` reuses the hashed-secret, OTP, identity, membership, expiry, revocation, receipt and idempotency architecture. Opening the link does not create a subscription. OTP alone does not create a subscription. The customer must positively accept recurring-billing consent before Stripe-hosted Checkout.

## Direct Checkout

Stripe-hosted Checkout uses `mode = subscription` with exactly one mapped monthly Price and quantity 1. The Checkout return page does not make Guard billing `CURRENT`. `checkout.session.completed` is correlation only. A Stripe Subscription being `active` alone does not make Guard billing `CURRENT`. Subscription `active` / `trialing` is not entitlement.

Before issuing Direct Guard Checkout, Step 15 non-billing readiness gates must pass. Only the expected `BILLING_NOT_CURRENT` blocker is ignored.

## Invoice-paid entitlement

`invoice.paid` is the authoritative paid-entitlement event. Authoritative paid entitlement begins only after a verified subscription invoice is successfully paid. Then:

- `billing_state = CURRENT`
- `entitlement_source = PROVIDER`
- `paid_through_at = verified subscription period end`

Validation requires the exact Stripe Customer, Subscription, Subscription Item, internal subscription, coverage/location, expected Price, amount, currency and that the invoice belongs to the subscription.

Do not grant entitlement from Checkout redirect, `checkout.session.completed`, subscription creation, subscription `active` alone, `invoice.created`, `invoice.finalized`, a screenshot or an Admin checkbox.

## Renewal failure and paid-through

Paid-through is monotonic. A confirmed renewal `invoice.paid` extends `paid_through_at` and never shortens it from a later stale webhook. One invoice creates one logical renewal record.

`invoice.payment_failed` or authentication-required is recorded immediately. Failed renewal does not prematurely remove already-paid service. If `paid_through_at > now()`, coverage remains operational until paid-through expiry. Billing may become `PAST_DUE`. At or after paid-through expiry without a successful renewal, the exact coverage pauses through a controlled command. Later recovery can restore billing `CURRENT` and paid-through, but coverage resume is a separate controlled readiness check. Live Guard activation remains disabled.

## Included expiry

Included coverage remains `INCLUDED`, billing `NOT_REQUIRED`, no paid entitlement, no paid-Guard discount and no subscription by default. The included offer never creates a Stripe subscription and never silently converts to paid. Included Guard never auto-converts.

At `included_end_at`, if the customer has taken no separate paid action, included coverage ends. No Stripe object is created. No charge occurs. No customer debt is created.

Reminder obligations are modelled with a versioned policy. Default live policy is disabled/unconfigured. Tests may inject offsets. Daily reconciliation can create due reminder records when a policy exists. Step 11 delivery remains disabled, so no reminder email is sent and no `SEND_EMAIL` is enqueued. Reminder readiness is Admin-visible only.

## Included-to-paid continuation

Continuation requires a separately accepted Step 13 `RELAUNCH_GUARD` order for the exact location, explicit recurring consent, a secure customer action and Stripe subscription setup.

Historical `INCLUDED` coverage is not mutated into paid coverage. `public.guard_continuations` and coverage origin `INCLUDED_CONTINUATION` record the handoff. `trialing` is not paid entitlement. Paid Guard discount eligibility begins only from actual paid/direct activation.

Continuation cannot charge before the included period ends. When included Guard still has time remaining, subscription Checkout may use the exact included-end timestamp as Stripe `trial_end` only if that boundary is at least 48 hours plus a small safety margin in the future. Short included windows that cannot satisfy Stripe's safe delayed-billing boundary fail closed. They do not create an immediately chargeable subscription, do not round the included end forward, do not shorten the included period and do not charge early.

When the first paid continuation invoice succeeds, historical included coverage ends and a new `DIRECT_GUARD` continuation coverage is created for the same customer/business/location. If that invoice fails, included coverage still ends at the agreed included end and no paid coverage is fabricated.

## Cancellation

Cancellation is per subscription/location. Cancellation intent and provider-confirmed cancellation remain separate.

- Normal path: persist the request, use a durable provider operation, then confirm `cancel_at_period_end = true` only from provider evidence. Coverage stays active through already-paid `paid_through_at`.
- Undo: confirm `cancel_at_period_end = false` only before provider period end, for the same customer/location/subscription. An already canceled Stripe subscription is not resurrected.
- Immediate cancellation is exceptional. No refund amount is decided automatically. Admin/Finance review and fresh Admin authentication are required.

A successful Stripe API call that returns the opposite cancel flag must not terminalise the requested operation as succeeded.

## Refunds and credits

`public.guard_billing_adjustments` and `public.guard_refunds` are first-class auditable records. There is no automatic pro-rata refund formula, no hidden default percentage and no automatic refund merely because coverage paused.

Admin may approve a specific integer minor-unit amount only after fresh authentication. The amount must be `> 0`, `<=` refundable paid amount and pinned to the exact location subscription/invoice/payment. Refunds remain provider-confirmed and idempotent. A submitted refund is not succeeded. A failed refund remains visible and owned. Full refund plus overlapping service credit for the same period is denied without explicit checked accounting. `charge.refunded` is supplemental evidence only and does not independently mark a refund succeeded.

`SERVICE_CREDIT` stays `APPROVED` / `PENDING_APPLICATION` and is not claimed as financially applied, because exact per-subscription Stripe customer-balance scoping cannot be guaranteed.

## Price-change acceptance

Existing subscriptions stay on their accepted price. A newly approved website/catalogue price does not automatically increase existing customers. Recurring price increases require explicit customer acceptance. `public.guard_price_change_offers` plus `GUARD_PRICE_CHANGE_ACCEPTANCE` require a positive customer accept. No response is not acceptance. After acceptance, the new provider Price is scheduled for the next renewal with quantity 1 and no mid-period proration. The same acceptance workflow is used for lower prices.

## Disputes

`public.guard_disputes` tracks provider dispute state. An open dispute is urgent Finance work. No automatic refund is issued. Already-paid entitlement is not silently rewritten. At paid-through expiry, normal entitlement rules apply.

## Payment-method recovery

Guard recovery uses a Guard-specific Setup Checkout and SetupIntent path. A recovery Checkout operation has exactly one sourced `UPDATE_SUBSCRIPTION_PAYMENT_METHOD` operation. Replay reuses that same operation and idempotency key. Updating a payment method does not mark an invoice paid.

## Daily reconciliation

Job type `RECONCILE_GUARD_BILLING` reuses the existing Step 10 daily worker. Cron stays `0 4 * * *`. At most one reconciliation run per UK service date. Mismatches are persisted and not silently overwritten. Included expiry and paid-through pause are enforced here. Reconciliation verifies and settles already-issued provider operations from authoritative provider state. It does not create provider mutations merely because local and provider data differ.

## Provider and webhooks

The existing `/api/webhooks/stripe` raw-signature endpoint and `PROCESS_STRIPE_EVENT` job are reused. No second webhook endpoint. Stripe SDK remains `22.6.2` / `2026-08-26.dahlia`. `sk_live_*` and `rk_live_*` remain impossible in `stripe_test`. Deployed environments stay `PAYMENTS_PROVIDER_MODE=disabled`.

## Security

All new public billing/subscription tables have RLS enabled. No direct table CRUD for `PUBLIC`, `anon`, `authenticated` or `service_role`. Reviewed `SECURITY DEFINER` RPCs use a fixed `search_path`, revoke `PUBLIC` / `anon` / `authenticated`, and grant `service_role` execute only. Admin money actions require Admin session, fresh auth, expected record version, UUID idempotency and a bounded reason.

## Feature gates

Server-only `GUARD_SUBSCRIPTIONS_ENABLED` and `GUARD_REFUNDS_ENABLED` default disabled and remain unset. Do not use `NEXT_PUBLIC_*`. Do not configure them in Vercel. When disabled, read-only Admin data may render and provider mutation endpoints fail closed. `GUARD_ACTIVATION_ENABLED` remains disabled/unset.

## Out of scope

- replaying or rewriting this applied migration
- Stripe Dashboard / secrets / live objects
- money movement
- live Guard activation
- enabling `GUARD_SUBSCRIPTIONS_ENABLED` or `GUARD_REFUNDS_ENABLED`
- Step 11/12 live mail
- Step 17 checks
- Step 18 alerts
- Cron changes
