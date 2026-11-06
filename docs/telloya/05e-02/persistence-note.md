# Telloya 05E-02 — local voice persistence

This change adds a local PostgreSQL migration and a repository adapter. It does not apply that migration to hosted DEV or Production.

## What is stored

Four tables, all with row-level security enabled and with direct privileges revoked from `anon`, `authenticated`, and `service_role`:

- `telloya_voice_number_bindings` maps one active inbound number, in one environment, to one business and location. The agent reference is stored with that binding. An active agent cannot be bound to a second location in the same environment. The bind function and a before-insert trigger take the same transaction advisory lock on the environment and agent, so two sessions cannot both commit that assignment.
- `telloya_voice_event_receipts` stores the environment, provider call reference, event type, SHA-256 of the raw body, and the processing status. The raw body is not stored.
- `telloya_voice_leads` stores the minimal caller lead. `created_at` is kept when a later event updates the same call. `duration_seconds` and `disconnection_reason` are operational fields so a later `call_ended` can fill an empty value. Uniqueness is `(environment, provider_call_ref)` and `(environment, location_id, provider_call_ref)`, so DEV and Production can store the same call reference for the same location.
- `telloya_voice_notification_outbox` stores one intent per lead. The idempotency key is built in SQL. No recipient address is stored and nothing is sent.

`telloya_voice_lane_snapshot_v1` returns bindings only for the requested environment. A DEV snapshot does not include a Production number, agent, business, or location.

There is no customer lead-list function in this phase. A caller-supplied customer UUID is not treated as identity. A later authenticated Customer portal read must take the customer from the verified portal session and must not accept a customer UUID argument. That portal read is not part of this change.

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
- The migration manifest records `20261105120000_telloya_voice_persistence_v1.sql` with `appliedToDev: true` and `safeToReplay: false`. It was applied once. The repository SQL is unchanged. The observed DEV ledger contains 114 entries and ends at `20261106140000`. Do not replay this voice migration. Do not apply it to Production. Admin Begin Setup `20261105130000`, confirm preferences `20261105144256`, confirm AI configuration `20261105172055`, the tier catalogue `20261105180000`, and the Guard add-on `20261105190000` are applied and must not be replayed. The customer handover migration `20261104220000` remains applied and must not be replayed.

## Tests

`supabase/tests/database/telloya-voice-persistence.database.test.ts` applies the repository chain to a disposable database. A second, local PostgreSQL process covers two sessions committing the same event. Neither test connects to a hosted database.
