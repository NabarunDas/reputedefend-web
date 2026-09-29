# Communications ledger and outgoing mail — Step 11

Source-only. The additive migration is `20260929210000_communications_outgoing_mail_v1.sql`. It is not remotely applied. No Resend webhook is configured. `JOB_PROVIDER_MODE` remains `disabled`. `COMMUNICATIONS_SEND_ENABLED` is not set. No real customer email is sent from this PR.

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
- explicit `ACCEPTANCE_UNKNOWN` when a provider call may have succeeded
- append-only delivery events with provider occurrence time
- signed Resend webhook intake (unconfigured)
- conservative bounce/complaint/suppression rules
- HMAC-derived `COMMUNICATION_ACCESS` upload links, rematerialised only in memory

The working marketing enquiry path is unchanged. Homepage/contact intake still persists first, then uses the existing Resend enquiry provider and `SENT` / `FAILED` / `UNKNOWN` notification outcomes. It is not routed through `SEND_EMAIL`.

## Live-mail activation gate

Queueing requires `communicationsSendEnabled()`:

- `VERCEL_ENV=production`
- `COMMUNICATIONS_SEND_ENABLED=true`
- `JOB_WORKER_ENABLED=true`
- `JOB_PROVIDER_MODE=production`
- valid `RESEND_API_KEY` and `COMMUNICATIONS_FROM_EMAIL`
- worker cadence of 300 seconds or faster

The current daily cadence cannot satisfy the gate. Admin therefore refuses Queue and does not insert a `SEND_EMAIL` outbox row. Do not configure `COMMUNICATIONS_SEND_ENABLED` in Vercel from this PR.

## Legacy `public.communications`

Existing rows keep `PENDING` / `SENT` / `FAILED`. `SENT` remains provider acceptance from intake delivery. It is not shown as “Delivered”. New lifecycle and delivery columns stay null on those rows.

## Lifecycle and delivery

Workflow (`lifecycle`): `DRAFT` → `REVIEWED` → `QUEUED`, or `CANCELLED`.

Delivery (`delivery_status`): `NONE` → `ACCEPTANCE_UNKNOWN` / `PROVIDER_ACCEPTED` → `DELIVERED`, or `BOUNCED` / `COMPLAINED` / `SUPPRESSED` / `FAILED`.

Provider accepted is not delivered. Admin labels accepted Resend API calls as “Accepted by email provider”.

`ACCEPTANCE_UNKNOWN` means the worker called the provider and did not learn whether the message was accepted (timeout or crash after the HTTP request). The first provider-attempt timestamp is stored. The same idempotency key may be retried only while that timestamp is less than 23 hours old. After the window, the worker makes zero provider calls, dead-letters, and Admin tells staff to reconcile against the provider. Generic dead-letter replay cannot bypass this check.

## Templates

`admin_private.communication_templates` is versioned and immutable. Editing later means inserting a new version. Each communication snapshots `template_key`, `template_version`, recipient, subject, plain text and HTML.

First templates:

- `EVIDENCE_REQUEST` — approved wording with `{case_ref}`, `{specific_document}` and a server-built upload URL
- `CASE_UPDATE` — reviewed `{fact}` `{effect}` `{next_step}`

Unresolved placeholders fail closed. Browser HTML is rejected.

## Secure evidence-request links

The snapshot stores `https://{customer-origin}/action/{action-id}` only. The `#t=` capability is never persisted in communications, jobs, outbox, audit, events, logs or Admin UI.

At draft time Admin generates a dedicated `COMMUNICATION_ACCESS` action (not a replacement `CASE_ACCESS`). The plaintext token is `HMAC-SHA256(COMMUNICATIONS_LINK_SECRET, communication-access:{actionId}:v1)`. Only the SHA-256 hash is stored on the action. The worker re-derives the same token in memory at send/retry time and appends `#t=` to the provider payload only.

Existing manually issued `CASE_ACCESS` links stay open. `COMMUNICATIONS_LINK_SECRET` is not configured by this PR; without it EVIDENCE_REQUEST cannot be drafted or sent.

## Queue contract

`admin_communication_command_v1` `queue` is one PostgreSQL transaction and also requires `sendEnabled=true` from the server gate:

1. refuse queue while live mail is not operational
2. validate reviewed, locked snapshot
3. refuse browser-supplied recipient/subject/body changes
4. set `QUEUED`
5. insert outbox topic `SEND_EMAIL` with event key `send-email:{id}:v{content_version}`
6. write `COMMUNICATION_CHANGED` audit

A rollback leaves neither a queued communication nor a job.

## SEND_EMAIL

`communication_load_send_v1(id, content_version)` requires lifecycle `QUEUED`, `content_locked`, the exact content version, and immutable recipient/subject/body. A DRAFT, REVIEWED, CANCELLED or stale-version job fails closed.

The provider idempotency key is the outbox event key and stays stable across retry, lease recovery, crash and dead-letter replay.

The Resend adapter calls `resend.emails.send(payload, { idempotencyKey })`. The key is not a custom email header.

After the provider accepts, the worker records `PROVIDER_ACCEPTED` and then completes the job. A crash between those steps retries the same key.

## Webhooks

`POST /api/webhooks/resend` verifies the raw body with the official Resend `webhooks.verify` helper against `RESEND_WEBHOOK_SECRET`. Missing secret or invalid signature fails closed. Duplicate `svix-id` values are idempotent. `created_at` is stored as `provider_occurred_at` separately from `received_at`. Unparseable or absurd timestamps do not mutate delivery state.

Handled types: `email.delivered`, `email.bounced`, `email.complained`, `email.suppressed`.

If a webhook arrives before `provider_message_id` is stored, it is kept unmatched (`applied=false`). Provider acceptance then reconciles stored events for the same Resend message ID, in provider-time order, exactly once.

Step 11 communications have a unique `(provider, provider_message_id)` index where lifecycle and message ID are present. Legacy rows (`lifecycle` null) are excluded.

### Delivery ordering

- Use provider occurrence time, not processing time.
- `PROVIDER_ACCEPTED` never regresses `DELIVERED` or a later permanent failure.
- An older `DELIVERED` replay cannot overwrite a later bounce/complaint/suppression.
- A later `COMPLAINED` (or bounce/suppression) may supersede earlier `DELIVERED`.
- Duplicate webhook IDs create no duplicate delivery event.

## Retry rules

- Transient failure before acceptance: durable job retry
- Acceptance unknown inside 23 hours: same key only
- Acceptance unknown after 23 hours: no provider call; reconcile
- Provider accepted: do not send another email; reconcile with the stable key
- Delivered: never retry
- Hard bounce / complaint / suppression: never blindly retry the same address
- A later verified address requires a new communication; the original recipient snapshot stays

## Admin UI

`/communications` lists lifecycle, delivery, timestamps, provider reference and recent events. Draft → review → queue. Queue is hidden while live mail is disabled. No raw webhook JSON. No arbitrary browser HTML.

## Not in this PR

- Remote application of the Step 11 migration
- Resend webhook configuration
- `JOB_PROVIDER_MODE=production`
- `COMMUNICATIONS_SEND_ENABLED`
- `COMMUNICATIONS_LINK_SECRET` / `RESEND_WEBHOOK_SECRET` in Vercel
- Cron cadence change
- Stripe, incoming mail, Google API, Guard automation
- `PREPARATION` / `READY_TO_SUBMIT`
