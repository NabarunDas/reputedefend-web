# Telloya 05E-01 implementation note

**Status:** phase 1 code only. No live voice integration.  
**Date:** 4 November 2026 (UK).

The module is `apps/telloya/lib/voice/`. It is pure functions and an in-memory state value. It does not add a route, a migration, a Retell SDK dependency, a credential, or a read of `process.env`. `TELLOYA_ENQUIRY_ENABLED` and `TELLOYA_LAUNCHED` are unchanged. The sales-enquiry path is unchanged.

## What this phase proves

Signature checks use Retell’s published construction: header `x-retell-signature`, form `v={unix milliseconds},d={hex}`, HMAC-SHA256 of the raw body concatenated with that timestamp, keyed by an injected webhook-authorised API key. The replay window is five minutes. A known synthetic digest is fixed in the tests. Invalid signatures return an empty 401 and do not read caller fields.

`call_started`, `call_ended`, and `call_analyzed` share `call.call_id`. One lead is updated across those event types. The same event and hash is a duplicate. The same event and a different hash is a conflict and does not overwrite. `call_analyzed` finalises. A later `call_ended` only fills an empty duration or disconnection reason. Fallback finalisation runs only when a test calls it. There is no timer.

The stored lead has the minimal fields from `docs/telloya/05d-02/lead-data-and-security-contract.md`. The event receipt keeps the raw-body hash and any conflicting hash, not the body. Duration and disconnection reason sit beside the lead so a later `call_ended` can fill an empty value. They are not lead columns. Transcripts, recording URLs, the raw body, and the network CLI are not stored. A provider failure is only Retell’s `call.call_status` of `error`. Disconnection reasons are not classified, because the list that means the AI never spoke is still unconfirmed. Notification output is an intent with key `{leadId}-business`, created after acceptance, never inside `acceptVoiceWebhook`. Nothing is sent.

A lead read takes an explicit environment and a business id. The same business id in DEV and Production stays in its own lane. A later event whose business or location does not match the stored lead is rejected and does not change that lead.

`reconcileUsage` never authorises a charge. A known minute total is returned only when every Telloya export row matches a lead, call ids are unique, and every duration is a non-negative whole number of seconds. Extra export rows, duplicate call ids, and negative, fractional, missing, or non-finite durations leave the total unset. They are not stored as zero and they are not summed. Relaunch Guard rows stay out of the Telloya total. Enquiry preferences are not authorisation. Completed-call events do not set a hard cap and do not stop a call.

## Not executed

| Scenario | Mark |
| --- | --- |
| 1 Answered call | NOT EXECUTED. It needs the telephone network. |
| 8 Live provider outage | NOT EXECUTED. A delivered `call_status: error` fixture and a silent store are mocked. |
| 10 Emergency or abusive call | NOT EXECUTED. The owner has not written the rule. |
| 11 Recording and transcript settings | NOT EXECUTED. No provider account is inspected. |

The registry is `apps/telloya/lib/voice/coverage.ts`.

## Still outside this phase

- A database for event receipts, the one lead per call, and the server-side number map. `service_provisions.state` must not become `LIVE`.
- An externally reachable webhook, a lane flag that is exactly `true`, and injected DEV and production keys. Whether two webhook-badged keys can overlap is still unconfirmed, so this code accepts one key per call.
- The agent’s real `custom_analysis_data` names, and the disconnection reasons that mean the AI never spoke.
- The fallback wait. This code does not choose a duration.
- A delivery address, mail suppression, and any Resend call.
- Pre-call admission and concurrency control at Retell. Until those exist, overage stays inactive.
- Legal, retention, disclosure, and DPIA decisions in `docs/telloya/05d-02/owner-decisions.md`. The owner-reported Retell POC remains evidence pending.
