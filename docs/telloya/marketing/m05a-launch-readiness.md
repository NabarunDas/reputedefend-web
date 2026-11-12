# Telloya M-05A — launch readiness

**Date:** 7 November 2026 (UK).
**Base:** `develop` at `fe2e946317d680ad3659f15eb2cb082c798ec5fa`, merged Marketing M-04B (PR #452).
**Scope:** the Telloya marketing application, targeted tests, and these notes. Admin, Customer, Supabase, prices, legal drafts, feature flags, DNS, and Vercel settings were not changed.

This is a release-verification package. It does not launch the site, enable enquiries, enable indexing, create a GA4 property, or attach a domain.

**Public launch is not authorised.**

A gate in this package is **PASS** only for the evidence named beside it. A local test does not make a production launch gate **PASS**. Hosted DEV and Production checks that were not run are **NOT TESTED** or **BLOCKED**.

## 1. Marketing routes

The eight public routes are implemented as Next.js pages. Header links are How It Works, Features, Industries, Pricing, and Enquire. The demo is linked from the homepage example, How It Works, and the footer (`apps/telloya/lib/content.ts`). The header does not list the demo.

| Route | Role in the journey | Local evidence | Hosted evidence |
| --- | --- | --- | --- |
| `/` | Entry. Hero and primary CTAs | Homepage tests and M-04A/M-04B screenshots | Preview HTML was behind Vercel login in M-04B. **NOT TESTED** as a signed-in preview click-through in this phase |
| `/how-it-works` | Explains the path and links to the demo and enquire | Content and link tests | **NOT TESTED** on a hosted deployment in this phase |
| `/demo` | Fictional sample. No network call | `apps/telloya/app/demo/demo.test.tsx` | **NOT TESTED** on a hosted deployment in this phase |
| `/features` | Product description. Call history stays planned | `apps/telloya/lib/commercial-consistency.test.ts` | **NOT TESTED** on a hosted deployment in this phase |
| `/industries` | Trade examples. No emergency-dispatch claim | Same commercial-consistency test | **NOT TESTED** on a hosted deployment in this phase |
| `/pricing` | Four plans. Each CTA is `/enquire?plan=basic\|growth\|pro\|custom` | Commercial-consistency and enquiry-form tests | **NOT TESTED** on a hosted deployment in this phase |
| `/enquire` | Pre-launch notice while submission is off | Enquiry form and API tests | **NOT TESTED** against hosted DEV |
| `/cookies` | Consent explanation. No gtag without a production ID and consent | Analytics and cookies content tests | **NOT TESTED** on a hosted deployment in this phase |

`scripts/smoke-telloya.mjs` builds the app twice, with `VERCEL_ENV=production` and `TELLOYA_LAUNCHED` false, then true, and requests `/`, `/demo`, `/robots.txt`, and `/sitemap.xml`. That smoke is a local process. It is not a hosted Production check. The GitHub `verify` job is the CI result for this branch.

## 2. Customer journey

**Homepage → Demo → Pricing → Enquiry → TY reference → Admin triage → Customer communication**

| Step | What the code does | This phase |
| --- | --- | --- |
| Homepage → Demo | Homepage and How It Works link to `/demo`. The sample is script `telloya-interactive-demo-v1` | **PASS** as a local link and player test. **NOT TESTED** as a hosted browser walk |
| Demo → Pricing | The demo offers the pricing and enquire links. It does not submit an enquiry | **PASS** locally. The demo source has no `fetch`, Retell, Twilio, Stripe, or Supabase call |
| Pricing → Enquiry | Plan cards link to `/enquire?plan=` for Basic, Growth, Pro, and Custom | **PASS** locally |
| Enquiry → TY reference | A TY reference is returned only after the shared intake reports a newly persisted row whose reference matches `TY-` plus a year marker and six unambiguous characters | **PASS** for the mocked contract in `apps/telloya/lib/telloya-enquiry-handover.test.ts` and `apps/telloya/app/api/telloya/enquiry/lead-conversion.test.ts`. **NOT TESTED** against hosted Supabase |
| Admin triage | Admin renders a Telloya interest panel when an enquiry payload is loaded (`apps/admin/app/enquiries/telloya-interest.tsx`). The queue reads stored rows | **PASS** for the Admin fixture render in `apps/admin/app/enquiries/telloya-interest.test.tsx`. **NOT TESTED** as a row created by the marketing form and opened in hosted Admin. This phase did not change Admin |
| Customer communication | The intake can send an internal notification and a customer acknowledgement through the injected mail provider | **PASS** for the mocked provider. **NOT TESTED** as a real email. No email was sent |

The complete journey has **not** passed. The hosted DEV test remains a separate step for ChatGPT, and it needs owner approval before anyone enables `TELLOYA_ENQUIRY_ENABLED` on a hosted environment.

## 3. Enquiry contract

Source: `apps/telloya/lib/enquiry-contract.ts`, `apps/telloya/lib/telloya-enquiry.ts`, `apps/telloya/lib/telloya-enquiry-intake.ts`, `apps/telloya/lib/telloya-enquiry-email.ts`, `apps/telloya/app/api/telloya/enquiry/route.ts`, and `apps/telloya/components/telloya-enquiry-form.tsx`.

`getEnquiryCapabilities` enables submission only when `TELLOYA_ENQUIRY_ENABLED` trims to the exact string `true`. Empty, `false`, `TRUE`, `1`, `yes`, and `on` stay off. The public form then shows the pre-launch notice and `contact@profilerelaunch.com`. The API returns 503 `SERVICE_UNAVAILABLE`.

| Check | Local result | Evidence |
| --- | --- | --- |
| Basic, Growth, Pro, and Custom preselection | **PASS** | `telloya-enquiry-form.test.tsx` preselects each `?plan=` value and keeps Guard optional |
| Optional Relaunch Guard | **PASS** | Guard locations are asked only after interest. The handover stores interest and states it is not a purchase |
| One location and one number | **PASS** as published copy | `standardEntitlement` is `{ operatingLocations: 1, receptionistNumbers: 1 }` in `apps/telloya/lib/pricing.ts`. A standard plan does not collect extra receptionist locations. Custom locations and numbers are a quotation |
| Custom requirements | **PASS** | Minutes, numbers, and locations are required for Custom. Monthly calls stay optional. The handover stores the quotation fields |
| Voice, accent, and language | **PASS** | Optional on every tier. A full record is stored by the mocked handover: preference, accent, primary language, speaking style, and additional languages |
| Privacy acknowledgement | **PASS** | Validation rejects `privacyAccepted: false`. The checkbox error is associated with the control |
| Field validation | **PASS** | Required business, contact, and plan fields fail closed. Oversized and malformed JSON are rejected when the flag is on in the test |
| Duplicate submission | **PASS** | The form ignores a second click while the first request is in flight. The same submission key reuses one TY reference and sets `leadConversion` only on the first create |
| TY persistence | **PASS** for the mock. **NOT TESTED** on hosted data | `leadConversion` is true only when storage reports `created`, the result is persisted, it is not simulated, and the reference matches the TY pattern |
| Email queue and Admin handover | **PASS** for the mock. **NOT TESTED** with Resend or hosted Admin | Internal mail names the plan and the TY reference. Customer acknowledgement can be `sent`, `suppressed`, or `unavailable` without claiming delivery on failure |
| Failure and retry | **PASS** for the mock | A rejected provider leaves `receiptEmailSent` false and `receiptEmailStatus` `unavailable`. Retry of the same key does not create a second reference |
| No payment and no subscription | **PASS** as a source boundary | The enquiry route, intake, payload, and email modules do not reference Stripe or Retell. The form copy says no payment is taken |
| Hosted submission | **BLOCKED** | `TELLOYA_ENQUIRY_ENABLED` was not set. No enquiry was written to hosted Supabase |

## 4. Pre-launch safety

| Check | Status | Evidence |
| --- | --- | --- |
| `TELLOYA_LAUNCHED` unset or not `true` in this change | **PASS** for the repository change. **NOT TESTED** as a live read of the Vercel Production variable | This PR does not set the variable. `isSitePublic` is false unless `VERCEL_ENV` trims to `production` and `TELLOYA_LAUNCHED` trims to `true` |
| `TELLOYA_ENQUIRY_ENABLED` disabled for hosted environments | **NOT TESTED** as a live read of Vercel. **PASS** for the default in code | The flag was not read from Vercel in this phase and was not changed. Near-miss values stay disabled in `commercial-consistency.test.ts` |
| Preview builds non-indexable | **PASS** for the code contract | `VERCEL_ENV=preview` stays non-public even when `TELLOYA_LAUNCHED=true`. Confirmed by `isSitePublic`, sitemap, and the M-04A production-build header `noindex, nofollow, noarchive` while the flag was unset |
| Robots and sitemap protected | **PASS** for the code contract | `apps/telloya/app/robots.ts` disallows `/` unless production and launched. `apps/telloya/app/sitemap.ts` returns an empty urlset unless both are set. Headers are fixed at build time |
| Marketing form collects no payment | **PASS** locally | No Stripe call on the enquiry path. Success copy is an Admin review, not a checkout |
| Enquiry creates no subscription | **PASS** locally | Persistence writes an enquiry payload. It does not call a subscription command |
| Demo starts no live call | **PASS** locally | Demo test forbids network, Retell, Twilio, and microphone APIs |
| GA4 only in explicit Production | **PASS** for the client contract | `telloyaAnalyticsCollectionAllowed` is true only when the environment trims to `production`. See section 6 |
| Analytics events carry no personal information | **PASS** for the unit contracts | Page views drop query and hash. `generate_lead` allows `lead_type`, an allow-listed `plan_tier`, and `guard_interested` |
| Draft agreements are not an approved public contract | **PASS** for the marketing app | Footer legal links are Cookies plus the company privacy and terms notices. The app source does not link `m02a/` or a Telloya `/legal/service-agreement` route. The drafts stay marked not approved |

## 5. Domain and SEO

Independently verified Vercel finding supplied for this phase. This phase did not call the Vercel API and did not change a domain.

| Item | Record |
| --- | --- |
| Project | `telloya-marketing` |
| Project ID | `prj_T3KKfna1SSwbtRI59KwLVVtkpOY8` |
| Team | `clientcove` |
| Domain attached now | `telloya-marketing.vercel.app` |
| Canonical host in code | `https://telloya.com` (`apps/telloya/lib/brand.ts`, `brandSiteUrl`) |
| `telloya.com` on this project | **Not attached** |

**Gate: canonical domain attached. FAIL.** The code canonical host is not the domain attached to the project.

Cutover checklist, all **NOT TESTED** until an authorised hosted operation:

1. Confirm the owned domain and the registrar account. Do not assume the code host is registered to this team.
2. Read the live DNS records for the apex and `www`. Record the current targets before any change.
3. Attach the production domain to project `prj_T3KKfna1SSwbtRI59KwLVVtkpOY8` only after that confirmation.
4. Choose apex and `www` routing. One host is canonical (`https://telloya.com`). The other redirects there. Preview hosts stay non-indexable.
5. Wait for the HTTPS certificate on both names and request each URL.
6. Confirm the redirect, the canonical link, and that a preview host does not serve as the canonical.
7. Rebuild Production with the indexing decision already made. Then read `/robots.txt` and `/sitemap.xml` on the canonical host. A flag change on an old build does not retag pages.
8. Add the canonical property in Google Search Console and submit the sitemap only after that rebuild.

ChatGPT handles those hosted operations after approval. This package does not.

## 6. GA4

No property was created. `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` was not set. Demo events were not added.

Collection is eligible only when `VERCEL_ENV` trims to `production`, the value matches `^G-[A-Z0-9]+$`, and the visitor has accepted `telloya:analytics-consent:v1`. Advertising consent stays denied. ProfileRelaunch uses a different ID and consent key.

| Case | Local status | What a future Production check must show |
| --- | --- | --- |
| Consent rejected | **PASS** | No gtag script, no page view, analytics storage denied |
| Consent accepted | **PASS** with a test ID | Script and one sanitised page view |
| Consent withdrawn | **PASS** | `ga-disable-<id>`, cookies removed, script removed |
| Repeat visit with a stored preference | **PASS** | The stored `accepted` or `rejected` value is read. No second banner is required for a stored choice |
| Page transitions | **PASS** | A new path sends one page view. The same path does not send it again. Query and hash are absent |
| Persisted enquiry conversion | **PASS** | `generate_lead` only after `leadConversion === true` and a valid TY reference. The event has no reference, email, or query |
| Preview and development | **PASS** | Unset, empty, `preview`, `development`, `staging`, and `Production` do not mount the script or send events |
| Query string and personal data | **PASS** | `/enquire?email=…` becomes `/enquire`. The lead payload has no name, email, phone, or TY reference |

A Production-only ID is still required before any of those cases can be observed in a browser on the live host. That observation is **NOT TESTED**.

## 7. Legal and commercial gates

Sources: `telloyaOwnerApprovedPolicy` and `telloyaDraftAgreement` in `apps/admin/lib/commercial/telloya-catalogue-proposal.ts`, `docs/telloya/phase-c/06a-commercial-agreement-decision-pack.md`, `docs/telloya/phase-c/06b-usage-privacy-foundation.md`, and `docs/telloya/marketing/m02a/`. The M-02A register still says its recommendations are not accepted. Later owner approvals are the `OWNER_APPROVED` sentences dated 7 November 2026. Those sentences do not make the service agreement a published contract.

### Already approved by the owner

These are commercial rules recorded on 7 November 2026, plus the location policy approved on 6 November 2026. They are not legal approval of a customer agreement.

- Seller: ProfileRelaunch Ltd. Company 17520826. England and Wales. `vatRegistered` is false. Contact `contact@profilerelaunch.com`.
- Basic £49 and 120 minutes, Growth £79 and 300 minutes, Pro £120 and 500 minutes, Custom by quotation. GBP. Standard setup included. Complex setup quoted separately.
- One operating location and one receptionist number on Basic, Growth, and Pro.
- Optional Guard at £9.99 per confirmed paid Guard location. Enquiry interest is not a purchase.
- Additional minutes £0.25 per minute, only after an explicit opt-in and a hard spending cap. An enquiry cap does not authorise overage. Partial-minute charging is `REVIEW_BEFORE_CHARGE`.
- Unused minutes expire at the end of the monthly period. No rollover.
- Cancellation at the end of the paid period. No automatic pro-rata refund, subject to applicable law and a remedy where the service has failed.
- Monthly renewal at the accepted amount until cancellation.
- Caller data: structured lead summary only. No persistent transcript. No persistent audio. Not authorised for model training. Lead retention 90 days, with deletion, erasure, and a documented legal hold as exceptions.

### Approved in code and not operationally enforced

The rules above are stored as policy constants and marketing copy. No hosted catalogue row was seeded by this phase. No minute meter charges a customer. No cancellation command, renewal job, overage invoice, or call-stop is enabled. **Hosted DEV reconciliation, verified 7 November 2026:** the Supabase DEV migration ledger then contained 117 entries and ended at `20261107120000`. `20261110170000_telloya_enquiry_receptionist_questions_v1.sql` was later applied once to DEV. The verified DEV ledger previously contained 118 entries and ended at `20261110170000`. Do not replay it. Do not apply it to Production. `20261111130000_telloya_marketing_enquiry_retention_v1.sql` was later applied once to DEV. The verified DEV ledger now contains 119 entries and ends at `20261111130000`. The hosted statement is 10,710 characters and the repository file is 10,712 characters. The two-byte difference is the dollar sign and closing quote at the end of the reason check, around character 1075. The installed check is correct. Do not edit or replay `20261111130000`. Do not apply it to Production. `20261107110000_telloya_subscription_usage_ledger_v1.sql` and `20261107120000_telloya_inbound_admission_reservation_v1.sql` are already applied. The admission migration is registered once. The stored SQL matches the committed source. Two private tables have RLS enabled. Three public functions are service-role only. Three triggers were added. Admission records are zero. This is a DEV schema fact, not evidence that customer usage metering, charging, or live call routing is active. Do not replay, reverse, or apply either migration again; do not treat either as applied in Production. `TELLOYA_USAGE_EVENTS_ENABLED` and `TELLOYA_INBOUND_ADMISSION_ENABLED` stay off. Retell live routing stays disabled.

### Awaiting accountant or legal review

- VAT registration today, and `telloyaTaxDecision.productionTaxBehaviour`, which stays `null`.
- International tax. A UK rule must not be copied onto every country.
- Telloya service agreement. `TELLOYA-DRAFT-2026-11-1` is not legally approved. Governing law and courts are unset.
- Published privacy supplement, subprocessors, and international transfers.
- Contract wording for cancellation, renewal, and refunds beyond the owner-approved commercial rule.
- Liability cap and service credit. Neither is owner-approved.
- Consumer cooling-off. Not decided.
- Emergency-call script and the alternative route when a caller will not continue.
- Homepage heading “Never Misses a Call”. It remains on the page. How It Works says the service does not promise that every call is answered. The heading is not a service level. **BLOCKED** as a substantiated promise.

### Provider-dependent confirmations

Countries, carriers, numbers, voices, accents, languages, recording mode, training terms, provider retention and deletion, metering, outage behaviour, and emergency-call behaviour. The marketing voice fields say they are subject to the voice provider. No provider setting was verified here.

### Production operations still unavailable

Paid checkout, Stripe live mode, forwarding, Retell routing, live calls, hosted enquiry submission, Search Console submission, and indexing. Each is a separate decision from this marketing package.

## 8. Accessibility and performance

Taken from M-04B. This phase did not repeat Lighthouse and did not change the artwork.

| Measure | M-04B paired test, 7 November 2026 (UK) | Gate |
| --- | --- | --- |
| Mobile performance | 93 | Recorded. Not a launch PASS by itself |
| Mobile LCP | 3.2 s | Above 2.5 s. **FAIL** against a 2.5 s target. The approved image was not recompressed |
| Desktop performance | 100 | Recorded |
| CLS | 0 | Recorded |
| Lighthouse accessibility on the measured pages | 100 | Automated only |
| Manual screen reader | Not run | **NOT TESTED** |

Acceptance criteria before indexing:

- VoiceOver, NVDA, or TalkBack can reach the skip link, the one homepage H1, the pricing table, the demo controls, and the enquiry pre-launch notice.
- The demo live region announces the step and the lead summary.
- Cookie-consent focus returns to the control that opened settings, once a measurement ID exists on Production.
- Keyboard focus is visible on the homepage, demo, pricing, and enquire pages in the browser that will be supported at launch.
- Text at 200% zoom does not trap the user or hide the primary CTAs at 390 px width.
- A repeated mobile Lighthouse run, after any later asset change, records LCP, CLS, and the LCP element. A score gain that changes the approved console image needs a separate design decision.

## 9. Tests in this phase

`apps/telloya/lib/commercial-consistency.test.ts` now also requires that enquiry submission and indexing stay off for empty, `false`, `FALSE`, `True`, `TRUE`, `1`, `yes`, and `on`, and that preview, development, staging, an unset environment, and `Production` stay non-indexable even when the launch flag is `true`.

Local GitHub-equivalent `verify` on 7 November 2026, 16:50–16:57 UK, exited 0 for every step: lint, root tests, typecheck, build, marketing smoke, pay-env test and typecheck, and admin, customer, and Telloya test, build, typecheck, and smoke. Telloya tests: 20 files, 189 passed. Telloya smoke passed for `TELLOYA_LAUNCHED=false` and `TELLOYA_LAUNCHED=true` inside that script only. No hosted enquiry, email, or DNS check was run.

## 10. What this package does not do

It does not authorise public launch. It does not enable `TELLOYA_LAUNCHED` or `TELLOYA_ENQUIRY_ENABLED`. It does not change prices, legal drafts, Supabase, Admin, Customer, Stripe, Retell, DNS, or Vercel environment variables.
