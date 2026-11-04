# Telloya operational readiness

**Status:** internal checklist. A row is ready only when the evidence column says the workflow exists. Marketing copy is not a workflow.  
**Date:** 4 November 2026 (UK).

Nothing in this checklist was executed against a live voice provider, a telephone network, Supabase production, or a real customer. No call, SMS, or email was sent.

## How to read a row

- **VERIFIED** — repository tests or code demonstrate the control.
- **IMPLEMENTED BUT UNTESTED** — the control exists, and this assessment did not run it in a production-like environment.
- **PLANNED** — the product description includes it, and the workflow does not exist.
- **PROVIDER CONFIRMATION REQUIRED** — a named external setting or capability has not been seen.
- **OWNER DECISION REQUIRED** — the business has not chosen the rule.

Acceptance criteria are written so a later test can fail. They are not claims that the test has passed.

## OWNER-REPORTED POC — EVIDENCE PENDING

The owner reports a completed Retell voice-agent proof of concept: SIP connectivity, a provisioned test number, a successful test call, conversation testing for missed-call enquiries, confirmation of the caller’s preferred callback number, and callback preferences tested against business opening hours, including closed hours without an unsupported time. That history is kept. It is not re-run by this checklist, and it is not a production integration.

The report does not show recording, transcription, training, retention, webhook signatures, customer call forwarding, disclosure wording, failure cases, or lead delivery. No number, credential, recording, or personal data is copied into this file. The POC configuration, agent version, provider settings, scenarios, and results are not in the repository.

A later launch test still has to capture new evidence for the selected provider and tenant, conditional call forwarding, the disclosure the caller hears, webhook signature and replay behaviour, summary delivery, and failed or dropped calls. Those rows below stay open.

## Provisioning and numbers

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Provider account | An account exists in the selected provider, in the entity ProfileRelaunch Ltd, with access limited to named people. | No provider client or credential in the repo. The owner reports a historical Retell POC account. That account is not this production control, and its identifier is not recorded here. | PROVIDER CONFIRMATION REQUIRED. POC is OWNER-REPORTED POC — EVIDENCE PENDING. |
| Number assignment | A test number is assigned, the presenting number is known, and the customer’s existing number is not replaced unless the customer agreed. | Marketing copy says the business keeps its number (`apps/telloya/lib/content.ts`). The owner reports that a POC test number was provisioned. There is no number inventory in the repo, and the number is not written here. | PLANNED for production. POC observation is OWNER-REPORTED POC — EVIDENCE PENDING. |
| Agent configuration | The greeting, business facts, and disclosure script are loaded for one test business and can be read back. | Enquiry fields can collect voice and language preferences. No agent store. | PLANNED |
| Training and data reuse | The account setting that controls model training is recorded and matches the contract. | No setting | PROVIDER CONFIRMATION REQUIRED. OWNER DECISION REQUIRED |
| Recording mode | The account is on exactly one of: audio retained, transcript only, or neither. A test call proves the other artefacts are absent. | No recording control | Not enabled. PROVIDER CONFIRMATION REQUIRED |

## Call forwarding

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Conditional forwarding | An unanswered call to the business number arrives at Telloya. An answered call does not. | Copy says missed-call forwarding depends on the customer’s provider. No test call. | PLANNED. PROVIDER CONFIRMATION REQUIRED per customer. |
| Failure behaviour | If forwarding is unsupported, the customer is told Telloya may be unsuitable. The site must not stay on “Never Misses a Call” for that customer. | The how-it-works copy already says an unsupported provider may make Telloya unsuitable. | PLANNED as a statement. Not an onboarding gate. |
| Setup responsibility | The customer remains responsible for the setting on their own telephone service. ProfileRelaunch provides guidance. | Copy says guidance is included and the provider configuration is the customer’s. | PLANNED. Draft terms say the same. Not a signed term. |
| Test before live | A recorded test result is stored before a location can be treated as live. | The data model has `provider_test_call_ref` and `provider_test_outcome`. The implementation plan rejects `LIVE` in the current phase and makes no provider call. | PLANNED. The columns are not a completed test. |

## Caller identification and callback

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Best callback number | The conversation asks for a number that works if the calling line is withheld or different, and the summary shows which number the caller gave. | FAQ says Telloya asks for contact details and a preferred callback time. The owner reports that the Retell POC confirmed the preferred callback number. No dialogue is stored in the product. | PLANNED in the product. POC observation is OWNER-REPORTED POC — EVIDENCE PENDING. |
| Incomplete caller | A call that ends before a number is captured is still delivered as an incomplete lead, not discarded silently. | Copy says Telloya does not guarantee that every caller leaves details. No incomplete-lead state. | PLANNED |
| No guaranteed appointment | The summary never says a time is booked. | VERIFIED as copy: the FAQ and how-it-works say appointments are not confirmed and callbacks are not guaranteed. | VERIFIED as a written limit. Not a dialogue test. |

## Knowledge, hours, and difficult calls

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Business knowledge | Prices, coverage area, and services come from a customer-approved source. The agent does not invent a price. | No knowledge store | PLANNED. OWNER DECISION REQUIRED for who approves the source. |
| Opening hours | Calls inside and outside the stated hours follow a written rule. The rule is visible to the customer before launch. | No hours model in the product. The owner reports that the Retell POC tested callback preferences against opening hours. | PLANNED in the product. POC observation is OWNER-REPORTED POC — EVIDENCE PENDING. OWNER DECISION REQUIRED for the launch rule. |
| Out of hours | The caller is told whether the business will call back on the next working period. No time is promised. | The owner reports that the POC handled closed-hours requests without promising an unsupported callback time. That behaviour is not implemented in this repository. | PLANNED in the product. POC observation is OWNER-REPORTED POC — EVIDENCE PENDING. |
| Emergency | The caller is not told that emergency services have been contacted unless a human has done that. The script gives a direct route to the business or to the emergency number. | Industry examples describe urgent leaks. They are not a routing rule. | PLANNED. OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED. |
| Inappropriate calls | Abusive or clearly irrelevant calls have a stop rule that does not insult the caller and does not keep recording beyond the chosen mode. | Not implemented | PLANNED. OWNER DECISION REQUIRED |

## Failure and outage

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Failed setup | The caller hears a short failure message and the business sees a failed-call record. | Not implemented | PLANNED |
| Dropped conversation | Partial details already collected are delivered and marked incomplete. | Not implemented | PLANNED |
| Provider outage | A status check and a customer notice exist. The public homepage is not left claiming that no call is missed during a known outage. | No status page or probe | PLANNED. OWNER DECISION REQUIRED |
| Forwarding outage | The customer’s own telephone failure is distinguishable from a Telloya failure. | Not implemented | PROVIDER CONFIRMATION REQUIRED |

## Webhook, delivery, and usage

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Webhook authentication | An unsigned or wrongly signed voice event is rejected and not stored as a lead. | No voice webhook. Stripe and Resend webhooks elsewhere use signatures and are not this webhook. | PLANNED |
| Idempotency | The same provider event id applied twice creates one lead. | Enquiry submission keys are idempotent. That mechanism is not a voice event id. | PLANNED for calls. Enquiry idempotency is VERIFIED. |
| Replay | An event older than the owner-approved window, or one that is reused with a different body, is rejected. | Not implemented for voice | PLANNED. OWNER DECISION REQUIRED for the window. |
| Lead delivery | The business receives the summary by the method named in the agreement. The customer dashboard is not that method. | Copy says the dashboard is planned and delivery uses the agreed method. Portal says Telloya is not open. | PLANNED |
| Notification failure | A failed email or webhook to the business is retried or surfaced. The caller is not told the business already has the message. | Enquiry email has statuses `sent`, `suppressed`, and `unavailable`. No call-summary mailer. | Enquiry email VERIFIED in code. Call notification PLANNED. |
| Minute reconciliation | Included minutes, opt-in overage, and the spending cap are calculated from call records the customer can see. A cap stops chargeable overage. | Prices and the opt-in rule are in `apps/telloya/lib/pricing.ts`. No meter. Enquiry overage fields do not authorise billing. | PLANNED. The opt-in rule is VERIFIED as copy and as an enquiry field, not as a charge. |
| Spending cap | Overage cannot run without a stored cap and a separate acceptance from the original enquiry. | Enquiry can record interest and a cap amount. Route comments say the lead event is not billing authorisation. | IMPLEMENTED BUT UNTESTED as a preference on a disabled form. Not a billing control. |

## Support, incidents, and offboarding

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Onboarding checklist | A customer cannot be marked live until forwarding, disclosure, knowledge, and the delivery method have a recorded result. | Commercial onboarding can classify a Telloya sales enquiry. Provisioning stops before `LIVE`. | Sales classification VERIFIED. Voice onboarding PLANNED. |
| Support route | The customer has a named contact that is not the caller’s AI line. | `contact@profilerelaunch.com` is the public contact. No Telloya support queue. | PLANNED |
| Incident escalation | A voice outage, a wrong summary, and a suspected breach each have an owner and a first response step. No statutory clock is invented here. | Admin incidents exist for the wider product and disclaim an invented acknowledgement time. | PLANNED for Telloya voice. LEGAL REVIEW REQUIRED before a breach clock is written. |
| Offboarding | Forwarding is removed, the provider agent is disabled, and caller data is deleted or returned on the owner-approved schedule. | No offboarding job | PLANNED. OWNER DECISION REQUIRED |
| Customer portal | A signed-in customer does not see a Telloya workspace that looks operational. | `apps/customer/lib/portal/products/present.ts` says Telloya is not open and does not link `/portal/telloya`. | VERIFIED |

## Enquiry path that must stay closed

| Check | Acceptance criterion | Evidence now | Status |
| --- | --- | --- | --- |
| Public enquiry | `TELLOYA_ENQUIRY_ENABLED` is not `true`, so the form does not submit. | `getEnquiryCapabilities` is true only for the exact string `true`. | VERIFIED in code. This assessment does not read the Vercel dashboard. |
| Launch indexing | `TELLOYA_LAUNCHED` is not `true`, so production stays `noindex` unless both the production environment and the flag are set. | `isSitePublic` in `apps/telloya/lib/config.ts` | VERIFIED in code |
| No live call | No job, route, or script places a call. | No voice client | VERIFIED as absence |

## Acceptance bar before any pilot

A pilot is not authorised by this document. The minimum evidence still missing is:

1. A selected provider, with training and retention settings confirmed in writing.
2. One conditional-forwarding test on a number the business controls, including an answered call that must not reach the AI.
3. A disclosure script in the voice the caller actually hears, for the chosen recording mode.
4. A signed processor instruction and a completed DPIA, or a written decision that a DPIA is not required with reasons.
5. An owner-approved retention period for every category that the pilot will create.
6. A delivery method that is not the unbuilt customer dashboard.
7. A failed-call and partial-lead test.
8. Webhook signature, idempotency, and replay tests.
9. Confirmation that enquiry submission and website indexing flags stay off until their own decisions.
