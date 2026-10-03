# UX-7 — Commercial and money

The case page `/cases/[id]/commercial` is where an operator reads one case from quote to acceptance, to the service order, and on to upfront payment or success-fee setup. UX-1 to UX-6 are complete. UX-7 is in progress. UX-8 is not started.

No migration. The page reads the case, one `loadCaseFlowFacts` call, and the existing catalogue, quote, order and money reads. It resolves the case once with `resolveCaseFlow`.

## What this workspace is for

An operator should not have to reconstruct the commercial position from the global quote table and the global money table. The case workspace states, in order:

1. whether a quote exists, and whether it is still a draft, offered, accepted or closed;
2. whether the customer has a usable acceptance action, or that action has expired or been revoked;
3. whether acceptance created an immutable service order;
4. whether Guided work still needs an upfront payment, or Managed work still needs later-charge consent and a reusable payment method;
5. the next action `resolveCaseFlow` already chose.

Raw identifiers sit behind Technical identifiers. Amounts use `formatGbp`. Times are the stored event times.

## Canonical sources

Quote relevance, draft readiness and acceptance-link expiry come from `summariseCommercial`. Upfront paid, failed, collecting and authentication, and the separate Managed consent and setup flags, come from `summarisePayment`. The next action is `flow.primaryAction`. The page does not keep a second ranking of quotes or a second definition of paid, ready or accepted.

Amounts, scope, public references and the command versions come from the existing quote, order and money reads, matched by the identifier the case projection already holds. If those records disagree with the projection, the page says commercial records disagree and withholds the commands that would assume a single happy path.

`commercial.complete === false` or `payment.complete === false` is an incomplete list, not proof that nothing exists.

## Guided and Managed

Guided payment follows the upfront obligation. Due, waiting on a customer link, collecting, bank authentication, failed, paid and void are different sentences. A completed checkout page is not shown as paid. Paid does not offer a collection control.

Managed setup is four rows: an accepted success-fee order, later-charge consent, a reusable payment method, and setup readiness. Consent without a saved method is not setup. The sentence about £0 collected now, with a payment method saved for an approved success fee, is used only when that is what the accepted success-fee order actually says. Setup does not mean the fee has been taken. Success-fee approval stays the existing command: immutable amount, accepted evidence, no card charge.

Relaunch Guard stays recurring. It is not described as a one-off case payment, and Guard billing exceptions stay on `/money`.

## Case workspace and the global pages

Case-specific commercial and money actions from the case flow now go to `/cases/[id]/commercial`. That path is built in the destination model from a checked case id. `/commercial` remains the catalogue and the quote and order queues. `/money` remains obligations, setup, success-fee approval, recovery and Guard billing. A row that belongs to a case links to that case's workspace. The queues do not repeat the whole journey.

## One-time customer links

A quote acceptance, payment, setup or recovery command may return a customer URL once. The form says it is a one-time link, that it has to be copied now, and that it cannot be shown again. The plaintext secret is not written to new storage. If it is lost, the existing revoke or reissue command is the way back.

## What UX-7 does not change

It does not add Mark paid, Force success, an arbitrary charge, or an amount override. It does not change immutable accepted amounts, fresh-auth, idempotency, optimistic versions, RLS or RPC security. It does not treat a saved payment method as permission to charge, a Stripe subscription as Guard entitlement, or included Guard as paid Guard. It does not enable live payment, live mail or Google submission. Provider gates stay as they are.

## Known limit

The quote and money lists the case page reads are the existing global reads. A capped list is shown as incomplete rather than as an empty case. Receipts still have no timestamp on `admin_payment_list_v1`, so a recorded receipt is described as recorded and is not given a fabricated time. TEST-MODE invoice fallback stays on `/money`. A Guard discount still has to be applied from the global quote form, where the qualification snapshot is recorded; the case form does not invent one.
