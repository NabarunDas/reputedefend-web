# Telloya customer agreement — draft for review

Status: **DRAFT**. This is not an approved customer agreement and it is not legal advice. Do not show it to a customer. Do not copy it into hosted DEV until the owner and legal review approve a later version.

The canonical draft body, cancellation sentence, and confirmations are `telloyaDraftAgreement` in `apps/admin/lib/commercial/telloya-catalogue-proposal.ts`. A local test installs that body as a `DRAFT` agreement row. The older PGlite fixture that begins “TEST ONLY” is a rehearsal marker and is not this agreement.

Version ref: `TELLOYA-DRAFT-2026-11-1`

## Draft body

DRAFT — NOT A LEGAL AGREEMENT. This text is for the owner and for legal review. It is not approved for a customer. It is not legal advice.

1. Service. Telloya provides an AI receptionist for the locations named on the accepted offer. It answers and handles calls only within the configuration an administrator has recorded. It does not provide legal, medical, or emergency services. ProfileRelaunch case work is a separate service and is not included.

2. Subscription and payment. The subscription is monthly, in GBP, at the amount on the accepted offer. That amount is the tier price plus any Relaunch Guard locations the administrator confirmed. Standard setup is included. Complex setup is quoted separately and is not part of this subscription. Accepting an offer does not start the service and does not create a Stripe subscription by itself.

3. Included minutes. Basic includes 120 minutes, Growth includes 300 minutes, and Pro includes 500 minutes in each monthly period. Custom minutes are whatever the approved quotation states. A draft Custom plan in this proposal has no minutes and no price.

4. Unused minutes. This draft proposes that unused minutes expire at the end of the monthly period and do not roll over. That treatment is not approved.

5. Relaunch Guard. Guard is optional. The draft price is £9.99 per location per month, and only for locations an administrator has explicitly confirmed. Interest on an enquiry is not a purchase. Guard monitoring does not start when the subscription is paid.

6. Additional minutes. This draft proposes £0.25 per minute after the included minutes. Overage is charged only when the customer accepts it on that offer and sets a spending cap. The cap is not a charge by itself. An enquiry cap does not authorise overage.

7. Numbers and forwarding. Telloya may record a telephone number and forwarding instructions. The customer remains responsible for turning forwarding on at their own telephone provider. Recording those instructions does not enable forwarding and does not make the service live.

8. Data, recordings and privacy. Call content, recordings, and business details are processed to provide the service and to support the account. This draft does not replace a privacy notice. Retention, subprocessors, and international transfers still need legal review.

9. Cancellation and refunds. This draft proposes cancellation at the end of the paid month, with no automatic refund of that month. A different refund rule is an open legal decision.

10. Availability and liability. The service can be unavailable. This draft does not set a service credit or a liability cap. Those terms need legal review before any customer sees them.

11. International customers. Customers outside the United Kingdom may subscribe. Prices are stored and billed in GBP. A checkout page may later show a local currency, but that display is not a second price and it is not approved here. Tax for those customers is not decided.

12. Status of this document. DRAFT — NOT A LEGAL AGREEMENT. Do not present it to a customer. Do not copy it into hosted DEV until the owner and legal review approve a later version.

## Draft cancellation sentence

DRAFT. Either party may end the subscription at the end of the paid month. This draft does not promise a refund of the current month.

## Confirmations a later approved version would require

- `business_authority` — I can accept this subscription for the business.
- `recurring_payment` — I agree to the monthly GBP price shown on this offer.
- `forwarding_duty` — I will forward calls only when Telloya asks me to.

Overage is not one of these confirmations. It is a separate choice on the offer, with its own spending cap.
