# Telloya DEV test and acceptance plan

**Status:** plan for later tests. This document does not run them.  
**Date:** 4 November 2026 (UK).

The first execution uses mocks and synthetic data. No real call, no live Retell webhook, no email to a real address, and no production database. Scenarios 1, 8, and 11 need either a telephone network or a provider account. Until separate approval, those three are specified and not executed. The others can be proven with fixtures in phase 1, and again against a local database in phase 2.

Synthetic values in tests must be obvious fakes, such as `+440000000000` and `call_test_001`. Do not paste a real number, a recording, a transcript, or a caller name from the POC.

## Scenarios

| # | Scenario | Given | When | Accept | First execution |
| --- | --- | --- | --- | --- | --- |
| 1 | Answered call | The business answers. Forwarding is conditional. | The caller is connected to the business. | The AI is not invoked. No webhook is expected. No lead row is created. | PROVIDER CONFIRMATION REQUIRED. Not a mock of our webhook. |
| 2 | Unanswered call | A signed `call_analyzed` fixture says the call was forwarded and the extracted fields contain a name, callback number, reason, place, and preference. | The handler runs. | One lead, `call_status = completed`, `incomplete = false`, summary within 600 characters, no transcript field. | Phase 1 mock. |
| 3 | Different callback number | The fixture includes a network number and a different caller-supplied callback number. | The handler maps the lead. | The stored number is the caller-supplied one. The network number is not stored. | Phase 1 mock. |
| 4 | Business closed | The fixture says the caller asked for a time outside the supplied opening hours. | The mapper builds the summary. | The summary records the preference and does not say the time is booked or promised. | Phase 1 mock. The hours rule itself is OWNER DECISION REQUIRED. |
| 5 | Early hang-up | The fixture ends before a callback number. | The handler runs. | One lead, `incomplete = true`, `call_status = incomplete`, no invented number. | Phase 1 mock. |
| 6 | Duplicate of one event | The same `call_ended` body, signature, and hash are delivered twice. | The second delivery is processed. | One event receipt. One lead. No notification yet, because analysis has not finalised it. The 204 is returned without a second email. | Phase 1 decision function. Phase 2 unique `(environment, event, call_id)`. |
| 7 | Invalid signature | The raw body is signed with the wrong key, a missing `x-retell-signature`, a malformed `v`/`d` header, or a `v` timestamp outside five minutes. The fixture may contain a transcript. | The verifier runs before field extraction. | 401, empty body. No lead. No email. The log has no transcript, recording URL, name, or number. A generic secret that is not the webhook-authorised key does not pass. | Phase 1 mock of the published HMAC. No live key. |
| 8 | Provider outage | Retell cannot complete the call, or the webhook never arrives. | The failure is observed. | The business is not told that a lead was taken. A failed fixture may create one `failed` lead only when the provider actually delivered a failure event. Silence creates nothing. | Failure-event half is a phase 1 mock. A real outage is PROVIDER CONFIRMATION REQUIRED. |
| 9 | Notification failure | The lead commits and the mail provider returns a failure. | The finish step runs. | The lead remains. Delivery status is failed. A later retry uses `{leadId}-business` and does not insert a second lead. | Phase 1 mock of the state machine. No live Resend call. |
| 10 | Emergency or abusive call | A fixture matches the approved handling rule. | The mapper runs. | The summary does not say emergency services were contacted. Abusive content is not required to be stored in full. | Blocked until OWNER DECISION REQUIRED on the rule. The test must not invent the rule. |
| 11 | Recording and transcript settings | The DEV provider account is inspected. | Settings are compared with the application. | The application has no audio or transcript column in use. The provider setting matches the chosen mode, or the sandbox test does not proceed. | PROVIDER CONFIRMATION REQUIRED. Not established by the POC report. |
| 12 | Cross-customer isolation | Two tenants, two `to_number` and `agent_id` pairs, two leads. | A reader scoped to tenant A requests leads. | Only tenant A’s lead is returned. A signed event whose `to_number` and `agent_id` disagree, or match nobody, creates no lead. | Phase 1 resolver test. Phase 2 database test. |
| 13 | Ended then analyzed | Fixtures for `call_ended` and `call_analyzed` share `call_id` and have different raw-body hashes. The analyzed fixture includes a transcript and a recording URL. | Ended is applied, then analyzed. | One lead. Status becomes `completed` only from analysis. The transcript and recording URL are absent from the row and the log. This is not a hash conflict. | Phase 1 mock. |
| 14 | Analyzed then ended | The same pair arrives in reverse order. | Analyzed finalises the lead. Ended arrives later. | The summary and `completed` status stay. Ended may fill an empty duration only. Still one lead and one notification. | Phase 1 mock. |
| 15 | Duplicate analyzed | The same `call_analyzed` body is delivered twice after a successful finalisation. | The second delivery runs. | One lead. One `{leadId}-business` notification. The second response is 204. | Phase 1 mock. Phase 2 unique event receipt. |
| 16 | Conflicting retry of one event | Two `call_analyzed` bodies share `call_id` and differ in bytes. | The second is applied. | The stored analysis is unchanged. A conflict receipt is kept. No second lead. | Phase 1 mock. |
| 17 | No analysis | Only `call_ended` arrives, with a hang-up and no callback number. The fallback worker is invoked directly. | The worker finalises. | One `incomplete` lead and one notification. The wait before fallback is not asserted, because that duration is OWNER DECISION REQUIRED. | Phase 1 mock of the worker. The timer is not chosen here. |
| 18 | Sensitive body | A valid signed `call_ended` fixture includes transcript text and a recording URL. | The mapper runs. | The durable receipt has the allowlisted fields and a hash. It has no transcript, no URL, and no raw body. | Phase 1 mock. |
| 19 | Concurrent calls and unknown usage | Two calls for one tenant are both already completed in fixtures. One has no duration. Entitlement cannot be read. | Reconciliation and charge authorisation run. | Neither webhook is treated as having stopped the call. Unknown duration is not billed and not replaced with an estimate. No charge is authorised. Overage stays inactive. | Phase 1 mock. |
| 20 | Usage gap during an outage | The provider usage export has a call the lead table lacks, and the lead table has a call the export lacks. | Reconciliation runs. | Both are exceptions. Neither becomes a charge. The missing call is not recorded as zero minutes. | Phase 1 mock. A live outage remains PROVIDER CONFIRMATION REQUIRED. |

## Phase entry and exit

| Phase | Allowed | Exit | Not allowed |
| --- | --- | --- | --- |
| 1. Backend and mocks | Types, pure functions, unit tests, handler closed unless a new unset flag is exactly `true`. | Scenarios 2–7, 9, 12–20 pass on fixtures. 1, 8’s live half, 10, and 11 are reported as not run, with the reason. | Migration, hosted database write, Retell key, email send, real call. |
| 2. Local database | A separately approved migration and local integration tests. | Scenarios 6 and 12 pass at the database. `LIVE` remains impossible. | Hosted DEV or production migration from this plan alone. |
| 3. Provider sandbox | DEV workspace only, after the POC evidence list and scenario 11. | One sandbox event creates one DEV lead and one notification attempt. The duplicate delivery does not. | Production secret, customer number, real caller, recording switched on without a recorded setting. |

## Traceability

| Requirement in the architecture | Scenarios |
| --- | --- |
| Conditional forwarding | 1, 2 |
| Minimal lead and no transcript store | 2, 3, 5 |
| No promised appointment | 4 |
| Idempotency and replay | 6, 7, 13–17 |
| Durable notification after 204 | 9, 15, 17 |
| Tenant isolation | 12 |
| Provider retention unverified | 11, 18 |
| Post-call cap is not pre-call control | 19, 20 |

Scenario 10 stays red on purpose until the owner records the emergency and abusive-call rule. A passing test that invents that rule is a failure of this plan.
