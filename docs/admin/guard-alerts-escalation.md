# Guard alerts, escalation and linked cases — Step 18

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / LIVE ALERTS & NOTIFICATIONS DISABLED**

The additive migration is `supabase/migrations/20260930222821_guard_alerts_escalation_v1.sql`. ChatGPT will independently review it before anything touches Supabase. Do not apply this migration from this PR. Do not request Supabase credentials. Do not create a second Step 18 migration. Do not modify applied migrations, including Step 17 `20260930203750_guard_manual_checks_v1.sql`.

Step 17 remains the observation authority. It produces immutable observations (`HEALTHY`, `CHANGE_DETECTED`, `PROFILE_UNAVAILABLE`, `INCOMPLETE`) with `attention_candidate`. It does not create alerts. No production monitoring schedule exists. `GUARD_CHECKS_ENABLED` remains unset, so production has no live observations.

## What this step delivers

- internal alert review for one unresolved episode per exact Guard coverage
- duplicate suppression: later attention candidates attach to the open episode
- human review, acknowledgement, dismissal, resolution
- severity and manual escalation (no automatic severity, no invented SLA)
- approved customer email that reuses Step 11 communications
- contact-recovery and access-recovery service actions
- Admin-controlled pause for recovery
- resume only when current Step 15 readiness holds
- explicit intervention-case create/link with no financial artefacts
- paid-Guard discount assessment only (no automatic snapshot)

## Feature gates

Server-only, default disabled, never `NEXT_PUBLIC_*`, not configured in Vercel:

- `GUARD_ALERTS_ENABLED`
- `GUARD_ALERT_NOTIFICATIONS_ENABLED`

When `GUARD_ALERTS_ENABLED` is unset, false or malformed:

- Step 17 completion does not invoke alert processing
- the worker does not enqueue `MAINTAIN_GUARD_ALERTS`
- no alert, service-action, communication, case, quote, order or coverage mutation
- read-only Admin pages may render and must say **Guard alerts are not enabled**

When `GUARD_ALERT_NOTIFICATIONS_ENABLED` is false, customer alert email cannot be queued and no Step 18 `SEND_EMAIL` job is created. Queueing still requires existing Step 11 gates (`COMMUNICATIONS_SEND_ENABLED` and provider-mode controls). Step 18 never bypasses them.

Resume additionally requires `GUARD_ACTIVATION_ENABLED === "true"` in application code. Both activation and alert gates are currently unset, so live reactivation remains impossible.

## Alert episode model

`public.guard_alerts` is one unresolved monitoring incident for one exact coverage/location.

States: `NEW`, `ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`. `ESCALATED` is not a lifecycle state. Escalation is history and severity on an unresolved alert.

Severity: `UNASSESSED`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. NEW alerts begin `UNASSESSED`. Humans set severity. Step 17 change codes never auto-assign business severity.

Disposition: `PENDING_REVIEW`, `CONFIRMED_CUSTOMER_ISSUE`, `INTERNAL_ONLY`, `FALSE_POSITIVE`. NEW begins `PENDING_REVIEW`.

Terminal states are `RESOLVED` and `DISMISSED`. They cannot be reopened. A later genuine attention candidate creates a new episode.

Allowed database transitions are only `NEW → NEW|ACKNOWLEDGED|DISMISSED`, `ACKNOWLEDGED → ACKNOWLEDGED|RESOLVED`, and same-state updates on terminal rows. `NEW → RESOLVED` and `ACKNOWLEDGED → DISMISSED` are rejected. Same-state updates remain valid for attaching observations, severity, notifications and case-pointer bookkeeping. `linked_primary_case_id` can change only from NULL to an existing PRIMARY `guard_alert_cases` row and is then immutable. Later `issue_codes` updates must equal the distinct union of attached observation snapshots.

Partial unique invariant: at most one alert in `NEW` or `ACKNOWLEDGED` per `coverage_id`. This is the primary duplicate-suppression boundary.

## Observation attachment

`public.guard_alert_observations` is append-only. `observation_id` is unique. An observation belongs to only one episode. Scope is validated from the coverage and obligation, not caller-supplied identity.

Only completed Step 17 observations with `attention_candidate = true` enter processing.

- `HEALTHY` never creates or attaches to an alert
- `CHANGE_DETECTED` and `PROFILE_UNAVAILABLE` may create or attach
- `INCOMPLETE` may open internal review only; it cannot become customer-notifiable until later valid customer-issue evidence exists

Repeated processing of the same observation reuses the same relationship. Additional issue codes attach to the same open alert and set `needs_review=true`. They do not send another email, create another case, or create another charge.

A later `HEALTHY` observation is recovery evidence on the detail timeline. It does not auto-resolve the alert or auto-email a resolution.

## Human review

Acknowledgement requires exact version, `NEW` state, severity, disposition and a bounded reason.

- `FALSE_POSITIVE` may go directly to `DISMISSED`
- `INTERNAL_ONLY` may be acknowledged or resolved; customer notification, intervention-case creation and discount qualification are denied
- only `CONFIRMED_CUSTOMER_ISSUE` may notify, create/link a case, or be assessed for the paid-Guard discount
- `INCOMPLETE`-only evidence cannot become `CONFIRMED_CUSTOMER_ISSUE`
- `REVIEW_COUNT_INCREASED` alone cannot become `CONFIRMED_CUSTOMER_ISSUE`

Valid customer-issue evidence is `PROFILE_UNAVAILABLE`, or `CHANGE_DETECTED` with at least one customer-facing issue code. Acknowledgement, notification readiness, intervention-case readiness and discount assessment share that helper.

Customer-facing factual issue codes: `PROFILE_UNAVAILABLE`, `BUSINESS_NAME_CHANGED`, `REVIEW_COUNT_DECREASED`, `RATING_CHANGED`, `LATEST_REVIEW_CHANGED`.

Interpretation-only: `REVIEW_COUNT_INCREASED`, `OBSERVATION_INCOMPLETE`, `BASELINE_MISSING`.

When an acknowledged alert receives another attention observation, `needs_review` becomes true. Customer notification, case create/link and resolution stay blocked until Admin records `review_new_evidence`. Original `acknowledged_at` / `acknowledged_by` are preserved. Severity still changes only through escalate/correct.

The alert stores the union of issue evidence. Original observation-level codes are not rewritten.

## Severity and escalation

No automatic severity guess and no invented acknowledgement/escalation SLA. Step 20 owns service hours.

`escalate` moves only upward after acknowledgement. Reason is required. `escalation_count` and `last_escalated_at` are updated. Events are immutable.

A downward correction is a distinct `correct_severity` operation with an audit reason. Severity is never silently lowered. `CRITICAL` cannot escalate further. Terminal alerts cannot escalate.

## Immediate processing and daily repair

After a successful Step 17 observation completion, if `GUARD_ALERTS_ENABLED === "true"`, Admin calls `guard_process_alert_candidate_v1`. Step 17 completion remains authoritative if Step 18 processing fails. The observation is not rolled back.

Daily repair uses existing Step 10 worker job `MAINTAIN_GUARD_ALERTS`. No second Vercel Cron. Cron remains `0 4 * * *`. When the alert gate is disabled, the worker does not even enqueue the job.

Maintenance is bounded and continuation-safe. Each call processes a limited batch of unprocessed candidates, unrecorded delivery failures, and coverages that still need a recovery action. The worker repeats the RPC until `hasMore` is false. Retry remains idempotent. No second Cron.

The processor is idempotent and concurrency-safe. Coverage and observation advisory locks plus the one-open-alert unique index prevent duplicate unresolved episodes.

## Communications

Do not build a second mail system. Guard alert email reuses `public.communications`, reviewed content, `SEND_EMAIL`, delivery events, Resend webhook state and suppression.

`guard_alert_id` is a new parent. The parent constraint is case XOR monitoring request XOR guard alert. Historical case and monitoring communications are unchanged. Snapshot protection includes `guard_alert_id`.

Template `GUARD_ALERT` v1 is additive. Existing template versions are not modified.

Subject: `Relaunch Guard update for {location_name}`

Body: `{fact}` / `{effect}` / `{next_step}`

Reviewed/queued content must contain no unresolved `{placeholder}` text. The template does not claim guaranteed suspension, review removal, automatic restoration, an authorised charge, a submitted case, or monitoring that was not performed.

## Notification approval

INITIAL and FOLLOW_UP may be prepared only while the alert is `ACKNOWLEDGED`, `CONFIRMED_CUSTOMER_ISSUE`, `needs_review` is false, severity is assessed, a current verified email exists, the address is not suppressed, and coverage/location scope is valid. RESOLUTION may be prepared only after the alert is `RESOLVED`. A resolution message cannot be sent before the alert is resolved, and INITIAL/FOLLOW_UP cannot be created against a resolved alert.

No observation automatically sends customer email.

`public.guard_alert_notifications` stores the immutable link. Kinds: `INITIAL`, `FOLLOW_UP`, `RESOLUTION`. At most one INITIAL per episode. FOLLOW_UP and RESOLUTION require a new explicit Admin approval and reason.

At review/queue time the current customer email, current verification and suppression are re-read. A changed email denies queue and requires a new draft. A suppressed/bounced address is denied. An old verified address is never used silently.

Queueing requires both Step 18 notification and Step 11 send gates. Duplicate queue does not create a second `SEND_EMAIL` outbox row.

## Bounce and service actions

When a Guard-alert communication becomes `BOUNCED`, `COMPLAINED`, `SUPPRESSED` or permanently `FAILED`, create or reuse one unresolved `CONTACT_RECOVERY` action. Do not automatically resend. Webhook replay does not create a second action.

If a currently verified phone exists: reason `EMAIL_FAILED_PHONE_AVAILABLE`. If not: `NO_REACHABLE_VERIFIED_CONTACT`. This is the visible service action for bounce plus missing phone.

Do not send SMS, place a call, or invent a phone provider.

Daily maintenance also creates or reuses `ACCESS_RECOVERY` when current Manager/Owner access is no longer verified, using existing `admin_private.guard_access_record_v1`. A wrong-location access record does not satisfy recovery.

`public.guard_service_actions` allows at most one unresolved action per coverage + kind. States: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `CANCELLED`. Resolving an alert does not silently close recovery actions.

## Pause and resume

Customer communication failure does not silently stop service. Pause is an explicit Admin action.

`pause_for_recovery` is allowed only when coverage is `ACTIVE` and current facts show no verified contact or no verified Manager/Owner access. It requires Admin session, expected version, UUID idempotency key, bounded reason and the exact service action.

Transition is `ACTIVE → PAUSED` through the existing Guard transition. It must not change `activated_at`, included period timestamps, paid-through or subscription state.

Resume must not blindly set `PAUSED → ACTIVE`. Current facts required: verified email or phone, verified Manager/Owner access, active Guard permission, verified business membership, VERIFIED/AVAILABLE baseline, active rota, valid commercial basis, valid Direct billing entitlement or still-valid Included period. `admin_private.guard_alert_resume_ready_v1` evaluates Step 15/16 readiness while the coverage is `PAUSED` and additionally requires the Included period to be current.

Resume preserves `activated_at` and included timestamps. The original activation clock does not restart.

## Linked cases

`create_intervention_case` and `link_existing_case` are allowed only when the alert is `ACKNOWLEDGED` and `CONFIRMED_CUSTOMER_ISSUE`. Scope must match customer, business and location. Case type is explicit: `PROFILE_RECOVERY` or `REVIEW_PROTECTION`. No automatic inference from one change code.

Created cases use existing public-ref generation, `source = GUARD_ALERT`, a bounded factual summary, `service_track = UNDECIDED`, `work_stage = INITIAL_REVIEW`, and no commercial decision. `privacy_accepted_at` stays NULL. `information_accurate_at` is the earliest valid customer-issue observation time. CLOSED and CANCELLED cases cannot become the active PRIMARY intervention case.

At most one PRIMARY intervention case per alert. Multiple alerts may link to the same suitable case when scope matches and Admin chooses it.

Case create/link must not create a quote, quote version, acceptance, service order, payment consent, payment obligation, success-fee approval, subscription, PaymentIntent, Checkout, invoice, provider operation or charge. It must not change Guard subscription, billing state or paid-through. It must not create `quote_discount_snapshots`.

## Discount assessment

Reuse `admin_private.paid_guard_discount_ready_v1` and policy `PAID_GUARD_MANAGED_20`. Do not reimplement the maths.

Eligibility uses the earliest valid customer-issue observation time from the shared evidence helper. `INCOMPLETE` and `REVIEW_COUNT_INCREASED`-only evidence cannot establish `issueObservedAt`.

Included Guard, Guided service, issues before paid coverage, and wrong location are not eligible. The assessment itself creates no snapshot. Later quote preparation still uses `admin_quote_command_v1(... record_qualification ...)`.

## Admin UI

`/guard/alerts` and `/guard/alerts/[alertId]` sit in the existing Guard area.

Queues: New review, Acknowledged, High/Critical, Needs review again, Contact recovery, Access recovery, Resolved recently. Queries are bounded (default 50, max 100) with stable cursors. Invalid cursors are rejected.

Detail shows the observation timeline, alert events, current contact/access, linked case, discount assessment, communication/delivery state and service actions.

Delivery status is factual only: Draft, Reviewed, Queued, Provider accepted, Delivered, Bounced, Suppressed, Failed. Provider accepted is not delivered. Queued is not sent.

Buttons match database-permitted actions. Alert `ACKNOWLEDGED` means internal Admin review, not a customer acknowledgement. Inbound Step 12 replies do not automatically resolve the alert.

## Security

All new public Step 18 tables have RLS enabled. Direct CRUD is denied to PUBLIC, anon, authenticated and service_role. Public SECURITY DEFINER RPCs use `search_path=''`, revoke PUBLIC/anon/authenticated, and grant service_role execute only. Admin-facing RPCs validate the Admin session internally.

Audit uses existing `GUARD_CHANGED` for acknowledgement, severity change, escalation, dismissal, resolution, notification review/queue, case link/create, pause, resume and recovery-action changes.

## Out of scope

- applying this migration
- requesting Supabase credentials
- enabling `GUARD_ALERTS_ENABLED`, `GUARD_ALERT_NOTIFICATIONS_ENABLED`, `GUARD_CHECKS_ENABLED` or `GUARD_ACTIVATION_ENABLED`
- enabling Stripe, Step 11 live sending, Step 12 inbound, Resend or Google API
- inventing alert SLAs
- Step 19 global reporting, Step 20 settings, Step 21 Google integration
- changing Cron from `0 4 * * *`
