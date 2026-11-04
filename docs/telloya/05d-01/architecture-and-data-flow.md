# Telloya architecture and data flow

**Status:** internal assessment. Not a published description of a live service.  
**Date:** 4 November 2026 (UK).  
**Repository base:** `develop` at `9727d3cd`, which includes merged PR #417 (`67ed0a98`).  
**Operator named in source:** ProfileRelaunch Ltd, company number 17520826, registered office 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ (`lib/legal.ts`).

This note separates four states:

- **VERIFIED** — source and tests in this repository show the behaviour.
- **IMPLEMENTED BUT UNTESTED** — source exists, but this assessment did not find a test or a live run that proves the production path.
- **PLANNED** — described in product copy or planning documents, and not implemented as that workflow.
- A provider, legal, or owner label is used where the repository cannot settle the point.

No Retell, Twilio, SIP, call-recording, transcript, or voice-webhook implementation was found in application code. Choosing a voice provider and turning recording on are **OWNER DECISION REQUIRED**. The planning note `docs/customer-platform/02A-implementation-plan.md` says the provisioning phase makes no Retell, Twilio, or phone-number provider calls. A Retell proof of concept is not stored in this repository, so nothing in that proof of concept is treated as demonstrated here.

## Intended flow

The approved product description is a missed-call assistant for a service business:

1. A caller rings the business’s existing number.
2. The business’s telephone service forwards the call only when the business does not answer.
3. A voice provider connects the forwarded call to an AI conversation configured for that business.
4. The provider sends a webhook to ProfileRelaunch.
5. ProfileRelaunch persists a lead.
6. The business is notified by an agreed method.
7. The business calls the caller back. The product copy says this does not book an appointment and does not guarantee a callback (`apps/telloya/lib/content.ts`).

| Step | What the repository shows | Status |
| --- | --- | --- |
| Missed call on the customer’s number | Marketing copy only. No telephony integration. | PLANNED |
| Conditional forwarding | Marketing copy says compatibility depends on the customer’s telephone provider and is checked during onboarding. No provider test or setup workflow. | PLANNED |
| Voice provider | Not present. Retell and Twilio appear only as providers the current provisioning phase must not call. | PLANNED. PROVIDER CONFIRMATION REQUIRED before any provider is treated as active. |
| AI conversation | Marketing copy and enquiry fields for voice, accent, language, and speaking style. No agent runtime. | PLANNED |
| Voice webhook | No Telloya voice webhook route, signature check, idempotency key, or replay store. | PLANNED |
| Lead persistence for a live call | No call-lead table or payload. The enquiry form can store the business’s description of its missed-call problem. That is the business’s sales enquiry, not a caller lead. | PLANNED for caller leads |
| Notification of a caller lead | No call-summary email or dashboard. Customer portal text says “Telloya is not open in your portal yet.” (`apps/customer/lib/portal/products/present.ts`). | PLANNED |
| Business callback | Copy says the business follows up and that callbacks are not guaranteed. No callback workflow. | PLANNED |

## What is implemented: the sales enquiry

The live code path is a website enquiry from a business that wants Telloya. It is disabled unless `TELLOYA_ENQUIRY_ENABLED` is exactly `true` (`apps/telloya/lib/enquiry-contract.ts`). Indexing is disabled unless `VERCEL_ENV` is `production` and `TELLOYA_LAUNCHED` is exactly `true` (`apps/telloya/lib/config.ts`). This assessment does not change either flag.

| Stage | Evidence | Status |
| --- | --- | --- |
| Enquiry page and form | `apps/telloya/app/enquire/page.tsx`, `apps/telloya/components/telloya-enquiry-form.tsx` | VERIFIED by form tests |
| Field contract | `apps/telloya/lib/enquiry-contract.ts`: business name, country, trade, contact name, email, phone, plan, optional Guard, custom requirements, voice and language preferences, overage interest and cap, missed-call problem, phone setup, contact preference, privacy acceptance, submission key | VERIFIED |
| Validation | `apps/telloya/lib/telloya-enquiry.ts` and `lib/telloya-enquiry.test.ts` | VERIFIED |
| API | `POST` `apps/telloya/app/api/telloya/enquiry/route.ts`. Missing flag returns the closed response. Success requires a `TY-YY-XXXXXX` reference. | VERIFIED by `route.test.ts` |
| Persistence | `persistTelloyaEnquiry` calls `create_general_enquiry_v1`. Same submission key and same payload fingerprint returns the existing row. A key reused with a different payload is a conflict. | VERIFIED by intake tests and `supabase/migrations/20261102200000_telloya_enquiry_infrastructure_v1.sql` |
| Reference | `generate_enquiry_public_ref('telloya')` | VERIFIED in that migration and the route |
| Email | Resend, only when enquiry email configuration is ready. Telloya asks for an internal notice and a customer acknowledgement. Idempotency keys are `{enquiryId}-internal` and `{enquiryId}-customer-ack` (`lib/enquiries/intake.ts`). | VERIFIED in code and unit tests. A production send was not made for this assessment. |
| Admin review | `admin_enquiry_list_v1` and `admin_enquiry_detail_v1` expose the reference and payload. Commercial onboarding can classify a Telloya enquiry. | VERIFIED in SQL and admin commercial tests. A production Telloya enquiry was not created. |
| Rate limit | `consume_public_rate_limit_v1`, described as 8 requests in 10 minutes by the shared limiter. | IMPLEMENTED BUT UNTESTED against a live database in this assessment |
| Analytics | Optional GA4 after consent. The lead event allows `lead_type`, optional `plan_tier`, and `guard_interested`. Tests reject email, phone, and the TY reference in the event (`apps/telloya/lib/analytics.test.ts`). No measurement ID is set by this assessment. | VERIFIED |

Personal data in a persisted Telloya enquiry is the JSON payload plus operational metadata: submission key, fingerprint, source `telloya`, public reference, and email delivery status. The payload can include the business contact’s name, email, and telephone number, the business name, country, trade, locations, website, the missed-call description, phone setup, and commercial preferences. `privacyAccepted` is stored as a boolean. There is no application-level encryption of those fields. They are JSONB in `public.enquiries`.

Direct table access is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role` (`supabase/migrations/20260917185905_admin_enquiry_triage_v1.sql`). Row level security is enabled. Creation and admin reads go through security-definer functions. That is an access-control fact. It is not a finding that the database disk is encrypted; disk encryption is PROVIDER CONFIRMATION REQUIRED.

## Commercial records that exist beside the voice service

Marketing prices are in `apps/telloya/lib/pricing.ts`: Basic £49 / 120 minutes, Growth £79 / 300 minutes, Pro £120 / 500 minutes, Custom by quotation, Relaunch Guard £9.99 per location, overage £0.25 per minute only with opt-in and a spending cap.

The customer commercial schema stores approved plan conditions separately from the marketing page (`docs/customer-platform/03A-02-offer-acceptance.md` says marketing prices are not copied into an offer). Stripe preparation, verification, and settlement code exists for the customer platform and is gated off. `docs/customer-platform/03A-03-02-02-atomic-payment-settlement.md` says settlement does not provision Telloya. No Telloya checkout exists on the marketing site.

`public.service_provisions` is described in `docs/customer-platform/02A-data-model.md` as having provider binding and test-call fields. The same note says no provider credential or call recording is stored. The implementation plan stops provisioning at `READY_FOR_PROVIDER_VERIFICATION` and rejects `LIVE` from that phase. Those fields are not a live voice integration.

## Organisations and systems

Only a system with code, configuration, or an explicit product decision is listed. A name in a planning prohibition is not an active integration.

| Organisation or system | Role in the Telloya design | Active in this repository | Data it could handle | Status |
| --- | --- | --- | --- | --- |
| ProfileRelaunch Ltd | Operator of the website, enquiry intake, admin review, and the intended Telloya service | Yes, as the named operator | Business enquiry data; intended caller leads if the service is later built | VERIFIED as the named operator. Controller or processor role for caller data is LEGAL REVIEW REQUIRED. |
| The business customer | Intended user of the receptionist and the person who would call the caller back | No customer voice account is provisioned | Its own callers’ names, numbers, and job details | PLANNED |
| The caller | Person who rang the business | No caller record type exists | Their own contact and enquiry details | PLANNED |
| The customer’s telephone provider | Would forward unanswered calls | Not integrated | Call signalling and the forwarded call | PLANNED. PROVIDER CONFIRMATION REQUIRED for each customer’s provider. |
| Voice provider, including any Retell account | Would run the AI conversation and any recording or transcript | No client, credential, webhook, or POC artefact | Audio, transcripts, summaries, caller numbers, prompts | PLANNED. Not active. PROVIDER CONFIRMATION REQUIRED. |
| Twilio or another SIP carrier | Named only as a call that the provisioning phase must not make | No | Numbers and call media if later selected | Not active |
| Supabase | Stores enquiry rows and the commercial schema through the existing project | Used by the enquiry RPC | Business enquiry payload and references | VERIFIED as the database path. Region and disk encryption are PROVIDER CONFIRMATION REQUIRED. |
| Resend | Sends enquiry email when configured. Named in `lib/legal.ts` as the enquiry email processor. | Code path exists. No message was sent for this assessment. | Business contact name, email, enquiry contents, TY reference | VERIFIED as the code path. Production configuration is PROVIDER CONFIRMATION REQUIRED. |
| Vercel | Hosts the Next.js apps. Preview and production deployments exist for the marketing, admin, and customer projects. `legalIdentity.hostingProvider` is unset, so the public privacy notice does not name Vercel. | Hosting is in use for the website | Request logs, which may include IP address and user agent. The privacy notice says those fields are listed only when confirmed. | PROVIDER CONFIRMATION REQUIRED for log fields, retention, and region |
| Google Analytics 4 | Optional Telloya measurement after consent, separate from the ProfileRelaunch measurement ID | Code exists. No ID is configured by this work. | Page path and a non-identifying lead event after accept | VERIFIED as optional and off until an ID is set |
| Stripe | Customer-platform payment code | Gated off. Does not provision Telloya. | Payment identifiers if a later Telloya subscription uses it | IMPLEMENTED BUT UNTESTED for a Telloya subscription. Not a voice processor. |
| AWS | Used elsewhere for admin evidence storage | No Telloya call or enquiry media path was found | Not a current Telloya media store | Not a Telloya voice integration |

## Data that would exist only after a voice launch

These categories are not stored by the current Telloya code. They are listed so later documents can assess them. None is enabled.

| Category | Intended content | Repository evidence |
| --- | --- | --- |
| Audio recording | The forwarded call, if a provider setting retains it | Not found |
| Transcript | Text of the conversation, if a provider setting produces it | Not found |
| AI summary | Structured lead for the business | Marketing copy only. The sales enquiry is not this summary. |
| Caller details | Name, callback number, address, job description, urgency | Described in the FAQ. Not a stored caller record. |
| Provider logs | Call identifiers, timestamps, errors | Not found |
| Voice webhook payload | Provider event body | Not found |
| Usage minutes | Included minutes, overage, spending cap | Prices exist. No meter or reconciliation job. |
| Security and audit logs | Enquiry events exist for the sales enquiry. Call audit logs do not. | Enquiry events VERIFIED in the enquiry migration |

## Boundary with the company website

The Telloya footer points privacy and terms at ProfileRelaunch’s company-wide notices and says Telloya-specific terms for AI voice, recording, transcripts, and retention will be published before launch (`apps/telloya/lib/content.ts`, `apps/telloya/app/cookies/content.ts`). The company privacy notice lists homepage, contact, Get Help, and Relaunch Guard fields. It does not list Telloya plan, voice, or phone-setup fields (`app/privacy/page.tsx`). The company terms say that website does not process checkout (`app/terms/content.ts`). Those statements are accurate for the ProfileRelaunch marketing site. They are not a Telloya service contract.
