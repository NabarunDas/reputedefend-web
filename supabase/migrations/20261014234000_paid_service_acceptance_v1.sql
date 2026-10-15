-- COM-13A paid-service acceptance.
-- Additive and source-only. Do not apply this file to DEV or Production
-- from the change that adds it. It does not move AWS ApprovedMigrationHead.
-- It does not enable Stripe, the Customer Portal, Guard or mail automation.
-- It does not rewrite historical quote acceptances, agreement versions or
-- authorisation records. The catalogue row is inserted unapproved. Only an
-- explicit confirmation of this exact version and SHA-256 marks it operative.
-- PS-2026-10-14.1 is not a row and cannot be confirmed by this function.

BEGIN;

CREATE TABLE public.paid_service_agreement_catalogue (
  version_id text PRIMARY KEY,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  body_text text NOT NULL,
  status text NOT NULL CHECK (status IN ('SOLICITOR_REVIEW','APPROVED')),
  operative boolean NOT NULL DEFAULT false,
  solicitor_confirmed_at timestamptz,
  solicitor_statement text,
  CHECK (version_id = 'PS-2026-10-14.2'),
  CHECK (content_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4'),
  CHECK (
    (
      status = 'SOLICITOR_REVIEW'
      AND operative = false
      AND solicitor_confirmed_at IS NULL
      AND solicitor_statement IS NULL
    )
    OR (
      status = 'APPROVED'
      AND operative = true
      AND solicitor_confirmed_at IS NOT NULL
      AND solicitor_statement = 'Solicitor reviewed paid-service agreement ' || version_id || ' with SHA-256 ' || content_hash || '.'
    )
  )
);

CREATE TABLE public.paid_service_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  payload_fingerprint text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_action_id uuid NOT NULL REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  quote_version_id uuid NOT NULL UNIQUE REFERENCES public.quote_versions(id) ON DELETE RESTRICT,
  quote_acceptance_id uuid NOT NULL UNIQUE REFERENCES public.quote_acceptances(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  accepted_by_auth_user_id uuid NOT NULL,
  agreement_version text NOT NULL CHECK (agreement_version = 'PS-2026-10-14.2'),
  agreement_hash text NOT NULL CHECK (agreement_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4'),
  agreement_body text NOT NULL,
  service_code text NOT NULL CHECK (service_code IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD')),
  payment_model text NOT NULL CHECK (payment_model IN ('UPFRONT','SUCCESS_FEE','RECURRING_MONTHLY')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  business_purpose_text text NOT NULL,
  business_purpose_accepted_at timestamptz NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  fee_basis_kind text,
  fee_basis_text text,
  fee_basis_accepted_at timestamptz,
  payment_distinction jsonb NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (service_code IN ('GUIDED_RELAUNCH','GUIDED_REVIEW') AND payment_model = 'UPFRONT' AND fee_basis_kind IS NULL AND fee_basis_text IS NULL AND fee_basis_accepted_at IS NULL)
    OR (service_code IN ('MANAGED_RELAUNCH','MANAGED_REVIEW') AND payment_model = 'SUCCESS_FEE' AND fee_basis_kind = 'MANAGED_CONTINGENT_SUCCESS_FEE_V1' AND fee_basis_text IS NOT NULL AND fee_basis_accepted_at IS NOT NULL)
    OR (service_code = 'RELAUNCH_GUARD' AND payment_model = 'RECURRING_MONTHLY' AND fee_basis_kind = 'GUARD_RECURRING_CONSENT_V1' AND fee_basis_text IS NOT NULL AND fee_basis_accepted_at IS NOT NULL)
  )
);

CREATE INDEX paid_service_acceptances_customer_idx ON public.paid_service_acceptances(customer_id, accepted_at DESC);

CREATE TABLE public.paid_service_agreement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id text NOT NULL,
  acceptance_id uuid REFERENCES public.paid_service_acceptances(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN ('SOLICITOR_CONFIRMED','TERMS_ACCEPTED')),
  actor_id uuid,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION admin_private.protect_paid_service_catalogue_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.version_id IS DISTINCT FROM OLD.version_id
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.body_text IS DISTINCT FROM OLD.body_text
  THEN
    RAISE EXCEPTION 'paid service catalogue text is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.operative AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'approved paid service agreement is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER paid_service_catalogue_immutable
BEFORE UPDATE ON public.paid_service_agreement_catalogue
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_paid_service_catalogue_v1();

CREATE FUNCTION admin_private.protect_paid_service_acceptance_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'paid service acceptance is immutable' USING ERRCODE = '23514';
END; $$;

CREATE TRIGGER paid_service_acceptances_immutable
BEFORE UPDATE OR DELETE ON public.paid_service_acceptances
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_paid_service_acceptance_v1();

CREATE FUNCTION admin_private.protect_paid_service_events_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'paid service acceptance events are immutable' USING ERRCODE = '23514';
END; $$;

CREATE TRIGGER paid_service_agreement_events_immutable
BEFORE UPDATE OR DELETE ON public.paid_service_agreement_events
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_paid_service_events_v1();

CREATE FUNCTION admin_private.paid_service_acceptance_snapshot_v1(p public.paid_service_acceptances) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'status', 'ok',
    'acceptanceId', p.id,
    'acceptedAt', p.accepted_at,
    'customerId', p.customer_id,
    'quoteVersionId', p.quote_version_id,
    'quoteAcceptanceId', p.quote_acceptance_id,
    'serviceOrderId', p.service_order_id,
    'agreementVersion', p.agreement_version,
    'agreementHash', p.agreement_hash,
    'agreementBody', p.agreement_body,
    'serviceCode', p.service_code,
    'paymentModel', p.payment_model,
    'amountMinor', p.amount_minor,
    'currency', p.currency,
    'businessPurposeText', p.business_purpose_text,
    'businessPurposeAcceptedAt', p.business_purpose_accepted_at,
    'termsAcceptedAt', p.terms_accepted_at,
    'feeBasisKind', p.fee_basis_kind,
    'feeBasisText', p.fee_basis_text,
    'feeBasisAcceptedAt', p.fee_basis_accepted_at,
    'paymentDistinction', p.payment_distinction
  );
$$;

INSERT INTO public.paid_service_agreement_catalogue(version_id, content_hash, body_text, status, operative)
VALUES (
  'PS-2026-10-14.2',
  '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4',
  $psabody$ProfileRelaunch Ltd — Paid-service agreement

Version PS-2026-10-14.2

This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this version ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.

## 1. Formation

A paid-service contract is formed only when we have given you a quotation that names the service, the Business Profile or review, the price and this version, and you have accepted that quotation and this version.

Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a paid-service contract. The website terms govern use of the website. They are not this agreement. For the paid service, this agreement and the accepted quotation prevail if they conflict with the website terms.

This version applies only to a quotation you accept under it. It does not change an agreement you have already accepted under another version. We may withdraw a quotation that you have not yet accepted.

## 2. Authority

The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.

If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.

## 3. Services

The accepted quotation states which services you have ordered. We provide only those services.

Guided Relaunch and Guided Review are support we carry out for you for a fee payable upfront. Managed Profile Recovery and Managed Review Protection are success-fee services. The success fee becomes payable only when the success criteria in this agreement are met for the incident named in the quotation. Relaunch Guard is monthly monitoring for each location named in the quotation.

We are independent of Google. We do not control Google's systems, decisions or timescales. Completing the agreed work is distinct from a decision by Google. Delivering the agreed work is not a promise that Google will reinstate a profile or remove a review, or that a restored profile or removed review will remain in that state after the checks this agreement describes.

## 4. Prices and currency

The prices are in pounds sterling (GBP). Unless the accepted quotation states a different price:

Guided Relaunch is £99 upfront. Guided Review is £59 upfront. Managed Profile Recovery is a success fee of £299. Managed Review Protection is a success fee of £149. Relaunch Guard is £9.99 per month per location.

The price on the accepted quotation is the price for that order, including a discount we have already agreed in writing for that order.

Where Stripe supports presenting the charge in another currency, we show you the final currency and the amount before you pay. The GBP amount on the quotation remains the authoritative amount. We do not guarantee a particular conversion rate.

## 5. Guided Relaunch and Guided Review

A Guided fee is payable upfront only after you have accepted a valid quotation and this agreement.

You may cancel before substantive case-specific work begins and receive a full refund of the upfront fee.

After substantive case-specific work begins, we may retain only a fair portion of the fee attributable to work already performed. That portion must be evidenced. We will not deduct an amount we cannot evidence. We will refund the remainder.

Google's decision does not, by itself, prove the work was deficient. These terms do not exclude legal remedies for deficient work.

## 6. Managed Profile Recovery

The success fee is £299 unless the accepted quotation states another price. The quotation identifies the exact Business Profile and the incident. We record the baseline restriction before relying on it for the fee.

The fee is earned only when the original restriction is absent at an initial check and again at a second check at least 48 hours later, and the original restriction is not known to have returned between those checks.

An unrelated new issue after that verified outcome does not invalidate the completed service. We charge no success fee for an outcome known to be wholly unrelated to work you authorised.

The two checks are two recorded observations. They are not uninterrupted surveillance. If an observation is missing, unknown or ambiguous, or the checks are less than 48 hours apart, the outcome stays pending. A pending outcome is not invoiced as success.

## 7. Managed Review Protection

The success fee is £149 unless the accepted quotation states another price. The quotation identifies the exact original review through the stable identifiers and baseline evidence then available.

The fee is earned only when that specified review is absent at two checks at least 48 hours apart. Evidence that the same review returned during that period means that verification attempt has not succeeded.

A different new negative review is a separate incident and does not invalidate success for the specified review. Reporting, hiding, a rating change, or an acknowledgement is not by itself a successful removal.

We charge no success fee for a removal known to be wholly unrelated to the authorised work. The two checks are not uninterrupted surveillance. A missing, unknown or ambiguous observation stays pending and is not invoiced as success.

## 8. Your obligations

You will give us accurate information about the business, the profile and the reviews, and the access the accepted service needs. Where the service needs access to a Business Profile, you add us as a Manager. You remain the owner. We do not need your Google password or access to your email account.

You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.

You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.

## 9. Our obligations

We will perform the accepted service with reasonable care and skill, keep you informed of material progress, and record the observations we rely on for a fee.

We may use trained staff and contractors. We remain responsible to you for the accepted service.

We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. If we stop Guided work for that reason before it is complete, section 5 applies to the fee. A Managed success fee is not payable for work stopped on that ground unless the success criteria were already met.

## 10. Evidence, duplicate fees and disputes

We record both verification timestamps and the observations that support them.

There is no second success-fee obligation for the same service order and the same verified outcome.

You may dispute the claimed outcome in writing before the invoice falls due. Tell us what you dispute and why. Collection of a genuinely disputed amount pauses while we review that dispute against the recorded checks. Pausing collection is not an admission, and it does not remove a remedy for deficient work. We will tell you the result of the review. An amount that is not genuinely disputed remains payable.

## 11. Payment

Guided fees are paid upfront, and only once you have accepted a valid quotation and this agreement.

Managed fees are invoiced only after documented success. You will pay an undisputed invoice within 14 calendar days. There is no automatic card charge for a Managed success fee and no collection of that fee in advance.

Any charge in a currency other than GBP is made only after the currency and amount have been shown to you, as section 4 describes.

## 12. Tax

We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.

If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.

## 13. Relaunch Guard

Relaunch Guard is £9.99 per month per location named in the accepted quotation.

Monitoring for a location starts only after you have accepted the Guard order for that location, we have confirmed the access we asked for, and we have completed the initial check. Sending a setup form does not start monitoring and does not take payment.

Our team carries out the checks manually, twice each day, including weekends and bank holidays, using a Europe/London schedule, and we email you if a check needs your attention. The checks are planned observations. They are not a promise of continuous monitoring, of a response within a stated number of minutes, or that a suspension or a review will be prevented.

After successful Managed Profile Recovery, you can choose 30 days of Guard for the restored location at no extra charge. The 30 days start when monitoring is activated. We’ll remind you before the period ends. Continuing at £9.99 per month is your choice; we won’t automatically start charging you. The paid-member discount does not apply during this included period.

Contact us to cancel. There is no cancellation fee. Normally, monitoring continues until the end of your paid month and does not renew. If you ask us to stop immediately, we return the unused portion of that month. A separately agreed recovery or review case continues under its own terms.

While paid Guard monitoring is active for a location, you receive 20% off our standard Managed Profile Recovery and Managed Review Protection fees for an eligible new issue at that location. The issue must arise while that paid monitoring is active. A problem that already existed when monitoring started is excluded. The discount does not apply to Guided support, to Guard fees, or to a custom or bulk quotation, and it cannot be combined with another offer. Once we agree a discounted fee for a case, cancelling Guard does not remove that discount. Managed fees still depend on the successful outcome agreed for that case.

## 14. Confidentiality and personal information

Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.

Our privacy notice explains how we handle personal information. The notice does not replace this clause.

## 15. Intellectual property

We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.

When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.

We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.

## 16. Liability

Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.

Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.

Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.

## 17. Complaints

Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.

## 18. Termination

You may end a service before substantive case-specific work begins. A Guided fee already paid is then refunded in full under section 5. You may cancel Relaunch Guard under section 13.

Either of us may end a service order by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.

Ending one service order does not end a different service order. Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.

## 19. Governing law and disputes

This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.

Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.

A dispute about whether a Managed outcome met the success criteria is first handled under section 10. Either of us may still bring a claim.

## 20. Other terms

We will change this agreement for an order you have already accepted only by agreeing a new version with you. A change of our published prices or website wording does not change a version you have already accepted.

If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.

This agreement and the accepted quotation are the whole agreement between us for the paid service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.

A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.$psabody$,
  'SOLICITOR_REVIEW',
  false
);

CREATE FUNCTION public.confirm_paid_service_agreement_v1(
  p_actor uuid, p_version text, p_hash text, p_statement text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  cat public.paid_service_agreement_catalogue;
  expected text;
BEGIN
  IF p_actor IS NULL OR p_version IS NULL OR p_hash IS NULL OR p_statement IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO cat FROM public.paid_service_agreement_catalogue WHERE version_id = p_version FOR UPDATE;
  IF cat.version_id IS NULL THEN RETURN jsonb_build_object('status', 'unknown_version'); END IF;
  expected := 'Solicitor reviewed paid-service agreement ' || cat.version_id || ' with SHA-256 ' || cat.content_hash || '.';
  IF p_hash IS DISTINCT FROM cat.content_hash OR p_statement IS DISTINCT FROM expected THEN
    RETURN jsonb_build_object('status', 'confirmation_mismatch');
  END IF;
  IF cat.operative THEN
    RETURN jsonb_build_object('status', 'already_confirmed', 'version', cat.version_id, 'hash', cat.content_hash, 'operative', true);
  END IF;
  UPDATE public.paid_service_agreement_catalogue
    SET status = 'APPROVED', operative = true, solicitor_confirmed_at = now(), solicitor_statement = expected
    WHERE version_id = cat.version_id AND operative = false;
  INSERT INTO public.paid_service_agreement_events(version_id, event, actor_id, details)
  VALUES (cat.version_id, 'SOLICITOR_CONFIRMED', p_actor, jsonb_build_object('hash', cat.content_hash));
  RETURN jsonb_build_object('status', 'confirmed', 'version', cat.version_id, 'hash', cat.content_hash, 'operative', true);
END; $$;

CREATE FUNCTION public.accept_paid_service_terms_v1(p_token_hash text, p_request uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions;
  a public.customer_actions;
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
  purpose text := 'I confirm that I am acting for the business named on this quotation and that I am authorised to bind it for the location on this quotation.';
  managed_text text := 'I acknowledge that the Managed success fee is payable only after documented success, within 14 calendar days of the invoice. No card is charged automatically and the fee is not collected before that documented success.';
  guard_text text := 'I authorise monthly billing for Relaunch Guard for this exact location at the accepted monthly amount until cancelled under the agreed cancellation terms. This consent covers only this location and this accepted price. Opening a link or verifying a one-time code is not acceptance.';
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 8192
  THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL OR a.kind <> 'QUOTE_ACCEPTANCE' OR sess.auth_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorised');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = a.customer_id AND m.business_id = a.business_id AND m.status = 'verified'
  ) THEN RETURN jsonb_build_object('status', 'membership_unverified'); END IF;
  IF a.expires_at <= now() THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  IF p_data->>'quoteVersionId' IS NULL OR p_data->>'quoteVersionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF (p_data->>'quoteVersionId')::uuid IS DISTINCT FROM a.quote_version_id THEN
    SELECT customer_id INTO other_customer FROM public.quote_versions WHERE id = (p_data->>'quoteVersionId')::uuid;
    IF other_customer IS NOT NULL AND other_customer IS DISTINCT FROM a.customer_id THEN
      RETURN jsonb_build_object('status', 'cross_customer');
    END IF;
    RETURN jsonb_build_object('status', 'stale_quotation');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id FOR UPDATE;
  SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
  IF qv.id IS NULL OR qu.id IS NULL OR qv.customer_id IS DISTINCT FROM a.customer_id THEN
    RETURN jsonb_build_object('status', 'cross_customer');
  END IF;
  IF qv.case_id IS NOT NULL THEN
    SELECT customer_id INTO case_customer FROM public.cases WHERE id = qv.case_id;
    IF case_customer IS DISTINCT FROM a.customer_id THEN RETURN jsonb_build_object('status', 'cross_customer'); END IF;
  END IF;
  business := p_data->'businessPurpose';
  terms := p_data->'terms';
  fee := p_data->'feeBasis';
  fp := md5(jsonb_build_array(a.quote_version_id, business, terms, fee)::text);
  SELECT * INTO prev FROM public.paid_service_acceptances WHERE request_id = p_request;
  IF prev.id IS NOT NULL THEN
    IF prev.customer_id IS DISTINCT FROM a.customer_id THEN RETURN jsonb_build_object('status', 'cross_customer'); END IF;
    IF prev.payload_fingerprint IS DISTINCT FROM fp THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    RETURN jsonb_build_object('status', 'replay', 'acceptanceId', prev.id, 'snapshot', admin_private.paid_service_acceptance_snapshot_v1(prev));
  END IF;
  SELECT * INTO prev FROM public.paid_service_acceptances WHERE quote_version_id = qv.id;
  IF prev.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_accepted', 'acceptanceId', prev.id);
  END IF;
  IF a.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  IF qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' OR qu.current_version_id IS DISTINCT FROM qv.id
    OR qv.valid_until IS NULL OR qv.valid_until <= now()
  THEN RETURN jsonb_build_object('status', 'stale_quotation'); END IF;
  IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  SELECT * INTO cat FROM public.paid_service_agreement_catalogue WHERE version_id = 'PS-2026-10-14.2';
  IF cat.version_id IS NULL OR cat.operative IS NOT TRUE OR cat.status IS DISTINCT FROM 'APPROVED' THEN
    RETURN jsonb_build_object('status', 'not_operative');
  END IF;
  IF cat.content_hash IS DISTINCT FROM '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4' THEN
    RETURN jsonb_build_object('status', 'stale_version');
  END IF;
  IF qv.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object('status', 'tax_unconfirmed'); END IF;
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
  quote_result := admin_private.accept_quote_version_v1(a, sess.auth_user_id, p_request);
  IF quote_result->>'status' IS DISTINCT FROM 'success' THEN
    RAISE EXCEPTION 'paid service quote acceptance did not complete' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.paid_service_acceptances(
    request_id, payload_fingerprint, customer_id, business_id, location_id, case_id, customer_action_id,
    quote_id, quote_version_id, quote_acceptance_id, service_order_id, accepted_by_auth_user_id,
    agreement_version, agreement_hash, agreement_body, service_code, payment_model, amount_minor, currency,
    business_purpose_text, business_purpose_accepted_at, terms_accepted_at, fee_basis_kind, fee_basis_text,
    fee_basis_accepted_at, payment_distinction
  ) VALUES (
    p_request, fp, a.customer_id, a.business_id, a.location_id, a.case_id, a.id,
    qu.id, qv.id, (quote_result->>'acceptanceId')::uuid, (quote_result->>'orderId')::uuid, sess.auth_user_id,
    cat.version_id, cat.content_hash, cat.body_text, qv.service_code, qv.payment_model, qv.total_amount_minor, qv.currency,
    purpose, now(), now(), fee_kind, fee_text, CASE WHEN fee_kind IS NULL THEN NULL ELSE now() END, distinction
  ) RETURNING * INTO prev;
  INSERT INTO public.paid_service_agreement_events(version_id, acceptance_id, event, actor_id, details)
  VALUES (cat.version_id, prev.id, 'TERMS_ACCEPTED', sess.auth_user_id, jsonb_build_object('quoteVersionId', qv.id, 'hash', cat.content_hash));
  RETURN jsonb_build_object('status', 'success', 'acceptanceId', prev.id, 'snapshot', admin_private.paid_service_acceptance_snapshot_v1(prev));
END; $$;

CREATE FUNCTION public.paid_service_acceptance_snapshot_v1(p_token_hash text, p_acceptance uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  portal jsonb;
  sess admin_private.customer_action_sessions;
  a public.customer_actions;
  row public.paid_service_acceptances;
  customer uuid;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_acceptance IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorised');
  END IF;
  portal := admin_private.customer_portal_session_v1(p_token_hash);
  IF portal IS NOT NULL THEN
    customer := (portal->>'customerId')::uuid;
  ELSE
    SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
    IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
    SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
    IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
    customer := a.customer_id;
  END IF;
  SELECT * INTO row FROM public.paid_service_acceptances WHERE id = p_acceptance;
  IF row.id IS NULL OR row.customer_id IS DISTINCT FROM customer THEN
    RETURN jsonb_build_object('status', 'unauthorised');
  END IF;
  RETURN admin_private.paid_service_acceptance_snapshot_v1(row);
END; $$;

ALTER TABLE public.paid_service_agreement_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_service_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_service_agreement_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION admin_private.protect_paid_service_catalogue_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_paid_service_acceptance_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_paid_service_events_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.paid_service_acceptance_snapshot_v1(public.paid_service_acceptances) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_paid_service_agreement_v1(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_paid_service_terms_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paid_service_acceptance_snapshot_v1(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_paid_service_agreement_v1(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_paid_service_terms_v1(text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.paid_service_acceptance_snapshot_v1(text, uuid) TO service_role;

COMMIT;
