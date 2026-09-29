# Incoming mail and conversations — Step 12

SOURCE IMPLEMENTED / MIGRATION NOT APPLIED. The additive migration is `20260929221604_incoming_mail_conversations_v1.sql`. It is not remotely applied.

This PR does not configure Resend Receiving, an inbound webhook secret, or an inbound subdomain/DNS. No live inbound email has been received. The root-domain MX for `profilerelaunch.com` is unchanged. Google Workspace continues to receive ordinary mail. Outgoing Step 11 remains DATABASE APPLIED / LIVE DELIVERY DISABLED. Cron remains `0 4 * * *`. `PREPARATION` / `READY_TO_SUBMIT` remain blocked.

Step 12 is not live and is not complete.

## Purpose

Add a first-class conversation model for inbound mail:

- signed `email.received` intake
- durable `IMPORT_INBOUND_EMAIL` work on the Step 10 outbox
- durable `IMPORT_INBOUND_ATTACHMENT` work per attachment
- unmatched inbox
- deterministic thread resolution that fails closed on RFC ambiguity
- safe attachment quarantine in a dedicated inbound prefix
- Admin replies through the existing Step 11 reviewed outgoing-mail path
- append-only phone notes
- contact-recovery tasks on the existing `public.case_tasks` model

An inbound sender address is communication metadata only. It is never authentication.

## Mailbox cutover

Do not change the MX records of `profilerelaunch.com`.

Inbound mail is designed for a dedicated configurable subdomain such as `reply.profilerelaunch.com`. Placeholders:

- `INBOUND_MAIL_DOMAIN`
- `RESEND_INBOUND_WEBHOOK_SECRET`
- `COMMUNICATIONS_INBOUND_ENABLED`
- `INBOUND_OWNED_ADDRESSES`
- `AWS_INBOUND_MAIL_BUCKET`
- `AWS_INBOUND_MAIL_ROLE_ARN`

None of these are set by this PR. Do not configure Resend Receiving, inbound DNS, or AWS. Do not create a webhook yet.

Later conversational replies use an opaque per-conversation Reply-To on that inbound subdomain. Addresses such as `cases@profilerelaunch.com` stay on Google Workspace.

The conversation alias is random hex routing information. It is not an authentication secret. It never contains case IDs, customer IDs or email addresses.

## Inbound webhook

`POST /api/webhooks/resend/inbound`

1. Verify the raw body with the official Resend verifier against `RESEND_INBOUND_WEBHOOK_SECRET`.
2. Accept only `email.received`.
3. Persist a bounded provider receipt.
4. Enqueue `IMPORT_INBOUND_EMAIL`.
5. Return promptly.

The webhook does not fetch bodies or attachments. It does not store raw webhook JSON.

The existing outbound route `POST /api/webhooks/resend` is unchanged except that a provider RFC `Message-ID` may be recorded from `data.message_id`. `email.sent` is not delivery.

## Thread resolution

1. Exact provider/RFC relationship from `In-Reply-To` or `References`. Tokens are split on ordinary whitespace, including tabs and newlines. If those tokens identify exactly one conversation, use it. If they identify more than one, the RFC relationship is ambiguous and is not auto-linked. Sender email never breaks the tie.
2. Opaque conversation Reply-To alias on the configured inbound domain, including formatted `Name <alias@domain>` mailboxes. The alias remains unique.
3. Other ProfileRelaunch-owned RFC identifiers already stored on outbound communications.
4. Otherwise create or retain an `UNMATCHED` conversation. Ambiguous RFC relationships use the bounded reason `Ambiguous thread relationship`.

Provider mailbox strings such as `Alex Smith <alex@example.com>` are parsed into a bounded address and display name. Malformed or ambiguous mailbox strings fail closed.

`from email == customer email` is only a `MATCHES_VERIFIED_CONTACT` triage signal. It does not authenticate, verify, grant access, or auto-link a case.

Validated webhook/provider occurrence time is stored on the inbound receipt and copied to `conversation_messages.provider_occurred_at`. It stays distinct from local receipt time. Absurd timestamps stay NULL. Webhook replay does not rewrite history.

`UNMATCHED` and `OPEN` conversations may be closed. A closed conversation may have `case_id = NULL`. Reopen returns `OPEN` when a case remains linked and `UNMATCHED` otherwise. Original messages stay append-only.

`link_case` only links an `UNMATCHED` conversation. Relinking requires an explicit unlink. Unlink is denied while any `CONVERSATION_REPLY` is `DRAFT`, `REVIEWED`, or `QUEUED`.

## Attachments

The email-import transaction records attachment identities and enqueues one `IMPORT_INBOUND_ATTACHMENT` job per attachment. The webhook does not download files.

The attachment worker retrieves bytes from Resend (`emails.receiving.attachments.get`), validates declared metadata without clamping oversized files, downloads bounded bytes, validates actual signatures against the Step 8 allow-list, uploads to a private inbound S3 prefix over OIDC, probes GuardDuty, and then marks the row clean or blocked.

Admin download/availability requires all of: a private object, matching storage identity, `NO_THREATS_FOUND`, and successful content validation. `validation_status` is not `VALID` merely because the declared MIME type is listed. A clean scan cannot make a row available with NULL storage bucket/key.

Object keys are opaque `inbound/{conversation}/{message}/{attachment}` UUIDs. They do not contain filenames, email addresses, subjects, or customer names. Inbound storage uses `AWS_INBOUND_MAIL_BUCKET` / `AWS_INBOUND_MAIL_ROLE_ARN` placeholders, not the evidence `cases/*` role. Those values are not set by this PR.

They are not case evidence. An explicit Admin command may record them for evidence follow-up. That command does not accept the file and does not insert `case_documents`.

If inbound storage configuration is absent, retrieval fails closed.

## Replies

Admin drafts use template `CONVERSATION_REPLY` and the Step 11 draft → review → queue path. Queue stays disabled because live mail is disabled. Unmatched conversations cannot send a customer reply. Reviewed snapshots include Reply-To, In-Reply-To and References and cannot be mutated.

## Operational test (do not run now)

A later live pilot on the inbound subdomain only should cover:

- inbound test email
- signed `email.received`
- durable import
- unmatched inbox
- thread match from a reply
- duplicate webhook replay
- spoofed From
- attachment
- automated/out-of-office message
- manual case linking
- phone note
- reply draft/review
- root Google Workspace inbox still receiving ordinary mail

Do not execute that test in this PR.

## Not in this PR

- Remote application of the Step 12 migration
- Resend Receiving or inbound webhook configuration
- Inbound subdomain/DNS
- Root-domain MX change
- `JOB_PROVIDER_MODE=production`
- `COMMUNICATIONS_SEND_ENABLED`
- `COMMUNICATIONS_INBOUND_ENABLED`
- Cron cadence change
- Live inbound or outbound customer email
- `PREPARATION` / `READY_TO_SUBMIT`
