BEGIN;

-- Guided payment request after quotation-email acceptance.
-- Secure Action sessions and Customer Portal sessions are different.
-- This function accepts only an unexpired customer_action_sessions row for a
-- completed QUOTE_ACCEPTANCE. It does not call customer_portal_actor_v1, and a
-- portal token hash finds no action session.
-- public.customer_queue_guided_payment_request_v1 keeps its 900-second dispatch
-- hold so a payment completed in that portal visit can cancel the unsent email
-- before the provider is contacted. This action wrapper does not set a hold.
-- The queue body then uses its immediate default. A stored receipt still
-- cancels a queued email that has not had a provider attempt.
-- The body remains authoritative for the order, obligation, duplicate action,
-- paid, authority and snapshot checks. This file does not insert an action,
-- queue an email, or mark a payment.
-- Source only. Do not apply this file to DEV or Production from this change.

CREATE FUNCTION public.customer_action_queue_guided_payment_request_v1(
  p_token_hash text,
  p_request uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess admin_private.customer_action_sessions;
  act public.customer_actions;
  order_id uuid;
  ord public.service_orders;
  payload jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL OR p_payload IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_payload ? 'useCurrentVersion' OR p_payload ? 'actorType' OR p_payload ? 'dispatchHoldSeconds' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions
    WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  SELECT * INTO act FROM public.customer_actions WHERE id = sess.action_id;
  IF act.id IS NULL OR act.kind IS DISTINCT FROM 'QUOTE_ACCEPTANCE' OR act.status IS DISTINCT FROM 'COMPLETED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  BEGIN
    order_id := (p_payload->>'serviceOrderId')::uuid;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF order_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = order_id;
  IF ord.id IS NULL
    OR ord.customer_id IS DISTINCT FROM act.customer_id
    OR ord.case_id IS DISTINCT FROM act.case_id
    OR ord.business_id IS DISTINCT FROM act.business_id
    OR ord.location_id IS DISTINCT FROM act.location_id
    OR ord.quote_version_id IS DISTINCT FROM act.quote_version_id
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_acceptances acc
    WHERE acc.id = ord.quote_acceptance_id
      AND acc.quote_version_id = ord.quote_version_id
      AND acc.customer_action_id = act.id
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  payload := p_payload || jsonb_build_object('useCurrentVersion', true, 'actorType', 'CUSTOMER');
  RETURN admin_private.queue_guided_payment_request_body_v1(sess.auth_user_id, p_request, payload);
END;
$$;

REVOKE ALL ON FUNCTION public.customer_action_queue_guided_payment_request_v1(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_queue_guided_payment_request_v1(text, uuid, jsonb)
  TO service_role;

COMMIT;
