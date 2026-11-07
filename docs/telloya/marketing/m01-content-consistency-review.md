# Telloya Marketing M-01 — Content and commercial consistency

**Status:** ready for independent review. This note does not approve launch, the homepage headline, a voice provider, or any Telloya service terms.
**Base:** `develop` at `80111508e23aee0f34bd10cda5c13e887ed01e30`, including merged PR #441.
**Scope:** `apps/telloya` marketing copy, its tests, and this note. No Admin or Customer application logic. No migrations. No hosted data. No environment variables.

## Pages reviewed

- Homepage (`apps/telloya/app/page.tsx` and `homepageContent`)
- How It Works
- Features
- Industries
- Pricing, including the comparison table, Guard examples, overage, setup and FAQs
- Enquire (`/enquire`) and the enquiry form labels
- Cookies
- Footer and the ProfileRelaunch company-wide Privacy and Terms links
- `/demo`, which still redirects temporarily to `/enquire`

The canonical prices and entitlements live in `apps/telloya/lib/pricing.ts`. Page copy reads that configuration.

## Approved commercial rules verified

| Rule | Published wording |
| --- | --- |
| Basic £49, 120 minutes | Unchanged in `telloyaPlans` |
| Growth £79, 300 minutes | Unchanged in `telloyaPlans` |
| Pro £120, 500 minutes | Unchanged in `telloyaPlans` |
| Custom | Quotation for price, minutes, locations and receptionist numbers |
| Standard entitlement | One operating location and one receptionist telephone number |
| Extra receptionist capacity | A separately agreed Custom quotation |
| Standard setup | Included |
| Complex setup | A separate quotation |
| Relaunch Guard | £9.99 per paid Guard location per month |
| Guard-only locations | Do not add a receptionist location or receptionist number |
| Overage | £0.25 per minute, only after a separate explicit opt-in and a customer-defined spending cap |
| Enquiry interest | Not authorisation to charge for overage, Guard, or the plan |
| Currency | GBP is the published base currency. The site does not offer local-currency checkout or conversion |

No rollover, renewal, cancellation-period, refund-window or VAT rate was invented.

## Changes made

- Standard plans and the comparison table now say one operating location and one receptionist number. Custom columns say Quotation.
- Guard copy states the £9.99 paid-location price and that extra Guard-only locations do not create receptionist entitlements.
- Overage copy states the opt-in, the customer-defined cap, and that enquiry interest is not a charge.
- “Most UK providers support…” and “most UK telephone providers” were removed. Availability is described as conditional on the customer’s telephone provider and location. No country, carrier or language is listed as currently available.
- Voice, accent and language fields are described as requests. Available combinations depend on the selected voice provider. The Features roadmap no longer lists multi-language support as a future product, and it does not name an internal model or a partnership.
- Feature status still separates preliminary testing from the planned customer dashboard. Call history and minute tracking stay planned and not live.
- Industries examples no longer say the service handles emergency calls, never misses a boiler callout, books an appointment, or dispatches an engineer. The caller’s description is what can be collected.
- Pricing CTAs still preselect Basic, Growth, Pro and Custom on `/enquire`. Guard stays optional. Public submission stays off unless `TELLOYA_ENQUIRY_ENABLED` is separately set. The TY reference format and the enquiry database contract were not changed.
- The footer and cookie page say the ProfileRelaunch Privacy and Terms links are existing company-wide notices, not Telloya service terms.

## Design and launch flags

The immersive homepage, background, animations, Connected T logo, glow, typography, brand colours, navigation, page structure, mobile layout and accessibility controls were not redesigned. No stylesheet was edited.

`TELLOYA_LAUNCHED` and `TELLOYA_ENQUIRY_ENABLED` remain off unless an environment sets them. This phase does not set either flag. Stripe, Retell, forwarding and voice routing were not activated. No live demo was added.

The homepage heading in `apps/telloya/app/page.tsx` is still **Never Misses a Call**.

## Claims requiring owner approval

### Homepage headline

The heading cannot be substantiated from this repository. Forwarding, provider availability, an answered call, minute allowance and uptime are all outside the current evidence. The subtitle already says Telloya can help capture an enquiry when the owner cannot answer. That subtitle does not prove the heading.

The heading was left unchanged. These alternatives are options for a later owner decision, not a redesign in this PR:

| Alternative | What it would claim |
| --- | --- |
| Keep “Never Misses a Call” | Every missed call is answered. A customer could treat it as a service level. Legal review is required before launch if this line stays. |
| “Helps when you miss a call” | Assistance, not certainty. Matches the subtitle. |
| “Answers forwarded missed calls” | Only calls that arrive through forwarding. Still needs an availability rule if “answers” is unqualified. |
| “Takes a message when you cannot pick up” | Message-taking. Does not imply emergency dispatch, appointments, or a live dashboard. |

**Owner decision required** before the heading changes or is treated as a service level.

### Emergency wording

The previous Industries lines “Handle emergency calls while you’re on site” and “Never miss a boiler callout” were qualified in this PR because they implied an emergency response. Restoring either line, or any claim that Telloya dispatches an engineer or decides that a job is an emergency, needs a separate owner decision and legal review.

## Legal and provider-dependent blockers for Marketing M-02

Do not publish the draft customer agreement, and do not treat the company-wide ProfileRelaunch notices as Telloya service terms.

M-02 still needs approved text for:

- A Telloya customer agreement covering the voice service
- Call-recording disclosure, lawful basis and caller notice
- Transcript and recording retention
- VAT treatment of the plan, Guard and overage
- Cancellation, renewal and refund terms
- The named voice and telephony providers, only after those relationships are approved for publication
- Which countries, carriers and languages are actually available, only from verified evidence

Provider-dependent launch blockers that this copy does not remove:

- Conditional forwarding is not verified for any named carrier or country
- Number provisioning is not live
- Voice, accent and language combinations are requests, not a catalogue
- Customer call history and minute tracking are planned, not live
- Calendar booking and callbacks are not guaranteed
- An enquiry does not start the service

## Tests

Focused checks cover the standard entitlement, tier prices and minutes, Custom quotation, independent Guard quantity and price, overage opt-in and cap, international and provider-conditional wording, the planned dashboard, enquiry preselection, and the unchanged launch and submission controls.

Local results:

- Telloya: 17 files, 160 tests passed
- Root marketing tests: 150 files passed and 1 skipped (1027 tests passed, 4 skipped)
- Root and Telloya typechecks passed
- Lint passed with the existing unused-variable warnings and no errors
- Root and Telloya production builds passed
- Marketing smoke and Telloya smoke passed, including the unchanged homepage headline and both launch-flag states

The rendered pricing page shows Basic £49 / 120 minutes, Growth £79 / 300 minutes, Pro £120 / 500 minutes, and Custom by quotation. Each standard plan lists one operating location and one receptionist telephone number. `/enquire?plan=growth` still shows the pre-launch submission message and does not offer a submit button.
