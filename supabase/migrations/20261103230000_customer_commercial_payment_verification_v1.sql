-- Commercial payment verification read model.
-- Repository file only. The verified DEV ledger contains 101 entries and ends at 20261103213000.
-- Do not apply 20261103230000 to DEV. Do not apply 20261103230000 to Production.
-- Do not replay 20261103213000. Do not apply 20261103213000 to Production.
-- This file does not insert commercial_payment_evidence, change a subscription,
-- grant an entitlement, activate a service, or send mail.
-- The evidence-blocking trigger is unchanged.
-- It replaces only the Checkout session id check and the session pattern inside
-- commercial_payment_record_checkout_v1. The applied 20261103213000 file is unchanged.
-- A stored session remains correlation, not payment evidence.

BEGIN;

ALTER TABLE public.commercial_checkout_preparations
  DROP CONSTRAINT commercial_checkout_preparations_checkout_session_id_check;

ALTER TABLE public.commercial_checkout_preparations
  ADD CONSTRAINT commercial_checkout_preparations_checkout_session_id_check
  CHECK (
    checkout_session_id IS NULL
    OR checkout_session_id ~ '^cs_[A-Za-z0-9][A-Za-z0-9_]{7,248}$'
  );

CREATE OR REPLACE FUNCTION public.commercial_payment_record_checkout_v1(
  p_operation uuid,
  p_session_id text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.provider_operations;
  prep public.commercial_checkout_preparations;
  recorded jsonb;
  sub_state text;
  stripe_sub text;
  evidence integer;
BEGIN
  IF p_operation IS NULL OR p_session_id IS NULL OR p_session_id !~ '^cs_[A-Za-z0-9][A-Za-z0-9_]{7,248}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO prep
  FROM public.commercial_checkout_preparations
  WHERE checkout_operation_id = p_operation
  FOR UPDATE;
  IF prep.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO op
  FROM public.provider_operations
  WHERE id = p_operation
    AND kind = 'CREATE_SUBSCRIPTION_CHECKOUT'
    AND purpose = 'COMMERCIAL_CHECKOUT'
    AND commercial_subscription_id = prep.subscription_id
  FOR UPDATE;
  IF op.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF op.status = 'SUCCEEDED' OR prep.checkout_session_id IS NOT NULL AND prep.checkout_session_id = p_session_id AND op.status = 'SUBMITTED' THEN
    SELECT state, stripe_subscription_id INTO sub_state, stripe_sub
    FROM public.commercial_subscriptions WHERE id = prep.subscription_id;
    IF sub_state IS DISTINCT FROM 'PAYMENT_PENDING' OR stripe_sub IS NOT NULL THEN
      RAISE EXCEPTION 'a commercial checkout session is not payment evidence';
    END IF;
    RETURN jsonb_build_object('status', 'success', 'activated', false, 'providerOperationStatus', op.status);
  END IF;
  IF prep.checkout_session_id IS NOT NULL AND prep.checkout_session_id IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF op.status NOT IN ('PENDING', 'SUBMITTED') THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  recorded := public.payment_record_provider_refs_v1(p_operation, p_session_id, 'checkout.session', 'SUBMITTED');
  IF recorded ->> 'status' IS DISTINCT FROM 'success' THEN
    RETURN recorded;
  END IF;
  UPDATE public.commercial_checkout_preparations
  SET checkout_session_id = coalesce(checkout_session_id, p_session_id)
  WHERE id = prep.id
    AND (checkout_session_id IS NULL OR checkout_session_id = p_session_id);
  UPDATE public.provider_operations
  SET status = 'SUBMITTED'
  WHERE id = op.id
    AND status IS DISTINCT FROM 'SUCCEEDED'
    AND purpose = 'COMMERCIAL_CHECKOUT';
  SELECT state, stripe_subscription_id INTO sub_state, stripe_sub
  FROM public.commercial_subscriptions
  WHERE id = prep.subscription_id;
  SELECT count(*) INTO evidence
  FROM public.commercial_payment_evidence
  WHERE subscription_id = prep.subscription_id;
  IF sub_state IS DISTINCT FROM 'PAYMENT_PENDING' OR stripe_sub IS NOT NULL OR evidence <> 0 THEN
    RAISE EXCEPTION 'a commercial checkout session is not payment evidence';
  END IF;
  RETURN jsonb_build_object('status', 'success', 'activated', false, 'providerOperationStatus', 'SUBMITTED');
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_payment_record_checkout_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_payment_record_checkout_v1(uuid, text) TO service_role;

CREATE FUNCTION public.commercial_payment_receipt_v1(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE rec admin_private.stripe_event_receipts;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{4,160}$' THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'not_received');
  END IF;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id;
  IF rec.provider_event_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'not_received');
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'eventId', rec.provider_event_id,
    'eventType', rec.event_type,
    'objectId', rec.provider_object_id,
    'livemode', rec.livemode,
    'processed', rec.processed
  );
END;
$$;

CREATE FUNCTION admin_private.commercial_payment_preparation_snapshot_v1(p_prep public.commercial_checkout_preparations)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sub public.commercial_subscriptions;
  acc public.commercial_offer_acceptances;
  mapped text;
  evidence jsonb;
BEGIN
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_prep.subscription_id;
  SELECT * INTO acc FROM public.commercial_offer_acceptances WHERE id = p_prep.acceptance_id;
  IF sub.id IS NULL OR acc.id IS NULL
    OR acc.subscription_id IS DISTINCT FROM sub.id
    OR acc.customer_id IS DISTINCT FROM p_prep.customer_id
    OR sub.customer_id IS DISTINCT FROM p_prep.customer_id
    OR sub.business_id IS DISTINCT FROM p_prep.business_id
    OR sub.grant_kind IS DISTINCT FROM 'BILLABLE'
    OR acc.amount_minor IS DISTINCT FROM p_prep.amount_minor
    OR acc.currency IS DISTINCT FROM p_prep.currency
    OR acc.cadence IS DISTINCT FROM p_prep.cadence
    OR acc.tax_behaviour IS DISTINCT FROM p_prep.tax_behaviour
    OR acc.guard_quantity IS DISTINCT FROM p_prep.guard_quantity
  THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'preparation');
  END IF;
  SELECT stripe_customer_id INTO mapped
  FROM public.stripe_customer_maps
  WHERE customer_id = p_prep.customer_id AND livemode = p_prep.livemode;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'eventId', evidence_row.provider_event_id,
    'periodStart', evidence_row.period_start,
    'periodEnd', evidence_row.period_end
  )), '[]'::jsonb)
  INTO evidence
  FROM public.commercial_payment_evidence evidence_row
  WHERE evidence_row.subscription_id = p_prep.subscription_id;
  RETURN jsonb_build_object(
    'status', 'success',
    'productCode', acc.product_code,
    'checkoutSessionId', p_prep.checkout_session_id,
    'stripePriceId', p_prep.stripe_price_id,
    'stripeCustomerId', mapped,
    'customerId', p_prep.customer_id,
    'commercialSubscriptionId', p_prep.subscription_id,
    'acceptanceId', p_prep.acceptance_id,
    'checkoutOperationId', p_prep.checkout_operation_id,
    'amountMinor', acc.amount_minor,
    'currency', acc.currency,
    'cadence', acc.cadence,
    'taxBehaviour', acc.tax_behaviour,
    'guardQuantity', acc.guard_quantity,
    'livemode', p_prep.livemode,
    'subscriptionState', sub.state,
    'stripeSubscriptionId', sub.stripe_subscription_id,
    'cancelAtPeriodEnd', sub.cancel_at_period_end,
    'evidence', evidence
  );
END;
$$;

CREATE FUNCTION public.commercial_payment_preparation_for_session_v1(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE prep public.commercial_checkout_preparations;
BEGIN
  IF p_session_id IS NULL OR p_session_id !~ '^cs_[A-Za-z0-9][A-Za-z0-9_]{7,248}$' THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'session');
  END IF;
  SELECT * INTO prep FROM public.commercial_checkout_preparations WHERE checkout_session_id = p_session_id;
  IF prep.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'preparation');
  END IF;
  RETURN admin_private.commercial_payment_preparation_snapshot_v1(prep);
END;
$$;

CREATE FUNCTION public.commercial_payment_preparation_for_price_v1(p_price_id text, p_stripe_customer_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prep public.commercial_checkout_preparations;
  matches integer;
BEGIN
  IF p_price_id IS NULL OR p_price_id !~ '^price_[A-Za-z0-9]+$'
    OR p_stripe_customer_id IS NULL OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
  THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'price');
  END IF;
  SELECT count(*)::int INTO matches
  FROM public.commercial_checkout_preparations preparation
  JOIN public.stripe_customer_maps map
    ON map.customer_id = preparation.customer_id
   AND map.livemode = preparation.livemode
   AND map.stripe_customer_id = p_stripe_customer_id
  WHERE preparation.stripe_price_id = p_price_id;
  IF matches = 0 THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'preparation');
  END IF;
  IF matches > 1 THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'ambiguous_price');
  END IF;
  SELECT preparation.* INTO prep
  FROM public.commercial_checkout_preparations preparation
  JOIN public.stripe_customer_maps map
    ON map.customer_id = preparation.customer_id
   AND map.livemode = preparation.livemode
   AND map.stripe_customer_id = p_stripe_customer_id
  WHERE preparation.stripe_price_id = p_price_id;
  RETURN admin_private.commercial_payment_preparation_snapshot_v1(prep);
END;
$$;

CREATE FUNCTION public.commercial_payment_invoice_candidates_v1(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE batch integer; events jsonb;
BEGIN
  batch := least(greatest(coalesce(p_limit, 20), 1), 20);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'eventId', picked.event_id,
    'eventType', picked.event_type,
    'objectId', picked.object_id
  ) ORDER BY picked.available_at, picked.event_id), '[]'::jsonb)
  INTO events
  FROM (
    SELECT
      o.payload->>'eventId' AS event_id,
      o.payload->>'eventType' AS event_type,
      o.payload->>'objectId' AS object_id,
      o.available_at
    FROM admin_private.job_outbox o
    JOIN admin_private.stripe_event_receipts r
      ON r.provider_event_id = o.payload->>'eventId'
    WHERE o.topic = 'PROCESS_STRIPE_EVENT'
      AND o.payload->>'livemode' = 'false'
      AND r.livemode IS FALSE
      AND r.event_type = o.payload->>'eventType'
      AND r.event_type IN (
        'invoice.paid',
        'invoice.payment_failed',
        'invoice.payment_action_required',
        'invoice.marked_uncollectible',
        'invoice.voided'
      )
      AND nullif(o.payload->>'objectId', '') IS NOT NULL
      AND r.provider_object_id = o.payload->>'objectId'
      AND o.available_at <= now()
      AND r.processed IS FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.guard_subscription_invoices guard_invoice
        WHERE guard_invoice.stripe_invoice_id = o.payload->>'objectId'
      )
      AND NOT EXISTS (
        SELECT 1 FROM admin_private.jobs j
        WHERE j.outbox_id = o.id AND j.status = 'SUCCEEDED'
      )
    ORDER BY o.available_at, o.id
    LIMIT batch
  ) picked;
  RETURN jsonb_build_object('status', 'success', 'events', events);
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_payment_receipt_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_payment_preparation_snapshot_v1(public.commercial_checkout_preparations) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_payment_preparation_for_session_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_payment_preparation_for_price_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_payment_invoice_candidates_v1(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_payment_receipt_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_payment_preparation_for_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_payment_preparation_for_price_v1(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_payment_invoice_candidates_v1(integer) TO service_role;

COMMIT;
