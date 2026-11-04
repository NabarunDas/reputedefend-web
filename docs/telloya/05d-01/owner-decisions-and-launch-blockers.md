# Telloya owner decisions and launch blockers

**Status:** internal. This file does not approve launch, a headline, a lawful basis, or a retention period.  
**Date:** 4 November 2026 (UK).  
**Base:** `develop` at `9727d3cd`, including merged 05C-01 (`67ed0a98`).

Labels mean:

- **VERIFIED** — shown by current source and tests.
- **IMPLEMENTED BUT UNTESTED** — built, and not demonstrated in production by this assessment.
- **PLANNED** — described, not built.
- **PROVIDER CONFIRMATION REQUIRED** — an external fact is missing.
- **LEGAL REVIEW REQUIRED** — counsel has not adopted the conclusion.
- **OWNER DECISION REQUIRED** — the business has not chosen.

## Marketing claim: “Never Misses a Call”

The homepage heading is still the approved line **“Never Misses a Call”** (`apps/telloya/app/page.tsx`). The hero artwork, typography, and Connected T logo were not changed. The subtitle already says Telloya can help capture an enquiry when the owner cannot answer. That subtitle does not prove the heading.

The heading cannot be substantiated from this repository.

| Needed for the heading to be true | Evidence |
| --- | --- |
| Unanswered calls are forwarded | Copy only. No test. PLANNED. |
| The AI is available whenever the business does not answer | No provider uptime, capacity, or hours rule. PLANNED. |
| A forwarded call is answered rather than dropped | No call records. PLANNED. |
| The customer’s own telephone provider supports the forward | Stated as variable. PROVIDER CONFIRMATION REQUIRED for each customer. |
| “Never” survives maintenance, outages, and full minute allowances | No outage or quota behaviour. PLANNED. |

A narrower reading, “we aim to answer calls you miss”, is closer to the subtitle and to the how-it-works limits. Those limits already say forwarding can be unsuitable, that not every caller leaves details, and that callbacks and appointments are not guaranteed. The heading is absolute. The rest of the site is not.

### Wording alternatives for the owner

These are options, not a redesign. The public heading stays as it is until the owner chooses.

| Alternative | What it would claim | Commercial effect |
| --- | --- | --- |
| Keep “Never Misses a Call” | Every missed call is answered. | Strongest sales line. Highest risk if a call fails, forwarding is unsupported, minutes run out, or the provider is down. A customer could treat it as a service level. LEGAL REVIEW REQUIRED before launch. |
| “Helps when you miss a call” | Assistance, not certainty. Matches the subtitle. | Weaker headline. Easier to reconcile with provider limits and the written FAQ. |
| “Answers forwarded missed calls” | Only calls that actually arrive through forwarding. | Makes the customer’s telephone setup part of the promise. Still needs an uptime rule if “answers” is unqualified. |
| “Takes a message when you cannot pick up” | Message-taking, which is the implemented product intent. | Does not imply emergency dispatch, appointments, or a dashboard. Closest to the verified copy limits. |

**OWNER DECISION REQUIRED.** No alternative was applied to the page.

## Other claims that depend on unfinished work

| Claim in the marketing site | Where | Depends on | Status |
| --- | --- | --- | --- |
| AI receptionist collects details in a natural conversation | `apps/telloya/lib/content.ts` | A configured voice agent | PLANNED |
| Missed-call forwarding and “we’ll help you set this up” | FAQ and how-it-works | A tested onboarding path and the customer’s provider | PLANNED. PROVIDER CONFIRMATION REQUIRED. |
| Lead summary delivered | How-it-works step 05 | An agreed delivery method. The page now says the dashboard is not operational. | Wording VERIFIED. Delivery PLANNED. |
| Usage visibility and customer dashboard | Pricing and features, marked planned | A Telloya portal. The customer app says Telloya is not open. | VERIFIED as a non-claim. The capability is PLANNED. |
| Multi-language, voice, and accent | Features and FAQ | Provider voices and languages. The FAQ says they must be confirmed. | PLANNED. PROVIDER CONFIRMATION REQUIRED. |
| “Handle emergency calls while you’re on site” | Industries, plumbing tagline | An emergency script and a human route. The tagline can be read as emergency handling. | PLANNED. OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED. |
| Included monthly minutes and £0.25 overage | Pricing | A meter, a cap, and a separate opt-in. Prices themselves match `pricing.ts`. | Prices VERIFIED. Meter PLANNED. |
| GBP settlement | Pricing page says settlement is confirmed before proceeding and that there is no local-currency checkout | A payment provider and a currency decision | Wording VERIFIED. Collection OWNER DECISION REQUIRED. |
| Relaunch Guard £9.99 per location | Pricing | The existing Guard service, sold separately | Price VERIFIED as published. Not a Telloya voice feature. |
| Call recordings will be covered in terms before launch | FAQ and cookie page | This pack. Terms are still draft. | VERIFIED as a promise not to pretend the terms exist. LEGAL REVIEW REQUIRED before publication. |

## Decisions the owner still has to make

| Decision | Why it blocks launch | Status |
| --- | --- | --- |
| Whether the homepage heading stays | It is not evidenced | OWNER DECISION REQUIRED |
| Recording mode: audio, transcript only, or summary only | Scripts and the notice change with the mode. All three are off. | OWNER DECISION REQUIRED. PROVIDER CONFIRMATION REQUIRED. |
| Whether any call content may train a model | ICO guidance requires people to be told if personal data trains an AI system. Default in this pack is no. | OWNER DECISION REQUIRED |
| Retention period for each matrix row | The company identity has no period, and this pack must not invent one | OWNER DECISION REQUIRED |
| Lawful basis for the sales enquiry and for caller data | Candidates are listed. None is adopted. | LEGAL REVIEW REQUIRED |
| Controller and processor split | The business is the likely controller of caller data only if ProfileRelaunch does not use calls for its own purposes | LEGAL REVIEW REQUIRED |
| Whether a full DPIA is completed before any live call | The screen indicates one. This pack is not that DPIA. | LEGAL REVIEW REQUIRED. OWNER DECISION REQUIRED |
| Emergency and abusive-call behaviour | Industry copy uses urgent jobs. No rule exists. | OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED |
| What a billable minute is, and what happens when included minutes run out | Prices exist. No meter. | OWNER DECISION REQUIRED. PROVIDER CONFIRMATION REQUIRED |
| Overage opt-in and cap, separate from the enquiry | The form can record interest. It does not authorise charges. | OWNER DECISION REQUIRED |
| Cancellation, refunds, renewal, tax, governing law, courts, and settlement currency | Left blank so they are not invented. VAT is not registered. | OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED |
| International transfer tool for Supabase, Resend, Vercel, and any voice provider | The public notice refuses to invent one | PROVIDER CONFIRMATION REQUIRED. LEGAL REVIEW REQUIRED |
| Who handles a caller’s access, correction, and deletion request | Admin deletion is switched off, and caller records do not exist | OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED |
| Voice provider selection | Retell is not an integration. No POC is in the repository. | PROVIDER CONFIRMATION REQUIRED |
| Delivery method for summaries | Dashboard is planned, not built | OWNER DECISION REQUIRED |

## What is already true and should not be reopened by this pack

| Fact | Status |
| --- | --- |
| Sales enquiry validation, TY reference, idempotent create, and Resend code path | VERIFIED. The form stays off unless the enquiry flag is exactly `true`. |
| Enquiry table is not granted to the public roles | VERIFIED |
| Telloya analytics, if later configured, waits for consent and does not send the enquiry email, phone, or TY reference | VERIFIED |
| Marketing prices: Basic £49, Growth £79, Pro £120, Custom by quotation, Guard £9.99 per location, overage £0.25 with opt-in and a cap | VERIFIED |
| Customer portal does not open a Telloya workspace | VERIFIED |
| Website indexing stays off unless production and `TELLOYA_LAUNCHED=true` | VERIFIED |
| Payment settlement code does not provision Telloya | VERIFIED from `docs/customer-platform/03A-03-02-02-atomic-payment-settlement.md` |
| No voice webhook, recording switch, transcript store, or live call | VERIFIED as absence |
| Company privacy notice and terms remain the public legal pages | VERIFIED. These drafts are not published. |

## Launch blockers

Launch of the receptionist, as distinct from keeping the pre-launch website online, is blocked until at least:

1. The owner decides the headline and the recording mode.
2. Counsel completes or formally declines the DPIA, and adopts bases, roles, and the unpublished drafts.
3. A provider contract confirms region, training, recording, deletion, and subprocessors.
4. Retention periods are filled in by the owner. No public notice may invent them.
5. Conditional forwarding, disclosure, partial leads, and failure behaviour pass the checks in `operational-readiness.md`.
6. Summary delivery works without the unbuilt dashboard.
7. Overage cannot be charged from enquiry interest.
8. `TELLOYA_ENQUIRY_ENABLED` and `TELLOYA_LAUNCHED` remain off until separate decisions. This pack does not turn them on.

## Evidence index

| Conclusion | Source |
| --- | --- |
| Operator identity, no VAT number, no DPO, no retention period, Resend named for enquiry email | `lib/legal.ts` |
| Company notice scope, bases, subprocessors, transfers, rights | `app/privacy/page.tsx` |
| Company terms do not create a paid contract and do not take checkout | `app/terms/content.ts` |
| Telloya defers voice terms and recording | `apps/telloya/lib/content.ts`, `apps/telloya/app/cookies/content.ts` |
| Headline and subtitle | `apps/telloya/app/page.tsx` |
| Prices and overage rule | `apps/telloya/lib/pricing.ts` |
| Enquiry flag, fields, and non-billing lead event | `apps/telloya/lib/enquiry-contract.ts` |
| Enquiry persistence and TY reference | `supabase/migrations/20261102200000_telloya_enquiry_infrastructure_v1.sql` |
| Table access revoked | `supabase/migrations/20260917185905_admin_enquiry_triage_v1.sql` |
| No Retell or Twilio call in the provisioning phase | `docs/customer-platform/02A-implementation-plan.md` |
| No call recording in the provision model | `docs/customer-platform/02A-data-model.md` |
| Portal closed | `apps/customer/lib/portal/products/present.ts` |
| Deletion flag off and retention question deferred | `docs/admin/production-cutover-readiness.md` |
| DPIA indicators and AI training transparency | ICO pages cited in `privacy-and-dpia-screening.md`, read 4 November 2026 |
