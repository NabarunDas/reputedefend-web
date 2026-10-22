-- CUSTOMER-QUOTE-04 service-specific agreement activation.
-- Additive and source-only. Do not apply this file to DEV or Production
-- from the change that adds it. It does not move AWS ApprovedMigrationHead.
-- It does not cancel a quotation, send email, create an acceptance link,
-- or take a payment. It does not call an approval function.
-- PS-2026-10-14.2 and every quotation already stored stay untouched.
-- Each new body is inserted unapproved. Owner approval is a later call.
-- That call records business-owner wording approval. It does not record
-- external solicitor confirmation, and it does not invent a solicitor.

BEGIN;

ALTER TABLE public.paid_service_agreement_catalogue
  ADD COLUMN service_code text,
  ADD COLUMN approval_basis text,
  ADD COLUMN owner_approved_at timestamptz,
  ADD COLUMN owner_approval_statement text;

ALTER TABLE public.paid_service_agreement_approvals
  ADD COLUMN approval_basis text;

ALTER TABLE public.paid_service_agreement_approvals
  ADD CONSTRAINT paid_service_agreement_approvals_basis_v1 CHECK (
    approval_basis IS NULL OR approval_basis = 'BUSINESS_OWNER'
  );

DO $dropcat$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.paid_service_agreement_catalogue'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%PS-2026-10-14.2%'
        OR pg_get_constraintdef(oid) LIKE '%0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4%'
        OR pg_get_constraintdef(oid) LIKE '%solicitor_statement%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.paid_service_agreement_catalogue DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $dropcat$;

ALTER TABLE public.paid_service_agreement_catalogue
  ADD CONSTRAINT paid_service_agreement_catalogue_identity_v1 CHECK (
    (version_id = 'PS-2026-10-14.2' AND content_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4' AND service_code IS NULL)
    OR (version_id = 'PS-2026-10-22.GR' AND content_hash = '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3' AND service_code = 'GUIDED_RELAUNCH')
    OR (version_id = 'PS-2026-10-22.GV' AND content_hash = '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9' AND service_code = 'GUIDED_REVIEW')
    OR (version_id = 'PS-2026-10-22.MR' AND content_hash = '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269' AND service_code = 'MANAGED_RELAUNCH')
    OR (version_id = 'PS-2026-10-22.MV' AND content_hash = '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784' AND service_code = 'MANAGED_REVIEW')
    OR (version_id = 'PS-2026-10-22.GD' AND content_hash = '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23' AND service_code = 'RELAUNCH_GUARD')
  );

ALTER TABLE public.paid_service_agreement_catalogue
  ADD CONSTRAINT paid_service_agreement_catalogue_approval_v1 CHECK (
    (
      status = 'SOLICITOR_REVIEW'
      AND operative = false
      AND solicitor_confirmed_at IS NULL
      AND solicitor_statement IS NULL
      AND owner_approved_at IS NULL
      AND owner_approval_statement IS NULL
      AND approval_basis IS NULL
    )
    OR (
      status = 'APPROVED'
      AND operative = true
      AND approval_basis IS NULL
      AND owner_approved_at IS NULL
      AND owner_approval_statement IS NULL
      AND solicitor_confirmed_at IS NOT NULL
      AND version_id = 'PS-2026-10-14.2'
      AND solicitor_statement = 'Solicitor reviewed paid-service agreement ' || version_id || ' with SHA-256 ' || content_hash || '.'
    )
    OR (
      status = 'APPROVED'
      AND operative = true
      AND approval_basis = 'BUSINESS_OWNER'
      AND solicitor_confirmed_at IS NULL
      AND solicitor_statement IS NULL
      AND owner_approved_at IS NOT NULL
      AND version_id <> 'PS-2026-10-14.2'
      AND owner_approval_statement = 'Business owner approved the wording of paid-service agreement ' || version_id || ' with SHA-256 ' || content_hash || ' on 22 October 2026. This is not external solicitor confirmation.'
    )
  );

ALTER TABLE public.quote_versions DROP CONSTRAINT quote_versions_commercial_agreement_pair;
ALTER TABLE public.quote_versions
  ADD CONSTRAINT quote_versions_commercial_agreement_pair CHECK (
    (commercial_agreement_version IS NULL AND commercial_agreement_hash IS NULL)
    OR (commercial_agreement_version = 'PS-2026-10-14.2' AND commercial_agreement_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4')
    OR (commercial_agreement_version = 'PS-2026-10-22.GR' AND commercial_agreement_hash = '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3')
    OR (commercial_agreement_version = 'PS-2026-10-22.GV' AND commercial_agreement_hash = '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9')
    OR (commercial_agreement_version = 'PS-2026-10-22.MR' AND commercial_agreement_hash = '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269')
    OR (commercial_agreement_version = 'PS-2026-10-22.MV' AND commercial_agreement_hash = '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784')
    OR (commercial_agreement_version = 'PS-2026-10-22.GD' AND commercial_agreement_hash = '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23')
  );

DO $dropacc$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.paid_service_acceptances'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%PS-2026-10-14.2%'
        OR pg_get_constraintdef(oid) LIKE '%0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.paid_service_acceptances DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $dropacc$;

ALTER TABLE public.paid_service_acceptances
  ADD CONSTRAINT paid_service_acceptances_agreement_pair_v1 CHECK (
    (agreement_version = 'PS-2026-10-14.2' AND agreement_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4')
    OR (agreement_version = 'PS-2026-10-22.GR' AND agreement_hash = '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3')
    OR (agreement_version = 'PS-2026-10-22.GV' AND agreement_hash = '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9')
    OR (agreement_version = 'PS-2026-10-22.MR' AND agreement_hash = '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269')
    OR (agreement_version = 'PS-2026-10-22.MV' AND agreement_hash = '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784')
    OR (agreement_version = 'PS-2026-10-22.GD' AND agreement_hash = '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23')
  );

DO $events$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.paid_service_agreement_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%SOLICITOR_CONFIRMED%'
  LOOP
    EXECUTE format('ALTER TABLE public.paid_service_agreement_events DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $events$;

ALTER TABLE public.paid_service_agreement_events
  ADD CONSTRAINT paid_service_agreement_events_event_check
  CHECK (event IN ('SOLICITOR_CONFIRMED', 'TERMS_ACCEPTED', 'OWNER_APPROVED'));

CREATE UNIQUE INDEX paid_service_agreement_one_operative_service_v1
  ON public.paid_service_agreement_catalogue (service_code)
  WHERE operative AND service_code IS NOT NULL;

INSERT INTO public.paid_service_agreement_catalogue(
  version_id, content_hash, body_text, status, operative, service_code
) VALUES (
  'PS-2026-10-22.GR',
  '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3',
  $agree$ProfileRelaunch Ltd — Paid-service agreement for Guided Relaunch

22 October 2026

This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this agreement ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.

## 1. Formation

A contract for the service named in this agreement is formed only when we have given you a quotation that names that service, the Business Profile or review, and the price, and you have accepted that quotation and this agreement.

Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a contract. The website terms govern use of the website. They are not this agreement. For this service, this agreement and the accepted quotation prevail if they conflict with the website terms.

This agreement applies only to a quotation you accept with it. It does not change an agreement you have already accepted. We may withdraw a quotation that you have not yet accepted.

## 2. Authority

The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.

If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.

## 3. The service

The service under this agreement is Guided Relaunch. We provide only that service for the Business Profile or review named in the accepted quotation.

We prepare it. You submit it. We organise the evidence and prepare the profile relaunch work for the location named in the quotation. We do not submit that work for you.

We are independent of Google. We do not control Google's systems, decisions or timescales. Completing the agreed work is distinct from a decision by Google. Delivering the agreed work is not a promise that Google will reinstate a profile or remove a review.

## 4. Price and payment

The price is £99 unless the accepted quotation states a different price. It is due after you accept the quotation and before work begins.

Accepting the quotation does not take payment. Payment is a later step.

We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.

The price on the accepted quotation is the price for this order, including a discount we have already agreed in writing for this order. The price is in pounds sterling (GBP). That pound amount is our agreed fee. If you pay from an account in another currency, your bank or payment provider may convert it or charge its own fee. We do not set or guarantee that rate.

If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.

## 5. Cancellation and refunds

You may cancel before substantive case-specific work begins and receive a full refund of the fee you have paid.

After substantive case-specific work begins, we may retain only a fair portion of the fee attributable to work already performed. That portion must be evidenced. We will not deduct an amount we cannot evidence. We will refund the remainder.

Google's decision does not, by itself, prove the work was deficient. These terms do not exclude legal remedies for deficient work.

## 6. Your responsibilities

You will give us accurate information about the business, the profile and the reviews named in the quotation.

You submit the prepared work to Google yourself. This service does not require you to add us as a Manager. We do not ask for your Google password or access to your email account.

You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.

You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.

## 7. Our responsibilities

We will perform this service with reasonable care and skill and keep you informed of material progress.

We prepare the profile relaunch work. We do not submit it to Google for you.

We may use trained staff and contractors. We remain responsible to you for this service.

We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. If we stop before the work is complete, the cancellation and refund terms in this agreement apply to the fee.

## 8. Confidentiality and personal information

Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.

Our privacy notice explains how we handle personal information. The notice does not replace this clause.

## 9. Intellectual property

We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.

When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.

We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.

## 10. Liability

Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.

Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.

Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.

## 11. Complaints

Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.

## 12. Ending the service

You may end this service before substantive case-specific work begins. A fee already paid is then refunded in full under the cancellation and refund terms in this agreement.

Ending this service does not end a different service order.

Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.

Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.

## 13. Governing law

This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.

Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.

## 14. Other terms

We will change this agreement for an order you have already accepted only by agreeing a replacement of this agreement with you. A change of our published prices or website wording does not change an agreement you have already accepted.

If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.

This agreement and the accepted quotation are the whole agreement between us for the service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agree$,
  'SOLICITOR_REVIEW',
  false,
  'GUIDED_RELAUNCH'
);

INSERT INTO public.paid_service_agreement_catalogue(
  version_id, content_hash, body_text, status, operative, service_code
) VALUES (
  'PS-2026-10-22.GV',
  '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9',
  $agree$ProfileRelaunch Ltd — Paid-service agreement for Guided Review

22 October 2026

This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this agreement ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.

## 1. Formation

A contract for the service named in this agreement is formed only when we have given you a quotation that names that service, the Business Profile or review, and the price, and you have accepted that quotation and this agreement.

Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a contract. The website terms govern use of the website. They are not this agreement. For this service, this agreement and the accepted quotation prevail if they conflict with the website terms.

This agreement applies only to a quotation you accept with it. It does not change an agreement you have already accepted. We may withdraw a quotation that you have not yet accepted.

## 2. Authority

The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.

If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.

## 3. The service

The service under this agreement is Guided Review. We provide only that service for the Business Profile or review named in the accepted quotation.

We prepare it. You submit it. We organise the evidence and prepare the review work named in the quotation. We do not submit that work for you.

We are independent of Google. We do not control Google's systems, decisions or timescales. Completing the agreed work is distinct from a decision by Google. Delivering the agreed work is not a promise that Google will reinstate a profile or remove a review.

## 4. Price and payment

The price is £59 unless the accepted quotation states a different price. It is due after you accept the quotation and before work begins.

Accepting the quotation does not take payment. Payment is a later step.

We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.

The price on the accepted quotation is the price for this order, including a discount we have already agreed in writing for this order. The price is in pounds sterling (GBP). That pound amount is our agreed fee. If you pay from an account in another currency, your bank or payment provider may convert it or charge its own fee. We do not set or guarantee that rate.

If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.

## 5. Cancellation and refunds

You may cancel before substantive case-specific work begins and receive a full refund of the fee you have paid.

After substantive case-specific work begins, we may retain only a fair portion of the fee attributable to work already performed. That portion must be evidenced. We will not deduct an amount we cannot evidence. We will refund the remainder.

Google's decision does not, by itself, prove the work was deficient. These terms do not exclude legal remedies for deficient work.

## 6. Your responsibilities

You will give us accurate information about the business, the profile and the reviews named in the quotation.

You submit the prepared work to Google yourself. This service does not require you to add us as a Manager. We do not ask for your Google password or access to your email account.

You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.

You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.

## 7. Our responsibilities

We will perform this service with reasonable care and skill and keep you informed of material progress.

We prepare the review work. We do not submit it to Google for you.

We may use trained staff and contractors. We remain responsible to you for this service.

We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. If we stop before the work is complete, the cancellation and refund terms in this agreement apply to the fee.

## 8. Confidentiality and personal information

Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.

Our privacy notice explains how we handle personal information. The notice does not replace this clause.

## 9. Intellectual property

We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.

When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.

We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.

## 10. Liability

Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.

Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.

Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.

## 11. Complaints

Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.

## 12. Ending the service

You may end this service before substantive case-specific work begins. A fee already paid is then refunded in full under the cancellation and refund terms in this agreement.

Ending this service does not end a different service order.

Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.

Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.

## 13. Governing law

This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.

Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.

## 14. Other terms

We will change this agreement for an order you have already accepted only by agreeing a replacement of this agreement with you. A change of our published prices or website wording does not change an agreement you have already accepted.

If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.

This agreement and the accepted quotation are the whole agreement between us for the service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agree$,
  'SOLICITOR_REVIEW',
  false,
  'GUIDED_REVIEW'
);

INSERT INTO public.paid_service_agreement_catalogue(
  version_id, content_hash, body_text, status, operative, service_code
) VALUES (
  'PS-2026-10-22.MR',
  '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269',
  $agree$ProfileRelaunch Ltd — Paid-service agreement for Managed Profile Recovery

22 October 2026

This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this agreement ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.

## 1. Formation

A contract for the service named in this agreement is formed only when we have given you a quotation that names that service, the Business Profile or review, and the price, and you have accepted that quotation and this agreement.

Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a contract. The website terms govern use of the website. They are not this agreement. For this service, this agreement and the accepted quotation prevail if they conflict with the website terms.

This agreement applies only to a quotation you accept with it. It does not change an agreement you have already accepted. We may withdraw a quotation that you have not yet accepted.

## 2. Authority

The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.

If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.

## 3. The service

The service under this agreement is Managed Profile Recovery for the Business Profile and incident named in the accepted quotation. We provide only that service.

We carry out the authorised work. You are not left to assemble and submit it alone.

We are independent of Google. We do not control Google's systems, decisions or timescales. Completing the agreed work is distinct from a decision by Google. Delivering the agreed work is not a promise that Google will reinstate a profile, or that a restored profile will remain in that state.

## 4. Price and when the fee is earned

The price is a success fee of £299 unless the accepted quotation states a different price. The quotation identifies the exact Business Profile and the incident. We record the baseline restriction before relying on it for the fee.

The success fee is earned only when the original restriction is absent at an initial check and again at a second check at least 48 hours later, and the original restriction is not known to have returned between those checks.

An unrelated new issue after that verified outcome does not invalidate the completed service. We charge no success fee for an outcome known to be wholly unrelated to work you authorised.

The two checks are two recorded observations. We record the time of each check and what we observed. They are not uninterrupted surveillance. If an observation is missing, unknown or ambiguous, or the checks are less than 48 hours apart, the outcome stays pending. A pending outcome is not invoiced as success.

There is no second success-fee obligation for the same service order and the same verified outcome.

We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.

The price on the accepted quotation is the price for this order, including a discount we have already agreed in writing for this order. The price is in pounds sterling (GBP). That pound amount is our agreed fee. If you pay from an account in another currency, your bank or payment provider may convert it or charge its own fee. We do not set or guarantee that rate.

If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.

## 5. Invoice, dispute and payment

The success fee is invoiced only after the documented outcome in section 4. You will pay an undisputed invoice within 14 calendar days. There is no automatic card charge and no collection of that success fee in advance.

Accepting the quotation does not create an invoice and does not take payment.

You may dispute the claimed outcome in writing before the invoice falls due. Tell us what you dispute and why. Collection of a genuinely disputed amount pauses while we review that dispute against the recorded checks. Pausing collection is not an admission, and it does not remove a remedy for deficient work. We will tell you the result of the review. An amount that is not genuinely disputed remains payable. Either of us may still bring a claim.

## 6. Your responsibilities

You will give us accurate information about the business, the profile and the reviews named in the quotation, and the access this service needs.

Where this service needs access to a Business Profile, you add us as a Manager for this service only. You remain the owner. We do not change the profile unless you separately approve that change. We do not ask for your Google password or access to your email account.

You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.

You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.

## 7. Our responsibilities

We will perform this service with reasonable care and skill, keep you informed of material progress, and record the time of each check and what we observed.

We may use trained staff and contractors. We remain responsible to you for this service.

We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. The success fee is not payable for work stopped on that ground unless it had already been earned under section 4.

## 8. Confidentiality and personal information

Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.

Our privacy notice explains how we handle personal information. The notice does not replace this clause.

## 9. Intellectual property

We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.

When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.

We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.

## 10. Liability

Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.

Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.

Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.

## 11. Complaints

Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.

## 12. Ending the service

No success fee is payable for work that ends before the success fee is earned, unless it had already been earned under this agreement.

Ending this service does not end a different service order.

Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.

Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.

## 13. Governing law

This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.

Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.

## 14. Other terms

We will change this agreement for an order you have already accepted only by agreeing a replacement of this agreement with you. A change of our published prices or website wording does not change an agreement you have already accepted.

If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.

This agreement and the accepted quotation are the whole agreement between us for the service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agree$,
  'SOLICITOR_REVIEW',
  false,
  'MANAGED_RELAUNCH'
);

INSERT INTO public.paid_service_agreement_catalogue(
  version_id, content_hash, body_text, status, operative, service_code
) VALUES (
  'PS-2026-10-22.MV',
  '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784',
  $agree$ProfileRelaunch Ltd — Paid-service agreement for Managed Review Protection

22 October 2026

This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this agreement ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.

## 1. Formation

A contract for the service named in this agreement is formed only when we have given you a quotation that names that service, the Business Profile or review, and the price, and you have accepted that quotation and this agreement.

Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a contract. The website terms govern use of the website. They are not this agreement. For this service, this agreement and the accepted quotation prevail if they conflict with the website terms.

This agreement applies only to a quotation you accept with it. It does not change an agreement you have already accepted. We may withdraw a quotation that you have not yet accepted.

## 2. Authority

The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.

If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.

## 3. The service

The service under this agreement is Managed Review Protection for the original review named in the accepted quotation. We provide only that service.

The quotation identifies that review through the stable identifiers and baseline evidence then available. We carry out the authorised work. You are not left to assemble and submit it alone.

We are independent of Google. We do not control Google's systems, decisions or timescales. Reporting, hiding, a rating change, or an acknowledgement is not by itself removal of the specified review.

## 4. Price and when the fee is earned

The price is a success fee of £149 unless the accepted quotation states a different price.

The success fee is earned only when that specified review is absent at two checks at least 48 hours apart. Evidence that the same review returned during that period means that verification attempt has not succeeded.

A different new negative review is a separate incident and does not invalidate the outcome for the specified review.

We charge no success fee for a removal known to be wholly unrelated to the authorised work. We record the time of each check and what we observed. The two checks are not uninterrupted surveillance. A missing, unknown or ambiguous observation stays pending and is not invoiced as success.

There is no second success-fee obligation for the same service order and the same verified outcome.

We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.

The price on the accepted quotation is the price for this order, including a discount we have already agreed in writing for this order. The price is in pounds sterling (GBP). That pound amount is our agreed fee. If you pay from an account in another currency, your bank or payment provider may convert it or charge its own fee. We do not set or guarantee that rate.

If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.

## 5. Invoice, dispute and payment

The success fee is invoiced only after the documented outcome in section 4. You will pay an undisputed invoice within 14 calendar days. There is no automatic card charge and no collection of that success fee in advance.

Accepting the quotation does not create an invoice and does not take payment.

You may dispute the claimed outcome in writing before the invoice falls due. Tell us what you dispute and why. Collection of a genuinely disputed amount pauses while we review that dispute against the recorded checks. Pausing collection is not an admission, and it does not remove a remedy for deficient work. We will tell you the result of the review. An amount that is not genuinely disputed remains payable. Either of us may still bring a claim.

## 6. Your responsibilities

You will give us accurate information about the business, the profile and the reviews named in the quotation, and the access this service needs.

Where this service needs access to a Business Profile, you add us as a Manager for this service only. You remain the owner. We do not change the profile unless you separately approve that change. We do not ask for your Google password or access to your email account.

You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.

You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.

## 7. Our responsibilities

We will perform this service with reasonable care and skill, keep you informed of material progress, and record the time of each check and what we observed.

We may use trained staff and contractors. We remain responsible to you for this service.

We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. The success fee is not payable for work stopped on that ground unless it had already been earned under section 4.

## 8. Confidentiality and personal information

Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.

Our privacy notice explains how we handle personal information. The notice does not replace this clause.

## 9. Intellectual property

We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.

When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.

We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.

## 10. Liability

Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.

Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.

Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.

## 11. Complaints

Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.

## 12. Ending the service

No success fee is payable for work that ends before the success fee is earned, unless it had already been earned under this agreement.

Ending this service does not end a different service order.

Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.

Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.

## 13. Governing law

This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.

Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.

## 14. Other terms

We will change this agreement for an order you have already accepted only by agreeing a replacement of this agreement with you. A change of our published prices or website wording does not change an agreement you have already accepted.

If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.

This agreement and the accepted quotation are the whole agreement between us for the service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agree$,
  'SOLICITOR_REVIEW',
  false,
  'MANAGED_REVIEW'
);

INSERT INTO public.paid_service_agreement_catalogue(
  version_id, content_hash, body_text, status, operative, service_code
) VALUES (
  'PS-2026-10-22.GD',
  '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23',
  $agree$ProfileRelaunch Ltd — Paid-service agreement for Relaunch Guard

22 October 2026

This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this agreement ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.

## 1. Formation

A contract for the service named in this agreement is formed only when we have given you a quotation that names that service, the Business Profile or review, and the price, and you have accepted that quotation and this agreement.

Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a contract. The website terms govern use of the website. They are not this agreement. For this service, this agreement and the accepted quotation prevail if they conflict with the website terms.

This agreement applies only to a quotation you accept with it. It does not change an agreement you have already accepted. We may withdraw a quotation that you have not yet accepted.

## 2. Authority

The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.

If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.

## 3. The service

The service under this agreement is Relaunch Guard for each location named in the accepted quotation. We provide only that monitoring service.

Our team carries out the checks manually, twice each day, including weekends and bank holidays, using a Europe/London schedule, and we email you if a check needs your attention.

The checks are planned observations. They are not a promise of continuous monitoring, of a response within a stated number of minutes, or that a suspension or a review will be prevented.

If we cannot complete a scheduled check, we retry, record what happened, and tell you if it stays incomplete. If the access this service needs is lost, we ask you to restore it and we pause billing for the coverage we cannot provide. If no working way to alert you remains, we pause the service and the billing. A phone number you have given us may be used only to resolve a failed email. We check a replacement email address before we use it.

We are independent of Google. We do not control Google's systems, decisions or timescales.

## 4. Price and when monitoring starts

The price is £9.99 per month per location named in the accepted quotation, unless that quotation states a different price.

Monitoring for a location starts only after you have accepted this quotation for that location, we have confirmed the access we asked for, and we have completed the initial check. Sending a setup form does not start monitoring and does not take payment.

Accepting this quotation does not start monitoring and does not take payment.

We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.

The price on the accepted quotation is the price for this order, including a discount we have already agreed in writing for this order. The price is in pounds sterling (GBP). That pound amount is our agreed fee. If you pay from an account in another currency, your bank or payment provider may convert it or charge its own fee. We do not set or guarantee that rate.

If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.

## 5. Included period, cancellation and a later case

After a Managed Profile Recovery that has already met its own agreed outcome, you can choose 30 days of Relaunch Guard for the restored location at no extra charge. The 30 days start when monitoring is activated. We will remind you before the period ends. Continuing at the monthly price in this agreement is your choice. We will not automatically start charging you. The 20% reduction below does not apply during those 30 days.

Contact us to cancel. There is no cancellation fee. Normally, monitoring continues until the end of your paid month and does not renew. If you ask us to stop immediately, we return the unused portion of that month.

While you are paying the monthly price for a location, you receive 20% off the standard fee for an eligible new Managed Profile Recovery or Managed Review Protection case at that location. The issue must arise during that paid monitoring. A problem that already existed when monitoring started is excluded. The reduction does not apply during the included 30 days, to Guided support, to the monitoring fee, or to a custom or bulk quotation, and it cannot be combined with another offer. Once we agree a reduced fee for a case, cancelling monitoring does not remove that reduction. That later case is a separate quotation, and its fee still depends on the outcome agreed in that quotation.

We will not charge a higher monthly price unless we have given you at least 30 days' notice of that price and the date it would apply, and you have agreed to it. If you do not agree, monitoring ends before that date. We will not start the higher price automatically.

## 6. Your responsibilities

You will give us accurate information about the business, the profile and the reviews named in the quotation, and the access this service needs.

Where this service needs access to a Business Profile, you add us as a Manager for this service only. You remain the owner. We do not change the profile unless you separately approve that change. We do not ask for your Google password or access to your email account.

You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.

You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.

## 7. Our responsibilities

We will perform the checks described in this agreement with reasonable care and skill and email you if a check needs your attention.

We may use trained staff and contractors. We remain responsible to you for this service.

We may refuse or stop a check that we reasonably believe would be unlawful or would mislead Google or the public.

## 8. Confidentiality and personal information

Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.

Our privacy notice explains how we handle personal information. The notice does not replace this clause.

## 9. Intellectual property

We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.

When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.

We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.

## 10. Liability

Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.

Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.

Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.

## 11. Complaints

Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.

## 12. Ending the service

You may cancel monitoring under the cancellation terms in this agreement. There is no cancellation fee.

Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.

Ending monitoring does not end a different service order. Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.

## 13. Governing law

This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.

Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.

## 14. Other terms

We will change this agreement for an order you have already accepted only by agreeing a replacement of this agreement with you. A change of our published prices or website wording does not change an agreement you have already accepted.

If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.

This agreement and the accepted quotation are the whole agreement between us for the service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agree$,
  'SOLICITOR_REVIEW',
  false,
  'RELAUNCH_GUARD'
);

CREATE OR REPLACE FUNCTION admin_private.bind_paid_service_quote_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  ver text;
  hash text;
  operative_specific boolean;
BEGIN
  IF NEW.service_code IN ('GUIDED_RELAUNCH','GUIDED_REVIEW','MANAGED_RELAUNCH','MANAGED_REVIEW','RELAUNCH_GUARD')
    AND (
      (TG_OP = 'INSERT' AND NEW.status = 'OFFERED')
      OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status = 'OFFERED')
    )
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.paid_service_agreement_catalogue
      WHERE service_code = NEW.service_code AND operative IS TRUE AND status = 'APPROVED'
    ) INTO operative_specific;
    -- A second offered quote for the same case is refused only once this
    -- service has an operative agreement. Until then a new offer still binds
    -- the omnibus, which is what issued quotations and existing tests use.
    -- After owner approval there is no silent second offer and no fallback
    -- to a different agreement.
    IF operative_specific AND NEW.case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.case_id = NEW.case_id
        AND q.id IS DISTINCT FROM NEW.quote_id
        AND q.status = 'OFFERED'
    ) THEN
      RAISE EXCEPTION 'offered_quote:case_already_offered' USING ERRCODE = 'P0001';
    END IF;
    IF operative_specific THEN
      SELECT version_id, content_hash INTO ver, hash
      FROM public.paid_service_agreement_catalogue
      WHERE operative IS TRUE
        AND status = 'APPROVED'
        AND (
          (NEW.service_code = 'GUIDED_RELAUNCH' AND version_id = 'PS-2026-10-22.GR' AND content_hash = '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3')
        OR (NEW.service_code = 'GUIDED_REVIEW' AND version_id = 'PS-2026-10-22.GV' AND content_hash = '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9')
        OR (NEW.service_code = 'MANAGED_RELAUNCH' AND version_id = 'PS-2026-10-22.MR' AND content_hash = '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269')
        OR (NEW.service_code = 'MANAGED_REVIEW' AND version_id = 'PS-2026-10-22.MV' AND content_hash = '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784')
        OR (NEW.service_code = 'RELAUNCH_GUARD' AND version_id = 'PS-2026-10-22.GD' AND content_hash = '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23')
        );
      IF ver IS NULL OR hash IS NULL THEN
        RAISE EXCEPTION 'offered_quote:agreement_not_approved' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      SELECT version_id, content_hash INTO ver, hash
      FROM public.paid_service_agreement_catalogue
      WHERE version_id = 'PS-2026-10-14.2'
        AND content_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4';
      IF ver IS NULL OR hash IS NULL THEN
        RAISE EXCEPTION 'Paid-service quotations require the frozen agreement catalogue' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    NEW.commercial_agreement_version := ver;
    NEW.commercial_agreement_hash := hash;
    IF position(ver IN NEW.terms_reference) = 0 THEN
      NEW.terms_reference := left(btrim(NEW.terms_reference) || ' Agreement ' || ver || ' SHA-256 ' || hash || '.', 1000);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.paid_service_quote_disclosure_v1(p_version text, p_hash text)
RETURNS TABLE(ready boolean, body text)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT true, c.body_text
  FROM public.paid_service_agreement_catalogue c
  WHERE c.version_id = p_version
    AND c.content_hash = p_hash
    AND c.status = 'APPROVED'
    AND c.operative IS TRUE
    AND char_length(btrim(c.body_text)) > 0
    AND (
      (p_version = 'PS-2026-10-14.2' AND p_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4' AND c.service_code IS NULL)
      OR (p_version = 'PS-2026-10-22.GR' AND p_hash = '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3' AND c.service_code = 'GUIDED_RELAUNCH')
      OR (p_version = 'PS-2026-10-22.GV' AND p_hash = '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9' AND c.service_code = 'GUIDED_REVIEW')
      OR (p_version = 'PS-2026-10-22.MR' AND p_hash = '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269' AND c.service_code = 'MANAGED_RELAUNCH')
      OR (p_version = 'PS-2026-10-22.MV' AND p_hash = '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784' AND c.service_code = 'MANAGED_REVIEW')
      OR (p_version = 'PS-2026-10-22.GD' AND p_hash = '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23' AND c.service_code = 'RELAUNCH_GUARD')
    );
$$;

CREATE OR REPLACE FUNCTION admin_private.record_paid_service_acceptance_body_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid, p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  qv public.quote_versions;
  qu public.quotes;
  cat public.paid_service_agreement_catalogue;
  prev public.paid_service_acceptances;
  other_customer uuid;
  case_customer uuid;
  business jsonb;
  terms jsonb;
  fee jsonb;
  fp text;
  quote_result jsonb;
  distinction jsonb;
  fee_kind text;
  fee_text text;
  case_ref text;
  business_name text;
  place_name text;
  order_ref text;
  purpose text := 'I confirm that I am acting for the business named on this quotation and that I am authorised to bind it for the location on this quotation.';
  managed_text text := 'I acknowledge that the Managed success fee is payable only after documented success, within 14 calendar days of the invoice. No card is charged automatically and the fee is not collected before that documented success.';
  guard_text text := 'I authorise monthly billing for Relaunch Guard for this exact location at the accepted monthly amount until cancelled under the agreed cancellation terms. This consent covers only this location and this accepted price. Opening a link or verifying a one-time code is not acceptance.';
BEGIN
  IF p_actor IS NULL OR p_request IS NULL OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 8192 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_action.id IS NULL OR p_action.kind <> 'QUOTE_ACCEPTANCE' THEN
    RETURN jsonb_build_object('status', 'unauthorised');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'verified'
  ) THEN RETURN jsonb_build_object('status', 'membership_unverified'); END IF;
  IF p_data ? 'quoteVersionId' AND (
    p_data->>'quoteVersionId' IS NULL
    OR p_data->>'quoteVersionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_data->>'quoteVersionId')::uuid IS DISTINCT FROM p_action.quote_version_id
  ) THEN
    IF p_data->>'quoteVersionId' IS NULL OR p_data->>'quoteVersionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT customer_id INTO other_customer FROM public.quote_versions WHERE id = (p_data->>'quoteVersionId')::uuid;
    IF other_customer IS NOT NULL AND other_customer IS DISTINCT FROM p_action.customer_id THEN
      RETURN jsonb_build_object('status', 'cross_customer');
    END IF;
    RETURN jsonb_build_object('status', 'stale_quotation');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id FOR UPDATE;
  SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
  IF qv.id IS NULL OR qu.id IS NULL OR qv.customer_id IS DISTINCT FROM p_action.customer_id THEN
    RETURN jsonb_build_object('status', 'cross_customer');
  END IF;
  IF qv.case_id IS NOT NULL THEN
    SELECT customer_id INTO case_customer FROM public.cases WHERE id = qv.case_id;
    IF case_customer IS DISTINCT FROM p_action.customer_id THEN RETURN jsonb_build_object('status', 'cross_customer'); END IF;
  END IF;
  business := p_data->'businessPurpose';
  terms := p_data->'terms';
  fee := p_data->'feeBasis';
  fp := md5(jsonb_build_array(p_action.quote_version_id, business, terms, fee)::text);
  SELECT * INTO prev FROM public.paid_service_acceptances WHERE request_id = p_request;
  IF prev.id IS NOT NULL THEN
    IF prev.customer_id IS DISTINCT FROM p_action.customer_id THEN RETURN jsonb_build_object('status', 'cross_customer'); END IF;
    IF prev.payload_fingerprint IS DISTINCT FROM fp THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    SELECT public_ref INTO order_ref FROM public.service_orders WHERE id = prev.service_order_id;
    RETURN jsonb_build_object('status', 'replay', 'acceptanceId', prev.id, 'orderId', prev.service_order_id, 'orderRef', order_ref, 'snapshot', admin_private.paid_service_acceptance_snapshot_v1(prev));
  END IF;
  SELECT * INTO prev FROM public.paid_service_acceptances WHERE quote_version_id = qv.id;
  IF prev.id IS NOT NULL THEN
    SELECT public_ref INTO order_ref FROM public.service_orders WHERE id = prev.service_order_id;
    RETURN jsonb_build_object('status', 'already_accepted', 'acceptanceId', prev.id, 'orderId', prev.service_order_id, 'orderRef', order_ref);
  END IF;
  IF EXISTS (SELECT 1 FROM public.quote_acceptances WHERE quote_version_id = qv.id)
    AND EXISTS (SELECT 1 FROM public.service_orders WHERE quote_version_id = qv.id)
  THEN
    RETURN admin_private.accept_quote_version_v1(p_action, p_actor, p_request);
  END IF;
  IF p_action.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  IF qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' OR qu.current_version_id IS DISTINCT FROM qv.id
    OR qv.valid_until IS NULL OR qv.valid_until <= now()
  THEN RETURN jsonb_build_object('status', 'stale_quotation'); END IF;
  IF qv.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object('status', 'tax_unconfirmed'); END IF;
  IF NOT admin_private.customer_action_eligible_v1(p_action) THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  SELECT * INTO cat FROM public.paid_service_agreement_catalogue
  WHERE version_id = qv.commercial_agreement_version
    AND content_hash = qv.commercial_agreement_hash;
  IF cat.version_id IS NULL THEN
    RETURN jsonb_build_object('status', 'stale_version');
  END IF;
  IF cat.operative IS NOT TRUE OR cat.status IS DISTINCT FROM 'APPROVED' THEN
    RETURN jsonb_build_object('status', 'not_operative');
  END IF;
  IF NOT (
    (cat.version_id = 'PS-2026-10-14.2' AND cat.content_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4' AND cat.service_code IS NULL)
    OR (cat.service_code = qv.service_code AND (
      (qv.service_code = 'GUIDED_RELAUNCH' AND cat.version_id = 'PS-2026-10-22.GR' AND cat.content_hash = '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3')
      OR (qv.service_code = 'GUIDED_REVIEW' AND cat.version_id = 'PS-2026-10-22.GV' AND cat.content_hash = '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9')
      OR (qv.service_code = 'MANAGED_RELAUNCH' AND cat.version_id = 'PS-2026-10-22.MR' AND cat.content_hash = '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269')
      OR (qv.service_code = 'MANAGED_REVIEW' AND cat.version_id = 'PS-2026-10-22.MV' AND cat.content_hash = '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784')
      OR (qv.service_code = 'RELAUNCH_GUARD' AND cat.version_id = 'PS-2026-10-22.GD' AND cat.content_hash = '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23')
    ))
  ) THEN
    RETURN jsonb_build_object('status', 'stale_version');
  END IF;
  IF business IS DISTINCT FROM '{"accepted":true}'::jsonb THEN RETURN jsonb_build_object('status', 'missing_business_purpose'); END IF;
  IF terms IS NULL OR terms->>'accepted' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('status', 'missing_terms'); END IF;
  IF terms->>'version' IS DISTINCT FROM cat.version_id OR terms->>'hash' IS DISTINCT FROM cat.content_hash THEN
    RETURN jsonb_build_object('status', 'stale_version');
  END IF;
  IF qv.service_code IN ('GUIDED_RELAUNCH','GUIDED_REVIEW') THEN
    IF qv.payment_model IS DISTINCT FROM 'UPFRONT' THEN RETURN jsonb_build_object('status', 'stale_quotation'); END IF;
    IF fee IS NOT NULL AND jsonb_typeof(fee) <> 'null' THEN RETURN jsonb_build_object('status', 'irrelevant_consent'); END IF;
    fee_kind := NULL;
    fee_text := NULL;
    distinction := jsonb_build_object('collectsUpfront', true, 'invoicesAfterSuccess', false, 'automaticCardCharge', false, 'recurringConsent', false, 'refundBeforeSubstantiveWork', 'full');
  ELSIF qv.service_code IN ('MANAGED_RELAUNCH','MANAGED_REVIEW') THEN
    IF qv.payment_model IS DISTINCT FROM 'SUCCESS_FEE' THEN RETURN jsonb_build_object('status', 'stale_quotation'); END IF;
    IF fee IS NULL OR jsonb_typeof(fee) = 'null' OR fee->>'accepted' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('status', 'missing_fee_basis'); END IF;
    IF fee->>'kind' = 'SUCCESS_FEE_CONSENT_V1' THEN RETURN jsonb_build_object('status', 'legacy_off_session_consent'); END IF;
    IF fee->>'kind' IS DISTINCT FROM 'MANAGED_CONTINGENT_SUCCESS_FEE_V1' THEN RETURN jsonb_build_object('status', 'wrong_fee_basis'); END IF;
    fee_kind := 'MANAGED_CONTINGENT_SUCCESS_FEE_V1';
    fee_text := managed_text;
    distinction := jsonb_build_object('collectsUpfront', false, 'invoicesAfterSuccess', true, 'automaticCardCharge', false, 'recurringConsent', false, 'refundBeforeSubstantiveWork', 'not_applicable');
  ELSIF qv.service_code = 'RELAUNCH_GUARD' THEN
    IF qv.payment_model IS DISTINCT FROM 'RECURRING_MONTHLY' THEN RETURN jsonb_build_object('status', 'stale_quotation'); END IF;
    IF fee IS NULL OR jsonb_typeof(fee) = 'null' OR fee->>'accepted' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('status', 'missing_fee_basis'); END IF;
    IF fee->>'kind' = 'SUCCESS_FEE_CONSENT_V1' THEN RETURN jsonb_build_object('status', 'legacy_off_session_consent'); END IF;
    IF fee->>'kind' IS DISTINCT FROM 'GUARD_RECURRING_CONSENT_V1' THEN RETURN jsonb_build_object('status', 'wrong_fee_basis'); END IF;
    IF fee->>'locationId' IS NULL OR fee->>'amountMinor' IS NULL OR fee->>'amountMinor' !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF fee->>'locationId' IS DISTINCT FROM qv.location_id::text OR (fee->>'amountMinor')::integer IS DISTINCT FROM qv.total_amount_minor THEN
      RETURN jsonb_build_object('status', 'stale_quotation');
    END IF;
    fee_kind := 'GUARD_RECURRING_CONSENT_V1';
    fee_text := guard_text;
    distinction := jsonb_build_object('collectsUpfront', false, 'invoicesAfterSuccess', false, 'automaticCardCharge', false, 'recurringConsent', true, 'refundBeforeSubstantiveWork', 'not_applicable');
  ELSE
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  quote_result := admin_private.complete_quote_acceptance_v1(p_action, p_actor, p_request);
  IF quote_result->>'status' IS DISTINCT FROM 'success' THEN
    RAISE EXCEPTION 'paid service quote acceptance did not complete' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO prev FROM public.paid_service_acceptances WHERE quote_version_id = qv.id;
  IF prev.id IS NOT NULL THEN
    SELECT public_ref INTO order_ref FROM public.service_orders WHERE id = prev.service_order_id;
    IF prev.request_id = p_request AND prev.payload_fingerprint = fp THEN
      RETURN jsonb_build_object('status', 'replay', 'acceptanceId', prev.id, 'orderId', prev.service_order_id, 'orderRef', order_ref, 'snapshot', admin_private.paid_service_acceptance_snapshot_v1(prev));
    END IF;
    RETURN jsonb_build_object('status', 'already_accepted', 'acceptanceId', prev.id, 'orderId', prev.service_order_id, 'orderRef', order_ref);
  END IF;
  SELECT public_ref INTO case_ref FROM public.cases WHERE id = qv.case_id;
  SELECT display_name INTO business_name FROM public.businesses WHERE id = qv.business_id;
  SELECT locations.location_name INTO place_name FROM public.locations WHERE locations.id = qv.location_id;
  INSERT INTO public.paid_service_acceptances(
    request_id, payload_fingerprint, customer_id, business_id, location_id, case_id, customer_action_id,
    quote_id, quote_version_id, quote_acceptance_id, service_order_id, accepted_by_auth_user_id,
    agreement_version, agreement_hash, agreement_body, service_code, payment_model, amount_minor, currency,
    business_purpose_text, business_purpose_accepted_at, terms_accepted_at, fee_basis_kind, fee_basis_text,
    fee_basis_accepted_at, payment_distinction, quotation_snapshot
  ) VALUES (
    p_request, fp, p_action.customer_id, p_action.business_id, p_action.location_id, p_action.case_id, p_action.id,
    qu.id, qv.id, (quote_result->>'acceptanceId')::uuid, (quote_result->>'orderId')::uuid, p_actor,
    cat.version_id, cat.content_hash, cat.body_text, qv.service_code, qv.payment_model, qv.total_amount_minor, qv.currency,
    purpose, now(), now(), fee_kind, fee_text, CASE WHEN fee_kind IS NULL THEN NULL ELSE now() END, distinction,
    jsonb_build_object(
      'quoteVersionId', qv.id, 'serviceCode', qv.service_code, 'serviceName', qv.service_name,
      'scope', qv.scope_text, 'exclusions', qv.exclusions_text, 'successDefinition', qv.success_definition,
      'paymentModel', qv.payment_model, 'standardAmountMinor', qv.standard_amount_minor,
      'discountAmountMinor', qv.discount_amount_minor, 'quotedSubtotalMinor', qv.quoted_subtotal_minor,
      'taxBehaviour', qv.tax_behaviour, 'taxAmountMinor', qv.tax_amount_minor, 'totalAmountMinor', qv.total_amount_minor,
      'currency', qv.currency, 'paymentTiming', qv.payment_timing_text, 'termsReference', qv.terms_reference,
      'agreementVersion', cat.version_id, 'agreementHash', cat.content_hash,
      'businessName', business_name, 'locationName', place_name, 'locationId', qv.location_id, 'caseReference', case_ref
    )
  ) RETURNING * INTO prev;
  INSERT INTO public.paid_service_agreement_events(version_id, acceptance_id, event, actor_id, details)
  VALUES (cat.version_id, prev.id, 'TERMS_ACCEPTED', p_actor, jsonb_build_object('quoteVersionId', qv.id, 'hash', cat.content_hash));
  RETURN quote_result || jsonb_build_object(
    'acceptanceId', prev.id,
    'paidAcceptanceId', prev.id,
    'quoteAcceptanceId', quote_result->>'acceptanceId',
    'snapshot', admin_private.paid_service_acceptance_snapshot_v1(prev)
  );
END; $$;

CREATE FUNCTION public.admin_record_owner_paid_service_agreement_approval_v1(
  p_token text, p_request uuid, p_version text, p_evidence text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  actor uuid;
  cat public.paid_service_agreement_catalogue;
  prior public.paid_service_agreement_approvals;
  expected text;
  solicitor text;
  evidence text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL OR s->>'userId' IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  actor := (s->>'userId')::uuid;
  evidence := btrim(coalesce(p_evidence, ''));
  IF p_request IS NULL OR p_version IS NULL OR char_length(evidence) NOT BETWEEN 20 AND 500 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO cat FROM public.paid_service_agreement_catalogue WHERE version_id = p_version FOR UPDATE;
  IF cat.version_id IS NULL THEN RETURN jsonb_build_object('status', 'unknown_version'); END IF;
  IF NOT (
      (p_version = 'PS-2026-10-22.GR' AND cat.content_hash = '705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3' AND cat.service_code = 'GUIDED_RELAUNCH')
      OR (p_version = 'PS-2026-10-22.GV' AND cat.content_hash = '56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9' AND cat.service_code = 'GUIDED_REVIEW')
      OR (p_version = 'PS-2026-10-22.MR' AND cat.content_hash = '725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269' AND cat.service_code = 'MANAGED_RELAUNCH')
      OR (p_version = 'PS-2026-10-22.MV' AND cat.content_hash = '62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784' AND cat.service_code = 'MANAGED_REVIEW')
      OR (p_version = 'PS-2026-10-22.GD' AND cat.content_hash = '51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23' AND cat.service_code = 'RELAUNCH_GUARD')
  ) THEN
    RETURN jsonb_build_object('status', 'unknown_version');
  END IF;
  expected := 'Business owner approved the wording of paid-service agreement ' || cat.version_id || ' with SHA-256 ' || cat.content_hash || ' on 22 October 2026. This is not external solicitor confirmation.';
  solicitor := 'Solicitor reviewed paid-service agreement ' || cat.version_id || ' with SHA-256 ' || cat.content_hash || '.';
  IF evidence = expected OR evidence = solicitor OR evidence = cat.content_hash OR evidence = cat.version_id
    OR evidence ILIKE '%solicitor reviewed%'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO prior FROM public.paid_service_agreement_approvals WHERE request_id = p_request;
  IF prior.id IS NOT NULL THEN
    IF prior.approved_by IS DISTINCT FROM actor OR prior.evidence_reference IS DISTINCT FROM evidence
      OR prior.version_id IS DISTINCT FROM cat.version_id OR prior.approval_basis IS DISTINCT FROM 'BUSINESS_OWNER'
    THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'replay', 'version', prior.version_id, 'hash', prior.content_hash, 'operative', cat.operative, 'approvalBasis', 'BUSINESS_OWNER');
  END IF;
  IF cat.operative THEN
    RETURN jsonb_build_object('status', 'already_confirmed', 'version', cat.version_id, 'hash', cat.content_hash, 'operative', true, 'approvalBasis', cat.approval_basis);
  END IF;
  INSERT INTO public.paid_service_agreement_approvals(
    request_id, version_id, content_hash, evidence_reference, approved_by, statement, approval_basis
  ) VALUES (p_request, cat.version_id, cat.content_hash, evidence, actor, expected, 'BUSINESS_OWNER');
  UPDATE public.paid_service_agreement_catalogue
    SET status = 'APPROVED', operative = true, approval_basis = 'BUSINESS_OWNER',
        owner_approved_at = now(), owner_approval_statement = expected
    WHERE version_id = cat.version_id AND operative = false;
  INSERT INTO public.paid_service_agreement_events(version_id, event, actor_id, details)
  VALUES (
    cat.version_id, 'OWNER_APPROVED', actor,
    jsonb_build_object('hash', cat.content_hash, 'approvalBasis', 'BUSINESS_OWNER', 'evidenceReference', evidence, 'solicitorConfirmation', false)
  );
  RETURN jsonb_build_object('status', 'confirmed', 'version', cat.version_id, 'hash', cat.content_hash, 'operative', true, 'approvalBasis', 'BUSINESS_OWNER');
END; $$;

REVOKE ALL ON FUNCTION public.admin_record_owner_paid_service_agreement_approval_v1(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_owner_paid_service_agreement_approval_v1(text, uuid, text, text) TO service_role;

COMMIT;
