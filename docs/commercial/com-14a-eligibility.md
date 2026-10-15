# COM-14A commercial eligibility

Status: applied to DEV on 2026-10-15 only. `supabase/migrations/20261015140000_commercial_eligibility_gate_v1.sql` is additive and has not been applied to Production. AWS ApprovedMigrationHead stays at `20261014170000`. The paid-service catalogue stays `SOLICITOR_REVIEW` and inoperative. Stripe live mode, the Customer Portal, Guard and mail automation stay off.

The only seeded commercial fact is that ProfileRelaunch Ltd is not VAT registered. That is not a zero-rating and it does not authorise overseas sales. No country catalogue is seeded. A missing overseas decision is not a hidden approval.

`UNCONFIRMED` tax still blocks an offer and an acceptance. Contract prices stay in GBP. No foreign-exchange rate is invented. A stored Checkout or Guard receipt is checked again before it is replayed.

## Before and after

```text
Before
  Enquiry, draft, or estimate
    -> country had to exist in a seeded review matrix
    -> binding offer blocked for every country, including the UK
    -> a paid action could not even be issued

After
  Enquiry, case assessment, draft, nonbinding estimate
    -> open worldwide
    -> collect legal name, contact, establishment country, purpose, profile link, service interest
    -> no VAT number and no company number required at first contact

  Binding offer, acceptance, or payment
    -> purchasing-business country not yet recorded: stop
    -> recorded sanctions restriction: stop
    -> confirmed UK business, tax not applicable, seller not VAT registered: documented treatment, GBP, then the turnover check
    -> overseas with a current reusable decision for that country, service and payment flow: allow
    -> otherwise: do not offer or charge; customer sees
       "Thanks — we'll confirm your quote and payment details shortly."
```

A draft quote is the nonbinding estimate. It is not marked offered until the binding check passes. There is no second acceptance engine.

The Google Business Profile country on `locations.country` is never the purchasing business's country. A UK listing owned by an overseas business follows the overseas route.

## United Kingdom

Before a binding quote, record where the purchasing business belongs through the authenticated establishment record. A typical UK firm does not need a VAT number or a company number for that record, and does not need a separate accountant approval for each quote. Tax `NOT_APPLICABLE` then uses `UK_DOMESTIC_NOT_VAT_REGISTERED` while the seller position is `NOT_VAT_REGISTERED`. Checkout, invoicing and Guard still depend on the existing operative-agreement and payment-activation controls. Live Stripe stays off in this change.

A current `BLOCKED` decision for that service and payment flow wins over the UK treatment. An explicit current approval whose tax treatment does not match the quote also wins, and the sale stops. The verified establishment country wins over the listing country, the request body, card country and checkout currency.

Accepted UK GBP amounts are written to `commercial_tax_log` and summed for the rolling 12 months. At 80 percent of £90,000 the sale is still allowed and an `APPROACHING` alert is stored. At £90,000, while the seller is not VAT registered, a new not-applicable UK sale stops. Payment attempts are logged and are not added to that total. The prospective next-30-days test is a manual review; the database does not invent a forecast.

## Overseas

When a real business customer is ready for a binding paid agreement, record one decision for the receiving country, the service class and the payment flow. The same current decision is reused for a later customer in the same position. It is not reused for a different country, service or flow.

The United States and Canada need a state or province when the sale is approved. There is no EU-wide, UK-as-a-code, or worldwide row. `UK_DOMESTIC_NOT_VAT_REGISTERED` cannot be stored for a non-GB country. Evidence that says the supply is worldwide zero-rated is rejected.

## Sanctions

`commercial_sanctions_restrictions` starts empty. It is a place to record a restriction that must fail closed. It is not an automated sanctions screening system. It does not screen people, entities or payment routes, and the empty table is not a claim that screening is complete. Staff and the payment provider still screen before a payment. No country ban is invented here. A row, once recorded, cannot be overridden by a later approval.

## Still for the accountant or adviser

No overseas country is pre-cleared. The first real customer in a country needs a short recorded check before anyone is charged: where the customer belongs, the service, whether local tax or a reverse charge applies, and whether the payment route can take that sale. Uncertain or high-risk first sales go to an adviser before the charge. HMRC VAT Notice 741A is the place-of-supply starting point for B2B services. Not being VAT registered is not a worldwide exemption.

The seller's VAT position is recorded as not registered on 14 October 2026. A later registration is a new row, not an edit. Stripe Tax is not a registration.

## Still for the owner

- The solicitor approval of PS-2026-10-14.2 still needs an authenticated Admin record with a real external evidence reference. Owner-reported confirmation does not make the catalogue operative.
- DEV application is complete and independently verified; Production application remains separate and requires the usual backup and `ApprovedMigrationHead` review.
- Live Stripe, Customer Portal, Guard and email remain separate activation decisions.
