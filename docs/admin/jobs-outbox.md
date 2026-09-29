# Jobs, outbox and operational health — Step 10

The additive migration is applied remotely as `20260929183214_jobs_outbox_operational_health_v1.sql`. Production worker configuration is live with `JOB_WORKER_ENABLED=true`, `JOB_PROVIDER_MODE=disabled`, `JOB_WORKER_CADENCE_SECONDS=86400`, and a protected `CRON_SECRET`. The Hobby-compatible daily Cron has been manually invoked once for live acceptance. No live Resend, Stripe or Google adapters are enabled.

Step 9 is LIVE-TESTED COMPLETE, including `authorizationReady=true` on PR-26-6CKR5M, published-pack View/Download, and customer evidence upload → GuardDuty → Admin accept → fulfil. `PREPARATION` / `READY_TO_SUBMIT` remain blocked.

## Purpose

Later steps (outgoing email, payments, Google, monitoring) need a reusable background-work foundation:

- transactional PostgreSQL outbox
- durable jobs with leases
- retry/backoff and dead-letter
- append-only attempt history
- worker heartbeat
- Admin replay of dead letters
- environment-safe provider adapters

## Lifecycle

1. A domain command inserts an outbox row in the same transaction as the business mutation (`admin_private.enqueue_outbox_v1`).
2. The scheduled worker promotes available outbox rows to jobs (`job_promote_outbox_v1`) using `FOR UPDATE SKIP LOCKED`.
3. The worker claims a bounded batch (`job_claim_batch_v1`), issuing a fresh `lease_token` (2 minutes).
4. The adapter runs with the job’s stable `idempotency_key`.
5. The worker completes or fails using that exact lease token.
6. Retryable failures become `RETRY` with deterministic backoff (1m / 5m / 15m / 60m). Those timestamps are eligibility times. With the current once-daily scheduler, actual processing may happen later than `scheduled_at`. Do not rewrite retry delays to one day.
7. An expired `RUNNING` lease is reclaimed only when `attempts < max_attempts`. If `attempts >= max_attempts`, the job becomes `DEAD_LETTER` without a phantom extra attempt. `attempts` never exceeds `max_attempts`.
8. Admin may replay only `DEAD_LETTER` jobs after a fresh 5-minute sign-in. Replay keeps the same job id and idempotency key.

A business rollback also rolls back the outbox insert.

## Job types

Step 10 registers only `SYSTEM_HEALTH_PROBE`. It has no external side effect. Admin queues it with `admin_enqueue_job_probe_v1`. Arbitrary job types and payloads cannot be submitted from the Admin UI.

## Cron

Admin Root Directory is `apps/admin`, so `apps/admin/vercel.json` registers:

`GET /api/internal/jobs/run`

The source schedule is `0 4 * * *` (once daily). Vercel Hobby/preview rejects expressions that run more than once per day, so do not change this file to `*/5 * * * *` in this PR.

Current Hobby-compatible test mode:

- Vercel Cron = once daily
- `JOB_WORKER_CADENCE_SECONDS` defaults to `86400`
- heartbeat stores `expected_interval_seconds=86400` and `late_after_seconds=93600` (26 hours)
- Admin health is HEALTHY until that stored late threshold, then LATE

Future operational production mode, before time-sensitive Step 11+ services:

- move the scheduler to a mechanism that can invoke about every five minutes
- if using Vercel Pro: `*/5 * * * *`
- set `JOB_WORKER_CADENCE_SECONDS=300`
- health late threshold becomes approximately 10 minutes (`300 + 300`)

Do not make that production-plan change now. Queue, lease, retry and dead-letter semantics stay the same whichever scheduler invokes the endpoint.

The route requires `Authorization: Bearer ${CRON_SECRET}`. Missing `CRON_SECRET` fails closed. Preview/local never process jobs. Production processes jobs only when `JOB_WORKER_ENABLED=true`. `JOB_WORKER_CADENCE_SECONDS` is server-only, must be a bounded integer, and is never read by browser code.

Production worker variables are now configured. The worker has been live-tested with a `SYSTEM_HEALTH_PROBE`; automatic scheduling remains daily on the current Hobby-compatible Cron.

## Provider mode

`JOB_PROVIDER_MODE` is `disabled` | `mock` | `production`. Production mode is rejected unless `VERCEL_ENV=production`. Production credentials must never be read by Preview/local adapters. No provider secrets are introduced here.

## Admin UI

`/operations/jobs` shows heartbeat status (HEALTHY / LATE / NEVER_RUN), the configured worker cadence, queue counts, recent jobs and dead-letter replay. Raw payloads are not shown. For the current daily Hobby-compatible scheduler the page notes that time-sensitive background work needs a more frequent production scheduler before customer communications, payments or monitoring are enabled.

## Later work

Outgoing customer email is Step 11. Stripe, Google APIs and monitoring jobs remain later. Do not use this worker to enable `PREPARATION` or `READY_TO_SUBMIT`.
