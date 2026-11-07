# Telloya Service Agreement — review draft

**NOT APPROVED. NOT PUBLISHED. NOT LEGAL ADVICE.**

This is an internal consolidation for the owner and for counsel. It is not a customer agreement, not an offer, and not legal advice. Do not show it to a customer. Do not copy it into hosted DEV. Do not present it as `TELLOYA-DRAFT-2026-11-1` or as an approved version of `TELLOYA-PROPOSED-2026-11-1`.

**Date:** 7 November 2026 (UK).
**Proposed label, still only a document name:** `TELLOYA-PROPOSED-2026-11-1`.
**Code draft left unchanged:** `TELLOYA-DRAFT-2026-11-1`.

Where this draft repeats an approved price or entitlement, the source is the catalogue. Where a sentence is only proposed, it is marked. A mark is not an approval.

## Parties

**Proposed.** The customer contracts with ProfileRelaunch Ltd, company number 17520826, registered in England and Wales, registered office 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch. Contact: contact@profilerelaunch.com.

Telloya is a service operated by that company. It is not a separate contracting entity.

**LEGAL REVIEW.** Counsel still needs to confirm that this description is the contract description. The company website terms and the company privacy notice stay in force for the website. They are not this agreement.

## 1. Standard and Custom subscriptions

**Approved catalogue, repeated here.**

- Basic is £49 a month and includes 120 minutes.
- Growth is £79 a month and includes 300 minutes.
- Pro is £120 a month and includes 500 minutes.
- Custom has no approved price and no approved minute allowance. A Custom subscription would exist only when a written quotation names the monthly price, the included minutes, the number of operating locations, and the number of receptionist numbers, and that quotation is approved as its own plan version.
- The published currency is GBP. The monthly charge is the amount on an accepted offer.
- The £250 figure in tests is a rehearsal of a two-location Custom quotation. It is not a customer price.

**OWNER DECISION.** Accept or reject the C-06A recommendation that no Custom plan is seeded until a real quotation is approved.

**Contradiction to resolve.** `TELLOYA-DRAFT-2026-11-1` clause 1 speaks of “the locations named on the accepted offer” without the one-location limit. Do not publish that clause as the standard-plan promise.

## 2. Operating location and receptionist number

**Approved catalogue, repeated here.** A Basic, Growth, or Pro subscription includes one operating location and one receptionist telephone number. Another receptionist location or number requires a separately agreed Custom quotation.

**LEGAL REVIEW.** Confirm that this limit is the contract limit, including for a standard plan sold with optional Guard.

## 3. Standard and complex setup

**Approved catalogue, repeated here.** Standard setup is included in the monthly price. Complex setup, including unusual carrier configuration and more than one receptionist location, is a separate written quotation. It is not part of the £49, £79, or £120 price.

**Proposed, unapproved.** Work on a complex setup starts only after the customer accepts that quotation.

## 4. AI receptionist limitations

**Proposed, from the existing drafts.** Telloya answers and handles calls only within the configuration an administrator has recorded. It does not provide legal, medical, or emergency services. ProfileRelaunch case work is a separate service and is not included.

The receptionist can be unavailable because of the customer’s telephone provider, the voice provider, or ProfileRelaunch. The service does not promise that every call is answered, that an appointment is booked, or that a callback happens.

**OWNER DECISION.** The homepage heading “Never Misses a Call” is still public and is not a service level. Decide whether that heading stays before this limitation is shown beside it.

**OWNER DECISION. LEGAL REVIEW.** Emergency calls. The service must not be described as dispatch or as a call to the emergency services. The words a caller hears, and the route the caller is offered instead, are not chosen. No emergency behaviour is implemented.

**LEGAL REVIEW.** No service credit and no liability cap are proposed. `legalIdentity` does not name governing law or a court. This draft does not choose either.

## 5. Customer call-forwarding responsibilities

**Proposed, matching the current draft confirmations.** The customer keeps the business and location details accurate and uses the receptionist for lawful business calls. The customer turns forwarding on or off at the customer’s own telephone provider only when Telloya asks. Recording a number, or sharing forwarding instructions, does not enable forwarding and does not make the receptionist live.

A number correction reserves the previous number as well as the new one. Release of a reserved number is a later process and is not part of this draft.

**Proposed confirmation, already named in code and still unapproved as a customer term:**

- `forwarding_duty` — I will forward calls only when Telloya asks me to.

**PROVIDER CONFIRMATION.** Whether a given carrier supports conditional forwarding is confirmed per customer. This draft does not list countries or carriers.

## 6. Included minutes and billable usage

**Approved allowance.** Basic 120, Growth 300, Pro 500, in each monthly period. Custom minutes are only those written on an approved quotation.

**OWNER DECISION. PROVIDER CONFIRMATION.** No minute meter is implemented. C-06A proposes that a minute is the provider’s duration of receptionist calls for that location, rounded up to the next whole minute. The pricing FAQ instead describes active handling time and leaves hold and transfer to a future agreement. Ringing time and failed calls are open in the 05D-01 schedule. The owner must choose one definition. Until a meter exists, this agreement must not say the product is already counting minutes.

**OWNER DECISION.** C-06A recommends, and does not approve, that unused minutes expire at the end of the monthly period (`minutes_rollover` false). Rollover and a refund of unused minutes are the other options on the register. No rollover balance exists.

## 7. Overage opt-in and spending limits

**Approved price rule.** Additional minutes are £0.25 each. They are supplied only when the customer opts in on that offer and sets a spending cap. The cap is the maximum additional charge the customer would authorise for the period. It is not itself a charge. An enquiry cap does not authorise overage. The first invoice does not include overage.

**OWNER DECISION.** C-06A recommends a hard ceiling: additional minutes stop when the cap is reached. That stop is not implemented. A notice-only alternative is weaker than the words “spending cap” and is also not implemented.

**OWNER DECISION.** C-06A recommends that the first DEV acceptance opt out of overage. That recommendation is not a production policy.

**OWNER DECISION.** When included minutes are used and overage is off, the recommended unapproved wording is that the receptionist stops taking further calls for that period. That stop is not implemented.

## 8. Relaunch Guard

**Approved catalogue, repeated here.** Guard is optional Google Business Profile monitoring at £9.99 a month for each location an administrator has confirmed. Guard interest on an enquiry is not a purchase. Paying for Telloya does not start Guard monitoring. A Guard-only location does not include a receptionist or a receptionist number.

Changing Guard locations after acceptance would need a new offer. It is not a self-serve change.

Guard records are not call recordings.

## 9. Billing and monthly renewal

**Proposed, unapproved.** The accepted offer would authorise a recurring monthly charge in GBP at the accepted total. C-06A recommends: “The monthly price on the accepted offer is charged again at the start of each later month until the subscription ends at the end of a paid month.”

The intended operating path is a later Stripe renewal invoice. No renewal job is started. A renewal must not add a second catalogue price. Accepting an offer does not take payment and does not create a Stripe subscription by itself.

**Proposed confirmations, already named in code and still unapproved as customer terms:**

- `business_authority` — I can accept this subscription for the business.
- `recurring_payment` — I agree to the monthly GBP price shown on this offer.

**LEGAL REVIEW. OWNER DECISION.** Production tax is not decided. See the decision register. This draft does not describe any part of the price as VAT.

## 10. Cancellation and refunds

**Proposed, unapproved.** C-06A and the short draft both propose: either party may end the subscription at the end of the paid month, and the current month is not refunded automatically.

**LEGAL REVIEW. OWNER DECISION.** A pro-rata refund, a partial-month credit, and a consumer cooling-off right are open. The acceptance flow is built for a business with a verified membership. Whether a consumer right still applies is a legal question. This draft does not decide it.

No customer cancellation command is enabled. The sentence cannot be offered as an operating promise until that command exists. Settlement of the initial invoice rejects a refund.

## 11. Suspension, failure, and termination

**Proposed, from the setup order already documented.** Payment alone does not start the receptionist. Activation follows verified payment, confirmed preferences, a recorded AI configuration, a recorded number, shared forwarding instructions, a passed conversation test, and the customer’s confirmation of the final telephone connection. The customer enables forwarding only when asked.

**OWNER DECISION.** If the subscription leaves `ACTIVE`, including for non-payment, the proposed sentence is that the receptionist is not left answering. The schema has `PAUSED`, `PAST_DUE`, `CANCEL_AT_PERIOD_END`, and `CANCELED`. A command that withdraws a live configuration is not implemented.

**PROVIDER CONFIRMATION.** Provider outages and forwarding failures are not a tested customer-facing behaviour. A failed test call in the Admin path leaves the location in `TEST_REQUIRED`. That is not a public outage promise.

## 12. Liability, governing law, and disputes

**LEGAL REVIEW. OWNER DECISION.** No liability cap, no service credit, no governing law, and no court are stated. `lib/legal.ts` forbids inventing them. This draft leaves the clauses blank:

- Liability cap: not chosen.
- Service credit: not chosen.
- Governing law: not chosen.
- Courts or other dispute forum: not chosen.

## 13. Data processing and privacy

**LEGAL REVIEW.** The company privacy notice remains the published website notice. It does not describe Telloya call audio. A Telloya privacy supplement would govern call audio only after counsel and the owner approve it. The supplement in this folder is not that notice.

The recording mode is undecided. This agreement must name the mode that is actually configured. It must not say calls are recorded while no recording is kept, and it must not say recordings are discarded while they are kept.

**Contradiction to resolve.** `TELLOYA-DRAFT-2026-11-1` clause 8 says recordings are processed. Do not publish that sentence until a mode is chosen and verified.

Precedence between the company website terms, the company privacy notice, this service agreement, and a future Telloya privacy supplement is **LEGAL REVIEW**.

## Status

Every proposed sentence above remains **OWNER DECISION** or **LEGAL REVIEW** where marked, even when it repeats a recommendation from C-06A. Approved prices and the one-location entitlement are catalogue facts. They do not by themselves make this document a contract.
