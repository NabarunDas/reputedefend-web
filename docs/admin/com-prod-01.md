# COM-PROD-01 — Purchasing establishment at quote stage

The same purchaser form is available on guided Step 6, on `/cases/<id>/commercial`, and on `/records/business/<id>`. It posts to the existing `admin_record_business_establishment_v1` command. No new purchaser table, column, or migration is added.

The eleven-step guided route stays a develop preview. Opening every later step in Production was not part of this change. Production staff record the purchaser on the case commercial page and on the business record. Those pages use the same form and the same command as Step 6.

## What staff are asked

The form reuses the business name as the legal name and shows the customer name when the case has one. It does not copy the Google listing country into the purchasing country. Staff choose United Kingdom, or another two-letter country for review.

Purchaser types are a limited company, a sole trader, an individual, or another permitted customer. The limited-company choice is not restricted to the United Kingdom. Companies House is optional evidence for a limited company. It is not offered for a sole trader or an individual. Registration number and tax identifier stay blank unless staff already hold them.

A saved note is `PENDING`. `VERIFIED` requires the checkbox that the staff member checked the genuine purchasing establishment, and an Admin session from the last 30 minutes. `REJECTED` records that the evidence is not sufficient. A self-declared note is not promoted to verified. Synthetic text, including `DEV SYNTHETIC / NOT REAL`, is refused before the database command is called.

The purchaser type is stored as the opening sentence of the existing evidence reference. The command does not send a new field and does not supersede an existing verified row.

When the business, country and subdivision already have a current verified establishment, the existing command returns that record and does not insert the submission. Admin is told the verified record is already current. A pending or rejected submission in that situation is not described as saved, and a changed name or evidence is not described as stored. A different country remains a conflict for review. Repeating the same request says it was already recorded. A pending or rejected note is described as new only when the command returns that same status. Existing verified evidence is left unchanged.

## Tax and price

A verified United Kingdom record tells staff to set the internal tax record to Not applicable while ProfileRelaunch is not VAT-registered. The customer price stays the advertised total. The existing eligibility function still decides `UK_DOMESTIC_NOT_VAT_REGISTERED` when the verified country is GB, the quote tax is Not applicable, and the seller position is not VAT-registered. This change does not call the tax command and does not change the seller position.

A verified record for another country is stored for review. It does not by itself clear a binding quote. The offer button stays available because this page cannot read establishment rows. The quote command still denies an offer that is not eligible, with the existing next-step message.

Advertised prices stay £99, £299, £59, £149 and £9.99. Customer sentences stay “Total price, inclusive of any applicable taxes.” and “No additional taxes or mandatory fees charged by ProfileRelaunch.” Quote QT-26-H6JSMB is not rewritten.

## Environments

DEV and Production Admin run the same form and command. Each deployment’s session, origin allowlist, database, storage, email and Stripe settings stay separate. A Production deployment pointed at the DEV database is refused. A DEV deployment pointed at the Production database is refused. The former `DEV_BUSINESS_ESTABLISHMENT_EDITOR_ENABLED` switch no longer hides the form.

The synthetic continuation in `docs/admin/admin-quote-ux-258-synthetic-dev.md` is still a proposal. It is not executed here, and the genuine form rejects its synthetic label.

## Migration requirements

This change does not apply SQL, query a live database, offer a quote, send email, or take a payment.

| Statement | DEV | Production | This change |
| --- | --- | --- | --- |
| `20261015140000_commercial_eligibility_gate_v1.sql` | Already applied | Not applied | Not applied and not replayed. Production recording needs this statement through a later approved release. Until then the command fails closed. |
| `20261021214813_gross_customer_price_v1.sql` | Already applied as ledger version `20261021214813` | Not applied | Filename aligned to that ledger version. SQL bytes unchanged. Not replayed. Not applied to Production. The file header still says source-only because an applied file is not edited. |

`pendingMigrations()` is empty. Production and AWS ApprovedMigrationHead stay `20261014170000`. Do not replay either statement. Applying either statement to Production needs separate owner approval.
