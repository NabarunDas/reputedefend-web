-- ADMIN-TY-R8-D-01A: fail-closed Telloya offer mail test-recipient allowlist.
-- SOURCE-ONLY until the owner explicitly approves a DEV apply. Do not apply to
-- Production. Do not edit or replay 20261112223000 or earlier applied files.
--
-- Problem: telloya_offer_mail_control is a global singleton. Enabling it for one
-- internal test would otherwise allow any eligible Telloya offer to queue.
-- Fix: require an enabled row in admin_private.telloya_offer_mail_test_recipients
-- matching the verified customer email (and optional customer_id) before
-- telloya_offer_mail_v1 may insert communications / SEND_EMAIL. Empty allowlist
-- means nobody. No recipient addresses are hardcoded or seeded here.
--
-- Reuses existing communications + SEND_EMAIL outbox. Does not approve templates,
-- enable mail_control, seed catalogue, create Stripe objects, or send email.

CREATE TABLE IF NOT EXISTS admin_private.telloya_offer_mail_test_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  authorized_by uuid NULL REFERENCES auth.users(id),
  authorized_at timestamptz NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT telloya_offer_mail_test_recipients_email_check
    CHECK (email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT telloya_offer_mail_test_recipients_email_unique UNIQUE (email_normalized)
);

ALTER TABLE admin_private.telloya_offer_mail_test_recipients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE admin_private.telloya_offer_mail_test_recipients FROM PUBLIC, anon, authenticated;
-- service_role has table access via SECURITY DEFINER commands only; no broad grants.

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
  v_email text;
  v_customer uuid;
  v_note text;
  v_expected integer;
  v_row admin_private.telloya_offer_mail_test_recipients;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_operation IS NULL OR p_payload IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF p_operation = 'authorize' THEN
    v_email := admin_private.normalize_email_v1(p_payload->>'email');
    IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'email');
    END IF;
    BEGIN
      v_customer := NULLIF(p_payload->>'customerId', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'customerId');
    END;
    IF v_customer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v_customer) THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'customer_missing');
    END IF;
    v_note := coalesce(left(p_payload->>'note', 500), '');
    INSERT INTO admin_private.telloya_offer_mail_test_recipients AS allowed(
      email_normalized, customer_id, enabled, note, authorized_by, authorized_at, record_version
    ) VALUES (
      v_email, v_customer, true, v_note, v_actor, pg_catalog.now(), 1
    )
    ON CONFLICT (email_normalized) DO UPDATE
      SET customer_id = EXCLUDED.customer_id,
          enabled = true,
          note = EXCLUDED.note,
          authorized_by = EXCLUDED.authorized_by,
          authorized_at = pg_catalog.now(),
          record_version = allowed.record_version + 1
    RETURNING * INTO v_row;
    PERFORM admin_private.write_record_audit_v1(
      v_actor, 'SETTINGS_CHANGED', 'success', v_row.id, p_request, 'telloya_offer_mail_test_recipient',
      'Authorised a Telloya offer mail test recipient. This does not send email.',
      jsonb_build_object(
        'operation', 'authorize_telloya_offer_mail_test_recipient',
        'emailNormalized', v_email,
        'customerId', v_customer,
        'enabled', true
      )
    );
    RETURN jsonb_build_object(
      'status', 'success',
      'id', v_row.id,
      'emailNormalized', v_row.email_normalized,
      'customerId', v_row.customer_id,
      'enabled', v_row.enabled,
      'version', v_row.record_version
    );
  END IF;

  IF p_operation = 'revoke' THEN
    v_email := admin_private.normalize_email_v1(p_payload->>'email');
    IF v_email IS NULL THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'email');
    END IF;
    BEGIN
      v_expected := NULLIF(p_payload->>'expectedVersion', '')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'expectedVersion');
    END;
    SELECT * INTO v_row
    FROM admin_private.telloya_offer_mail_test_recipients AS allowed
    WHERE allowed.email_normalized = v_email
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_expected IS NOT NULL AND v_row.record_version IS DISTINCT FROM v_expected THEN
      RETURN jsonb_build_object('status', 'stale_version', 'version', v_row.record_version);
    END IF;
    UPDATE admin_private.telloya_offer_mail_test_recipients AS allowed
      SET enabled = false,
          record_version = allowed.record_version + 1,
          authorized_by = v_actor,
          authorized_at = pg_catalog.now()
      WHERE allowed.id = v_row.id
      RETURNING * INTO v_row;
    PERFORM admin_private.write_record_audit_v1(
      v_actor, 'SETTINGS_CHANGED', 'success', v_row.id, p_request, 'telloya_offer_mail_test_recipient',
      'Revoked a Telloya offer mail test recipient. This does not send email.',
      jsonb_build_object(
        'operation', 'revoke_telloya_offer_mail_test_recipient',
        'emailNormalized', v_email,
        'enabled', false
      )
    );
    RETURN jsonb_build_object(
      'status', 'success',
      'id', v_row.id,
      'emailNormalized', v_row.email_normalized,
      'enabled', v_row.enabled,
      'version', v_row.record_version
    );
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
  -- Fail-closed DEV test scoping: even when mail_enabled is true, queue only to
  -- an explicitly authorised enabled allowlist recipient. Empty allowlist queues nobody.
  -- No addresses are seeded by this migration.
  IF NOT EXISTS (
    SELECT 1
    FROM admin_private.telloya_offer_mail_test_recipients AS allowed
    WHERE allowed.enabled IS TRUE
      AND allowed.email_normalized = v_email
      AND (allowed.customer_id IS NULL OR allowed.customer_id = v_sub.customer_id)
  ) THEN
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
