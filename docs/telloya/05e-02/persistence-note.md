# Telloya 05E-02 — local voice persistence

This change adds a local PostgreSQL migration and a repository adapter. It does not apply that migration to hosted DEV or Production.

## What is stored

Four tables, all with row-level security enabled and with direct privileges revoked from `anon`, `authenticated`, and `service_role`:

- `telloya_voice_number_bindings` maps one active inbound number, in one environment, to one business and location. The agent reference is stored with that binding. An active agent cannot be bound to a second location in the same environment.
- `telloya_voice_event_receipts` stores the environment, provider call reference, event type, SHA-256 of the raw body, and the processing status. The raw body is not stored.
- `telloya_voice_leads` stores the minimal caller lead. `created_at` is kept when a later event updates the same call. `duration_seconds` and `disconnection_reason` are operational fields so a later `call_ended` can fill an empty value. The customer read does not return them.
- `telloya_voice_notification_outbox` stores one intent per lead. The idempotency key is built in SQL. No recipient address is stored and nothing is sent.

The customer read is `telloya_voice_list_leads_v1(environment, business_id, customer_id)`. It returns rows only when that customer has a verified `business_memberships` row for that business, and only for the requested environment.

## How a write is decided

`apps/telloya/lib/voice/persist.ts` checks the injected flag, verifies the Retell signature, and projects the event with the existing pure functions. It does not read process configuration and it does not add a webhook route.

PostgreSQL is authoritative for the tenant, the receipt, and the lead. `telloya_voice_commit_event_v1` ignores any business or location supplied by the caller. It resolves the tenant from the active binding for that environment, inbound number, and agent. A duplicate hash does not create another lead. A different hash for the same event is recorded as a conflict and does not change the lead. `call_ended` after a finalised lead can fill an empty duration or disconnection reason only. A finalised lead and its notification intent are written in the same transaction. An advisory lock plus the receipt unique key keeps two concurrent deliveries of the same call to one lead.

A failed notification stays in the outbox with `delivery_status = failed` and an attempt count. The lead is not deleted.

## Boundaries that stay open

- No retention period is chosen and no deletion job is created.
- `service_provisions.state = LIVE` stays impossible.
- Storing a completed call does not authorise usage, overage, or a spending cap. No Stripe object is created.
- The fallback finaliser runs only when it is called. The wait before a missing analysis is still an owner decision.
- The owner-reported Retell proof of concept remains evidence pending. It is not a production integration.
- Legal publication decisions recorded in `docs/telloya/05d-02/` stay open.
- `TELLOYA_ENQUIRY_ENABLED` and `TELLOYA_LAUNCHED` are unchanged.
- The migration manifest records `20261105120000_telloya_voice_persistence_v1.sql` with `appliedToDev: false`. The observed DEV ledger head remains `20261104190000`.

## Tests

`supabase/tests/database/telloya-voice-persistence.database.test.ts` applies the repository chain to a disposable database. A second, local PostgreSQL process covers two sessions committing the same event. Neither test connects to a hosted database.
