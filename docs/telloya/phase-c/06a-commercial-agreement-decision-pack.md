# Phase C-06A — Commercial agreement and tax decision pack

Status: **decision preparation**. On 7 November 2026 the owner approved the commercial rules now recorded in `telloyaOwnerApprovedPolicy`. That approval does not legally approve the Telloya Service Agreement, a tax treatment, or a hosted catalogue row. Clauses marked LEGAL_REVIEW_REQUIRED or PROVIDER_VERIFICATION_REQUIRED are still open.

`develop` includes merged PR #444. The repository and confirmed DEV ledger head remain `20261106200000`. `pendingMigrations()` is empty. This pack does not insert catalogue, agreement, subscription, or payment rows. It does not enable enquiries, Stripe settlement, or Retell. It does not change Vercel, Supabase, Production, or the published company privacy notice and terms.

The short repository draft stays `TELLOYA-DRAFT-2026-11-1` in `telloyaDraftAgreement`. Later policy work marks the owner-approved commercial sentences inside that draft. The fuller wording below is a separate proposal, labelled `TELLOYA-PROPOSED-2026-11-1`. That label is a document name only. It is not a hosted version ref until a later approved seed creates it.

## 1. What is already approved

Approved on 6 November 2026 in `docs/telloya/phase-c/catalogue-proposal.md` and `telloyaLocationPolicy`:

| Item | Approved value |
| --- | --- |
| Basic | £49 a month, 120 minutes, 4900 minor units |
| Growth | £79 a month, 300 minutes, 7900 minor units |
| Pro | £120 a month, 500 minutes, 12000 minor units |
| Custom | Quotation required. No price and no minute allowance is approved. |
| Relaunch Guard | £9.99 per confirmed location a month, 999 minor units |
| Additional minutes | £0.25 a minute, 25 minor units, only after explicit opt-in and a spending cap |
| Currency and cadence | GBP, monthly |
| Standard setup | Included in the monthly price |
| Complex setup | Quoted separately. No catalogue row. |
| Standard plans | One Telloya operating location and one receptionist number |
| Further locations | A separate Custom quotation |
| Live service | No live answering and no customer telephone forwarding before setup and verification |

The applied commands already enforce the location cap, one occupying voice subscription per business, Guard as an add-on rather than an enquiry charge, and the separation between recording a number and turning forwarding on. `20261106140000` rejects an approved Basic, Growth, or Pro plan whose Telloya quantity is not 1.

## 2. What remains open

| Topic | Repository position |
| --- | --- |
| Customer agreement | `TELLOYA-DRAFT-2026-11-1` is a draft. Legal review is still required. |
| Tax | `telloyaTaxDecision.productionTaxBehaviour` is null. Status: `OWNER DECISION REQUIRED`. |
| Local draft tax placeholder | `EXCLUSIVE`. The offer command refuses every behaviour other than `NOT_APPLICABLE`, so that placeholder cannot be offered. |
| Unused minutes | OWNER_APPROVED on 7 November 2026: unused minutes expire and `minutes_rollover` stays false. No minute meter charges a customer from this change. |
| Cancellation and refunds | OWNER_APPROVED on 7 November 2026: cancellation at the end of the paid period, with no automatic pro-rata refund, subject to applicable law and service-failure remedies. LEGAL_REVIEW_REQUIRED for the contract wording. No customer cancellation command is enabled. |
| Renewal | OWNER_APPROVED on 7 November 2026: monthly renewal at the accepted amount until cancellation. No renewal job is started. |
| Custom price | Open. £250 in tests is a rehearsal figure, not a customer price. |
| Hosted seed | Closed until agreement text, tax behaviour, and any Custom price are approved in writing. |
| Recording and retention | Telloya privacy and recording drafts in `docs/telloya/05d-01/` are unpublished. The company privacy notice does not describe call audio. |
| Governing law and courts | `legalIdentity` leaves both unset. This pack does not invent them. |
| International tax | Open. A UK rule must not be copied onto every country. |

## 3. How the current acceptance and checkout flow works

1. Admin `prepare_offer` can offer a plan only when the plan, its `commercial_plan_conditions`, and the matching `commercial_agreement_versions` row are `APPROVED`, the currency is GBP, and `tax_behaviour` is `NOT_APPLICABLE`.
2. The customer reads the offer only when `CUSTOMER_COMMERCIAL_OFFER_READ_ENABLED` is exactly `true`. Acceptance requires `CUSTOMER_COMMERCIAL_OFFER_ACCEPT_ENABLED`, the agreement hash, every required confirmation, and recurring consent for a monthly price. Acceptance moves the subscription from `OFFERED` to `ACCEPTED`. It does not take payment or create an entitlement.
3. Overage is a separate boolean on that acceptance. Opt-in requires a cap from 1 to 100000000 minor units. Opt-out stores a null cap. The cap is not a line on the first invoice.
4. Checkout preparation copies the accepted GBP total and leaves the Stripe product, price, and session empty. `livemode` stays false.
5. Settlement accepts one paid initial invoice in GBP with `tax_behaviour` `NOT_APPLICABLE` on the plan, the subscription, and the acceptance. It rejects a non-GBP currency, a trial, a discount, automatic tax, a refund, or a dispute. It inserts one evidence row and moves `PAYMENT_PENDING` to `ACTIVE`.
6. Preview accepts only `stripe_test`. Production live mode also requires `STRIPE_LIVE_ACTIVATION`. Neither is enabled by this pack.
7. The eligibility gate can record `GBP_ONLY` or `LOCAL_AFTER_ELIGIBILITY`. The catalogue decision is that a local-currency display is not a second price and is not approved. Settlement still demands GBP.

Agreement rows move `DRAFT` to `APPROVED` to `RETIRED`. Approved text, the hash, and the confirmations are immutable. A plan’s approved amount, tax behaviour, currency, and terms reference are immutable. There is no audited Admin command that inserts or approves these rows. Tests insert them in an isolated database.

## 4. Proposed Telloya Service Agreement

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** This is not an approved agreement, not legal advice, and not a document to show a customer. It does not replace the company privacy notice (`app/privacy/page.tsx`) or the company website terms (`app/terms/content.ts`). Those pages remain the published legal text.

Proposed version label: `TELLOYA-PROPOSED-2026-11-1`

Proposed title: Telloya Service Agreement

Proposed party: ProfileRelaunch Ltd, company number 17520826, registered in England and Wales, registered office 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch. Contact: contact@profilerelaunch.com. Telloya is a service of that company.

### 4.1 Service description

Telloya is an AI receptionist for the single operating location named on a Basic, Growth, or Pro offer. It handles calls within the configuration an administrator has recorded for that location. The subscription includes one receptionist number for that location.

The service includes the monthly tier, the included minutes named on the offer, and standard setup. Optional Relaunch Guard is Google Business Profile monitoring at £9.99 a month for each location an administrator has confirmed. Guard interest on an enquiry is not a purchase. A Guard-only location does not include a receptionist or a number.

Telloya does not provide legal, medical, or emergency services. ProfileRelaunch case work is a separate service.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** The feature list above repeats the approved catalogue. A lawyer still needs to confirm that this description is the contract description.

### 4.2 Fees, included minutes, and measurement

The monthly charge is the amount on the accepted offer, in pounds sterling. For a standard plan that amount is the tier price plus £9.99 for each confirmed Guard location. Basic is £49, Growth is £79, and Pro is £120 before any Guard locations. The first invoice does not include overage.

Basic includes 120 minutes, Growth 300 minutes, and Pro 500 minutes in each monthly period. Custom minutes are only those written on an approved quotation.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** No minute meter is implemented. The proposed measurement is the provider’s duration of receptionist calls for that location, rounded up to the next whole minute. The owner must confirm that rounding rule before the sentence is used. Until a meter exists, the agreement must not tell a customer that minutes are already being counted in the product.

### 4.3 Overage and the spending cap

Additional minutes are £0.25 each. They are supplied only when the customer opts in on that offer and sets a spending cap. The cap is the maximum additional charge the customer authorises for the period. An enquiry cap does not authorise overage. The cap is not itself a charge.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** The product stores the opt-in and the cap. It does not yet stop calls at the cap or raise an overage invoice. See section 6 for the decision. For the first DEV test, the recommended acceptance leaves overage opted out.

### 4.4 Setup and customer responsibilities

Standard setup is included. Complex setup is a separate written quotation and is not part of the monthly price. Work on a complex setup starts only after the customer accepts that quotation.

The customer confirms authority to bind the business, keeps the business and location details accurate, and uses the receptionist for lawful business calls. The customer turns on telephone forwarding at the customer’s own telephone provider only when Telloya asks. Recording a number or sharing instructions does not enable forwarding and does not make the receptionist live.

### 4.5 AI voice, recording, and privacy

The receptionist is an AI voice. Before it asks a caller for a name or a problem, the caller hears that an AI is speaking and how the call is handled.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** The recording mode is undecided. `docs/telloya/05d-01/draft-legal-documents.md` holds three unpublished modes: summary only, recording retained, and transcription retained. This agreement must name the mode that is actually configured. It must not say calls are recorded while the account keeps no recording, and it must not say recordings are discarded while they are kept. Retention, subprocessors, and international transfers stay in that legal review. The company privacy notice does not yet describe Telloya call audio. A Telloya privacy supplement is published only after that review.

### 4.6 Telephone numbers and forwarding

Telloya may record one receptionist number and the forwarding instructions for the subscribed location. The customer remains responsible for the customer’s existing telephone service and for switching forwarding on or off at that provider. The number-owner record reserves that number for the business. A correction reserves the previous number as well. Release of a reserved number is a later process and is not part of this agreement.

### 4.7 Availability and limitations

The receptionist can be unavailable because of the customer’s telephone provider, the voice provider, or ProfileRelaunch. The service is limited to the recorded configuration and the included minutes.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** This draft sets no service credit and no liability cap. `legalIdentity` does not name a governing law or a court. Those sentences stay out until the owner and counsel write them.

### 4.8 Billing, renewal, cancellation, and refunds

The accepted offer authorises a recurring monthly charge in GBP at the accepted total. Each later period renews at that total until the subscription ends. Changing Guard locations after acceptance needs a new offer. It is not a self-serve change.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** Either party may end the subscription with effect from the end of the paid month. The proposed refund rule is that the current month is not refunded automatically. A consumer cooling-off right, a pro-rata refund, and a partial-month credit are alternative decisions in section 6. No customer cancellation command is enabled, so this sentence cannot be offered as an operating promise until that command exists.

### 4.9 Data protection and other legal documents

ProfileRelaunch Ltd is the business the customer contracts with. The company privacy notice and the company website terms remain in force for the website. This service agreement, once approved, would govern the Telloya subscription. Where a later approved Telloya privacy supplement covers call audio, that supplement would govern call audio.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** The precedence sentence above needs counsel. This pack does not publish either document.

### 4.10 Activation and suspension

Payment alone does not start the receptionist. Activation follows the existing setup order: verified payment, confirmed preferences, a recorded AI configuration, a recorded number, shared forwarding instructions, a passed conversation test, and the customer’s confirmation of the final telephone connection. The customer enables forwarding only when asked. The service is not live before that sequence.

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.** If the subscription leaves `ACTIVE`, including for non-payment, the receptionist is not left answering. The schema has `PAUSED`, `PAST_DUE`, `CANCEL_AT_PERIOD_END`, and `CANCELED`. A suspension command that withdraws the live configuration is not implemented. The sentence waits for that command.

### 4.11 Confirmations the acceptance command would require

These match the keys the current draft already uses:

- `business_authority` — I can accept this subscription for the business.
- `recurring_payment` — I agree to the monthly GBP price shown on this offer.
- `forwarding_duty` — I will forward calls only when Telloya asks me to.

Overage remains a separate choice with its own cap. It is not one of these three confirmations.

Proposed cancellation sentence, unapproved: “Either party may end the subscription at the end of the paid month. The current month is not refunded automatically.”

## 5. Tax comparison

### 5.1 Evidence already in the repository

- The selling entity on public pages is ProfileRelaunch Ltd. `legalIdentity.vatRegistered` is `false`. `vatNumber` is unset. The identity module forbids inventing a VAT number.
- `lib/commercial/gross-price-tax.ts` records the seller position `NOT_VAT_REGISTERED` and the UK determination `UK_DOMESTIC_NOT_VAT_REGISTERED`. For a verified UK customer in that position, the quote tax behaviour is `NOT_APPLICABLE`. The catalogue seed for the five ProfileRelaunch service prices stays `UNCONFIRMED` and still blocks an offer. That module does not invent a tax rate.
- The recovery gross-price rule treats the advertised amount as the customer total. `EXCLUSIVE` would add tax on top. `INCLUSIVE` would require a real rate. Neither is selected there.
- The Telloya offer command and the settlement command accept only `NOT_APPLICABLE`, GBP, and no automatic tax. The local Telloya placeholder `EXCLUSIVE` cannot be offered.
- Settlement rejects a non-GBP charge. A checkout page may later show another currency under `LOCAL_AFTER_ELIGIBILITY`. That display is not approved and is not a second catalogue price. The customer-quote wording already says a bank or payment provider may convert a GBP fee and may charge its own fee, and that ProfileRelaunch does not set that rate.
- Stripe test mode on Preview is `stripe_test` with a test key. It can exercise a GBP Checkout session. It does not decide VAT.

This pack does not re-check Companies House or HMRC. The `vatRegistered: false` flag is the repository record. An accountant confirms whether that record is still true before any seed.

### 5.2 Options

| Option | Customer total for Basic | Fits the current commands | Evidence |
| --- | --- | --- | --- |
| A. UK catalogue total, no tax added | £49, or £49 plus confirmed Guard. Nothing is described as VAT. | Yes. `tax_behaviour` `NOT_APPLICABLE`. | Matches the non-VAT-registered UK rule in `gross-price-tax.ts` and the offer and settlement SQL. |
| B. VAT added on top | £49 plus VAT. The customer pays more than the advertised price. | No. `EXCLUSIVE` is refused. It would also change the approved customer price. | The local placeholder uses this value only to keep draft rows unofferable. |
| C. VAT inside the £49 | £49 remains the total, with a VAT portion inside it. | No. `INCLUSIVE` is refused, and it needs a rate and a VAT number. The identity has neither. | Gross-price notes say inclusive treatment needs a real rate. |
| D. One rule for every country | The same behaviour for UK and non-UK customers. | The SQL would accept `NOT_APPLICABLE` for any offered plan, with no country split. | The UK determination is explicitly domestic. Copying it worldwide is not supported by the gross-price rule. |

Stripe Tax and automatic tax are outside these options. Settlement rejects automatic tax.

### 5.3 Recommendation for a limited DEV test

**PROPOSED — OWNER OR LEGAL APPROVAL REQUIRED.**

Use option A for one UK business customer on the DEV Preview, and only after an accountant confirms that ProfileRelaunch Ltd is still not VAT registered. The customer total equals the accepted GBP catalogue amount. The checkout stays `GBP_ONLY`. The invoice does not show a VAT number and does not describe any part of the price as VAT.

Do not offer a customer outside the United Kingdom on that rule. International treatment stays open. Do not approve `EXCLUSIVE` or `INCLUSIVE`. If the accountant says the company is VAT registered, stop. Option A is then the wrong seed, and the offer command would need a reviewed change before any other behaviour could be stored.

This recommendation is for the DEV test only. It is not a production tax policy. `productionTaxBehaviour` stays null until a separate production decision.

## 6. Outstanding commercial policies

Each recommendation keeps the approved prices and the one-location rule. Each recommendation is unapproved.

### 6.1 Unused minutes and rollover

| Option | Wording | Stored value | Recommendation |
| --- | --- | --- | --- |
| Expire | “Included minutes that you do not use in a monthly period expire at the end of that period.” | `minutes_rollover` false | Recommended for the first Basic seed, because the draft already proposes it and no rollover balance exists. |
| Roll one period | “Unused minutes move to the next period and then expire.” | `minutes_rollover` true | Open. No balance is implemented. |
| Refund unused | “We refund unused minutes.” | No field | Open. No refund command exists. |

Also decide what happens when included minutes are used up and overage is off. Recommended wording, unapproved: “When the included minutes are used and you have not opted in to additional minutes, the receptionist stops taking further calls for that period.” That stop is not implemented. The DEV test must not rely on it.

### 6.2 Cancellation and refunds

| Option | Wording | Fits the schema |
| --- | --- | --- |
| Period end, no automatic refund | “Either party may end the subscription at the end of the paid month. The current month is not refunded automatically.” | Matches `CANCEL_AT_PERIOD_END` and the current draft. Recommended as the proposed sentence. Still needs legal approval. |
| Pro-rata refund | “We refund the unused part of the current month.” | No refund command. Settlement rejects a refund on the initial invoice path. |
| Consumer cooling-off | A statutory withdrawal period for a consumer distance contract. | The flow is a business with a verified membership. Whether a consumer right still applies is a legal question. This pack does not decide it. |

### 6.3 Renewal

Recommended wording, unapproved: “The monthly price on the accepted offer is charged again at the start of each later month until the subscription ends at the end of a paid month.”

The operating path is a later Stripe renewal invoice. No renewal job is started by this pack. A renewal must charge the same GBP total. It must not add a second catalogue price.

### 6.4 Complex setup

Recommended wording, unapproved: “Standard setup is included in the monthly price. Any complex setup is described in a separate written quotation. That work starts only after you accept the quotation. The quotation is not part of this subscription and is not one of the £49, £79, or £120 prices.”

No catalogue row is added.

### 6.5 Overage spending cap

The cap is stored on the acceptance when the customer opts in. It is not charged up front.

| Option | Meaning | State of the product |
| --- | --- | --- |
| Hard ceiling | Additional minutes stop when the cap is reached. | Recommended wording. Not implemented. |
| Notice only | Calls continue and someone is told the cap was reached. | Not implemented. Weaker than the words “spending cap”. |
| DEV test | The test acceptance opts out. The cap is null. The £0.25 rate may still sit on the conditions row so a later offer can present it. | Recommended for the first DEV subscription. |

### 6.6 Custom quotations

Recommended wording, unapproved: “A Custom subscription exists only when a written quotation names the monthly price, the included minutes, the number of operating locations, and the number of receptionist numbers, and that quotation is approved as its own plan version. Basic, Growth, and Pro remain one location and one number.”

No Custom price is proposed here. The £250 rehearsal figure stays out of the seed. A quotation that asks for more numbers than locations has no representation in the current commands.

## 7. Owner-approval checklist

The owner marks each line. This document does not mark them.

1. Accountant confirms whether ProfileRelaunch Ltd is VAT registered today. The repository record says it is not, and it stores no VAT number.
2. For the DEV test only, accept or reject option A: UK customer, catalogue total, `NOT_APPLICABLE`, no amount described as VAT, GBP checkout.
3. Confirm the first DEV customer is a UK business. International tax stays undecided.
4. Accept or reject `TELLOYA-PROPOSED-2026-11-1` as the agreement body, including the three confirmations and the cancellation sentence.
5. Accept or reject expiry of unused minutes (`minutes_rollover` false) and the proposed stop when included minutes are used.
6. Accept or reject period-end cancellation with no automatic refund of the current month.
7. Accept or reject monthly renewal at the same GBP total.
8. Accept or reject complex setup as a separate quotation.
9. Accept or reject a hard spending cap, and confirm the first DEV acceptance will opt out of overage.
10. Confirm no Custom plan is seeded.
11. Counsel reviews recording mode, retention, liability, governing law, and the relationship with the company privacy notice before any customer sees the text.
12. A named reviewer, in a later change, may seed DEV. This checklist does not authorise that seed.

## 8. DEV seeding plan

Read-only. Do not run it from this change. Do not create hosted rows or Stripe objects.

After every checklist line that the seed depends on is accepted in writing:

1. Read the DEV ledger. Stop unless the head is `20261106200000` and the count is 115. Stop if Production is not still `20261014170000`.
2. Confirm hosted DEV still has no approved Telloya plan, agreement, or commercial subscription.
3. Insert one `product_catalogue` row for `TELLOYA`, kind `STANDALONE`, status `DRAFT`, if that code is absent. There is no audited Admin command for this insert. The later change must be a reviewed seed, not an ad hoc script pointed at hosted DEV.
4. Insert one `commercial_agreement_versions` row as `DRAFT`, product `TELLOYA`, version ref `TELLOYA-PROPOSED-2026-11-1`, with the approved body, cancellation sentence, and three confirmations. The `content_hash` is `commercial_agreement_hash_v1` of those fields. Do not insert `TELLOYA-DRAFT-2026-11-1` or any `TELLOYA-TEST-` fixture as the customer agreement.
5. Insert one `plan_versions` row as `DRAFT`: Basic, version number 9301, `MONTH`, `GBP`, amount 4900, `terms_ref` equal to that agreement ref. Set `tax_behaviour` to `NOT_APPLICABLE` only if checklist line 2 was accepted. Do not store `EXCLUSIVE`.
6. Insert one `plan_components` row: `TELLOYA`, `LOCATION`, `quantity_limit` 1.
7. Insert one `commercial_plan_conditions` row as `DRAFT`: tier `BASIC`, label `Basic`, 120 minutes, `minutes_rollover` false only if checklist line 5 was accepted, base 4900, Guard unit 999, overage rate 25. The hash is `commercial_plan_conditions_hash_v1` of the tier, minutes, rollover, base, Guard unit, and overage rate.
8. Stop. A different named reviewer sets the agreement, the conditions, and the plan to `APPROVED`, with `approved_by` and `approved_at`. The schema does not allow those texts to be edited afterwards. Do not approve them in the insert.
9. Leave Growth, Pro, and Custom unseeded. Leave enquiry, checkout, settlement, setup, and Retell flags false. Create no Stripe product, price, customer, or subscription.
10. The first offer, if a later phase enables it, uses the existing `prepare_offer`, customer acceptance, checkout preparation, and test-mode settlement commands. The test acceptance opts out of overage.

Approving the Basic plan with a Telloya quantity other than 1 is rejected by the applied location-cap migration. Do not replay that migration.
