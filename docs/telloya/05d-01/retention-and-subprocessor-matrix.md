# Telloya retention and subprocessor matrix

**Status:** internal decision record. No retention period in this file is approved.  
**Date:** 4 November 2026 (UK).

`lib/legal.ts` has no `retentionPeriod`. The company privacy notice therefore says enquiry and case information is kept only for as long as needed, and that the period depends on the record (`app/privacy/page.tsx`). `docs/admin/production-cutover-readiness.md` lists `retention.periods` as a deferred owner question: what period applies to each category, and which categories are kept despite a deletion request. This matrix does not answer that question with a number.

Every unapproved period is **OWNER DECISION REQUIRED**. A proposed approach describes the kind of rule the owner can set. It is not a period.

## Retention decision matrix

| Category | Purpose evidenced so far | Where it would be stored | Proposed approach | Deletion mechanism | Responsible party | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Audio recordings | Not approved. Possible purposes are the business’s record of the enquiry, dispute handling, or quality review. | Voice provider, if a setting retains audio. Not in this repository. | Do not retain until the owner chooses a purpose and a period. Default for launch planning: off. | Provider deletion API or support process, plus confirmation that backups follow the same period. Not built. | OWNER DECISION REQUIRED. Likely the business as controller and ProfileRelaunch as processor. | No recording store. `docs/customer-platform/02A-data-model.md` says no call recording is stored in the provision model. | OWNER DECISION REQUIRED. Not enabled. |
| Transcripts | Not approved. Would support a summary and correction of the lead. | Voice provider and any future lead record. Not in this repository. | Keep only if audio is not enough or is not kept, for an owner-approved period. Do not invent a shorter period and assume it is safer. | Same as audio: provider plus local row. Not built. | OWNER DECISION REQUIRED | Not found in code | OWNER DECISION REQUIRED. Not enabled. |
| AI-generated summaries | Give the business enough to call back, by the agreed method. | Intended lead store. The sales enquiry payload is a different record. | Keep for the lead’s lifetime, which the owner must define. Do not copy the company notice’s “as long as needed” into a caller-facing promise. | Future lead deletion. Admin privacy deletion does not target this row type because it does not exist. | OWNER DECISION REQUIRED | Marketing copy in `apps/telloya/lib/content.ts`. Customer portal has no Telloya lead view. | PLANNED. OWNER DECISION REQUIRED. |
| Caller details and business leads | Identify who called and how to call them back | Not implemented | Same lifetime as the summary, unless the owner splits identity from the job narrative | Not built | OWNER DECISION REQUIRED | FAQ describes the fields. No table. | PLANNED. OWNER DECISION REQUIRED. |
| Business sales enquiries | Answer the business that asked about Telloya, issue a TY reference, and support later onboarding | `public.enquiries.payload` and `public.enquiry_events` in Supabase | Follow the company notice until the owner sets a period. Do not publish a new number in the Telloya notice before that decision. | Admin privacy workflow. `PRIVACY_DELETION_ENABLED` is unset, so a request records a disposition and deletes nothing (`docs/admin/production-cutover-readiness.md`). A legal hold blocks deletion independently of the flag. | ProfileRelaunch Ltd for this enquiry, subject to legal review of the controller role | Migration `20261102200000_telloya_enquiry_infrastructure_v1.sql` and the triage migration | VERIFIED as stored when an enquiry is accepted. Retention period OWNER DECISION REQUIRED. Deletion IMPLEMENTED BUT UNTESTED while the flag is off. |
| Provider logs | Diagnose failed and dropped calls | Voice provider and any future operations log | Keep for an owner-approved support window. Confirm whether the provider’s own period is longer. | Provider setting plus contract | OWNER DECISION REQUIRED | No provider account in the repo | PROVIDER CONFIRMATION REQUIRED. OWNER DECISION REQUIRED. |
| Webhook payloads | Authenticate and apply a call event once | Not implemented. A future store would be needed for replay protection. | Store the minimum needed to detect replay, for an owner-approved window. Do not keep the full caller narrative in the webhook log if the lead record already has it. | Scheduled delete of the payload body, with the idempotency key kept only for the replay window | ProfileRelaunch, once a webhook exists | No Telloya voice webhook | PLANNED. OWNER DECISION REQUIRED. |
| Security and audit logs | Account for admin access, enquiry creation, and hosting abuse controls | Enquiry events in Supabase. Admin audit elsewhere. Vercel request logs are unconfirmed. | Owner sets the period. A security log may need to outlive the lead it describes. The owner must say whether a deletion request erases the log or only the lead. | Not specified for Telloya. Admin events are part of the general privacy design. | ProfileRelaunch Ltd | Enquiry events in the triage migration. Hosting fields are deliberately not listed in the privacy notice until confirmed. | Enquiry events VERIFIED. Hosting logs PROVIDER CONFIRMATION REQUIRED. Period OWNER DECISION REQUIRED. |
| Billing and usage records | Support an agreed subscription, included minutes, opt-in overage, and a spending cap | Commercial tables and Stripe exist for the customer platform. No Telloya minute ledger. | Keep for the period accounting and tax advice requires, which may differ from the lead period. `lib/legal.ts` records that VAT is not registered. Do not invent a tax period. | Finance retention rule, separate from lead deletion | ProfileRelaunch Ltd, after a subscription exists | `apps/telloya/lib/pricing.ts` for prices. Settlement docs say payment does not provision Telloya. | PLANNED for Telloya usage. OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED for tax. |

## Rules that apply to every row

- A blank period means “not decided”, not “keep indefinitely” and not “delete immediately”.
- No document in this pack may be copied onto a public page with a number filled in.
- Provider backups, model-training stores, and support tickets are in scope of the same decision. If the provider cannot delete them, the mode that creates them stays off.
- The business customer’s own mailbox is outside ProfileRelaunch’s deletion path once a summary has been emailed. The draft terms have to say that. LEGAL REVIEW REQUIRED.
- Relaunch Guard records, if the customer adds Guard, follow the Guard monitoring design. They are not call recordings and do not inherit a call period.

## Subprocessor schedule

This schedule is a draft inventory. It is not a signed Article 28 list and it does not authorise a new processor.

| Party | Why it would process personal data | Telloya data | Contract evidence in the repo | Location and transfer tool | Status |
| --- | --- | --- | --- | --- | --- |
| Supabase | Database for enquiries and commercial records | Business enquiry payload, TY reference, delivery status | Used by the enquiry RPC. No Telloya-specific DPA is stored in the repo. | Not recorded here | PROVIDER CONFIRMATION REQUIRED |
| Resend | Enquiry email | Business contact and enquiry content | Named in `lib/legal.ts` as `enquiryProcessorName`. No DPA document is in the repo. | Not recorded here | PROVIDER CONFIRMATION REQUIRED |
| Vercel | Hosts the Next.js applications | Request metadata. Exact fields unconfirmed. | Deployments exist. `legalIdentity.hostingProvider` is unset, so the public notice does not name it. | Not recorded here | PROVIDER CONFIRMATION REQUIRED |
| Google | Optional analytics | Page path and non-identifying lead event, only after accept | Telloya analytics code and cookie page. No property is created by this work. | Notice says the property’s retention is not established here | Not configured |
| Voice provider to be selected | Conversation, and recording or transcript only if enabled | Caller audio and text | None. Retell is not an integration. A POC is not in the repo. | None | PROVIDER CONFIRMATION REQUIRED. Not active. |
| Telephony or SIP provider to be selected | Carry the forwarded call | Call media and numbers | None. The customer’s own provider is not ProfileRelaunch’s subprocessor until ProfileRelaunch buys the number or the trunk. | None | PROVIDER CONFIRMATION REQUIRED |
| Stripe | Take payment if a Telloya subscription is later billed there | Customer billing identifiers | Customer-platform payment code, gated off. Not wired to Telloya voice. | Not assessed as a voice processor | IMPLEMENTED BUT UNTESTED for a future Telloya charge |
| AWS | Admin evidence for other products | No Telloya media path found | Not a Telloya subprocessor on current evidence | Not applicable on current evidence | Not active for Telloya calls |

Adding a voice provider, or turning on recording at that provider, is a new processing activity. It requires the DPIA to be completed, the owner’s retention decision, and a contract that covers instructions, subprocessors, location, training, and deletion. This file does not add that provider.
