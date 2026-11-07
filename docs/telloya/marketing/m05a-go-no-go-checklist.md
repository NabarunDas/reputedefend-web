# Telloya M-05A — go / no-go checklist

**Date:** 7 November 2026 (UK).
**Base:** `develop` at `fe2e946317d680ad3659f15eb2cb082c798ec5fa`.
**Decision:** no-go. Public launch is not authorised.

A **PASS** below is only the evidence in the Evidence column. Local tests do not pass a production launch gate. Detail is in `docs/telloya/marketing/m05a-launch-readiness.md`.

## Launch gates

| Gate | Status | Evidence | Owner | Next step |
| --- | --- | --- | --- | --- |
| Public indexing | **BLOCKED** | `isSitePublic` requires `VERCEL_ENV=production` and `TELLOYA_LAUNCHED=true`. This change sets neither. Robots and the sitemap stay closed in code until a production rebuild | Owner | Approve indexing, set the flag on Production only, rebuild, then read the live robots tag |
| Canonical domain on the marketing project | **FAIL** | Supplied Vercel finding: project `telloya-marketing` (`prj_T3KKfna1SSwbtRI59KwLVVtkpOY8`, team `clientcove`) has `telloya-marketing.vercel.app`. Code canonical host is `https://telloya.com`. That host is not attached. This phase did not re-query Vercel | Owner, then ChatGPT for the hosted change | Confirm ownership and DNS before any attachment |
| Apex and `www` routing | **NOT TESTED** | No DNS read and no redirect check | Owner | Record the live records, then choose one canonical host |
| HTTPS certificate on the canonical host | **NOT TESTED** | No request was made to `https://telloya.com` | Owner | After attachment, open the apex and `www` over HTTPS |
| Search Console and sitemap submission | **BLOCKED** | No property was opened. Sitemap submission is forbidden until the indexing rebuild | Owner | Add the property only after the canonical host serves the launched build |
| Hosted enquiry submission | **BLOCKED** | `TELLOYA_ENQUIRY_ENABLED` was not enabled. The API contract returns 503 while it is off | Owner, then ChatGPT on DEV | Approve a DEV test. Do not point that test at Production |
| TY reference on hosted DEV | **NOT TESTED** | Mocked persistence returns `TY-` plus year plus six characters, and only after a real create | ChatGPT, after approval | Submit one DEV enquiry and read the stored reference |
| Admin triage of that enquiry | **NOT TESTED** | Admin can render a fixture reference. No hosted row was created | ChatGPT, after approval | Open the DEV enquiry in Admin and confirm plan, Guard, and voice fields |
| Customer acknowledgement email | **NOT TESTED** | Mocked provider covers sent, suppressed, and unavailable. No message was sent | ChatGPT, after approval | Use the DEV mail path and keep the recipient inside the test |
| Payment collected by the marketing form | **PASS** as a local boundary. Production checkout is a different release | Enquiry modules do not reference Stripe. The form has no card field | Owner | Keep checkout out of the enquiry launch |
| Subscription created from an enquiry | **PASS** as a local boundary | Enquiry persistence does not call a subscription command | Owner | Do not treat a TY reference as a subscription |
| Live call from the demo | **PASS** locally | Demo source has no Retell, Twilio, fetch, or microphone call | Owner | Keep the demo fictional at launch |
| GA4 outside Production | **PASS** for the client contract | Collection requires the environment string `production`, a valid Telloya ID, and consent | Owner | Put the future ID on Production only |
| GA4 property and Production ID | **BLOCKED** | No property and no `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` | Owner | Create the property later. Do not set it in this change |
| Personal data in analytics | **PASS** for the unit contract | Query strings and enquiry fields are excluded. **NOT TESTED** in a live GA4 debugger | Owner | Repeat the sanitising cases in GA4 DebugView after the ID exists |
| Draft agreement published as a contract | **PASS** for the marketing site | No Telloya legal route. Footer points at company notices and says Telloya terms await approval | Legal reviewer | Do not add a public terms URL until counsel approves one text |
| VAT and production tax | **BLOCKED** | `vatRegistered` is false. `productionTaxBehaviour` is null | Accountant, then owner | Confirm registration. Do not mark the tax field approved in the same step |
| Telloya service agreement | **BLOCKED** | `TELLOYA-DRAFT-2026-11-1` is a draft. Governing law and courts are unset | Legal reviewer and owner | Reconcile the draft with the one-location rule before any customer sees it |
| Caller privacy, recording, and retention | **BLOCKED** | Owner-approved commercial rule is summary-only, 90 days, no training. Provider settings are unverified. The privacy supplement is unpublished | Legal reviewer and the voice provider | Confirm the provider storage and training settings before a live call |
| Cancellation, renewal, and refunds | **BLOCKED** as an operational control | Owner-approved rule exists. No cancellation command or renewal job is enabled. Contract wording still needs legal review | Owner and legal reviewer | Do not present the rule as a live customer control |
| Usage exhaustion and spending caps | **BLOCKED** as an operational control | Opt-in and cap can be stored on an enquiry. No meter stops a call and no overage invoice exists | Owner | Keep the enquiry cap labelled as interest |
| Emergency and unavailable service | **BLOCKED** | Marketing says there is no emergency dispatch. No emergency script is loaded or tested. “Never Misses a Call” is not a service level | Owner and legal reviewer | Decide the homepage heading and the caller script before live routing |
| Supported countries, numbers, and languages | **NOT TESTED** | No carrier, country, or voice inventory was verified | Voice provider and owner | Write the supported list before selling outside the verified set |
| Manual screen-reader pass | **NOT TESTED** | M-04A and M-04B recorded Lighthouse accessibility 100 and left VoiceOver, NVDA, TalkBack, and Dragon unrun | Owner | Run the acceptance criteria in the readiness note |
| Mobile LCP at or under 2.5 s | **FAIL** | M-04B paired mobile LCP was 3.2 s, performance 93, CLS 0, desktop performance 100. Artwork was not changed | Owner, if a design change is wanted | Accept 3.2 s for launch, or commission a separate artwork decision |
| Preview non-indexable | **PASS** for the code contract | Preview stays closed even if `TELLOYA_LAUNCHED=true`. Live preview headers were not re-read in this phase | Owner | Re-read `X-Robots-Tag` on the preview after the next production-bound build |
| C-06B / Retell workstream left untouched | **PASS** for this diff | This change does not edit Retell, forwarding, or live-call controls | Owner | Review that diff before merge |

## Local checks that are not launch approval

| Check | Status | Evidence |
| --- | --- | --- |
| Plan preselection | **PASS** | Enquiry form test for Basic, Growth, Pro, and Custom |
| Guard, Custom, voice, and privacy validation | **PASS** | Form tests and `telloya-enquiry-handover.test.ts` |
| Duplicate key and in-flight submit | **PASS** | One TY reference on retry. Second click ignored while in flight |
| Flag near-misses | **PASS** | `TRUE`, `1`, `yes`, and `on` do not enable enquiries or indexing |
| Analytics consent matrix | **PASS** | `apps/telloya/lib/analytics.test.ts` and the Google Analytics component tests |
| Demo keyboard, summary, and reduced motion | **PASS** | `apps/telloya/app/demo/demo.test.tsx` |
| Prices and one-location entitlement | **PASS** | `apps/telloya/lib/pricing.ts` via `commercial-consistency.test.ts` |

## No-go statement

Indexing, the canonical domain, hosted enquiry, GA4, tax, the service agreement, and live call routing are not ready together. Marketing enquiry launch, paid-subscription activation, and live AI call routing stay separate decisions. None of them is approved here.
