# Guard onboarding and activation — Step 15

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / LIVE GUARD DISABLED**

The additive migration `20260930164529_guard_onboarding_activation_v1.sql` is source-only. Do not apply it from this PR. ChatGPT will independently review the migration before it is applied. Do not create a second corrective migration while this file remains unapplied. Do not modify already-applied migrations.

This step implements the Guard onboarding and per-location activation foundation. It does not implement Step 16 subscriptions/refunds, Step 17 twice-daily checks, or Step 18 alerts.

Step 11 outgoing mail remains disabled. Step 12 incoming mail remains disabled. Step 14 Stripe remains disabled. Current Vercel Cron remains `0 4 * * *`. No Stripe subscription is created. Live Guard monitoring is not enabled.

## What this is

A `monitoring_request` remains intake history. `number_of_locations` is only what the customer requested. A request for 10 locations does not create 10 location rows, service orders, subscriptions, or active coverages. Backfill and new intake create exactly one `INTAKE_PRIMARY` mapping for the existing primary `location_id`. Admin and the customer must identify any further locations individually.

Coverage is first-class and separate from intake:

- `public.guard_onboarding_locations`
- `public.guard_coverages`
- append-only `public.guard_coverage_events`
- separate `public.guard_billing`
- immutable included-offer records
- customer `GUARD_PERMISSION` actions
- versioned baselines
- rota assignments with symbolic `MORNING` / `EVENING` windows
- activation exceptions

Do not treat `monitoring_requests` as the coverage table. Do not create Guard cases.

## Activation contract

`public.guard_coverage_readiness_v1` is the canonical projection. The database command is authoritative. Admin UI only displays it.

Activation is one atomic command. Direct Guard requires an accepted `RELAUNCH_GUARD` order and billing state `CURRENT` with a still-valid provider paid-through entitlement. Step 15 has no production route to fabricate `CURRENT`. Tests may seed that state through `admin_private.guard_set_billing_entitlement_v1`, which is not granted to `service_role`.

Included coverage requires an accepted eligible 30-day offer and billing state `NOT_REQUIRED`. The 30 days start at `activated_at`, not offer creation, customer acceptance, or recovery completion. There is no automatic paid conversion.

If billing entitlement is ready and other gates fail, activation stays inactive and opens an urgent exception.

There is no Admin **Mark Guard paid** control and no coverage-state picker.

## Customer permission

`GUARD_PERMISSION` reuses the existing hashed-secret, OTP, verified-identity customer-action architecture. Opening the link or completing OTP is not acceptance. The customer must accept the exact `GUARD_PERMISSION_V1` wording. For included Guard that acceptance also records the 30-day choice.

## Out of scope

- Stripe subscriptions, renewals, cancellation, refunds, paid-through entitlements
- twice-daily check jobs or exact clock-time SLAs
- alert sending
- live monitoring
- Cron changes
- applying this migration
