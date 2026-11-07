# Telloya M-02A — Legal publication readiness

**NOT APPROVED. NOT PUBLISHED. NOT LEGAL ADVICE.**

This file is an internal review for the owner and for professional legal review. It does not approve, publish, or activate any agreement, privacy notice, tax treatment, recording mode, or provider setting. Do not link it from a customer page. Do not copy it into hosted DEV. Do not treat a recommendation in the source packs as a decision.

**Date:** 7 November 2026 (UK).
**Base:** `develop` at `feab13ff`, including merged Marketing M-01 (PR #446) and the commercial agreement pack (PR #445).
**Repository ledger record:** the Admin recovery manifest records hosted DEV at 115 entries ending at `20261106200000`. Production is unchanged. This note does not re-query hosted databases.

## What this package is

M-02A gathers the documents that already exist into one review set:

| Review file | Role |
| --- | --- |
| `legal-publication-readiness.md` | Contradictions, stale statements, and publication blockers |
| `service-agreement-review-draft.md` | Consolidated subscription wording for review |
| `privacy-and-data-processing-review-draft.md` | Enquiry, caller, and billing data for review |
| `owner-decision-register.md` | Decisions still required, with the existing recommendation left unapproved |
| `publication-and-acceptance-mapping.md` | Where an approved text would later appear |

The canonical code draft remains `telloyaDraftAgreement` (`TELLOYA-DRAFT-2026-11-1`) in `apps/admin/lib/commercial/telloya-catalogue-proposal.ts`. The fuller proposal remains `TELLOYA-PROPOSED-2026-11-1` in `docs/telloya/phase-c/06a-commercial-agreement-decision-pack.md`. Neither version ref is a hosted agreement row. This package does not edit either text and does not insert a row.

## Sources read against the current tree

- `docs/telloya/phase-c/06a-commercial-agreement-decision-pack.md`
- `docs/telloya/phase-c/draft-customer-agreement.md` and `telloyaDraftAgreement`
- `docs/telloya/phase-c/catalogue-proposal.md` and `telloyaTaxDecision`
- `docs/telloya/05d-01/draft-legal-documents.md`
- `docs/telloya/05d-01/privacy-and-dpia-screening.md`
- `docs/telloya/05d-01/retention-and-subprocessor-matrix.md`
- `docs/telloya/05d-01/owner-decisions-and-launch-blockers.md`
- Company website terms in `app/terms/content.ts` and the company privacy notice in `app/privacy/content.ts`
- Telloya footer, Cookies, Pricing, and Enquire copy
- Controlled Retell DEV notes: `docs/customer-platform/03A-03-03-02-07-initiate-agent-test-call.md`, `03A-03-03-02-08-dev-operational-readiness.md`, and `03A-03-03-02-08-02-dev-test-prerequisites.md`
- Customer offer acceptance in `docs/customer-platform/03A-02-offer-acceptance.md`

`lib/legal.ts` still forbids inventing a VAT number, a telephone number, a data-protection officer, governing law, or courts. `vatRegistered` is `false`. `vatNumber`, `governingLaw`, `courts`, `hostingProvider`, and `retentionPeriod` are unset. `enquiryProcessorName` is Resend.

## What is already fixed in the product record

These figures are approved catalogue facts. They are not a signed customer contract.

| Item | Approved value |
| --- | --- |
| Basic | £49 a month, 120 minutes |
| Growth | £79 a month, 300 minutes |
| Pro | £120 a month, 500 minutes |
| Custom | Quotation. No approved price or minute allowance |
| Standard entitlement | One operating location and one receptionist number |
| Further receptionist locations or numbers | A separate Custom quotation |
| Standard setup | Included |
| Complex setup | A separate quotation |
| Relaunch Guard | £9.99 per paid Guard location a month. A Guard-only location does not add a receptionist entitlement |
| Additional minutes | £0.25 a minute, only after a separate opt-in and a customer-defined spending cap |
| Currency | GBP is the published price. Local-currency checkout is not offered |
| Enquiry | Does not take payment, create a subscription, or authorise overage |

`telloyaTaxDecision.productionTaxBehaviour` is `null`. Status: `OWNER DECISION REQUIRED`. The local placeholder `EXCLUSIVE` exists so a draft priced row stays unofferable. The offer and settlement commands accept only `NOT_APPLICABLE`. This package does not set `productionTaxBehaviour`.

## Public surfaces today

| Surface | What a visitor sees | What it is not |
| --- | --- | --- |
| Telloya footer Privacy and Terms | `https://profilerelaunch.com/privacy` and `https://profilerelaunch.com/terms` | Telloya service terms |
| Footer note and Cookies page | Telloya voice, recording, retention, VAT, cancellation, and refund terms are unpublished and await approval | An approved supplement |
| Enquire privacy acknowledgement | The company privacy notice | A caller notice or a Telloya DPA |
| Pricing | Approved prices, one location, one number, planned dashboard, GBP, no local-currency checkout. Cancellation is deferred to a later agreement | A signed order |
| Homepage | The heading “Never Misses a Call” remains. M-01 recorded that it is unsubstantiated | A service level |
| Company terms | Website use and enquiries. Submitting an enquiry does not create a paid contract. The website does not process checkout | A Telloya subscription agreement |
| Company privacy notice | Website forms, case submissions, and Relaunch Guard setup. It does not describe Telloya call audio | A caller privacy notice |

No Telloya route serves a service agreement or a privacy supplement. Public enquiry submission stays off unless `TELLOYA_ENQUIRY_ENABLED` is set. Indexing stays off unless production and `TELLOYA_LAUNCHED` are both set. This phase sets neither flag.

## Contradictions to resolve before publication

1. **Two unapproved agreement texts.** `TELLOYA-DRAFT-2026-11-1` says the receptionist covers “the locations named on the accepted offer”. `TELLOYA-PROPOSED-2026-11-1` says a Basic, Growth, or Pro offer is one operating location and one receptionist number. The approved catalogue is the second sentence. Publishing both, or publishing the first without that limit, would contradict the location cap.

2. **Recordings.** The short draft says “call content, recordings, and business details are processed”. The recording mode is undecided. The 05D-01 drafts forbid saying audio is kept, or saying it is discarded, until the configured mode is verified. The short sentence cannot be published as written.

3. **Who may subscribe, and in which currency.** The short draft says customers outside the United Kingdom may subscribe and that a checkout page may later show a local currency. Marketing says local-currency checkout is not offered. C-06A says a local display is not a second price and is not approved, and that a UK tax rule must not be copied onto every country. International sale is not decided.

4. **What a minute is.** The pricing FAQ describes included minutes as time spent greeting, collecting details, and wrapping up, and leaves hold and transfer to “the agreed service terms”. C-06A proposes the provider’s call duration, rounded up to the next whole minute. 05D-01 leaves rounding, ringing time, and failed calls open. No minute meter exists. None of those sentences is an approved definition.

5. **Unused minutes.** C-06A recommends expiry. The short draft proposes expiry and says that treatment is not approved. Marketing does not promise rollover and does not promise expiry. Expiry is still a decision.

6. **Voice-provider evidence is newer than the November privacy pack.** `docs/telloya/05d-01/retention-and-subprocessor-matrix.md` and the DPIA screening say no voice-provider integration exists in the repository. `develop` now contains a controlled Admin web-call path to Retell `POST /v3/create-web-call`, `GET /v2/get-call/{callId}`, and `POST /v2/stop-call/{callId}`, plus a duration read before create. That path does not buy a number, place a telephone call, turn forwarding on, or prove recording, training, or deletion settings. The older “no integration” sentence is stale. Retell is still not an approved public subprocessor and not a production telephone service.

7. **Stale ledger sentences.** `docs/customer-platform/03A-02-offer-acceptance.md` still describes an earlier DEV count. The current manifest record is 115 entries ending at `20261106200000`. Use the manifest, not that older sentence.

8. **Company notices and Telloya notices.** The company privacy notice and website terms remain the only published legal pages. They do not cover call audio, minute metering, or a Telloya subscription. The footer already says so. A new link that implied otherwise would be a publication.

9. **Homepage availability claim.** The proposed agreement says the receptionist can be unavailable. The homepage heading is absolute. M-01 left the heading for an owner decision. Counsel should not be asked to defend both sentences as the same promise.

10. **Emergency calls.** Industries copy now says Telloya does not dispatch an engineer or provide an emergency response. The 05D-01 script still needs an owner-approved alternative route and must not say the AI has called the emergency services. No tested emergency behaviour exists.

## Incomplete clauses

The following are named in the source drafts and are still blank. This package does not fill them in.

- Governing law and courts
- Liability cap and service credits
- Consumer cooling-off, pro-rata refund, and partial-month credit
- A retention period for audio, transcripts, summaries, enquiry rows, provider logs, or billing records
- Lawful basis for enquiry, caller, and billing processing
- Controller or processor role, and who answers a caller’s rights request
- International-transfer tool
- Signed Article 28 terms with any processor
- Whether ProfileRelaunch Ltd is VAT registered today, beyond the repository flag `vatRegistered: false` and the absence of a VAT number
- Production tax behaviour
- Supported countries, carriers, voices, accents, and languages
- What the receptionist does when minutes or the spending cap are exhausted
- Suspension behaviour when a subscription leaves `ACTIVE`

## What this phase does not do

It does not publish a page, add a footer link, change enquiry copy, change Pricing, enable a flag, seed a catalogue or agreement row, edit a migration, call a provider, or mark `productionTaxBehaviour` approved.

## Checks recorded with this package

`apps/telloya/lib/legal-publication-readiness.test.ts` reads these five files and requires the unapproved banner. It also checks that Telloya application source does not link this folder or a `/legal/service-agreement` or `/legal/privacy` route, that the footer still points at the company notices, and that `productionTaxBehaviour` in the catalogue proposal source is still `null`.

Local commands on 7 November 2026 (UK), after those files were added:

- Telloya tests: 163 passed
- Root tests: 1027 passed, 4 skipped
- Root and Telloya typecheck: passed
- Lint: 0 errors, 7 existing warnings
- Root and Telloya production builds: passed. The Telloya route list has no legal route
- Marketing smoke: passed
- Telloya smoke: passed for `TELLOYA_LAUNCHED=false` and `TELLOYA_LAUNCHED=true`. The smoke sets that variable only inside its own process. This package does not set it in the repository
