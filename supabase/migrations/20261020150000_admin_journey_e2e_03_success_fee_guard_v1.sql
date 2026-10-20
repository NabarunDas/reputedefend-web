BEGIN;

-- ADMIN-JOURNEY-E2E-03. Not applied to DEV (rmzozuiamjcclvtgutgd) or Production (cxwwekdzkkjjbiyofrov).
-- Do not apply this migration from the pull request. Independent review applies it to DEV only.
-- Do not replay 20261020120000 or any earlier applied migration.
-- approve_success_fee denies a missing or non-qualifying outcome before the approval insert.
-- qualifying_success_outcome_v1 returns null when cases.outcome is null. IF NOT null does not enter.
-- IS NOT TRUE fails closed for both null and false, so the command returns denied and writes nothing.
-- Accepted quote, evidence, reauth, version, idempotency, amount and billing branches are unchanged.
-- CREATE OR REPLACE keeps the existing privileges. The private function stays revoked from
-- PUBLIC, anon, authenticated and service_role.

CREATE OR REPLACE FUNCTION admin_private.admin_payment_command_core_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb;
  ord public.service_orders; ob public.payment_obligations; qv public.quote_versions; cs public.cases;
  action public.customer_actions; prep text; expires timestamptz; secret text;
  approval public.success_fee_approvals; pm public.saved_payment_methods; inv public.payment_invoices;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN (
      'issue_guided_payment_action','issue_managed_setup_action','issue_recovery_action',
      'approve_success_fee','revoke_action','ensure_customer_map','issue_invoice_fallback'
    ) OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.payment_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  IF p_operation = 'ensure_customer_map' THEN
    INSERT INTO public.stripe_customer_maps(customer_id, stripe_customer_id, livemode)
    VALUES ((data->>'customerId')::uuid, data->>'stripeCustomerId', admin_private.payment_expected_livemode_v1())
    ON CONFLICT (customer_id) DO NOTHING;
    SELECT jsonb_build_object('status','success','id', id, 'stripeCustomerId', stripe_customer_id)
      INTO result FROM public.stripe_customer_maps WHERE customer_id = (data->>'customerId')::uuid;
    INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(data->>'serviceOrderId','')::uuid FOR UPDATE;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_version IS DISTINCT FROM ord.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  IF p_operation = 'issue_guided_payment_action' THEN
    IF ord.payment_model <> 'UPFRONT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO ob FROM public.payment_obligations WHERE service_order_id = ord.id AND kind = 'UPFRONT' AND state <> 'VOID' FOR UPDATE;
    IF ob.id IS NULL OR ob.state = 'PAID' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'GUIDED_PAYMENT');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id,
      'GUIDED_PAYMENT', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_managed_setup_action' THEN
    IF ord.payment_model <> 'SUCCESS_FEE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'MANAGED_PAYMENT_SETUP');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id,
      'MANAGED_PAYMENT_SETUP', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_recovery_action' THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = NULLIF(data->>'obligationId','')::uuid FOR UPDATE;
    IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state <> 'AUTHENTICATION_REQUIRED' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'PAYMENT_RECOVERY');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id,
      'PAYMENT_RECOVERY', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_invoice_fallback' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    SELECT * INTO ob FROM public.payment_obligations WHERE id = NULLIF(data->>'obligationId','')::uuid FOR UPDATE;
    IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state IN ('PAID','VOID') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO inv FROM public.payment_invoices
      WHERE obligation_id = ob.id AND status = 'ISSUED' ORDER BY created_at ASC LIMIT 1;
    IF inv.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'INVOICE_PAYMENT');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id, payment_invoice_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id, inv.id,
      'INVOICE_PAYMENT', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at, 'invoiceId', inv.id);
  ELSIF p_operation = 'approve_success_fee' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    IF ord.payment_model <> 'SUCCESS_FEE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = ord.case_id FOR UPDATE;
    SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
    IF admin_private.qualifying_success_outcome_v1(cs) IS NOT TRUE THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF char_length(btrim(coalesce(data->>'evidenceNote',''))) NOT BETWEEN 10 AND 2000
      OR char_length(btrim(coalesce(data->>'approvalReason',''))) NOT BETWEEN 10 AND 2000
      OR NULLIF(data->>'outcomeEvidenceVersionId','') IS NULL
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.accepted_outcome_evidence_v1(cs.id, (data->>'outcomeEvidenceVersionId')::uuid) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO approval FROM public.success_fee_approvals WHERE service_order_id = ord.id;
    IF approval.id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE success_fee_approval_id = approval.id;
      result := jsonb_build_object('status','success','id', approval.id, 'obligationId', ob.id, 'replay', true);
      INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    SELECT * INTO pm FROM public.saved_payment_methods WHERE service_order_id = ord.id AND status = 'USABLE';
    INSERT INTO public.success_fee_approvals(
      service_order_id, case_id, quote_version_id, outcome, success_definition, outcome_evidence_version_id,
      evidence_note, approval_reason, amount_minor, currency, discount_amount_minor, tax_behaviour, tax_amount_minor,
      payment_method_ready, approved_by
    ) VALUES (
      ord.id, cs.id, qv.id, cs.outcome, qv.success_definition, (data->>'outcomeEvidenceVersionId')::uuid,
      btrim(data->>'evidenceNote'), btrim(data->>'approvalReason'),
      ord.amount_minor, ord.currency, qv.discount_amount_minor, ord.tax_behaviour, ord.tax_amount_minor, pm.id IS NOT NULL, actor
    ) RETURNING * INTO approval;
    INSERT INTO public.payment_obligations(
      service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state,
      amount_minor, currency, tax_behaviour, tax_amount_minor, success_fee_approval_id
    ) VALUES (
      ord.id, ord.quote_id, ord.quote_version_id, ord.customer_id, ord.case_id, 'SUCCESS_FEE', 'DUE',
      ord.amount_minor, ord.currency, ord.tax_behaviour, ord.tax_amount_minor, approval.id
    ) RETURNING * INTO ob;
    PERFORM admin_private.write_payment_ledger_v1(
      ord.customer_id, ord.id, ob.id, 'OBLIGATION_CREATED', ob.amount_minor, ob.currency, NULL, 'ADMIN', actor, 'SUCCESS_FEE_APPROVAL'
    );
    PERFORM admin_private.write_record_audit_v1(actor, 'PAYMENT_CHANGED', 'success', ord.id, p_request, 'payment_obligation',
      'Success fee approved', jsonb_build_object('obligationId', ob.id, 'outcome', cs.outcome));
    result := jsonb_build_object('status','success','id', approval.id, 'obligationId', ob.id);
  ELSIF p_operation = 'revoke_action' THEN
    SELECT * INTO action FROM public.customer_actions WHERE id = NULLIF(data->>'actionId','')::uuid FOR UPDATE;
    IF action.id IS NULL OR action.service_order_id IS DISTINCT FROM ord.id OR action.status <> 'OPEN' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF char_length(btrim(coalesce(data->>'reason',''))) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = action.id RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_REVOKED', jsonb_build_object('reason', data->>'reason'));
    result := jsonb_build_object('status','success','id', action.id);
  ELSE
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;


REVOKE ALL ON FUNCTION admin_private.admin_payment_command_core_v1(text, uuid, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
