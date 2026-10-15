-- COM-13B paid-service acceptance gate.
-- Additive and source-only. Do not apply this file to DEV or Production.
-- It does not move AWS ApprovedMigrationHead and does not enable Stripe,
-- the Customer Portal, Guard or mail automation.
-- It does not rewrite historical quote acceptances, agreement versions or
-- authorisation records. The catalogue stays SOLICITOR_REVIEW until an
-- authenticated operator records evidence for this exact version and hash.

BEGIN;

ALTER TABLE public.quote_versions
  ADD COLUMN commercial_agreement_version text,
  ADD COLUMN commercial_agreement_hash text,
  ADD CONSTRAINT quote_versions_commercial_agreement_pair CHECK (
    (commercial_agreement_version IS NULL AND commercial_agreement_hash IS NULL)
    OR (
      commercial_agreement_version = 'PS-2026-10-14.2'
      AND commercial_agreement_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4'
    )
  );

ALTER TABLE public.paid_service_acceptances
  ADD COLUMN quotation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.paid_service_acceptances
  ALTER COLUMN quotation_snapshot DROP DEFAULT;
ALTER TABLE public.paid_service_acceptances
  ADD CONSTRAINT paid_service_acceptances_quotation_snapshot_object
  CHECK (jsonb_typeof(quotation_snapshot) = 'object');

CREATE TABLE public.paid_service_agreement_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  version_id text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  evidence_reference text NOT NULL CHECK (char_length(btrim(evidence_reference)) BETWEEN 20 AND 500),
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  statement text NOT NULL
);

CREATE FUNCTION admin_private.protect_paid_service_approval_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'paid service approval evidence is immutable' USING ERRCODE = '23514';
END; $$;

CREATE TRIGGER paid_service_agreement_approvals_immutable
BEFORE UPDATE OR DELETE ON public.paid_service_agreement_approvals
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_paid_service_approval_v1();

ALTER TABLE public.paid_service_agreement_approvals ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION admin_private.bind_paid_service_quote_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  ver text;
  hash text;
BEGIN
  IF NEW.service_code IN ('GUIDED_RELAUNCH','GUIDED_REVIEW','MANAGED_RELAUNCH','MANAGED_REVIEW','RELAUNCH_GUARD')
    AND (
      (TG_OP = 'INSERT' AND NEW.status = 'OFFERED')
      OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status = 'OFFERED')
    )
  THEN
    SELECT version_id, content_hash INTO ver, hash
    FROM public.paid_service_agreement_catalogue
    WHERE version_id = 'PS-2026-10-14.2';
    IF ver IS NULL OR hash IS NULL THEN
      RAISE EXCEPTION 'Paid-service quotations require the frozen agreement catalogue' USING ERRCODE = 'P0001';
    END IF;
    NEW.commercial_agreement_version := ver;
    NEW.commercial_agreement_hash := hash;
    IF position(ver IN NEW.terms_reference) = 0 THEN
      NEW.terms_reference := left(btrim(NEW.terms_reference) || ' Agreement ' || ver || ' SHA-256 ' || hash || '.', 1000);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER quote_versions_bind_paid_service
BEFORE INSERT OR UPDATE ON public.quote_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.bind_paid_service_quote_v1();

REVOKE ALL ON FUNCTION admin_private.bind_paid_service_quote_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_paid_service_approval_v1() FROM PUBLIC, anon, authenticated, service_role;

-- Private completion of a quote acceptance. Revoked from every caller role.
CREATE FUNCTION admin_private.complete_quote_acceptance_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE qv public.quote_versions; qu public.quotes; acc public.quote_acceptances; ord public.service_orders;
  state text; monitoring_status text; ob public.payment_obligations;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_action.quote_version_id::text, 1));
  SELECT * INTO acc FROM public.quote_acceptances WHERE quote_version_id = p_action.quote_version_id;
  SELECT * INTO ord FROM public.service_orders WHERE quote_version_id = p_action.quote_version_id;
  IF acc.id IS NOT NULL AND ord.id IS NOT NULL THEN
    IF p_action.status = 'OPEN' THEN
      UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'actionStatus', 'COMPLETED', 'acceptanceId', acc.id, 'orderId', ord.id, 'orderRef', ord.public_ref);
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id FOR UPDATE;
  SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
  IF qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' OR qv.valid_until <= now() THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF qv.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  INSERT INTO public.quote_acceptances(
    quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
    total_amount_minor, currency, tax_behaviour, tax_amount_minor
  ) VALUES (
    qu.id, qv.id, p_action.id, p_actor, p_action.expected_email_snapshot,
    qv.total_amount_minor, qv.currency, qv.tax_behaviour, qv.tax_amount_minor
  ) RETURNING * INTO acc;
  UPDATE public.quote_versions SET status = 'ACCEPTED' WHERE id = qv.id;
  UPDATE public.quotes SET status = 'ACCEPTED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id;
  state := CASE qv.payment_model
    WHEN 'UPFRONT' THEN 'ACCEPTED_AWAITING_PAYMENT'
    WHEN 'SUCCESS_FEE' THEN 'ACCEPTED_SUCCESS_FEE'
    ELSE 'ACCEPTED_RECURRING'
  END;
  INSERT INTO public.service_orders(
    public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
    monitoring_request_id, service_code, amount_minor, currency, payment_model, tax_behaviour, tax_rate_bps,
    tax_amount_minor, tax_code, tax_jurisdiction, state, accepted_at
  ) VALUES (
    admin_private.commerce_public_ref_v1('SO'), qu.id, qv.id, acc.id, qv.customer_id, qv.business_id, qv.location_id, qv.case_id,
    qv.monitoring_request_id, qv.service_code, qv.total_amount_minor, qv.currency, qv.payment_model, qv.tax_behaviour,
    qv.tax_rate_bps, qv.tax_amount_minor, qv.tax_code, qv.tax_jurisdiction, state, acc.accepted_at
  ) RETURNING * INTO ord;
  IF ord.payment_model = 'UPFRONT' THEN
    ob := admin_private.create_upfront_obligation_v1(ord);
  END IF;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id;
  INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
  VALUES (qu.id, qv.id, 'CUSTOMER', p_actor, 'QUOTE_ACCEPTED', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id));
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (p_action.id, p_action.case_id, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
    'Customer accepted a quote', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id, 'quoteVersionId', qv.id));
  IF qv.monitoring_request_id IS NOT NULL THEN
    SELECT status INTO monitoring_status FROM public.monitoring_requests WHERE id = qv.monitoring_request_id;
    IF monitoring_status IS DISTINCT FROM monitoring_status THEN NULL; END IF;
  END IF;
  RETURN jsonb_build_object(
    'status', 'success', 'actionStatus', 'COMPLETED', 'acceptanceId', acc.id, 'orderId', ord.id, 'orderRef', ord.public_ref,
    'orderState', ord.state, 'paymentCreated', false, 'invoiceCreated', false, 'monitoringActivated', false,
    'obligationId', ob.id
  );
END; $$;

CREATE OR REPLACE FUNCTION admin_private.accept_quote_version_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  qv public.quote_versions;
  acc public.quote_acceptances;
  ord public.service_orders;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_action.quote_version_id::text, 1));
  SELECT * INTO acc FROM public.quote_acceptances WHERE quote_version_id = p_action.quote_version_id;
  SELECT * INTO ord FROM public.service_orders WHERE quote_version_id = p_action.quote_version_id;
  IF acc.id IS NOT NULL AND ord.id IS NOT NULL THEN
    IF p_action.status = 'OPEN' THEN
      UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'actionStatus', 'COMPLETED', 'acceptanceId', acc.id, 'orderId', ord.id, 'orderRef', ord.public_ref);
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id;
  IF qv.service_code IN ('GUIDED_RELAUNCH','GUIDED_REVIEW','MANAGED_RELAUNCH','MANAGED_REVIEW','RELAUNCH_GUARD') THEN
    RETURN jsonb_build_object('status', 'consent_required');
  END IF;
  RETURN admin_private.complete_quote_acceptance_v1(p_action, p_actor, p_request);
END; $$;

CREATE OR REPLACE FUNCTION admin_private.paid_service_acceptance_snapshot_v1(p public.paid_service_acceptances) RETURNS jsonb
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
    'paymentDistinction', p.payment_distinction,
    'quotationSnapshot', p.quotation_snapshot
  );
$$;

CREATE FUNCTION admin_private.record_paid_service_acceptance_v1(
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
  SELECT * INTO cat FROM public.paid_service_agreement_catalogue WHERE version_id = 'PS-2026-10-14.2';
  IF cat.version_id IS NULL OR cat.operative IS NOT TRUE OR cat.status IS DISTINCT FROM 'APPROVED' THEN
    RETURN jsonb_build_object('status', 'not_operative');
  END IF;
  IF cat.content_hash IS DISTINCT FROM '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4'
    OR qv.commercial_agreement_version IS DISTINCT FROM cat.version_id
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
END; $$;

CREATE FUNCTION admin_private.accept_customer_quote_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid, p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  service text;
  result jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.quote_acceptances WHERE quote_version_id = p_action.quote_version_id)
    AND EXISTS (SELECT 1 FROM public.service_orders WHERE quote_version_id = p_action.quote_version_id)
    AND NOT EXISTS (SELECT 1 FROM public.paid_service_acceptances WHERE quote_version_id = p_action.quote_version_id)
  THEN
    RETURN admin_private.accept_quote_version_v1(p_action, p_actor, p_request);
  END IF;
  SELECT service_code INTO service FROM public.quote_versions WHERE id = p_action.quote_version_id;
  IF service IN ('GUIDED_RELAUNCH','GUIDED_REVIEW','MANAGED_RELAUNCH','MANAGED_REVIEW','RELAUNCH_GUARD') THEN
    result := admin_private.record_paid_service_acceptance_v1(p_action, p_actor, p_request, p_data);
    IF result->>'status' IN ('replay', 'already_accepted') THEN
      result := result || jsonb_build_object('status', 'success');
    ELSIF result->>'status' = 'tax_unconfirmed' THEN
      result := jsonb_build_object('status', 'denied');
    ELSIF result->>'status' IN (
      'unauthorised', 'membership_unverified', 'cross_customer', 'stale_quotation', 'stale_version',
      'not_operative', 'consent_required', 'not_bound'
    ) THEN
      result := jsonb_build_object('status', 'unavailable');
    ELSIF result->>'status' IN (
      'missing_business_purpose', 'missing_terms', 'missing_fee_basis', 'irrelevant_consent',
      'wrong_fee_basis', 'legacy_off_session_consent', 'invalid'
    ) THEN
      result := jsonb_build_object('status', 'invalid');
    END IF;
    RETURN result;
  END IF;
  RETURN admin_private.accept_quote_version_v1(p_action, p_actor, p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_paid_service_agreement_v1(
  p_actor uuid, p_version text, p_hash text, p_statement text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN jsonb_build_object('status', 'unauthorised');
END; $$;

CREATE FUNCTION public.admin_confirm_paid_service_agreement_v1(
  p_token text, p_request uuid, p_evidence text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  actor uuid;
  cat public.paid_service_agreement_catalogue;
  prior public.paid_service_agreement_approvals;
  expected text;
  evidence text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL OR s->>'userId' IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  actor := (s->>'userId')::uuid;
  evidence := btrim(coalesce(p_evidence, ''));
  IF p_request IS NULL OR char_length(evidence) NOT BETWEEN 20 AND 500 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO cat FROM public.paid_service_agreement_catalogue WHERE version_id = 'PS-2026-10-14.2' FOR UPDATE;
  IF cat.version_id IS NULL THEN RETURN jsonb_build_object('status', 'unknown_version'); END IF;
  expected := 'Solicitor reviewed paid-service agreement ' || cat.version_id || ' with SHA-256 ' || cat.content_hash || '.';
  IF evidence = expected OR evidence = cat.content_hash OR evidence = cat.version_id THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO prior FROM public.paid_service_agreement_approvals WHERE request_id = p_request;
  IF prior.id IS NOT NULL THEN
    IF prior.approved_by IS DISTINCT FROM actor OR prior.evidence_reference IS DISTINCT FROM evidence THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'replay', 'version', prior.version_id, 'hash', prior.content_hash, 'operative', cat.operative);
  END IF;
  IF cat.operative THEN
    RETURN jsonb_build_object('status', 'already_confirmed', 'version', cat.version_id, 'hash', cat.content_hash, 'operative', true);
  END IF;
  INSERT INTO public.paid_service_agreement_approvals(request_id, version_id, content_hash, evidence_reference, approved_by, statement)
  VALUES (p_request, cat.version_id, cat.content_hash, evidence, actor, expected);
  UPDATE public.paid_service_agreement_catalogue
    SET status = 'APPROVED', operative = true, solicitor_confirmed_at = now(), solicitor_statement = expected
    WHERE version_id = cat.version_id AND operative = false;
  INSERT INTO public.paid_service_agreement_events(version_id, event, actor_id, details)
  VALUES (cat.version_id, 'SOLICITOR_CONFIRMED', actor, jsonb_build_object('hash', cat.content_hash, 'evidenceReference', evidence));
  RETURN jsonb_build_object('status', 'confirmed', 'version', cat.version_id, 'hash', cat.content_hash, 'operative', true);
END; $$;

CREATE OR REPLACE FUNCTION public.accept_paid_service_terms_v1(p_token_hash text, p_request uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions;
  a public.customer_actions;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 8192
  THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL OR a.kind <> 'QUOTE_ACCEPTANCE' OR sess.auth_user_id IS NULL OR a.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'unauthorised');
  END IF;
  RETURN admin_private.record_paid_service_acceptance_v1(a, sess.auth_user_id, p_request, p_data);
END; $$;

REVOKE ALL ON FUNCTION admin_private.complete_quote_acceptance_v1(public.customer_actions, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.record_paid_service_acceptance_v1(public.customer_actions, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.accept_customer_quote_v1(public.customer_actions, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.paid_service_acceptance_snapshot_v1(public.paid_service_acceptances) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_confirm_paid_service_agreement_v1(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_paid_service_agreement_v1(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION admin_private.protect_quote_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    IF NEW.standard_amount_minor IS DISTINCT FROM OLD.standard_amount_minor
      OR NEW.discount_amount_minor IS DISTINCT FROM OLD.discount_amount_minor
      OR NEW.quoted_subtotal_minor IS DISTINCT FROM OLD.quoted_subtotal_minor
      OR NEW.tax_amount_minor IS DISTINCT FROM OLD.tax_amount_minor
      OR NEW.total_amount_minor IS DISTINCT FROM OLD.total_amount_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
      OR NEW.tax_rate_bps IS DISTINCT FROM OLD.tax_rate_bps
      OR NEW.tax_code IS DISTINCT FROM OLD.tax_code
      OR NEW.tax_jurisdiction IS DISTINCT FROM OLD.tax_jurisdiction
      OR NEW.discount_bps IS DISTINCT FROM OLD.discount_bps
      OR NEW.discount_policy_id IS DISTINCT FROM OLD.discount_policy_id
      OR NEW.discount_snapshot_id IS DISTINCT FROM OLD.discount_snapshot_id
      OR NEW.price_version_id IS DISTINCT FROM OLD.price_version_id
      OR NEW.service_code IS DISTINCT FROM OLD.service_code
      OR NEW.service_name IS DISTINCT FROM OLD.service_name
      OR NEW.payment_model IS DISTINCT FROM OLD.payment_model
      OR NEW.scope_text IS DISTINCT FROM OLD.scope_text
      OR NEW.exclusions_text IS DISTINCT FROM OLD.exclusions_text
      OR NEW.success_definition IS DISTINCT FROM OLD.success_definition
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.monitoring_request_id IS DISTINCT FROM OLD.monitoring_request_id
      OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
      OR NEW.payment_timing_text IS DISTINCT FROM OLD.payment_timing_text
      OR NEW.terms_reference IS DISTINCT FROM OLD.terms_reference
      OR NEW.commercial_agreement_version IS DISTINCT FROM OLD.commercial_agreement_version
      OR NEW.commercial_agreement_hash IS DISTINCT FROM OLD.commercial_agreement_hash
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN RAISE EXCEPTION 'Offered or accepted quote versions are immutable'; END IF;
    IF OLD.status IN ('ACCEPTED') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Accepted quote versions cannot change status';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_commercial_apply_v1(
  p_action_id uuid,
  p_actor uuid,
  p_request uuid,
  p_fingerprint text,
  p_operation text,
  p_data jsonb,
  p_channel text,
  p_customer uuid,
  p_case uuid,
  p_bound_email text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $apply$
DECLARE
  a public.customer_actions;
  v public.agreement_versions;
  auth public.authorization_records;
  qv public.quote_versions;
  qu public.quotes;
  cached jsonb;
  result jsonb;
  existing_auth uuid;
  detail_source text;
BEGIN
  IF p_action_id IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_fingerprint IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('accept', 'decline', 'revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
    OR p_channel IS NULL OR p_channel NOT IN ('CUSTOMER_OTP', 'CUSTOMER_PORTAL')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  cached := admin_private.customer_action_receipt_v1(p_actor, p_request, p_fingerprint);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = p_action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_customer IS NOT NULL AND a.customer_id IS DISTINCT FROM p_customer THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_case IS NOT NULL AND a.case_id IS DISTINCT FROM p_case THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_bound_email IS NOT NULL AND lower(a.expected_email_snapshot) IS DISTINCT FROM lower(p_bound_email) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  detail_source := CASE WHEN p_channel = 'CUSTOMER_PORTAL' THEN 'CUSTOMER_PORTAL' ELSE 'CUSTOMER_OTP' END;

  IF p_operation = 'accept' AND a.kind = 'QUOTE_ACCEPTANCE' THEN
    IF p_data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF a.status = 'COMPLETED' OR EXISTS (
      SELECT 1 FROM public.quote_acceptances WHERE quote_version_id = a.quote_version_id
    ) THEN
      result := admin_private.accept_customer_quote_v1(a, p_actor, p_request, p_data);
      INSERT INTO admin_private.customer_action_command_receipts
        VALUES (p_request, p_actor, p_fingerprint, result, now());
      RETURN result;
    END IF;
  END IF;

  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF p_operation IN ('accept', 'decline') AND a.kind = 'QUOTE_ACCEPTANCE' THEN
    IF p_operation = 'accept' THEN
      result := admin_private.accept_customer_quote_v1(a, p_actor, p_request, p_data);
      INSERT INTO admin_private.customer_action_command_receipts
        VALUES (p_request, p_actor, p_fingerprint, result, now());
      RETURN result;
    END IF;
    IF p_channel = 'CUSTOMER_PORTAL' AND p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id FOR UPDATE;
    SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
    IF qv.id IS NULL OR qu.id IS NULL OR qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    UPDATE public.quote_versions SET status = 'DECLINED' WHERE id = qv.id;
    UPDATE public.quotes SET status = 'DECLINED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id;
    UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'CUSTOMER', p_actor, 'QUOTE_DECLINED',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('actionId', a.id, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('actionId', a.id)
      END);
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_DECLINED', jsonb_build_object('kind', 'QUOTE_ACCEPTANCE'));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Customer declined a quote',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('actionId', a.id, 'quoteVersionId', qv.id, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('actionId', a.id, 'quoteVersionId', qv.id)
      END);
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
    INSERT INTO admin_private.customer_action_command_receipts
      VALUES (p_request, p_actor, p_fingerprint, result, now());
    RETURN result;
  END IF;

  IF p_operation IN ('accept', 'decline') AND a.kind = 'AGREEMENT_ACCEPTANCE' THEN
    SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id FOR UPDATE;
    IF v.id IS NULL OR v.case_id IS DISTINCT FROM a.case_id OR v.customer_id IS DISTINCT FROM a.customer_id THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    IF p_operation = 'decline' THEN
      IF p_channel = 'CUSTOMER_PORTAL' AND p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
      INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
      VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_DECLINED',
        CASE WHEN p_channel = 'CUSTOMER_PORTAL'
          THEN jsonb_build_object('kind', v.agreement_kind, 'source', 'CUSTOMER_PORTAL')
          ELSE jsonb_build_object('kind', v.agreement_kind)
        END);
      PERFORM admin_private.write_record_audit_v1(p_actor, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case',
        'Customer declined an agreement action',
        CASE WHEN p_channel = 'CUSTOMER_PORTAL'
          THEN jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id, 'source', 'CUSTOMER_PORTAL')
          ELSE jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id)
        END);
      result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
      INSERT INTO admin_private.customer_action_command_receipts
        VALUES (p_request, p_actor, p_fingerprint, result, now());
      RETURN result;
    END IF;
    IF p_data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT rec.id INTO existing_auth
    FROM public.authorization_records rec
    WHERE rec.case_id = a.case_id AND rec.authorization_kind = v.agreement_kind AND rec.status = 'ACTIVE'
    FOR UPDATE;
    IF existing_auth IS NOT NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    BEGIN
      INSERT INTO public.authorization_records(
        agreement_version_id, case_id, customer_id, business_id, location_id, authorization_kind, status,
        accepted_by_auth_user_id, accepted_email_snapshot, accepted_at, source
      ) VALUES (
        v.id, a.case_id, a.customer_id, a.business_id, a.location_id, v.agreement_kind, 'ACTIVE',
        p_actor, a.expected_email_snapshot, now(), 'CUSTOMER_OTP'
      ) RETURNING * INTO auth;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'conflict');
    END;
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, a.case_id, 'CUSTOMER', p_actor, 'AUTHORIZATION_ACCEPTED',
      jsonb_build_object('source', detail_source, 'actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case',
      'Customer accepted an agreement',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'kind', v.agreement_kind, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'kind', v.agreement_kind)
      END);
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationId', auth.id, 'authorizationStatus', auth.status);
    INSERT INTO admin_private.customer_action_command_receipts
      VALUES (p_request, p_actor, p_fingerprint, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'revoke' AND a.kind = 'AUTHORIZATION_REVOCATION' THEN
    IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id FOR UPDATE;
    IF auth.id IS NULL OR auth.status <> 'ACTIVE' OR auth.case_id IS DISTINCT FROM a.case_id
      OR auth.customer_id IS DISTINCT FROM a.customer_id
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    UPDATE public.authorization_records
      SET status = 'REVOKED', revoked_at = now(), revoked_by = p_actor,
          revocation_reason = 'Customer revoked this authorisation through a verified action.'
      WHERE id = auth.id RETURNING * INTO auth;
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, a.case_id, 'CUSTOMER', p_actor, 'AUTHORIZATION_REVOKED',
      jsonb_build_object('source', detail_source, 'actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case',
      'Customer revoked an authorisation',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id)
      END);
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationStatus', auth.status);
    INSERT INTO admin_private.customer_action_command_receipts
      VALUES (p_request, p_actor, p_fingerprint, result, now());
    RETURN result;
  END IF;

  RETURN jsonb_build_object('status', 'unavailable');
END;
$apply$;

-- Body is returned only when the quote is bound to the approved catalogue row.
-- A missing, mismatched or unapproved agreement returns no row.
CREATE FUNCTION admin_private.paid_service_quote_disclosure_v1(p_version text, p_hash text)
RETURNS TABLE(ready boolean, body text)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT true, c.body_text
  FROM public.paid_service_agreement_catalogue c
  WHERE p_version = 'PS-2026-10-14.2'
    AND p_hash = '0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4'
    AND c.version_id = p_version
    AND c.content_hash = p_hash
    AND c.status = 'APPROVED'
    AND c.operative IS TRUE
    AND char_length(btrim(c.body_text)) > 0;
$$;

REVOKE ALL ON FUNCTION admin_private.paid_service_quote_disclosure_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.customer_portal_quote_view_v1(
  p_case uuid, p_customer uuid, p_email text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path=''
AS $quote$
DECLARE
  qv public.quote_versions;
  qu public.quotes;
  acc public.quote_acceptances;
  ord public.service_orders;
  action_open boolean := false;
  status text := 'unavailable';
  can_accept boolean := false;
  payment_next text := NULL;
  disclosure_ready boolean := false;
  disclosure_body text := NULL;
BEGIN
  SELECT ver.* INTO qv
  FROM public.customer_actions a
  JOIN public.quote_versions ver ON ver.id = a.quote_version_id
  WHERE a.case_id = p_case AND a.customer_id = p_customer AND a.kind = 'QUOTE_ACCEPTANCE'
    AND lower(a.expected_email_snapshot) = lower(p_email)
    AND admin_private.customer_action_eligible_v1(a)
  ORDER BY a.created_at DESC
  LIMIT 1;
  IF qv.id IS NOT NULL THEN action_open := true; END IF;
  IF qv.id IS NULL THEN
    SELECT ver.* INTO qv
    FROM public.quote_acceptances acceptance
    JOIN public.quote_versions ver ON ver.id = acceptance.quote_version_id
    WHERE ver.case_id = p_case AND ver.customer_id = p_customer
    ORDER BY acceptance.accepted_at DESC
    LIMIT 1;
  END IF;
  IF qv.id IS NULL THEN
    SELECT ver.* INTO qv
    FROM public.quote_versions ver
    WHERE ver.case_id = p_case AND ver.customer_id = p_customer AND ver.offered_at IS NOT NULL
      AND ver.status IN ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED')
    ORDER BY ver.offered_at DESC
    LIMIT 1;
  END IF;
  IF qv.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id AND customer_id = p_customer AND case_id = p_case;
  IF qu.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO acc FROM public.quote_acceptances WHERE quote_version_id = qv.id;
  SELECT * INTO ord FROM public.service_orders WHERE quote_version_id = qv.id AND customer_id = p_customer AND case_id = p_case;
  IF acc.id IS NOT NULL AND ord.id IS NOT NULL THEN
    status := 'accepted';
    IF ord.payment_model = 'UPFRONT' THEN payment_next := 'payment';
    ELSIF ord.payment_model = 'SUCCESS_FEE' THEN payment_next := 'setup';
    END IF;
  ELSIF qv.status = 'DECLINED' OR qu.status = 'DECLINED' THEN
    status := 'declined';
  ELSIF qv.status = 'EXPIRED' OR qv.valid_until <= now() THEN
    status := 'expired';
  ELSIF action_open AND qv.status = 'OFFERED' AND qu.status = 'OFFERED' THEN
    status := 'offered';
    can_accept := qv.tax_behaviour <> 'UNCONFIRMED';
  ELSE
    status := 'unavailable';
  END IF;
  IF qv.commercial_agreement_version IS NOT NULL OR qv.commercial_agreement_hash IS NOT NULL THEN
    SELECT disclosed.ready, disclosed.body INTO disclosure_ready, disclosure_body
    FROM admin_private.paid_service_quote_disclosure_v1(qv.commercial_agreement_version, qv.commercial_agreement_hash) disclosed;
    IF disclosure_ready IS NOT TRUE OR disclosure_body IS NULL THEN
      disclosure_ready := false;
      disclosure_body := NULL;
    END IF;
    IF NOT disclosure_ready THEN can_accept := false; END IF;
  END IF;
  RETURN jsonb_build_object(
    'reference', qu.public_ref,
    'serviceName', qv.service_name,
    'scope', qv.scope_text,
    'exclusions', qv.exclusions_text,
    'successDefinition', qv.success_definition,
    'standardAmountMinor', qv.standard_amount_minor,
    'discountAmountMinor', qv.discount_amount_minor,
    'quotedAmountMinor', qv.quoted_subtotal_minor,
    'taxAmountMinor', qv.tax_amount_minor,
    'totalAmountMinor', qv.total_amount_minor,
    'currency', qv.currency,
    'taxBehaviour', qv.tax_behaviour,
    'paymentTiming', qv.payment_timing_text,
    'validUntil', qv.valid_until,
    'termsReference', qv.terms_reference,
    'serviceCode', qv.service_code,
    'paymentModel', qv.payment_model,
    'commercialAgreementVersion', qv.commercial_agreement_version,
    'commercialAgreementHash', qv.commercial_agreement_hash,
    'commercialAgreementBody', disclosure_body,
    'commercialAgreementReady', disclosure_ready,
    'status', status,
    'orderReference', CASE WHEN status = 'accepted' THEN ord.public_ref ELSE NULL END,
    'acceptedAt', CASE WHEN status = 'accepted' THEN acc.accepted_at ELSE NULL END,
    'paymentNext', payment_next,
    'canAccept', can_accept
  );
END;
$quote$;

CREATE OR REPLACE FUNCTION public.customer_portal_service_command_v1(
  p_token_hash text,
  p_request uuid,
  p_reference text,
  p_selector text,
  p_operation text,
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $command$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_case uuid;
  a public.customer_actions;
  v public.agreement_versions;
  fp text;
  cached jsonb;
  legacy_operation text;
  matches integer;
  bound jsonb;
  guard_location uuid;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_reference IS NULL OR p_selector IS NULL OR p_operation IS NULL OR p_data IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
    OR p_operation NOT IN ('accept_quote', 'decline_quote', 'accept_agreement', 'decline_agreement', 'revoke_authorization')
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation = 'accept_agreement' AND p_data IS DISTINCT FROM '{"accepted":true}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'accept_quote' THEN
    IF p_data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF p_data IS DISTINCT FROM '{"accepted":true}'::jsonb AND NOT (
      p_data ? 'businessPurpose' AND p_data ? 'terms' AND p_data ? 'feeBasis'
    ) THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
  END IF;
  IF p_operation IN ('decline_quote', 'decline_agreement', 'revoke_authorization')
    AND p_data IS DISTINCT FROM '{"confirmed":true}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fp := md5(jsonb_build_array(p_reference, p_selector, p_operation, p_data)::text);
  cached := admin_private.customer_action_receipt_v1(v_auth, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT count(*) INTO matches
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF matches <> 1 THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO a
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector
  FOR UPDATE;
  IF a.id IS NULL OR lower(a.expected_email_snapshot) IS DISTINCT FROM lower(v_email) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_operation IN ('accept_quote', 'decline_quote') AND a.kind <> 'QUOTE_ACCEPTANCE' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_operation IN ('accept_agreement', 'decline_agreement') THEN
    SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id;
    IF a.kind <> 'AGREEMENT_ACCEPTANCE' OR v.id IS NULL
      OR v.agreement_kind NOT IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
      OR v.case_id IS DISTINCT FROM v_case OR v.customer_id IS DISTINCT FROM v_customer
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  END IF;
  IF p_operation = 'revoke_authorization' AND a.kind <> 'AUTHORIZATION_REVOCATION' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  legacy_operation := CASE
    WHEN p_operation IN ('accept_quote', 'accept_agreement') THEN 'accept'
    WHEN p_operation IN ('decline_quote', 'decline_agreement') THEN 'decline'
    ELSE 'revoke'
  END;
  bound := p_data;
  IF p_operation = 'accept_quote' AND p_data ? 'businessPurpose' THEN
    bound := p_data || jsonb_build_object('quoteVersionId', a.quote_version_id);
    IF bound->'feeBasis'->>'kind' = 'GUARD_RECURRING_CONSENT_V1' THEN
      SELECT location_id INTO guard_location FROM public.quote_versions WHERE id = a.quote_version_id;
      bound := jsonb_set(bound, '{feeBasis,locationId}', to_jsonb(guard_location::text), true);
    END IF;
  END IF;
  RETURN admin_private.customer_commercial_apply_v1(
    a.id, v_auth, p_request, fp, legacy_operation, bound, 'CUSTOMER_PORTAL', v_customer, v_case, v_email
  );
END;
$command$;

CREATE OR REPLACE FUNCTION public.customer_action_session_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; cs public.cases; b public.businesses; loc public.locations;
  qv public.quote_versions; snap public.quote_discount_snapshots; ord public.service_orders;
  ob public.payment_obligations; consent public.payment_consents; inv public.payment_invoices;
  cov public.guard_coverages; off public.guard_included_offers; sub public.guard_subscriptions;
  gconsent public.guard_recurring_consents; offer public.guard_price_change_offers;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.id IS NULL OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  IF a.agreement_version_id IS NOT NULL THEN SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id; END IF;
  IF a.authorization_id IS NOT NULL THEN SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id; END IF;
  IF a.quote_version_id IS NOT NULL THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id;
    SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = qv.discount_snapshot_id;
  END IF;
  IF a.service_order_id IS NOT NULL THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id;
    SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
    SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id;
    SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = ord.id;
    SELECT * INTO inv FROM public.payment_invoices WHERE id = a.payment_invoice_id;
  END IF;
  IF a.guard_coverage_id IS NOT NULL THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = a.guard_coverage_id;
    SELECT * INTO off FROM public.guard_included_offers WHERE id = a.guard_included_offer_id;
  END IF;
  IF a.guard_subscription_id IS NOT NULL THEN SELECT * INTO sub FROM public.guard_subscriptions WHERE id = a.guard_subscription_id; END IF;
  IF sub.id IS NULL AND a.kind = 'GUARD_SUBSCRIPTION_START' THEN
    SELECT * INTO sub FROM public.guard_subscriptions
      WHERE (coverage_id IS NOT DISTINCT FROM a.guard_coverage_id OR continuation_id IS NOT DISTINCT FROM a.guard_continuation_id)
        AND lifecycle_state NOT IN ('CANCELED','ENDED')
      LIMIT 1;
  END IF;
  IF sub.id IS NOT NULL THEN SELECT * INTO gconsent FROM public.guard_recurring_consents WHERE subscription_id = sub.id; END IF;
  IF a.guard_price_change_offer_id IS NOT NULL THEN SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = a.guard_price_change_offer_id; END IF;
  RETURN jsonb_build_object(
    'actionId', a.id, 'kind', a.kind, 'status', a.status,
    'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
    'caseReference', cs.public_ref, 'businessName', b.display_name, 'locationName', loc.location_name,
    'agreement', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v.id, 'kind', v.agreement_kind, 'title', v.title, 'body', v.body_text, 'scope', v.scope_text, 'versionNumber', v.version_number
    ) END,
    'authorization', CASE WHEN auth.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', auth.id, 'kind', auth.authorization_kind, 'status', auth.status
    ) END,
    'quote', CASE WHEN qv.id IS NULL OR a.quote_version_id IS NULL THEN NULL ELSE jsonb_build_object(
      'versionId', qv.id, 'versionNumber', qv.version_number, 'serviceCode', qv.service_code, 'serviceName', qv.service_name,
      'paymentModel', qv.payment_model, 'scope', qv.scope_text, 'exclusions', qv.exclusions_text,
      'successDefinition', qv.success_definition, 'standardAmountMinor', qv.standard_amount_minor,
      'discountPolicyId', qv.discount_policy_id, 'discountBps', qv.discount_bps, 'discountAmountMinor', qv.discount_amount_minor,
      'discountReason', snap.reason_code, 'quotedSubtotalMinor', qv.quoted_subtotal_minor, 'taxBehaviour', qv.tax_behaviour,
      'taxRateBps', qv.tax_rate_bps, 'taxAmountMinor', qv.tax_amount_minor, 'taxCode', qv.tax_code,
      'taxJurisdiction', qv.tax_jurisdiction, 'totalAmountMinor', qv.total_amount_minor, 'currency', qv.currency,
      'validUntil', qv.valid_until, 'paymentTiming', qv.payment_timing_text, 'termsReference', qv.terms_reference,
      'locationId', qv.location_id, 'commercialAgreementVersion', qv.commercial_agreement_version,
      'commercialAgreementHash', qv.commercial_agreement_hash,
      'commercialAgreementBody', (
        SELECT disclosed.body FROM admin_private.paid_service_quote_disclosure_v1(
          qv.commercial_agreement_version, qv.commercial_agreement_hash
        ) disclosed
      ),
      'commercialAgreementReady', COALESCE((
        SELECT disclosed.ready FROM admin_private.paid_service_quote_disclosure_v1(
          qv.commercial_agreement_version, qv.commercial_agreement_hash
        ) disclosed
      ), false)
    ) END,
    'payment', CASE WHEN ord.id IS NULL THEN NULL ELSE jsonb_build_object(
      'orderId', ord.id, 'orderRef', ord.public_ref, 'serviceCode', ord.service_code, 'amountMinor', ord.amount_minor,
      'currency', ord.currency, 'taxBehaviour', ord.tax_behaviour, 'taxAmountMinor', ord.tax_amount_minor,
      'paymentModel', ord.payment_model, 'successDefinition', qv.success_definition,
      'obligationId', ob.id, 'obligationState', ob.state, 'consentId', consent.id,
      'consentText', admin_private.success_fee_consent_text_v1(), 'consentVersion', 'SUCCESS_FEE_CONSENT_V1',
      'invoiceId', inv.id, 'invoiceStatus', inv.status, 'hostedInvoiceUrl', inv.hosted_invoice_url
    ) END,
    'guard', CASE WHEN cov.id IS NULL THEN NULL ELSE jsonb_build_object(
      'coverageId', cov.id, 'coverageBasis', cov.coverage_basis, 'permissionVersion', 'GUARD_PERMISSION_V1',
      'permissionText', admin_private.guard_permission_text_v1(cov.coverage_basis),
      'includedDays', CASE WHEN cov.coverage_basis = 'INCLUDED' THEN 30 ELSE NULL END,
      'includedOfferId', off.id, 'includedOfferStatus', off.status,
      'includedEndAt', cov.included_end_at
    ) END,
    'subscription', CASE WHEN sub.id IS NULL THEN NULL ELSE jsonb_build_object(
      'subscriptionId', sub.id, 'amountMinor', sub.amount_minor, 'currency', sub.currency, 'frequency', 'MONTHLY',
      'taxBehaviour', sub.tax_behaviour, 'consentVersion', 'GUARD_RECURRING_CONSENT_V1',
      'consentText', admin_private.guard_recurring_consent_text_v1(),
      'cancellationTermsVersion', 'GUARD_CANCELLATION_TERMS_V1',
      'cancellationTermsText', admin_private.guard_cancellation_terms_text_v1(),
      'consentId', gconsent.id, 'locationName', loc.location_name, 'lifecycleState', sub.lifecycle_state,
      'paidThroughAt', (SELECT paid_through_at FROM public.guard_billing WHERE coverage_id = sub.coverage_id),
      'cancelAtPeriodEnd', sub.cancel_at_period_end, 'includedEndAt', cov.included_end_at
    ) END,
    'priceChange', CASE WHEN offer.id IS NULL THEN NULL ELSE jsonb_build_object(
      'offerId', offer.id, 'oldAmountMinor', offer.old_amount_minor, 'newAmountMinor', offer.new_amount_minor,
      'currency', offer.currency, 'effectiveRenewalAt', offer.effective_renewal_at,
      'noticeVersion', offer.notice_version, 'noticeText', offer.notice_text, 'status', offer.status
    ) END
  );
END; $$;

COMMIT;
