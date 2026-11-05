# Telloya tier-aware commercial catalogue

Repository only. `20261105180000_telloya_tier_catalogue_v1.sql` and `20261105190000_telloya_guard_addon_v1.sql` are not applied to hosted DEV or Production. The verified DEV ledger still contains 105 entries and ends at `20261105120000`. Begin setup `20261105130000` and confirm preferences `20261105144256` stay pending and earlier in the chain. Do not apply `20261105180000` or `20261105190000` to DEV. Do not apply either file to Production.

`plan_versions.tier_code` is nullable. Basic, Growth, Pro and Custom may be approved at the same time. A plan with no tier still follows the previous rule: one current approved plan for that product. An omitted plan selection uses that single unscoped plan. When any current approved plan has a tier, or more than one plan is current, preparation returns `tier_required` and does not choose the first row.

The published schedule used by the Admin review is Basic £49 / 120 minutes, Growth £79 / 300 minutes, Pro £120 / 500 minutes, and Custom as a quotation. Optional Relaunch Guard is £9.99 per location per month. Overage is £0.25 per minute. Those figures are a match signal on the review. They are not a database constraint, because earlier approved fixtures use other amounts. No approved plan, agreement, Stripe price, or subscription is inserted by this migration.

An enquiry `planTier`, `guardInterested` and `guardLocationCount` stay customer interest. They do not authorise a charge and they do not choose the Guard quantity.

Telloya alone is charged at the approved plan amount. Telloya plus Guard is that amount plus £9.99 for each Guard location an administrator confirms. The confirmed set is stored on `admin_private.commercial_offer_guard_locations` and frozen in the acceptance snapshot. It is not assumed to equal the Telloya location count. Complete keeps the Guard quantity on its plan component and does not add another £9.99. The customer offer lists every Telloya location and, separately, each paid Guard location, with the combined monthly amount before acceptance. After acceptance those Guard locations are read from the acceptance snapshot. A Telloya offer whose named Guard locations do not match the paid quantity is not shown. Complete may leave Guard locations unnamed, and a partial list is rejected. The customer accepts the exact combined total before the existing checkout preparation copies that total. No Stripe object is created by preparation. Purchase does not create a Guard subscription, a bundle allocation, an entitlement, or a live service, and it does not start monitoring.

A named tier can have one current approved version for each Telloya location cap. Growth for one location and Growth for two locations can both be approved at the same flat monthly price. Two versions with the same tier and the same cap still conflict. A null tier still allows only one current approved plan for the product. A customer whose selected locations match no approved cap is not moved to another tier. Custom is offerable only when an approved quotation matches that cap. Otherwise the Admin screen says quotation required. No extra per-location Telloya charge is added.

## Owner decisions still open

- Approving the Basic, Growth, Pro and Custom plan versions, and the agreement text those versions point at.
- Tax treatment. This change does not choose one.
- Whether a quoted Custom amount should be offered, and at what price.
- The customer's overage spending cap, which is still chosen at acceptance.
- Applying `20261105180000` and `20261105190000` to hosted DEV. That is a separate approval. Do not apply either file to Production.
- The legal agreement text each approved version points at, and the live Stripe price for a combined total. Checkout still reserves a local preparation only.
