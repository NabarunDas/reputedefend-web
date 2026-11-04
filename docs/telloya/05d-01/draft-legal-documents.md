# Telloya draft legal documents

**DRAFT. INTERNAL. NOT FOR PUBLICATION. NOT LEGALLY APPROVED.**

**Date:** 4 November 2026 (UK).  
**Operator shown in source:** ProfileRelaunch Ltd, company number 17520826, registered in England and Wales, registered office 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, trading as ProfileRelaunch. Contact email `contact@profilerelaunch.com`. VAT is not registered. No data-protection officer, telephone number, governing law, or court is named in `lib/legal.ts`, and none is invented here.

The drafts are not **VERIFIED** legal advice. They are not **IMPLEMENTED BUT UNTESTED** product behaviour. Publication is **PLANNED** only after counsel and the owner approve them. These drafts sit beside the company-wide privacy notice and terms (`app/privacy/page.tsx`, `app/terms/content.ts`). They do not replace them. The company terms cover the ProfileRelaunch website and say that submitting an enquiry does not create a paid contract and that the website does not process checkout. The company privacy notice describes homepage, contact, Get Help, and Relaunch Guard setup. It does not describe Telloya call audio. Telloya’s own pages already say a specific voice, recording, and retention notice will be published before launch. Publishing any section below would contradict that statement until counsel and the owner approve it.

Square brackets and every **OWNER DECISION REQUIRED**, **LEGAL REVIEW REQUIRED**, and **PROVIDER CONFIRMATION REQUIRED** placeholder are unresolved. They must be completed and then removed before any of this text is published. A published page must not contain the placeholder, the bracket, or an unapproved period or legal conclusion. Until that happens, this file stays internal. No processing mode and no retention period in this draft is approved.

## 1. Telloya Service Terms

**DRAFT. NOT A CONTRACT.**

These terms would cover the Telloya AI receptionist supplied by ProfileRelaunch Ltd to a business customer. They would not cover Profile Recovery, Review Protection, or the company website’s enquiry forms, except where a Telloya order also includes Relaunch Guard.

### Service

Telloya is intended to answer calls that the customer’s telephone service forwards because the customer did not answer, to hold a conversation that collects enquiry details, and to deliver a summary by the method named in the order. The current software does not do this. A contract must not describe it as already available.

The service does not confirm an appointment, promise that a person will call back, or contact emergency services. The customer follows up.

### Plans

Published marketing prices, which are not by themselves an order, are:

| Plan | Published price | Included minutes |
| --- | --- | --- |
| Basic | £49 per month | 120 |
| Growth | £79 per month | 300 |
| Pro | £120 per month | 500 |
| Custom | Quotation | Stated in the quotation |

Source: `apps/telloya/lib/pricing.ts`. A quotation or order would restate the figures. The marketing page is not the order. The customer-platform offer record is a separate object and must match the signed figures. **LEGAL REVIEW REQUIRED** on whether a website price is an offer.

Relaunch Guard, if the customer adds it, is £9.99 per location per month for Google Business Profile monitoring. It is a separate service. It is not call recording and it does not include Telloya minutes.

### What is not included

- A replacement business telephone number, unless an order says so.
- Conditional forwarding on the customer’s own telephone service. The customer configures that service. ProfileRelaunch can provide guidance. Compatibility is not guaranteed.
- A customer dashboard. Usage visibility in a dashboard is planned and is not operational.
- Local-currency checkout or conversion. Published prices are in GBP. The currency and method of settlement are confirmed before the customer proceeds. **OWNER DECISION REQUIRED.**
- Unused-minute rollover. No rollover promise is made. **OWNER DECISION REQUIRED** if a later plan adds one.
- Overage. Interest on an enquiry form does not authorise extra minutes. See the usage schedule.

### Availability

The service depends on the customer’s telephone provider, the voice provider, and network conditions. It does not promise that every call is answered. The homepage sentence “Never Misses a Call” is not a service level. **OWNER DECISION REQUIRED** before that sentence remains public at launch. See `owner-decisions-and-launch-blockers.md`.

### Unresolved commercial terms

The following are deliberately blank:

- Cancellation rights and notice: **OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED.**
- Refunds: **OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED.**
- Renewal and what happens at the end of a paid period: **OWNER DECISION REQUIRED.**
- Taxation, including VAT if registration later changes: **OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED.** `lib/legal.ts` records that VAT is not registered.
- International settlement and non-GBP collection: **OWNER DECISION REQUIRED.**
- Governing law and courts: **OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED.** Not stated, because `lib/legal.ts` forbids inventing them.

## 2. Telloya privacy notice

**DRAFT SUPPLEMENT. NOT FOR THE WEBSITE.**

This supplement would be read with the ProfileRelaunch privacy notice. If the two conflict on call audio, transcripts, or caller leads, this supplement would prevail only after it is approved and published. Until then, the company notice and the Telloya “terms will be published before launch” statement remain the public position.

### Who we are

ProfileRelaunch Ltd, as identified above, operates the Telloya website and would operate the receptionist. For a business’s sales enquiry, ProfileRelaunch expects to be the controller. For a caller’s details collected on the business’s behalf, the working hypothesis is that the business is the controller and ProfileRelaunch is the processor. **LEGAL REVIEW REQUIRED.** This draft does not close that question.

### Business enquiries

If online enquiry is enabled, the form can collect the business name, country, trade, locations, website, the contact’s name, email and phone, the missed-call problem, phone setup, plan, Guard interest, voice and language preferences, and whether the contact wants to discuss overage. It stores a privacy-acceptance flag and a TY reference. Online enquiry is currently off unless `TELLOYA_ENQUIRY_ENABLED` is exactly `true`.

Purpose: to respond to the request and, if the business later agrees, to prepare the service. Candidate bases: steps at the contact’s request before a contract, and legitimate interests in answering the enquiry and limiting abuse. **LEGAL REVIEW REQUIRED.** The company notice uses similar language for other forms and does not list these fields.

### Caller information

If the receptionist is later switched on, a caller may be asked for a name, a callback number, the place and nature of the job, and when they prefer a call back. The business would receive a summary by the agreed method. No caller store exists today. No purpose is carried out.

Audio recording and transcription are not enabled. The disclosure draft states the three possible modes. The notice must match the mode that is actually configured. A notice that says “calls may be recorded” while the account retains every call, or retains none, would be inaccurate.

### Training

Call content is not to be used to train a model unless the owner approves that purpose and the caller is told, in line with the ICO’s statement that people must be informed if their personal data will train an AI system. No provider setting currently proves training is off. **PROVIDER CONFIRMATION REQUIRED. OWNER DECISION REQUIRED.**

### Other recipients

The draft subprocessor list is in `retention-and-subprocessor-matrix.md`. The company notice already names Resend and Supabase for specified website processing and says a transfer mechanism is not described. This supplement must not add a country or a safeguard that has not been confirmed.

### Rights

The company notice already tells people how to ask for access, correction, erasure, restriction, objection, and a copy, and how to complain to a supervisory authority. A Telloya supplement should repeat the contact email and say whether a caller should write to the business or to ProfileRelaunch. That routing is **LEGAL REVIEW REQUIRED**. Physical deletion in the admin tool is switched off.

### What this supplement must not say

- That a retention period exists, until the owner sets one.
- That recording is optional for the caller, until an opt-out is built.
- That Telloya is the emergency services.
- That analytics runs without consent. The cookie page already says it does not.

## 3. Data processing agreement and subprocessors

**DRAFT. NOT SIGNED. NOT AN ARTICLE 28 AGREEMENT.**

This draft is the schedule a business customer would sign if ProfileRelaunch processes caller personal data for that business. It does not cover the business contact’s own sales enquiry, where ProfileRelaunch is the likely controller.

### Instructions

ProfileRelaunch would process caller data only to answer forwarded calls, produce the agreed summary, deliver it by the agreed method, and keep it for the period in the retention matrix once the owner has filled that period in. It would not sell caller data, and it would not use caller data to train a model unless the instruction says so. The instruction does not say so.

### Roles left open

- Whether the parties are controller and processor, or joint controllers: **LEGAL REVIEW REQUIRED.**
- Who informs the caller: **OWNER DECISION REQUIRED.**
- Who answers a caller’s rights request, and within what time: **LEGAL REVIEW REQUIRED.** No statutory number is inserted here.
- Who notifies the ICO and the customer of a breach: **LEGAL REVIEW REQUIRED.**

### Security

The draft can honestly say that sales enquiries are written through a restricted database function, that direct table access is revoked, and that admin access requires an admin session. It cannot say that call audio is encrypted or segregated, because no call store exists. Platform encryption is **PROVIDER CONFIRMATION REQUIRED.**

### Subprocessors

The customer authorises only the parties in the matrix, after each party’s location and terms are confirmed. A voice provider is not on the authorised list. Adding one is a change of this draft, not a configuration detail.

### Deletion and return

On exit, ProfileRelaunch would delete or return caller data in the owner-approved way, and would ask confirmed subprocessors to do the same. The business’s own mailbox is outside that deletion. Admin physical deletion is currently disabled, so this clause cannot be performed for the sales-enquiry database until that control is deliberately enabled and tested.

### International transfers

No transfer tool is named. The clause stays blank until counsel selects one. **LEGAL REVIEW REQUIRED.**

## 4. AI calling and recording disclosure

**DRAFT SCRIPTS. NOT LOADED INTO A VOICE PROVIDER. RECORDING AND TRANSCRIPTION ARE NOT ENABLED.**

The caller should hear that an AI is speaking before the caller is asked for a name or a problem. The ICO’s call-recording example, written in its worker-monitoring guidance, says people on the call are told that recording is happening and why, and are given a route to the rest of the privacy information. That example is not a Telloya determination. **LEGAL REVIEW REQUIRED.**

Alternative contact, for every script: the caller can ring the business again and ask for a person, or use the contact route the business prints on its own site or van. Telloya does not have a separate human queue. If the business has no other route, the script must not pretend that it does. **OWNER DECISION REQUIRED** for the words that name that route.

### Opening, all modes

> Hello. You’ve reached [business name]. I’m Telloya, an AI receptionist from ProfileRelaunch, answering because [business name] could not take this call. I can note what you need and pass it to them. I can’t book a time or promise when they will call you back.

The business name is required. A script that says only “AI receptionist” without the business is not enough for the caller to know who will receive the note.

### If audio recording is enabled

> This call’s audio will be kept by the service so [business name] has a record of what was said. It is kept for [OWNER DECISION REQUIRED]. You can ask [business name] or ProfileRelaunch about access or deletion using [route]. If you do not want the audio kept, please say so now and we will stop, or contact [business name] another way.

Do not use this script until a provider test shows that audio is actually retained and that “stop” is implemented. An objection with no technical effect is **LEGAL REVIEW REQUIRED** before use. Candidate bases are not chosen.

In every mode, including a mode that keeps no recording and no transcript, the voice provider processes the caller’s audio temporarily in order to hold the conversation. “Not retained” means the audio is not kept after that processing. It does not mean the audio never reaches the provider. Temporary processing, and how long any buffer lasts, is **PROVIDER CONFIRMATION REQUIRED**. It is not an approved retention period.

### If the conversation is transcribed and audio is not kept

> I will turn this conversation into text for [business name]. The audio is used to hold this conversation and is not kept afterwards. The text is kept for [OWNER DECISION REQUIRED]. If you do not want a transcript made, please say so now and we will stop, or contact [business name] another way.

Do not use this script until the provider confirms that audio, including samples and backups, is not retained after the temporary processing needed for the call. **PROVIDER CONFIRMATION REQUIRED.** The retention period in the script is not approved.

### If no audio and no transcript are retained

> I will only pass on a short summary of the details you give, such as your name, number, and what you need. The audio is used during this conversation. I am not keeping a recording or a full transcript afterwards. The summary is kept for [OWNER DECISION REQUIRED].

Do not use this script until the provider confirms that the platform does not retain audio or a transcript after the temporary processing needed for the call. **PROVIDER CONFIRMATION REQUIRED.** The retention period in the script is not approved.

### Emergency and opt-out

> If this is an emergency, do not rely on this message. Contact the emergency services or [business name] directly on [number].

The emergency number and the business number are **OWNER DECISION REQUIRED**. The script must not say the AI has called the emergency services.

Possible objections to record for counsel, without treating them as a completed opt-out design:

- The caller refuses to speak to an AI.
- The caller refuses recording or transcription.
- The caller asks for a person and nobody is available.
- The caller asks who will hear the summary.

Each one needs a behaviour, not only a sentence. **OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED.**

### Provider settings that would be required later

| Mode | Setting to prove | Notice the caller needs | Status |
| --- | --- | --- | --- |
| Audio on | Recording enabled, retention matches the owner’s period, training off unless approved | AI identity, that audio is kept, why, period, and a route to the notice | Not enabled |
| Transcript only | Audio is processed for the call and then discarded, including samples and backups. Transcript retention matches the period. Training off unless approved. | AI identity, that text is kept, and that audio is used during the call and not kept afterwards | Not enabled. Period unapproved. |
| Summary only | Audio is processed for the call. Both the recording and any transcript are discarded afterwards. Training off unless approved. | AI identity, that audio is used during the call, and that only a summary is kept | Not enabled. Period unapproved. |

Lawful basis for each mode: **LEGAL REVIEW REQUIRED.** No basis is selected in this draft.

## 5. Subscription and usage-policy schedule

**DRAFT. NOT A BILLING AUTHORISATION.**

### Included use

A paid plan would include the minutes in the order, for answered Telloya time on forwarded calls. What counts as a minute is **PROVIDER CONFIRMATION REQUIRED**. Rounding, ringing time, and failed calls are **OWNER DECISION REQUIRED**. The marketing figure is not that definition.

### Overage

Extra minutes are £0.25 per minute only if the customer later opts in and agrees a monthly spending cap. An enquiry field, a ticked interest box, or a conversation with sales does not opt in. The API comment on the lead event says it is not billing authorisation (`apps/telloya/lib/enquiry-contract.ts`).

Until that separate agreement exists, the service must stop or stop being charged when the included minutes are used. The stop rule is **OWNER DECISION REQUIRED**. No meter exists.

### Cap

The cap is a maximum extra charge for the period, not a target. Who can raise it, and whether a raised cap applies mid-period, is **OWNER DECISION REQUIRED**.

### Guard

Guard is billed per location at the published £9.99 only if the customer adds it in the order. Guard monitoring is not Telloya airtime.

### Custom

A custom plan has no default price and no default minute allowance. Both are quotation fields.

### Still blank

Cancellation, refunds, renewal, price changes, tax, and the currency actually collected are **OWNER DECISION REQUIRED** and **LEGAL REVIEW REQUIRED**. GBP is the published price, not a promise that settlement happens in GBP.

## 6. Customer onboarding and call-forwarding responsibilities

**DRAFT CHECKLIST. NOT AN ONBOARDING CONTRACT.**

Before a location is treated as live, the customer and ProfileRelaunch would each have to complete the following. The current provisioning design does not allow that live state. No step below has been performed.

### Customer

- Confirm the legal name, the trading name callers should hear, and the number that stays the public business number.
- Confirm that their telephone provider can forward only unanswered calls, and apply that setting themselves.
- Provide the facts the AI may say, and the facts it must not invent, including prices and coverage.
- Choose opening hours and the out-of-hours sentence.
- Choose the summary delivery method. “Dashboard” is not available.
- Name an emergency and a human contact route that is not the AI.
- Approve the disclosure script for the recording mode that will actually be used.
- If Guard is included, complete the separate Guard setup. That setup does not activate Telloya.
- If overage is wanted, sign the usage schedule and a cap. The enquiry form is not that signature.

### ProfileRelaunch

- Do not enable recording, transcription, or training while those settings are undecided.
- Run a test in which an answered call stays with the customer and an unanswered call reaches the AI.
- Run a test in which the caller hears the AI disclosure before personal details are requested.
- Deliver one test summary by the agreed method and record the result.
- Leave `TELLOYA_ENQUIRY_ENABLED` and `TELLOYA_LAUNCHED` unchanged until their own launch decisions.
- Refuse to mark the location live if forwarding, disclosure, or delivery failed.

### Shared

- Either party can stop onboarding if the telephone provider cannot support conditional forwarding. The how-it-works copy already says Telloya may then be unsuitable.
- Neither party tells callers that a person will attend at a stated time.
