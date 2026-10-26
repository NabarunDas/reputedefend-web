BEGIN;

-- CUSTOMER-CHECKOUT-REFRESH-DEV-02. Source only. Do not apply to DEV or
-- Production from this change. It does not send mail, charge a card, copy a
-- Checkout URL, or create a second obligation.
--
-- An explicit refresh expires the open unpaid Checkout at Stripe first.
-- This function then replaces that one provider operation. A second call for
-- the same operation returns the replacement instead of opening another one.
-- A replacement created in the last two minutes is resumed rather than expired
-- again, so two tabs cannot leave two Checkout Sessions open.

CREATE OR REPLACE FUNCTION public.payment_replace_expired_checkout_v1(p_operation uuid, p_livemode boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op public.provider_operations; att public.payment_attempts; nxt public.provider_operations;
  next_att public.payment_attempts; n integer; ob public.payment_obligations; declared text;
  replacement_key uuid; digest text;
BEGIN
  declared := CASE WHEN p_livemode IS NULL THEN NULL WHEN p_livemode THEN 'true' ELSE 'false' END;
  IF NOT admin_private.payment_external_lane_allowed_v1(declared) THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  IF p_operation IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO op FROM public.provider_operations WHERE id = p_operation;
  IF op.id IS NULL OR op.kind NOT IN ('CREATE_CHECKOUT_SESSION','CREATE_SETUP_SESSION','CREATE_RECOVERY_SESSION') THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF op.obligation_id IS NOT NULL THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = op.obligation_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtextextended(ob.id::text, 14));
    IF admin_private.obligation_has_blocking_invoice_v1(op.obligation_id) THEN
      RETURN jsonb_build_object('status','denied','reason','invoice_issued');
    END IF;
  END IF;
  SELECT * INTO op FROM public.provider_operations WHERE id = p_operation FOR UPDATE;
  digest := md5('checkout-refresh:' || op.id::text);
  replacement_key := (
    substr(digest, 1, 8) || '-' || substr(digest, 9, 4) || '-' ||
    '4' || substr(digest, 14, 3) || '-' || '8' || substr(digest, 18, 3) || '-' ||
    substr(digest, 21, 12)
  )::uuid;
  IF op.status = 'SUCCEEDED' THEN RETURN jsonb_build_object('status','denied','reason','already_succeeded'); END IF;
  SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id FOR UPDATE;
  IF att.id IS NOT NULL AND att.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status','denied','reason','already_succeeded');
  END IF;
  IF op.status = 'CANCELLED' OR (att.id IS NOT NULL AND att.status = 'CANCELLED') THEN
    SELECT * INTO nxt FROM public.provider_operations WHERE idempotency_key = replacement_key;
    IF nxt.id IS NULL AND ob.id IS NOT NULL THEN
      SELECT * INTO next_att FROM public.payment_attempts
        WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
        ORDER BY created_at ASC LIMIT 1;
      IF next_att.id IS NOT NULL THEN
        SELECT * INTO nxt FROM public.provider_operations WHERE id = next_att.provider_operation_id;
      END IF;
    ELSIF nxt.id IS NOT NULL THEN
      SELECT * INTO next_att FROM public.payment_attempts WHERE provider_operation_id = nxt.id;
    END IF;
    IF nxt.id IS NULL OR nxt.status NOT IN ('PENDING','SUBMITTED') THEN
      RETURN jsonb_build_object('status','denied','reason','already_closed');
    END IF;
    RETURN jsonb_build_object(
      'status','success','replay', true, 'providerOperationId', nxt.id, 'idempotencyKey', nxt.idempotency_key,
      'attemptId', next_att.id, 'replacedOperationId', op.id, 'checkoutSessionId', next_att.stripe_checkout_session_id
    );
  END IF;
  IF att.id IS NOT NULL AND att.status IN ('CREATED','SUBMITTED','REQUIRES_ACTION') THEN
    UPDATE public.payment_attempts SET status = 'CANCELLED', failed_at = now(),
      failure_category = 'EXPIRED', failure_code = 'checkout_expired'
      WHERE id = att.id;
  END IF;
  UPDATE public.provider_operations SET status = 'CANCELLED' WHERE id = op.id AND status NOT IN ('SUCCEEDED','CANCELLED');
  INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
  VALUES (replacement_key, op.kind, op.purpose, op.customer_id, op.service_order_id, op.obligation_id, 'PENDING')
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO nxt FROM public.provider_operations WHERE idempotency_key = replacement_key;
  IF att.id IS NOT NULL THEN
    SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = att.obligation_id;
    INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
    VALUES (att.obligation_id, att.service_order_id, nxt.id, n, att.purpose, 'CREATED', att.amount_minor, att.currency)
    ON CONFLICT (provider_operation_id) DO NOTHING;
    SELECT * INTO next_att FROM public.payment_attempts WHERE provider_operation_id = nxt.id;
  END IF;
  RETURN jsonb_build_object(
    'status','success','replay', false,
    'providerOperationId', nxt.id, 'idempotencyKey', nxt.idempotency_key,
    'attemptId', next_att.id, 'replacedOperationId', op.id, 'checkoutSessionId', next_att.stripe_checkout_session_id
  );
END; $$;

REVOKE ALL ON FUNCTION public.payment_replace_expired_checkout_v1(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_replace_expired_checkout_v1(uuid, boolean) TO service_role;

CREATE FUNCTION public.customer_portal_checkout_attempt_v1(
  p_token_hash text, p_reference text, p_selector text, p_request uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_customer uuid; v_auth uuid; v_email text; v_case uuid; a public.customer_actions;
  ord public.service_orders; ob public.payment_obligations; att public.payment_attempts; op public.provider_operations;
  matches integer; fp text; cached jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_reference IS NULL OR p_selector IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  IF p_request IS NOT NULL THEN
    fp := md5(jsonb_build_array(p_reference, p_selector, 'refresh_checkout')::text);
    cached := admin_private.customer_action_receipt_v1(v_auth, p_request, fp);
    IF cached IS NOT NULL THEN RETURN cached; END IF;
  END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
  SELECT count(*) INTO matches FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF matches <> 1 THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT * INTO a FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF a.id IS NULL OR a.kind <> 'GUIDED_PAYMENT'
    OR lower(a.expected_email_snapshot) IS DISTINCT FROM lower(v_email)
    OR NOT admin_private.customer_action_eligible_v1(a)
  THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id AND customer_id = v_customer;
  SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id AND service_order_id = ord.id;
  IF ord.id IS NULL OR ob.id IS NULL OR ob.state IN ('PAID','VOID') OR ob.kind <> 'UPFRONT' THEN
    RETURN jsonb_build_object('status', CASE WHEN ob.state = 'PAID' THEN 'confirming' ELSE 'none' END);
  END IF;
  IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN
    RETURN jsonb_build_object('status','none');
  END IF;
  SELECT * INTO att FROM public.payment_attempts
    WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION') AND purpose = 'CHECKOUT'
    ORDER BY created_at ASC LIMIT 1;
  IF att.id IS NULL OR att.stripe_checkout_session_id IS NULL THEN
    RETURN jsonb_build_object('status','none');
  END IF;
  SELECT * INTO op FROM public.provider_operations WHERE id = att.provider_operation_id;
  IF op.id IS NULL OR op.kind <> 'CREATE_CHECKOUT_SESSION' OR op.customer_id <> v_customer OR op.status NOT IN ('PENDING','SUBMITTED') THEN
    RETURN jsonb_build_object('status','none');
  END IF;
  RETURN jsonb_build_object(
    'status', CASE
      WHEN EXISTS (
        SELECT 1 FROM public.payment_attempts prev
        WHERE prev.obligation_id = ob.id AND prev.id <> att.id AND prev.status = 'CANCELLED'
          AND prev.failure_code = 'checkout_expired' AND prev.failed_at > now() - interval '2 minutes'
      ) THEN 'resume' ELSE 'recorded' END,
    'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key, 'attemptId', att.id,
    'amountMinor', ob.amount_minor, 'currency', ob.currency, 'mode', 'payment',
    'customerId', ord.customer_id, 'serviceOrderId', ord.id, 'obligationId', ob.id,
    'orderRef', ord.public_ref, 'checkoutSessionId', att.stripe_checkout_session_id
  );
END; $$;

CREATE FUNCTION public.customer_portal_checkout_refresh_v1(
  p_token_hash text, p_request uuid, p_reference text, p_selector text, p_operation uuid, p_livemode boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_customer uuid; v_auth uuid; v_email text; v_case uuid; a public.customer_actions;
  ord public.service_orders; ob public.payment_obligations; op public.provider_operations;
  matches integer; fp text; cached jsonb; replaced jsonb; nxt public.payment_attempts;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_reference IS NULL OR p_selector IS NULL OR p_operation IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  fp := md5(jsonb_build_array(p_reference, p_selector, 'refresh_checkout')::text);
  cached := admin_private.customer_action_receipt_v1(v_auth, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
  SELECT count(*) INTO matches FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF matches <> 1 THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT * INTO a FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector
  FOR UPDATE;
  IF a.id IS NULL OR a.kind <> 'GUIDED_PAYMENT'
    OR lower(a.expected_email_snapshot) IS DISTINCT FROM lower(v_email)
    OR NOT admin_private.customer_action_eligible_v1(a)
  THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id AND customer_id = v_customer;
  SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id AND service_order_id = ord.id FOR UPDATE;
  IF ord.id IS NULL OR ob.id IS NULL THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  IF ob.state = 'PAID' THEN RETURN jsonb_build_object('status','confirming'); END IF;
  IF ob.state = 'VOID' OR ob.kind <> 'UPFRONT' THEN RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO op FROM public.provider_operations WHERE id = p_operation;
  IF op.id IS NULL OR op.customer_id <> v_customer OR op.obligation_id IS DISTINCT FROM ob.id
    OR op.service_order_id IS DISTINCT FROM ord.id OR op.kind <> 'CREATE_CHECKOUT_SESSION'
  THEN RETURN jsonb_build_object('status','denied','reason','stale'); END IF;
  replaced := public.payment_replace_expired_checkout_v1(op.id, p_livemode);
  IF replaced->>'status' = 'denied' AND replaced->>'reason' = 'already_succeeded' THEN
    RETURN jsonb_build_object('status','confirming');
  END IF;
  IF replaced->>'status' IS DISTINCT FROM 'success' OR replaced->>'providerOperationId' IS NULL THEN
    RETURN replaced;
  END IF;
  SELECT * INTO nxt FROM public.payment_attempts WHERE provider_operation_id = (replaced->>'providerOperationId')::uuid;
  replaced := replaced || jsonb_build_object(
    'amountMinor', ob.amount_minor, 'currency', ob.currency, 'mode', 'payment',
    'customerId', ord.customer_id, 'serviceOrderId', ord.id, 'obligationId', ob.id,
    'orderRef', ord.public_ref, 'attemptId', COALESCE(nxt.id, NULLIF(replaced->>'attemptId','')::uuid),
    'checkoutSessionId', nxt.stripe_checkout_session_id
  );
  INSERT INTO admin_private.customer_action_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, v_auth, fp, replaced);
  RETURN replaced;
END; $$;

REVOKE ALL ON FUNCTION public.customer_portal_checkout_attempt_v1(text, text, text, uuid),
  public.customer_portal_checkout_refresh_v1(text, uuid, text, text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_checkout_attempt_v1(text, text, text, uuid),
  public.customer_portal_checkout_refresh_v1(text, uuid, text, text, uuid, boolean)
  TO service_role;

COMMIT;
