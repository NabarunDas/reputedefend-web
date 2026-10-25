-- Managed success verification.
-- A success fee is earned only when the accepted agreement's two checks are
-- recorded: the same profile restriction or the same review, absent at two
-- observations at least 48 hours apart, with no recurrence between them.
-- Approval and a new hosted invoice both refuse to proceed without that pair.
-- A saved card is not required and nothing here charges one.
-- Do not apply this file to DEV or Production from the change that adds it.

BEGIN;

CREATE TABLE public.success_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  target_ref text NOT NULL CHECK (char_length(btrim(target_ref)) BETWEEN 1 AND 200),
  restriction_ref text NOT NULL CHECK (char_length(btrim(restriction_ref)) BETWEEN 1 AND 200),
  success_definition text NOT NULL CHECK (char_length(btrim(success_definition)) BETWEEN 10 AND 5000),
  observed_at timestamptz NOT NULL,
  finding text NOT NULL CHECK (finding IN ('ABSENT', 'PRESENT', 'RECURRENCE', 'AMBIGUOUS', 'UNRELATED')),
  review_visibility text NOT NULL CHECK (review_visibility IN ('VISIBLE', 'NOT_APPLICABLE')),
  observer_ref text NOT NULL CHECK (char_length(btrim(observer_ref)) BETWEEN 8 AND 200),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 10 AND 2000),
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (observed_at <= approved_at),
  CHECK (observed_at <= created_at)
);

CREATE INDEX success_observations_order_idx
  ON public.success_observations (service_order_id, observed_at, id);

ALTER TABLE public.success_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.success_observations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION admin_private.success_observations_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'success observations are immutable';
END;
$$;

CREATE TRIGGER success_observations_immutable
  BEFORE UPDATE OR DELETE ON public.success_observations
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_observations_immutable_v1();

CREATE FUNCTION admin_private.success_verification_ready_v1(p_case uuid, p_order uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  ord public.service_orders;
  cs public.cases;
  qv public.quote_versions;
  visibility text;
  absent_count integer;
  distinct_targets integer;
  distinct_restrictions integer;
  distinct_definitions integer;
  first_at timestamptz;
  second_at timestamptz;
  target text;
  restriction text;
BEGIN
  SELECT * INTO ord FROM public.service_orders WHERE id = p_order;
  IF ord.id IS NULL OR ord.case_id IS DISTINCT FROM p_case THEN RETURN false; END IF;
  IF ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE' OR ord.currency IS DISTINCT FROM 'GBP' THEN RETURN false; END IF;
  IF ord.service_code NOT IN ('MANAGED_RELAUNCH', 'MANAGED_REVIEW') THEN RETURN false; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = ord.case_id;
  IF cs.id IS NULL OR cs.customer_id IS DISTINCT FROM ord.customer_id THEN RETURN false; END IF;
  IF ord.service_code = 'MANAGED_RELAUNCH' AND cs.case_type IS DISTINCT FROM 'PROFILE_RECOVERY' THEN RETURN false; END IF;
  IF ord.service_code = 'MANAGED_REVIEW' AND cs.case_type IS DISTINCT FROM 'REVIEW_PROTECTION' THEN RETURN false; END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF qv.id IS NULL THEN RETURN false; END IF;
  IF qv.currency IS DISTINCT FROM 'GBP'
    OR ord.amount_minor IS DISTINCT FROM qv.total_amount_minor
    OR ord.tax_behaviour IS DISTINCT FROM qv.tax_behaviour
    OR ord.tax_amount_minor IS DISTINCT FROM qv.tax_amount_minor
  THEN RETURN false; END IF;
  visibility := CASE WHEN cs.case_type = 'REVIEW_PROTECTION' THEN 'VISIBLE' ELSE 'NOT_APPLICABLE' END;
  SELECT count(*)::integer,
         count(DISTINCT target_ref)::integer,
         count(DISTINCT restriction_ref)::integer,
         count(DISTINCT success_definition)::integer,
         min(observed_at),
         max(observed_at)
    INTO absent_count, distinct_targets, distinct_restrictions, distinct_definitions, first_at, second_at
  FROM public.success_observations
  WHERE case_id = cs.id
    AND customer_id = ord.customer_id
    AND service_order_id = ord.id
    AND finding = 'ABSENT'
    AND review_visibility = visibility
    AND success_definition = qv.success_definition
    AND observed_at <= now()
    AND approved_at >= observed_at;
  IF absent_count IS DISTINCT FROM 2
    OR distinct_targets IS DISTINCT FROM 1
    OR distinct_restrictions IS DISTINCT FROM 1
    OR distinct_definitions IS DISTINCT FROM 1
    OR first_at IS NULL
    OR second_at < first_at + interval '48 hours'
  THEN RETURN false; END IF;
  SELECT target_ref, restriction_ref INTO target, restriction
  FROM public.success_observations
  WHERE case_id = cs.id
    AND customer_id = ord.customer_id
    AND service_order_id = ord.id
    AND finding = 'ABSENT'
    AND review_visibility = visibility
    AND success_definition = qv.success_definition
    AND observed_at <= now()
  ORDER BY observed_at, id
  LIMIT 1;
  IF EXISTS (
    SELECT 1 FROM public.success_observations spoil
    WHERE spoil.case_id = cs.id
      AND spoil.customer_id = ord.customer_id
      AND spoil.service_order_id = ord.id
      AND spoil.target_ref = target
      AND spoil.restriction_ref = restriction
      AND spoil.finding IN ('PRESENT', 'RECURRENCE', 'AMBIGUOUS', 'UNRELATED')
      AND spoil.observed_at <= second_at
  ) THEN RETURN false; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.success_verification_ready_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.success_fee_verification_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT admin_private.success_verification_ready_v1(NEW.case_id, NEW.service_order_id) THEN
    RAISE EXCEPTION 'success_verification:incomplete' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER success_fee_approvals_verification
  BEFORE INSERT ON public.success_fee_approvals
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_fee_verification_guard_v1();

CREATE OR REPLACE FUNCTION public.admin_payment_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  BEGIN
    RETURN admin_private.admin_payment_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'commercial_eligibility:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', split_part(SQLERRM, ':', 2),
        'message', admin_private.commercial_eligibility_message_v1()
      );
    END IF;
    IF SQLERRM LIKE 'gross_price:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', split_part(SQLERRM, ':', 2),
        'message', 'The quoted total is the final customer price. Tax cannot be added on top.'
      );
    END IF;
    IF SQLERRM LIKE 'success_verification:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', 'success_verification',
        'message', 'The success fee stays pending until two observations of the same target are at least 48 hours apart and the original issue is not known to have returned between them.'
      );
    END IF;
    RAISE;
  END;
END; $$;

CREATE OR REPLACE FUNCTION public.payment_prepare_invoice_v1(p_token text, p_obligation uuid, p_livemode boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s jsonb; ob public.payment_obligations; ord public.service_orders; op public.provider_operations;
  att public.payment_attempts; inv public.payment_invoices; n integer; declared text;
BEGIN
  declared := CASE WHEN p_livemode IS NULL THEN NULL WHEN p_livemode THEN 'true' ELSE 'false' END;
  IF NOT admin_private.payment_external_lane_allowed_v1(declared) THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  SELECT * INTO ob FROM public.payment_obligations WHERE id = p_obligation FOR UPDATE;
  IF ob.id IS NULL OR ob.state IN ('PAID','VOID') THEN RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = ob.service_order_id FOR UPDATE;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF ob.tax_behaviour NOT IN ('INCLUSIVE','NOT_APPLICABLE') THEN
    RETURN jsonb_build_object('status','denied','reason','tax_not_issuable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_receipts WHERE obligation_id = ob.id) THEN
    RETURN jsonb_build_object('status','denied','reason','already_paid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_invoices WHERE obligation_id = ob.id AND status = 'PAID') THEN
    RETURN jsonb_build_object('status','denied','reason','already_paid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(ob.id::text, 16));
  IF EXISTS (
    SELECT 1 FROM public.payment_attempts
    WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
      AND purpose IN ('CHECKOUT','OFF_SESSION','RECOVERY')
  ) OR EXISTS (
    SELECT 1 FROM public.provider_operations
    WHERE obligation_id = ob.id AND status IN ('PENDING','SUBMITTED')
      AND kind IN ('CREATE_CHECKOUT_SESSION','CREATE_PAYMENT_INTENT','CREATE_RECOVERY_SESSION')
  ) THEN
    RETURN jsonb_build_object('status','denied','reason','active_collection');
  END IF;
  SELECT * INTO inv FROM public.payment_invoices
    WHERE obligation_id = ob.id AND status IN ('DRAFT','ISSUED') ORDER BY created_at ASC LIMIT 1;
  IF inv.id IS NOT NULL THEN
    SELECT * INTO op FROM public.provider_operations WHERE id = inv.provider_operation_id;
    SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = inv.provider_operation_id;
    RETURN jsonb_build_object(
      'status','success','replay', inv.status = 'ISSUED', 'providerOperationId', op.id,
      'idempotencyKey', op.idempotency_key, 'attemptId', att.id, 'invoiceId', inv.id,
      'amountMinor', inv.amount_minor, 'currency', inv.currency, 'taxBehaviour', inv.tax_behaviour,
      'hostedInvoiceUrl', inv.hosted_invoice_url, 'providerInvoiceId', inv.provider_invoice_id,
      'customerId', inv.customer_id, 'serviceOrderId', inv.service_order_id, 'obligationId', inv.obligation_id,
      'orderRef', ord.public_ref
    );
  END IF;
  IF ob.kind = 'SUCCESS_FEE' AND NOT admin_private.success_verification_ready_v1(ord.case_id, ord.id) THEN
    RETURN jsonb_build_object('status','denied','reason','success_verification');
  END IF;
  INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
  VALUES (extensions.gen_random_uuid(), 'CREATE_INVOICE', 'INVOICE', ob.customer_id, ob.service_order_id, ob.id, 'PENDING')
  RETURNING * INTO op;
  SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = ob.id;
  INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
  VALUES (ob.id, ob.service_order_id, op.id, n, 'INVOICE', 'CREATED', ob.amount_minor, ob.currency)
  RETURNING * INTO att;
  INSERT INTO public.payment_invoices(
    obligation_id, service_order_id, customer_id, provider_operation_id, amount_minor, currency,
    tax_behaviour, tax_amount_minor, status
  ) VALUES (
    ob.id, ob.service_order_id, ob.customer_id, op.id, ob.amount_minor, ob.currency,
    ob.tax_behaviour, ob.tax_amount_minor, 'DRAFT'
  ) RETURNING * INTO inv;
  RETURN jsonb_build_object(
    'status','success','replay', false, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
    'attemptId', att.id, 'invoiceId', inv.id, 'amountMinor', inv.amount_minor, 'currency', inv.currency,
    'taxBehaviour', inv.tax_behaviour, 'customerId', inv.customer_id, 'serviceOrderId', inv.service_order_id,
    'obligationId', inv.obligation_id, 'orderRef', ord.public_ref
  );
END; $$;

CREATE FUNCTION public.admin_success_verification_v1(p_token text, p_orders uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  ready uuid[];
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_orders IS NULL OR cardinality(p_orders) > 50 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT coalesce(array_agg(ord.id), '{}') INTO ready
  FROM public.service_orders ord
  WHERE ord.id = ANY (p_orders)
    AND admin_private.success_verification_ready_v1(ord.case_id, ord.id);
  RETURN jsonb_build_object('status', 'success', 'ready', to_jsonb(ready));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_success_verification_v1(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_success_verification_v1(text, uuid[]) TO service_role;

CREATE FUNCTION public.admin_record_success_observation_v1(p_token text, p_request uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  ord public.service_orders;
  cs public.cases;
  qv public.quote_versions;
  existing public.success_observations;
  observed timestamptz;
  finding text;
  visibility text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO existing FROM public.success_observations WHERE request_id = p_request;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true);
  END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(p_payload->>'serviceOrderId', '')::uuid FOR UPDATE;
  IF ord.id IS NULL OR ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE' OR ord.currency IS DISTINCT FROM 'GBP' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = ord.case_id;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF cs.id IS NULL OR qv.id IS NULL OR cs.customer_id IS DISTINCT FROM ord.customer_id THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF ord.service_code = 'MANAGED_RELAUNCH' AND cs.case_type IS DISTINCT FROM 'PROFILE_RECOVERY' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF ord.service_code = 'MANAGED_REVIEW' AND cs.case_type IS DISTINCT FROM 'REVIEW_PROTECTION' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF ord.service_code NOT IN ('MANAGED_RELAUNCH', 'MANAGED_REVIEW') THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  BEGIN observed := NULLIF(p_payload->>'observedAt', '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
  finding := p_payload->>'finding';
  IF observed IS NULL OR observed > now() OR finding NOT IN ('ABSENT', 'PRESENT', 'RECURRENCE', 'AMBIGUOUS', 'UNRELATED') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF char_length(btrim(coalesce(p_payload->>'targetRef', ''))) NOT BETWEEN 1 AND 200
    OR char_length(btrim(coalesce(p_payload->>'restrictionRef', ''))) NOT BETWEEN 1 AND 200
    OR char_length(btrim(coalesce(p_payload->>'observerRef', ''))) NOT BETWEEN 8 AND 200
    OR char_length(btrim(coalesce(p_payload->>'note', ''))) NOT BETWEEN 10 AND 2000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  visibility := CASE WHEN cs.case_type = 'REVIEW_PROTECTION' THEN 'VISIBLE' ELSE 'NOT_APPLICABLE' END;
  INSERT INTO public.success_observations(
    request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
    observed_at, finding, review_visibility, observer_ref, note, approved_by, approved_at
  ) VALUES (
    p_request, cs.id, ord.customer_id, ord.id,
    btrim(p_payload->>'targetRef'), btrim(p_payload->>'restrictionRef'), qv.success_definition,
    observed, finding, visibility, btrim(p_payload->>'observerRef'), btrim(p_payload->>'note'),
    actor, now()
  ) RETURNING * INTO existing;
  RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_success_observation_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_success_observation_v1(text, uuid, jsonb) TO service_role;

COMMIT;
