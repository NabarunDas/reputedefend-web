# Telloya privacy assessment and DPIA screening

**Status:** internal draft assessment. Not a privacy notice, not an approved DPIA, and not a decision to process.  
**Date:** 4 November 2026 (UK).  
**Operator in source:** ProfileRelaunch Ltd (`lib/legal.ts`). No data-protection officer is named. `legal.ts` says not to invent one.

Uncertain legal conclusions are marked **LEGAL REVIEW REQUIRED**. They are candidates for a solicitor, not findings that the processing is lawful.

Official sources read on 4 November 2026:

- ICO, “When do we need to do a DPIA?”: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia>
- ICO, “Data protection impact assessments” in the accountability guide: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-impact-assessments/>
- ICO, “How do we ensure individual rights in our AI systems?”: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/how-do-we-ensure-individual-rights-in-our-ai-systems/>
- ICO, worker-monitoring guidance on telephone calls, which also tells organisations to inform the other party to a recorded call: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/monitoring-workers/specific-data-protection-considerations-for-different-ways-or-methods-of-monitoring-workers/>
- ICO, PECR guidance on live and automated direct-marketing calls: <https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/telephone-marketing>

The worker-monitoring page is about employers monitoring staff. It is cited because it states that people on the other end of a recorded call must be told that recording is happening and why. It is not a Telloya ruling. The PECR telephone pages are about marketing calls. Telloya’s intended use is answering a call that a person already made to a business. Whether any PECR automated-call rule also applies to that answered call is **LEGAL REVIEW REQUIRED**. This assessment does not treat Telloya as an outbound marketing campaign, and it does not conclude that PECR is irrelevant.

## Two different sets of people

| Person | What the current code does | What the intended service would do |
| --- | --- | --- |
| Business contact | Can submit an enquiry with name, email, phone, business, and commercial preferences. The form is off unless `TELLOYA_ENQUIRY_ENABLED=true`. | Would become the customer and receive lead summaries. |
| Caller | No caller record exists. | Would speak to an AI receptionist about a job, and might be recorded or transcribed if those settings are later turned on. |

Mixing these people would make the privacy notice describe the wrong data.

## Activities and candidate lawful bases

The company privacy notice already says a website submission is processed because the person asked ProfileRelaunch to look at a question, or because of a legitimate interest in answering a business enquiry and reducing abuse (`app/privacy/page.tsx`). That wording was written for ProfileRelaunch homepage, contact, Get Help, and monitoring-setup forms. It does not mention Telloya voice preferences, plan selection, or caller audio.

| Activity | Personal data | Purpose evidenced in the product | Candidate basis to review | Status |
| --- | --- | --- | --- | --- |
| Telloya sales enquiry | Business contact identity, phone, email, business details, plan and voice preferences, privacy-acceptance flag | Respond to a request for the service and create a TY reference | Steps at the contact’s request before a contract, and/or legitimate interests in handling the enquiry and preventing abuse. The existing notice uses both ideas for other forms. | LEGAL REVIEW REQUIRED. The collection path is VERIFIED and disabled by default. |
| Enquiry email | The same payload, sent through Resend | Internal notification and customer acknowledgement | Same as the enquiry, plus the processor relationship with Resend | LEGAL REVIEW REQUIRED. Code path VERIFIED. No message sent for this assessment. |
| Optional website analytics | Page path and a lead event without email, phone, or TY reference, only after accept | Measure the marketing site | Consent. The Telloya cookie page says advertising consent stays denied. | VERIFIED in code. Inactive until a measurement ID is configured. |
| Taking a message from a caller | Caller name, number, address, job description, callback preference | Give the business a lead it can follow up | If the business decides the purpose, the business’s basis might be the caller’s request for a quote or the business’s legitimate interest in answering enquiries. ProfileRelaunch would then need a processor instruction, not its own undisclosed purpose. | PLANNED. LEGAL REVIEW REQUIRED. |
| Retained audio | Recording of the caller’s voice and anything they say | Quality, disputes, or the business’s own record. No purpose is approved. | No basis is selected. Consent, legitimate interests, and a legal obligation are all untested candidates. The ICO recording example says callers are told during the call and pointed to fuller privacy information. | Not enabled. OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED. |
| Transcript without retained audio | Text of the conversation | Produce a lead summary | Same uncertainty. A transcript can be as revealing as audio. | Not enabled. OWNER DECISION REQUIRED. LEGAL REVIEW REQUIRED. |
| AI summary only | Extracted fields and a short summary | Deliver the lead by the agreed method | Likely the minimum version of the message-taking purpose. Still needs a basis and a notice. | PLANNED. LEGAL REVIEW REQUIRED. |
| Using calls to train or improve a model | Audio, text, or prompts | Not an approved purpose. ICO AI guidance says people must be told if their personal data will train an AI system. | No basis is proposed. A provider default that trains on customer content would be a new purpose. | PROVIDER CONFIRMATION REQUIRED. OWNER DECISION REQUIRED. |
| Usage and billing records | Customer identity, minutes, charges | Bill an agreed subscription and cap | Contract and, where tax or accounting law requires a record, legal obligation. VAT is not registered in `lib/legal.ts`. | PLANNED for Telloya minutes. LEGAL REVIEW REQUIRED. |
| Security logs | IP address, request time, admin actions, enquiry events | Keep the site and admin actions accountable | Legitimate interests or legal obligation, depending on the log. The public notice does not list unconfirmed hosting fields. | Enquiry events VERIFIED. Hosting log contents PROVIDER CONFIRMATION REQUIRED. |

Special-category data is not requested. A caller can still say health, religion, or other sensitive information while describing a job. The service has no filter for that. Minimisation and what the business is told to avoid collecting are **OWNER DECISION REQUIRED**.

## Controller and processor roles

These are hypotheses for review, not a completed Article 26 or Article 28 analysis.

| Processing | Working hypothesis | Why it is not settled |
| --- | --- | --- |
| Sales enquiry about buying Telloya | ProfileRelaunch Ltd is the controller. The business contact is the data subject. | The existing privacy notice does not describe this form. LEGAL REVIEW REQUIRED. |
| Caller data used only to take a message for the business | The business customer is the controller. ProfileRelaunch is a processor. The voice provider is a subprocessor. | This is true only if the customer decides the purposes and ProfileRelaunch does not use the call for its own product, training, or marketing. LEGAL REVIEW REQUIRED. |
| ProfileRelaunch using call content to improve Telloya or train a model | ProfileRelaunch would likely become a controller for that activity, even if it is a processor for message-taking. | No such use is implemented. It must not be implied by a provider default. OWNER DECISION REQUIRED. |
| Relaunch Guard monitoring | Separate Google Business Profile service. The company notice and Guard terms describe monitoring setup, not Telloya calls. | Do not fold Guard monitoring into the Telloya call notice. |

`lib/legal.ts` names Resend as the enquiry email processor and does not name a hosting provider. The draft DPA in `draft-legal-documents.md` is not signed and is not the Article 28 contract.

## Subprocessors, location, and transfers

The company notice says information may be processed in more than one country and that it does not describe a transfer mechanism (`app/privacy/page.tsx`). That statement must stay until a mechanism is actually chosen. Naming a provider is not the same as an international-transfer safeguard.

| Party | Evidence it is used | Location and transfer | Status |
| --- | --- | --- | --- |
| Supabase | Enquiry RPC and commercial schema | Project region is not recorded in this assessment | PROVIDER CONFIRMATION REQUIRED |
| Resend | Enquiry email code; named in `lib/legal.ts` | Region and transfer tool are not recorded | PROVIDER CONFIRMATION REQUIRED |
| Vercel | Application hosting | Log region and transfer tool are not recorded. The public notice does not name Vercel because `hostingProvider` is empty. | PROVIDER CONFIRMATION REQUIRED |
| Google | Optional analytics after consent | The notice says Google’s own retention setting is not established here | Not configured |
| Voice provider | None | No data processing terms, region, or training setting is on file | PROVIDER CONFIRMATION REQUIRED |
| Customer’s telephone provider | Not integrated | The customer’s own provider relationship | PLANNED |
| Stripe | Payment code exists and is gated off | Not a Telloya voice processor | IMPLEMENTED BUT UNTESTED for a future Telloya subscription |

## Controls that exist today

| Control | Evidence | Limit |
| --- | --- | --- |
| Enquiry validation and size limits | `admin_private.valid_enquiry_v1` and the Telloya validator | Applies to the sales form, not to a call |
| Idempotent enquiry create | Submission key and payload fingerprint | Does not protect a future voice webhook |
| No direct table grants on `public.enquiries` | `REVOKE ALL` and row level security in `20260917185905_admin_enquiry_triage_v1.sql` | Admin functions still return the full payload to an authorised admin session |
| Enquiry event log | Events in the enquiry migration | Not a call audit log |
| Admin privacy export, review, and legal hold | `docs/admin/production-cutover-readiness.md` | Built for the admin privacy workflow |
| Physical deletion | `PRIVACY_DELETION_ENABLED` unset. The readiness note says a privacy request records the decision and deletes nothing. | READY_DISABLED. Not a Telloya deletion run. |
| Analytics minimisation | Lead event excludes direct identifiers | Only after a real accept, and only if an ID exists |
| Public noindex | `TELLOYA_LAUNCHED` unset | Does not protect data inside the database |

No application code encrypts enquiry fields before they are stored. Platform encryption at rest is PROVIDER CONFIRMATION REQUIRED.

## Rights, correction, deletion, and incidents

The company notice tells people to use the Contact page for access, correction, erasure, restriction, objection, and portability, and says a complaint can go to a supervisory authority (`app/privacy/page.tsx`). There is no Telloya-specific rights route and no named DPO.

Admin can record a privacy request. With deletion disabled, the request does not remove the row. A legal hold blocks deletion in the database independently of the flag (`docs/admin/production-cutover-readiness.md`). That machinery has not been demonstrated on a Telloya caller record because no caller record exists.

Incident recording exists in the admin product (`apps/admin/app/incidents/page.tsx`). The page says it does not invent an acknowledgement time. A Telloya voice incident procedure is not written there. UK GDPR breach-notification timing is **LEGAL REVIEW REQUIRED** before an incident runbook states a deadline.

For a future caller, the business customer will often be the first recipient of a request. The draft DPA has to say who tells the caller, who searches the provider, and who tells the ICO. Those duties are not allocated in code.

## AI training and reuse

ICO AI guidance read for this assessment says individuals must be told if their personal data will be used to train an AI system. It also describes extra information and human-review safeguards where a decision is solely automated and has a legal or similarly significant effect.

Telloya, as described, collects a message and leaves the job decision to the business. It does not decide credit, insurance, or access to an essential service. That description is not a legal conclusion that Article 22 cannot apply. A refusal to pass on an emergency, or a summary that causes the business to reject a caller, could still affect someone. **LEGAL REVIEW REQUIRED** on Article 22 and on the explanation to give the caller.

No repository setting turns training off at Retell or any other provider, because no provider client exists. The safe operating assumption until a contract says otherwise is that call content must not be used to train a model. That assumption is an **OWNER DECISION REQUIRED**, not a verified provider setting.

## Recording options

Recording and transcription are not enabled. The three operating modes are specified in `draft-legal-documents.md`. Each one needs its own notice, provider configuration, and basis.

| Mode | What the caller must be able to understand | Additional points for review |
| --- | --- | --- |
| Audio retained | That an AI is speaking, that audio is kept, why, and where to read the notice or refuse | ICO’s call example treats a recorded message plus a route to the full notice as good practice. Objection and an alternative contact route are not built. |
| Transcript kept, audio not kept | That the conversation is turned into text and the audio is not kept | Confirm the provider actually discards audio, including backups and quality samples. PROVIDER CONFIRMATION REQUIRED. |
| No retained audio and no transcript | That an AI is taking a message and only the agreed summary is kept | Confirm the provider does not retain media by default. PROVIDER CONFIRMATION REQUIRED. |

## DPIA screening

This is a screen, using the ICO’s description of Article 35 and the WP29 indicators quoted by the ICO. It is not the DPIA itself. The ICO says a DPIA is required where processing is likely to result in a high risk, that a combination of two indicators will in most cases point that way, and that one indicator can be enough. The ICO also says to document the reason if a DPIA is not done.

Screen for the intended live service, not for the disabled sales form alone.

| Indicator | Applies to the intended receptionist? | Notes |
| --- | --- | --- |
| Evaluation or scoring | No evidence of scoring callers | Do not add lead scoring without a new screen |
| Automated decision with legal or similar significant effect | Not the stated design. The business calls back. | LEGAL REVIEW REQUIRED, especially for emergency and refusal cases |
| Systematic monitoring | A standing AI on a business line is systematic capture of communications | Strong indicator if the service goes live |
| Sensitive or highly personal data | Not requested. Callers may volunteer it. Voice is biometric-adjacent if used to identify a person. No voiceprint feature was found. | Possible |
| Large scale | Depends on customer count and call volume. Not known. | OWNER DECISION REQUIRED once volumes are forecast |
| Matching datasets | No match of caller data to another dataset was found | Re-screen if Guard or enquiry data is joined to calls |
| Vulnerable people | Tradespeople’s callers can be in distress. Industry copy uses a burst pipe as an example. | Possible |
| Innovative technology | AI conversation on a telephone call is a new technology for this operator | Indicator present |
| Preventing use of a service | Not the design, unless a failed or filtered call stops the person reaching the business | Possible if “never misses” is read as exclusive handling |

Two indicators are already visible for the intended service: innovative technology and systematic capture of calls. Vulnerable callers and possible significant effects are additional reasons, not extra conclusions. The ICO’s checklist also includes innovative technology combined with another European criterion, and invisible processing combined with another criterion. A caller who only hears a short greeting may not receive the full notice on the call.

**Screening result:** a DPIA is indicated before any live call handling, recording, transcription, or model training. This document is the screen and the list of risks. It is not the completed DPIA. Completing it is **LEGAL REVIEW REQUIRED** and **OWNER DECISION REQUIRED**.

The disabled website enquiry, by itself, resembles the existing enquiry processing and does not add AI call content. Whether that narrower activity needs its own DPIA is **LEGAL REVIEW REQUIRED**. The company process says a reason must be recorded if a DPIA is not done. That reason has not been written.

## Risks and mitigations that are not yet decisions

| Risk | Why it is plausible | Mitigation that exists | Mitigation that does not exist |
| --- | --- | --- | --- |
| Caller is not told an AI answered | The greeting is not implemented | Marketing copy says it is an AI receptionist | Opening script, provider setting, and test call |
| Recording is on by provider default | No provider account is audited | Nothing in the repo turns recording on | Written provider setting and a test that proves the chosen mode |
| Call content trains a model | Provider terms are unread | No integration, so no current flow | Contractual ban and a confirmed account setting |
| Sales enquiry is described as a caller lead | The form stores the business’s story of missed calls | Field names distinguish the business contact | Staff guidance. Not a technical control. |
| Company privacy notice is too narrow | It omits Telloya fields and call data | Telloya pages say a specific notice will come before launch | Approved notice and a link the caller can use |
| Emergency is treated as an ordinary lead | Industry examples include urgent leaks | Copy does not promise to dispatch emergency services | Script, escalation rule, and owner decision |
| International transfer has no tool | The notice already refuses to invent one | Honest silence | Provider regions and a chosen safeguard |
| Deletion request cannot be executed | Deletion flag is off and caller data has no store | Requests can be recorded | Approved retention, a deletion run, and provider deletion |
| “Never Misses a Call” overstates availability | No forwarding or provider uptime is evidenced | The subtitle is narrower: help when the owner cannot answer | Owner decision on the headline. Recorded in the claims note. |

## What this assessment does not do

It does not publish a notice, turn on recording or transcription, set a retention period, name a lawful basis as decided, change Supabase, or enable the enquiry or launch flags.
