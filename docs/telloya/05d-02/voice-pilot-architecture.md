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
| Independent retention by Retell | Retell’s webhook page says the default `data_storage_setting` is `everything`, and that the webhook still carries the full call when a stricter setting is chosen. The owner’s account setting is not in this repository. | PROVIDER CONFIRMATION REQUIRED. Documentation is not the POC account. |
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
| Authentication | Verify `x-retell-signature` over the raw body with the webhook-authorised Retell API key for that lane. Reject a bad signature before any caller field is read into a lead. | The check is Retell’s, not Stripe’s. `constructStripeEvent` is only a reminder that verification happens before trust. | Invent a standalone signing secret, share a key across DEV and production, or verify `JSON.stringify` of a parsed body. |
| Tenant isolation | Map inbound `call.to_number` and `call.agent_id` to one location. Both must agree. Unknown or ambiguous maps create no lead. The map is server-side. | `public.service_provisions` has a unique `provider_binding_ref` and one active row per location (`supabase/migrations/20261101170000_commercial_foundation_v1.sql`). | Trust `metadata`, dynamic variables, or a caller-controlled webhook query parameter as the tenant. |
| Live state | The pilot must not set `service_provisions.state` to `LIVE`. The table check `service_provisions_live_closed` rejects `LIVE`. | The commercial migration comment says provider fields wait for a later verified command. | Treat a DEV webhook as proof that a location is live. |
| Idempotency | One lead per `call_id`. Duplicate detection is per event: `event` plus `call_id`. A later `call_analyzed` body is not a conflict with `call_ended`. | Enquiry fingerprints stop a replay of the same submission. They are the wrong key for two legitimate Retell event types. | Reject `call_analyzed` because its hash differs from `call_ended`. |
| Replay | The signed `v` timestamp inside `x-retell-signature` is the replay clock. Retell’s published check is five minutes. An unsigned timestamp is not a substitute. | Documented with the HMAC construction on the Retell secure-webhook page, read 4 November 2026. | Choose a different window and call it Retell’s. |
| Validation | A strict schema. Unknown fields are dropped. Strings have a maximum length. The callback number is a normalised telephone string or the lead is incomplete. | `admin_private.valid_enquiry_v1` is the strictness model for enquiries. The lead schema is separate. | Accept the provider’s full JSON as the lead. |
| Minimal collection | The signed body may contain `transcript`, `transcript_object`, and a recording URL. Copy only the lead fields, then discard the rest. Persist neither the raw body nor those fields. | The lead contract lists the columns. | Log the body while debugging a signature failure. |
| Partial and failed calls | `call_analyzed` finalises a completed lead. `call_ended` alone can finalise an incomplete or failed lead only through the fallback worker. An answered call that was not forwarded creates nothing. | Retell’s webhook overview, read 4 November 2026. | Treat every `call_ended` as the finished summary, or drop a hang-up. |
| Observability | Log the event name, `call_id`, status, and notification status. Do not log names, numbers, summaries, transcripts, recording URLs, or the raw body. | Enquiry logs are not a dumping ground for the payload. | Echo the request body in a 401 response. |
| Notification | Acknowledge with 204 after the minimal receipt is durable. Send email afterwards with `{leadId}-business`. One notification per lead. A retry does not send a second email. | `lib/enquiries/intake.ts` persists first and uses a stable idempotency key. The voice path must return 204 before that send. | Call Resend inside the webhook request. |
| Portal | A later read model shows a tenant only its own leads. The portal currently says Telloya is not open (`apps/customer/lib/portal/products/present.ts`). | The closed tile is the current VERIFIED behaviour. | Add `/portal/telloya` in the first backend phase. |
| DEV and PROD | Each lane has its own Retell workspace and its own webhook-authorised API key. The DEV handler loads only the DEV key. Production refuses the DEV key. | Payment lanes already separate sandbox and live. Voice is not one of those lanes. | Point a DEV webhook at production, or reuse the sales-enquiry flag as the voice switch. |

A new server flag, defaulting off, should gate the webhook. This document does not name it as enabled and does not set `TELLOYA_ENQUIRY_ENABLED` or `TELLOYA_LAUNCHED`.

## Retell signature

Checked against Retell’s secure-webhook page and `retell-sdk` 6.2.17 type definitions on 4 November 2026. This repository does not depend on `retell-sdk`. No key is stored here, and no webhook is registered.

| Fact from the current docs and SDK | What the implementation must do |
| --- | --- |
| The header is `x-retell-signature`. The published format is `v={unix milliseconds},d={hex digest}`. | Read that header. A missing or malformed header is a rejection. |
| The digest is HMAC-SHA256 of the raw body concatenated with the `v` timestamp, keyed by the Retell API key. | Verify the exact bytes received. Do not re-serialise parsed JSON. |
| Only an API key that Retell marks with the webhook badge verifies webhooks. | Use that key. Do not substitute an independently generated signing secret unless Retell documents that mode. They do not, as of this reading. |
| The published manual check rejects a `v` timestamp more than five minutes from the verifier’s clock. | Use that window because it is inside the signature. Do not add a second, unsigned replay clock and treat it as Retell’s. |
| `retell-sdk` 6.2.17 exports `verify(body, apiKey, signature)` and `Retell.verify` with the same arguments. Both return a promise. Early 5.x releases did not have `Retell.verify`. | Pin a release whose types still export that function, and test a known fixture. Re-read the types before coding. The official sample uses `await Retell.verify(rawBody, apiKey, signature)`. |
| Retell also documents the source IP `100.20.5.228` as an optional allowlist. | Signature verification remains mandatory. Recheck the address before relying on it. An allowlist is not a signature. |

Rotation stays inside one lane. Create the replacement webhook-authorised key in that Retell workspace, deploy it only to that lane, and prove `verify` succeeds before the old key is revoked. Whether two webhook-badged keys can overlap is **PROVIDER CONFIRMATION REQUIRED**. Until Retell confirms an overlap, plan a short cutover rather than inventing dual-key acceptance. The DEV key never verifies a production webhook, and the production key is absent from DEV and preview.

A failed verification returns 401 with an empty body. The handler does not parse caller fields, does not map a tenant, and does not write a lead.

## Call lifecycle

Retell’s webhook overview, read the same day, says a voice call can emit `call_started`, `call_ended`, and `call_analyzed`. `call_ended` omits `call_analysis`. `call_analyzed` includes it. The events share `call.call_id` and have different bodies. Delivery is ordered but not blocking: `call_ended` can arrive even when `call_started` failed. If no 2xx arrives within 10 seconds, Retell retries up to three times. `transcript_updated` can fire many times and carries transcript text. The pilot does not subscribe to it.

| Event | Effect on the one lead |
| --- | --- |
| `call_started` | Store an event receipt only. Do not finalise a lead and do not notify the business. |
| `call_ended` | Create or update the provisional lead from status, timestamps, and `disconnection_reason`. Do not treat this body as the finished summary. Do not notify yet. |
| `call_analyzed` | Finalise that same lead. This is the event that may set `completed` and the short summary. Then the worker may notify, once. |
| Same `event` and `call_id` with the same raw-body hash | Duplicate delivery. Acknowledge. Do not create a second lead or a second notification. |
| Same `event` and `call_id` with a different raw-body hash | Conflict for that event identity. Do not overwrite. Acknowledge after the conflict is recorded, so Retell does not retry it forever. |
| `call_analyzed` after `call_ended` | Expected. Apply the analysis onto the existing lead. The hash difference is not a conflict. |
| `call_ended` after `call_analyzed` | Do not downgrade a finalised summary or status. Fill an empty duration or disconnection reason only. |
| `call_ended` and no later `call_analyzed` | A worker finalises that lead as `incomplete` or `failed` from the ended facts. It notifies once. How long the worker waits is **OWNER DECISION REQUIRED**. No duration is chosen here. |
| Analysis after that fallback notification | Update the lead in place. Do not send a second email in the pilot. A correction email is a later **OWNER DECISION REQUIRED**. |

`call_started` is absent when Retell reports that the call did not connect. Those calls can still emit `call_ended` and `call_analyzed`. They must not become a `completed` lead. The disconnection reasons that mean “the AI never spoke” on an inbound forward are **PROVIDER CONFIRMATION REQUIRED**.

The request path verifies the signature, copies the allowlisted fields, stores the event receipt and the raw-body hash, discards the body, and returns 204. Email and lead finalisation run after that acknowledgement. The raw body is not queued, because Retell’s own privacy note says the webhook carries the full unscrubbed call, including transcript and recording links, whatever `data_storage_setting` is. That setting controls what Retell keeps, not what the webhook contains. The documented default is `everything`, which means Retell keeps the call data. That is a provider fact from the documentation. It is not a reading of the owner’s account, and it is not evidence that the POC disabled retention.

## Spending-cap limits

A completed-call webhook cannot stop a call the provider has already accepted. The post-call handler records usage. It does not enforce the cap.

| Moment | What it can do | Pilot status |
| --- | --- | --- |
| Before the call | Decide whether this number is allowed to receive forwarded calls, from entitlement and any provider concurrency limit. | Not built. Whether Retell can refuse the next call, or hang up during a call, is **PROVIDER CONFIRMATION REQUIRED**. |
| During the call | Cut the call if the provider supports a mid-call limit. | Unverified. Do not describe it as available. |
| After the call | Reconcile provider-reported duration with the lead. Unknown duration stays unknown. It is not estimated and it is not billed. | Design only. |
| Charging | Authorise an overage charge only from a separate opt-in and a cap, after reconciliation. | Not activated. An enquiry preference is not authorisation. |

Two calls can be in progress before either webhook arrives. Without a provider admission limit, both can complete and the cap can be exceeded. A missing webhook is not zero minutes. A provider outage therefore blocks reconciliation. It does not reset usage.

Until pre-call admission and a tested concurrency limit exist, do not activate overage and do not claim a hard spending cap. The owner still has to choose the soft-stop or fair-use behaviour for calls that have already started. New charge authorisations fail closed when entitlement, usage, or the cap cannot be read. That failure does not reach back into a call that has already ended.

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

Minute measurement, included allowances, overage opt-in, and spending caps are specified in `lead-data-and-security-contract.md`. They are not activated. Post-call fail-closed behaviour applies to new charge authorisations only. It does not stop a call that Retell has already completed.
