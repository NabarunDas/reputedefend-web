# ADMIN-QUOTE-UX — Synthetic DEV continuation for PR-26-RZYCE4

Status: **proposal only**. Not approved. Not executed. This pull request does not insert rows, does not call a quote command, and does not offer QT-26-H6JSMB.

Case `PR-26-RZYCE4` and draft quote `QT-26-H6JSMB` are a fictional DEV exercise. The business on that case is not a real purchasing establishment. Staff must not tick “I verified the genuine purchasing establishment and have supporting evidence.” on the develop establishment form, and must not tick “I checked the client and business and have evidence for this status.” in order to mark the relationship “Authority verified”, for this fictional business. Those checkboxes stay exactly as they are. Production verification, tax, authority and quote gates stay unchanged.

## Why the existing forms cannot finish this test

The develop preview establishment editor is genuine-evidence only. It requires a fresh admin session, `verificationStatus` `VERIFIED`, evidence of 20 to 500 characters, and `confirmed: true`. That confirmation means the operator checked a real payer. It is the wrong control for a fictional business.

The relationship form can set a membership to `verified`, but only with the same kind of attestation: the operator checked the client and the business and has evidence for that status. A submitted enquiry is already not proof of authority. A fictional relationship is not that proof either.

Email control stays the existing contact check. If a real synthetic inbox can receive the existing one-time code, that remains the honest way to verify the address. Do not mark a fictional address verified as if a real confirmation happened.

## What a later approved run may do

Only after a named operator has separate written approval, and only against DEV project `rmzozuiamjcclvtgutgd`. Refuse every other host, including Production `cxwwekdzkkjjbiyofrov`.

The run is one idempotent data change for this case only. It is not a migration, not a new staff button, and not a change to `evaluate_commercial_eligibility_v1` or `admin_quote_command_v1`.

1. Resolve the case by public reference `PR-26-RZYCE4` and the quote by public reference `QT-26-H6JSMB`. Stop unless that quote is `DRAFT`, `GUIDED_RELAUNCH`, `total_amount_minor` 9900 and `tax_amount_minor` 0. Do not update the quote, its scope, its exclusions, or its total.
2. If that business already has one current `VERIFIED` establishment, stop and inspect it. Do not insert a second current establishment.
3. Otherwise insert one `business_establishments` row for that business only. `country_code` is `GB` because this test’s simulated payer is in the UK, not because a Google listing says so. `evidence_type` is `OTHER`. `evidence_reference` starts with `DEV SYNTHETIC / NOT REAL` and states that the payer evidence is simulated for this end-to-end test. `verification_status` is `VERIFIED` so the existing eligibility function can see one current establishment. `payload_fingerprint` is `dev-synthetic-not-real`. `verified_by` and `recorded_by` are the approving operator. Do not call `admin_record_business_establishment_v1`. That command requires the genuine-confirmation flag.
4. If the customer–business membership for that pair is missing, stop. If it is already `verified` with evidence that does not start with `DEV SYNTHETIC / NOT REAL`, stop and inspect it. If it is pending, set that one membership to `verified` with evidence that starts with `DEV SYNTHETIC / NOT REAL` and states that the authority is simulated for this test. Leave every other membership unchanged. Do not call `admin_membership_save_v1` with the genuine-attestation checkbox.
5. Do not offer the quote, issue an acceptance link, take a payment, send mail, or call Stripe. After the labelled rows exist, the existing Offer quote command remains the only binding check. Another denial, including tax or turnover, stays a denial.
6. A second run finds the labelled establishment and the labelled membership and inserts nothing new.

The labelled rows are simulated records for this DEV case. They are not a claim that a real business was verified. Production never receives them, and the Production forms keep the genuine-evidence requirement.
