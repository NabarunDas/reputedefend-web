# Guard subscriptions and billing — Step 16

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / STRIPE & GUARD LIVE DISABLED**

The additive migration `20260930180050_guard_subscriptions_billing_v1.sql` exists in source only. It sorts after applied `20260930164529_guard_onboarding_activation_v1.sql`. It has not been applied to Supabase. Do not apply it from this PR. Do not create another Step 16 migration while this one remains unapplied. Do not modify any applied migration.

This step implements per-location Guard subscriptions, renewals, paid-through entitlement, included-period expiry, explicit included-to-paid continuation, cancellation, refunds/credits, price-change acceptance, disputes and daily billing reconciliation.

It does not implement Step 17 monitoring-check generation or Step 18 alerts.

## Independent review

ChatGPT will independently review the migration and Stripe integration before anything is applied or configured.

This PR does not:

- request Supabase credentials
- apply the new migration remotely
- modify any applied migration
- configure Stripe Dashboard
- configure Stripe or Vercel secrets
- create real Stripe test or live objects from deployed environments
- move money
- enable `GUARD_ACTIVATION_ENABLED`, `GUARD_SUBSCRIPTIONS_ENABLED` or `GUARD_REFUNDS_ENABLED`

Step 11 outgoing email remains disabled. Step 12 incoming email remains disabled. Step 14 Stripe provider remains disabled. Step 15 live Guard activation remains disabled. Current Cron remains `0 4 * * *`. Do not change Cron.

## What this is

One Stripe subscription per Guard-covered location. Quantity is always 1. Currency is GBP. Cadence is monthly. The accepted Step 13 `RELAUNCH_GUARD` order is the immutable commercial basis. One Stripe Customer may own several independent Guard subscriptions. Cancelling one location cannot change billing for another location. Subscription quantity is never used to represent several locations.

`public.guard_subscriptions` is the internal subscription. Stripe provider status is stored separately from internal lifecycle (`PENDING_CUSTOMER`, `PENDING_PROVIDER`, `INCOMPLETE`, `ACTIVE`, `PAST_DUE`, `CANCEL_AT_PERIOD_END`, `CANCELED`, `UNPAID`, `ENDED`). Stripe status is not Guard entitlement.

`public.guard_billing` remains the authoritative local entitlement projection from Step 15.

## Recurring Stripe Price mapping

`public.price_versions` remains the commercial source of truth. `public.guard_provider_price_maps` is an immutable mapping from an approved `RELAUNCH_GUARD` price version to one Stripe test Price. Provider Price must be GBP, recurring monthly, quantity/licensed, exact internal minor-unit amount, test mode, and immutable. A durable provider operation is created before any Stripe Price. A new internal price version gets a new Stripe Price mapping. Old Stripe Prices are not mutated.

No provider Product or Price is created in this PR because provider mode remains disabled.

## Recurring consent and customer action

`GUARD_RECURRING_CONSENT_V1` is an immutable per-location consent. It snapshots customer, business, location, Guard order, price version, accepted amount, GBP, monthly frequency, tax treatment, cancellation wording/version, accepted timestamp and customer identity. One consent does not cover several locations. Consent from one price version is not reused after an unaccepted price increase.

`GUARD_SUBSCRIPTION_START` reuses the hashed-secret, OTP, identity, membership, expiry, revocation, receipt and idempotency architecture. Opening the link does not create a subscription. OTP alone does not create a subscription. The customer must positively accept recurring-billing consent before Stripe-hosted Checkout.

## Direct Checkout

Stripe-hosted Checkout uses `mode = subscription` with exactly one mapped monthly Price and quantity 1. The Checkout return page does not make Guard billing `CURRENT`. `checkout.session.completed` is correlation only. A Stripe Subscription being `active` alone does not make Guard billing `CURRENT`.

Before issuing Direct Guard Checkout, Step 15 non-billing readiness gates must pass. Only the expected `BILLING_NOT_CURRENT` blocker is ignored.

## Invoice-paid entitlement

Authoritative paid entitlement begins only after a verified subscription invoice is successfully paid. Then:

- `billing_state = CURRENT`
- `entitlement_source = PROVIDER`
- `paid_through_at = verified subscription period end`

Validation requires the exact Stripe Customer, Subscription, Subscription Item, internal subscription, coverage/location, expected Price, amount, currency and that the invoice belongs to the subscription.

Do not grant entitlement from Checkout redirect, `checkout.session.completed`, subscription creation, subscription `active` alone, `invoice.created`, `invoice.finalized`, a screenshot or an Admin checkbox.

## Renewal failure and paid-through

A confirmed renewal `invoice.paid` extends `paid_through_at` and never shortens it from a later stale webhook. One invoice creates one logical renewal record.

`invoice.payment_failed` or authentication-required is recorded immediately. If `paid_through_at > now()`, coverage remains operational until paid-through expiry. Billing may become `PAST_DUE`. At or after paid-through expiry without a successful renewal, the exact coverage pauses through a controlled command. Later recovery can restore billing `CURRENT` and paid-through, but coverage resume is a separate controlled readiness check. Live Guard activation remains disabled.

## Included expiry

Included coverage remains `INCLUDED`, billing `NOT_REQUIRED`, no paid entitlement, no paid-Guard discount and no subscription by default. The included offer never creates a Stripe subscription and never silently converts to paid.

At `included_end_at`, if the customer has taken no separate paid action, included coverage ends. No Stripe object is created. No charge occurs. No customer debt is created.

Reminder obligations are modelled with a versioned policy. Default live policy is disabled/unconfigured. Tests may inject offsets. Daily reconciliation can create due reminder records when a policy exists. Step 11 delivery remains disabled, so no reminder email is sent and no `SEND_EMAIL` is enqueued. Reminder readiness is Admin-visible only.

## Included-to-paid continuation

Continuation requires a separately accepted Step 13 `RELAUNCH_GUARD` order for the exact location, explicit recurring consent, a secure customer action and Stripe subscription setup.

Historical `INCLUDED` coverage is not mutated into paid coverage. `public.guard_continuations` and coverage origin `INCLUDED_CONTINUATION` record the handoff. `trialing` is not paid entitlement. Paid Guard discount eligibility begins only from actual paid/direct activation.

When the first paid continuation invoice succeeds, historical included coverage ends and a new `DIRECT_GUARD` continuation coverage is created for the same customer/business/location. If that invoice fails, included coverage still ends at the agreed included end and no paid coverage is fabricated.

## Cancellation

Cancellation is per subscription/location.

- Normal path: persist the request, use a durable provider operation, then `cancel_at_period_end = true`. Coverage stays active through already-paid `paid_through_at`.
- Undo: `cancel_at_period_end = false` only before provider period end, for the same customer/location/subscription. An already canceled Stripe subscription is not resurrected.
- Immediate cancellation is exceptional. No refund amount is decided automatically. Admin/Finance review and fresh Admin authentication are required.

## Refunds and credits

`public.guard_billing_adjustments` and `public.guard_refunds` are first-class auditable records. There is no automatic pro-rata refund formula, no hidden default percentage and no automatic refund merely because coverage paused.

Admin may approve a specific integer minor-unit amount only after fresh authentication. The amount must be `> 0`, `<=` refundable paid amount and pinned to the exact location subscription/invoice/payment. A submitted refund is not succeeded. A failed refund remains visible and owned. Full refund plus overlapping service credit for the same period is denied without explicit checked accounting.

`SERVICE_CREDIT` stays `APPROVED` / `PENDING_APPLICATION` and is not claimed as financially applied, because exact per-subscription Stripe customer-balance scoping cannot be guaranteed.

## Price-change acceptance

Existing subscriptions stay on their accepted price. A newly approved website/catalogue price does not automatically increase existing customers. `public.guard_price_change_offers` plus `GUARD_PRICE_CHANGE_ACCEPTANCE` require a positive customer accept. No response is not acceptance. After acceptance, the new provider Price is scheduled for the next renewal with quantity 1 and no mid-period proration. The same acceptance workflow is used for lower prices.

## Disputes

`public.guard_disputes` tracks provider dispute state. An open dispute is urgent Finance work. No automatic refund is issued. Already-paid entitlement is not silently rewritten. At paid-through expiry, normal entitlement rules apply.

## Daily reconciliation

Job type `RECONCILE_GUARD_BILLING` reuses the existing Step 10 worker. Cron stays `0 4 * * *`. At most one reconciliation run per UK service date. Mismatches are persisted and not silently overwritten. Included expiry and paid-through pause are enforced here.

## Provider and webhooks

The existing `/api/webhooks/stripe` raw-signature endpoint and `PROCESS_STRIPE_EVENT` job are reused. No second webhook endpoint. Stripe SDK remains `22.6.2` / `2026-08-26.dahlia`. `sk_live_*` and `rk_live_*` remain impossible in `stripe_test`. Deployed environments stay `PAYMENTS_PROVIDER_MODE=disabled`.

## Security

All new public billing/subscription tables have RLS enabled. No direct table CRUD for `PUBLIC`, `anon`, `authenticated` or `service_role`. Reviewed `SECURITY DEFINER` RPCs use a fixed `search_path`, revoke `PUBLIC` / `anon` / `authenticated`, and grant `service_role` execute only. Admin money actions require Admin session, fresh auth, expected record version, UUID idempotency and a bounded reason.

## Feature gates

Server-only `GUARD_SUBSCRIPTIONS_ENABLED` and `GUARD_REFUNDS_ENABLED` default disabled. Do not use `NEXT_PUBLIC_*`. Do not configure them in Vercel. When disabled, read-only Admin data may render and provider mutation endpoints fail closed. `GUARD_ACTIVATION_ENABLED` remains disabled/unset.

## Out of scope

- applying this migration
- Stripe Dashboard / secrets / live objects
- money movement
- live Guard activation
- Step 11/12 live mail
- Step 17 checks
- Step 18 alerts
- Cron changes
