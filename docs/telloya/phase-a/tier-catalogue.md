# Telloya tier-aware commercial catalogue

Repository only. `20261105180000_telloya_tier_catalogue_v1.sql` is not applied to hosted DEV or Production. The verified DEV ledger still contains 105 entries and ends at `20261105120000`. Begin setup `20261105130000` and confirm preferences `20261105144256` stay pending and earlier in the chain. Do not apply `20261105180000` to DEV. Do not apply `20261105180000` to Production.

`plan_versions.tier_code` is nullable. Basic, Growth, Pro and Custom may be approved at the same time. A plan with no tier still follows the previous rule: one current approved plan for that product. An omitted plan selection uses that single unscoped plan. When any current approved plan has a tier, or more than one plan is current, preparation returns `tier_required` and does not choose the first row.

The published schedule used by the Admin review is Basic £49 / 120 minutes, Growth £79 / 300 minutes, Pro £120 / 500 minutes, and Custom as a quotation. Optional Relaunch Guard is £9.99 per location per month. Overage is £0.25 per minute. Those figures are a match signal on the review. They are not a database constraint, because earlier approved fixtures use other amounts. No approved plan, agreement, Stripe price, or subscription is inserted by this migration.

An enquiry `planTier` stays customer interest. Preparing an offer does not charge the customer and does not confirm a subscription. Optional Guard on Telloya is shown as locations times the recorded unit and is not added to the Telloya subscription amount or stored as a Guard subscription item. A Complete Guard quantity remains the Guard component limit.

## Owner decisions still open

- Approving the Basic, Growth, Pro and Custom plan versions, and the agreement text those versions point at.
- Tax treatment. This change does not choose one.
- Whether a quoted Custom amount should be offered, and at what price.
- The customer's overage spending cap, which is still chosen at acceptance.
- Applying this migration to hosted DEV. That is a separate approval. Do not apply it to Production.
