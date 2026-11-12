# ADMIN-TY preview handover

**Status:** preview corrections on `cursor/telloya-admin-e2e-preview-20261112`. This is not authorisation to launch, collect payment, send email, place a call, or apply a hosted migration.
**Baseline:** `origin/develop` `c3ba97a19492eb2b7ae27ec906f77e740ef12cae`. Plan branch `plans/telloya-admin-e2e-preview-20261112` at `a9d925204e39a9e590e5fe964a0314f0679f83cf`.

## What is implemented

These functions write or read the shared ProfileRelaunch records. They stay closed unless `TELLOYA_ADMIN_JOURNEY_ENABLED` is exactly `true` and `20261112120000` has been applied. Neither is true on Preview.

- Offline demonstration booking and completion. The actor is the verified staff session. The command rejects a ProfileRelaunch enquiry, a stale version, a bad time zone, and a missing session. Demonstration rows cascade when an eligible Telloya enquiry is deleted. Destructive deletion stays off in the migration.
- Customer amendment requests stored against `public.commercial_subscriptions`. The Customer Portal proxy classifies `POST /api/portal/onboarding/offer/amendment` as a portal-session mutation. A pending request blocks acceptance of that offer. Approval cancels the open commercial offer and inserts another version with the same plan and amount. Decline leaves the offer unchanged.
- Offer email through `public.communications` and the existing `SEND_EMAIL` outbox. The queue row stays `delivery_status = NONE` with a `QUEUED` delivery event. Queued is not provider-accepted and not delivered. A second send returns the same row. The database mail control is empty, so the function queues nothing until that row is explicitly enabled.
- Recurring-invoice classification after a provider verifier accepts the payload. The amount, currency and Stripe subscription id are compared with the stored commercial subscription. This does not create a Checkout session and does not mark the payment ledger paid. Applying a matched invoice remains the existing commercial settlement path.

## What is mocked or display-only

- The enquiry progress panel and the catalogue illustration, including the £98.98 Growth plus two Guard locations figure. That figure is not written to a subscription.
- The in-memory offer, amendment and checkout helpers under `apps/admin/lib/commercial/telloya-offer.ts`, `telloya-offer-delivery.ts` and `telloya-checkout.ts`. They cover rules in unit tests. They are not the operating ledger.
- `startTelloyaCheckout` returns `not_created`. A return from a payment page stays “Payment being verified”.
- The setup checklist and the operations view. They describe the existing step names and do not place a call, buy a number, or show usage.

## What is blocked

- Applying `20261112120000` to DEV or Production.
- Sending email. The journey flag is off and the mail control row is not inserted.
- Stripe products, prices, customers, Checkout sessions, and live mode.
- Retell, number purchase, forwarding, and a real test call.
- Going live. Voice stays off after any payment classification.
- Owner and legal approval of the paid Telloya Service Agreement.
- Tax treatment for a recurring GBP subscription. International tax is unsupported.
- Hosted Telloya plan versions and commercial agreement versions. A real `prepare_offer` stays `terms_unconfigured` until those exist. This branch does not seed them.
- Production, Vercel environment variables, and PR #457 / `20261107130000`.

## Phase record

| Phase | Result after R1 | Commit | What it means now |
| --- | --- | --- | --- |
| ADMIN-TY-00 | DONE | `c79d1a33` | Reuse matrix. No behaviour change. |
| ADMIN-TY-01 | DONE | `60ea404f` | Read-only progress on the enquiry page. |
| ADMIN-TY-02 | IMPLEMENTED, gated | `ef46f7cf`, R1b `6972df15` | Staff demonstration command. Unapplied migration. Flag off. |
| ADMIN-TY-03 | PARTIAL | `717da3fd` | Catalogue illustration only. The operating offer is the commercial subscription. |
| ADMIN-TY-04 | IMPLEMENTED, gated | `ffd2d1ef`, R1c `03d67f0b` | Persistent amendments, revisions and durable queue. Mail control off. Flag off. |
| ADMIN-TY-05 | PARTIAL | `ead1c8c8`, R1d `09a757bd` | Verified-invoice classifier. No Checkout object and no ledger write. |
| ADMIN-TY-06 | BLOCKED | `912c4856` | Setup checklist. Going live stays blocked. |
| ADMIN-TY-07 | BLOCKED | `7bcd1a04` | Usage and voice stay unavailable. |
| ADMIN-TY-08 | DONE as documentation | `cf9880a2` | This handover. It is not an end-to-end launch test. |
| R1a | DONE | `4765097d` | Manifest records 119 applied DEV migrations, head `20261111130000`. |

## Test matrix

| Behaviour | Where it is tested |
| --- | --- |
| Applied head is `20261111130000`, and only `20261112120000` is pending | `apps/admin/lib/recovery/manifest.test.ts`, `history.test.ts`, `readiness.test.ts` |
| Staff session, non-Telloya rejection, spoofed session, stale version, time zone, retention cascade | `supabase/tests/database/telloya-admin-journey.database.test.ts` |
| Flag-off demonstration command does not call the database | `apps/admin/lib/commercial/telloya-demo-command.test.ts` |
| Amendment blocks acceptance, stale revision, copied amount, mail disabled, stale mail, one queue row, invalid origin, invalid selector, HTML escape | `apps/admin/lib/commercial/telloya-commercial-readiness.database.test.ts` |
| Customer amendment route stays closed and rejects a non-offer selector | `apps/customer/lib/portal/onboarding/telloya-amendment-command.test.ts` |
| The amendment route is in the portal inventory and the proxy refuses an unclassified portal API | `apps/customer/lib/portal/route-inventory.test.ts` |
| Spoofed provider signature and stored-amount mismatch | `apps/admin/lib/commercial/telloya-checkout.test.ts` |

Disposable database tests use PGlite. The commercial settlement concurrency check uses a disposable local PostgreSQL cluster. Neither connects to hosted DEV or Production.

## Source-only migration

`supabase/migrations/20261112120000_telloya_admin_journey_v1.sql`

`appliedToDev` is false. `containsDataChange` is false. `safeToReplay` is false. Public functions are executable by `service_role` only. Private tables have row level security and no policies. Do not apply `20261112120000` to DEV or Production.

`20261111130000_telloya_marketing_enquiry_retention_v1.sql` is recorded as applied once to DEV. The verified DEV ledger contains 119 entries and ends at `20261111130000`. The hosted `schema_migrations` statement is 10,710 characters and the repository file is 10,712 characters. The two-byte difference is the dollar sign and closing quote at the end of the reason check, around character 1075. The installed `telloya_marketing_enquiry_holds_reason_check` is correct. Do not edit or replay the applied SQL. Do not apply `20261111130000` to Production.

## Flags

`TELLOYA_ADMIN_JOURNEY_ENABLED` is absent. Exactly `true` opens the demonstration, amendment, revision and mail commands. It does not approve a service agreement, a tax treatment, a payment, or live answering. Mail still requires the empty `telloya_offer_mail_control` row to be enabled, and the migration still has to be applied.

`TELLOYA_ENQUIRY_ENABLED`, `TELLOYA_USAGE_EVENTS_ENABLED`, and `TELLOYA_INBOUND_ADMISSION_ENABLED` were not enabled.

## Remaining approval

- Owner and legal approval of the paid Telloya Service Agreement.
- Tax treatment for a recurring GBP subscription. International tax stays unsupported.
- Explicit approval before applying `20261112120000`.
- Approved hosted Telloya plan versions and agreement versions before a customer can be offered a real subscription.
- Stripe test-mode configuration before any Checkout session. This branch did not create a Stripe product, price, customer, or session.
- Retell, number purchase, forwarding, and a real test call remain outside this work.
- Production was not changed.

PR #457 and `20261107130000` were not edited.
