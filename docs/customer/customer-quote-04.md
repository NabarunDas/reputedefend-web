# CUSTOMER-QUOTE-04 — Source activation for the five service agreements

This change adds `supabase/migrations/20261022124813_service_specific_agreements_v1.sql`. The file is in source only. It is not applied to the DEV project or to Production. It does not cancel quote `QT-26-H6JSMB`, send email, create a customer acceptance link, or take a payment. Production and AWS ApprovedMigrationHead stay at `20261014170000`. The DEV ledger head recorded in this repository stays `20261021214813`.

The business owner approved the five exact bodies on 22 October 2026. That is owner approval of wording. It is not external solicitor sign-off, and this change does not invent a solicitor, a certificate, or a legal opinion. Decision D14 in `docs/customer/customer-quote-02.md` stays open.

## What the file inserts

The file inserts one catalogue row for each approved body. Each new row is `SOLICITOR_REVIEW` and not operative. Solicitor fields and owner fields are empty. The file does not call an approval function.

| Service | Version | SHA-256 of the source body |
| --- | --- | --- |
| Guided Relaunch | PS-2026-10-22.GR | `705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3` |
| Guided Review | PS-2026-10-22.GV | `56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9` |
| Managed Profile Recovery | PS-2026-10-22.MR | `725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269` |
| Managed Review Protection | PS-2026-10-22.MV | `62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784` |
| Relaunch Guard | PS-2026-10-22.GD | `51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23` |

`PS-2026-10-14.2` and hash `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4` are not updated. Quotations already stored are not updated.

## Owner approval is a separate call

`public.admin_record_owner_paid_service_agreement_approval_v1` is granted to `service_role` only. A later authenticated admin call can approve one of the five pinned version, hash, and service triples. It sets `approval_basis` to `BUSINESS_OWNER` and stores this sentence:

`Business owner approved the wording of paid-service agreement VERSION with SHA-256 HASH on 22 October 2026. This is not external solicitor confirmation.`

`solicitor_confirmed_at` and `solicitor_statement` stay empty. The event is `OWNER_APPROVED`, with `solicitorConfirmation` false. Evidence that is only the version, the hash, that sentence, the solicitor sentence, or text containing "solicitor reviewed" is rejected. The omnibus version is rejected by this function.

`admin_confirm_paid_service_agreement_v1` remains the only path that writes solicitor confirmation, and it still selects only `PS-2026-10-14.2`.

## How a new offer chooses an agreement

Until the owner function has made that service operative, a new offer of any of the five services still stores `PS-2026-10-14.2` and its hash. That is the agreement issued quotations already use. It is not a fallback away from an approved service row, because no operative service row exists yet.

After that call, a new offer of that service stores only the pinned version and hash. If the operative row does not match the pin, the offer fails with `offered_quote:agreement_not_approved` and does not store another service's agreement or the omnibus. An offer that was already stored is not rewritten when approval happens.

Once that service agreement is operative, offering another quote for the same case while a different quote is still `OFFERED` fails with `offered_quote:case_already_offered`. Cancel the existing offer first. A quote with no case, such as Relaunch Guard, is not matched by that case check. Before the service agreement is operative, a second offer for the same case still binds the omnibus, which is the behaviour existing quotations and tests rely on.

Acceptance loads the agreement stored on the quote. A historical omnibus quote can still be accepted after the omnibus itself is operative. A Guided quote cannot be accepted against a Managed hash.

## Local £99 workflow

The database test builds a disposable case. It offers Guided Relaunch at 9900 bound to the omnibus, records owner approval of `PS-2026-10-22.GR`, checks that the first quote is unchanged, then refuses a second offer while the first is still offered. It cancels the first quote with the existing `cancel` command, then uses `create_draft`, `set_draft_tax` with `NOT_APPLICABLE`, and `offer`. The new quote stores `PS-2026-10-22.GR` and hash `705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3`, with a total of 9900, currency GBP, and tax not applicable. The cancelled quote still stores the omnibus hash and 9900. The test does not create an acceptance link, send mail, or start a payment.

That test does not read or change DEV quote `QT-26-H6JSMB` on case `PR-26-RZYCE4`. Applying this file to DEV, cancelling that quote, and creating a replacement wait for independent review. They are not done here.
