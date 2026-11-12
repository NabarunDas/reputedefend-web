BEGIN;
-- Telloya Admin approve-and-send offer orchestration (source-only).
-- Source-only. Do not apply this file to DEV or Production without owner approval.
-- Do not edit or replay 20261112120000, 20261112180000, or 20261112210000.
-- ADMIN-TY-R8-R1: draft estimate preview without catalogue, advisory lock on
-- approve-send receipts, composer contract V1.
-- Adds server-side prepare-from-saved-draft, personalised TELLOYA_OFFER composition,
-- read-only email preview (including illustrative draft estimates), and Admin
-- delivery-status fields.
-- Does not enable mail control, approve the DRAFT template, seed catalogue rows,
-- create Stripe objects, send customer email, or touch Production.

CREATE TABLE IF NOT EXISTS admin_private.telloya_approve_send_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_private.telloya_approve_send_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.telloya_approve_send_receipts FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS admin_private.telloya_offer_compose_v1(text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION admin_private.telloya_offer_compose_v1(
  p_enquiry_ref text,
  p_customer_name text,
  p_plan_label text,
  p_minutes_text text,
  p_base_price text,
  p_guard_text text,
  p_total_price text,
  p_custom_notes text,
  p_draft_estimate boolean,
  p_review_href text
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
  v_greeting text;
  v_subject text;
  v_text text;
  v_html text;
  v_name text;
  v_notes text;
  v_href text;
  v_is_draft boolean;
  v_draft_banner text := 'Illustrative draft — not an approved offer; no email sent';
  v_portal_no_link text := 'Sign in to the Customer Portal to review your offer when it is issued. This is not a payment link.';
BEGIN
  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_greeting := CASE
    WHEN v_name IS NULL THEN 'Hello,'
    ELSE 'Hello ' || v_name || ','
  END;
  v_notes := nullif(btrim(coalesce(p_custom_notes, '')), '');
  v_href := nullif(btrim(coalesce(p_review_href, '')), '');
  v_is_draft := coalesce(p_draft_estimate, false);
  v_subject := CASE
    WHEN v_is_draft THEN '[Draft estimate] Your Telloya proposal — ' || p_enquiry_ref
    ELSE 'Your Telloya proposal — ' || p_enquiry_ref
  END;
  v_text := 'TELLOYA_OFFER_COMPOSER_V1'
    || CASE WHEN v_is_draft THEN E'\n\n' || v_draft_banner ELSE '' END
    || E'\n\n' || v_greeting
    || E'\n\nTelloya — a ProfileRelaunch company'
    || E'\nEnquiry ' || p_enquiry_ref
    || E'\nPlan: ' || p_plan_label
    || E'\nIncluded minutes: ' || p_minutes_text
    || E'\nMonthly Telloya amount: ' || p_base_price
    || E'\nRelaunch Guard: ' || p_guard_text
    || E'\nRecurring monthly total: ' || p_total_price
    || CASE WHEN v_notes IS NULL THEN '' ELSE E'\nCustom details: ' || v_notes END
    || E'\nStandard setup is included. One operating location and one receptionist number apply on standard tiers.'
    || E'\nOverage, if offered, needs your authenticated opt-in and a spending cap before any extra charge.'
    || E'\n\nNext steps:'
    || E'\n1. Review your offer in the Customer Portal.'
    || E'\n2. Request changes, or accept the versioned service agreement and recurring consent.'
    || E'\n3. Continue to secure payment when that step is available.'
    || CASE
      WHEN v_href IS NOT NULL THEN
        E'\n\nReview your offer'
        || E'\n' || v_href
        || E'\nThis link is not a payment link.'
      ELSE
        E'\n\n' || v_portal_no_link
    END;
  v_html := '<!-- TELLOYA_OFFER_COMPOSER_V1 -->'
    || '<div style="font-family:Georgia,serif;color:#15202b;line-height:1.5;max-width:560px">'
    || CASE
      WHEN v_is_draft THEN
        '<p style="margin:0 0 16px 0;padding:12px 14px;border:1px solid #b45309;background:#fffbeb;color:#92400e;font-size:14px">'
        || admin_private.telloya_offer_html_v1(v_draft_banner)
        || '</p>'
      ELSE ''
    END
    || '<p style="margin:0 0 12px 0;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#5b6b7c">Telloya — a ProfileRelaunch company</p>'
    || '<p style="margin:0 0 16px 0">' || admin_private.telloya_offer_html_v1(v_greeting) || '</p>'
    || '<p style="margin:0 0 8px 0">Enquiry <strong>' || admin_private.telloya_offer_html_v1(p_enquiry_ref) || '</strong></p>'
    || '<p style="margin:0 0 4px 0">Plan: <strong>' || admin_private.telloya_offer_html_v1(p_plan_label) || '</strong></p>'
    || '<p style="margin:0 0 4px 0">Included minutes: ' || admin_private.telloya_offer_html_v1(p_minutes_text) || '</p>'
    || '<p style="margin:0 0 4px 0">Monthly Telloya amount: ' || admin_private.telloya_offer_html_v1(p_base_price) || '</p>'
    || '<p style="margin:0 0 4px 0">Relaunch Guard: ' || admin_private.telloya_offer_html_v1(p_guard_text) || '</p>'
    || '<p style="margin:0 0 16px 0"><strong>Recurring monthly total: ' || admin_private.telloya_offer_html_v1(p_total_price) || '</strong></p>'
    || CASE WHEN v_notes IS NULL THEN '' ELSE '<p style="margin:0 0 16px 0">Custom details: ' || admin_private.telloya_offer_html_v1(v_notes) || '</p>' END
    || '<p style="margin:0 0 8px 0">Standard setup is included. One operating location and one receptionist number apply on standard tiers.</p>'
    || '<p style="margin:0 0 16px 0">Overage, if offered, needs your authenticated opt-in and a spending cap before any extra charge.</p>'
    || '<p style="margin:0 0 8px 0"><strong>Next steps</strong></p>'
    || '<ol style="margin:0 0 20px 20px;padding:0">'
    || '<li>Review your offer in the Customer Portal.</li>'
    || '<li>Request changes, or accept the versioned service agreement and recurring consent.</li>'
    || '<li>Continue to secure payment when that step is available.</li>'
    || '</ol>'
    || CASE
      WHEN v_href IS NOT NULL THEN
        '<p style="margin:0 0 12px 0"><a href="' || admin_private.telloya_offer_html_v1(v_href) || '" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:4px">Review your offer</a></p>'
        || '<p style="margin:0;color:#5b6b7c;font-size:13px">This link is not a payment link.</p>'
      ELSE
        '<p style="margin:0;color:#5b6b7c;font-size:14px">' || admin_private.telloya_offer_html_v1(v_portal_no_link) || '</p>'
    END
    || '</div>';
  RETURN jsonb_build_object(
    'subject', v_subject,
    'text', v_text,
    'html', v_html,
    'composerVersion', 1
  );
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_offer_compose_v1(text, text, text, text, text, text, text, text, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;

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
  SELECT version, reason, body_text_template
  INTO v_template_version, v_template_reason, v_template_body
  FROM admin_private.communication_templates
  WHERE template_key = 'TELLOYA_OFFER' AND status = 'APPROVED'
  ORDER BY version DESC
  LIMIT 1;
  IF v_template_version IS NULL THEN
    RETURN jsonb_build_object('status', 'template_unapproved');
  END IF;
  IF (
    position('server-composed Telloya offer email' in coalesce(v_template_reason, '')) = 0
    AND position('TELLOYA_OFFER_COMPOSER_V1' in coalesce(v_template_reason, '')) = 0
    AND position('server-composed Telloya offer email' in coalesce(v_template_body, '')) = 0
    AND position('TELLOYA_OFFER_COMPOSER_V1' in coalesce(v_template_body, '')) = 0
  ) THEN
    RETURN jsonb_build_object('status', 'template_unapproved', 'reason', 'composer_contract');
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
        'templateVersion', v_template_version
      )
    );
    RETURN jsonb_build_object(
      'status', 'queued',
      'communicationId', v_comm.id,
      'deliveryStatus', v_comm.delivery_status,
      'composerVersion', 1
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

CREATE OR REPLACE FUNCTION public.telloya_offer_preview_v1(
  p_token text,
  p_enquiry uuid,
  p_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_sub public.commercial_subscriptions;
  v_link record;
  v_email text;
  v_customer_name text;
  v_tier text;
  v_minutes integer;
  v_plan_amount integer;
  v_guard integer;
  v_plan_label text;
  v_minutes_text text;
  v_guard_text text;
  v_base_price text;
  v_price text;
  v_href text := NULL;
  v_custom_notes text := '';
  v_composed jsonb;
  v_mail public.communications;
  v_draft admin_private.telloya_offer_drafts;
  v_req public.onboarding_requests;
  v_enquiry_ref text;
  v_origin_ok boolean := false;
  v_total_minor integer;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_enquiry IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  v_origin_ok := p_origin IS NOT NULL
    AND nullif(btrim(p_origin), '') IS NOT NULL
    AND p_origin ~ '^https://[a-z0-9.-]+$'
    AND (
      p_origin ~ '^https://([a-z0-9-]+\.)*(profilerelaunch\.com|telloya\.com)$'
      OR p_origin = 'https://localhost'
    );

  SELECT public_ref INTO v_enquiry_ref FROM public.enquiries WHERE id = p_enquiry;

  SELECT sub.* INTO v_sub
  FROM public.onboarding_requests AS request
  JOIN public.commercial_subscriptions AS sub ON sub.id = request.commercial_subscription_id
  WHERE request.enquiry_id = p_enquiry AND request.state NOT IN ('DECLINED', 'CLOSED')
  ORDER BY request.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_link FROM admin_private.telloya_linked_offer_v1(v_sub.id) AS linked;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'ineligible');
    END IF;
    v_enquiry_ref := v_link.enquiry_ref;
    SELECT admin_private.normalize_email_v1(email), full_name INTO v_email, v_customer_name
    FROM public.customers WHERE id = v_sub.customer_id;
    SELECT chosen.tier_code, chosen.included_minutes, chosen.amount_minor
    INTO v_tier, v_minutes, v_plan_amount
    FROM (
      SELECT plan.tier_code, conditions.included_minutes, plan.amount_minor
      FROM public.plan_versions AS plan
      JOIN public.commercial_plan_conditions AS conditions
        ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
      WHERE plan.id = v_sub.plan_version_id
      LIMIT 1
    ) AS chosen;
    SELECT count(*)::integer INTO v_guard
    FROM admin_private.commercial_offer_guard_locations AS chosen
    WHERE chosen.subscription_id = v_sub.id;
    SELECT coalesce(draft.custom_requirements, '') INTO v_custom_notes
    FROM public.onboarding_requests AS request
    LEFT JOIN admin_private.telloya_offer_drafts AS draft ON draft.onboarding_request_id = request.id
    WHERE request.commercial_subscription_id = v_sub.id
    ORDER BY request.created_at DESC LIMIT 1;
    IF v_origin_ok THEN
      v_href := p_origin || '/portal/onboarding/offer/' || v_sub.public_ref;
    END IF;
    SELECT * INTO v_mail
    FROM public.communications
    WHERE commercial_subscription_id = v_sub.id AND template_key = 'TELLOYA_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED'
    ORDER BY created_at DESC LIMIT 1;

    v_plan_label := CASE v_tier
      WHEN 'BASIC' THEN 'Basic'
      WHEN 'GROWTH' THEN 'Growth'
      WHEN 'PRO' THEN 'Pro'
      WHEN 'CUSTOM' THEN 'Custom'
      ELSE coalesce(v_tier, 'Plan')
    END;
    v_minutes_text := CASE WHEN v_minutes IS NULL THEN 'confirmed in the quotation' ELSE v_minutes::text END;
    v_guard_text := CASE
      WHEN coalesce(v_guard, 0) = 0 THEN 'not included'
      ELSE v_guard::text || CASE WHEN v_guard = 1 THEN ' location' ELSE ' locations' END
        || ' at ' || admin_private.telloya_gbp_v1(999) || ' each (' || admin_private.telloya_gbp_v1(999 * v_guard) || ')'
    END;
    v_base_price := admin_private.telloya_gbp_v1(coalesce(v_plan_amount, 0));
    v_price := admin_private.telloya_gbp_v1(v_sub.amount_minor);
    v_composed := admin_private.telloya_offer_compose_v1(
      coalesce(v_enquiry_ref, 'TY-00-000000'),
      v_customer_name, v_plan_label, v_minutes_text, v_base_price, v_guard_text, v_price,
      v_custom_notes, false, v_href
    );
    RETURN jsonb_build_object(
      'status', 'ready',
      'previewOnly', true,
      'previewMode', 'approved_offer',
      'sendable', false,
      'subject', v_composed->>'subject',
      'text', v_composed->>'text',
      'html', v_composed->>'html',
      'recipient', v_email,
      'composerVersion', 1,
      'queued', v_mail.id IS NOT NULL,
      'deliveryStatus', v_mail.delivery_status,
      'lifecycle', v_mail.lifecycle
    );
  END IF;

  SELECT * INTO v_req FROM public.onboarding_requests
  WHERE enquiry_id = p_enquiry AND product_code = 'TELLOYA' AND state NOT IN ('DECLINED', 'CLOSED')
  ORDER BY created_at DESC LIMIT 1;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_offer');
  END IF;
  SELECT * INTO v_draft FROM admin_private.telloya_offer_drafts WHERE onboarding_request_id = v_req.id;
  IF v_draft.onboarding_request_id IS NULL OR v_draft.plan_tier IS NULL THEN
    RETURN jsonb_build_object('status', 'draft_required');
  END IF;

  IF v_draft.plan_tier = 'basic' THEN
    v_tier := 'BASIC';
    v_plan_amount := 4900;
    v_minutes := 120;
  ELSIF v_draft.plan_tier = 'growth' THEN
    v_tier := 'GROWTH';
    v_plan_amount := 7900;
    v_minutes := 300;
  ELSIF v_draft.plan_tier = 'pro' THEN
    v_tier := 'PRO';
    v_plan_amount := 12000;
    v_minutes := 500;
  ELSIF v_draft.plan_tier = 'custom' THEN
    IF v_draft.custom_amount_minor IS NULL OR v_draft.custom_amount_minor <= 0 THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'custom_incomplete');
    END IF;
    v_tier := 'CUSTOM';
    v_plan_amount := v_draft.custom_amount_minor;
    v_minutes := v_draft.custom_included_minutes;
  ELSE
    RETURN jsonb_build_object('status', 'draft_required');
  END IF;

  IF cardinality(v_draft.guard_location_ids) > 0 THEN
    v_guard := cardinality(v_draft.guard_location_ids);
  ELSE
    v_guard := coalesce(v_draft.proposed_guard_quantity, 0);
  END IF;
  v_custom_notes := coalesce(v_draft.custom_requirements, '');
  SELECT admin_private.normalize_email_v1(email), full_name INTO v_email, v_customer_name
  FROM public.customers WHERE id = v_req.customer_id;

  v_plan_label := CASE v_tier
    WHEN 'BASIC' THEN 'Basic'
    WHEN 'GROWTH' THEN 'Growth'
    WHEN 'PRO' THEN 'Pro'
    WHEN 'CUSTOM' THEN 'Custom'
    ELSE coalesce(v_tier, 'Plan')
  END;
  v_minutes_text := CASE WHEN v_minutes IS NULL THEN 'confirmed in the quotation' ELSE v_minutes::text END;
  v_guard_text := CASE
    WHEN coalesce(v_guard, 0) = 0 THEN 'not included'
    ELSE v_guard::text || CASE WHEN v_guard = 1 THEN ' location' ELSE ' locations' END
      || ' at ' || admin_private.telloya_gbp_v1(999) || ' each (' || admin_private.telloya_gbp_v1(999 * v_guard) || ')'
  END;
  v_total_minor := coalesce(v_plan_amount, 0) + 999 * coalesce(v_guard, 0);
  v_base_price := admin_private.telloya_gbp_v1(coalesce(v_plan_amount, 0));
  v_price := admin_private.telloya_gbp_v1(v_total_minor);
  -- Draft estimates never emit a live offer href, even when origin is valid.
  v_composed := admin_private.telloya_offer_compose_v1(
    coalesce(v_enquiry_ref, 'TY-00-000000'),
    v_customer_name, v_plan_label, v_minutes_text, v_base_price, v_guard_text, v_price,
    v_custom_notes, true, NULL
  );
  RETURN jsonb_build_object(
    'status', 'ready',
    'previewOnly', true,
    'previewMode', 'draft_estimate',
    'sendable', false,
    'subject', v_composed->>'subject',
    'text', v_composed->>'text',
    'html', v_composed->>'html',
    'recipient', v_email,
    'composerVersion', 1,
    'queued', false
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_preview_v1(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_preview_v1(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.telloya_prepare_offer_from_draft_v1(
  p_token text,
  p_request uuid,
  p_enquiry uuid,
  p_expected_draft_version integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_receipt admin_private.telloya_approve_send_receipts;
  v_fingerprint text;
  v_enquiry public.enquiries;
  v_req public.onboarding_requests;
  v_draft admin_private.telloya_offer_drafts;
  v_plan public.plan_versions;
  v_conditions public.commercial_plan_conditions;
  v_sub public.commercial_subscriptions;
  v_prepare jsonb;
  v_prepare_key uuid;
  v_guard_ids uuid[];
  v_guard_count integer;
  v_result jsonb;
  v_reason text;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_enquiry IS NULL OR p_expected_draft_version IS NULL OR p_expected_draft_version < 1 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  v_reason := left(btrim(coalesce(p_reason, '')), 500);
  IF char_length(v_reason) < 8 THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'reason');
  END IF;

  v_fingerprint := 'prepare_from_draft:' || p_enquiry::text || ':' || p_expected_draft_version::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO v_receipt FROM admin_private.telloya_approve_send_receipts WHERE request_id = p_request;
  IF FOUND THEN
    IF v_receipt.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'fingerprint');
    END IF;
    RETURN v_receipt.response;
  END IF;

  SELECT * INTO v_enquiry FROM public.enquiries WHERE id = p_enquiry;
  IF v_enquiry.id IS NULL OR v_enquiry.source IS DISTINCT FROM 'telloya' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_telloya');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM admin_private.telloya_admin_demos AS demo
    WHERE demo.enquiry_id = v_enquiry.id AND demo.status = 'COMPLETED'
  ) THEN
    RETURN jsonb_build_object('status', 'demonstration_not_completed');
  END IF;

  SELECT * INTO v_req FROM public.onboarding_requests
  WHERE enquiry_id = v_enquiry.id
    AND product_code = 'TELLOYA'
    AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'onboarding_missing');
  END IF;
  IF v_req.customer_id IS NULL OR v_req.business_id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'identity');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships
    WHERE customer_id = v_req.customer_id AND business_id = v_req.business_id AND status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'authority');
  END IF;
  IF admin_private.contact_verified_v1(v_req.customer_id, 'email') IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'recipient_unverified');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM admin_private.onboarding_request_locations WHERE onboarding_request_id = v_req.id
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'operating_location');
  END IF;

  SELECT * INTO v_draft FROM admin_private.telloya_offer_drafts
  WHERE onboarding_request_id = v_req.id
  FOR UPDATE;
  IF v_draft.onboarding_request_id IS NULL THEN
    RETURN jsonb_build_object('status', 'draft_required');
  END IF;
  IF v_draft.record_version IS DISTINCT FROM p_expected_draft_version THEN
    RETURN jsonb_build_object('status', 'stale_draft', 'version', v_draft.record_version);
  END IF;
  IF v_draft.plan_tier IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'plan_tier');
  END IF;
  IF v_draft.proposed_guard_quantity > 0 AND cardinality(v_draft.guard_location_ids) = 0 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'guard_unresolved');
  END IF;
  v_guard_ids := coalesce(v_draft.guard_location_ids, '{}'::uuid[]);
  v_guard_count := cardinality(v_guard_ids);
  IF v_guard_count > 0 AND EXISTS (
    SELECT 1 FROM unnest(v_guard_ids) AS picked(location_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.locations AS location
      WHERE location.id = picked.location_id AND location.business_id = v_req.business_id
    )
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'guard');
  END IF;

  IF v_draft.plan_tier = 'custom' THEN
    IF v_draft.custom_amount_minor IS NULL OR v_draft.custom_amount_minor <= 0
       OR v_draft.custom_included_minutes IS NULL OR v_draft.custom_included_minutes < 1 THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'custom_incomplete');
    END IF;
    SELECT plan.* INTO v_plan
    FROM public.plan_versions AS plan
    JOIN public.commercial_plan_conditions AS conditions
      ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
    WHERE plan.product_code = 'TELLOYA' AND plan.status = 'APPROVED' AND plan.tier_code = 'CUSTOM'
      AND plan.amount_minor = v_draft.custom_amount_minor
      AND conditions.included_minutes = v_draft.custom_included_minutes
      AND plan.currency = 'GBP' AND plan.billing_cadence = 'MONTH'
      AND plan.tax_behaviour = 'NOT_APPLICABLE'
      AND plan.amount_minor IS NOT NULL AND plan.effective_from <= pg_catalog.now()
      AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
    ORDER BY plan.version_number DESC
    LIMIT 1;
  ELSE
    SELECT plan.* INTO v_plan
    FROM public.plan_versions AS plan
    JOIN public.commercial_plan_conditions AS conditions
      ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
    WHERE plan.product_code = 'TELLOYA' AND plan.status = 'APPROVED'
      AND lower(plan.tier_code) = v_draft.plan_tier
      AND plan.currency = 'GBP' AND plan.billing_cadence = 'MONTH'
      AND plan.tax_behaviour = 'NOT_APPLICABLE'
      AND plan.amount_minor IS NOT NULL AND plan.effective_from <= pg_catalog.now()
      AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
    ORDER BY plan.version_number DESC
    LIMIT 1;
  END IF;
  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'terms_unconfigured',
      'reason', CASE WHEN v_draft.plan_tier = 'custom' THEN 'custom_approval' ELSE 'catalogue' END
    );
  END IF;
  SELECT * INTO v_conditions FROM public.commercial_plan_conditions
  WHERE plan_version_id = v_plan.id AND status = 'APPROVED';
  IF v_conditions.id IS NULL THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'conditions');
  END IF;
  IF v_draft.plan_tier = 'custom'
     AND (
       v_plan.amount_minor IS DISTINCT FROM v_draft.custom_amount_minor
       OR v_conditions.included_minutes IS DISTINCT FROM v_draft.custom_included_minutes
     ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'custom_mismatch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_agreement_versions AS agreement
    WHERE agreement.product_code = 'TELLOYA'
      AND agreement.version_ref = v_plan.terms_ref
      AND agreement.status = 'APPROVED'
  ) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'agreement');
  END IF;

  IF v_req.commercial_subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.commercial_subscriptions WHERE id = v_req.commercial_subscription_id;
    IF v_sub.plan_version_id IS DISTINCT FROM v_plan.id
       OR v_sub.amount_minor IS DISTINCT FROM (v_plan.amount_minor + 999 * v_guard_count)
       OR (
         SELECT count(*)::integer FROM admin_private.commercial_offer_guard_locations
         WHERE subscription_id = v_sub.id
       ) IS DISTINCT FROM v_guard_count
       OR EXISTS (
         SELECT 1 FROM unnest(v_guard_ids) AS picked(location_id)
         WHERE NOT EXISTS (
           SELECT 1 FROM admin_private.commercial_offer_guard_locations AS chosen
           WHERE chosen.subscription_id = v_sub.id AND chosen.location_id = picked.location_id
         )
       ) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'offer_mismatch');
    END IF;
    v_result := jsonb_build_object(
      'status', 'success',
      'existing', true,
      'subscriptionId', v_sub.id,
      'version', v_sub.record_version,
      'amountMinor', v_sub.amount_minor,
      'planVersionId', v_sub.plan_version_id,
      'draftVersion', v_draft.record_version
    );
    BEGIN
      INSERT INTO admin_private.telloya_approve_send_receipts(request_id, actor_id, fingerprint, response)
      VALUES (p_request, v_actor, v_fingerprint, v_result);
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_receipt FROM admin_private.telloya_approve_send_receipts WHERE request_id = p_request;
      IF FOUND THEN
        IF v_receipt.fingerprint IS DISTINCT FROM v_fingerprint THEN
          RETURN jsonb_build_object('status', 'conflict', 'reason', 'fingerprint');
        END IF;
        RETURN v_receipt.response;
      END IF;
      RAISE;
    END;
    RETURN v_result;
  END IF;

  v_prepare_key := admin_private.commercial_request_uuid_v1(p_request, 'prepare');
  v_prepare := public.admin_commercial_command_v1(
    p_token,
    v_prepare_key,
    'prepare_offer',
    jsonb_build_object(
      'enquiryId', p_enquiry,
      'planVersionId', v_plan.id,
      'guardLocationIds', to_jsonb(v_guard_ids),
      'reason', v_reason
    ),
    v_req.record_version
  );
  IF v_prepare->>'status' IS DISTINCT FROM 'success' THEN
    RETURN v_prepare;
  END IF;

  SELECT * INTO v_req FROM public.onboarding_requests WHERE id = v_req.id;
  SELECT * INTO v_sub FROM public.commercial_subscriptions WHERE id = v_req.commercial_subscription_id;
  v_result := jsonb_build_object(
    'status', 'success',
    'existing', false,
    'subscriptionId', v_sub.id,
    'version', v_sub.record_version,
    'amountMinor', v_sub.amount_minor,
    'planVersionId', v_sub.plan_version_id,
    'draftVersion', v_draft.record_version,
    'requestVersion', v_req.record_version
  );
  BEGIN
    INSERT INTO admin_private.telloya_approve_send_receipts(request_id, actor_id, fingerprint, response)
    VALUES (p_request, v_actor, v_fingerprint, v_result);
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_receipt FROM admin_private.telloya_approve_send_receipts WHERE request_id = p_request;
    IF FOUND THEN
      IF v_receipt.fingerprint IS DISTINCT FROM v_fingerprint THEN
        RETURN jsonb_build_object('status', 'conflict', 'reason', 'fingerprint');
      END IF;
      RETURN v_receipt.response;
    END IF;
    RAISE;
  END;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_prepare_offer_from_draft_v1(text, uuid, uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_prepare_offer_from_draft_v1(text, uuid, uuid, integer, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.telloya_offer_admin_v1(p_token text, p_enquiry uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_sub public.commercial_subscriptions;
  v_amendments jsonb;
  v_mail public.communications;
  v_recipient text;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT sub.* INTO v_sub
  FROM public.onboarding_requests AS request
  JOIN public.commercial_subscriptions AS sub ON sub.id = request.commercial_subscription_id
  WHERE request.enquiry_id = p_enquiry AND request.state NOT IN ('DECLINED', 'CLOSED')
  ORDER BY request.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_offer');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', amendment.id, 'status', amendment.status, 'version', amendment.record_version, 'text', amendment.request_text
  ) ORDER BY amendment.created_at), '[]'::jsonb)
  INTO v_amendments
  FROM admin_private.telloya_offer_amendments AS amendment
  WHERE amendment.subscription_id = v_sub.id OR amendment.revision_subscription_id = v_sub.id;
  SELECT * INTO v_mail
  FROM public.communications AS mail
  WHERE mail.commercial_subscription_id = v_sub.id
    AND mail.template_key = 'TELLOYA_OFFER'
    AND mail.lifecycle IS DISTINCT FROM 'CANCELLED'
  ORDER BY mail.created_at DESC
  LIMIT 1;
  SELECT admin_private.normalize_email_v1(email) INTO v_recipient
  FROM public.customers WHERE id = v_sub.customer_id;
  RETURN jsonb_build_object(
    'status', 'ready', 'subscriptionId', v_sub.id, 'offerRef', v_sub.public_ref,
    'state', v_sub.state, 'version', v_sub.record_version, 'amendments', v_amendments,
    'planVersionId', v_sub.plan_version_id, 'amountMinor', v_sub.amount_minor,
    'emailQueued', v_mail.id IS NOT NULL,
    'emailLifecycle', v_mail.lifecycle,
    'emailDeliveryStatus', v_mail.delivery_status,
    'emailRecipient', v_recipient,
    'agreementAccepted', v_sub.state IN ('ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END'),
    'paymentStatus', CASE
      WHEN v_sub.state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
        OR EXISTS (SELECT 1 FROM public.commercial_payment_evidence AS evidence WHERE evidence.subscription_id = v_sub.id)
        THEN 'paid'
      WHEN v_sub.state = 'PAYMENT_PENDING' THEN 'verifying'
      ELSE 'none'
    END,
    'provisionState', (
      SELECT provision.state
      FROM public.service_provisions AS provision
      JOIN public.product_entitlements AS entitlement ON entitlement.id = provision.entitlement_id
      WHERE entitlement.commercial_subscription_id = v_sub.id
      ORDER BY provision.updated_at DESC
      LIMIT 1
    ),
    'tier', (SELECT tier_code FROM public.plan_versions WHERE id = v_sub.plan_version_id),
    'enquiryRef', (
      SELECT enquiry.public_ref FROM public.onboarding_requests AS request
      JOIN public.enquiries AS enquiry ON enquiry.id = request.enquiry_id
      WHERE request.commercial_subscription_id = v_sub.id
      ORDER BY request.created_at DESC LIMIT 1
    ),
    'plans', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', plan.id, 'tier', plan.tier_code,
        'label', CASE plan.tier_code WHEN 'BASIC' THEN 'Basic' WHEN 'GROWTH' THEN 'Growth' WHEN 'PRO' THEN 'Pro' WHEN 'CUSTOM' THEN 'Custom' ELSE plan.tier_code END,
        'amountMinor', plan.amount_minor, 'includedMinutes', conditions.included_minutes, 'locationCap', pieces.quantity_limit
      ) ORDER BY plan.tier_code, plan.amount_minor), '[]'::jsonb)
      FROM public.plan_versions AS plan
      JOIN public.commercial_plan_conditions AS conditions
        ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
      JOIN public.plan_components AS pieces
        ON pieces.plan_version_id = plan.id AND pieces.component_code = 'TELLOYA'
      WHERE plan.product_code = 'TELLOYA' AND plan.status = 'APPROVED'
        AND plan.amount_minor IS NOT NULL AND plan.effective_from <= pg_catalog.now()
        AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
        AND pieces.quantity_limit = (
          SELECT count(*)::integer FROM admin_private.onboarding_request_locations AS chosen
          JOIN public.onboarding_requests AS request ON request.id = chosen.onboarding_request_id
          WHERE request.commercial_subscription_id = v_sub.id AND request.state NOT IN ('DECLINED', 'CLOSED')
        )
    ),
    'locations', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', location.id, 'name', location.location_name,
        'selected', EXISTS (
          SELECT 1 FROM admin_private.commercial_offer_guard_locations AS chosen
          WHERE chosen.subscription_id = v_sub.id AND chosen.location_id = location.id
        )
      ) ORDER BY location.location_name), '[]'::jsonb)
      FROM public.locations AS location
      WHERE location.business_id = v_sub.business_id
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_admin_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_admin_v1(text, uuid) TO service_role;

COMMIT;
