BEGIN;

-- ADMIN-JOURNEY-07. Not applied to DEV or Production.
-- Do not apply this migration from the pull request. Do not edit a quotation.
-- Do not issue a payment link, send email, call Stripe, or mark an obligation paid.
-- Payment stays outstanding until verified settlement and a receipt.
-- The customer Pay action and payment email remain with the existing payment issue.

CREATE FUNCTION admin_private.reconcile_accepted_service_apply_v1(
  p_case uuid,
  p_actor uuid,
  p_source text,
  p_expected_version integer,
  p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.cases;
  ord public.service_orders;
  qu public.quotes;
  qv public.quote_versions;
  acc public.quote_acceptances;
  psa public.paid_service_acceptances;
  ob public.payment_obligations;
  non_guard integer;
  guard_count integer;
  other_quotes integer;
  obligation_count integer;
  v_track text;
  v_target text;
  v_stage text;
  v_hop text;
  v_from text;
  v_pathway text;
  hops text[] := ARRAY[]::text[];
  hop text;
  guided_note text := 'Customer pays the accepted Guided fee through the existing secure payment action.';
  managed_note text := 'Record authorisation for the accepted Managed service. No upfront fee is collected.';
  step_note text := 'Accepted service reconciliation recorded this allowed stage change and does not take a payment.';
  summary_note text := 'Reconciled the case with the accepted service order. The payment is not marked complete.';
  next_text text;
BEGIN
  IF p_case IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_source IS NULL OR p_source NOT IN ('ADMIN', 'ACCEPTANCE') THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'invalid');
  END IF;

  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_found');
  END IF;
  IF c.status IN ('CLOSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'closed');
  END IF;
  IF p_expected_version IS NOT NULL AND c.workflow_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'stale_version');
  END IF;

  SELECT count(*) INTO non_guard
  FROM public.service_orders o
  WHERE o.case_id = c.id AND o.service_code <> 'RELAUNCH_GUARD';
  SELECT count(*) INTO guard_count
  FROM public.service_orders o
  WHERE o.case_id = c.id AND o.service_code = 'RELAUNCH_GUARD';
  IF non_guard = 0 THEN
    IF guard_count > 0 THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'guard_separate');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_found');
  END IF;
  IF non_guard > 1 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'ambiguous_orders');
  END IF;

  SELECT * INTO ord
  FROM public.service_orders o
  WHERE o.case_id = c.id AND o.service_code <> 'RELAUNCH_GUARD';

  v_track := CASE ord.service_code
    WHEN 'GUIDED_RELAUNCH' THEN 'GUIDED'
    WHEN 'GUIDED_REVIEW' THEN 'GUIDED'
    WHEN 'MANAGED_RELAUNCH' THEN 'MANAGED'
    WHEN 'MANAGED_REVIEW' THEN 'MANAGED'
    ELSE NULL
  END;
  IF v_track IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'guard_separate');
  END IF;
  v_target := CASE v_track WHEN 'GUIDED' THEN 'PAYMENT_REQUIRED' ELSE 'AUTHORIZATION_REQUIRED' END;

  SELECT * INTO qu FROM public.quotes WHERE id = ord.quote_id;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  SELECT * INTO acc FROM public.quote_acceptances WHERE id = ord.quote_acceptance_id;
  SELECT * INTO psa FROM public.paid_service_acceptances WHERE service_order_id = ord.id;

  IF qu.id IS NULL OR qv.id IS NULL OR acc.id IS NULL
     OR qu.current_version_id IS DISTINCT FROM qv.id
     OR qu.status IS DISTINCT FROM 'ACCEPTED'
     OR qv.status IS DISTINCT FROM 'ACCEPTED'
     OR qu.case_id IS DISTINCT FROM c.id
     OR qv.case_id IS DISTINCT FROM c.id
     OR ord.case_id IS DISTINCT FROM c.id
     OR ord.customer_id IS DISTINCT FROM c.customer_id
     OR ord.business_id IS DISTINCT FROM c.business_id
     OR ord.location_id IS DISTINCT FROM c.location_id
     OR qu.customer_id IS DISTINCT FROM c.customer_id
     OR qu.business_id IS DISTINCT FROM c.business_id
     OR qu.location_id IS DISTINCT FROM c.location_id
     OR qv.customer_id IS DISTINCT FROM c.customer_id
     OR qv.business_id IS DISTINCT FROM c.business_id
     OR qv.location_id IS DISTINCT FROM c.location_id
     OR qv.service_code IS DISTINCT FROM ord.service_code
     OR qv.payment_model IS DISTINCT FROM ord.payment_model
     OR qv.currency IS DISTINCT FROM ord.currency
     OR ord.currency IS DISTINCT FROM 'GBP'
     OR qv.total_amount_minor IS DISTINCT FROM ord.amount_minor
     OR acc.total_amount_minor IS DISTINCT FROM ord.amount_minor
     OR acc.currency IS DISTINCT FROM ord.currency
     OR acc.quote_id IS DISTINCT FROM qu.id
     OR acc.quote_version_id IS DISTINCT FROM qv.id
     OR ord.amount_minor <= 0
     OR qv.tax_behaviour IS DISTINCT FROM ord.tax_behaviour
     OR acc.tax_behaviour IS DISTINCT FROM ord.tax_behaviour
     OR qv.tax_amount_minor IS DISTINCT FROM ord.tax_amount_minor
     OR acc.tax_amount_minor IS DISTINCT FROM ord.tax_amount_minor
     OR ord.tax_behaviour NOT IN ('NOT_APPLICABLE', 'INCLUSIVE')
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;

  SELECT count(*) INTO other_quotes
  FROM public.quotes other
  WHERE other.case_id = c.id
    AND other.id IS DISTINCT FROM qu.id
    AND other.status IN ('OFFERED', 'ACCEPTED');
  IF other_quotes > 0 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'ambiguous_quotes');
  END IF;

  IF v_track = 'GUIDED' THEN
    IF ord.payment_model IS DISTINCT FROM 'UPFRONT' OR ord.state IS DISTINCT FROM 'ACCEPTED_AWAITING_PAYMENT' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
    END IF;
    SELECT count(*) INTO obligation_count
    FROM public.payment_obligations obligation
    WHERE obligation.service_order_id = ord.id AND obligation.state <> 'VOID';
    IF obligation_count IS DISTINCT FROM 1 THEN
      RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'unmatched_payment');
    END IF;
    SELECT * INTO ob
    FROM public.payment_obligations obligation
    WHERE obligation.service_order_id = ord.id AND obligation.state <> 'VOID';
    IF ob.kind IS DISTINCT FROM 'UPFRONT'
       OR ob.case_id IS DISTINCT FROM c.id
       OR ob.customer_id IS DISTINCT FROM c.customer_id
       OR ob.quote_id IS DISTINCT FROM qu.id
       OR ob.quote_version_id IS DISTINCT FROM qv.id
       OR ob.amount_minor IS DISTINCT FROM ord.amount_minor
       OR ob.currency IS DISTINCT FROM 'GBP'
       OR ob.tax_behaviour IS DISTINCT FROM ord.tax_behaviour
       OR ob.tax_amount_minor IS DISTINCT FROM ord.tax_amount_minor
    THEN
      RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'unmatched_payment');
    END IF;
  ELSE
    IF ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE' OR ord.state IS DISTINCT FROM 'ACCEPTED_SUCCESS_FEE' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payment_obligations obligation
      WHERE obligation.service_order_id = ord.id AND obligation.state <> 'VOID' AND obligation.kind IS DISTINCT FROM 'SUCCESS_FEE'
    ) OR EXISTS (
      SELECT 1 FROM public.payment_obligations obligation
      WHERE obligation.service_order_id = ord.id AND obligation.state <> 'VOID'
        AND (obligation.amount_minor IS DISTINCT FROM ord.amount_minor OR obligation.case_id IS DISTINCT FROM c.id OR obligation.customer_id IS DISTINCT FROM c.customer_id)
    ) THEN
      RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'unmatched_payment');
    END IF;
  END IF;

  IF psa.id IS NULL
     OR psa.case_id IS DISTINCT FROM c.id
     OR psa.customer_id IS DISTINCT FROM c.customer_id
     OR psa.business_id IS DISTINCT FROM c.business_id
     OR psa.location_id IS DISTINCT FROM c.location_id
     OR psa.quote_id IS DISTINCT FROM qu.id
     OR psa.quote_version_id IS DISTINCT FROM qv.id
     OR psa.service_code IS DISTINCT FROM ord.service_code
     OR psa.payment_model IS DISTINCT FROM ord.payment_model
     OR psa.amount_minor IS DISTINCT FROM ord.amount_minor
     OR psa.currency IS DISTINCT FROM 'GBP'
     OR qv.commercial_agreement_version IS DISTINCT FROM psa.agreement_version
     OR qv.commercial_agreement_hash IS DISTINCT FROM psa.agreement_hash
     OR NOT EXISTS (
       SELECT 1 FROM public.paid_service_agreement_catalogue cat
       WHERE cat.version_id = psa.agreement_version
         AND cat.content_hash = psa.agreement_hash
         AND cat.service_code = ord.service_code
         AND cat.status = 'APPROVED'
         AND cat.operative IS TRUE
     )
  THEN
    RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'missing_agreement');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.case_assessments a
    WHERE a.case_id = c.id AND a.status = 'APPROVED'
      AND a.version_number = (SELECT max(version_number) FROM public.case_assessments WHERE case_id = c.id)
  ) THEN
    RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'missing_assessment');
  END IF;
  SELECT service_pathway INTO v_pathway
  FROM public.case_assessments
  WHERE case_id = c.id AND status = 'APPROVED'
  ORDER BY version_number DESC
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM public.case_work_events e
    WHERE e.case_id = c.id AND e.event = 'INTAKE_REVIEW' AND e.details->>'outcome' = 'REVIEWED'
      AND e.id > coalesce((SELECT max(id) FROM public.case_work_events r WHERE r.case_id = c.id AND r.event = 'reopen'), 0)
  ) THEN
    RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'missing_intake');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.case_work_events e
    WHERE e.case_id = c.id AND e.event = 'BUSINESS_VERIFICATION' AND e.details->>'outcome' = 'PRELIMINARY_COMPLETE'
      AND e.id > coalesce((SELECT max(id) FROM public.case_work_events r WHERE r.case_id = c.id AND r.event = 'reopen'), 0)
  ) THEN
    RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'missing_verification');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = c.customer_id AND m.business_id = c.business_id AND m.status = 'revoked'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'revoked_authority');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = c.customer_id AND m.business_id = c.business_id AND m.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'prerequisite', 'reason', 'missing_authority');
  END IF;

  IF c.service_track IN ('GUIDED', 'MANAGED') AND c.service_track IS DISTINCT FROM v_track THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'conflicting_track', 'orderId', ord.id);
  END IF;
  IF c.service_track IS DISTINCT FROM v_track AND EXISTS (
    SELECT 1 FROM public.case_submissions s WHERE s.case_id = c.id
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'submissions_recorded');
  END IF;

  IF c.service_track = v_track AND (
    c.work_stage = v_target
    OR c.work_stage IN ('PREPARATION', 'READY_TO_SUBMIT', 'SUBMITTED', 'WAITING_GOOGLE', 'OWNER_ACTION', 'FURTHER_REVIEW', 'OUTCOME_REVIEW', 'FINISHED')
  ) THEN
    RETURN jsonb_build_object(
      'status', 'success', 'reason', 'already_reconciled', 'id', c.id, 'orderId', ord.id,
      'track', c.service_track, 'stage', c.work_stage, 'serviceCode', ord.service_code
    );
  END IF;

  IF c.work_stage NOT IN ('INITIAL_REVIEW', 'EVIDENCE_COLLECTION', 'ASSESSMENT_READY', 'SERVICE_SELECTION') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'stage_not_reconcilable');
  END IF;

  v_stage := c.work_stage;
  WHILE v_stage IS DISTINCT FROM v_target LOOP
    v_hop := CASE v_stage
      WHEN 'INITIAL_REVIEW' THEN 'ASSESSMENT_READY'
      WHEN 'EVIDENCE_COLLECTION' THEN 'ASSESSMENT_READY'
      WHEN 'ASSESSMENT_READY' THEN 'SERVICE_SELECTION'
      WHEN 'SERVICE_SELECTION' THEN v_target
      ELSE NULL
    END;
    IF v_hop IS NULL OR NOT EXISTS (
      SELECT 1 FROM admin_private.case_transitions t WHERE t.from_stage = v_stage AND t.to_stage = v_hop
    ) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'stage_not_reconcilable');
    END IF;
    hops := hops || v_hop;
    v_stage := v_hop;
    IF coalesce(array_length(hops, 1), 0) > 4 THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'stage_not_reconcilable');
    END IF;
  END LOOP;

  v_from := c.work_stage;
  FOREACH hop IN ARRAY hops LOOP
    next_text := CASE WHEN hop = v_target THEN CASE v_track WHEN 'GUIDED' THEN guided_note ELSE managed_note END ELSE 'Accepted service recorded. The payment or authorisation step follows.' END;
    UPDATE public.cases SET
      service_track = v_track,
      work_stage = hop,
      status = CASE WHEN hop IN ('PAYMENT_REQUIRED', 'AUTHORIZATION_REQUIRED') THEN 'AWAITING_CUSTOMER' ELSE 'UNDER_REVIEW' END,
      next_action = next_text
    WHERE id = c.id;
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
    VALUES (
      c.id, p_actor, 'transition', step_note, 'INTERNAL',
      jsonb_build_object('from', v_from, 'to', hop, 'source', p_source, 'orderId', ord.id, 'reconciled', true)
    );
    v_from := hop;
  END LOOP;

  INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
  VALUES (
    c.id, p_actor, 'reconcile_accepted_service', summary_note, 'INTERNAL',
    jsonb_build_object(
      'from', c.work_stage, 'to', v_target, 'track', v_track, 'serviceCode', ord.service_code,
      'orderId', ord.id, 'source', p_source, 'hops', to_jsonb(hops),
      'assessmentPathway', v_pathway, 'pathwayIsNotTheSelection', true,
      'paymentMarkedPaid', false, 'paymentLinkIssued', false
    )
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'CASE_CHANGED', 'success', c.id, p_request, 'case', summary_note,
    jsonb_build_object(
      'operation', 'reconcile_accepted_service', 'previousVersion', c.workflow_version,
      'orderId', ord.id, 'track', v_track, 'serviceCode', ord.service_code, 'source', p_source
    )
  );

  -- The obligation, quotation, provider operations and customer payment actions are untouched.
  RETURN jsonb_build_object(
    'status', 'success', 'reason', 'reconciled', 'id', c.id, 'orderId', ord.id,
    'track', v_track, 'stage', v_target, 'serviceCode', ord.service_code,
    'fromStage', c.work_stage, 'hops', to_jsonb(hops)
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.reconcile_accepted_service_apply_v1(uuid, uuid, text, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_reconcile_accepted_service_v1(
  p_token text,
  p_request uuid,
  p_case uuid,
  p_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  r admin_private.case_command_receipts;
  fp text;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'invalid');
  END IF;
  fp := md5(jsonb_build_array(p_case, p_version, 'reconcile_accepted_service')::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = (s->>'userId')::uuid AND r.fingerprint = fp THEN
      RETURN r.response;
    END IF;
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'replayed_request');
  END IF;
  result := admin_private.reconcile_accepted_service_apply_v1(p_case, (s->>'userId')::uuid, 'ADMIN', p_version, p_request);
  IF result->>'status' = 'success' THEN
    INSERT INTO admin_private.case_command_receipts(request_id, actor_id, fingerprint, response)
    VALUES (p_request, (s->>'userId')::uuid, fp, result);
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reconcile_accepted_service_v1(text, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_accepted_service_v1(text, uuid, uuid, integer) TO service_role;

-- New acceptances reconcile when the proofs already hold. A refusal leaves the
-- accepted order in place and does not mark the obligation paid.
CREATE OR REPLACE FUNCTION admin_private.record_paid_service_acceptance_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  order_case uuid;
BEGIN
  BEGIN
    result := admin_private.record_paid_service_acceptance_body_v1(p_action, p_actor, p_request, p_data);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'commercial_eligibility:%' THEN
      RETURN jsonb_build_object(
        'status', 'eligibility_blocked',
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
    RAISE;
  END;
  IF result->>'status' = 'success' AND result->>'orderId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    BEGIN
      SELECT case_id INTO order_case FROM public.service_orders WHERE id = (result->>'orderId')::uuid;
      IF order_case IS NOT NULL THEN
        PERFORM admin_private.reconcile_accepted_service_apply_v1(order_case, p_actor, 'ACCEPTANCE', NULL, p_request);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN result;
END;
$$;

COMMIT;
