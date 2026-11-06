# Telloya Phase C-03 commercial catalogue proposal

Status: proposal for independent review. Nothing in this document approves a price, a location cap, an agreement, or a tax treatment. No hosted database was written. No Stripe object was created. Production was not modified.

Foundation verified from the repository after PR #436 merged to `develop` at `41ec36a3`:

- Supabase DEV project `profilerelaunch-dev` ledger: 112 applied migrations, head `20261106003939`.
- The seven commercial migrations through forwarding instructions are applied and must not be replayed.
- Repository migrations do not insert `product_catalogue`, `plan_versions`, `commercial_agreement_versions`, or `commercial_subscriptions`. A later onboarding command can insert a `DRAFT` product row for its own request. This phase does not run that command against DEV.
- The Technical Architect’s verified DEV state for this phase: no product catalogue, approved plan, agreement, or commercial subscription records.
- PR #435 remains a separate workstream. Its test-call migration is not part of this proposal and is not marked applied.

The existing commercial command, offer acceptance, and checkout preparation stay the billing path. This proposal does not add a second catalogue or a second payment command.

## 1. Proposed catalogue values

| Item | Proposal | Minor units |
| --- | --- | ---: |
| Basic, monthly | £49, 120 minutes | 4900 |
| Growth, monthly | £79, 300 minutes | 7900 |
| Pro, monthly | £120, 500 minutes | 12000 |
| Custom | Quotation. No price and no minutes in this proposal. | none |
| Relaunch Guard | £9.99 per administrator-confirmed location per month | 999 |
| Additional minutes | £0.25 per minute, only after explicit acceptance and a spending cap | 25 |
| Currency | GBP | |
| Cadence | Monthly | |
| Standard setup | Included in the monthly price | |
| Complex setup | Quoted separately. No catalogue row. | |
| Unused minutes | Proposed to expire at period end. `minutes_rollover` would be false. Not approved. | |

Guard interest on an enquiry is not a charge. The accepted monthly total is the tier amount plus 999 times the number of Guard locations an administrator confirmed on that offer. Overage is not added to that total. The spending cap is a ceiling on later usage, not a line on the first invoice.

Local draft identifiers, if an isolated database copies this proposal, are version numbers 9301–9304 and agreement ref `TELLOYA-DRAFT-2026-11-1`. Those rows stay `DRAFT`. The older `TELLOYA-TEST-` fixture remains a rehearsal marker and is not this proposal.

## 2. Location-policy decision matrix

The published prices do not say how many locations a tier includes. The schema stores that as `plan_components.quantity_limit` for component `TELLOYA`. One current approved version is allowed for each tier and cap. A business can have only one occupying Telloya subscription, so a second subscription is not a way to add a location.

| Option | What it means | Impact | Status |
| --- | --- | --- | --- |
| One location on Basic, Growth and Pro | The proposed standard cap is 1. More locations are a Custom quotation. | Fits the one-subscription-per-business rule. The cap on that subscription is the location count. | **Proposed. Not approved.** |
| Several caps at the same price | Growth for one location and Growth for two locations can both be approved at £79. | The owner is deciding that the published price includes that many locations. The price does not rise. | Alternative. Not proposed as the default. |
| Price per location | £49, £79, or £120 times the location count. | The plan stores one monthly amount today. Only Guard is multiplied. This needs a later command change. | Not in this proposal. |
| Unlimited locations | Every location the business adds is covered. | An approved Telloya plan must have one Telloya location component. Leaving it off does not mean unlimited. | Rejected for this proposal. |

The local draft rows store cap 1 on Basic, Growth and Pro because that is the proposed option. The unpriced Custom template also has a component of 1 so the row has a valid shape. That template cap is not a decision that Custom includes one location. A real multi-location quotation is a later plan version whose cap equals the quoted locations, still `DRAFT` until that quotation is approved.

## 3. Draft agreement

The draft customer agreement is `docs/telloya/phase-c/draft-customer-agreement.md`. It is marked DRAFT. It is not the “TEST ONLY” rehearsal sentence. It covers the service limits, monthly GBP payment, included minutes, unused minutes, Guard, overage, forwarding responsibility, privacy, cancellation, availability, and international customers. Legal review is still required. Service credits, liability caps, retention, and refunds are deliberately unresolved in the draft.

## 4. Tax and Stripe

The current offer command offers a plan only when `tax_behaviour` is `NOT_APPLICABLE`, the plan and its conditions and agreement are `APPROVED`, and the currency is GBP. That constraint is why the Phase C-01 rehearsal used `NOT_APPLICABLE`. It is not a tax decision.

This proposal leaves production tax as **OWNER DECISION REQUIRED**. `productionTaxBehaviour` is null. Local draft priced rows use `EXCLUSIVE` as a placeholder. The current command will not offer those rows, even if they were approved by mistake, until a later explicit change selects a tax behaviour the command accepts. Choosing `NOT_APPLICABLE` for production is allowed only after an accountant says VAT does not apply. Inclusive VAT would keep the customer price at the advertised amount and record the VAT portion. Exclusive VAT would add VAT on top. International customers may fall into a different treatment. None of those is selected here.

Stripe, using the commands that already exist:

- The accepted subscription stores one GBP amount: tier plus confirmed Guard. That is the recurring amount a later Stripe price must charge.
- Checkout preparation copies that amount and leaves `stripe_product_id`, `stripe_price_id`, and `checkout_session_id` empty. `livemode` stays false. Preparation does not create a Stripe object.
- A second preparation for the same checkout selection returns the existing preparation. One checkout row is stored.
- One incoming subscription per business, and one occupying subscription per business, block a second live Telloya subscription.
- `stripe_subscription_id` is unique. A second Stripe subscription cannot be attached to two commercial subscriptions.
- Changing Guard quantity after acceptance is not implemented. It needs a new offer or a later amendment command. This proposal does not add one.
- Cancellation states exist (`CANCEL_AT_PERIOD_END`, `CANCELED`). No customer cancellation command is enabled here. The draft agreement proposes ending at the next period boundary, without an automatic refund.
- Renewal would be a later Stripe subscription invoice. No renewal job is started by this proposal.
- A checkout page may later present another currency. The stored and billed amount stays GBP unless a separate foreign-exchange decision is approved. Local-currency display is not a second catalogue price.
- Idempotent payment preparation is the existing customer command receipt. This proposal does not add a new idempotency store.

No Stripe product, price, customer, or subscription is created.

## 5. Safe DEV seeding and approval plan

Do not run this until the owner has approved the location policy, the agreement text, the tax behaviour, and the Custom workflow in writing.

1. Read the DEV ledger. Stop unless the head is `20261106003939` and the count is 112. Stop if Production is not still `20261014170000`.
2. Confirm there is still no approved Telloya plan, agreement, or commercial subscription.
3. Insert this proposal as `DRAFT` only, using `TELLOYA-DRAFT-2026-11-1` and versions 9301–9304. Do not insert the `TELLOYA-TEST-` fixture.
4. Stop. A different change, by a named reviewer, approves the agreement, the conditions, and the plans. Do not approve them in the insert.
5. Before approval, set the tax behaviour to the accountant’s decision and change the offer command if that decision is not `NOT_APPLICABLE`. The `EXCLUSIVE` placeholder must not be approved as the tax policy.
6. Leave enquiry, setup, forwarding, and Retell flags false. Do not create Stripe objects in the seeding change.
7. Do not apply PR #435’s migration as part of seeding.

## 6. Open owner decisions

- Approve or replace the one-location standard cap.
- Approve the legal agreement, including unused minutes, cancellation, refunds, liability, and privacy.
- Choose tax: inclusive VAT, exclusive VAT, or no VAT, including international customers.
- Decide whether any Custom quotation is offered, and at what amount and location cap. This proposal has neither.
- Decide whether a local-currency checkout display is required.
- Decide how a later Guard quantity change and cancellation are operated.
- Approve any hosted insert. Until then the rows stay in the repository as a proposal.

## 7. What the local tests check

`telloya-catalogue-proposal.test.ts` locks the prices, the location matrix, the tax placeholder, and the draft agreement text.

`telloya-catalogue-proposal.database.test.ts` installs the proposal twice in PGlite, proves the rows stay `DRAFT` and unofferable, then approves a copy of the standard plans only inside that test database so the existing offer command can be rehearsed. That approval is not the installer and it is not a hosted seed. The rehearsal checks Basic, Growth and Pro amounts, included minutes, Guard quantity, the exact accepted total, a Custom plan that still has no price, overage opt-in with a cap, a stale agreement reference, a second subscription, a repeated checkout preparation, tenant isolation, and no service activation before verified payment and an explicit begin-setup call.
