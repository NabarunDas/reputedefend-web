BEGIN;

-- UX-10F. Portal quotes, agreements and permissions use the same commercial
-- mutations as the emailed secure-action command. No new commercial table.

CREATE FUNCTION admin_private.customer_portal_action_selector_v1(p_action uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=''
AS $$
  SELECT 'ca-' || encode(extensions.digest(p_action::text, 'sha256'), 'hex');
$$;

-- Single commercial mutation used by the secure-link command and the portal.
-- The caller supplies the receipt fingerprint. This function locks the action,
-- re-checks scope, and writes the receipt only for a completed attempt.
CREATE FUNCTION admin_private.customer_commercial_apply_v1(
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
  v public.agreement_versions;
  auth public.authorization_records;
  qv public.quote_versions;
  qu public.quotes;
  cached jsonb;
  result jsonb;
  existing_auth uuid;
  detail_source text;
BEGIN
  IF p_action_id IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_fingerprint IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('accept', 'decline', 'revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
    OR p_channel IS NULL OR p_channel NOT IN ('CUSTOMER_OTP', 'CUSTOMER_PORTAL')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  cached := admin_private.customer_action_receipt_v1(p_actor, p_request, p_fingerprint);
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
  detail_source := CASE WHEN p_channel = 'CUSTOMER_PORTAL' THEN 'CUSTOMER_PORTAL' ELSE 'CUSTOMER_OTP' END;

  IF p_operation = 'accept' AND a.kind = 'QUOTE_ACCEPTANCE' THEN
    IF p_data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF a.status = 'COMPLETED' OR EXISTS (
      SELECT 1 FROM public.quote_acceptances WHERE quote_version_id = a.quote_version_id
    ) THEN
      result := admin_private.accept_quote_version_v1(a, p_actor, p_request);
      INSERT INTO admin_private.customer_action_command_receipts
        VALUES (p_request, p_actor, p_fingerprint, result, now());
      RETURN result;
    END IF;
  END IF;

  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF p_operation IN ('accept', 'decline') AND a.kind = 'QUOTE_ACCEPTANCE' THEN
    IF p_operation = 'accept' THEN
      result := admin_private.accept_quote_version_v1(a, p_actor, p_request);
      INSERT INTO admin_private.customer_action_command_receipts
        VALUES (p_request, p_actor, p_fingerprint, result, now());
      RETURN result;
    END IF;
    IF p_channel = 'CUSTOMER_PORTAL' AND p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id FOR UPDATE;
    SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
    IF qv.id IS NULL OR qu.id IS NULL OR qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    UPDATE public.quote_versions SET status = 'DECLINED' WHERE id = qv.id;
    UPDATE public.quotes SET status = 'DECLINED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id;
    UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'CUSTOMER', p_actor, 'QUOTE_DECLINED',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('actionId', a.id, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('actionId', a.id)
      END);
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_DECLINED', jsonb_build_object('kind', 'QUOTE_ACCEPTANCE'));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Customer declined a quote',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('actionId', a.id, 'quoteVersionId', qv.id, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('actionId', a.id, 'quoteVersionId', qv.id)
      END);
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
    INSERT INTO admin_private.customer_action_command_receipts
      VALUES (p_request, p_actor, p_fingerprint, result, now());
    RETURN result;
  END IF;

  IF p_operation IN ('accept', 'decline') AND a.kind = 'AGREEMENT_ACCEPTANCE' THEN
    SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id FOR UPDATE;
    IF v.id IS NULL OR v.case_id IS DISTINCT FROM a.case_id OR v.customer_id IS DISTINCT FROM a.customer_id THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    IF p_operation = 'decline' THEN
      IF p_channel = 'CUSTOMER_PORTAL' AND p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
      INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
      VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_DECLINED',
        CASE WHEN p_channel = 'CUSTOMER_PORTAL'
          THEN jsonb_build_object('kind', v.agreement_kind, 'source', 'CUSTOMER_PORTAL')
          ELSE jsonb_build_object('kind', v.agreement_kind)
        END);
      PERFORM admin_private.write_record_audit_v1(p_actor, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case',
        'Customer declined an agreement action',
        CASE WHEN p_channel = 'CUSTOMER_PORTAL'
          THEN jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id, 'source', 'CUSTOMER_PORTAL')
          ELSE jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id)
        END);
      result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
      INSERT INTO admin_private.customer_action_command_receipts
        VALUES (p_request, p_actor, p_fingerprint, result, now());
      RETURN result;
    END IF;
    IF p_data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT rec.id INTO existing_auth
    FROM public.authorization_records rec
    WHERE rec.case_id = a.case_id AND rec.authorization_kind = v.agreement_kind AND rec.status = 'ACTIVE'
    FOR UPDATE;
    IF existing_auth IS NOT NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    BEGIN
      INSERT INTO public.authorization_records(
        agreement_version_id, case_id, customer_id, business_id, location_id, authorization_kind, status,
        accepted_by_auth_user_id, accepted_email_snapshot, accepted_at, source
      ) VALUES (
        v.id, a.case_id, a.customer_id, a.business_id, a.location_id, v.agreement_kind, 'ACTIVE',
        p_actor, a.expected_email_snapshot, now(), 'CUSTOMER_OTP'
      ) RETURNING * INTO auth;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'conflict');
    END;
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, a.case_id, 'CUSTOMER', p_actor, 'AUTHORIZATION_ACCEPTED',
      jsonb_build_object('source', detail_source, 'actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case',
      'Customer accepted an agreement',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'kind', v.agreement_kind, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'kind', v.agreement_kind)
      END);
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationId', auth.id, 'authorizationStatus', auth.status);
    INSERT INTO admin_private.customer_action_command_receipts
      VALUES (p_request, p_actor, p_fingerprint, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'revoke' AND a.kind = 'AUTHORIZATION_REVOCATION' THEN
    IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id FOR UPDATE;
    IF auth.id IS NULL OR auth.status <> 'ACTIVE' OR auth.case_id IS DISTINCT FROM a.case_id
      OR auth.customer_id IS DISTINCT FROM a.customer_id
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    UPDATE public.authorization_records
      SET status = 'REVOKED', revoked_at = now(), revoked_by = p_actor,
          revocation_reason = 'Customer revoked this authorisation through a verified action.'
      WHERE id = auth.id RETURNING * INTO auth;
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, a.case_id, 'CUSTOMER', p_actor, 'AUTHORIZATION_REVOKED',
      jsonb_build_object('source', detail_source, 'actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case',
      'Customer revoked an authorisation',
      CASE WHEN p_channel = 'CUSTOMER_PORTAL'
        THEN jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'source', 'CUSTOMER_PORTAL')
        ELSE jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id)
      END);
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationStatus', auth.status);
    INSERT INTO admin_private.customer_action_command_receipts
      VALUES (p_request, p_actor, p_fingerprint, result, now());
    RETURN result;
  END IF;

  RETURN jsonb_build_object('status', 'unavailable');
END;
$apply$;

CREATE OR REPLACE FUNCTION admin_private.customer_action_command_core_v1(
  p_token_hash text, p_request uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $core$
DECLARE
  sess admin_private.customer_action_sessions;
  a public.customer_actions;
  fp text;
  cached jsonb;
  result jsonb;
  data jsonb;
  off public.guard_included_offers;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('accept', 'decline', 'revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(sess.action_id, p_operation, data)::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation IN ('accept', 'decline') AND a.kind = 'GUARD_PERMISSION' THEN
    IF p_operation = 'accept' THEN
      IF data->'accepted' IS DISTINCT FROM 'true'::jsonb OR data->>'permissionVersion' IS DISTINCT FROM 'GUARD_PERMISSION_V1' THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      IF a.status = 'COMPLETED' OR EXISTS (
        SELECT 1 FROM public.guard_permissions p WHERE p.coverage_id = a.guard_coverage_id AND p.status = 'ACTIVE'
      ) THEN
        result := admin_private.accept_guard_permission_v1(a, sess.auth_user_id, p_request);
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
        RETURN result;
      END IF;
      IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
      result := admin_private.accept_guard_permission_v1(a, sess.auth_user_id, p_request);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    IF a.guard_included_offer_id IS NOT NULL THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = a.guard_included_offer_id FOR UPDATE;
      IF off.status IN ('ELIGIBLE', 'OFFERED') THEN
        UPDATE public.guard_included_offers SET status = 'DECLINED', declined_at = now() WHERE id = off.id;
      END IF;
    END IF;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, NULL, 'CUSTOMER', sess.auth_user_id, 'ACTION_DECLINED', jsonb_build_object('kind', 'GUARD_PERMISSION'));
    PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'GUARD_CHANGED', 'success', a.guard_coverage_id, p_request, 'guard_coverage',
      'Customer declined a Guard permission action', jsonb_build_object('actionId', a.id));
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF a.kind IN ('QUOTE_ACCEPTANCE', 'AGREEMENT_ACCEPTANCE', 'AUTHORIZATION_REVOCATION') THEN
    RETURN admin_private.customer_commercial_apply_v1(
      a.id, sess.auth_user_id, p_request, fp, p_operation, data, 'CUSTOMER_OTP', a.customer_id, a.case_id, NULL
    );
  END IF;
  RETURN jsonb_build_object('status', 'unavailable');
END;
$core$;

CREATE FUNCTION admin_private.customer_portal_quote_view_v1(
  p_case uuid, p_customer uuid, p_email text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path=''
AS $quote$
DECLARE
  qv public.quote_versions;
  qu public.quotes;
  acc public.quote_acceptances;
  ord public.service_orders;
  action_open boolean := false;
  status text := 'unavailable';
  can_accept boolean := false;
  payment_next text := NULL;
BEGIN
  SELECT ver.* INTO qv
  FROM public.customer_actions a
  JOIN public.quote_versions ver ON ver.id = a.quote_version_id
  WHERE a.case_id = p_case AND a.customer_id = p_customer AND a.kind = 'QUOTE_ACCEPTANCE'
    AND lower(a.expected_email_snapshot) = lower(p_email)
    AND admin_private.customer_action_eligible_v1(a)
  ORDER BY a.created_at DESC
  LIMIT 1;
  IF qv.id IS NOT NULL THEN action_open := true; END IF;
  IF qv.id IS NULL THEN
    SELECT ver.* INTO qv
    FROM public.quote_acceptances acceptance
    JOIN public.quote_versions ver ON ver.id = acceptance.quote_version_id
    WHERE ver.case_id = p_case AND ver.customer_id = p_customer
    ORDER BY acceptance.accepted_at DESC
    LIMIT 1;
  END IF;
  IF qv.id IS NULL THEN
    SELECT ver.* INTO qv
    FROM public.quote_versions ver
    WHERE ver.case_id = p_case AND ver.customer_id = p_customer AND ver.offered_at IS NOT NULL
      AND ver.status IN ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED')
    ORDER BY ver.offered_at DESC
    LIMIT 1;
  END IF;
  IF qv.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id AND customer_id = p_customer AND case_id = p_case;
  IF qu.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO acc FROM public.quote_acceptances WHERE quote_version_id = qv.id;
  SELECT * INTO ord FROM public.service_orders WHERE quote_version_id = qv.id AND customer_id = p_customer AND case_id = p_case;
  IF acc.id IS NOT NULL AND ord.id IS NOT NULL THEN
    status := 'accepted';
    IF ord.payment_model = 'UPFRONT' THEN payment_next := 'payment';
    ELSIF ord.payment_model = 'SUCCESS_FEE' THEN payment_next := 'setup';
    END IF;
  ELSIF qv.status = 'DECLINED' OR qu.status = 'DECLINED' THEN
    status := 'declined';
  ELSIF qv.status = 'EXPIRED' OR qv.valid_until <= now() THEN
    status := 'expired';
  ELSIF action_open AND qv.status = 'OFFERED' AND qu.status = 'OFFERED' THEN
    status := 'offered';
    can_accept := qv.tax_behaviour <> 'UNCONFIRMED';
  ELSE
    status := 'unavailable';
  END IF;
  RETURN jsonb_build_object(
    'reference', qu.public_ref,
    'serviceName', qv.service_name,
    'scope', qv.scope_text,
    'exclusions', qv.exclusions_text,
    'successDefinition', qv.success_definition,
    'standardAmountMinor', qv.standard_amount_minor,
    'discountAmountMinor', qv.discount_amount_minor,
    'quotedAmountMinor', qv.quoted_subtotal_minor,
    'taxAmountMinor', qv.tax_amount_minor,
    'totalAmountMinor', qv.total_amount_minor,
    'currency', qv.currency,
    'taxBehaviour', qv.tax_behaviour,
    'paymentTiming', qv.payment_timing_text,
    'validUntil', qv.valid_until,
    'termsReference', qv.terms_reference,
    'status', status,
    'orderReference', CASE WHEN status = 'accepted' THEN ord.public_ref ELSE NULL END,
    'acceptedAt', CASE WHEN status = 'accepted' THEN acc.accepted_at ELSE NULL END,
    'paymentNext', payment_next,
    'canAccept', can_accept
  );
END;
$quote$;

CREATE FUNCTION admin_private.customer_portal_agreement_view_v1(
  p_case uuid, p_customer uuid, p_email text, p_kind text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path=''
AS $agreement$
DECLARE
  v public.agreement_versions;
  auth public.authorization_records;
  eligible boolean := false;
  declined boolean := false;
  status text := 'unavailable';
  can_accept boolean := false;
  can_decline boolean := false;
  active_id uuid;
BEGIN
  IF p_kind NOT IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION') THEN RETURN NULL; END IF;
  SELECT ver.* INTO v
  FROM public.customer_actions a
  JOIN public.agreement_versions ver ON ver.id = a.agreement_version_id
  WHERE a.case_id = p_case AND a.customer_id = p_customer AND a.kind = 'AGREEMENT_ACCEPTANCE'
    AND ver.agreement_kind = p_kind AND ver.case_id = p_case AND ver.customer_id = p_customer
    AND lower(a.expected_email_snapshot) = lower(p_email)
    AND admin_private.customer_action_eligible_v1(a)
  ORDER BY a.created_at DESC
  LIMIT 1;
  IF v.id IS NOT NULL THEN eligible := true; END IF;
  IF v.id IS NULL THEN
    SELECT ver.* INTO v
    FROM public.authorization_records rec
    JOIN public.agreement_versions ver ON ver.id = rec.agreement_version_id
    WHERE rec.case_id = p_case AND rec.customer_id = p_customer AND rec.authorization_kind = p_kind
    ORDER BY rec.accepted_at DESC
    LIMIT 1;
  END IF;
  IF v.id IS NULL THEN
    SELECT ver.* INTO v
    FROM public.customer_actions a
    JOIN public.agreement_versions ver ON ver.id = a.agreement_version_id
    WHERE a.case_id = p_case AND a.customer_id = p_customer AND a.kind = 'AGREEMENT_ACCEPTANCE'
      AND a.status = 'DECLINED' AND ver.agreement_kind = p_kind AND ver.case_id = p_case
    ORDER BY a.completed_at DESC NULLS LAST
    LIMIT 1;
    IF v.id IS NOT NULL THEN declined := true; END IF;
  END IF;
  IF v.id IS NULL THEN RETURN NULL; END IF;
  SELECT rec.id INTO active_id
  FROM public.authorization_records rec
  WHERE rec.case_id = p_case AND rec.customer_id = p_customer
    AND rec.authorization_kind = p_kind AND rec.status = 'ACTIVE'
  LIMIT 1;
  -- An active authorisation is the current permission. A leftover open action
  -- cannot hide it or offer another acceptance.
  IF active_id IS NOT NULL THEN
    SELECT ver.* INTO v
    FROM public.authorization_records rec
    JOIN public.agreement_versions ver ON ver.id = rec.agreement_version_id
    WHERE rec.id = active_id;
    eligible := false;
    declined := false;
  END IF;
  SELECT * INTO auth
  FROM public.authorization_records rec
  WHERE rec.case_id = p_case AND rec.customer_id = p_customer
    AND rec.authorization_kind = p_kind AND rec.agreement_version_id = v.id
  ORDER BY rec.accepted_at DESC
  LIMIT 1;
  IF auth.id IS NOT NULL AND auth.status = 'ACTIVE' THEN
    status := 'accepted';
  ELSIF auth.id IS NOT NULL AND auth.status = 'REVOKED' THEN
    status := 'revoked';
  ELSIF auth.id IS NOT NULL AND auth.status = 'REVIEW_REQUIRED' THEN
    status := 'review_required';
  ELSIF eligible THEN
    status := 'review';
    can_accept := active_id IS NULL;
    can_decline := active_id IS NULL;
  ELSIF declined THEN
    status := 'declined';
  ELSE
    status := 'unavailable';
  END IF;
  RETURN jsonb_build_object(
    'title', v.title,
    'body', v.body_text,
    'scope', v.scope_text,
    'versionNumber', v.version_number,
    'status', status,
    'acceptedAt', CASE WHEN status = 'accepted' THEN auth.accepted_at ELSE NULL END,
    'canAccept', can_accept,
    'canDecline', can_decline
  );
END;
$agreement$;

CREATE FUNCTION admin_private.customer_portal_service_actions_v1(
  p_case uuid, p_customer uuid, p_email text
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=''
AS $$
  SELECT coalesce(jsonb_agg(rows.item ORDER BY rows.item->>'selector'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'selector', admin_private.customer_portal_action_selector_v1(a.id),
      'kind', CASE
        WHEN a.kind = 'QUOTE_ACCEPTANCE' THEN 'quote'
        WHEN a.kind = 'AUTHORIZATION_REVOCATION' THEN 'revocation'
        WHEN v.agreement_kind = 'SERVICE_AGREEMENT' THEN 'service_agreement'
        WHEN v.agreement_kind = 'CASE_MANAGEMENT_PERMISSION' THEN 'case_permission'
      END,
      'target', CASE
        WHEN a.kind <> 'AUTHORIZATION_REVOCATION' THEN NULL
        WHEN auth.authorization_kind = 'SERVICE_AGREEMENT' THEN 'service_agreement'
        WHEN auth.authorization_kind = 'CASE_MANAGEMENT_PERMISSION' THEN 'case_permission'
      END
    ) AS item
    FROM public.customer_actions a
    LEFT JOIN public.agreement_versions v ON v.id = a.agreement_version_id
    LEFT JOIN public.authorization_records auth ON auth.id = a.authorization_id
    WHERE a.case_id = p_case
      AND a.customer_id = p_customer
      AND lower(a.expected_email_snapshot) = lower(p_email)
      AND a.kind IN ('QUOTE_ACCEPTANCE', 'AGREEMENT_ACCEPTANCE', 'AUTHORIZATION_REVOCATION')
      AND admin_private.customer_action_eligible_v1(a)
      AND (
        a.kind = 'QUOTE_ACCEPTANCE'
        OR (
          a.kind = 'AGREEMENT_ACCEPTANCE'
          AND v.agreement_kind IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
          AND v.case_id = p_case AND v.customer_id = p_customer
        )
        OR (
          a.kind = 'AUTHORIZATION_REVOCATION'
          AND auth.case_id = p_case AND auth.customer_id = p_customer AND auth.status = 'ACTIVE'
          AND auth.authorization_kind IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
        )
      )
  ) rows
  WHERE rows.item->>'kind' IS NOT NULL
    AND (rows.item->>'kind' <> 'revocation' OR rows.item->>'target' IS NOT NULL);
$$;

CREATE FUNCTION public.customer_portal_case_service_v1(p_token_hash text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $service$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_case uuid;
  v_business text;
  v_location text;
  v_track text;
  v_reference text;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_reference IS NULL OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT c.public_ref, c.service_track, b.display_name
    INTO v_reference, v_track, v_business
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  WHERE c.id = v_case AND c.customer_id = v_customer;
  IF v_reference IS NULL OR v_business IS NULL OR v_track IS NULL THEN RETURN NULL; END IF;
  SELECT l.location_name INTO v_location
  FROM public.cases c
  LEFT JOIN public.locations l ON l.id = c.location_id
  WHERE c.id = v_case;
  RETURN jsonb_build_object(
    'found', true,
    'case', jsonb_build_object(
      'reference', v_reference,
      'businessName', v_business,
      'locationName', v_location,
      'serviceTrack', v_track
    ),
    'quote', admin_private.customer_portal_quote_view_v1(v_case, v_customer, v_email),
    'serviceAgreement', admin_private.customer_portal_agreement_view_v1(v_case, v_customer, v_email, 'SERVICE_AGREEMENT'),
    'casePermission', admin_private.customer_portal_agreement_view_v1(v_case, v_customer, v_email, 'CASE_MANAGEMENT_PERMISSION'),
    'actions', admin_private.customer_portal_service_actions_v1(v_case, v_customer, v_email)
  );
END;
$service$;

CREATE FUNCTION public.customer_portal_service_command_v1(
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
  v public.agreement_versions;
  fp text;
  cached jsonb;
  legacy_operation text;
  matches integer;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_reference IS NULL OR p_selector IS NULL OR p_operation IS NULL OR p_data IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
    OR p_operation NOT IN ('accept_quote', 'decline_quote', 'accept_agreement', 'decline_agreement', 'revoke_authorization')
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation IN ('accept_quote', 'accept_agreement') AND p_data IS DISTINCT FROM '{"accepted":true}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation IN ('decline_quote', 'decline_agreement', 'revoke_authorization')
    AND p_data IS DISTINCT FROM '{"confirmed":true}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
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
  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_operation IN ('accept_quote', 'decline_quote') AND a.kind <> 'QUOTE_ACCEPTANCE' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_operation IN ('accept_agreement', 'decline_agreement') THEN
    SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id;
    IF a.kind <> 'AGREEMENT_ACCEPTANCE' OR v.id IS NULL
      OR v.agreement_kind NOT IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
      OR v.case_id IS DISTINCT FROM v_case OR v.customer_id IS DISTINCT FROM v_customer
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  END IF;
  IF p_operation = 'revoke_authorization' AND a.kind <> 'AUTHORIZATION_REVOCATION' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  legacy_operation := CASE
    WHEN p_operation IN ('accept_quote', 'accept_agreement') THEN 'accept'
    WHEN p_operation IN ('decline_quote', 'decline_agreement') THEN 'decline'
    ELSE 'revoke'
  END;
  RETURN admin_private.customer_commercial_apply_v1(
    a.id, v_auth, p_request, fp, legacy_operation, p_data, 'CUSTOMER_PORTAL', v_customer, v_case, v_email
  );
END;
$command$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_action_selector_v1(uuid),
  admin_private.customer_commercial_apply_v1(uuid, uuid, uuid, text, text, jsonb, text, uuid, uuid, text),
  admin_private.customer_portal_quote_view_v1(uuid, uuid, text),
  admin_private.customer_portal_agreement_view_v1(uuid, uuid, text, text),
  admin_private.customer_portal_service_actions_v1(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_case_service_v1(text, text),
  public.customer_portal_service_command_v1(text, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_portal_case_service_v1(text, text),
  public.customer_portal_service_command_v1(text, uuid, text, text, text, jsonb)
  TO service_role;

COMMIT;
