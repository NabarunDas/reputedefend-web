BEGIN;

-- UX-10G. The portal session cannot call customer_payment_command_v1, because
-- that function is bound to an emailed action session. Manufacturing an action
-- session from a portal session would mix the two channels. This migration
-- moves the existing payment mutation into one private helper and adds a
-- customer-safe read model. It does not create a table, change money, or mark
-- anything paid.
--
-- Rollback: DROP the new functions, then restore public.customer_payment_command_v1
-- from 20260930132106_stripe_payments_v1.sql. Do not edit that applied file.
-- Forward fix: a later migration may CREATE OR REPLACE these functions.
-- No new index: lookups use the existing customer, case and order keys, and
-- the opaque selectors are computed rather than stored.
-- This migration is source review only. Do not apply it from this change.

CREATE FUNCTION admin_private.customer_portal_receipt_selector_v1(p_receipt uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=''
AS $$
  SELECT 'rc-' || encode(extensions.digest(p_receipt::text, 'sha256'), 'hex');
$$;

-- Single payment mutation used by the secure-link command and the portal.
-- The caller supplies the receipt fingerprint. Internal provider identifiers
-- stay in this server result so checkout can be prepared. They are not part
-- of the customer projection.
CREATE FUNCTION admin_private.customer_payment_apply_v1(
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
  att public.payment_attempts;
  n integer;
  prior public.payment_attempts;
BEGIN
  IF p_action_id IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_fingerprint IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('confirm_consent', 'start_checkout')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
    OR p_channel IS NULL OR p_channel NOT IN ('CUSTOMER_OTP', 'CUSTOMER_PORTAL')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := p_fingerprint;
  cached := admin_private.customer_action_receipt_v1(p_actor, p_request, fp);
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
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(sess.action_id, p_operation, p_data)::text);
  RETURN admin_private.customer_payment_apply_v1(
    sess.action_id, sess.auth_user_id, p_request, fp, p_operation, p_data,
    'CUSTOMER_OTP', NULL, NULL, NULL
  );
END;
$payment$;

CREATE FUNCTION admin_private.customer_portal_case_payments_body_v1(
  p_case uuid, p_customer uuid, p_email text
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=''
AS $body$
  SELECT jsonb_build_object(
    'reference', c.public_ref,
    'businessName', b.display_name,
    'locationName', l.location_name,
    'serviceTrack', c.service_track,
    'orders', coalesce((
      SELECT jsonb_agg(order_row.item ORDER BY order_row.item->>'orderRef')
      FROM (
        SELECT jsonb_build_object(
          'orderRef', ord.public_ref,
          'serviceName', qv.service_name,
          'amountMinor', ord.amount_minor,
          'currency', ord.currency,
          'taxBehaviour', ord.tax_behaviour,
          'taxAmountMinor', ord.tax_amount_minor,
          'paymentModel', ord.payment_model,
          'paymentMethodSaved', EXISTS (
            SELECT 1 FROM public.saved_payment_methods pm
            WHERE pm.service_order_id = ord.id AND pm.customer_id = p_customer AND pm.status = 'USABLE'
          ),
          'consent', CASE WHEN ord.payment_model = 'SUCCESS_FEE' THEN jsonb_build_object(
            'recorded', consent.id IS NOT NULL,
            'text', consent.consent_text
          ) ELSE NULL END,
          'consentOfferText', CASE WHEN EXISTS (
            SELECT 1 FROM public.customer_actions setup
            WHERE setup.service_order_id = ord.id AND setup.case_id = p_case AND setup.customer_id = p_customer
              AND lower(setup.expected_email_snapshot) = lower(p_email)
              AND setup.kind = 'MANAGED_PAYMENT_SETUP'
              AND admin_private.customer_action_eligible_v1(setup)
              AND NOT EXISTS (SELECT 1 FROM public.payment_consents recorded WHERE recorded.service_order_id = ord.id)
          ) THEN admin_private.success_fee_consent_text_v1() ELSE NULL END,
          'obligations', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'kind', CASE ob.kind WHEN 'UPFRONT' THEN 'upfront' WHEN 'SUCCESS_FEE' THEN 'success_fee' END,
              'state', ob.state,
              'amountMinor', ob.amount_minor,
              'currency', ob.currency,
              'taxBehaviour', ob.tax_behaviour,
              'taxAmountMinor', ob.tax_amount_minor,
              'invoice', (
                SELECT jsonb_build_object(
                  'status', inv.status,
                  'hostedAvailable', inv.hosted_invoice_url IS NOT NULL AND inv.status = 'ISSUED' AND EXISTS (
                    SELECT 1 FROM public.customer_actions ia
                    WHERE ia.payment_invoice_id = inv.id AND ia.kind = 'INVOICE_PAYMENT'
                      AND ia.customer_id = p_customer AND ia.case_id = p_case
                      AND lower(ia.expected_email_snapshot) = lower(p_email)
                      AND admin_private.customer_action_eligible_v1(ia)
                  )
                )
                FROM public.payment_invoices inv
                WHERE inv.obligation_id = ob.id AND inv.customer_id = p_customer AND inv.status <> 'DRAFT'
                ORDER BY inv.created_at DESC
                LIMIT 1
              )
            ) ORDER BY ob.created_at)
            FROM public.payment_obligations ob
            WHERE ob.service_order_id = ord.id AND ob.customer_id = p_customer AND ob.case_id = p_case
          ), '[]'::jsonb),
          'receipts', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'selector', admin_private.customer_portal_receipt_selector_v1(r.id),
              'amountMinor', r.amount_minor,
              'currency', r.currency,
              'taxBehaviour', r.tax_behaviour,
              'taxAmountMinor', r.tax_amount_minor,
              'paidAt', r.paid_at
            ) ORDER BY r.paid_at)
            FROM public.payment_receipts r
            WHERE r.service_order_id = ord.id AND r.customer_id = p_customer
          ), '[]'::jsonb)
        ) AS item
        FROM public.service_orders ord
        JOIN public.quote_versions qv ON qv.id = ord.quote_version_id
        LEFT JOIN public.payment_consents consent ON consent.service_order_id = ord.id AND consent.customer_id = p_customer
        WHERE ord.case_id = p_case AND ord.customer_id = p_customer
      ) order_row
    ), '[]'::jsonb),
    'actions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'selector', admin_private.customer_portal_action_selector_v1(a.id),
        'kind', CASE a.kind
          WHEN 'GUIDED_PAYMENT' THEN 'guided_payment'
          WHEN 'MANAGED_PAYMENT_SETUP' THEN 'managed_setup'
          WHEN 'PAYMENT_RECOVERY' THEN 'recovery'
          WHEN 'INVOICE_PAYMENT' THEN 'invoice'
        END,
        'orderRef', ord.public_ref
      ) ORDER BY a.created_at)
      FROM public.customer_actions a
      JOIN public.service_orders ord ON ord.id = a.service_order_id
      WHERE a.case_id = p_case AND a.customer_id = p_customer
        AND ord.customer_id = p_customer AND ord.case_id = p_case
        AND lower(a.expected_email_snapshot) = lower(p_email)
        AND a.kind IN ('GUIDED_PAYMENT', 'MANAGED_PAYMENT_SETUP', 'PAYMENT_RECOVERY', 'INVOICE_PAYMENT')
        AND admin_private.customer_action_eligible_v1(a)
        AND (
          a.kind NOT IN ('GUIDED_PAYMENT', 'PAYMENT_RECOVERY')
          OR NOT EXISTS (
            SELECT 1 FROM public.payment_obligations blocked
            WHERE blocked.id = a.payment_obligation_id AND blocked.state IN ('PAID', 'VOID')
          )
        )
        AND (
          a.kind <> 'INVOICE_PAYMENT'
          OR EXISTS (
            SELECT 1 FROM public.payment_invoices open_inv
            WHERE open_inv.id = a.payment_invoice_id AND open_inv.customer_id = p_customer AND open_inv.status = 'ISSUED'
          )
        )
    ), '[]'::jsonb)
  )
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  LEFT JOIN public.locations l ON l.id = c.location_id
  WHERE c.id = p_case AND c.customer_id = p_customer;
$body$;

CREATE FUNCTION public.customer_portal_payments_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $list$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_cases jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(body.item ORDER BY body.submitted_at DESC, body.reference DESC), '[]'::jsonb)
    INTO v_cases
  FROM (
    SELECT c.submitted_at, c.public_ref AS reference,
      admin_private.customer_portal_case_payments_body_v1(c.id, v_customer, v_email) AS item
    FROM public.cases c
    WHERE c.customer_id = v_customer
      AND EXISTS (
        SELECT 1 FROM public.service_orders ord
        WHERE ord.case_id = c.id AND ord.customer_id = v_customer
      )
  ) body
  WHERE body.item IS NOT NULL;
  RETURN jsonb_build_object('cases', coalesce(v_cases, '[]'::jsonb));
END;
$list$;

CREATE FUNCTION public.customer_portal_case_payments_v1(p_token_hash text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $case$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_case uuid;
  v_body jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_reference IS NULL OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  v_body := admin_private.customer_portal_case_payments_body_v1(v_case, v_customer, v_email);
  IF v_body IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('found', true, 'case', v_body);
END;
$case$;

CREATE FUNCTION public.customer_portal_payment_command_v1(
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
    OR p_data IS DISTINCT FROM jsonb_build_object('idempotencyKey', p_data->>'idempotencyKey')
  ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
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

CREATE FUNCTION public.customer_portal_receipt_v1(p_token_hash text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $receipt$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_row jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_selector IS NULL OR p_selector !~ '^rc-[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT jsonb_build_object(
    'status', 'ok',
    'reference', cs.public_ref,
    'orderRef', ord.public_ref,
    'amountMinor', r.amount_minor,
    'currency', r.currency,
    'taxBehaviour', r.tax_behaviour,
    'taxAmountMinor', r.tax_amount_minor,
    'paidAt', r.paid_at
  ) INTO v_row
  FROM public.payment_receipts r
  JOIN public.service_orders ord ON ord.id = r.service_order_id AND ord.customer_id = v_customer
  JOIN public.cases cs ON cs.id = ord.case_id AND cs.customer_id = v_customer
  WHERE r.customer_id = v_customer
    AND admin_private.customer_portal_receipt_selector_v1(r.id) = p_selector;
  IF v_row IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  RETURN v_row;
END;
$receipt$;

-- The hosted invoice address is returned only to the service role so the
-- portal can redirect. The customer projection never includes it.
CREATE FUNCTION public.customer_portal_invoice_target_v1(
  p_token_hash text, p_reference text, p_selector text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $invoice$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_case uuid;
  a public.customer_actions;
  inv public.payment_invoices;
  matches integer;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_reference IS NULL OR p_selector IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT count(*) INTO matches
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF matches <> 1 THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO a
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF a.id IS NULL OR a.kind <> 'INVOICE_PAYMENT'
    OR lower(a.expected_email_snapshot) IS DISTINCT FROM lower(v_email)
    OR NOT admin_private.customer_action_eligible_v1(a)
  THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO inv FROM public.payment_invoices
  WHERE id = a.payment_invoice_id AND customer_id = v_customer AND obligation_id = a.payment_obligation_id;
  IF inv.id IS NULL OR inv.status <> 'ISSUED' THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF inv.hosted_invoice_url IS NULL OR btrim(inv.hosted_invoice_url) = '' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN jsonb_build_object('status', 'redirect', 'hostedInvoiceUrl', inv.hosted_invoice_url);
END;
$invoice$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_receipt_selector_v1(uuid),
  admin_private.customer_payment_apply_v1(uuid, uuid, uuid, text, text, jsonb, text, uuid, uuid, text),
  admin_private.customer_portal_case_payments_body_v1(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_payment_command_v1(text, uuid, text, jsonb),
  public.customer_portal_payments_v1(text),
  public.customer_portal_case_payments_v1(text, text),
  public.customer_portal_payment_command_v1(text, uuid, text, text, text, jsonb),
  public.customer_portal_receipt_v1(text, text),
  public.customer_portal_invoice_target_v1(text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_payment_command_v1(text, uuid, text, jsonb),
  public.customer_portal_payments_v1(text),
  public.customer_portal_case_payments_v1(text, text),
  public.customer_portal_payment_command_v1(text, uuid, text, text, text, jsonb),
  public.customer_portal_receipt_v1(text, text),
  public.customer_portal_invoice_target_v1(text, text, text)
  TO service_role;

COMMIT;
