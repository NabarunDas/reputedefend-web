# Telloya customer agreement — draft for review

Status: **DRAFT**. Commercial rules marked OWNER_APPROVED were recorded on 7 November 2026. This is not a legally approved Telloya Service Agreement and it is not legal advice. Do not show it to a customer. Do not publish it. Do not insert a hosted agreement row.

The canonical draft body, cancellation sentence, and confirmations are `telloyaDraftAgreement` in `apps/admin/lib/commercial/telloya-catalogue-proposal.ts`. A local test installs that body as a `DRAFT` agreement row. The older PGlite fixture that begins “TEST ONLY” is a rehearsal marker and is not this agreement.

Version ref: `TELLOYA-DRAFT-2026-11-1`

## Draft body

DRAFT — NOT A LEGAL AGREEMENT. This text is for the owner and for legal review. It is not approved for a customer. It is not legal advice.

1. Service. Telloya provides an AI receptionist for the locations named on the accepted offer. It answers and handles calls only within the configuration an administrator has recorded. It does not provide legal, medical, or emergency services. ProfileRelaunch case work is a separate service and is not included.

2. Subscription and payment. The subscription is monthly, in GBP, at the amount on the accepted offer. That amount is the tier price plus any Relaunch Guard locations the administrator confirmed. Standard setup is included. Complex setup is quoted separately and is not part of this subscription. Accepting an offer does not start the service and does not create a Stripe subscription by itself. OWNER_APPROVED on 7 November 2026: the subscription renews automatically each month at the accepted amount until the customer cancels.

3. Included minutes. OWNER_APPROVED on 7 November 2026: Basic includes 120 minutes, Growth includes 300 minutes, and Pro includes 500 minutes in each monthly period. Custom minutes come from a separate quotation. A rehearsal Custom figure in this repository is not an approved price. The allowance used for a customer is the accepted subscription snapshot, not a marketing form.

4. Unused minutes. OWNER_APPROVED on 7 November 2026: unused minutes expire at the end of each monthly billing period and do not roll over.

5. Relaunch Guard. Guard is optional. The draft price is £9.99 per location per month, and only for locations an administrator has explicitly confirmed. Interest on an enquiry is not a purchase. Guard monitoring does not start when the subscription is paid.

6. Additional minutes. OWNER_APPROVED on 7 November 2026: additional minutes are £0.25 per minute, and only when the customer has explicitly opted in and accepted a hard spending cap. The cap is not a charge by itself. An enquiry cap does not authorise overage. A customer charge for a partial minute is REVIEW_BEFORE_CHARGE. The proposed calculation rounds provider seconds up to the next whole minute, in integer minor units, and must not exceed the accepted cap. This draft does not create that charge.

7. Numbers and forwarding. Telloya may record a telephone number and forwarding instructions. The customer remains responsible for turning forwarding on at their own telephone provider. Recording those instructions does not enable forwarding and does not make the service live.

8. Data, recordings and privacy. OWNER_APPROVED on 7 November 2026: only a structured lead summary and the caller details needed to act on it are retained. A full transcript and call audio are not retained in ProfileRelaunch. Caller data is not authorised for AI-model training. Lead details and summaries are retained for 90 days, with a deletion or erasure request and a documented legal hold as exceptions. LEGAL_REVIEW_REQUIRED: the published privacy supplement, subprocessors, and international transfers. PROVIDER_VERIFICATION_REQUIRED: the provider data-storage setting and the provider training terms. This draft does not replace a privacy notice.

9. Cancellation and refunds. OWNER_APPROVED on 7 November 2026: the customer may cancel at any time, and cancellation takes effect at the end of the period already paid. There is no automatic pro-rata refund. That rule is subject to applicable law and to a remedy where the service has failed. LEGAL_REVIEW_REQUIRED: any different refund wording.

10. Availability and liability. The service can be unavailable. LEGAL_REVIEW_REQUIRED: a service credit and a liability cap. Those terms are not owner-approved and must be reviewed before any customer sees them.

11. International customers. Customers outside the United Kingdom may subscribe. Prices are stored and billed in GBP. A checkout page may later show a local currency, but that display is not a second price and it is not approved here. Tax for those customers is not decided.

12. Status of this document. DRAFT — NOT A LEGAL AGREEMENT. The OWNER_APPROVED sentences above are commercial rules recorded on 7 November 2026. They do not make this Telloya Service Agreement legally approved. Do not present it to a customer. Do not publish it. Do not insert a hosted agreement row. Do not copy it into hosted DEV until legal review approves a later version.

## Draft cancellation sentence

DRAFT. Either party may end the subscription at the end of the paid month. This draft does not promise a refund of the current month.

## Confirmations a later approved version would require

- `business_authority` — I can accept this subscription for the business.
- `recurring_payment` — I agree to the monthly GBP price shown on this offer.
- `forwarding_duty` — I will forward calls only when Telloya asks me to.

Overage is not one of these confirmations. It is a separate choice on the offer, with its own spending cap.
