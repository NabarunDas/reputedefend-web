-- GUIDED-POSTPAYMENT-HANDOVER-01. Source only.
-- Not applied to DEV (rmzozuiamjcclvtgutgd) or Production (cxwwekdzkkjjbiyofrov).
-- Do not apply this migration from the pull request. Independent review applies it to DEV only.
-- Do not replay 20261027120000 or any earlier applied migration.
-- This file does not name a live case, update an existing case, insert a receipt,
-- change a service order, charge a card, or queue mail.
-- A settled Guided upfront payment hands the case from PAYMENT_REQUIRED to PREPARATION
-- only when admin_private.guided_settlement_reason_v1 is NULL.
-- The commercial order state, including ACCEPTED_AWAITING_PAYMENT, is left unchanged.
-- Handover runs after settlement, inside a nested exception block, so a workflow
-- failure cannot roll back a valid Stripe receipt.
-- An already processed Stripe provider_event_id returns before handover. Replaying
-- that same event does not retry the move and does not create another receipt.
-- A later payment_intent.succeeded or invoice.paid with a different provider_event_id
-- reaches the duplicate-receipt branch and calls the same handover once.
-- checkout.session, payment_failed and setup_intent do not hand the case over.
-- If no later event arrives, service_role calls
-- public.guided_postpayment_reconcile_v1(p_case uuid) for that one case.
-- The automatic actor is SYSTEM. No admin user id is invented for case_work_events.

BEGIN;

CREATE TABLE admin_private.guided_postpayment_handovers (
  case_id uuid PRIMARY KEY REFERENCES public.cases(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL,
  obligation_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  receipt_ref text NOT NULL,
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 80),
  request_id uuid NOT NULL,
  workflow_version_after integer NOT NULL,
  case_event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.guided_postpayment_handover_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 80),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 80),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 180),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX guided_postpayment_handover_failures_open_idx
  ON admin_private.guided_postpayment_handover_failures (case_id, reason)
  WHERE resolved_at IS NULL;

ALTER TABLE admin_private.guided_postpayment_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guided_postpayment_handover_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.guided_postpayment_handovers
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE admin_private.guided_postpayment_handover_failures
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.record_guided_postpayment_failure_v1(
  p_case uuid, p_source text, p_reason text, p_request uuid, p_detail text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE inserted uuid;
BEGIN
  INSERT INTO admin_private.guided_postpayment_handover_failures(
    case_id, source, reason, detail, request_id
  ) VALUES (
    p_case, left(p_source, 80), left(p_reason, 80), left(coalesce(p_detail, ''), 180), p_request
  )
  ON CONFLICT (case_id, reason) WHERE resolved_at IS NULL DO NOTHING
  RETURNING id INTO inserted;
  IF inserted IS NULL THEN RETURN; END IF;
  PERFORM admin_private.write_record_audit_v1(
    NULL, 'CASE_CHANGED', 'denied', p_case, p_request, 'case',
    left('Guided payment handover needs recovery: ' || left(p_reason, 80), 1000),
    jsonb_build_object('source', left(p_source, 80), 'reason', left(p_reason, 80))
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.record_guided_postpayment_failure_v1(uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- One PAYMENT_REQUIRED -> PREPARATION move for a strictly settled Guided upfront order.
-- NULL settlement reason is the only automatic permission. A later stage is left as staff set it.
-- The single payment-stage CUSTOMER FOLLOW_UP created with the case transition is marked DONE.
-- Any other open task, a second payment follow-up, or an open payment, quote or agreement
-- action blocks the move. Those rows stay open for recovery.
CREATE FUNCTION admin_private.guided_postpayment_handover_v1(
  p_case uuid, p_source text, p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.cases;
  ord public.service_orders;
  ob public.payment_obligations;
  receipt public.payment_receipts;
  existing admin_private.guided_postpayment_handovers;
  reason text;
  event_id uuid;
  version_after integer;
  payment_task uuid;
  payment_tasks integer := 0;
  block_reason text;
  staff_action text := 'Prepare the Guided pack for this customer. The upfront payment is already recorded.';
  payment_resolution text := 'The upfront Guided payment is recorded, so this payment follow-up is complete.';
BEGIN
  IF p_case IS NULL OR p_request IS NULL OR p_source IS NULL OR p_source NOT IN (
    'reconcile', 'payment_intent.succeeded', 'payment_intent.succeeded:duplicate',
    'invoice.paid', 'invoice.paid:duplicate'
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing_case');
  END IF;

  SELECT * INTO existing FROM admin_private.guided_postpayment_handovers WHERE case_id = c.id;
  IF existing.case_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_handed_over', 'stage', c.work_stage);
  END IF;

  IF c.service_track IS DISTINCT FROM 'GUIDED' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'not_guided');
  END IF;

  IF c.status IN ('CLOSED', 'CANCELLED') THEN
    PERFORM admin_private.record_guided_postpayment_failure_v1(c.id, p_source, 'closed', p_request, c.status);
    RETURN jsonb_build_object('status', 'denied', 'reason', 'closed');
  END IF;

  IF c.work_stage IS DISTINCT FROM 'PAYMENT_REQUIRED' THEN
    IF c.work_stage IN (
      'PREPARATION', 'READY_TO_SUBMIT', 'SUBMITTED', 'WAITING_GOOGLE',
      'OWNER_ACTION', 'FURTHER_REVIEW', 'OUTCOME_REVIEW', 'FINISHED'
    ) THEN
      RETURN jsonb_build_object('status', 'already_prepared', 'stage', c.work_stage);
    END IF;
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'stage', 'stage', c.work_stage);
  END IF;

  reason := admin_private.guided_settlement_reason_v1(c.id);
  IF reason IS NOT NULL THEN
    PERFORM admin_private.record_guided_postpayment_failure_v1(c.id, p_source, reason, p_request, '');
    RETURN jsonb_build_object('status', 'denied', 'reason', reason);
  END IF;

  SELECT count(*)::integer INTO payment_tasks
  FROM public.case_tasks task
  WHERE task.case_id = c.id
    AND task.status = 'OPEN'
    AND task.owner = 'CUSTOMER'
    AND task.kind = 'FOLLOW_UP'
    AND task.deadline_source = 'Internal follow-up; not a Google deadline'
    AND task.deadline_timezone = 'UTC'
    AND task.reminder_policy = 'MANUAL_QUEUE'
    AND task.title = left(c.next_action, 200)
    AND length(btrim(c.next_action)) >= 3;
  IF payment_tasks = 1 THEN
    SELECT task.id INTO payment_task
    FROM public.case_tasks task
    WHERE task.case_id = c.id
      AND task.status = 'OPEN'
      AND task.owner = 'CUSTOMER'
      AND task.kind = 'FOLLOW_UP'
      AND task.deadline_source = 'Internal follow-up; not a Google deadline'
      AND task.deadline_timezone = 'UTC'
      AND task.reminder_policy = 'MANUAL_QUEUE'
      AND task.title = left(c.next_action, 200)
    FOR UPDATE;
  END IF;
  IF payment_tasks > 1 THEN
    block_reason := 'ambiguous_follow_up';
  ELSIF EXISTS (
    SELECT 1 FROM public.customer_actions action
    WHERE action.case_id = c.id
      AND action.status = 'OPEN'
      AND action.kind IN (
        'GUIDED_PAYMENT', 'PAYMENT_RECOVERY', 'QUOTE_ACCEPTANCE',
        'AGREEMENT_ACCEPTANCE', 'INVOICE_PAYMENT', 'MANAGED_PAYMENT_SETUP'
      )
  ) OR EXISTS (
    SELECT 1 FROM public.case_tasks task
    WHERE task.case_id = c.id AND task.status = 'OPEN' AND task.kind IS DISTINCT FROM 'FOLLOW_UP'
  ) THEN
    block_reason := 'customer_work';
  ELSIF EXISTS (
    SELECT 1 FROM public.case_tasks task
    WHERE task.case_id = c.id
      AND task.status = 'OPEN'
      AND task.id IS DISTINCT FROM payment_task
  ) THEN
    block_reason := 'unrelated_follow_up';
  END IF;
  IF block_reason IS NOT NULL THEN
    PERFORM admin_private.record_guided_postpayment_failure_v1(c.id, p_source, block_reason, p_request, '');
    RETURN jsonb_build_object('status', 'blocked', 'reason', block_reason);
  END IF;

  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id
    AND candidate.customer_id = c.customer_id
    AND candidate.business_id = c.business_id
    AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT'
    AND (candidate.location_id IS NULL OR candidate.location_id = c.location_id);
  SELECT * INTO ob FROM public.payment_obligations obligation
  WHERE obligation.service_order_id = ord.id
    AND obligation.kind = 'UPFRONT'
    AND obligation.state <> 'VOID';
  SELECT * INTO receipt FROM public.payment_receipts WHERE obligation_id = ob.id;

  IF payment_task IS NOT NULL THEN
    UPDATE public.case_tasks
    SET status = 'DONE',
        resolved_at = now(),
        resolution = payment_resolution
    WHERE id = payment_task AND case_id = c.id AND status = 'OPEN';
  END IF;

  UPDATE public.cases
  SET work_stage = 'PREPARATION',
      status = 'UNDER_REVIEW',
      next_action = staff_action,
      next_action_at = NULL
  WHERE id = c.id
  RETURNING workflow_version INTO version_after;

  INSERT INTO public.case_events(case_id, event_type, actor_type, event_data)
  VALUES (
    c.id, 'GUIDED_PAYMENT_HANDOVER', 'SYSTEM',
    jsonb_build_object(
      'source', p_source,
      'from', 'PAYMENT_REQUIRED',
      'to', 'PREPARATION',
      'receiptId', receipt.id,
      'receiptRef', receipt.public_ref,
      'obligationId', ob.id,
      'serviceOrderId', ord.id,
      'orderState', ord.state,
      'paymentFollowUpTaskId', payment_task
    )
  )
  RETURNING id INTO event_id;

  INSERT INTO admin_private.guided_postpayment_handovers(
    case_id, receipt_id, obligation_id, service_order_id, receipt_ref,
    source, request_id, workflow_version_after, case_event_id
  ) VALUES (
    c.id, receipt.id, ob.id, ord.id, receipt.public_ref,
    p_source, p_request, version_after, event_id
  );

  UPDATE admin_private.guided_postpayment_handover_failures
  SET resolved_at = now()
  WHERE case_id = c.id AND resolved_at IS NULL;

  PERFORM admin_private.write_record_audit_v1(
    NULL, 'CASE_CHANGED', 'success', c.id, p_request, 'case',
    'Settled Guided upfront payment handed to preparation.',
    jsonb_build_object(
      'source', p_source,
      'from', 'PAYMENT_REQUIRED',
      'to', 'PREPARATION',
      'receiptRef', receipt.public_ref,
      'obligationId', ob.id,
      'serviceOrderId', ord.id,
      'workflowVersion', version_after,
      'paymentFollowUpTaskId', payment_task
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'stage', 'PREPARATION',
    'workflowVersion', version_after,
    'receiptRef', receipt.public_ref
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.guided_postpayment_handover_v1(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Settlement has already been written when this is called. Expected denials return jsonb.
-- An unexpected exception is recorded and swallowed, including a failure to record it.
CREATE FUNCTION admin_private.isolate_guided_postpayment_handover_v1(p_order uuid, p_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case uuid;
  v_request uuid := gen_random_uuid();
BEGIN
  IF p_order IS NULL OR p_source IS NULL THEN RETURN; END IF;
  SELECT service_order.case_id INTO v_case
  FROM public.service_orders service_order
  WHERE service_order.id = p_order;
  IF v_case IS NULL THEN RETURN; END IF;
  BEGIN
    PERFORM admin_private.guided_postpayment_handover_v1(v_case, p_source, v_request);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      PERFORM admin_private.record_guided_postpayment_failure_v1(
        v_case, p_source, 'exception', v_request, left(SQLERRM, 180)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.isolate_guided_postpayment_handover_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- One explicit case. No scan of other settled cases. No case id is built into the function.
-- service_role may run it. anon and authenticated may not.
CREATE FUNCTION public.guided_postpayment_reconcile_v1(p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF p_case IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid', 'examined', 0, 'handedOver', 0, 'blocked', 0, 'skipped', 0, 'disposition', 'invalid'
    );
  END IF;
  result := admin_private.guided_postpayment_handover_v1(p_case, 'reconcile', gen_random_uuid());
  RETURN jsonb_build_object(
    'status', 'success',
    'examined', 1,
    'handedOver', CASE WHEN result->>'status' = 'success' THEN 1 ELSE 0 END,
    'blocked', CASE WHEN result->>'status' IN ('blocked', 'denied') THEN 1 ELSE 0 END,
    'skipped', CASE WHEN result->>'status' IN ('success', 'blocked', 'denied') THEN 0 ELSE 1 END,
    'disposition', coalesce(result->>'status', 'invalid'),
    'reason', result->>'reason',
    'stage', result->>'stage'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guided_postpayment_reconcile_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guided_postpayment_reconcile_v1(uuid) TO service_role;

-- Guided preparation now uses the strict settlement proof. Managed authorisation is unchanged.
CREATE OR REPLACE FUNCTION admin_private.case_stage_ready_v1(p_case public.cases, p_target text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF p_target = 'PREPARATION' THEN
    IF p_case.service_track = 'GUIDED' THEN
      RETURN admin_private.guided_settlement_reason_v1(p_case.id) IS NULL;
    END IF;
    IF p_case.service_track = 'MANAGED' THEN
      RETURN coalesce((admin_private.case_authorization_readiness_v1(p_case.id)->>'authorizationReady')::boolean, false);
    END IF;
    RETURN false;
  END IF;
  IF p_target = 'READY_TO_SUBMIT' THEN
    IF p_case.service_track = 'GUIDED' THEN
      RETURN admin_private.guided_settlement_reason_v1(p_case.id) IS NULL
        AND admin_private.published_pack_ready_v1(p_case.id);
    END IF;
    IF p_case.service_track = 'MANAGED' THEN
      RETURN coalesce((admin_private.case_authorization_readiness_v1(p_case.id)->>'authorizationReady')::boolean, false)
        AND admin_private.published_pack_ready_v1(p_case.id);
    END IF;
    RETURN false;
  END IF;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION admin_private.case_stage_ready_v1(public.cases, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.payment_apply_provider_event_v1(p_event_id text, p_type text, p_object_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec admin_private.stripe_event_receipts; att public.payment_attempts; ob public.payment_obligations;
  op public.provider_operations; consent public.payment_consents; map public.stripe_customer_maps;
  inv public.payment_invoices; cus text; pmid text; usage text; meta_customer uuid; meta_order uuid; meta_op uuid;
  meta_obligation uuid; pi_status text; amount integer; currency text; financial boolean; has_meta boolean;
  lane_livemode boolean;
BEGIN
  IF p_event_id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  lane_livemode := CASE
    WHEN p_payload ? 'livemode' THEN coalesce((p_payload->>'livemode')::boolean, false)
    ELSE admin_private.payment_expected_livemode_v1()
  END;
  IF NOT admin_private.payment_livemode_accepted_v1(lane_livemode) THEN
    RETURN jsonb_build_object('status','denied','reason','livemode');
  END IF;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id FOR UPDATE;
  IF rec.provider_event_id IS NULL THEN
    INSERT INTO admin_private.stripe_event_receipts(provider_event_id, event_type, provider_object_id, livemode)
    VALUES (p_event_id, left(coalesce(p_type,''), 80), p_object_id, lane_livemode)
    RETURNING * INTO rec;
  ELSIF rec.livemode IS DISTINCT FROM lane_livemode THEN
    RETURN jsonb_build_object('status','denied','reason','livemode');
  END IF;
  IF rec.processed THEN RETURN jsonb_build_object('status','success','duplicate', true); END IF;

  BEGIN meta_op := NULLIF(p_payload->>'providerOperationId','')::uuid; EXCEPTION WHEN OTHERS THEN meta_op := NULL; END;
  BEGIN meta_customer := NULLIF(p_payload->>'customerId','')::uuid; EXCEPTION WHEN OTHERS THEN meta_customer := NULL; END;
  BEGIN meta_order := NULLIF(p_payload->>'serviceOrderId','')::uuid; EXCEPTION WHEN OTHERS THEN meta_order := NULL; END;
  BEGIN meta_obligation := NULLIF(p_payload->>'obligationId','')::uuid; EXCEPTION WHEN OTHERS THEN meta_obligation := NULL; END;
  has_meta := meta_op IS NOT NULL OR meta_customer IS NOT NULL OR meta_order IS NOT NULL OR meta_obligation IS NOT NULL;
  financial := p_type IN (
    'payment_intent.succeeded','payment_intent.payment_failed','payment_intent.requires_action','payment_intent.requires_confirmation',
    'setup_intent.succeeded','invoice.paid'
  );

  SELECT * INTO att FROM public.payment_attempts
    WHERE stripe_checkout_session_id = p_object_id OR stripe_payment_intent_id = p_object_id
    ORDER BY created_at DESC LIMIT 1;
  IF att.id IS NULL AND NULLIF(p_payload->>'paymentIntentId','') IS NOT NULL THEN
    SELECT * INTO att FROM public.payment_attempts WHERE stripe_payment_intent_id = p_payload->>'paymentIntentId';
  END IF;
  IF att.id IS NULL AND meta_op IS NOT NULL THEN
    SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = meta_op;
  END IF;
  IF att.id IS NOT NULL THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = att.obligation_id FOR UPDATE;
    SELECT * INTO op FROM public.provider_operations WHERE id = att.provider_operation_id;
  ELSE
    SELECT * INTO op FROM public.provider_operations
      WHERE provider_object_id = p_object_id OR id = meta_op;
    IF op.obligation_id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = op.obligation_id FOR UPDATE;
      SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id;
    END IF;
  END IF;
  IF inv.id IS NULL AND p_object_id IS NOT NULL THEN
    SELECT * INTO inv FROM public.payment_invoices WHERE provider_invoice_id = p_object_id;
  END IF;
  IF inv.id IS NULL AND meta_op IS NOT NULL THEN
    SELECT * INTO inv FROM public.payment_invoices WHERE provider_operation_id = meta_op;
  END IF;

  IF financial AND att.id IS NULL AND op.id IS NULL AND inv.id IS NULL THEN
    IF has_meta THEN
      RETURN jsonb_build_object('status','unmatched','retryable', true, 'reason', 'correlation_pending');
    END IF;
    UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
    RETURN jsonb_build_object('status','success','ignored', true, 'reason', 'unrelated');
  END IF;

  IF p_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','checkout.session.async_payment_failed') THEN
    IF att.id IS NOT NULL THEN
      UPDATE public.payment_attempts
        SET stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_object_id),
            stripe_payment_intent_id = coalesce(stripe_payment_intent_id, NULLIF(p_payload->>'paymentIntentId',''))
        WHERE id = att.id;
    ELSIF op.id IS NOT NULL AND NULLIF(p_payload->>'setupIntentId','') IS NOT NULL THEN
      UPDATE public.provider_operations
        SET provider_object_id = coalesce(provider_object_id, p_payload->>'setupIntentId'),
            provider_object_type = coalesce(provider_object_type, 'setup_intent')
        WHERE id = op.id AND (provider_object_id IS NULL OR provider_object_type = 'checkout.session');
    END IF;
    IF p_type IN ('checkout.session.expired','checkout.session.async_payment_failed') AND ob.id IS NOT NULL AND ob.state <> 'PAID' THEN
      UPDATE public.payment_attempts SET status = 'FAILED', failed_at = now(),
        failure_category = 'EXPIRED', failure_code = left(p_type, 80)
        WHERE id = att.id AND status IN ('CREATED','SUBMITTED');
      UPDATE public.provider_operations SET status = 'FAILED' WHERE id = op.id AND status NOT IN ('SUCCEEDED','CANCELLED');
    END IF;
  ELSIF p_type = 'payment_intent.succeeded' THEN
    pi_status := coalesce(p_payload->>'paymentIntentStatus', p_payload->>'status', 'succeeded');
    cus := NULLIF(p_payload->>'stripeCustomerId','');
    amount := NULLIF(p_payload->>'amountMinor','')::integer;
    currency := lower(coalesce(NULLIF(p_payload->>'currency',''), 'gbp'));
    IF pi_status IS DISTINCT FROM 'succeeded' THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','denied','reason','not_succeeded');
    END IF;
    IF att.id IS NULL OR ob.id IS NULL OR op.id IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','retryable', true, 'reason', 'correlation_pending');
    END IF;
    SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = ob.customer_id;
    IF (meta_op IS NOT NULL AND meta_op IS DISTINCT FROM op.id)
      OR (meta_customer IS NOT NULL AND meta_customer IS DISTINCT FROM ob.customer_id)
      OR (meta_order IS NOT NULL AND meta_order IS DISTINCT FROM ob.service_order_id)
      OR (meta_obligation IS NOT NULL AND meta_obligation IS DISTINCT FROM ob.id)
      OR (cus IS NOT NULL AND map.stripe_customer_id IS DISTINCT FROM cus)
      OR (amount IS NOT NULL AND amount IS DISTINCT FROM ob.amount_minor)
      OR (currency IS DISTINCT FROM 'gbp')
    THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','denied','reason','payment_mismatch');
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_receipts WHERE obligation_id = ob.id) OR ob.state = 'PAID' THEN
      PERFORM admin_private.isolate_guided_postpayment_handover_v1(ob.service_order_id, 'payment_intent.succeeded:duplicate');
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','success','duplicate', true);
    END IF;
    UPDATE public.payment_attempts SET status = 'SUCCEEDED', succeeded_at = now(), requires_action = false,
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_object_id)
      WHERE id = att.id AND status <> 'SUCCEEDED';
    UPDATE public.payment_obligations SET state = 'PAID' WHERE id = ob.id;
    UPDATE public.provider_operations SET status = 'SUCCEEDED' WHERE id = op.id AND status <> 'SUCCEEDED';
    INSERT INTO public.payment_receipts(
      obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency,
      tax_behaviour, tax_amount_minor, stripe_payment_intent_id, stripe_charge_id, provider_receipt_url
    ) VALUES (
      ob.id, ob.service_order_id, ob.customer_id, att.id, ob.amount_minor, ob.currency,
      ob.tax_behaviour, ob.tax_amount_minor, coalesce(att.stripe_payment_intent_id, p_object_id),
      NULLIF(p_payload->>'chargeId',''), NULLIF(p_payload->>'receiptUrl','')
    ) ON CONFLICT (obligation_id) DO NOTHING;
    PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'PROVIDER_PAYMENT_SUCCEEDED', ob.amount_minor, ob.currency, p_object_id, 'PROVIDER', NULL, p_type);
    PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'RECEIPT_RECORDED', ob.amount_minor, ob.currency, p_object_id, 'SYSTEM', NULL, p_type);
    PERFORM admin_private.complete_payment_action_v1(ob.service_order_id, CASE att.purpose WHEN 'RECOVERY' THEN 'PAYMENT_RECOVERY' WHEN 'INVOICE' THEN 'INVOICE_PAYMENT' ELSE 'GUIDED_PAYMENT' END, p_type);
    PERFORM admin_private.isolate_guided_postpayment_handover_v1(ob.service_order_id, 'payment_intent.succeeded');
  ELSIF p_type = 'invoice.paid' THEN
    IF inv.id IS NULL AND op.id IS NOT NULL THEN
      SELECT * INTO inv FROM public.payment_invoices WHERE provider_operation_id = op.id;
    END IF;
    IF inv.id IS NULL THEN
      IF has_meta THEN RETURN jsonb_build_object('status','unmatched','retryable', true, 'reason', 'correlation_pending'); END IF;
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','success','ignored', true, 'reason', 'unrelated');
    END IF;
    SELECT * INTO ob FROM public.payment_obligations WHERE id = inv.obligation_id FOR UPDATE;
    SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = inv.provider_operation_id;
    SELECT * INTO op FROM public.provider_operations WHERE id = inv.provider_operation_id;
    SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = inv.customer_id;
    amount := coalesce(NULLIF(p_payload->>'amountPaidMinor','')::integer, NULLIF(p_payload->>'amountMinor','')::integer);
    currency := lower(coalesce(NULLIF(p_payload->>'currency',''), 'gbp'));
    cus := NULLIF(p_payload->>'stripeCustomerId','');
    IF (amount IS NOT NULL AND amount IS DISTINCT FROM inv.amount_minor)
      OR currency IS DISTINCT FROM 'gbp'
      OR (cus IS NOT NULL AND map.stripe_customer_id IS DISTINCT FROM cus)
      OR (meta_op IS NOT NULL AND meta_op IS DISTINCT FROM inv.provider_operation_id)
    THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','denied','reason','invoice_mismatch');
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_receipts WHERE obligation_id = ob.id) OR ob.state = 'PAID' THEN
      PERFORM admin_private.isolate_guided_postpayment_handover_v1(ob.service_order_id, 'invoice.paid:duplicate');
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','success','duplicate', true);
    END IF;
    UPDATE public.payment_invoices SET status = 'PAID' WHERE id = inv.id AND status <> 'PAID';
    UPDATE public.payment_obligations SET state = 'PAID' WHERE id = ob.id;
    UPDATE public.provider_operations SET status = 'SUCCEEDED' WHERE id = op.id AND status <> 'SUCCEEDED';
    IF att.id IS NOT NULL THEN
      UPDATE public.payment_attempts SET status = 'SUCCEEDED', succeeded_at = now() WHERE id = att.id AND status <> 'SUCCEEDED';
    END IF;
    INSERT INTO public.payment_receipts(
      obligation_id, service_order_id, customer_id, payment_attempt_id, payment_invoice_id, amount_minor, currency,
      tax_behaviour, tax_amount_minor, provider_receipt_url
    ) VALUES (
      ob.id, ob.service_order_id, ob.customer_id, att.id, inv.id, ob.amount_minor, ob.currency,
      ob.tax_behaviour, ob.tax_amount_minor, coalesce(NULLIF(p_payload->>'hostedInvoiceUrl',''), inv.hosted_invoice_url)
    ) ON CONFLICT (obligation_id) DO NOTHING;
    PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'PROVIDER_PAYMENT_SUCCEEDED', ob.amount_minor, ob.currency, p_object_id, 'PROVIDER', NULL, p_type);
    PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'RECEIPT_RECORDED', ob.amount_minor, ob.currency, p_object_id, 'SYSTEM', NULL, p_type);
    PERFORM admin_private.complete_payment_action_v1(ob.service_order_id, 'INVOICE_PAYMENT', p_type);
    PERFORM admin_private.isolate_guided_postpayment_handover_v1(ob.service_order_id, 'invoice.paid');
  ELSIF p_type = 'setup_intent.succeeded' THEN
    cus := NULLIF(p_payload->>'stripeCustomerId','');
    pmid := NULLIF(p_payload->>'paymentMethodId','');
    usage := coalesce(p_payload->>'usage', '');
    IF pmid IS NULL OR pmid !~ '^pm_[A-Za-z0-9]+$' OR usage IS DISTINCT FROM 'off_session' OR cus IS NULL THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','denied','reason','invalid_setup');
    END IF;
    IF op.id IS NULL AND meta_op IS NOT NULL THEN
      SELECT * INTO op FROM public.provider_operations WHERE id = meta_op;
    END IF;
    IF op.id IS NULL AND has_meta THEN
      RETURN jsonb_build_object('status','unmatched','retryable', true, 'reason', 'correlation_pending');
    END IF;
    IF op.id IS NULL THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','success','ignored', true, 'reason', 'unrelated');
    END IF;
    SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = op.service_order_id;
    SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = op.customer_id;
    IF consent.id IS NULL OR map.stripe_customer_id IS DISTINCT FROM cus
      OR (meta_customer IS NOT NULL AND meta_customer IS DISTINCT FROM op.customer_id)
      OR (meta_order IS NOT NULL AND meta_order IS DISTINCT FROM op.service_order_id)
      OR EXISTS (SELECT 1 FROM public.saved_payment_methods spm WHERE spm.stripe_payment_method_id = pmid AND spm.customer_id IS DISTINCT FROM op.customer_id)
    THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','denied','reason','setup_mismatch');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.saved_payment_methods
      WHERE service_order_id = consent.service_order_id AND stripe_payment_method_id = pmid AND status = 'USABLE'
    ) THEN
      UPDATE public.provider_operations SET status = 'SUCCEEDED' WHERE id = op.id AND status <> 'SUCCEEDED';
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
      RETURN jsonb_build_object('status','success','duplicate', true);
    END IF;
    INSERT INTO public.saved_payment_methods(
      customer_id, service_order_id, consent_id, stripe_customer_id, stripe_payment_method_id,
      brand, last4, exp_month, exp_year, fingerprint, status, verified_at
    ) VALUES (
      consent.customer_id, consent.service_order_id, consent.id, cus, pmid,
      NULLIF(p_payload->>'brand',''), NULLIF(p_payload->>'last4',''),
      NULLIF(p_payload->>'expMonth','')::integer, NULLIF(p_payload->>'expYear','')::integer,
      NULLIF(p_payload->>'fingerprint',''), 'USABLE', now()
    ) ON CONFLICT (service_order_id, stripe_payment_method_id) DO UPDATE SET status = 'USABLE', verified_at = now();
    UPDATE public.provider_operations SET status = 'SUCCEEDED',
      provider_object_id = coalesce(provider_object_id, p_object_id),
      provider_object_type = coalesce(provider_object_type, 'setup_intent')
      WHERE id = op.id;
    PERFORM admin_private.write_payment_ledger_v1(consent.customer_id, consent.service_order_id, NULL, 'SETUP_RECORDED', NULL, NULL, pmid, 'PROVIDER', NULL, p_type);
    PERFORM admin_private.complete_payment_action_v1(consent.service_order_id, 'MANAGED_PAYMENT_SETUP', p_type);
  ELSIF p_type IN ('setup_intent.setup_failed','setup_intent.canceled') THEN
    IF op.id IS NOT NULL THEN
      UPDATE public.provider_operations SET status = 'FAILED' WHERE id = op.id AND status NOT IN ('SUCCEEDED','CANCELLED');
    END IF;
  ELSIF p_type IN ('payment_intent.requires_action','payment_intent.requires_confirmation') THEN
    IF att.id IS NULL AND has_meta THEN
      RETURN jsonb_build_object('status','unmatched','retryable', true, 'reason', 'correlation_pending');
    END IF;
    IF ob.id IS NOT NULL AND ob.state <> 'PAID' THEN
      UPDATE public.payment_attempts SET status = 'REQUIRES_ACTION', requires_action = true,
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_object_id)
        WHERE id = att.id AND status <> 'SUCCEEDED';
      UPDATE public.payment_obligations SET state = 'AUTHENTICATION_REQUIRED' WHERE id = ob.id AND state <> 'PAID';
      UPDATE public.provider_operations SET status = 'SUBMITTED' WHERE id = op.id AND status = 'PENDING';
      PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'AUTHENTICATION_REQUIRED', ob.amount_minor, ob.currency, p_object_id, 'PROVIDER', NULL, p_type);
    END IF;
  ELSIF p_type = 'payment_intent.payment_failed' THEN
    IF att.id IS NULL AND has_meta THEN
      RETURN jsonb_build_object('status','unmatched','retryable', true, 'reason', 'correlation_pending');
    END IF;
    IF ob.id IS NOT NULL AND ob.state <> 'PAID' THEN
      UPDATE public.payment_attempts SET status = 'FAILED', failed_at = now(),
        failure_category = coalesce(NULLIF(p_payload->>'failureCategory',''),'DECLINED'),
        failure_code = left(coalesce(p_payload->>'failureCode',''), 80)
        WHERE id = att.id AND status <> 'SUCCEEDED';
      UPDATE public.payment_obligations SET state = 'FAILED' WHERE id = ob.id AND state <> 'PAID';
      UPDATE public.provider_operations SET status = 'FAILED' WHERE id = op.id AND status NOT IN ('SUCCEEDED','CANCELLED');
      PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'PROVIDER_PAYMENT_FAILED', ob.amount_minor, ob.currency, p_object_id, 'PROVIDER', NULL, p_type);
    END IF;
  END IF;

  UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
  RETURN jsonb_build_object('status','success','duplicate', false);
END; $$;


COMMIT;
