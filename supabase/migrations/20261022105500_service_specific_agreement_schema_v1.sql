-- DEV-AGREEMENT-04: additive support for service-specific agreement approval and routing.
-- Defaults to LEGACY mode; this migration alone never activates a proposed agreement.
-- Separate DEV-only owner activation script and evidence are required before any new service-specific offer.
BEGIN;

ALTER TABLE public.paid_service_agreement_catalogue
  ADD COLUMN owner_approved_at timestamptz,
  ADD COLUMN owner_approval_statement text;

ALTER TABLE public.paid_service_agreement_catalogue
  DROP CONSTRAINT paid_service_agreement_catalogue_version_id_check,
  DROP CONSTRAINT paid_service_agreement_catalogue_content_hash_check1,
  DROP CONSTRAINT paid_service_agreement_catalogue_check;

ALTER TABLE public.paid_service_agreement_catalogue
  ADD CONSTRAINT paid_service_agreement_known_pairs_v2 CHECK (
    (version_id='PS-2026-10-14.2' AND content_hash='0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4')
    OR (version_id='PS-2026-10-22.GR' AND content_hash='705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3')
      OR (version_id='PS-2026-10-22.GV' AND content_hash='56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9')
      OR (version_id='PS-2026-10-22.MR' AND content_hash='725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269')
      OR (version_id='PS-2026-10-22.MV' AND content_hash='62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784')
      OR (version_id='PS-2026-10-22.GD' AND content_hash='51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23')
  ),
  ADD CONSTRAINT paid_service_agreement_hash_matches_body_v2 CHECK (
    encode(sha256(convert_to(body_text,'UTF8')),'hex')=content_hash
  ),
  ADD CONSTRAINT paid_service_agreement_approval_mode_v2 CHECK (
    (status='SOLICITOR_REVIEW' AND operative=false AND solicitor_confirmed_at IS NULL AND solicitor_statement IS NULL
      AND owner_approved_at IS NULL AND owner_approval_statement IS NULL)
    OR
    (status='APPROVED' AND operative=true AND solicitor_confirmed_at IS NOT NULL
      AND solicitor_statement='Solicitor reviewed paid-service agreement ' || version_id || ' with SHA-256 ' || content_hash || '.'
      AND owner_approved_at IS NULL AND owner_approval_statement IS NULL)
    OR
    (status='APPROVED' AND operative=true AND owner_approved_at IS NOT NULL AND owner_approval_statement IS NOT NULL
      AND char_length(owner_approval_statement) BETWEEN 50 AND 500
      AND solicitor_confirmed_at IS NULL AND solicitor_statement IS NULL)
  );

CREATE TABLE public.paid_service_owner_approvals (
  version_id text PRIMARY KEY REFERENCES public.paid_service_agreement_catalogue(version_id) ON DELETE RESTRICT,
  content_hash text NOT NULL,
  evidence_reference text NOT NULL CHECK (char_length(evidence_reference) BETWEEN 20 AND 500),
  decision_source text NOT NULL CHECK (decision_source='OWNER_DECLARATION_IN_PROJECT_CONVERSATION'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content_hash ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.paid_service_owner_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paid_service_owner_approvals FROM PUBLIC, anon, authenticated;
CREATE TRIGGER paid_service_owner_approvals_immutable
BEFORE UPDATE OR DELETE ON public.paid_service_owner_approvals
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_paid_service_events_v1();

ALTER TABLE public.paid_service_agreement_events
  DROP CONSTRAINT paid_service_agreement_events_event_check;
ALTER TABLE public.paid_service_agreement_events
  ADD CONSTRAINT paid_service_agreement_events_event_v2 CHECK (
    event IN ('SOLICITOR_CONFIRMED','OWNER_APPROVED','TERMS_ACCEPTED')
  );


CREATE TABLE admin_private.paid_service_agreement_routing_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  mode text NOT NULL CHECK (mode IN ('LEGACY','SERVICE_SPECIFIC')),
  activated_at timestamptz,
  CHECK ((mode='LEGACY' AND activated_at IS NULL)
    OR (mode='SERVICE_SPECIFIC' AND activated_at IS NOT NULL))
);
ALTER TABLE admin_private.paid_service_agreement_routing_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.paid_service_agreement_routing_config FROM PUBLIC, anon, authenticated;
INSERT INTO admin_private.paid_service_agreement_routing_config(id,mode) VALUES (true,'LEGACY');

-- Service mapping is fixed by owner approval. A new offer cannot bind another
-- service's contract or silently fall back to the old omnibus.
CREATE FUNCTION admin_private.paid_service_expected_version_v2(p_service_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $map$
  SELECT CASE p_service_code
    WHEN 'GUIDED_RELAUNCH' THEN 'PS-2026-10-22.GR'
    WHEN 'GUIDED_REVIEW' THEN 'PS-2026-10-22.GV'
    WHEN 'MANAGED_RELAUNCH' THEN 'PS-2026-10-22.MR'
    WHEN 'MANAGED_REVIEW' THEN 'PS-2026-10-22.MV'
    WHEN 'RELAUNCH_GUARD' THEN 'PS-2026-10-22.GD'
    ELSE NULL
  END;
$map$;

CREATE OR REPLACE FUNCTION admin_private.bind_paid_service_quote_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $bind$
DECLARE ver text; hash text; routing_mode text;
BEGIN
  IF NEW.service_code IN ('GUIDED_RELAUNCH','GUIDED_REVIEW','MANAGED_RELAUNCH','MANAGED_REVIEW','RELAUNCH_GUARD')
   AND ((TG_OP='INSERT' AND NEW.status='OFFERED')
     OR (TG_OP='UPDATE' AND OLD.status='DRAFT' AND NEW.status='OFFERED')) THEN
    SELECT mode INTO routing_mode FROM admin_private.paid_service_agreement_routing_config WHERE id=true;
    IF routing_mode='LEGACY' THEN
      -- Preserve existing service/quote semantics before a separately authorised DEV activation.
      SELECT c.version_id,c.content_hash INTO ver,hash
      FROM public.paid_service_agreement_catalogue c
      WHERE c.version_id='PS-2026-10-14.2';
    ELSIF routing_mode='SERVICE_SPECIFIC' THEN
      SELECT c.version_id,c.content_hash INTO ver,hash
      FROM public.paid_service_agreement_catalogue c
      WHERE c.version_id=admin_private.paid_service_expected_version_v2(NEW.service_code)
        AND c.operative IS TRUE AND c.status='APPROVED'
        AND encode(sha256(convert_to(c.body_text,'UTF8')),'hex')=c.content_hash;
    ELSE
      RAISE EXCEPTION 'Unknown agreement routing mode' USING ERRCODE='P0001';
    END IF;
    IF ver IS NULL OR hash IS NULL THEN
      RAISE EXCEPTION 'This service requires its own approved, operative agreement' USING ERRCODE='P0001';
    END IF;
    NEW.commercial_agreement_version:=ver;
    NEW.commercial_agreement_hash:=hash;
    -- Old agreement metadata must not appear beside the new one.
    NEW.terms_reference:=left(
      btrim(regexp_replace(coalesce(NEW.terms_reference,''),' Agreement PS-[0-9]{4}-[0-9]{2}-[0-9]{2}[^ ]* SHA-256 [0-9a-f]{64}\.','','g'))
      || ' Agreement ' || ver || ' SHA-256 ' || hash || '.',1000
    );
  END IF;
  RETURN NEW;
END; $bind$;

CREATE OR REPLACE FUNCTION admin_private.paid_service_quote_disclosure_v1(p_version text,p_hash text)
RETURNS TABLE(ready boolean,body text) LANGUAGE sql STABLE SET search_path='' AS $disclose$
  SELECT true,c.body_text
  FROM public.paid_service_agreement_catalogue c
  WHERE c.version_id=p_version AND c.content_hash=p_hash
    AND c.operative IS TRUE AND c.status='APPROVED'
    AND encode(sha256(convert_to(c.body_text,'UTF8')),'hex')=c.content_hash
    AND char_length(btrim(c.body_text))>0;
$disclose$;

ALTER TABLE public.paid_service_acceptances
  DROP CONSTRAINT paid_service_acceptances_agreement_version_check,
  DROP CONSTRAINT paid_service_acceptances_agreement_hash_check;
ALTER TABLE public.paid_service_acceptances
  ADD CONSTRAINT paid_service_acceptances_exact_agreement_v2 CHECK (
    (agreement_version='PS-2026-10-14.2' AND agreement_hash='0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4')
    OR (service_code='GUIDED_RELAUNCH' AND agreement_version='PS-2026-10-22.GR' AND agreement_hash='705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3')
      OR (service_code='GUIDED_REVIEW' AND agreement_version='PS-2026-10-22.GV' AND agreement_hash='56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9')
      OR (service_code='MANAGED_RELAUNCH' AND agreement_version='PS-2026-10-22.MR' AND agreement_hash='725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269')
      OR (service_code='MANAGED_REVIEW' AND agreement_version='PS-2026-10-22.MV' AND agreement_hash='62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784')
      OR (service_code='RELAUNCH_GUARD' AND agreement_version='PS-2026-10-22.GD' AND agreement_hash='51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23')
  );

-- Preserve all existing acceptance idempotency, customer/tenant gates,
-- business authority/identity, quote integrity, fee-basis and money gates.
CREATE OR REPLACE FUNCTION admin_private.record_paid_service_acceptance_body_v1(p_action customer_actions, p_actor uuid, p_request uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $acceptance_fn$
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
  SELECT * INTO cat FROM public.paid_service_agreement_catalogue WHERE version_id = qv.commercial_agreement_version;
  IF cat.version_id IS NULL OR cat.operative IS NOT TRUE OR cat.status IS DISTINCT FROM 'APPROVED' THEN
    RETURN jsonb_build_object('status', 'not_operative');
  END IF;
  IF (
    cat.version_id IS DISTINCT FROM 'PS-2026-10-14.2'
    AND cat.version_id IS DISTINCT FROM admin_private.paid_service_expected_version_v2(qv.service_code)
  ) OR qv.commercial_agreement_version IS DISTINCT FROM cat.version_id
    OR qv.commercial_agreement_hash IS DISTINCT FROM cat.content_hash
  THEN RETURN jsonb_build_object('status', 'stale_version'); END IF;
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
END; $acceptance_fn$
;

DO $verify_schema$
BEGIN
  IF (SELECT count(*) FROM public.paid_service_agreement_catalogue) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.paid_service_agreement_catalogue
      WHERE version_id='PS-2026-10-14.2' AND content_hash='0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4')
  THEN RAISE EXCEPTION 'Legacy catalogue changed during schema preparation'; END IF;
  IF (SELECT mode FROM admin_private.paid_service_agreement_routing_config WHERE id=true) IS DISTINCT FROM 'LEGACY'
  THEN RAISE EXCEPTION 'New agreement routing was activated without separate approval'; END IF;
END; $verify_schema$;
COMMIT;
