-- DEV-AGREEMENT-04: owner-approved five service-specific paid contracts.
-- DEV-only owner activation after reviewed schema migration; do not apply to Production.
-- Owner approval is NOT a claim that a solicitor reviewed these agreements.
-- Existing PS-2026-10-14.2, old offers and historical acceptances remain immutable.
BEGIN;

DO $precheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.paid_service_agreement_catalogue
    WHERE version_id='PS-2026-10-14.2' AND content_hash='0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4'
      AND status='APPROVED' AND operative
      AND encode(sha256(convert_to(body_text,'UTF8')),'hex')=content_hash
  ) THEN RAISE EXCEPTION 'Old operative agreement does not match approved baseline'; END IF;
  IF EXISTS (SELECT 1 FROM public.paid_service_agreement_catalogue WHERE version_id LIKE 'PS-2026-10-22.%')
  THEN RAISE EXCEPTION 'New agreement versions already exist; refuse replay'; END IF;
END; $precheck$;

INSERT INTO public.paid_service_agreement_catalogue (
  version_id,content_hash,body_text,status,operative,owner_approved_at,owner_approval_statement
) VALUES
('PS-2026-10-22.GR','705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3',$agreementbody$ProfileRelaunch Ltd — Paid-service agreement for Guided Relaunch

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

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agreementbody$,'APPROVED',true,now(),'Owner approved paid-service agreement PS-2026-10-22.GR with SHA-256 705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3; approved for DEV under GitHub PR #268 and issue #269.'),
('PS-2026-10-22.GV','56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9',$agreementbody$ProfileRelaunch Ltd — Paid-service agreement for Guided Review

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

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agreementbody$,'APPROVED',true,now(),'Owner approved paid-service agreement PS-2026-10-22.GV with SHA-256 56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9; approved for DEV under GitHub PR #268 and issue #269.'),
('PS-2026-10-22.MR','725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269',$agreementbody$ProfileRelaunch Ltd — Paid-service agreement for Managed Profile Recovery

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

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agreementbody$,'APPROVED',true,now(),'Owner approved paid-service agreement PS-2026-10-22.MR with SHA-256 725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269; approved for DEV under GitHub PR #268 and issue #269.'),
('PS-2026-10-22.MV','62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784',$agreementbody$ProfileRelaunch Ltd — Paid-service agreement for Managed Review Protection

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

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agreementbody$,'APPROVED',true,now(),'Owner approved paid-service agreement PS-2026-10-22.MV with SHA-256 62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784; approved for DEV under GitHub PR #268 and issue #269.'),
('PS-2026-10-22.GD','51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23',$agreementbody$ProfileRelaunch Ltd — Paid-service agreement for Relaunch Guard

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

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$agreementbody$,'APPROVED',true,now(),'Owner approved paid-service agreement PS-2026-10-22.GD with SHA-256 51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23; approved for DEV under GitHub PR #268 and issue #269.');

INSERT INTO public.paid_service_owner_approvals(version_id,content_hash,evidence_reference,decision_source)
VALUES
('PS-2026-10-22.GR','705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3','Owner approval recorded 22 October 2026, PR #268, issue #269; exact version/hash declared approved','OWNER_DECLARATION_IN_PROJECT_CONVERSATION'),
('PS-2026-10-22.GV','56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9','Owner approval recorded 22 October 2026, PR #268, issue #269; exact version/hash declared approved','OWNER_DECLARATION_IN_PROJECT_CONVERSATION'),
('PS-2026-10-22.MR','725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269','Owner approval recorded 22 October 2026, PR #268, issue #269; exact version/hash declared approved','OWNER_DECLARATION_IN_PROJECT_CONVERSATION'),
('PS-2026-10-22.MV','62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784','Owner approval recorded 22 October 2026, PR #268, issue #269; exact version/hash declared approved','OWNER_DECLARATION_IN_PROJECT_CONVERSATION'),
('PS-2026-10-22.GD','51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23','Owner approval recorded 22 October 2026, PR #268, issue #269; exact version/hash declared approved','OWNER_DECLARATION_IN_PROJECT_CONVERSATION');

INSERT INTO public.paid_service_agreement_events(version_id,event,actor_id,details)
SELECT a.version_id, 'OWNER_APPROVED', NULL,
  jsonb_build_object('hash',a.content_hash,'evidence','GitHub PR #268 and issue #269','approvalType','owner_not_solicitor')
FROM public.paid_service_owner_approvals a;

UPDATE admin_private.paid_service_agreement_routing_config
  SET mode='SERVICE_SPECIFIC',activated_at=now()
  WHERE id=true AND mode='LEGACY' AND activated_at IS NULL;
DO $mode_check$
BEGIN
  IF (SELECT mode FROM admin_private.paid_service_agreement_routing_config WHERE id=true) IS DISTINCT FROM 'SERVICE_SPECIFIC'
  THEN RAISE EXCEPTION 'Agreement routing activation failed'; END IF;
END; $mode_check$;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.paid_service_agreement_catalogue WHERE status='APPROVED' AND operative) <> 6
  THEN RAISE EXCEPTION 'Agreement catalogue count does not equal original plus five'; END IF;
  IF (SELECT count(*) FROM public.paid_service_owner_approvals) <> 5
  THEN RAISE EXCEPTION 'Owner approval records missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.paid_service_agreement_catalogue WHERE encode(sha256(convert_to(body_text,'UTF8')),'hex')<>content_hash)
  THEN RAISE EXCEPTION 'Source body/hash mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.paid_service_owner_approvals o
    JOIN public.paid_service_agreement_catalogue c ON c.version_id=o.version_id
    WHERE c.content_hash<>o.content_hash OR c.solicitor_statement IS NOT NULL OR c.solicitor_confirmed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Owner and solicitor approval evidence mixed'; END IF;
END; $verify$;
COMMIT;
