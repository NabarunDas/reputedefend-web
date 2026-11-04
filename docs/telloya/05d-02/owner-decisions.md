# Telloya voice pilot decision register

**Status:** recommendations only. Nothing in this register is approved.  
**Date:** 4 November 2026 (UK).  
**Baseline:** `docs/telloya/05d-01/owner-decisions-and-launch-blockers.md`. Legal conclusions stay in that pack.

Each row has a recommendation so implementation can wait on a yes or a no. A recommendation is not a decision.

| Gate | Recommendation | Why it is not approved | Status |
| --- | --- | --- | --- |
| Voice provider | Keep investigating Retell for the DEV pilot because the owner reported a successful POC. Do not treat that report as the selection. | No configuration export, agent version, or settings sheet is in the repository. Twilio is not selected either. | OWNER DECISION REQUIRED. PROVIDER CONFIRMATION REQUIRED. OWNER-REPORTED POC — EVIDENCE PENDING. |
| Audio and transcript retention by us | Do not store audio or a transcript in the application. | The schema in `lead-data-and-security-contract.md` is a proposal. It has no migration. | OWNER DECISION REQUIRED. |
| Audio and transcript retention by the provider | Do not run a sandbox call with real audio until the account shows that retained audio and retained transcripts are off, or the owner explicitly chooses another mode. | The POC report does not include these settings. Temporary processing during the call still happens. | PROVIDER CONFIRMATION REQUIRED. OWNER DECISION REQUIRED. |
| AI training and data reuse | Leave training off. Do not use call content to improve a model. | No account setting or contract clause is on file. ICO guidance cited in the 05D-01 pack says people must be told if their data trains a model. | OWNER DECISION REQUIRED. PROVIDER CONFIRMATION REQUIRED. |
| Lead retention duration | Do not publish or code a period. Build the column `created_at` so a later job can enforce whatever period is chosen. | `lib/legal.ts` has no retention period. 05D-01 forbids inventing one. | OWNER DECISION REQUIRED. |
| Caller disclosure | Use the 05D-01 summary-only script, including the sentence that audio is used during the call and not kept afterwards, only after counsel edits the placeholders out. | The script is a draft. Placeholders must be completed and removed before anyone hears it. | LEGAL REVIEW REQUIRED. OWNER DECISION REQUIRED. |
| Controller and processor | For caller leads, document the business as controller and ProfileRelaunch as processor. For the sales enquiry, ProfileRelaunch remains the likely controller. | 05D-01 marks both roles as hypotheses. | LEGAL REVIEW REQUIRED. |
| DPIA | Finish the DPIA, or write the reason for not doing one, before any real caller is handled. The 05D-01 screen already indicates a DPIA for the live service. | This blueprint is not that DPIA. | LEGAL REVIEW REQUIRED. OWNER DECISION REQUIRED. |
| Emergency handling | The agent tells the caller it cannot contact emergency services and names the route the business supplies. It does not claim that help has been dispatched. | No approved sentence or number exists. Scenario 10 stays blocked. | OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED. |
| Callback delivery | Email the structured summary to the business with the durable enquiry notification pattern. Do not wait for the customer dashboard. | The recipient address, the from-address, and whether DEV mail is suppressed are not chosen. | OWNER DECISION REQUIRED. |
| Pilot eligibility | One DEV tenant, synthetic data first, then at most a number the business controls. No customer who has only submitted a sales enquiry. | Eligibility is a commercial choice. Enquiry interest is not a pilot agreement. | OWNER DECISION REQUIRED. |
| Success criteria | Phase 1 mocks pass for the scenarios that do not need a provider, including ended-then-analyzed and the usage-gap cases. Phase 3, if approved, shows one sandbox call, one lead, no stored transcript, and no production credential. | Success of the historical POC is not this criterion. | OWNER DECISION REQUIRED. |
| Overage and a hard cap | Leave overage off until Retell can refuse or limit a call before the minutes are consumed. A post-call webhook only reconciles. The soft-stop rule for a call already in progress is still unchosen. | No provider admission test exists. Enquiry interest is not authorisation. | OWNER DECISION REQUIRED. PROVIDER CONFIRMATION REQUIRED. |

## Already settled in the repository

These are facts about the current code. They are not new approvals.

| Fact | Evidence |
| --- | --- |
| No voice integration is implemented. The Retell POC is owner-reported and unverified here. | `docs/telloya/05d-01/architecture-and-data-flow.md` |
| Sales enquiry and caller lead are different records. | `public.enquiries` and the absent lead table |
| `service_provisions` cannot be `LIVE` today. | `service_provisions_live_closed` in `supabase/migrations/20261101170000_commercial_foundation_v1.sql` |
| The customer portal does not open Telloya. | `apps/customer/lib/portal/products/present.ts` |
| Published prices and the opt-in overage rule | `apps/telloya/lib/pricing.ts` |
| Enquiry and launch flags are on only when the value is exactly `true`. | `apps/telloya/lib/enquiry-contract.ts`, `apps/telloya/lib/config.ts` |

## Still blocking a real caller

1. Provider selection and the POC evidence list.
2. A confirmed recording, transcription, training, and retention setting.
3. An approved disclosure script with no placeholders.
4. A DPIA outcome.
5. An emergency rule.
6. A delivery address and a suppressed-or-real mail decision for DEV.
7. A retention period, still without a number in this pack.
8. Separate approval to add the migration, and another approval to register a DEV webhook.

This blueprint does not grant those approvals.
