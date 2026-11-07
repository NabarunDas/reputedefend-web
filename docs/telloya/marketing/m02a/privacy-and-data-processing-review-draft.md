# Telloya privacy and data processing — review draft

**NOT APPROVED. NOT PUBLISHED. NOT LEGAL ADVICE.**

This is an internal supplement for the owner and for counsel. It is not a privacy notice, not a data-processing agreement, and not a lawful-basis decision. Do not publish it. Do not tell a caller or a business customer that a retention period, a deletion promise, or a training ban has been verified.

**Date:** 7 November 2026 (UK).

The company privacy notice at `app/privacy/content.ts` remains the published notice for the ProfileRelaunch website. It covers website forms, case submissions, and Relaunch Guard setup. It does not describe Telloya call audio. The Telloya Cookies page describes storage on the marketing site only. This draft does not replace either page.

No lawful basis is selected below. Candidate bases in the 05D-01 drafts stay candidates. **LEGAL REVIEW.**

## 1. Sales enquiries from potential business customers

**What exists.** A Telloya enquiry can store a business contact, the requested plan, Guard interest, voice and language preferences, and an overage interest with a proposed cap. The stored reference format is `TY-` plus a year marker and a short code. Public submission is off unless `TELLOYA_ENQUIRY_ENABLED` is set. This phase does not set it.

**Working hypothesis, not a conclusion.** ProfileRelaunch Ltd is the controller of that enquiry. The business contact is the data subject. **LEGAL REVIEW.** The company privacy notice does not describe this form. The enquiry acknowledgement currently links to that company notice.

**Purpose evidenced so far.** To review the request and reply. An enquiry does not create a subscription, take payment, or authorise overage or Guard.

**Retention.** **OWNER DECISION.** The company notice says enquiry information is kept only for as long as needed and does not give a number. This draft does not add a number. Admin physical deletion stays off while `PRIVACY_DELETION_ENABLED` is unset, so a privacy request can record a disposition and still delete nothing. A legal hold can block deletion independently of that flag.

**Processors named, without a Telloya DPA in the repo.** Resend sends enquiry email and is named in `lib/legal.ts`. Supabase stores the enquiry payload. No Telloya-specific Article 28 contract is in the repository. Location and transfer tool are **PROVIDER CONFIRMATION**.

## 2. Caller information processed by the AI receptionist

**What does not exist as a live service.** No production telephone route answers customer calls. No caller-recording store is approved. No retention period is approved. The customer dashboard for call history is planned and is not live.

**Working hypothesis, not a conclusion.** For a message taken for the business, the business customer would be the controller and ProfileRelaunch would be a processor, and the voice provider would be a subprocessor. That holds only if ProfileRelaunch does not use the call for its own product, training, or marketing. **LEGAL REVIEW.** If ProfileRelaunch used call content to improve Telloya or train a model, it would likely be a controller for that activity. No such use is approved. **OWNER DECISION.**

### AI voice disclosure

**Proposed script requirement, not loaded into a provider.** Before the caller is asked for a name or a problem, the caller hears that an AI is speaking and how the call is handled.

**OWNER DECISION. LEGAL REVIEW.** The alternative route, if the caller does not want to continue, is not chosen. Telloya has no separate human queue. The script must not invent one. It must not say the AI has called the emergency services.

### Recording, transcription, and summary-only processing

Three unpublished modes are already written in `docs/telloya/05d-01/draft-legal-documents.md`. None is selected. None is enabled.

| Mode | What would have to be true before the words are used | Status |
| --- | --- | --- |
| Audio retained | The provider retains audio for an owner-chosen period, and the caller is told that audio is kept, why, and where to read the notice | Not enabled. Period not chosen |
| Transcript kept, audio not kept | The provider confirms audio, including samples and backups, is not kept after the call, and the transcript period is chosen | **PROVIDER CONFIRMATION.** Not enabled |
| Summary only | The provider confirms that audio and any transcript are not kept after the temporary processing the conversation needs, and only the agreed summary is kept | **PROVIDER CONFIRMATION.** Not enabled |

Temporary processing is not the same as “no audio reached the provider”. How long any buffer lasts is **PROVIDER CONFIRMATION**. This draft does not say recordings or transcripts are deleted.

The short customer-agreement draft says recordings are processed. That sentence is broader than any verified mode. Do not publish it.

### AI model training and data reuse

**OWNER DECISION.** The operating assumption in the DPIA screening is that call content is not used to train a model unless the owner approves that purpose and the caller is told. That assumption is not a verified provider setting.

**PROVIDER CONFIRMATION.** No repository control reads or sets a Retell training, data-reuse, or recording flag. The Admin web-call path does not call an agent-update API.

**LEGAL REVIEW.** Article 22 is not decided. The described service leaves the job decision to the business. That description is not a conclusion that Article 22 cannot apply.

### Safe treatment of emergency calls

**OWNER DECISION. LEGAL REVIEW.** A caller may describe an urgent or safety-related job. The marketing pages say Telloya does not dispatch anyone and does not provide an emergency response. There is no tested script, no emergency-number behaviour, and no filter for information a caller volunteers. Do not claim a safe emergency outcome.

## 3. Customer billing, usage, and account records

**What exists.** Commercial tables can store an offer, an acceptance, plan conditions, and a later subscription state. Telloya plans, agreements, and subscriptions are not seeded as approved customer rows. No Telloya minute ledger exists. Stripe settlement for this service is not enabled.

**Working hypothesis, not a conclusion.** ProfileRelaunch Ltd would be the controller of its own billing and account records. **LEGAL REVIEW.**

**Retention.** **OWNER DECISION. LEGAL REVIEW.** Accounting or tax rules may require a different period from the caller-summary period. `vatRegistered` is `false` and no VAT number is stored. This draft does not invent a tax period. `productionTaxBehaviour` stays null.

Usage figures must not be shown to a customer as measured minutes until a meter exists and the measurement rule is chosen.

## Controller and processor duties still open

| Duty | Status |
| --- | --- |
| Who is controller for the sales enquiry | Hypothesis: ProfileRelaunch. **LEGAL REVIEW** |
| Who is controller for caller data | Hypothesis: the business customer. **LEGAL REVIEW** |
| Who informs the caller | **OWNER DECISION** |
| Who answers a caller’s access, correction, erasure, restriction, objection, or copy request, and in what time | **LEGAL REVIEW.** No statutory number is inserted |
| Who notifies the customer and the ICO of a breach | **LEGAL REVIEW.** The Admin incident page does not set a Telloya deadline |
| Joint-controller terms, if any | **LEGAL REVIEW.** Not written |

The company notice already tells website users to use the Contact page and says a complaint can go to a supervisory authority. There is no named data-protection officer. `dpoEmail` is unset. This draft does not invent one.

A caller rights request cannot be run against a caller record, because no approved caller record exists. The business customer’s own mailbox is outside ProfileRelaunch’s deletion path once a summary has been sent. **LEGAL REVIEW** on how the agreement says that.

## Subprocessors and international transfers

This is an inventory, not an authorised processor list and not a transfer safeguard.

| Party | Telloya role evidenced now | Status |
| --- | --- | --- |
| Supabase | Enquiry and commercial database | Used. No Telloya DPA in the repo. Region **PROVIDER CONFIRMATION** |
| Resend | Enquiry email. Named in `lib/legal.ts` | No DPA document in the repo. Region **PROVIDER CONFIRMATION** |
| Vercel | Hosts the applications | `hostingProvider` is unset, so the public notice does not name Vercel. Log contents **PROVIDER CONFIRMATION** |
| Google | Optional analytics after consent on the marketing site | Not a voice processor. Retention of the Google property is not established here |
| Stripe | Customer-platform payments, gated off | Not wired as a Telloya voice processor. **IMPLEMENTED BUT UNTESTED** for a future Telloya charge |
| Retell | Controlled Admin web-call test path only. See the evidence section | Not an approved production subprocessor. Recording, training, retention, and region **PROVIDER CONFIRMATION** |
| Customer’s telephone provider | Not integrated | The customer’s own provider. Not ProfileRelaunch’s subprocessor unless ProfileRelaunch buys the number or the trunk |
| AWS | No Telloya media path found | Not a Telloya call processor on current evidence |

The company notice says information may be processed in more than one country and does not describe a transfer mechanism. That statement stays until counsel selects a mechanism. **LEGAL REVIEW.** Naming a provider is not a safeguard.

## Security and incident notification

**Can be said of the sales enquiry.** Enquiries are written through a restricted database function. Direct table access is revoked. An admin session is required for admin access. Enquiry events are stored. Validation and a submission key exist.

**Cannot yet be said of call audio.** No approved call store exists. Platform encryption is **PROVIDER CONFIRMATION**. No application code encrypts enquiry fields before storage.

**LEGAL REVIEW.** A Telloya voice incident procedure is not written. Do not state a breach-notification deadline in a customer document until counsel sets it.

## Voice-provider evidence

Use the current Admin implementation, not the November 2026 sentence that said no provider client exists.

### Implemented technical controls

- Admin can prepare a controlled web conversation only after a verified paid subscription, preferences, an AI configuration revision (`rev-` plus four digits), a recorded allocation, shared forwarding instructions, and `TEST_REQUIRED`. Each step has its own flag. The initiation flag `ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED` is not enabled by this phase.
- The server sends `agent_id` and the numeric `agent_version` to Retell `POST /v3/create-web-call`. It does not send `latest`. Connection fields are returned once and are not stored. The browser uses `retell-client-js-sdk` 3.0.4 and does not receive the API key.
- End, cancel, and status use `POST /v2/stop-call/{callId}` and `GET /v2/get-call/{callId}`. The call id is a lookup against the stored binding.
- On the dev lane, create stays closed unless `GET /get-agent/{agent_id}?version=` reports `max_call_duration_ms` from 60000 through 300000 for that same version. The read does not update the agent.
- `apps/telloya/lib/voice/` can verify a Retell webhook signature and project an event. It does not add a live webhook route and it does not prove a production tenant.
- The migration `20261106200000` is recorded as applied once on DEV. It created zero test attempts. It is not applied to Production by this package. Do not replay it.

### Not provider-confirmed

| Claim | Why it stays unverified |
| --- | --- |
| Supported countries and carriers | No country or carrier list is verified. Marketing does not name one |
| Available voices, accents, and languages | Preferences can be requested. No provider catalogue is confirmed |
| Recording and transcript settings | No API read of those settings is implemented. The three modes are drafts |
| Training and data reuse | No setting is read or set. The “training off” assumption is an owner position, not a provider confirmation |
| Retention and backup deletion | No period is chosen. No deletion test against the provider, including backups and samples, has been recorded |
| Call usage metering | No meter posts duration into a Telloya minute balance. Rounding is undecided |
| Provider outages and forwarding failures | The test path can fail before create, or leave a location in `TEST_REQUIRED`. That is not a customer outage promise |
| Emergency calls | No script is loaded and no emergency behaviour is tested |
| Telephone calls | The implemented path is a web call. It does not buy a number, place a telephone call, or turn forwarding on |

Do not publish Retell as a partner. Do not put an API key, a telephone number, an agent id, or caller content in a customer document. Credential names may be discussed internally. Values must not.

The earlier owner-reported proof of concept remains evidence pending. It is not this Admin test path and it is not production readiness.
