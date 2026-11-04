# Telloya DEV test and acceptance plan

**Status:** plan for later tests. This document does not run them.  
**Date:** 4 November 2026 (UK).

The first execution uses mocks and synthetic data. No real call, no live Retell webhook, no email to a real address, and no production database. Scenarios 1, 8, and 11 need either a telephone network or a provider account. Until separate approval, those three are specified and not executed. The others can be proven with fixtures in phase 1, and again against a local database in phase 2.

Synthetic values in tests must be obvious fakes, such as `+440000000000` and `call_test_001`. Do not paste a real number, a recording, a transcript, or a caller name from the POC.

## Scenarios

| # | Scenario | Given | When | Accept | First execution |
| --- | --- | --- | --- | --- | --- |
| 1 | Answered call | The business answers. Forwarding is conditional. | The caller is connected to the business. | The AI is not invoked. No webhook is expected. No lead row is created. | PROVIDER CONFIRMATION REQUIRED. Not a mock of our webhook. |
| 2 | Unanswered call | A signed fixture says the call was forwarded and the caller gave a name, callback number, reason, place, and preference. | The handler runs. | One lead, `call_status = completed`, `incomplete = false`, summary within 600 characters, no transcript field. | Phase 1 mock. |
| 3 | Different callback number | The fixture includes a network number and a different caller-supplied callback number. | The handler maps the lead. | The stored number is the caller-supplied one. The network number is not stored. | Phase 1 mock. |
| 4 | Business closed | The fixture says the caller asked for a time outside the supplied opening hours. | The mapper builds the summary. | The summary records the preference and does not say the time is booked or promised. | Phase 1 mock. The hours rule itself is OWNER DECISION REQUIRED. |
| 5 | Early hang-up | The fixture ends before a callback number. | The handler runs. | One lead, `incomplete = true`, `call_status = incomplete`, no invented number. | Phase 1 mock. |
| 6 | Duplicate webhook | The same signed body is delivered twice. | The second call uses the same provider call reference and the same hash. | The second response points at the first lead. The lead count stays one. The notification idempotency key is unchanged. | Phase 1 decision function. Phase 2 database unique key. |
| 7 | Invalid signature | The body is valid JSON and the signature is wrong, missing, or for another secret. | The handler runs. | HTTP rejection. No lead. No email. The log has no callback number and no raw body. | Phase 1 mock. |
| 8 | Provider outage | Retell cannot complete the call, or the webhook never arrives. | The failure is observed. | The business is not told that a lead was taken. A failed fixture may create one `failed` lead only when the provider actually delivered a failure event. Silence creates nothing. | Failure-event half is a phase 1 mock. A real outage is PROVIDER CONFIRMATION REQUIRED. |
| 9 | Notification failure | The lead commits and the mail provider returns a failure. | The finish step runs. | The lead remains. Delivery status is failed. A later retry uses `{leadId}-business` and does not insert a second lead. | Phase 1 mock of the state machine. No live Resend call. |
| 10 | Emergency or abusive call | A fixture matches the approved handling rule. | The mapper runs. | The summary does not say emergency services were contacted. Abusive content is not required to be stored in full. | Blocked until OWNER DECISION REQUIRED on the rule. The test must not invent the rule. |
| 11 | Recording and transcript settings | The DEV provider account is inspected. | Settings are compared with the application. | The application has no audio or transcript column in use. The provider setting matches the chosen mode, or the sandbox test does not proceed. | PROVIDER CONFIRMATION REQUIRED. Not established by the POC report. |
| 12 | Cross-customer isolation | Two tenants, two numbers, two leads. | A reader scoped to tenant A requests leads. | Only tenant A’s lead is returned. Tenant A’s webhook cannot write tenant B’s number. | Phase 1 resolver test. Phase 2 database test. |

## Phase entry and exit

| Phase | Allowed | Exit | Not allowed |
| --- | --- | --- | --- |
| 1. Backend and mocks | Types, pure functions, unit tests, handler closed unless a new unset flag is exactly `true`. | Scenarios 2–7, 9, and 12 pass on fixtures. 1, 8’s live half, 10, and 11 are reported as not run, with the reason. | Migration, hosted database write, Retell key, email send, real call. |
| 2. Local database | A separately approved migration and local integration tests. | Scenarios 6 and 12 pass at the database. `LIVE` remains impossible. | Hosted DEV or production migration from this plan alone. |
| 3. Provider sandbox | DEV workspace only, after the POC evidence list and scenario 11. | One sandbox event creates one DEV lead and one notification attempt. The duplicate delivery does not. | Production secret, customer number, real caller, recording switched on without a recorded setting. |

## Traceability

| Requirement in the architecture | Scenarios |
| --- | --- |
| Conditional forwarding | 1, 2 |
| Minimal lead and no transcript store | 2, 3, 5 |
| No promised appointment | 4 |
| Idempotency and replay | 6, 7 |
| Durable notification | 9 |
| Tenant isolation | 12 |
| Provider retention unverified | 11 |
| Fail closed when entitlement cannot be read | A unit test in phase 1: missing entitlement does not emit a billable acceptance. It is not one of the twelve call scenarios. |

Scenario 10 stays red on purpose until the owner records the emergency and abusive-call rule. A passing test that invents that rule is a failure of this plan.
