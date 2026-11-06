# Telloya commercial catalogue proposal

Status: the operating-location and receptionist-number policy in this document is owner-approved. Basic, Growth and Pro prices are unchanged. The customer agreement, tax and VAT treatment, unused-minute rollover, cancellation and refund terms, Custom prices, and hosted catalogue seeding remain open. No hosted database was written. No Stripe object was created. Production was not modified. No migration was applied.

Foundation verified from the repository after PR #438 merged to `develop` at `990e0217`:

- Supabase DEV project `profilerelaunch-dev` ledger: 114 applied migrations, head `20261106140000`. The previous ledger had 112 entries and ended at `20261106003939`.
- The seven commercial migrations through forwarding instructions are applied and must not be replayed.
- Repository migrations do not insert `product_catalogue`, `plan_versions`, `commercial_agreement_versions`, or `commercial_subscriptions`. A later onboarding command can insert a `DRAFT` product row for its own request. This phase does not run that command against DEV.
- The test-call migration `20261106120000_admin_commercial_verify_agent_test_call_v1.sql` is applied on DEV and must not be replayed. It is not part of this catalogue proposal. Do not apply it to Production.

The existing commercial command, offer acceptance, and checkout preparation stay the billing path. This proposal does not add a second catalogue or a second payment command.

## 1. Catalogue values

| Item | Value | Minor units |
| --- | --- | ---: |
| Basic, monthly | £49, 120 minutes | 4900 |
| Growth, monthly | £79, 300 minutes | 7900 |
| Pro, monthly | £120, 500 minutes | 12000 |
| Custom | Quotation. No price and no minutes are approved. | none |
| Relaunch Guard | £9.99 per confirmed paid Guard location per month | 999 |
| Additional minutes | £0.25 per minute, only after explicit acceptance and a spending cap | 25 |
| Currency | GBP | |
| Cadence | Monthly | |
| Standard setup | Included in the monthly price | |
| Complex setup | Quoted separately. No catalogue row. | |
| Unused minutes | The draft agreement proposes expiry at period end. That treatment is open. | |

Guard interest on an enquiry is not a charge. The accepted monthly total is the tier amount plus 999 times the number of Guard locations an administrator confirmed on that offer. Overage is not added to that total. The spending cap is a ceiling on later usage, not a line on the first invoice.

Local draft identifiers, if an isolated database copies this proposal, are version numbers 9301–9304 and agreement ref `TELLOYA-DRAFT-2026-11-1`. Those rows stay `DRAFT`. The older `TELLOYA-TEST-` fixture remains a rehearsal marker and is not this proposal.

## 2. Approved location and number policy

Approved on 6 November 2026.

1. Basic, Growth and Pro each include exactly one Telloya operating location.
2. Each standard subscription is entitled to exactly one receptionist telephone number.
3. Multiple Telloya locations and numbers require a separately approved Custom quotation. The quotation names the location quantity, the receptionist-number quantity, and the price. No Custom price is approved.
4. Optional Relaunch Guard costs £9.99 per confirmed paid Guard location per month.
5. A Guard-only location does not receive a receptionist entitlement, a telephone number, or voice routing.
6. One business cannot bypass these limits by purchasing a second occupying Telloya subscription.

The current commands give one receptionist number to each entitled operating location. A Custom quotation's number quantity is its location quantity. A quotation that asks for more numbers than locations has no representation in the current commands, and that shape is not part of this approval.

| Option | What it means | Status |
| --- | --- | --- |
| One location and one number on Basic, Growth and Pro | More locations and numbers are a Custom quotation. | **Approved.** |
| Several caps at the same price | Growth for one location and Growth for two locations can both be approved at £79. | Not selected. |
| Price per location | £49, £79, or £120 times the location count. | Not selected. The plan stores one monthly amount. Only Guard is multiplied. |
| Unlimited locations | Every location the business adds is covered. | Not selected. An approved Telloya plan must have one Telloya location component. |

The local draft rows store cap 1 on Basic, Growth and Pro. The unpriced Custom template also has a component of 1 so the row has a valid shape. That template cap is not a quotation. A real multi-location quotation is a separate plan version whose cap equals the quoted locations. £250 is a local rehearsal of a Custom quotation for two operating locations and two receptionist numbers. It is not a customer price. Do not insert the `TELLOYA-TEST-` fixture as this catalogue.

## 3. What the current commands already enforce

Reviewed against `prepare_offer` in `20261105190000_telloya_guard_addon_v1.sql`, begin setup in `20261105130000_admin_commercial_begin_setup_v1.sql`, and number allocation in `20261105200000_admin_commercial_record_number_allocation_v1.sql`.

- An offer is refused when the onboarding location count differs from the plan's `quantity_limit` (`locations`).
- Begin setup creates one `PENDING` `TELLOYA` entitlement and one `PROFILE_REQUIRED` provision per onboarding location. The count must equal the purchased quantity (`quantities`). It does not create a `GUARD` entitlement.
- A receptionist number requires a `TELLOYA` entitlement and a location on that onboarding request. A location outside the request is refused (`location`). A location without that entitlement is refused (`setup`).
- Guard locations must belong to the business. They do not have to be onboarding locations, and they do not receive a receptionist entitlement.
- One E.164 has one owner. A number already owned by another business, or bound to another business in `telloya_voice_number_bindings`, is refused (`number`).
- One occupying subscription per business (`ACTIVE`, `PAUSED`, `PAST_DUE`, `CANCEL_AT_PERIOD_END`) and one incoming subscription (`OFFERED`, `ACCEPTED`, `PAYMENT_PENDING`). A second open voice onboarding request cannot attach to the same business (`business`).
- An approved plan's components cannot be changed. A subscription item quantity cannot rise above the snapshotted plan limit.
- Recording a number does not enable forwarding, does not turn routing on, and does not make the service live. Begin setup before settlement is refused (`payment`).

With the approved cap of 1 stored on the standard plans, one paid standard subscription cannot gain a second active receptionist location through these commands.

## 4. Location cap and number lifecycle

The one-location check is `supabase/migrations/20261106140000_telloya_standard_location_cap_v1.sql`. It replaces `admin_private.prevent_plan_overlap_v1` in full and adds one check: an approved `BASIC`, `GROWTH`, or `PRO` plan, including a Complete bundle on those tiers, must have `TELLOYA` `quantity_limit` 1. Missing, zero, two, and any other quantity are rejected. `CUSTOM` is not limited to one location. The quotation's quantity is the approved cap, and the offer command still requires the onboarding locations to match it. The financial immutability check, the component counts, the terms check, the overlap lock, and the overlap rejection stay. The file does not delete a number-owner row and does not call a provider.

The file is applied on DEV. `appliedToDev` is true. `containsDataChange` is false. `safeToReplay` is false. Do not replay `20261106140000`. Do not apply it to Production. Hosted DEV rejects a standard plan whose Telloya quantity is not 1. The local rehearsal applies the same file. `TELLOYA-TEST-GROWTH-CAP-2` stays `DRAFT` there, and approving it raises `standard Telloya plan includes exactly one location`. There is no exemption for a test plan name.

`docs/telloya/phase-c/proposed-location-number-constraint.sql` is the earlier proposal. It is not a migration and must not be applied. It no longer recommends deleting `commercial_provider_number_owners` rows.

1. `standard-tier-cap-applied-on-dev`. The check is applied on DEV in `20261106140000`. Do not replay that file. Do not apply it to Production.
2. `number-correction-keeps-previous-reservation`. A correction moves `service_provisions.provider_binding_ref` to the new allocation and leaves the previous E.164 reserved. That reservation is deliberate. Another business cannot take the reserved number. Releasing it is a later process, described in `docs/telloya/phase-c/number-lifecycle.md`. This phase does not implement that process and does not release a number at the provider.

## 5. Draft agreement

The draft customer agreement is `docs/telloya/phase-c/draft-customer-agreement.md`. It stays a draft. This phase does not approve it and does not edit it into a customer contract. Legal review is still required for unused minutes, cancellation, refunds, liability, and privacy. Service credits and retention stay unresolved in the draft.

## 6. Tax and Stripe

The current offer command offers a plan only when `tax_behaviour` is `NOT_APPLICABLE`, the plan and its conditions and agreement are `APPROVED`, and the currency is GBP. That constraint is why the Phase C-01 rehearsal used `NOT_APPLICABLE`. It is not a tax decision.

Production tax remains **OWNER DECISION REQUIRED**. `productionTaxBehaviour` is null. Local draft priced rows use `EXCLUSIVE` as a placeholder. The current command will not offer those rows, even if they were approved by mistake, until a later explicit change selects a tax behaviour the command accepts. Choosing `NOT_APPLICABLE` for production is allowed only after an accountant says VAT does not apply. Inclusive VAT would keep the customer price at the advertised amount and record the VAT portion. Exclusive VAT would add VAT on top. International customers may fall into a different treatment. None of those is selected here.

Stripe, using the commands that already exist:

- The accepted subscription stores one GBP amount: tier plus confirmed Guard. That is the recurring amount a later Stripe price must charge.
- Checkout preparation copies that amount and leaves `stripe_product_id`, `stripe_price_id`, and `checkout_session_id` empty. `livemode` stays false. Preparation does not create a Stripe object.
- A second preparation for the same checkout selection returns the existing preparation. One checkout row is stored.
- One incoming subscription per business, and one occupying subscription per business, block a second live Telloya subscription.
- `stripe_subscription_id` is unique. A second Stripe subscription cannot be attached to two commercial subscriptions.
- Changing Guard quantity after acceptance is not implemented. It needs a new offer or a later amendment command. This proposal does not add one.
- Cancellation states exist (`CANCEL_AT_PERIOD_END`, `CANCELED`). No customer cancellation command is enabled here. The draft agreement proposes ending at the next period boundary, with no automatic refund of that month. That refund rule is open.
- Renewal would be a later Stripe subscription invoice. No renewal job is started by this proposal.
- A checkout page may later present another currency. The stored and billed amount stays GBP unless a separate foreign-exchange decision is approved. Local-currency display is not a second catalogue price.
- Idempotent payment preparation is the existing customer command receipt. This proposal does not add a new idempotency store.

No Stripe product, price, customer, or subscription is created.

## 7. Safe DEV seeding and approval plan

Do not seed hosted DEV from this approval. The location and number policy can be stored on the draft rows, and hosted seeding stays closed until the agreement text, the tax behaviour, and any Custom price are approved in writing.

1. Read the DEV ledger. Stop unless the head is `20261106140000` and the count is 114. Stop if Production is not still `20261014170000`.
2. Confirm there is still no approved Telloya plan, agreement, or commercial subscription.
3. Insert this proposal as `DRAFT` only, using `TELLOYA-DRAFT-2026-11-1` and versions 9301–9304. Do not insert the `TELLOYA-TEST-` fixture.
4. Stop. A different change, by a named reviewer, approves the agreement, the conditions, and the plans. Do not approve them in the insert.
5. Before approval, set the tax behaviour to the accountant’s decision and change the offer command if that decision is not `NOT_APPLICABLE`. The `EXCLUSIVE` placeholder must not be approved as the tax policy.
6. Leave enquiry, setup, forwarding, and Retell flags false. Do not create Stripe objects in the seeding change.
7. Do not replay `20261106120000_admin_commercial_verify_agent_test_call_v1.sql` or `20261106140000_telloya_standard_location_cap_v1.sql`, and do not apply `proposed-location-number-constraint.sql`, as part of seeding. Do not apply either migration to Production.

## 8. Open decisions

- Approve the legal agreement, including unused minutes, cancellation, refunds, liability, and privacy.
- Choose tax: inclusive VAT, exclusive VAT, or no VAT, including international customers.
- Decide whether any Custom quotation is offered, and at what price. This proposal has no Custom price.
- Decide whether a local-currency checkout display is required.
- Decide how a later Guard quantity change and cancellation are operated.
- Approve any hosted insert. Until then the rows stay in the repository as a proposal.
- `20261106140000` is already applied on DEV. Do not replay it. Do not apply it to Production. This change does not seed a hosted catalogue.
- Decide the provider evidence that can retire a reserved receptionist number. The states are in `docs/telloya/phase-c/number-lifecycle.md`. No provider release is implemented.

## 9. What the local tests check

`telloya-catalogue-proposal.test.ts` locks the prices, the approved location and number policy, the applied cap migration, the number-lifecycle note, the tax placeholder, and the draft agreement text.

`telloya-catalogue-proposal.database.test.ts` installs the proposal twice in PGlite and leaves the rows `DRAFT`. A later test in that file approves the standard plans only inside that database. It checks one Growth location and one authoritative receptionist number, refusal of a second location and of a second unversioned number, a Custom quotation for two locations and two numbers at the unapproved £250 rehearsal figure, a Guard-only location with no receptionist entitlement, refusal to reassign a reserved number, refusal of a second occupying subscription, and the existing payment and begin-setup safeguards. Approving a standard plan with cap 2 is rejected. A standard plan with no Telloya location component is rejected. A zero quantity cannot be stored.
