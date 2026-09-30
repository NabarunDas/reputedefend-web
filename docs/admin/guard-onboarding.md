# Guard onboarding and activation — Step 15

Status: **DATABASE APPLIED / LIVE GUARD DISABLED**

The additive migration `20260930164529_guard_onboarding_activation_v1.sql` is applied to `profilerelaunch-dev` exactly once after Step 14 as `20260930164529 guard_onboarding_activation_v1`. Live migration history now continues with independently applied `20260930180050 guard_subscriptions_billing_v1`. Step 15 exists remotely exactly once. Do not replay it. Do not create another Guard onboarding migration. Do not modify the applied SQL.

This step implements the Guard onboarding and per-location activation foundation. Step 16 subscription schema exists separately as applied `20260930180050_guard_subscriptions_billing_v1.sql` and remains STRIPE & GUARD LIVE DISABLED. This applied Step 15 migration is not rewritten. Step 17 twice-daily checks and Step 18 alerts are not implemented.

Step 11 outgoing mail remains disabled. Step 12 incoming mail remains disabled. Step 14 Stripe remains disabled. Worker cadence remains 86400 seconds. Current Vercel Cron remains `0 4 * * *`. No Stripe subscription is created. Live Guard monitoring is not enabled. `GUARD_ACTIVATION_ENABLED` was not configured during the rollout and remains unset.

## Independent live verification

Independent live verification confirmed:

- Step 15 migration count = 1
- Guard schema is present: `guard_onboarding_locations`, `guard_coverages`, `guard_coverage_events`, `guard_billing`, `guard_included_offers`, `guard_permissions`, `guard_baselines`, `guard_rota_assignments`, `guard_activation_exceptions`, and private Guard command receipts
- RLS is enabled on all new public Guard tables
- Direct table SELECT / INSERT / UPDATE / DELETE is denied for anon, authenticated and service_role
- The application remains RPC-only
- service_role EXECUTE is available on reviewed public functions including `admin_guard_command_v1`, `admin_guard_list_v1`, `guard_coverage_readiness_v1`, `customer_action_session_v1`, `customer_action_command_v1` and `admin_quote_command_v1`
- `admin_private.guard_set_billing_entitlement_v1` is not executable by service_role
- Live constraints verified: pre-activation states require `activated_at IS NULL`; ACTIVE / PAUSED / ENDING / ENDED keep historical `activated_at`; included 30-day period is pinned to activation; one non-ended coverage per location; one unresolved OPEN/ACKNOWLEDGED activation exception per coverage; `quote_discount_snapshots.future_coverage_id` has a real FK to `guard_coverages`; paid Guard discount qualification is backed by authoritative coverage/billing logic
- Current live Step 15 business data is empty: 0 onboarding mappings, coverages, billing rows, included offers, permissions, baselines, rota assignments, activation exceptions and Guard-linked discount snapshots
- Existing live intake is also empty: 0 monitoring requests and 0 accepted Guard service orders, so the migration correctly produced no backfill rows
- No operational or payment side effects: 0 Step 14 payment jobs, no Stripe Customer / PaymentIntent / SetupIntent / Invoice / Subscription, no money moved, no Guard activation, no Step 17 monitoring jobs, no Step 18 alerts
- Supabase security advisors show no new Step-15-specific WARN/ERROR

## Database-ready but not live

These contracts exist in the applied database and Admin/Customer source. They are **not** live operational services:

- multi-location onboarding mapping
- Guard coverage state machine
- Guard billing-state contract
- included 30-day offer
- Guard customer permission
- Manager/Owner access readiness
- baseline
- rota
- activation readiness
- activation exceptions
- authoritative paid-Guard discount linkage

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

Activation is one atomic command. Direct Guard cannot activate until Step 16 supplies authoritative `CURRENT` paid entitlement with a still-valid provider paid-through date. Step 15 has no production route to fabricate `CURRENT`. Tests may seed that state through `admin_private.guard_set_billing_entitlement_v1`, which is not granted to `service_role`.

Included 30-day Guard can activate without a subscription only when all non-financial gates pass: accepted eligible offer, billing state `NOT_REQUIRED`, and the operational onboarding gates. The 30 days start at actual Guard activation (`activated_at`), not recovery completion, offer creation, customer acceptance, or permission acceptance. There is no automatic paid conversion. No recurring Stripe subscription exists.

Live Guard activation remains disabled by the server-only feature gate `GUARD_ACTIVATION_ENABLED`. Unset, `false`, and any unrecognised value keep activation fail-closed. Do not set `NEXT_PUBLIC_GUARD_ACTIVATION_ENABLED`. Do not configure the flag in Vercel in this step.

`activated_at` is written once and kept for `ACTIVE`, `PAUSED`, `ENDING`, and `ENDED`. Pre-activation states must have a null activation timestamp. State jumps are database-validated. `READY_TO_ACTIVATE -> ACTIVE` requires the controlled activation command.

Direct mapping readiness requires `READY_FOR_ONBOARDING`. `IDENTIFIED` is not enough. Request-scoped identify cannot exceed `number_of_locations`. Only an `AVAILABLE` + `VERIFIED` baseline satisfies activation. `PAID_NOT_READY` is only for paid Direct Guard with current provider entitlement. Unresolved activation exceptions are `OPEN` or `ACKNOWLEDGED`; successful activation resolves them.

New `PAID_GUARD_MANAGED_20` qualifications must pin `quote_discount_snapshots.future_coverage_id` to an authoritative ACTIVE Direct Guard coverage with current provider billing. Included coverage cannot qualify. Historical snapshots stay as written.

The first planned monitoring marker is symbolic: `MORNING` on the next Europe/London service date. It is not a clock-time SLA. No Step 17 twice-daily checks exist. No Step 18 alerts exist.

If billing entitlement is ready and other gates fail, activation stays inactive and opens an urgent exception.

There is no Admin **Mark Guard paid** control and no coverage-state picker.

## Customer permission

`GUARD_PERMISSION` reuses the existing hashed-secret, OTP, verified-identity customer-action architecture. Opening the link or completing OTP is not acceptance. The customer must accept the exact `GUARD_PERMISSION_V1` wording. For included Guard that acceptance also records the 30-day choice.

## Out of scope

- enabling live subscriptions or rewriting this applied Step 15 migration after independently applied Step 16
- twice-daily check jobs or exact clock-time SLAs
- alert sending
- live monitoring
- enabling `GUARD_ACTIVATION_ENABLED`
- Cron changes
- replaying or rewriting this applied migration
