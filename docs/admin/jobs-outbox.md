# Jobs, outbox and operational health — Step 10

Source-only. The additive migration is `20260929180000_jobs_outbox_operational_health_v1.sql`. It is not remotely applied. `CRON_SECRET`, `JOB_WORKER_ENABLED` and `JOB_PROVIDER_MODE` are not configured by this PR. The production worker is not enabled. There are no live Resend, Stripe or Google adapters.

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
6. Retryable failures become `RETRY` with deterministic backoff (1m / 5m / 15m / 60m). Exhausted or permanent failures become `DEAD_LETTER`.
7. Admin may replay only `DEAD_LETTER` jobs after a fresh 5-minute sign-in. Replay keeps the same job id and idempotency key.

A business rollback also rolls back the outbox insert.

## Job types

Step 10 registers only `SYSTEM_HEALTH_PROBE`. It has no external side effect. Admin queues it with `admin_enqueue_job_probe_v1`. Arbitrary job types and payloads cannot be submitted from the Admin UI.

## Cron

Admin Root Directory is `apps/admin`, so `apps/admin/vercel.json` registers:

`GET /api/internal/jobs/run`

The source schedule is `0 4 * * *` (once daily). Vercel Hobby/preview rejects expressions that run more than once per day, so the 5-minute cadence cannot be stored in this file until the Admin project is on a plan that allows it. The intended production cadence remains every 5 minutes (`*/5 * * * *`).

The route requires `Authorization: Bearer ${CRON_SECRET}`. Missing `CRON_SECRET` fails closed. Preview/local never process jobs. Production processes jobs only when `JOB_WORKER_ENABLED=true`. The worker is fail-closed even if Cron invokes the route.

Do not set those environment variables from this PR. Do not activate production Cron from Cursor.

## Provider mode

`JOB_PROVIDER_MODE` is `disabled` | `mock` | `production`. Production mode is rejected unless `VERCEL_ENV=production`. Production credentials must never be read by Preview/local adapters. No provider secrets are introduced here.

## Admin UI

`/operations/jobs` shows heartbeat status (HEALTHY / LATE / NEVER_RUN), queue counts, recent jobs and dead-letter replay. Raw payloads are not shown.

## Later work

Outgoing customer email is Step 11. Stripe, Google APIs and monitoring jobs remain later. Do not use this worker to enable `PREPARATION` or `READY_TO_SUBMIT`.
