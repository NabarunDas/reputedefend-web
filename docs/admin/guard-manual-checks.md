# Guard manual checks — Step 17

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / LIVE MONITORING DISABLED**

The additive migration `20260930203750_guard_manual_checks_v1.sql` exists in source only after applied Step 16 `20260930180050_guard_subscriptions_billing_v1.sql`. It has not been applied. Do not apply it from this PR. Do not create another Step 17 migration. Do not modify already-applied SQL.

This step implements manual Guard monitoring checks: versioned Europe/London schedules, twice-daily MORNING/EVENING obligations, Admin claim/complete, immutable observations, baseline comparison, retries, missed/late history and handling-time metrics.

It does not implement Step 18 alerts or customer notifications. It does not implement Step 19 reporting, Step 20 settings, or Step 21 Google API automation.

## What is not approved yet

Exact production clock windows are not yet approved. The implementation plan still lists 09:00–11:00 and 17:00–19:00 Europe/London as an owner decision. Those times are fixture values only.

The schedule is versioned and configurable. No APPROVED production schedule is invented by this source. After Step 17 it is acceptable for production to have zero approved schedule versions. Live obligation generation then fails closed with `schedule_not_configured`.

Do not show invented times to customers. Admin queues show **Schedule not configured** until a later approved schedule exists.

## Launch gates

Two independent gates remain unset:

1. server-only `GUARD_CHECKS_ENABLED` (default disabled, not `NEXT_PUBLIC_*`, not configured in Vercel)
2. an APPROVED schedule version

When the feature flag is unset, false or malformed: the worker does not enqueue `MAINTAIN_GUARD_CHECKS`, no check outbox/job rows are created, and claim/complete fail closed. Read-only Admin views may render.

Even if the flag is later set true, generation still requires an approved schedule.

`GUARD_ACTIVATION_ENABLED`, `GUARD_SUBSCRIPTIONS_ENABLED` and `GUARD_REFUNDS_ENABLED` remain unset. Step 11 outgoing mail remains disabled. Step 12 incoming mail remains disabled. Cron remains `0 4 * * *`. Worker cadence remains 86400 seconds.

## Service date and DST

Europe/London is authoritative. Obligation uniqueness and reporting keys use the UK local service date, not the UTC date. Configured local windows are converted to UTC with timezone-database DST rules, never fixed offsets.

Tests may inject 09:00–11:00 and 17:00–19:00 to prove:

- spring clock change still creates exactly MORNING + EVENING
- autumn clock change still creates exactly MORNING + EVENING
- no extra or missing obligation because the UTC offset changed

## Weekends and bank holidays

Guard coverage includes weekends and bank holidays. Obligation generation never skips a UK service date merely because it is Saturday, Sunday or a bank holiday. Step 17 does not invent a holiday API.

## Obligations

`public.guard_check_obligations` is unique on `coverage_id + service_date + window_code`. Duplicate or concurrent `MAINTAIN_GUARD_CHECKS` runs reuse the same two rows. A third obligation for the same date is impossible.

Generation is only for coverage in `ACTIVE` with an active Step 15 rota assignment. `PAUSED`, `ENDING`, `ENDED` and pre-activation states are excluded. Stripe/subscription status is not a separate truth. Included ACTIVE Guard is generated like paid ACTIVE Guard.

A new obligation must reference an `APPROVED` schedule applicable to that service date (`effective_from <= service_date` and `effective_to` null or after the service date) and an `ACTIVE` rota for that coverage. Privileged inserts cannot use a DRAFT, future, expired, or RETIRED schedule, or a SUPERSEDED rota. The schedule and rota are snapshotted. Later retirement or rota supersession does not rewrite or invalidate historical obligations.

Admin cancellation is for obligations that are no longer operationally eligible. `PENDING` and `CLAIMED` rows on still-`ACTIVE` coverage return `coverage_still_active`. Cancellation events record the actual prior state. Technical failure uses FAIL/RETRY, not cancel.

## Claim, attempts, missed and late

Claim is atomic. Two concurrent claims produce one owner. A window cannot be claimed or completed before `window_start_utc`. A two-hour internal lease can expire; complete/fail/release then return `claim_expired` and the actor must reclaim. The abandoned attempt remains historical. Retry uses the same obligation and a new attempt. Failed attempts are not observations.

Missed is an immutable fact (`missed_at`), not a terminal state. On-time runs through exact `window_end_utc`. Missed and late both use `window_end_utc < clock`. A missed check can later complete late. Late completion stays late. `missed_at` is never cleared. A completed obligation with `missed_at` must be `late=true` and `seconds_late > 0`. Coverage that ceased to be ACTIVE before a window opens is cancelled with `coverage_not_active_before_window` and is not marked missed.

## Observations and baseline

Capture method is MANUAL only. One completed attempt produces one authoritative observation. Classification follows a fixed availability matrix: `AVAILABLE` may be `HEALTHY`, `CHANGE_DETECTED`, or `INCOMPLETE`; `UNAVAILABLE` must be `PROFILE_UNAVAILABLE`; `UNKNOWN` must be `INCOMPLETE`. `CHANGE_DETECTED` requires an available profile, the exact location, complete comparable facts, the VERIFIED/AVAILABLE baseline, `COMPARED` status, and at least one genuine bounded change. `PROFILE_UNAVAILABLE` cannot justify `CHANGE_DETECTED`. `AVAILABLE` observations classified `HEALTHY` or `CHANGE_DETECTED` require the complete operational set: correct location, displayed name, review count, valid profile URL, rating consistency, and the exact VERIFIED/AVAILABLE baseline. Missing comparison input is `INCOMPLETE`, not a fabricated business change. The comparison helper only compares facts that were genuinely captured, so a blank name or absent latest-review input cannot become `BUSINESS_NAME_CHANGED` or `LATEST_REVIEW_CHANGED`. Real captured review-count decreases remain visible. Rating may be explicitly not available. The Step 15 VERIFIED baseline remains the comparison authority and is never silently rewritten. Step 17 records bounded change candidates only. Step 18 will decide alerts.

Approved schedule attribution is authoritative: DRAFT has no approval or retirement facts; APPROVED requires `approved_at`/`approved_by` and no retirement facts; RETIRED requires `retired_at`/`retired_by`. Retiring a previously APPROVED schedule keeps the original approval facts and requires `effective_to`. A DRAFT may retire without approval, but retirement attribution is still required.

Operational lists are bounded (default 50, max 100) and return `hasMore`/`nextCursor`. Mixed TODAY ordering uses explicit window rank (`MORNING` before `EVENING`). A cursor that does not exist or belongs to another queue or service-date context returns `invalid_cursor`. The Admin queues expose a first-page / view-more path and do not fetch all history client-side. An expired claim shows Reclaim, not complete/fail/release. Another operator's live claim exposes no mutations. Cancel is shown only where coverage is no longer ACTIVE.

## Daily job

`MAINTAIN_GUARD_CHECKS` reuses the existing daily worker. It generates today's obligations, expires abandoned claims, marks missed windows and cancels pending work whose coverage is no longer ACTIVE. It does not send alerts or call Google. Cron stays `0 4 * * *`.

## Security

All new public Step 17 tables have RLS enabled. No direct CRUD for PUBLIC, anon, authenticated or service_role. Reviewed SECURITY DEFINER RPCs use a fixed `search_path`, revoke PUBLIC/anon/authenticated, and grant service_role execute only.

## Out of scope

- applying this migration
- approving or seeding production window times
- enabling `GUARD_CHECKS_ENABLED`
- Google API, scraping or browser automation
- customer email or Guard alerts
- Step 18, 19 or 20
- Cron changes
