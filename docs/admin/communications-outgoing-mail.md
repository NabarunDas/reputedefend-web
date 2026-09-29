# Communications ledger and outgoing mail — Step 11

Source-only. The additive migration is `20260929210000_communications_outgoing_mail_v1.sql`. It is not remotely applied. No Resend webhook is configured. `JOB_PROVIDER_MODE` remains `disabled`. No real customer email is sent from this PR.

**Live outgoing customer email is blocked until the production worker can run at an operationally acceptable cadence.**

The current Admin Cron remains `0 4 * * *` (Hobby-compatible, once daily). Do not change it to five minutes in this step. Do not send email synchronously from the Admin browser request.

Step 10 is COMPLETE / LIVE-TESTED. Applied migration: `20260929183214_jobs_outbox_operational_health_v1.sql`.

## Purpose

Establish the durable communications model:

- reviewed outbound customer email
- immutable recipient/content snapshots
- versioned templates
- transactional queue onto the Step 10 outbox
- `SEND_EMAIL` jobs with a stable provider idempotency key
- provider acceptance separate from delivery
- append-only delivery events
- signed Resend webhook intake (unconfigured)
- conservative bounce/complaint/suppression rules

The working marketing enquiry path is unchanged. Homepage/contact intake still persists first, then uses the existing Resend enquiry provider and `SENT` / `FAILED` / `UNKNOWN` notification outcomes. It is not routed through `SEND_EMAIL`.

## Legacy `public.communications`

Existing rows keep `PENDING` / `SENT` / `FAILED`. `SENT` remains provider acceptance from intake delivery. It is not shown as “Delivered”. New lifecycle and delivery columns stay null on those rows.

## Lifecycle and delivery

Workflow (`lifecycle`): `DRAFT` → `REVIEWED` → `QUEUED`, or `CANCELLED`.

Delivery (`delivery_status`): `NONE` → `PROVIDER_ACCEPTED` → `DELIVERED`, or `BOUNCED` / `COMPLAINED` / `SUPPRESSED` / `FAILED`.

Provider accepted is not delivered. Admin labels accepted Resend API calls as “Accepted by email provider”.

## Templates

`admin_private.communication_templates` is versioned and immutable. Editing later means inserting a new version. Each communication snapshots `template_key`, `template_version`, recipient, subject, plain text and HTML.

First templates:

- `EVIDENCE_REQUEST` — approved wording with `{case_ref}`, `{specific_document}` and a server-built CASE_ACCESS URL
- `CASE_UPDATE` — reviewed `{fact}` `{effect}` `{next_step}`

Unresolved placeholders fail closed. Browser HTML is rejected. The upload URL comes from an existing open, unexpired `CASE_ACCESS` action plus `CUSTOMER_ORIGIN`. If that action is missing or expired, draft/queue fail closed.

## Queue contract

`admin_communication_command_v1` `queue` is one PostgreSQL transaction:

1. validate reviewed, locked snapshot
2. refuse browser-supplied recipient/subject/body changes
3. set `QUEUED`
4. insert outbox topic `SEND_EMAIL` with event key `send-email:{id}:v{content_version}`
5. write `COMMUNICATION_CHANGED` audit

A rollback leaves neither a queued communication nor a job.

## SEND_EMAIL

The job payload is `{ communicationId, contentVersion }` only. The provider idempotency key is the outbox event key and stays stable across retry, lease recovery, crash and dead-letter replay.

The Resend adapter sends that key as `Idempotency-Key`. It is registered only when `JOB_PROVIDER_MODE=production` and `VERCEL_ENV=production`. Disabled/Preview/local produce no email.

After the provider accepts, the worker records `PROVIDER_ACCEPTED` and then completes the job. A crash between those steps retries the same key; the fake provider recognises it and does not create a second external effect.

## Webhooks

`POST /api/webhooks/resend` verifies the Svix signature against `RESEND_WEBHOOK_SECRET`. Missing secret or invalid signature fails closed. The raw body is used for verification. Duplicate `svix-id` values are idempotent. Unknown event types are stored and do not change delivery state.

Handled types: `email.delivered`, `email.bounced`, `email.complained`, `email.suppressed`.

## Retry rules

- Transient failure before acceptance: durable job retry
- Provider accepted: do not send another email; reconcile with the stable key
- Delivered: never retry
- Hard bounce / complaint / suppression: never blindly retry the same address
- A later verified address requires a new communication; the original recipient snapshot stays

## Admin UI

`/communications` lists lifecycle, delivery, timestamps, provider reference and recent events. Draft → review → queue. No raw webhook JSON. No arbitrary browser HTML.

## Not in this PR

- Remote application of the Step 11 migration
- Resend webhook configuration
- `JOB_PROVIDER_MODE=production`
- Cron cadence change
- Stripe, incoming mail, Google API, Guard automation
- `PREPARATION` / `READY_TO_SUBMIT`
