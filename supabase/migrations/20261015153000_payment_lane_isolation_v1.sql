-- PAY-ENV-01 Stripe lane isolation.
-- Additive and source-only. Do not apply this file to DEV or Production.
-- It does not seed a payment lane, does not call the lane setter, and does
-- not activate Stripe, the Customer Portal, Guard or mail.
-- AWS ApprovedMigrationHead stays at 20261014170000.
-- No row in admin_private.payment_provider_lane means expected livemode is
-- false, which is the current DEV and Production behaviour.
-- A mismatched livemode is rejected. It is never rewritten onto the other lane.
-- COLLECT_PAYMENT no longer prepares an off-session charge. Managed success
-- fees are hosted invoices due 14 days after Stripe finalises them.
-- stripe_live requires an explicit matching database lane. No row stays test.

BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'c'
      AND n.nspname IN ('public', 'admin_private')
      AND pg_get_constraintdef(con.oid) ~ '\(livemode = false\)'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.nspname, r.relname, r.conname);
  END LOOP;
END $$;

CREATE TABLE admin_private.payment_provider_lane (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL CHECK (mode IN ('stripe_test', 'stripe_live')),
  expected_livemode boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_provider_lane_consistent CHECK (
    (mode = 'stripe_test' AND expected_livemode = false)
    OR (mode = 'stripe_live' AND expected_livemode = true)
  )
);

ALTER TABLE admin_private.payment_provider_lane ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.payment_provider_lane FROM PUBLIC, anon, authenticated;

CREATE FUNCTION admin_private.payment_expected_livemode_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT coalesce(
    (SELECT expected_livemode FROM admin_private.payment_provider_lane WHERE singleton),
    false
  );
$$;

CREATE FUNCTION admin_private.payment_livemode_accepted_v1(p_livemode boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT p_livemode IS NOT DISTINCT FROM admin_private.payment_expected_livemode_v1();
$$;

REVOKE ALL ON FUNCTION admin_private.payment_expected_livemode_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_private.payment_livemode_accepted_v1(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_private.payment_expected_livemode_v1() TO service_role;
GRANT EXECUTE ON FUNCTION admin_private.payment_livemode_accepted_v1(boolean) TO service_role;

ALTER TABLE public.stripe_customer_maps ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();
ALTER TABLE public.provider_operations ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();
ALTER TABLE admin_private.stripe_event_receipts ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();
ALTER TABLE public.guard_provider_price_maps ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();
ALTER TABLE public.guard_subscriptions ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();
ALTER TABLE public.guard_subscription_invoices ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();
ALTER TABLE public.guard_refunds ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();
ALTER TABLE public.guard_disputes ALTER COLUMN livemode SET DEFAULT admin_private.payment_expected_livemode_v1();

CREATE FUNCTION admin_private.reject_payment_livemode_mismatch_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF NEW.livemode IS DISTINCT FROM admin_private.payment_expected_livemode_v1() THEN
    RAISE EXCEPTION 'livemode_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.reject_payment_livemode_mismatch_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_private.reject_payment_livemode_mismatch_v1() TO service_role;

CREATE TRIGGER stripe_customer_maps_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.stripe_customer_maps
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();
CREATE TRIGGER provider_operations_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.provider_operations
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();
CREATE TRIGGER stripe_event_receipts_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON admin_private.stripe_event_receipts
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();
CREATE TRIGGER guard_provider_price_maps_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.guard_provider_price_maps
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();
CREATE TRIGGER guard_subscriptions_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.guard_subscriptions
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();
CREATE TRIGGER guard_subscription_invoices_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.guard_subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();
CREATE TRIGGER guard_refunds_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.guard_refunds
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();
CREATE TRIGGER guard_disputes_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.guard_disputes
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();

CREATE OR REPLACE FUNCTION public.payment_receive_stripe_event_v1(p_event_id text, p_type text, p_object_id text, p_livemode boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec admin_private.stripe_event_receipts; incoming boolean;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) < 8 OR p_type IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  incoming := coalesce(p_livemode, false);
  IF NOT admin_private.payment_livemode_accepted_v1(incoming) THEN
    RETURN jsonb_build_object('status','denied','reason','livemode');
  END IF;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id;
  IF rec.provider_event_id IS NOT NULL THEN
    IF rec.livemode IS DISTINCT FROM incoming THEN
      RETURN jsonb_build_object('status','denied','reason','livemode');
    END IF;
    RETURN jsonb_build_object('status','success','duplicate', true);
  END IF;
  INSERT INTO admin_private.stripe_event_receipts(provider_event_id, event_type, provider_object_id, livemode)
  VALUES (p_event_id, left(p_type, 80), p_object_id, incoming)
  RETURNING * INTO rec;
  PERFORM admin_private.enqueue_outbox_v1(
    'process-stripe-event:' || rec.provider_event_id, 'PROCESS_STRIPE_EVENT', 'stripe_event', NULL,
    jsonb_build_object('eventId', rec.provider_event_id, 'eventType', rec.event_type, 'objectId', rec.provider_object_id, 'livemode', rec.livemode), now()
  );
  RETURN jsonb_build_object('status','success','duplicate', false, 'eventId', rec.provider_event_id);
END; $$;

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

CREATE OR REPLACE FUNCTION public.payment_record_customer_map_v1(p_operation uuid, p_stripe_customer_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op public.provider_operations; map public.stripe_customer_maps;
BEGIN
  IF p_operation IS NULL OR p_stripe_customer_id IS NULL OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  SELECT * INTO op FROM public.provider_operations WHERE id = p_operation AND kind = 'CREATE_CUSTOMER' FOR UPDATE;
  IF op.id IS NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
  SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = op.customer_id;
  IF map.id IS NOT NULL AND map.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
    RETURN jsonb_build_object('status','denied','reason','conflicting_customer');
  END IF;
  IF map.id IS NULL THEN
    INSERT INTO public.stripe_customer_maps(customer_id, stripe_customer_id, livemode)
    VALUES (op.customer_id, p_stripe_customer_id, admin_private.payment_expected_livemode_v1())
    RETURNING * INTO map;
  END IF;
  UPDATE public.provider_operations SET status = 'SUCCEEDED',
    provider_object_id = coalesce(provider_object_id, p_stripe_customer_id),
    provider_object_type = coalesce(provider_object_type, 'customer'),
    submitted_at = coalesce(submitted_at, now())
    WHERE id = op.id;
  RETURN jsonb_build_object('status','success','stripeCustomerId', map.stripe_customer_id);
END; $$;

CREATE OR REPLACE FUNCTION public.payment_ensure_customer_map_v1(p_customer uuid, p_stripe_customer_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE map public.stripe_customer_maps;
BEGIN
  IF p_customer IS NULL OR p_stripe_customer_id IS NULL OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = p_customer;
  IF map.id IS NOT NULL AND map.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
    RETURN jsonb_build_object('status','denied','reason','conflicting_customer');
  END IF;
  INSERT INTO public.stripe_customer_maps(customer_id, stripe_customer_id, livemode)
  VALUES (p_customer, p_stripe_customer_id, admin_private.payment_expected_livemode_v1())
  ON CONFLICT (customer_id) DO NOTHING;
  SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = p_customer;
  RETURN jsonb_build_object('status','success','stripeCustomerId', map.stripe_customer_id);
END; $$;

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
    IF NOT admin_private.qualifying_success_outcome_v1(cs) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
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

CREATE OR REPLACE FUNCTION admin_private.guard_apply_invoice_paid_v1(p_sub public.guard_subscriptions, p_payload jsonb, p_object_id text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  inv public.guard_subscription_invoices; period_end timestamptz; amount integer; kind text; coverage uuid;
  previous public.guard_billing; first_paid boolean; qty integer; currency text; price_id text;
  offer public.guard_price_change_offers; map public.guard_provider_price_maps;
BEGIN
  IF p_payload ? 'livemode' AND NOT admin_private.payment_livemode_accepted_v1(coalesce((p_payload->>'livemode')::boolean, false)) THEN
    RETURN jsonb_build_object('status','denied','reason','livemode');
  END IF;
  IF NULLIF(p_payload->>'stripeCustomerId','') IS NULL
    OR NULLIF(p_payload->>'subscriptionId','') IS NULL
    OR NULLIF(p_payload->>'subscriptionItemId','') IS NULL
    OR NULLIF(p_payload->>'priceId','') IS NULL
    OR NULLIF(p_payload->>'quantity','') IS NULL
    OR NULLIF(p_payload->>'currency','') IS NULL
    OR NULLIF(p_payload->>'amountPaidMinor','') IS NULL
  THEN RETURN jsonb_build_object('status','unmatched','reason','missing_financial_fields'); END IF;
  IF NULLIF(p_payload->>'stripeCustomerId','') IS DISTINCT FROM p_sub.stripe_customer_id
    AND p_sub.stripe_customer_id IS NOT NULL
  THEN RETURN jsonb_build_object('status','denied','reason','customer_mismatch'); END IF;
  IF NULLIF(p_payload->>'subscriptionId','') IS DISTINCT FROM p_sub.stripe_subscription_id
    AND p_sub.stripe_subscription_id IS NOT NULL
  THEN RETURN jsonb_build_object('status','denied','reason','subscription_mismatch'); END IF;
  IF p_sub.stripe_subscription_item_id IS NOT NULL
    AND NULLIF(p_payload->>'subscriptionItemId','') IS DISTINCT FROM p_sub.stripe_subscription_item_id
  THEN RETURN jsonb_build_object('status','denied','reason','item_mismatch'); END IF;
  qty := NULLIF(p_payload->>'quantity','')::integer;
  IF qty IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('status','denied','reason','quantity');
  END IF;
  currency := lower(p_payload->>'currency');
  IF currency IS DISTINCT FROM 'gbp' THEN
    RETURN jsonb_build_object('status','denied','reason','currency');
  END IF;
  amount := NULLIF(p_payload->>'amountPaidMinor','')::integer;
  price_id := NULLIF(p_payload->>'priceId','');
  IF amount IS NULL THEN
    RETURN jsonb_build_object('status','unmatched','reason','missing_financial_fields');
  END IF;
  IF price_id IS DISTINCT FROM p_sub.stripe_price_id OR amount IS DISTINCT FROM p_sub.amount_minor THEN
    SELECT * INTO offer FROM public.guard_price_change_offers
      WHERE subscription_id = p_sub.id AND status IN ('ACCEPTED','SCHEDULE_PENDING','SCHEDULED')
      ORDER BY accepted_at DESC NULLS LAST LIMIT 1;
    SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = offer.new_price_version_id;
    IF offer.id IS NULL OR map.stripe_price_id IS DISTINCT FROM price_id OR offer.new_amount_minor IS DISTINCT FROM amount THEN
      RETURN jsonb_build_object('status','denied','reason','price_mismatch');
    END IF;
    p_sub := admin_private.guard_apply_accepted_price_v1(p_sub, price_id, amount);
  END IF;
  period_end := NULLIF(p_payload->>'periodEnd','')::timestamptz;
  IF period_end IS NULL OR period_end <= now() THEN
    RETURN jsonb_build_object('status','denied','reason','period');
  END IF;
  SELECT * INTO inv FROM public.guard_subscription_invoices WHERE stripe_invoice_id = p_object_id;
  IF inv.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', inv.id, 'duplicate', true, 'coverageId', p_sub.coverage_id);
  END IF;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.guard_subscription_invoices i WHERE i.subscription_id = p_sub.id AND i.status = 'PAID'
  ) INTO first_paid;
  kind := CASE WHEN first_paid THEN 'INITIAL' ELSE 'RENEWAL' END;
  INSERT INTO public.guard_subscription_invoices(
    subscription_id, coverage_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id,
    amount_paid_minor, currency, period_start, period_end, kind, status
  ) VALUES (
    p_sub.id, p_sub.coverage_id, p_object_id, NULLIF(p_payload->>'paymentIntentId',''), NULLIF(p_payload->>'chargeId',''),
    amount, 'GBP', NULLIF(p_payload->>'periodStart','')::timestamptz, period_end, kind, 'PAID'
  ) RETURNING * INTO inv;
  UPDATE public.guard_subscriptions SET
    lifecycle_state = CASE WHEN cancel_at_period_end THEN 'CANCEL_AT_PERIOD_END' ELSE 'ACTIVE' END,
    provider_status = coalesce(NULLIF(p_payload->>'providerStatus',''), 'active'),
    stripe_subscription_id = coalesce(stripe_subscription_id, NULLIF(p_payload->>'subscriptionId','')),
    stripe_subscription_item_id = coalesce(stripe_subscription_item_id, NULLIF(p_payload->>'subscriptionItemId','')),
    stripe_customer_id = coalesce(stripe_customer_id, NULLIF(p_payload->>'stripeCustomerId','')),
    current_period_start = coalesce(NULLIF(p_payload->>'periodStart','')::timestamptz, current_period_start),
    current_period_end = CASE
      WHEN current_period_end IS NULL OR period_end >= current_period_end THEN period_end
      ELSE current_period_end
    END,
    latest_paid_invoice_id = p_object_id,
    latest_invoice_failure = ''
    WHERE id = p_sub.id RETURNING * INTO p_sub;
  IF p_sub.continuation_id IS NOT NULL AND kind = 'INITIAL' THEN
    coverage := admin_private.guard_handoff_continuation_v1(p_sub, p_sub.current_period_end);
    UPDATE public.guard_subscription_invoices SET coverage_id = coverage WHERE id = inv.id;
  ELSE
    coverage := p_sub.coverage_id;
    SELECT * INTO previous FROM public.guard_billing WHERE coverage_id = coverage FOR UPDATE;
    PERFORM admin_private.guard_set_entitlement_checked_v1(coverage, 'CURRENT', p_sub.current_period_end, 'PROVIDER');
    IF previous.billing_state IS DISTINCT FROM 'CURRENT' THEN
      PERFORM admin_private.guard_append_event_v1(coverage, 'SYSTEM', NULL, 'BILLING_CHANGED', NULL, NULL,
        'Provider invoice paid', jsonb_build_object('invoiceId', p_object_id, 'paidThrough', p_sub.current_period_end));
    END IF;
  END IF;
  PERFORM admin_private.guard_subscription_append_v1(
    p_sub.id, 'PROVIDER', NULL, CASE WHEN kind = 'INITIAL' THEN 'FIRST_INVOICE_PAID' ELSE 'RENEWAL_PAID' END,
    NULL, p_sub.lifecycle_state, 'Confirmed recurring invoice payment',
    jsonb_build_object('invoiceId', p_object_id, 'paidThrough', p_sub.current_period_end)
  );
  PERFORM admin_private.write_payment_ledger_v1(
    p_sub.customer_id, p_sub.service_order_id, NULL,
    CASE WHEN kind = 'INITIAL' THEN 'GUARD_INVOICE_PAID' ELSE 'GUARD_RENEWAL_PAID' END,
    amount, 'GBP', p_object_id, 'PROVIDER', NULL, 'invoice.paid'
  );
  RETURN jsonb_build_object('status','success','id', inv.id, 'coverageId', coverage, 'kind', kind);
END; $$;

CREATE OR REPLACE FUNCTION public.guard_apply_subscription_event_v1(
  p_event_id text, p_type text, p_object_id text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  rec admin_private.stripe_event_receipts; sub public.guard_subscriptions; inv public.guard_subscription_invoices;
  refund public.guard_refunds; dispute public.guard_disputes; payload jsonb; meta_sub uuid; lane_livemode boolean;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) < 3 OR p_type IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  payload := coalesce(p_payload, '{}'::jsonb);
  lane_livemode := CASE
    WHEN payload ? 'livemode' THEN coalesce((payload->>'livemode')::boolean, false)
    ELSE admin_private.payment_expected_livemode_v1()
  END;
  IF NOT admin_private.payment_livemode_accepted_v1(lane_livemode) THEN
    RETURN jsonb_build_object('status','denied','reason','livemode');
  END IF;
  INSERT INTO admin_private.stripe_event_receipts(provider_event_id, event_type, provider_object_id, livemode)
  VALUES (p_event_id, p_type, p_object_id, lane_livemode)
  ON CONFLICT (provider_event_id) DO NOTHING;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id FOR UPDATE;
  IF rec.livemode IS DISTINCT FROM lane_livemode THEN
    RETURN jsonb_build_object('status','denied','reason','livemode');
  END IF;
  IF rec.processed THEN RETURN jsonb_build_object('status','success','duplicate', true); END IF;
  meta_sub := NULLIF(payload->>'guardSubscriptionId','')::uuid;
  SELECT * INTO sub FROM public.guard_subscriptions
    WHERE id = meta_sub OR stripe_subscription_id = NULLIF(payload->>'subscriptionId','')
       OR stripe_subscription_id = p_object_id
    LIMIT 1
    FOR UPDATE;
  IF sub.id IS NULL AND p_type LIKE 'checkout.session.%' THEN
    SELECT s.* INTO sub FROM public.guard_subscriptions s
      JOIN public.provider_operations o ON o.guard_subscription_id = s.id
      WHERE o.provider_object_id = p_object_id
    LIMIT 1;
  END IF;
  IF sub.id IS NULL AND p_type LIKE 'refund.%' THEN
    SELECT s.* INTO sub FROM public.guard_refunds r
      JOIN public.guard_subscriptions s ON s.id = r.subscription_id
      WHERE (p_object_id ~ '^re_' AND r.stripe_refund_id = p_object_id)
         OR r.id = NULLIF(payload->>'guardRefundId','')::uuid
         OR r.provider_operation_id = NULLIF(payload->>'providerOperationId','')::uuid
      LIMIT 1 FOR UPDATE;
  END IF;
  IF sub.id IS NULL AND p_type = 'charge.refunded' THEN
    SELECT s.* INTO sub FROM public.guard_subscription_invoices i
      JOIN public.guard_subscriptions s ON s.id = i.subscription_id
      WHERE i.stripe_charge_id = coalesce(NULLIF(p_object_id,''), NULLIF(payload->>'chargeId',''))
         OR i.stripe_charge_id = NULLIF(payload->>'chargeId','')
      LIMIT 1 FOR UPDATE;
  END IF;
  IF sub.id IS NULL AND p_type LIKE 'charge.dispute.%' THEN
    SELECT s.* INTO sub FROM public.guard_subscription_invoices i
      JOIN public.guard_subscriptions s ON s.id = i.subscription_id
      WHERE i.stripe_charge_id = NULLIF(payload->>'chargeId','')
      LIMIT 1 FOR UPDATE;
  END IF;
  IF sub.id IS NULL AND p_type LIKE 'setup_intent.%' THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = meta_sub FOR UPDATE;
  END IF;
  IF sub.id IS NULL THEN
    IF meta_sub IS NOT NULL OR NULLIF(payload->>'subscriptionId','') ~ '^sub_'
      OR NULLIF(payload->>'paymentIntentId','') IS NOT NULL
      OR NULLIF(payload->>'chargeId','') IS NOT NULL
    THEN
      RETURN jsonb_build_object('status','unmatched','reason','correlation_pending');
    END IF;
    UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
    RETURN jsonb_build_object('status','success','ignored', true, 'reason', 'unrelated');
  END IF;
  IF p_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded') THEN
    UPDATE public.guard_subscriptions SET
      stripe_subscription_id = coalesce(stripe_subscription_id, NULLIF(payload->>'subscriptionId','')),
      stripe_customer_id = coalesce(stripe_customer_id, NULLIF(payload->>'stripeCustomerId','')),
      lifecycle_state = CASE WHEN lifecycle_state IN ('PENDING_CUSTOMER','PENDING_PROVIDER') THEN 'INCOMPLETE' ELSE lifecycle_state END,
      provider_status = coalesce(NULLIF(payload->>'providerStatus',''), provider_status)
      WHERE id = sub.id;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL, 'SUBSCRIPTION_CORRELATED', sub.lifecycle_state, 'INCOMPLETE',
      'Checkout correlated; entitlement waits for invoice.paid', jsonb_build_object('checkoutId', p_object_id));
  ELSIF p_type IN ('customer.subscription.created','customer.subscription.updated') THEN
    IF coalesce(NULLIF(payload->>'quantity','')::integer, 1) <> 1 THEN
      PERFORM admin_private.guard_subscription_append_v1(sub.id, 'SYSTEM', NULL, 'RECONCILIATION_MISMATCH', sub.lifecycle_state, sub.lifecycle_state,
        'Provider quantity is not 1', jsonb_build_object('quantity', payload->>'quantity'));
    END IF;
    UPDATE public.guard_subscriptions SET
      stripe_subscription_id = coalesce(stripe_subscription_id, p_object_id),
      stripe_subscription_item_id = coalesce(NULLIF(payload->>'subscriptionItemId',''), stripe_subscription_item_id),
      stripe_customer_id = coalesce(NULLIF(payload->>'stripeCustomerId',''), stripe_customer_id),
      stripe_schedule_id = coalesce(NULLIF(payload->>'scheduleId',''), stripe_schedule_id),
      provider_status = coalesce(NULLIF(payload->>'providerStatus',''), provider_status),
      current_period_start = coalesce(NULLIF(payload->>'periodStart','')::timestamptz, current_period_start),
      current_period_end = coalesce(NULLIF(payload->>'periodEnd','')::timestamptz, current_period_end),
      lifecycle_state = CASE
        WHEN lifecycle_state IN ('CANCELED','ENDED') THEN lifecycle_state
        WHEN NULLIF(payload->>'providerStatus','') IN ('past_due','unpaid') THEN 'PAST_DUE'
        WHEN NULLIF(payload->>'providerStatus','') = 'canceled' THEN 'CANCELED'
        WHEN NULLIF(payload->>'providerStatus','') IN ('incomplete','incomplete_expired','trialing') THEN 'INCOMPLETE'
        ELSE lifecycle_state
      END
      WHERE id = sub.id RETURNING * INTO sub;
    IF payload ? 'cancelAtPeriodEnd' THEN
      PERFORM admin_private.guard_confirm_cancel_flag_v1(sub.id, (payload->>'cancelAtPeriodEnd')::boolean);
    END IF;
    IF NULLIF(payload->>'providerStatus','') = 'trialing' THEN
      PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL, 'CONTINUATION_SCHEDULED', sub.lifecycle_state, 'INCOMPLETE',
        'Trialing is not paid entitlement', '{}'::jsonb);
    END IF;
  ELSIF p_type = 'customer.subscription.deleted' THEN
    UPDATE public.guard_subscriptions SET
      provider_status = 'canceled', lifecycle_state = 'CANCELED', canceled_at = coalesce(canceled_at, now()),
      cancel_at_period_end = false
      WHERE id = sub.id AND lifecycle_state NOT IN ('ENDED')
      RETURNING * INTO sub;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL, 'SUBSCRIPTION_ENDED', sub.lifecycle_state, 'CANCELED',
      'Provider subscription deleted', jsonb_build_object('subscriptionId', p_object_id));
    IF sub.cancellation_intent = 'REQUEST_IMMEDIATE_CANCELLATION' AND sub.coverage_id IS NOT NULL THEN
      PERFORM admin_private.guard_end_coverage_for_immediate_cancel_v1(sub.coverage_id);
    END IF;
  ELSIF p_type = 'invoice.paid' THEN
    payload := admin_private.guard_apply_invoice_paid_v1(sub, payload, p_object_id);
    IF payload->>'status' = 'success' THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
    END IF;
    RETURN payload;
  ELSIF p_type IN ('invoice.payment_failed','invoice.payment_action_required','invoice.finalization_failed') THEN
    INSERT INTO public.guard_subscription_invoices(
      subscription_id, coverage_id, stripe_invoice_id, amount_paid_minor, currency, kind, status
    ) VALUES (
      sub.id, sub.coverage_id, coalesce(NULLIF(p_object_id,''), 'inunk' || regexp_replace(p_event_id, '[^A-Za-z0-9]', '', 'g')), 0, 'GBP', 'RENEWAL',
      CASE p_type WHEN 'invoice.payment_action_required' THEN 'ACTION_REQUIRED' WHEN 'invoice.finalization_failed' THEN 'FINALIZATION_FAILED' ELSE 'FAILED' END
    ) ON CONFLICT (stripe_invoice_id) DO NOTHING;
    UPDATE public.guard_subscriptions SET
      lifecycle_state = CASE WHEN lifecycle_state IN ('CANCELED','ENDED') THEN lifecycle_state ELSE 'PAST_DUE' END,
      latest_invoice_failure = left(coalesce(payload->>'failureCode', p_type), 80)
      WHERE id = sub.id;
    IF sub.coverage_id IS NOT NULL THEN
      UPDATE public.guard_billing SET billing_state = CASE WHEN billing_state = 'CURRENT' THEN 'PAST_DUE' ELSE billing_state END,
        record_version = record_version + 1, updated_at = now()
        WHERE coverage_id = sub.coverage_id AND entitlement_source = 'PROVIDER';
    END IF;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL,
      CASE WHEN p_type = 'invoice.payment_action_required' THEN 'AUTHENTICATION_REQUIRED' ELSE 'RENEWAL_FAILED' END,
      sub.lifecycle_state, 'PAST_DUE', 'Renewal failed or requires authentication; paid-through is unchanged',
      jsonb_build_object('invoiceId', p_object_id));
    PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'GUARD_RENEWAL_FAILED',
      sub.amount_minor, 'GBP', p_object_id, 'PROVIDER', NULL, p_type);
  ELSIF p_type IN ('refund.updated','refund.failed','refund.created') THEN
    SELECT * INTO refund FROM public.guard_refunds
      WHERE (p_object_id ~ '^re_' AND stripe_refund_id = p_object_id)
         OR id = NULLIF(payload->>'guardRefundId','')::uuid
         OR provider_operation_id = NULLIF(payload->>'providerOperationId','')::uuid
      FOR UPDATE;
    IF refund.id IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','refund_correlation_pending');
    END IF;
    IF NULLIF(payload->>'amountMinor','') IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','refund_amount_missing');
    END IF;
    IF NULLIF(payload->>'currency','') IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','refund_currency_missing');
    END IF;
    IF lower(payload->>'currency') IS DISTINCT FROM 'gbp' THEN
      RETURN jsonb_build_object('status','denied','reason','refund_currency_invalid');
    END IF;
    SELECT * INTO inv FROM public.guard_subscription_invoices WHERE id = refund.invoice_id;
    IF refund.subscription_id IS DISTINCT FROM sub.id
      OR (payload->>'amountMinor')::integer IS DISTINCT FROM refund.amount_minor
      OR (inv.id IS NOT NULL AND inv.subscription_id IS DISTINCT FROM sub.id)
      OR (refund.stripe_payment_intent_id IS NOT NULL AND NULLIF(payload->>'paymentIntentId','') IS NOT NULL
        AND refund.stripe_payment_intent_id IS DISTINCT FROM NULLIF(payload->>'paymentIntentId',''))
      OR (refund.stripe_charge_id IS NOT NULL AND NULLIF(payload->>'chargeId','') IS NOT NULL
        AND refund.stripe_charge_id IS DISTINCT FROM NULLIF(payload->>'chargeId',''))
      OR (inv.stripe_payment_intent_id IS NOT NULL AND NULLIF(payload->>'paymentIntentId','') IS NOT NULL
        AND inv.stripe_payment_intent_id IS DISTINCT FROM NULLIF(payload->>'paymentIntentId',''))
      OR (inv.stripe_charge_id IS NOT NULL AND NULLIF(payload->>'chargeId','') IS NOT NULL
        AND inv.stripe_charge_id IS DISTINCT FROM NULLIF(payload->>'chargeId',''))
    THEN
      RETURN jsonb_build_object('status','denied','reason','refund_scope_mismatch');
    END IF;
    UPDATE public.guard_refunds SET
      stripe_refund_id = CASE WHEN p_object_id ~ '^re_' THEN coalesce(stripe_refund_id, p_object_id) ELSE stripe_refund_id END,
      status = CASE
        WHEN p_type = 'refund.failed' OR payload->>'refundStatus' = 'failed' THEN 'FAILED'
        WHEN payload->>'refundStatus' = 'succeeded' THEN 'SUCCEEDED'
        WHEN payload->>'refundStatus' IN ('canceled','cancelled') THEN 'CANCELED'
        WHEN payload->>'refundStatus' IN ('pending','requires_action') THEN 'PENDING'
        WHEN p_type = 'refund.created' AND status IN ('APPROVED','REQUESTED','SUBMITTED') THEN 'PENDING'
        ELSE status
      END,
      succeeded_at = CASE WHEN payload->>'refundStatus' = 'succeeded' THEN coalesce(succeeded_at, now()) ELSE succeeded_at END,
      failed_at = CASE WHEN p_type = 'refund.failed' OR payload->>'refundStatus' = 'failed' THEN now() ELSE failed_at END,
      failure_code = coalesce(NULLIF(payload->>'failureCode',''), failure_code)
      WHERE id = refund.id RETURNING * INTO refund;
    UPDATE public.guard_billing_adjustments SET status = CASE refund.status
      WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
      WHEN 'FAILED' THEN 'FAILED'
      WHEN 'CANCELED' THEN 'CANCELLED'
      ELSE 'SUBMITTED'
    END WHERE id = refund.adjustment_id;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL,
      CASE WHEN refund.status = 'FAILED' THEN 'REFUND_FAILED' WHEN refund.status = 'SUCCEEDED' THEN 'REFUND_SUCCEEDED' ELSE 'REFUND_SUBMITTED' END,
      NULL, sub.lifecycle_state, 'Provider refund update', jsonb_build_object('refundId', refund.id, 'status', refund.status));
    PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL,
      CASE WHEN refund.status = 'FAILED' THEN 'GUARD_REFUND_FAILED' WHEN refund.status = 'SUCCEEDED' THEN 'GUARD_REFUND_SUCCEEDED' ELSE 'GUARD_REFUND_SUBMITTED' END,
      refund.amount_minor, 'GBP', p_object_id, 'PROVIDER', NULL, p_type);
  ELSIF p_type = 'charge.refunded' THEN
    SELECT * INTO inv FROM public.guard_subscription_invoices
      WHERE subscription_id = sub.id
        AND stripe_charge_id = coalesce(NULLIF(p_object_id,''), NULLIF(payload->>'chargeId',''))
      LIMIT 1;
    IF inv.id IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','charge_invoice_pending');
    END IF;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'SYSTEM', NULL, 'RECONCILIATION_MISMATCH', sub.lifecycle_state, sub.lifecycle_state,
      'charge.refunded is supplemental and does not mark a refund succeeded',
      jsonb_build_object('objectId', p_object_id, 'chargeId', payload->>'chargeId', 'invoiceId', inv.id));
  ELSIF p_type LIKE 'setup_intent.%' THEN
    IF meta_sub IS DISTINCT FROM sub.id THEN
      RETURN jsonb_build_object('status','denied','reason','setup_scope');
    END IF;
    IF p_type = 'setup_intent.succeeded' THEN
      PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL, 'SUBSCRIPTION_CORRELATED', sub.lifecycle_state, sub.lifecycle_state,
        'Guard recovery SetupIntent succeeded. Payment-method update still requires provider confirmation',
        jsonb_build_object('setupIntentId', p_object_id, 'paymentMethodId', payload->>'paymentMethodId'));
    END IF;
  ELSIF p_type LIKE 'charge.dispute.%' THEN
    IF NULLIF(payload->>'chargeId','') IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','dispute_charge_missing');
    END IF;
    SELECT * INTO inv FROM public.guard_subscription_invoices
      WHERE subscription_id = sub.id AND stripe_charge_id = NULLIF(payload->>'chargeId','') LIMIT 1;
    IF inv.id IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','dispute_invoice_pending');
    END IF;
    IF NULLIF(payload->>'amountMinor','') IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','dispute_amount_missing');
    END IF;
    IF NULLIF(payload->>'currency','') IS NULL THEN
      RETURN jsonb_build_object('status','unmatched','reason','dispute_currency_missing');
    END IF;
    IF lower(payload->>'currency') IS DISTINCT FROM 'gbp' THEN
      RETURN jsonb_build_object('status','denied','reason','dispute_currency_invalid');
    END IF;
    IF (payload->>'amountMinor')::integer <= 0
      OR (payload->>'amountMinor')::integer > inv.amount_paid_minor
      OR inv.subscription_id IS DISTINCT FROM sub.id
      OR (NULLIF(payload->>'locationId','') IS NOT NULL AND NULLIF(payload->>'locationId','')::uuid IS DISTINCT FROM sub.location_id)
    THEN
      RETURN jsonb_build_object('status','denied','reason','dispute_scope_mismatch');
    END IF;
    SELECT * INTO dispute FROM public.guard_disputes WHERE stripe_dispute_id = p_object_id FOR UPDATE;
    IF dispute.id IS NOT NULL AND (
      dispute.subscription_id IS DISTINCT FROM sub.id
      OR dispute.location_id IS DISTINCT FROM sub.location_id
      OR dispute.invoice_id IS DISTINCT FROM inv.id
      OR dispute.stripe_charge_id IS DISTINCT FROM NULLIF(payload->>'chargeId','')
      OR dispute.amount_minor IS DISTINCT FROM (payload->>'amountMinor')::integer
      OR dispute.currency IS DISTINCT FROM 'GBP'
    ) THEN
      RETURN jsonb_build_object('status','denied','reason','dispute_scope_mismatch');
    END IF;
    INSERT INTO public.guard_disputes(
      subscription_id, location_id, invoice_id, stripe_dispute_id, stripe_charge_id, amount_minor, currency, provider_status
    ) VALUES (
      sub.id, sub.location_id, inv.id,
      p_object_id, NULLIF(payload->>'chargeId',''),
      (payload->>'amountMinor')::integer, 'GBP',
      coalesce(NULLIF(payload->>'disputeStatus',''), 'needs_response')
    ) ON CONFLICT (stripe_dispute_id) DO UPDATE SET
      provider_status = excluded.provider_status,
      resolved_at = CASE WHEN p_type IN ('charge.dispute.closed','charge.dispute.funds_reinstated') THEN coalesce(public.guard_disputes.resolved_at, now()) ELSE public.guard_disputes.resolved_at END,
      finance_work_status = CASE WHEN p_type IN ('charge.dispute.closed','charge.dispute.funds_reinstated') THEN 'CLOSED' ELSE public.guard_disputes.finance_work_status END,
      outcome = coalesce(NULLIF(payload->>'outcome',''), public.guard_disputes.outcome);
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL,
      CASE WHEN p_type = 'charge.dispute.closed' THEN 'DISPUTE_CLOSED' WHEN p_type = 'charge.dispute.created' THEN 'DISPUTE_OPENED' ELSE 'DISPUTE_UPDATED' END,
      NULL, sub.lifecycle_state, 'Provider dispute update', jsonb_build_object('disputeId', p_object_id));
    PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL,
      CASE WHEN p_type = 'charge.dispute.closed' THEN 'GUARD_DISPUTE_CLOSED' ELSE 'GUARD_DISPUTE_OPENED' END,
      (payload->>'amountMinor')::integer, 'GBP', p_object_id, 'PROVIDER', NULL, p_type);
  END IF;
  UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
  RETURN jsonb_build_object('status','success','duplicate', false, 'subscriptionId', sub.id);
END; $$;

CREATE OR REPLACE FUNCTION public.guard_apply_reconciliation_target_v1(p_target uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  target public.guard_reconciliation_targets; run public.guard_reconciliation_runs;
  sub public.guard_subscriptions; payload jsonb; mismatches integer := 0;
  next_status text;
BEGIN
  payload := coalesce(p_payload, '{}'::jsonb);
  SELECT * INTO target FROM public.guard_reconciliation_targets WHERE id = p_target FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO run FROM public.guard_reconciliation_runs WHERE id = target.run_id FOR UPDATE;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = target.subscription_id FOR UPDATE;
  UPDATE public.guard_reconciliation_targets SET status = 'RUNNING', attempts = attempts + 1, updated_at = now() WHERE id = target.id;
  IF payload->>'outcome' = 'PROVIDER_DISABLED' THEN
    next_status := 'PROVIDER_DISABLED';
    INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
    VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_DISABLED', jsonb_build_object('expectedStripeSubscriptionId', target.expected_stripe_subscription_id));
    mismatches := 1;
  ELSIF payload->>'outcome' = 'RETRY' THEN
    next_status := 'RETRY';
  ELSIF payload->>'outcome' = 'FAILED' THEN
    next_status := 'FAILED';
    INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
    VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_RETRIEVAL_FAILED', jsonb_build_object('error', payload->>'lastError'));
    mismatches := 1;
  ELSE
    IF target.expected_stripe_subscription_id IS NOT NULL THEN
      IF NULLIF(payload->>'subscriptionId','') IS DISTINCT FROM target.expected_stripe_subscription_id THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_SUBSCRIPTION_MISMATCH', jsonb_build_object('expected', target.expected_stripe_subscription_id, 'actual', payload->>'subscriptionId'));
        mismatches := mismatches + 1;
      END IF;
      IF NULLIF(payload->>'stripeCustomerId','') IS DISTINCT FROM sub.stripe_customer_id AND sub.stripe_customer_id IS NOT NULL THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_CUSTOMER_MISMATCH', jsonb_build_object('expected', sub.stripe_customer_id, 'actual', payload->>'stripeCustomerId'));
        mismatches := mismatches + 1;
      END IF;
      IF NULLIF(payload->>'subscriptionItemId','') IS DISTINCT FROM sub.stripe_subscription_item_id AND sub.stripe_subscription_item_id IS NOT NULL THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_ITEM_MISMATCH', jsonb_build_object('expected', sub.stripe_subscription_item_id, 'actual', payload->>'subscriptionItemId'));
        mismatches := mismatches + 1;
      END IF;
      IF NULLIF(payload->>'stripePriceId','') IS DISTINCT FROM sub.stripe_price_id AND payload ? 'stripePriceId' THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_PRICE_MISMATCH', jsonb_build_object('expected', sub.stripe_price_id, 'actual', payload->>'stripePriceId'));
        mismatches := mismatches + 1;
      END IF;
      IF NOT (payload ? 'quantity') OR NULLIF(payload->>'quantity','') IS NULL
        OR NULLIF(payload->>'quantity','')::integer IS DISTINCT FROM 1 THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'QUANTITY_NOT_ONE', jsonb_build_object('quantity', payload->>'quantity'));
        mismatches := mismatches + 1;
      END IF;
      IF payload ? 'livemode' AND NOT admin_private.payment_livemode_accepted_v1(coalesce((payload->>'livemode')::boolean, false)) THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'UNEXPECTED_LIVE_MODE', '{}'::jsonb);
        mismatches := mismatches + 1;
      END IF;
      IF payload ? 'cancelAtPeriodEnd' THEN
        PERFORM admin_private.guard_confirm_cancel_flag_v1(sub.id, (payload->>'cancelAtPeriodEnd')::boolean);
      END IF;
    ELSIF sub.stripe_subscription_id IS NULL AND sub.lifecycle_state IN ('ACTIVE','PAST_DUE','CANCEL_AT_PERIOD_END','INCOMPLETE') THEN
      INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
      VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_SUBSCRIPTION_MISSING', jsonb_build_object('lifecycle', sub.lifecycle_state));
      mismatches := mismatches + 1;
    END IF;
    IF target.expected_stripe_subscription_id IS NULL THEN
      IF NULLIF(payload->>'stripePriceId','') IS NOT NULL AND payload->>'stripePriceId' IS DISTINCT FROM sub.stripe_price_id THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_PRICE_MISMATCH', jsonb_build_object('expected', sub.stripe_price_id, 'actual', payload->>'stripePriceId'));
        mismatches := mismatches + 1;
      END IF;
      IF payload ? 'quantity' AND NULLIF(payload->>'quantity','')::integer IS DISTINCT FROM 1 THEN
        INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
        VALUES (run.id, sub.id, sub.coverage_id, 'QUANTITY_NOT_ONE', jsonb_build_object('quantity', payload->>'quantity'));
        mismatches := mismatches + 1;
      END IF;
    END IF;
    IF jsonb_typeof(payload->'followUpErrors') = 'array' THEN
      INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
      SELECT run.id, sub.id, sub.coverage_id, coalesce(err->>'code', 'FOLLOW_UP_FAILED'), err
      FROM jsonb_array_elements(payload->'followUpErrors') AS err;
      mismatches := mismatches + (
        SELECT count(*)::int FROM jsonb_array_elements(payload->'followUpErrors')
      );
    END IF;
    IF payload->>'outcome' IS DISTINCT FROM 'PROVIDER_DISABLED'
      AND payload->>'outcome' IS DISTINCT FROM 'RETRY'
      AND payload->>'outcome' IS DISTINCT FROM 'FAILED'
    THEN
      PERFORM admin_private.guard_settle_pending_operations_v1(sub.id, payload);
    END IF;
    next_status := 'SUCCEEDED';
  END IF;
  UPDATE public.guard_reconciliation_targets SET
    status = next_status,
    last_error = coalesce(payload->>'lastError', ''),
    checked_at = now(),
    mismatch_count = mismatches,
    provider_evidence = payload,
    updated_at = now()
    WHERE id = target.id;
  RETURN jsonb_build_object('status','success','targetStatus', next_status, 'mismatchCount', mismatches);
END; $$;

CREATE FUNCTION public.admin_set_payment_provider_lane_v1(p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  expected boolean;
  mixed boolean;
BEGIN
  IF p_mode IS DISTINCT FROM 'stripe_test' AND p_mode IS DISTINCT FROM 'stripe_live' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  expected := p_mode = 'stripe_live';
  SELECT EXISTS (
    SELECT 1 FROM public.provider_operations WHERE livemode IS DISTINCT FROM expected
    UNION ALL
    SELECT 1 FROM public.stripe_customer_maps WHERE livemode IS DISTINCT FROM expected
    UNION ALL
    SELECT 1 FROM public.guard_provider_price_maps WHERE livemode IS DISTINCT FROM expected
    UNION ALL
    SELECT 1 FROM public.guard_subscriptions WHERE livemode IS DISTINCT FROM expected
    UNION ALL
    SELECT 1 FROM public.guard_subscription_invoices WHERE livemode IS DISTINCT FROM expected
    UNION ALL
    SELECT 1 FROM public.guard_refunds WHERE livemode IS DISTINCT FROM expected
    UNION ALL
    SELECT 1 FROM public.guard_disputes WHERE livemode IS DISTINCT FROM expected
    UNION ALL
    SELECT 1 FROM admin_private.stripe_event_receipts WHERE livemode IS DISTINCT FROM expected
  ) INTO mixed;
  IF mixed THEN
    RETURN jsonb_build_object('status','denied','reason','mixed_livemode');
  END IF;
  INSERT INTO admin_private.payment_provider_lane(singleton, mode, expected_livemode)
  VALUES (true, p_mode, expected)
  ON CONFLICT (singleton) DO UPDATE
    SET mode = EXCLUDED.mode,
        expected_livemode = EXCLUDED.expected_livemode,
        updated_at = now();
  RETURN jsonb_build_object('status','success','mode', p_mode, 'expectedLivemode', expected);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_payment_provider_lane_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_payment_provider_lane_v1(text) TO service_role;


CREATE FUNCTION admin_private.payment_external_lane_allowed_v1(p_declared text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT CASE
    WHEN admin_private.payment_expected_livemode_v1() THEN coalesce(p_declared, '') = 'true'
    WHEN p_declared IS NULL OR p_declared = '' OR p_declared = 'false' THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION admin_private.payment_external_lane_allowed_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.payment_provider_lane_status_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT CASE
    WHEN lane.singleton IS NULL THEN jsonb_build_object('configured', false, 'mode', 'stripe_test', 'expectedLivemode', false)
    ELSE jsonb_build_object('configured', true, 'mode', lane.mode, 'expectedLivemode', lane.expected_livemode)
  END
  FROM (SELECT 1) AS present
  LEFT JOIN admin_private.payment_provider_lane AS lane ON true;
$$;

REVOKE ALL ON FUNCTION public.payment_provider_lane_status_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_provider_lane_status_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.payment_collect_prepare_v1(p_obligation uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  RETURN jsonb_build_object('status','denied','reason','off_session_retired');
END;
$$;

DROP FUNCTION public.payment_prepare_customer_v1(uuid);
CREATE FUNCTION public.payment_prepare_customer_v1(p_customer uuid, p_livemode boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE map public.stripe_customer_maps; op public.provider_operations; declared text;
BEGIN
  declared := CASE WHEN p_livemode IS NULL THEN NULL WHEN p_livemode THEN 'true' ELSE 'false' END;
  IF NOT admin_private.payment_external_lane_allowed_v1(declared) THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  IF p_customer IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer) THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_customer::text, 15));
  SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = p_customer;
  IF map.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','stripeCustomerId', map.stripe_customer_id, 'created', false);
  END IF;
  SELECT * INTO op FROM public.provider_operations
    WHERE customer_id = p_customer AND kind = 'CREATE_CUSTOMER' AND status IN ('PENDING','SUBMITTED')
    ORDER BY created_at ASC LIMIT 1;
  IF op.id IS NULL THEN
    INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, status)
    VALUES (extensions.gen_random_uuid(), 'CREATE_CUSTOMER', 'CUSTOMER', p_customer, 'PENDING')
    RETURNING * INTO op;
  END IF;
  RETURN jsonb_build_object(
    'status','success','needsCreate', true, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key
  );
END; $$;

REVOKE ALL ON FUNCTION public.payment_prepare_customer_v1(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_prepare_customer_v1(uuid, boolean) TO service_role;

DROP FUNCTION public.payment_prepare_invoice_v1(text, uuid);
CREATE FUNCTION public.payment_prepare_invoice_v1(p_token text, p_obligation uuid, p_livemode boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
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

REVOKE ALL ON FUNCTION public.payment_prepare_invoice_v1(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_prepare_invoice_v1(text, uuid, boolean) TO service_role;

DROP FUNCTION public.payment_replace_expired_checkout_v1(uuid);
CREATE FUNCTION public.payment_replace_expired_checkout_v1(p_operation uuid, p_livemode boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op public.provider_operations; att public.payment_attempts; nxt public.provider_operations;
  next_att public.payment_attempts; n integer; ob public.payment_obligations; declared text;
BEGIN
  declared := CASE WHEN p_livemode IS NULL THEN NULL WHEN p_livemode THEN 'true' ELSE 'false' END;
  IF NOT admin_private.payment_external_lane_allowed_v1(declared) THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  IF p_operation IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO op FROM public.provider_operations WHERE id = p_operation FOR UPDATE;
  IF op.id IS NULL OR op.kind NOT IN ('CREATE_CHECKOUT_SESSION','CREATE_SETUP_SESSION','CREATE_RECOVERY_SESSION') THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF op.obligation_id IS NOT NULL THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = op.obligation_id FOR UPDATE;
    IF admin_private.obligation_has_blocking_invoice_v1(op.obligation_id) THEN
      RETURN jsonb_build_object('status','denied','reason','invoice_issued');
    END IF;
  END IF;
  IF op.status = 'SUCCEEDED' THEN RETURN jsonb_build_object('status','denied','reason','already_succeeded'); END IF;
  SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id FOR UPDATE;
  IF att.id IS NOT NULL AND att.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status','denied','reason','already_succeeded');
  END IF;
  IF att.id IS NOT NULL AND att.status IN ('CREATED','SUBMITTED','REQUIRES_ACTION') THEN
    UPDATE public.payment_attempts SET status = 'CANCELLED', failed_at = now(),
      failure_category = 'EXPIRED', failure_code = 'checkout_expired'
      WHERE id = att.id;
  END IF;
  UPDATE public.provider_operations SET status = 'CANCELLED' WHERE id = op.id AND status NOT IN ('SUCCEEDED','CANCELLED');
  INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
  VALUES (extensions.gen_random_uuid(), op.kind, op.purpose, op.customer_id, op.service_order_id, op.obligation_id, 'PENDING')
  RETURNING * INTO nxt;
  IF att.id IS NOT NULL THEN
    SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = att.obligation_id;
    INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
    VALUES (att.obligation_id, att.service_order_id, nxt.id, n, att.purpose, 'CREATED', att.amount_minor, att.currency)
    RETURNING * INTO next_att;
  END IF;
  RETURN jsonb_build_object(
    'status','success','providerOperationId', nxt.id, 'idempotencyKey', nxt.idempotency_key,
    'attemptId', next_att.id, 'replacedOperationId', op.id
  );
END; $$;

REVOKE ALL ON FUNCTION public.payment_replace_expired_checkout_v1(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_replace_expired_checkout_v1(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.customer_payment_command_v1(p_token_hash text, p_request uuid, p_operation text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $payment$
DECLARE
  sess admin_private.customer_action_sessions;
  fp text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('confirm_consent','start_checkout')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation = 'start_checkout' AND NOT admin_private.payment_external_lane_allowed_v1(p_data->>'declaredLivemode') THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(sess.action_id, p_operation, p_data)::text);
  RETURN admin_private.customer_payment_apply_v1(
    sess.action_id, sess.auth_user_id, p_request, fp, p_operation, p_data,
    'CUSTOMER_OTP', NULL, NULL, NULL
  );
END;
$payment$;

CREATE OR REPLACE FUNCTION public.customer_guard_subscription_command_v1(
  p_token_hash text, p_request uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $command$
DECLARE
  sess admin_private.customer_action_sessions;
  a public.customer_actions;
  sub public.guard_subscriptions;
  fp text;
  cached jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN (
      'start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation', 'request_immediate_cancellation'
    )
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation IN ('start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation')
    AND NOT admin_private.payment_external_lane_allowed_v1(p_data->>'declaredLivemode')
  THEN RETURN jsonb_build_object('status','denied','reason','lane_mismatch'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(sess.action_id, p_operation, coalesce(p_data, '{}'::jsonb))::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sub FROM public.guard_subscriptions
    WHERE id = coalesce(a.guard_subscription_id, NULLIF(p_data->>'subscriptionId', '')::uuid) FOR UPDATE;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM a.customer_id OR sub.location_id IS DISTINCT FROM a.location_id THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  RETURN admin_private.customer_guard_subscription_apply_v1(
    a, sess.auth_user_id, p_request, fp, p_operation, coalesce(p_data, '{}'::jsonb), sub.id
  );
END;
$command$;


CREATE OR REPLACE FUNCTION admin_private.customer_payment_apply_v1(
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
  fp text;
  cached jsonb;
  result jsonb;
  ord public.service_orders;
  qv public.quote_versions;
  consent public.payment_consents;
  ob public.payment_obligations;
  op public.provider_operations;
  elig jsonb;
  att public.payment_attempts;
  n integer;
  prior public.payment_attempts;
BEGIN
  IF p_operation = 'start_checkout' AND NOT admin_private.payment_external_lane_allowed_v1(p_data->>'declaredLivemode') THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  IF p_action_id IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_fingerprint IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('confirm_consent', 'start_checkout')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
    OR p_channel IS NULL OR p_channel NOT IN ('CUSTOMER_OTP', 'CUSTOMER_PORTAL')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := p_fingerprint;
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
  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id FOR UPDATE;
  IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM a.customer_id THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_customer IS NOT NULL AND ord.customer_id IS DISTINCT FROM p_customer THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_case IS NOT NULL AND ord.case_id IS DISTINCT FROM p_case THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;

  IF p_operation = 'start_checkout' THEN
    elig := admin_private.evaluate_commercial_eligibility_v1(ord.business_id, ord.service_code, ord.tax_behaviour, ord.currency, ord.amount_minor, ord.location_id, false);
    IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RETURN jsonb_build_object('status', 'eligibility_blocked', 'reason', coalesce(elig->>'reason', 'pending_review'), 'message', admin_private.commercial_eligibility_message_v1());
    END IF;
  END IF;
  cached := admin_private.customer_action_receipt_v1(p_actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  IF p_operation = 'confirm_consent' THEN
    IF a.kind <> 'MANAGED_PAYMENT_SETUP' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF p_data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = ord.id;
    IF consent.id IS NULL THEN
      INSERT INTO public.payment_consents(
        customer_id, service_order_id, quote_id, quote_version_id, case_id, amount_minor, currency, payment_model,
        success_definition, consent_text, consent_version, auth_user_id, expected_email_snapshot, customer_action_id
      ) VALUES (
        ord.customer_id, ord.id, ord.quote_id, ord.quote_version_id, ord.case_id, ord.amount_minor, ord.currency, 'SUCCESS_FEE',
        qv.success_definition, admin_private.success_fee_consent_text_v1(), 'SUCCESS_FEE_CONSENT_V1',
        p_actor, a.expected_email_snapshot, a.id
      ) RETURNING * INTO consent;
      PERFORM admin_private.write_payment_ledger_v1(ord.customer_id, ord.id, NULL, 'CONSENT_RECORDED', ord.amount_minor, ord.currency, NULL, 'CUSTOMER', p_actor, 'MANAGED_SETUP');
    END IF;
    result := jsonb_build_object('status','success','consentId', consent.id, 'consentVersion', consent.consent_version);
  ELSE
    IF a.kind = 'MANAGED_PAYMENT_SETUP' THEN
      SELECT * INTO consent FROM public.payment_consents
        WHERE service_order_id = ord.id AND customer_id = ord.customer_id
          AND quote_version_id = ord.quote_version_id AND amount_minor = ord.amount_minor
          AND success_definition = qv.success_definition;
      IF consent.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    ELSIF a.kind IN ('GUIDED_PAYMENT','PAYMENT_RECOVERY') THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id FOR UPDATE;
      IF ob.id IS NULL OR ob.state IN ('PAID','VOID') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(ob.id::text, 14));
      IF a.kind = 'PAYMENT_RECOVERY' THEN
        SELECT * INTO prior FROM public.payment_attempts
          WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
            AND purpose IN ('CHECKOUT','OFF_SESSION')
            AND stripe_payment_intent_id IS NOT NULL
          ORDER BY created_at ASC LIMIT 1;
        IF prior.id IS NOT NULL THEN
          SELECT * INTO op FROM public.provider_operations WHERE id = prior.provider_operation_id;
          IF op.status <> 'CANCELLED' THEN
            SELECT * INTO op FROM public.provider_operations
              WHERE obligation_id = ob.id AND kind = 'CANCEL_PAYMENT_INTENT' AND status IN ('PENDING','SUBMITTED')
              ORDER BY created_at ASC LIMIT 1;
            IF op.id IS NULL THEN
              INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
              VALUES (extensions.gen_random_uuid(), 'CANCEL_PAYMENT_INTENT', 'RECOVERY', ord.customer_id, ord.id, ob.id, 'PENDING')
              RETURNING * INTO op;
            END IF;
            result := jsonb_build_object(
              'status','needs_cancel','paymentIntentId', prior.stripe_payment_intent_id,
              'attemptId', prior.id, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
              'serviceOrderId', ord.id, 'obligationId', ob.id, 'customerId', ord.customer_id
            );
            INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
            RETURN result;
          END IF;
        END IF;
      END IF;
    ELSE
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    IF ob.id IS NOT NULL THEN
      SELECT * INTO att FROM public.payment_attempts
        WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
          AND purpose = CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'CHECKOUT' END
        ORDER BY created_at ASC LIMIT 1;
      IF att.id IS NOT NULL THEN
        SELECT * INTO op FROM public.provider_operations WHERE id = att.provider_operation_id;
        IF (a.kind = 'GUIDED_PAYMENT' AND op.kind IS DISTINCT FROM 'CREATE_CHECKOUT_SESSION')
          OR (a.kind = 'PAYMENT_RECOVERY' AND op.kind IS DISTINCT FROM 'CREATE_RECOVERY_SESSION')
          OR att.purpose IN ('INVOICE','OFF_SESSION')
        THEN
          RETURN jsonb_build_object('status', 'denied');
        END IF;
        result := jsonb_build_object(
          'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
          'attemptId', att.id, 'amountMinor', coalesce(ob.amount_minor, 0), 'currency', ord.currency,
          'mode', CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'payment' ELSE 'payment' END,
          'checkoutSessionId', att.stripe_checkout_session_id, 'reused', true,
          'offSession', false, 'serviceOrderId', ord.id, 'obligationId', ob.id,
          'customerId', ord.customer_id, 'orderRef', ord.public_ref
        );
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
        RETURN result;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.payment_attempts
        WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
          AND purpose <> CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'CHECKOUT' END
      ) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
    ELSIF a.kind = 'MANAGED_PAYMENT_SETUP' THEN
      SELECT * INTO op FROM public.provider_operations
        WHERE service_order_id = ord.id AND kind = 'CREATE_SETUP_SESSION' AND status IN ('PENDING','SUBMITTED')
        ORDER BY created_at ASC LIMIT 1;
      IF op.id IS NOT NULL THEN
        result := jsonb_build_object(
          'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
          'attemptId', NULL, 'amountMinor', 0, 'currency', ord.currency, 'mode', 'setup',
          'checkoutSessionId', op.provider_object_id, 'reused', true,
          'offSession', true, 'serviceOrderId', ord.id, 'obligationId', NULL,
          'customerId', ord.customer_id, 'orderRef', ord.public_ref
        );
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
        RETURN result;
      END IF;
    END IF;
    INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
    VALUES (
      coalesce(NULLIF(p_data->>'idempotencyKey','')::uuid, extensions.gen_random_uuid()),
      CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'CREATE_SETUP_SESSION' WHEN 'PAYMENT_RECOVERY' THEN 'CREATE_RECOVERY_SESSION' ELSE 'CREATE_CHECKOUT_SESSION' END,
      CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'SETUP' WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'UPFRONT' END,
      ord.customer_id, ord.id, ob.id, 'PENDING'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    SELECT * INTO op FROM public.provider_operations
      WHERE service_order_id = ord.id AND kind = CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'CREATE_SETUP_SESSION' WHEN 'PAYMENT_RECOVERY' THEN 'CREATE_RECOVERY_SESSION' ELSE 'CREATE_CHECKOUT_SESSION' END
        AND status IN ('PENDING','SUBMITTED')
      ORDER BY created_at DESC LIMIT 1;
    IF ob.id IS NOT NULL THEN
      SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = ob.id;
      INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
      VALUES (ob.id, ord.id, op.id, n, CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'CHECKOUT' END, 'CREATED', ob.amount_minor, ob.currency)
      ON CONFLICT (provider_operation_id) DO NOTHING;
      SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id;
    END IF;
    result := jsonb_build_object(
      'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'attemptId', att.id, 'amountMinor', coalesce(ob.amount_minor, 0), 'currency', ord.currency,
      'mode', CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'setup' ELSE 'payment' END,
      'offSession', a.kind = 'MANAGED_PAYMENT_SETUP', 'serviceOrderId', ord.id, 'obligationId', ob.id,
      'customerId', ord.customer_id, 'orderRef', ord.public_ref, 'checkoutSessionId', att.stripe_checkout_session_id
    );
  END IF;
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
  RETURN result;
END;
$apply$;


CREATE OR REPLACE FUNCTION public.customer_portal_payment_command_v1(
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
  fp text;
  cached jsonb;
  matches integer;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_reference IS NULL OR p_selector IS NULL OR p_operation IS NULL OR p_data IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
    OR p_operation NOT IN ('confirm_consent', 'start_checkout')
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation = 'confirm_consent' AND p_data IS DISTINCT FROM '{"accepted":true}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'start_checkout' AND (
    p_data->>'idempotencyKey' IS NULL
    OR p_data->>'idempotencyKey' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT (
      p_data = jsonb_build_object('idempotencyKey', p_data->>'idempotencyKey')
      OR (
        p_data->>'declaredLivemode' IN ('true', 'false')
        AND p_data = jsonb_build_object('idempotencyKey', p_data->>'idempotencyKey', 'declaredLivemode', p_data->>'declaredLivemode')
      )
    )
  ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_operation = 'start_checkout' AND NOT admin_private.payment_external_lane_allowed_v1(p_data->>'declaredLivemode') THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
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
  IF p_operation = 'confirm_consent' AND a.kind <> 'MANAGED_PAYMENT_SETUP' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_operation = 'start_checkout' AND a.kind NOT IN ('GUIDED_PAYMENT', 'MANAGED_PAYMENT_SETUP', 'PAYMENT_RECOVERY') THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN admin_private.customer_payment_apply_v1(
    a.id, v_auth, p_request, fp, p_operation, p_data, 'CUSTOMER_PORTAL', v_customer, v_case, v_email
  );
END;
$command$;

CREATE OR REPLACE FUNCTION public.customer_portal_guard_command_v1(
  p_token_hash text,
  p_request uuid,
  p_selector text,
  p_action_selector text,
  p_operation text,
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $portal$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  cov public.guard_coverages;
  a public.customer_actions;
  sub public.guard_subscriptions;
  consent public.guard_recurring_consents;
  caps jsonb;
  fp text;
  cached jsonb;
  result jsonb;
  safe jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_selector IS NULL OR p_action_selector IS NULL OR p_operation IS NULL OR p_data IS NULL
    OR p_selector !~ '^gd-[a-f0-9]{64}$'
    OR p_action_selector !~ '^ca-[a-f0-9]{64}$'
    OR p_operation NOT IN (
      'accept_permission', 'decline_permission', 'accept_consent', 'accept_price', 'decline_price',
      'start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation',
      'request_immediate_cancellation'
    )
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
    OR p_data ? 'subscriptionId' OR p_data ? 'customerId' OR p_data ? 'coverageId'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation = 'accept_permission' AND p_data IS DISTINCT FROM jsonb_build_object('accepted', true, 'permissionVersion', 'GUARD_PERMISSION_V1') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'decline_permission' AND p_data IS DISTINCT FROM '{}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'accept_consent' AND p_data IS DISTINCT FROM jsonb_build_object('accepted', true, 'consentVersion', 'GUARD_RECURRING_CONSENT_V1') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'accept_price' AND NOT (
    p_data = jsonb_build_object('accepted', true)
    OR (
      p_data->>'declaredLivemode' IN ('true', 'false')
      AND p_data = jsonb_build_object('accepted', true, 'declaredLivemode', p_data->>'declaredLivemode')
    )
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'decline_price' AND p_data IS DISTINCT FROM '{}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation IN (
    'start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation', 'request_immediate_cancellation'
  ) AND (
    p_data->>'idempotencyKey' IS NULL
    OR p_data->>'idempotencyKey' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT (
      p_data = jsonb_build_object('idempotencyKey', p_data->>'idempotencyKey')
      OR (
        p_data->>'declaredLivemode' IN ('true', 'false')
        AND p_data = jsonb_build_object('idempotencyKey', p_data->>'idempotencyKey', 'declaredLivemode', p_data->>'declaredLivemode')
      )
    )
  ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_operation IN ('start_checkout', 'start_recovery', 'request_period_end_cancellation', 'undo_period_end_cancellation')
    AND NOT admin_private.payment_external_lane_allowed_v1(p_data->>'declaredLivemode')
  THEN RETURN jsonb_build_object('status','denied','reason','lane_mismatch'); END IF;
  fp := md5(jsonb_build_array(p_selector, p_action_selector, p_operation, p_data)::text);
  cached := admin_private.customer_action_receipt_v1(v_auth, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO cov FROM public.guard_coverages
  WHERE customer_id = v_customer AND admin_private.customer_portal_guard_selector_v1(id) = p_selector
  FOR UPDATE;
  IF cov.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO a FROM public.customer_actions action
  WHERE action.customer_id = v_customer
    AND action.business_id = cov.business_id
    AND action.location_id = cov.location_id
    AND lower(action.expected_email_snapshot) = lower(v_email)
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_action_selector
  FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF p_operation IN ('accept_permission', 'decline_permission') THEN
    IF a.kind <> 'GUARD_PERMISSION' OR a.guard_coverage_id IS DISTINCT FROM cov.id THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    IF p_operation = 'accept_permission' AND (
      a.status = 'COMPLETED' OR EXISTS (
        SELECT 1 FROM public.guard_permissions p WHERE p.coverage_id = a.guard_coverage_id AND p.status = 'ACTIVE'
      )
    ) THEN
      result := admin_private.accept_guard_permission_v1(a, v_auth, p_request);
    ELSIF NOT admin_private.customer_action_eligible_v1(a) THEN
      RETURN jsonb_build_object('status', 'unavailable');
    ELSIF p_operation = 'accept_permission' THEN
      result := admin_private.accept_guard_permission_v1(a, v_auth, p_request);
    ELSE
      result := admin_private.decline_guard_permission_v1(a, v_auth, p_request);
    END IF;
    safe := jsonb_build_object('status', result->>'status', 'actionStatus', result->>'actionStatus');
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, v_auth, fp, safe, now());
    RETURN safe;
  END IF;
  IF p_operation IN ('accept_price', 'decline_price') THEN
    IF a.kind <> 'GUARD_PRICE_CHANGE_ACCEPTANCE' OR NOT admin_private.customer_action_eligible_v1(a) THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = a.guard_subscription_id;
    IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM cov.customer_id OR sub.location_id IS DISTINCT FROM cov.location_id
      OR (sub.coverage_id IS NOT NULL AND sub.coverage_id IS DISTINCT FROM cov.id)
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF p_operation = 'accept_price' AND NOT admin_private.payment_external_lane_allowed_v1(p_data->>'declaredLivemode') THEN
      RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
    END IF;
    result := admin_private.accept_guard_price_change_v1(a, v_auth, p_request, p_operation = 'accept_price');
    safe := jsonb_strip_nulls(jsonb_build_object(
      'status', result->>'status',
      'actionStatus', result->>'actionStatus',
      'offerStatus', result->>'offerStatus',
      'unapplied', result->'unapplied',
      'reason', result->>'reason',
      'providerOperationId', result->>'providerOperationId',
      'idempotencyKey', result->>'idempotencyKey',
      'providerOperationStatus', result->>'providerOperationStatus',
      'subscriptionItemId', result->>'subscriptionItemId',
      'newStripePriceId', result->>'newStripePriceId',
      'oldStripePriceId', result->>'oldStripePriceId',
      'stripeSubscriptionId', result->>'stripeSubscriptionId',
      'stripeCustomerId', result->>'stripeCustomerId',
      'periodEnd', result->>'periodEnd',
      'cancelAtPeriodEnd', result->'cancelAtPeriodEnd'
    ));
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, v_auth, fp, safe, now());
    RETURN safe;
  END IF;
  IF a.kind <> 'GUARD_SUBSCRIPTION_START' OR a.guard_subscription_id IS NULL OR a.expires_at <= now()
    OR a.status NOT IN ('OPEN', 'COMPLETED')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation = 'accept_consent' THEN
    IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    result := admin_private.accept_guard_recurring_consent_v1(a, v_auth, p_request);
    safe := jsonb_build_object('status', result->>'status');
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, v_auth, fp, safe, now());
    RETURN safe;
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = a.guard_subscription_id;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM cov.customer_id OR sub.location_id IS DISTINCT FROM cov.location_id THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF sub.coverage_id IS NOT NULL AND sub.coverage_id IS DISTINCT FROM cov.id
    AND NOT EXISTS (
      SELECT 1 FROM public.guard_continuations cont
      WHERE cont.id = sub.continuation_id AND cont.customer_id = cov.customer_id
        AND (cont.included_coverage_id = cov.id OR cont.paid_coverage_id = cov.id)
    )
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO consent FROM public.guard_recurring_consents WHERE subscription_id = sub.id;
  caps := admin_private.customer_portal_guard_subscription_capabilities_v1(sub, consent.id IS NOT NULL);
  IF (p_operation = 'start_checkout' AND (caps->>'checkout') IS DISTINCT FROM 'true')
    OR (p_operation = 'start_recovery' AND (caps->>'recovery') IS DISTINCT FROM 'true')
    OR (p_operation = 'request_period_end_cancellation' AND (caps->>'periodEndCancellation') IS DISTINCT FROM 'true')
    OR (p_operation = 'undo_period_end_cancellation' AND (caps->>'undoPeriodEndCancellation') IS DISTINCT FROM 'true')
    OR (p_operation = 'request_immediate_cancellation' AND (caps->>'immediateCancellationReview') IS DISTINCT FROM 'true')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  RETURN admin_private.customer_guard_subscription_apply_v1(
    a, v_auth, p_request, fp, p_operation, p_data, a.guard_subscription_id
  );
END;
$portal$;

COMMIT;
