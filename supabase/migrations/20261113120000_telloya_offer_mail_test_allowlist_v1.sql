-- ADMIN-TY-R8-D-01A-R1: fail-closed Telloya offer mail test-recipient allowlist.
-- SOURCE-ONLY until the owner explicitly approves a DEV apply. Do not apply to
-- Production. Do not edit or replay previously applied migrations.
--
-- Hardening:
-- 1) Sendable allowlist rows require exact customer_id + matching verified email.
-- 2) Ordinary Admin sessions cannot authorise recipients. Enrolment uses a
--    one-time owner grant reference via telloya_offer_mail_test_recipient_provision_v1.
-- 3) Provider claim rechecks TELLOYA_OFFER permission; Guided/Guard mail unchanged.
-- 4) Zero recipient addresses or grants are seeded. Empty allowlist queues nobody.

DROP FUNCTION IF EXISTS public.telloya_offer_mail_test_recipient_command_v1(text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.telloya_offer_mail_test_recipient_provision_v1(text, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS admin_private.telloya_offer_mail_test_recipient_permitted_v1(uuid, text);
DROP TABLE IF EXISTS admin_private.telloya_offer_mail_test_recipients;
DROP TABLE IF EXISTS admin_private.telloya_offer_mail_test_owner_grants;

CREATE TABLE admin_private.telloya_offer_mail_test_owner_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_ref text NOT NULL,
  purpose text NOT NULL DEFAULT 'telloya_offer_mail_test'
    CHECK (purpose = 'telloya_offer_mail_test'),
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  consumed_customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT telloya_offer_mail_test_owner_grants_ref_check
    CHECK (grant_ref ~ '^[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT telloya_offer_mail_test_owner_grants_ref_unique UNIQUE (grant_ref)
);

CREATE TABLE admin_private.telloya_offer_mail_test_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  grant_ref text NOT NULL,
  authorized_at timestamptz NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT telloya_offer_mail_test_recipients_email_check
    CHECK (email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT telloya_offer_mail_test_recipients_customer_unique UNIQUE (customer_id),
  CONSTRAINT telloya_offer_mail_test_recipients_email_unique UNIQUE (email_normalized)
);

ALTER TABLE admin_private.telloya_offer_mail_test_owner_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_offer_mail_test_recipients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE admin_private.telloya_offer_mail_test_owner_grants
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE admin_private.telloya_offer_mail_test_recipients
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.telloya_offer_mail_test_recipient_permitted_v1(
  p_customer_id uuid,
  p_email_normalized text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_customer_email text;
BEGIN
  IF p_customer_id IS NULL OR p_email_normalized IS NULL THEN
    RETURN false;
  END IF;
  SELECT admin_private.normalize_email_v1(c.email) INTO v_customer_email
  FROM public.customers AS c
  WHERE c.id = p_customer_id;
  IF v_customer_email IS NULL OR v_customer_email IS DISTINCT FROM p_email_normalized THEN
    RETURN false;
  END IF;
  IF admin_private.contact_verified_v1(p_customer_id, 'email') IS DISTINCT FROM true THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_memberships AS membership
    WHERE membership.customer_id = p_customer_id
      AND membership.status = 'verified'
  ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM admin_private.telloya_offer_mail_test_recipients AS allowed
    WHERE allowed.enabled IS TRUE
      AND allowed.customer_id = p_customer_id
      AND allowed.email_normalized = p_email_normalized
  );
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_offer_mail_test_recipient_permitted_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.telloya_offer_mail_test_recipient_provision_v1(
  p_grant_ref text,
  p_request uuid,
  p_customer_id uuid,
  p_email text,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_grant admin_private.telloya_offer_mail_test_owner_grants;
  v_email text;
  v_customer_email text;
  v_note text;
  v_row admin_private.telloya_offer_mail_test_recipients;
  v_email_hash text;
BEGIN
  IF p_grant_ref IS NULL OR p_request IS NULL OR p_customer_id IS NULL OR p_email IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO v_grant
  FROM admin_private.telloya_offer_mail_test_owner_grants AS grants
  WHERE grants.grant_ref = p_grant_ref
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'grant_not_found');
  END IF;
  IF v_grant.enabled IS DISTINCT FROM true OR v_grant.consumed_at IS NOT NULL OR v_grant.expires_at <= pg_catalog.now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'grant_unusable');
  END IF;
  v_email := admin_private.normalize_email_v1(p_email);
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'email');
  END IF;
  SELECT admin_private.normalize_email_v1(c.email) INTO v_customer_email
  FROM public.customers AS c
  WHERE c.id = p_customer_id;
  IF v_customer_email IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'customer_missing');
  END IF;
  IF v_customer_email IS DISTINCT FROM v_email THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'email_mismatch');
  END IF;
  IF admin_private.contact_verified_v1(p_customer_id, 'email') IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'recipient_unverified');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS membership
    WHERE membership.customer_id = p_customer_id AND membership.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'authority');
  END IF;
  v_note := coalesce(left(p_note, 200), '');
  v_email_hash := md5(v_email);
  INSERT INTO admin_private.telloya_offer_mail_test_recipients AS allowed(
    customer_id, email_normalized, enabled, note, grant_ref, authorized_at, record_version
  ) VALUES (
    p_customer_id, v_email, true, v_note, p_grant_ref, pg_catalog.now(), 1
  )
  ON CONFLICT (customer_id) DO UPDATE
    SET email_normalized = EXCLUDED.email_normalized,
        enabled = true,
        note = EXCLUDED.note,
        grant_ref = EXCLUDED.grant_ref,
        authorized_at = pg_catalog.now(),
        record_version = allowed.record_version + 1
  RETURNING * INTO v_row;
  UPDATE admin_private.telloya_offer_mail_test_owner_grants AS grants
    SET consumed_at = pg_catalog.now(),
        consumed_customer_id = p_customer_id,
        enabled = false
    WHERE grants.id = v_grant.id;
  PERFORM admin_private.write_record_audit_v1(
    NULL, 'SETTINGS_CHANGED', 'success', v_row.id, p_request, 'telloya_offer_mail_test_recipient',
    'Owner-grant provisioned a Telloya offer mail test recipient. This does not send email.',
    jsonb_build_object(
      'operation', 'provision_telloya_offer_mail_test_recipient',
      'customerId', p_customer_id,
      'emailHash', v_email_hash,
      'grantRef', p_grant_ref,
      'enabled', true
    )
  );
  RETURN jsonb_build_object(
    'status', 'success',
    'id', v_row.id,
    'customerId', v_row.customer_id,
    'enabled', v_row.enabled,
    'version', v_row.record_version
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_mail_test_recipient_provision_v1(text, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_mail_test_recipient_provision_v1(text, uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.telloya_offer_mail_test_recipient_command_v1(
  p_token text,
  p_request uuid,
  p_operation text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_customer uuid;
  v_expected integer;
  v_row admin_private.telloya_offer_mail_test_recipients;
  v_count integer;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_operation IS NULL OR p_payload IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Ordinary Admin sessions cannot enrol recipients.
  IF p_operation = 'authorize' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'owner_provision_required');
  END IF;

  IF p_operation = 'revoke' THEN
    BEGIN
      v_customer := NULLIF(p_payload->>'customerId', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'customerId');
    END;
    IF v_customer IS NULL THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'customerId');
    END IF;
    BEGIN
      v_expected := NULLIF(p_payload->>'expectedVersion', '')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'expectedVersion');
    END;
    SELECT * INTO v_row
    FROM admin_private.telloya_offer_mail_test_recipients AS allowed
    WHERE allowed.customer_id = v_customer
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_expected IS NOT NULL AND v_row.record_version IS DISTINCT FROM v_expected THEN
      RETURN jsonb_build_object('status', 'stale_version', 'version', v_row.record_version);
    END IF;
    UPDATE admin_private.telloya_offer_mail_test_recipients AS allowed
      SET enabled = false,
          record_version = allowed.record_version + 1
      WHERE allowed.id = v_row.id
      RETURNING * INTO v_row;
    PERFORM admin_private.write_record_audit_v1(
      v_actor, 'SETTINGS_CHANGED', 'success', v_row.id, p_request, 'telloya_offer_mail_test_recipient',
      'Revoked a Telloya offer mail test recipient. Queued mail is not cancelled; dispatch rechecks permission.',
      jsonb_build_object(
        'operation', 'revoke_telloya_offer_mail_test_recipient',
        'customerId', v_customer,
        'enabled', false
      )
    );
    RETURN jsonb_build_object(
      'status', 'success',
      'id', v_row.id,
      'customerId', v_row.customer_id,
      'enabled', v_row.enabled,
      'version', v_row.record_version
    );
  END IF;

  IF p_operation = 'shutdown' THEN
    UPDATE admin_private.telloya_offer_mail_test_recipients AS allowed
      SET enabled = false,
          record_version = allowed.record_version + 1
      WHERE allowed.enabled IS TRUE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    PERFORM admin_private.write_record_audit_v1(
      v_actor, 'SETTINGS_CHANGED', 'success', NULL, p_request, 'telloya_offer_mail_test_recipient',
      'Shut down Telloya offer mail test recipients. Dispatch will refuse TELLOYA_OFFER sends.',
      jsonb_build_object('operation', 'shutdown_telloya_offer_mail_test_recipients', 'disabledCount', v_count)
    );
    RETURN jsonb_build_object('status', 'success', 'disabledCount', v_count);
  END IF;

  RETURN jsonb_build_object('status', 'invalid', 'reason', 'operation');
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_mail_test_recipient_command_v1(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_mail_test_recipient_command_v1(text, uuid, text, jsonb)
  TO service_role;


CREATE OR REPLACE FUNCTION public.telloya_offer_mail_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_expected_version integer,
  p_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_enabled boolean := false;
  v_sub public.commercial_subscriptions;
  v_link record;
  v_email text;
  v_customer_name text;
  v_existing public.communications;
  v_tier text;
  v_minutes integer;
  v_plan_amount integer;
  v_guard integer;
  v_template_version integer;
  v_template_reason text;
  v_template_body text;
  v_plan_label text;
  v_minutes_text text;
  v_guard_text text;
  v_base_price text;
  v_price text;
  v_href text;
  v_custom_notes text := '';
  v_composed jsonb;
  v_comm public.communications;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_subscription IS NULL OR p_expected_version IS NULL
     OR p_origin IS NULL OR p_origin !~ '^https://[a-z0-9.-]+$'
     OR (p_origin !~ '^https://([a-z0-9-]+\.)*(profilerelaunch\.com|telloya\.com)$' AND p_origin <> 'https://localhost') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT control.mail_enabled INTO v_enabled FROM admin_private.telloya_offer_mail_control AS control LIMIT 1;
  IF COALESCE(v_enabled, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'mail_disabled');
  END IF;
  SELECT * INTO v_sub FROM public.commercial_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  SELECT * INTO v_existing
  FROM public.communications
  WHERE commercial_subscription_id = p_subscription AND template_key = 'TELLOYA_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED'
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'replay', 'communicationId', v_existing.id, 'deliveryStatus', v_existing.delivery_status);
  END IF;
  SELECT * INTO v_link FROM admin_private.telloya_linked_offer_v1(v_sub.id) AS linked;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  IF v_sub.state IS DISTINCT FROM 'OFFERED' THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  IF v_sub.record_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('status', 'stale_version', 'version', v_sub.record_version);
  END IF;
  IF v_link.demo_completed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'demonstration_not_completed');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.telloya_offer_amendments AS amendment
    WHERE amendment.subscription_id = v_sub.id AND amendment.status = 'REQUESTED'
  ) THEN
    RETURN jsonb_build_object('status', 'amendment_pending');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS membership
    WHERE membership.customer_id = v_sub.customer_id
      AND membership.business_id = v_sub.business_id
      AND membership.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'authority');
  END IF;
  IF v_sub.public_ref !~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT admin_private.normalize_email_v1(email), full_name INTO v_email, v_customer_name
  FROM public.customers WHERE id = v_sub.customer_id;
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF admin_private.contact_verified_v1(v_sub.customer_id, 'email') IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'recipient_unverified');
  END IF;
  IF admin_private.telloya_offer_mail_test_recipient_permitted_v1(v_sub.customer_id, v_email) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'test_recipient_not_allowed');
  END IF;
  SELECT version, reason, body_text_template
  INTO v_template_version, v_template_reason, v_template_body
  FROM admin_private.communication_templates
  WHERE template_key = 'TELLOYA_OFFER' AND status = 'APPROVED'
  ORDER BY version DESC
  LIMIT 1;
  IF v_template_version IS NULL THEN
    RETURN jsonb_build_object('status', 'template_unapproved');
  END IF;
  -- Approved immutable body must exactly equal the versioned composer contract.
  -- A generic reason/body mention is not enough.
  IF v_template_body IS DISTINCT FROM admin_private.telloya_offer_composer_contract_body_v1() THEN
    RETURN jsonb_build_object(
      'status', 'template_unapproved',
      'reason', 'composer_contract',
      'composerContract', admin_private.telloya_offer_composer_contract_id_v1()
    );
  END IF;
  SELECT chosen.tier_code, chosen.included_minutes, chosen.amount_minor
  INTO v_tier, v_minutes, v_plan_amount
  FROM (
    SELECT plan.tier_code, conditions.included_minutes, plan.amount_minor
    FROM public.plan_versions AS plan
    JOIN public.commercial_plan_conditions AS conditions
      ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
    WHERE plan.id = v_sub.plan_version_id AND plan.product_code = 'TELLOYA' AND plan.status = 'APPROVED'
    LIMIT 1
  ) AS chosen;
  SELECT count(*)::integer INTO v_guard
  FROM admin_private.commercial_offer_guard_locations AS chosen
  WHERE chosen.subscription_id = v_sub.id;
  v_plan_label := CASE v_tier
    WHEN 'BASIC' THEN 'Basic'
    WHEN 'GROWTH' THEN 'Growth'
    WHEN 'PRO' THEN 'Pro'
    WHEN 'CUSTOM' THEN 'Custom'
    ELSE NULL
  END;
  IF v_plan_label IS NULL OR v_plan_amount IS NULL OR v_sub.amount_minor IS DISTINCT FROM v_plan_amount + (999 * v_guard) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured');
  END IF;
  IF v_sub.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
     OR EXISTS (
       SELECT 1 FROM public.plan_versions AS plan
       WHERE plan.id = v_sub.plan_version_id
         AND plan.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
     ) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'tax');
  END IF;
  IF v_sub.terms_ref IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.commercial_agreement_versions AS agreement
    WHERE agreement.product_code = 'TELLOYA'
      AND agreement.version_ref = v_sub.terms_ref
      AND agreement.status = 'APPROVED'
  ) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'agreement');
  END IF;
  SELECT coalesce(draft.custom_requirements, '') INTO v_custom_notes
  FROM public.onboarding_requests AS request
  LEFT JOIN admin_private.telloya_offer_drafts AS draft ON draft.onboarding_request_id = request.id
  WHERE request.commercial_subscription_id = v_sub.id
  ORDER BY request.created_at DESC
  LIMIT 1;
  v_minutes_text := CASE WHEN v_minutes IS NULL THEN 'confirmed in the quotation' ELSE v_minutes::text END;
  v_guard_text := CASE
    WHEN v_guard = 0 THEN 'not included'
    ELSE v_guard::text || CASE WHEN v_guard = 1 THEN ' location' ELSE ' locations' END
      || ' at ' || admin_private.telloya_gbp_v1(999) || ' each (' || admin_private.telloya_gbp_v1(999 * v_guard) || ')'
  END;
  v_base_price := admin_private.telloya_gbp_v1(v_plan_amount);
  v_price := admin_private.telloya_gbp_v1(v_sub.amount_minor);
  v_href := p_origin || '/portal/onboarding/offer/' || v_sub.public_ref;
  v_composed := admin_private.telloya_offer_compose_v1(
    v_link.enquiry_ref, v_customer_name, v_plan_label, v_minutes_text,
    v_base_price, v_guard_text, v_price, v_custom_notes, false, v_href
  );
  BEGIN
    INSERT INTO public.communications(
      case_id, customer_id, business_id, commercial_subscription_id,
      channel, communication_type, direction, recipient, subject, body_text, body_html,
      status, lifecycle, delivery_status, template_key, template_version,
      author_id, reviewer_id, reviewed_at, queued_at, sender_address, reply_to_address,
      content_version, record_version, content_locked, link_key_version
    ) VALUES (
      NULL, v_sub.customer_id, v_sub.business_id, v_sub.id,
      'EMAIL', 'TELLOYA_OFFER', 'OUTBOUND', v_email,
      v_composed->>'subject', v_composed->>'text', v_composed->>'html',
      'PENDING', 'QUEUED', 'NONE', 'TELLOYA_OFFER', v_template_version,
      v_actor, v_actor, pg_catalog.now(), pg_catalog.now(), 'support@profilerelaunch.com', 'support@profilerelaunch.com',
      1, 1, true, 1
    ) RETURNING * INTO v_comm;
    PERFORM admin_private.enqueue_outbox_v1(
      'send-email:' || v_comm.id::text || ':v' || v_comm.content_version::text,
      'SEND_EMAIL', 'communication', v_comm.id,
      jsonb_build_object('communicationId', v_comm.id, 'contentVersion', v_comm.content_version)
    );
    PERFORM admin_private.append_delivery_event_v1(v_comm.id, 'QUEUED', 'Telloya offer email queued for the provider. Queued is not delivered.');
    PERFORM admin_private.write_record_audit_v1(
      v_actor, 'COMMUNICATION_CHANGED', 'success', v_comm.id, p_request, 'communication',
      'Queued a Telloya offer email. The provider has not accepted it.',
      jsonb_build_object(
        'operation', 'queue_telloya_offer',
        'enquiryRef', v_link.enquiry_ref,
        'composerVersion', 1,
        'composerContract', admin_private.telloya_offer_composer_contract_id_v1(),
        'templateVersion', v_template_version
      )
    );
    RETURN jsonb_build_object(
      'status', 'queued',
      'communicationId', v_comm.id,
      'deliveryStatus', v_comm.delivery_status,
      'composerVersion', 1,
      'composerContract', admin_private.telloya_offer_composer_contract_id_v1()
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.communications
    WHERE commercial_subscription_id = p_subscription AND template_key = 'TELLOYA_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED'
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'replay', 'communicationId', v_existing.id, 'deliveryStatus', v_existing.delivery_status);
    END IF;
    RAISE;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_mail_v1(text, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_mail_v1(text, uuid, uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_dev_send_email_claim_v1(
  p_token text,
  p_request uuid,
  p_communication uuid,
  p_confirmed boolean,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  current_status text;
  v_key text;
  comm public.communications;
  expected text;
  text_upload text;
  html_upload text;
  text_urls integer;
  html_urls integer;
  outbox admin_private.job_outbox;
  row admin_private.jobs;
  token uuid;
  attempt_no integer;
  case_ref text;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'reauth_required', NULL, p_request, 'job',
      'DEV email processing requires a sign-in within the last 30 minutes',
      jsonb_build_object('operation', 'dev_send_email')
    );
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_communication IS NULL OR coalesce(p_confirmed, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO comm FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF comm.id IS NULL OR comm.lifecycle IS DISTINCT FROM 'QUEUED' OR comm.content_locked IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array('dev_send_email', p_communication)::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    current_status := NULL;
    IF cached ? 'jobId' THEN
      SELECT j.status INTO current_status FROM admin_private.jobs j WHERE j.id = (cached->>'jobId')::uuid;
    END IF;
    RETURN (cached - 'leaseToken')
      || jsonb_build_object('replay', true, 'currentJobStatus', current_status)
      || '{"leaseToken":null}'::jsonb;
  END IF;

  IF comm.template_key = 'TELLOYA_OFFER' THEN
    IF admin_private.telloya_offer_mail_test_recipient_permitted_v1(
         comm.customer_id,
         admin_private.normalize_email_v1(comm.recipient)
       ) IS DISTINCT FROM true THEN
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing refused a Telloya offer whose test recipient is not permitted.',
        jsonb_build_object(
          'operation', 'dev_send_email',
          'reason', 'test_recipient_not_allowed',
          'templateKey', 'TELLOYA_OFFER'
        )
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'test_recipient_not_allowed');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  END IF;

  IF comm.template_key IN ('EVIDENCE_REQUEST', 'QUOTE_OFFER') THEN
    expected := coalesce(p_customer_origin, '') || '/action/' || coalesce(comm.customer_action_id::text, '');
    text_upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    html_upload := substring(coalesce(comm.body_html, '') from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    SELECT count(*)::integer INTO text_urls
      FROM regexp_matches(comm.body_text, 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    SELECT count(*)::integer INTO html_urls
      FROM regexp_matches(coalesce(comm.body_html, ''), 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    IF comm.body_html IS NULL
      OR text_urls IS DISTINCT FROM 1
      OR html_urls IS DISTINCT FROM 1
      OR text_upload IS DISTINCT FROM expected
      OR html_upload IS DISTINCT FROM expected
      OR position('#t=' in comm.body_text) > 0
      OR position('#t=' in coalesce(comm.body_html, '')) > 0
    THEN
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing left an evidence request whose upload link is not the development customer portal',
        jsonb_build_object('operation', 'dev_send_email', 'reason', 'origin')
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'origin');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  ELSIF comm.template_key = 'GUIDED_PAYMENT_REQUEST' THEN
    SELECT cs.public_ref INTO case_ref FROM public.cases cs WHERE cs.id = comm.case_id;
    expected := coalesce(p_customer_origin, '') || '/portal/cases/' || coalesce(case_ref, '') || '/payments';
    IF comm.body_html IS NULL
      OR case_ref IS NULL
      OR position(expected IN comm.body_text) = 0
      OR position(expected IN comm.body_html) = 0
      OR (length(comm.body_text) - length(replace(comm.body_text, expected, ''))) IS DISTINCT FROM length(expected)
      OR (length(comm.body_html) - length(replace(comm.body_html, expected, ''))) IS DISTINCT FROM length(expected)
      OR position('#t=' IN comm.body_text) > 0
      OR position('#t=' IN comm.body_html) > 0
      OR position('/action/' IN comm.body_text) > 0
      OR position('/action/' IN comm.body_html) > 0
    THEN
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing left a payment request whose portal link is not the development customer portal',
        jsonb_build_object('operation', 'dev_send_email', 'reason', 'origin')
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'origin');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  END IF;

  IF comm.template_key IN ('PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION') THEN
    expected := CASE comm.template_key WHEN 'PAYMENT_CONFIRMATION' THEN 'payments' ELSE 'documents' END;
    text_upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    html_upload := substring(coalesce(comm.body_html, '') from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    text_urls := admin_private.fulfilment_page_count_v1(comm.body_text, expected);
    html_urls := admin_private.fulfilment_page_count_v1(comm.body_html, expected);
    IF comm.body_html IS NULL
      OR text_urls IS DISTINCT FROM 1
      OR html_urls IS DISTINCT FROM 1
      OR text_upload IS DISTINCT FROM html_upload
      OR text_upload IS NULL
      OR position(coalesce(p_customer_origin, '') || '/portal/cases/' IN text_upload) IS DISTINCT FROM 1
      OR right(text_upload, length(expected)) IS DISTINCT FROM expected
      OR position('#t=' in comm.body_text) > 0
      OR position('#t=' in comm.body_html) > 0
      OR position('/action/' in comm.body_text) > 0
      OR position('/action/' in comm.body_html) > 0
    THEN
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing left a customer page that is not the confirmed portal',
        jsonb_build_object('operation', 'dev_send_email', 'reason', 'origin')
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'origin');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  END IF;

  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = v_key FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM admin_private.job_outbox WHERE event_key = v_key) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF outbox.topic IS DISTINCT FROM 'SEND_EMAIL'
    OR outbox.aggregate_id IS DISTINCT FROM comm.id
    OR outbox.payload->>'communicationId' IS DISTINCT FROM comm.id::text
    OR outbox.payload->>'contentVersion' IS DISTINCT FROM comm.content_version::text
  THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV email processing refused a job that is not the queued communication',
      jsonb_build_object('operation', 'dev_send_email', 'reason', 'not_send_email')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;

  IF outbox.promoted_at IS NULL THEN
    INSERT INTO admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
    VALUES (outbox.id, 'SEND_EMAIL', outbox.event_key, outbox.payload, 'PENDING', outbox.available_at)
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox
      SET promoted_at = now(), last_error = NULL
      WHERE id = outbox.id AND promoted_at IS NULL;
  END IF;

  SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id FOR UPDATE;
  IF row.id IS NULL OR row.job_type IS DISTINCT FROM 'SEND_EMAIL' OR row.idempotency_key IS DISTINCT FROM v_key THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'jobId', row.id);
  END IF;
  IF comm.delivery_status IN ('PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE') THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' OR comm.first_provider_attempt_at IS NOT NULL THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status IN ('PENDING', 'RETRY') AND row.scheduled_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'jobId', row.id);
  END IF;

  IF row.status = 'RUNNING' THEN
    IF row.attempts >= row.max_attempts THEN
      PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'DEAD_LETTER', 'Maximum attempts exhausted after worker lease expiry');
      UPDATE admin_private.jobs
        SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
            lease_owner = NULL, lease_token = NULL,
            last_error = 'Maximum attempts exhausted after worker lease expiry',
            updated_at = now(), record_version = row.record_version + 1
        WHERE id = row.id AND status = 'RUNNING';
      result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
          lease_owner = NULL, lease_token = NULL,
          last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  token := gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING', claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-send-email', lease_token = token,
        attempts = row.attempts + 1, updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-send-email', token, NULL);

  result := jsonb_build_object(
    'status', 'success',
    'replay', false,
    'jobId', row.id,
    'jobType', row.job_type,
    'idempotencyKey', row.idempotency_key,
    'payload', row.payload,
    'leaseToken', token,
    'attemptNumber', row.attempts,
    'attempts', row.attempts,
    'maxAttempts', row.max_attempts
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'OPERATIONS_CHANGED', 'success', row.id, p_request, 'job',
    'DEV email processing claimed one queued communication',
    jsonb_build_object('operation', 'dev_send_email', 'jobType', 'SEND_EMAIL')
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dev_send_email_claim_v1(text, uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_dev_send_email_claim_v1(text, uuid, uuid, boolean, text)
  TO service_role;
