-- COM-GROSS-01. Source only.
-- Do not apply this file to DEV or Production without separate approval.
-- It does not change catalogue amounts, seller_vat_position, or existing rows.
-- It does not enable Stripe, send mail, or mark the paid-service agreement operative.
-- It does not move ApprovedMigrationHead.
--
-- For the five published services, a new or repriced quote version must keep
-- total_amount_minor equal to quoted_subtotal_minor. EXCLUSIVE is rejected
-- because it adds tax on top. INCLUSIVE tax stays inside that same total and
-- needs a real rate. UNCONFIRMED and NOT_APPLICABLE keep a null rate and zero
-- tax. An update that does not change the money fields is left as stored, so
-- an already accepted quote is not rewritten. Moving a stored draft or offer
-- into OFFERED or ACCEPTED is a new binding step, so that transition is
-- checked even when the money columns stay the same. A violation aborts the
-- update and does not change the stored row. Cancelling, superseding or
-- expiring a historical draft is not a new offer. Starting a checkout,
-- invoice, recovery or setup for an already accepted over-gross order is
-- refused and does not rewrite that order or quote.

BEGIN;

CREATE FUNCTION admin_private.enforce_gross_customer_price_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  expected_tax integer;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.tax_behaviour IS NOT DISTINCT FROM OLD.tax_behaviour
    AND NEW.tax_rate_bps IS NOT DISTINCT FROM OLD.tax_rate_bps
    AND NEW.tax_amount_minor IS NOT DISTINCT FROM OLD.tax_amount_minor
    AND NEW.total_amount_minor IS NOT DISTINCT FROM OLD.total_amount_minor
    AND NEW.quoted_subtotal_minor IS NOT DISTINCT FROM OLD.quoted_subtotal_minor
    AND NEW.standard_amount_minor IS NOT DISTINCT FROM OLD.standard_amount_minor
    AND NEW.discount_amount_minor IS NOT DISTINCT FROM OLD.discount_amount_minor
    AND NOT (
      OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('OFFERED', 'ACCEPTED')
    )
  THEN
    RETURN NEW;
  END IF;

  IF NEW.service_code NOT IN (
    'GUIDED_RELAUNCH', 'MANAGED_RELAUNCH', 'GUIDED_REVIEW', 'MANAGED_REVIEW', 'RELAUNCH_GUARD'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.tax_behaviour = 'EXCLUSIVE' THEN
    RAISE EXCEPTION 'gross_price:exclusive_adds_tax' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.total_amount_minor IS DISTINCT FROM NEW.quoted_subtotal_minor THEN
    RAISE EXCEPTION 'gross_price:total_above_gross' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.tax_behaviour IN ('UNCONFIRMED', 'NOT_APPLICABLE') THEN
    IF NEW.tax_rate_bps IS NOT NULL OR NEW.tax_amount_minor IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'gross_price:tax_not_zero' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.tax_behaviour = 'INCLUSIVE' THEN
    expected_tax := admin_private.money_tax_minor_v1(NEW.quoted_subtotal_minor, NEW.tax_behaviour, NEW.tax_rate_bps);
    IF NEW.tax_rate_bps IS NULL OR expected_tax IS NULL OR NEW.tax_amount_minor IS DISTINCT FROM expected_tax THEN
      RAISE EXCEPTION 'gross_price:inclusive_breakdown' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'gross_price:unsupported_tax' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.enforce_gross_customer_price_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER quote_versions_binding_gross_price
BEFORE INSERT OR UPDATE ON public.quote_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.enforce_gross_customer_price_v1();

CREATE FUNCTION admin_private.provider_operation_gross_price_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  ord public.service_orders;
  qv public.quote_versions;
  sub public.guard_subscriptions;
BEGIN
  IF NEW.kind NOT IN (
    'CREATE_CHECKOUT_SESSION', 'CREATE_INVOICE', 'CREATE_SUBSCRIPTION_CHECKOUT',
    'CREATE_RECOVERY_SESSION', 'CREATE_SETUP_SESSION', 'CREATE_RECOVERY_CHECKOUT'
  ) THEN
    RETURN NEW;
  END IF;
  IF NEW.service_order_id IS NOT NULL THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = NEW.service_order_id;
  END IF;
  IF ord.id IS NULL AND NEW.guard_subscription_id IS NOT NULL THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NEW.guard_subscription_id;
    IF sub.service_order_id IS NOT NULL THEN
      SELECT * INTO ord FROM public.service_orders WHERE id = sub.service_order_id;
    END IF;
  END IF;
  IF ord.id IS NULL THEN
    RETURN NEW;
  END IF;
  IF ord.service_code NOT IN (
    'GUIDED_RELAUNCH', 'MANAGED_RELAUNCH', 'GUIDED_REVIEW', 'MANAGED_REVIEW', 'RELAUNCH_GUARD'
  ) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF qv.id IS NULL THEN
    RETURN NEW;
  END IF;
  IF qv.tax_behaviour = 'EXCLUSIVE' OR ord.tax_behaviour = 'EXCLUSIVE' THEN
    RAISE EXCEPTION 'gross_price:exclusive_adds_tax' USING ERRCODE = 'P0001';
  END IF;
  IF qv.total_amount_minor IS DISTINCT FROM qv.quoted_subtotal_minor
    OR ord.amount_minor IS DISTINCT FROM qv.quoted_subtotal_minor
  THEN
    RAISE EXCEPTION 'gross_price:total_above_gross' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.provider_operation_gross_price_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER provider_operations_binding_gross_price
BEFORE INSERT ON public.provider_operations
FOR EACH ROW EXECUTE FUNCTION admin_private.provider_operation_gross_price_v1();

CREATE OR REPLACE FUNCTION public.admin_quote_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb;
BEGIN
  IF p_operation IS DISTINCT FROM 'record_qualification' THEN
    BEGIN
      RETURN admin_private.admin_quote_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
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
      RAISE;
    END;
  END IF;
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384 THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.quote_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  result := admin_private.record_guard_linked_qualification_v1(actor, p_request, data);
  IF result->>'status' = 'success' THEN
    INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
  END IF;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_payment_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
    RAISE;
  END;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_payment_command_v1(p_token_hash text, p_request uuid, p_operation text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $payment$
DECLARE
  sess admin_private.customer_action_sessions;
  fp text;
  result jsonb;
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
  BEGIN
    result := admin_private.customer_payment_apply_v1(
      sess.action_id, sess.auth_user_id, p_request, fp, p_operation, p_data,
      'CUSTOMER_OTP', NULL, NULL, NULL
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'gross_price:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', split_part(SQLERRM, ':', 2),
        'message', 'The quoted total is the final customer price. Tax cannot be added on top.'
      );
    END IF;
    RAISE;
  END;
  RETURN result;
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
  result jsonb;
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
  BEGIN
    result := admin_private.customer_guard_subscription_apply_v1(
      a, sess.auth_user_id, p_request, fp, p_operation, coalesce(p_data, '{}'::jsonb), sub.id
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'gross_price:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', split_part(SQLERRM, ':', 2),
        'message', 'The quoted total is the final customer price. Tax cannot be added on top.'
      );
    END IF;
    RAISE;
  END;
  RETURN result;
END;
$command$;

CREATE OR REPLACE FUNCTION admin_private.record_paid_service_acceptance_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  BEGIN
    RETURN admin_private.record_paid_service_acceptance_body_v1(p_action, p_actor, p_request, p_data);
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
END; $$;

COMMIT;
