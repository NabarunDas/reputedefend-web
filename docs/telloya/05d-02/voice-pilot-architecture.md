# Telloya voice pilot architecture

**Status:** implementation blueprint. Not a build, not a provider change, and not approval to place a call.  
**Date:** 4 November 2026 (UK).  
**Base:** `develop` at `12696339`, which includes merged PR #420.  
**Legal baseline:** `docs/telloya/05d-01/`. This note does not repeat that assessment.

No voice provider integration is implemented in this repository. The earlier owner-reported Retell proof of concept is unverified by this repository. It is **OWNER-REPORTED POC — EVIDENCE PENDING**. It is not production approval.

`TELLOYA_ENQUIRY_ENABLED` and `TELLOYA_LAUNCHED` stay off. This blueprint does not add a voice flag, a migration, or a webhook route.

## Recommended initial operating model

The first pilot should minimise what ProfileRelaunch keeps.

| Behaviour | Pilot rule | Status |
| --- | --- | --- |
| Who is answered | Only a call that the business’s telephone service has already forwarded because the business did not answer. An answered call never reaches the AI. | PLANNED. Not tested in this repository. |
| Identity | The agent says it is an AI receptionist for the named business before it asks for personal details. Wording is not approved. | PLANNED. LEGAL REVIEW REQUIRED. |
| What it collects | Caller name if given, the best callback number, the reason for the call, the job location if given, and a callback preference. | PLANNED |
| What it produces | One short structured lead summary for that business. | PLANNED |
| Delivery | The business receives the summary by a method named in the pilot agreement. The customer dashboard is not that method. | PLANNED. OWNER DECISION REQUIRED. |
| Callback | The business calls back. Telloya does not promise a callback or book an appointment. | Matches current marketing limits. The behaviour is not built. |
| Audio and transcript | The application does not retain a full recording or a transcript. | Design rule only. PROVIDER CONFIRMATION REQUIRED. |

That last rule is conditional on the provider. It is not an established Retell capability. The owner-reported POC does not show recording, transcription, training, or retention settings.

### What Retell must be assumed to do, and what is not known

| Processing | Working assumption for design | Evidence |
| --- | --- | --- |
| Temporary audio | A voice agent cannot hold a conversation unless the provider receives and processes audio during the call. “Not retained by our application” does not mean the audio never reaches Retell. | Stated as a design constraint in `docs/telloya/05d-01/draft-legal-documents.md`. Not measured on a Retell account. |
| Independent retention by Retell | Retell may keep audio, transcripts, prompts, logs, or training data under its own account settings and contract, even if our database does not. | PROVIDER CONFIRMATION REQUIRED. No export is in the repository. |
| Our database | Stores the minimal lead in the later contract. It does not store the raw webhook body, the transcript, or the audio. | Not built. |

Until a configuration export shows the account settings, the pilot must not use a real caller. Synthetic fixtures are the only authorised test data in the first backend phase.

## Retell POC reconciliation

Use the owner report as a list of things to investigate. Do not treat it as a passed acceptance test.

| Topic | Owner-reported observation | Still unverified |
| --- | --- | --- |
| SIP connectivity | Reported as successful. | No SIP trace, trunk id, or diagram is in the repository. PROVIDER CONFIRMATION REQUIRED. |
| Test number | A test number was provisioned. The number is not written here. | No inventory row and no redacted binding record. PROVIDER CONFIRMATION REQUIRED. |
| Agent | A voice agent collected missed-call enquiries. | Agent id, prompt, version, and knowledge-base source are absent. PROVIDER CONFIRMATION REQUIRED. |
| Best callback number | The agent confirmed whether the calling number was the best callback number. | No script excerpt and no fixture of the question. PROVIDER CONFIRMATION REQUIRED. |
| Opening hours | Callback preferences were tested against opening hours. Closed-hours requests did not receive an unsupported time. | No hours document and no captured dialogue. OWNER DECISION REQUIRED for the rule. PROVIDER CONFIRMATION REQUIRED for the test. |
| Outcomes and limits | A test call succeeded. Known limitations were not listed by the owner in the repository. | Test date, result note, and limitation list are absent. |
| Recording, transcription, training, retention | Not reported. | All four settings are unverified. The POC is not evidence that they are off. |

Evidence to file later, with secrets, numbers, recordings, transcripts, and personal data removed:

- Configuration export.
- Agent prompt and version, and the test date.
- Provider settings for recording, transcription, retention, and training.
- Scenarios and results for SIP, the test call, enquiry collection, callback-number confirmation, and opening hours.
- A description of number and account binding that does not contain the number or the account id.

## Target flow

```text
Business telephone provider
  -> conditional forward only when unanswered
  -> Retell agent for that number
  -> signed webhook to the Telloya DEV endpoint
  -> signature check, schema validation, number-to-tenant map
  -> one lead row
  -> durable notification to that tenant
  -> later, a portal view for that tenant only
```

A Telloya sales enquiry is a different flow. It is `POST /api/telloya/enquiry` into `public.enquiries` with a `TY-` reference, and it is off unless `TELLOYA_ENQUIRY_ENABLED` is exactly `true`. A caller lead must not be inserted there. The enquiry payload describes the business buying the service. The lead describes a person who called that business.

## Integration design

The first implementation should follow patterns that already exist, without attaching the voice path to Stripe or to the sales enquiry.

| Concern | Design | Existing pattern to copy | Do not do |
| --- | --- | --- | --- |
| Authentication | Verify the provider signature over the raw body with a DEV secret of at least 16 characters. Reject missing, stale, or invalid signatures before mapping a tenant. | `constructStripeEvent` in `lib/payments/stripe.ts` verifies before the event is trusted. Telloya needs its own verifier and its own secret. | Share `STRIPE_WEBHOOK_SECRET` or accept a JSON body that has already been re-serialised. |
| Tenant isolation | Resolve the called number to one `business_id` and one `location_id`. The resolver is server-side. Two locations must not share a number. | `public.service_provisions` already has a unique `provider_binding_ref` and one active row per location (`supabase/migrations/20261101170000_commercial_foundation_v1.sql`). | Put the number map in the browser, or infer the tenant from a field the caller can edit. |
| Live state | The pilot must not set `service_provisions.state` to `LIVE`. The table check `service_provisions_live_closed` rejects `LIVE`. | The commercial migration comment says provider fields wait for a later verified command. | Treat a DEV webhook as proof that a location is live. |
| Idempotency | The unique key is the provider call reference scoped to the tenant. The same reference and the same content hash return the existing lead. The same reference with different content is a conflict and does not overwrite. | `create_general_enquiry_v1` uses `submission_key` plus a payload fingerprint. | Use the webhook delivery id alone if the provider can reuse it across calls. |
| Replay | Store a hash of the raw body and the provider timestamp, not the body. Reject a hash that is reused with different content, and reject a timestamp outside an owner-chosen window. The window length is not chosen here. | Stripe receipts are applied once. The exact Telloya window is OWNER DECISION REQUIRED. | Store the raw payload in order to make replay easy. |
| Validation | A strict schema. Unknown fields are dropped. Strings have a maximum length. The callback number is a normalised telephone string or the lead is incomplete. | `admin_private.valid_enquiry_v1` is the strictness model for enquiries. The lead schema is separate. | Accept the provider’s full JSON as the lead. |
| Minimal collection | Persist only the fields in `lead-data-and-security-contract.md`. | Enquiry minimisation is a different field list. | Store audio, transcript, or the raw event. |
| Partial and failed calls | A hang-up or a provider failure still creates at most one lead, marked incomplete or failed. An answered call that was not forwarded creates nothing. | No voice equivalent exists. | Drop a partial call silently, or create a second row on retry. |
| Observability | Log the tenant id, the call reference, the status, and the notification status. Do not log the callback number, the caller name, the summary, or the raw body. | Enquiry logs avoid treating the receipt as the only record. | Ship provider payloads to analytics. |
| Notification | Persist the lead first. Then send email through the existing provider boundary with a stable idempotency key `{leadId}-business`. Record sent, skipped, or failed. A failed send leaves the lead visible to the operator. | `lib/enquiries/intake.ts` persists, sends with `{id}-internal` and `{id}-customer-ack`, then calls `finish_general_enquiry_notification_v1`. | Send the email before the lead exists, or send a caller transcript. |
| Portal | A later read model shows a tenant only its own leads. The portal currently says Telloya is not open (`apps/customer/lib/portal/products/present.ts`). | The closed tile is the current VERIFIED behaviour. | Add `/portal/telloya` in the first backend phase. |
| DEV and PROD | DEV uses a DEV Retell workspace, a DEV webhook secret, and the DEV database. Production refuses the DEV secret. Preview must not be able to initialise a production voice credential. | Payment lanes already separate sandbox and live. Voice is not one of those lanes. | Point a DEV webhook at production, or reuse the sales-enquiry flag as the voice switch. |

A new server flag, defaulting off, should gate the webhook. This document does not name it as enabled and does not set `TELLOYA_ENQUIRY_ENABLED` or `TELLOYA_LAUNCHED`.

## Implementation phases

### Phase 1 — backend contract and mocks

Authorised by a later implementation PR, not by this file.

- Pure functions for signature verification, schema validation, tenant resolution, idempotency, and the lead mapper.
- Unit tests use synthetic numbers and synthetic call references.
- The webhook handler, if added, returns a closed response unless the new flag is exactly `true`. The flag is not set in this phase.
- No migration, no Retell credential, no email send, and no call.

Exit: the twelve scenarios in `dev-test-and-acceptance-plan.md` that can run on mocks are green. Scenarios that need a provider or a database are explicitly skipped.

### Phase 2 — local persistence

Requires a separate approval to add a migration.

- Add the lead table and the number map described in the data contract.
- Enforce uniqueness and tenant foreign keys in the database, not only in TypeScript.
- Integration tests run against the local test database.
- Do not set `service_provisions.state` to `LIVE`.
- Do not apply the migration to the hosted DEV or production project from this blueprint.

Exit: duplicate, conflict, and cross-tenant tests pass on the local database.

### Phase 3 — provider sandbox

Requires a separate approval after the POC evidence list is filed and the recording, transcription, training, and retention settings are confirmed.

- Register a webhook only on the DEV Retell workspace.
- Use the provider’s test tools or a number the business controls. No real customer caller.
- Confirm the signed webhook matches the mock contract.
- Confirm the application stored no audio and no transcript.
- Leave production credentials absent.

Exit: one synthetic or sandbox call produces one lead and one notification attempt in DEV. A second delivery does not produce a second lead.

### Not authorised

Production deployment, a live Retell agent on a customer number, recording or transcription switches, a real email to a customer, a charge, a legal page, and either existing Telloya feature flag.

## Relationship to commercial minutes

Minute measurement, included allowances, overage opt-in, and spending caps are specified in `lead-data-and-security-contract.md`. They are not activated. An enquiry preference does not authorise a charge. If the entitlement or the cap cannot be read, the pilot fails closed and does not take another billable call. The fail-closed rule is a design requirement. It is not implemented.
