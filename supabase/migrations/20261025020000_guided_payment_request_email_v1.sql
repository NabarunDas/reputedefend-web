BEGIN;

-- ADMIN-JOURNEY payment request. Queues one branded payment-request email for an
-- accepted Guided upfront order. The button opens the authenticated Customer
-- Portal payments page. It does not carry a bearer secret, open Stripe, or
-- mark an obligation paid.
-- An existing OPEN payment action is reused. A second action is created only
-- when none is still open. This file does not email any existing case by itself.
-- Source only. Do not apply this file to DEV or Production from this change.

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER', 'GUIDED_PAYMENT_REQUEST'
  ) AND template_version >= 1)
);
ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER', 'GUIDED_PAYMENT_REQUEST'
  ));

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES (
  'GUIDED_PAYMENT_REQUEST',
  1,
  'Guided payment request',
  'Pay for your ProfileRelaunch order {order_ref}',
  'The live payment-request email is composed by the server from the accepted order. This catalogue row documents the template key.',
  'DRAFT',
  'Catalogue row for the server-composed Guided payment request.'
);
UPDATE admin_private.communication_templates
SET status = 'APPROVED',
    approval_source = 'MIGRATED_EXISTING',
    reason = 'Server-composed payment-request snapshot. The approved row documents the key and is not the live email.',
    record_version = record_version + 1
WHERE template_key = 'GUIDED_PAYMENT_REQUEST' AND version = 1 AND status = 'DRAFT';

CREATE FUNCTION admin_private.guided_payment_request_snapshot_reason_v1(
  p_subject text,
  p_text text,
  p_html text,
  p_origin text,
  p_case_ref text,
  p_order_ref text,
  p_service_name text,
  p_service_code text,
  p_amount integer,
  p_reply_to text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  expected text;
  label text;
  amount_label text;
  stripped text;
BEGIN
  IF p_service_code = 'GUIDED_RELAUNCH' AND p_amount = 9900 AND p_service_name = 'Guided Relaunch' THEN
    label := 'Pay £99 securely';
    amount_label := '£99.00 GBP';
  ELSIF p_service_code = 'GUIDED_REVIEW' AND p_amount = 5900 AND p_service_name = 'Guided Review' THEN
    label := 'Pay £59 securely';
    amount_label := '£59.00 GBP';
  ELSE
    RETURN 'snapshot_mismatch';
  END IF;
  IF p_origin IS NULL OR p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_case_ref IS NULL OR p_case_ref !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_order_ref IS NULL OR p_order_ref !~ '^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_subject IS NULL OR p_text IS NULL OR p_html IS NULL
  THEN RETURN 'snapshot_mismatch'; END IF;
  expected := p_origin || '/portal/cases/' || p_case_ref || '/payments';
  IF position(p_order_ref IN p_subject) = 0
    OR position(p_service_name IN p_text) = 0 OR position(p_service_name IN p_html) = 0
    OR position(p_order_ref IN p_text) = 0 OR position(p_order_ref IN p_html) = 0
    OR position(p_case_ref IN p_text) = 0 OR position(p_case_ref IN p_html) = 0
    OR position(amount_label IN p_text) = 0 OR position(amount_label IN p_html) = 0
    OR position(label IN p_text) = 0 OR position(label IN p_html) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_text) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_html) = 0
    OR position('Opening this email does not start a card payment.' IN p_text) = 0
    OR position('Opening this email does not start a card payment.' IN p_html) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_text) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_html) = 0
    OR position('#t=' IN p_subject) > 0 OR position('#t=' IN p_text) > 0 OR position('#t=' IN p_html) > 0
    OR position('/action/' IN p_text) > 0 OR position('/action/' IN p_html) > 0
    OR position('Quotation:' IN p_text) > 0 OR position('Review and accept quotation' IN p_text) > 0
    OR (length(p_text) - length(replace(p_text, expected, ''))) IS DISTINCT FROM length(expected)
    OR (length(p_html) - length(replace(p_html, expected, ''))) IS DISTINCT FROM length(expected)
    OR (length(p_text) - length(replace(p_text, label, ''))) IS DISTINCT FROM length(label)
    OR (length(p_html) - length(replace(p_html, label, ''))) IS DISTINCT FROM length(label)
  THEN RETURN 'snapshot_mismatch'; END IF;
  IF p_reply_to IS NULL THEN
    IF position('If you have a question about this payment, contact us through the ProfileRelaunch website.' IN p_text) = 0
      OR position('If you have a question about this payment, contact us through the ProfileRelaunch website.' IN p_html) = 0
    THEN RETURN 'snapshot_mismatch'; END IF;
  ELSE
    IF position('If you have a question about this payment, simply reply to this email and keep the order reference in the subject.' IN p_text) = 0
      OR position('If you have a question about this payment, simply reply to this email and keep the order reference in the subject.' IN p_html) = 0
    THEN RETURN 'snapshot_mismatch'; END IF;
  END IF;
  stripped := replace(replace(p_text, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot_mismatch'; END IF;
  stripped := replace(replace(p_html, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot_mismatch'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.guided_payment_request_snapshot_reason_v1(
  text, text, text, text, text, text, text, text, integer, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.protect_guided_payment_request_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.template_key IS DISTINCT FROM 'GUIDED_PAYMENT_REQUEST' THEN RETURN NEW; END IF;
  IF NEW.lifecycle IS DISTINCT FROM 'QUEUED'
    OR NEW.content_locked IS NOT TRUE
    OR NEW.link_key_version IS NOT NULL
    OR NEW.customer_action_id IS NULL
    OR NEW.template_version IS DISTINCT FROM 1
    OR position('#t=' IN coalesce(NEW.subject, '')) > 0
    OR position('#t=' IN coalesce(NEW.body_text, '')) > 0
    OR position('#t=' IN coalesce(NEW.body_html, '')) > 0
    OR position('/action/' IN coalesce(NEW.body_text, '')) > 0
    OR position('/action/' IN coalesce(NEW.body_html, '')) > 0
  THEN
    RAISE EXCEPTION 'guided_payment_request:invalid' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.protect_guided_payment_request_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS communications_guided_payment_request_guard ON public.communications;
CREATE TRIGGER communications_guided_payment_request_guard
  BEFORE INSERT ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.protect_guided_payment_request_v1();

CREATE FUNCTION admin_private.cancel_unsent_guided_payment_request_v1(p_action uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.communications
    SET lifecycle = 'CANCELLED',
        cancelled_at = now(),
        updated_at = now(),
        record_version = record_version + 1
    WHERE customer_action_id = p_action
      AND template_key = 'GUIDED_PAYMENT_REQUEST'
      AND lifecycle = 'QUEUED'
      AND first_provider_attempt_at IS NULL
      AND delivery_status = 'NONE';
END;
$$;
REVOKE ALL ON FUNCTION admin_private.cancel_unsent_guided_payment_request_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.cancel_guided_payment_request_on_action_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM 'GUIDED_PAYMENT' OR OLD.status IS DISTINCT FROM 'OPEN' OR NEW.status = 'OPEN' THEN
    RETURN NEW;
  END IF;
  PERFORM admin_private.cancel_unsent_guided_payment_request_v1(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.cancel_guided_payment_request_on_action_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS customer_actions_cancel_guided_payment_request ON public.customer_actions;
CREATE TRIGGER customer_actions_cancel_guided_payment_request
  AFTER UPDATE OF status ON public.customer_actions
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.cancel_guided_payment_request_on_action_v1();

CREATE FUNCTION admin_private.cancel_guided_payment_request_on_receipt_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE action_id uuid;
BEGIN
  FOR action_id IN
    SELECT id FROM public.customer_actions
    WHERE service_order_id = NEW.service_order_id AND kind = 'GUIDED_PAYMENT'
  LOOP
    PERFORM admin_private.cancel_unsent_guided_payment_request_v1(action_id);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.cancel_guided_payment_request_on_receipt_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS payment_receipts_cancel_guided_payment_request ON public.payment_receipts;
CREATE TRIGGER payment_receipts_cancel_guided_payment_request
  AFTER INSERT ON public.payment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.cancel_guided_payment_request_on_receipt_v1();

CREATE FUNCTION public.admin_queue_guided_payment_request_v1(
  p_token text,
  p_request uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  order_id uuid;
  expected_version integer;
  origin text;
  subject text;
  body_text text;
  body_html text;
  from_address text;
  reply_to text;
  fp text;
  cached jsonb;
  ord public.service_orders;
  ob public.payment_obligations;
  qv public.quote_versions;
  c public.customers;
  cs public.cases;
  action public.customer_actions;
  comm public.communications;
  open_count integer;
  reused boolean := false;
  prep text;
  secret text;
  expires timestamptz;
  reason text;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 200000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  BEGIN
    order_id := (p_payload->>'serviceOrderId')::uuid;
    expected_version := (p_payload->>'version')::integer;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  origin := btrim(coalesce(p_payload->>'customerOrigin', ''));
  subject := btrim(coalesce(p_payload->>'subject', ''));
  body_text := p_payload->>'bodyText';
  body_html := p_payload->>'bodyHtml';
  from_address := lower(btrim(coalesce(p_payload->>'fromAddress', '')));
  IF order_id IS NULL OR expected_version IS NULL OR expected_version < 1
    OR origin !~ '^https://[A-Za-z0-9.-]+$'
    OR from_address !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    OR length(from_address) > 254
    OR subject IS NULL OR body_text IS NULL OR body_html IS NULL
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_payload->>'replyTo' IS NULL OR btrim(p_payload->>'replyTo') = '' THEN
    reply_to := NULL;
  ELSE
    reply_to := lower(btrim(p_payload->>'replyTo'));
    IF length(reply_to) > 254 OR reply_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
  END IF;
  fp := md5(jsonb_build_array(
    'queue_guided_payment_request', order_id, expected_version, origin, subject,
    md5(body_text), md5(body_html), from_address, coalesce(reply_to, '')
  )::text);
  cached := admin_private.communication_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF coalesce(p_payload->>'sendEnabled', 'false') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'send_disabled');
  END IF;
  IF position('#t=' IN subject) > 0 OR position('#t=' IN body_text) > 0 OR position('#t=' IN body_html) > 0
    OR position('/action/' IN body_text) > 0 OR position('/action/' IN body_html) > 0
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  SELECT * INTO ord FROM public.service_orders WHERE id = order_id FOR UPDATE;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF expected_version IS DISTINCT FROM ord.record_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'stale_version');
  END IF;
  IF ord.payment_model = 'SUCCESS_FEE' OR ord.service_code IN ('MANAGED_RELAUNCH', 'MANAGED_REVIEW') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'success_fee');
  END IF;
  IF ord.service_code = 'RELAUNCH_GUARD' OR ord.payment_model = 'RECURRING_MONTHLY' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'guard_separate');
  END IF;
  IF ord.service_code NOT IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    OR ord.payment_model IS DISTINCT FROM 'UPFRONT'
    OR ord.currency IS DISTINCT FROM 'GBP'
    OR ord.state IS DISTINCT FROM 'ACCEPTED_AWAITING_PAYMENT'
    OR ord.tax_behaviour NOT IN ('NOT_APPLICABLE', 'INCLUSIVE')
    OR (ord.service_code = 'GUIDED_RELAUNCH' AND ord.amount_minor IS DISTINCT FROM 9900)
    OR (ord.service_code = 'GUIDED_REVIEW' AND ord.amount_minor IS DISTINCT FROM 5900)
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;

  SELECT * INTO cs FROM public.cases WHERE id = ord.case_id FOR UPDATE;
  IF cs.id IS NULL OR cs.customer_id IS DISTINCT FROM ord.customer_id
    OR cs.business_id IS DISTINCT FROM ord.business_id
    OR cs.location_id IS DISTINCT FROM ord.location_id
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
  IF cs.status IN ('CLOSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'case_closed');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF qv.id IS NULL OR qv.status IS DISTINCT FROM 'ACCEPTED'
    OR qv.service_code IS DISTINCT FROM ord.service_code
    OR qv.payment_model IS DISTINCT FROM 'UPFRONT'
    OR qv.total_amount_minor IS DISTINCT FROM ord.amount_minor
    OR qv.currency IS DISTINCT FROM 'GBP'
    OR qv.customer_id IS DISTINCT FROM ord.customer_id
    OR qv.case_id IS DISTINCT FROM ord.case_id
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
  SELECT * INTO c FROM public.customers WHERE id = ord.customer_id;
  IF c.id IS NULL OR NOT admin_private.contact_verified_v1(ord.customer_id, 'email') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'contact_unverified');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = ord.customer_id AND m.business_id = ord.business_id AND m.status = 'verified'
  ) THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'authority_unverified'); END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions sup
    WHERE sup.address_normalized = admin_private.normalize_email_v1(c.email)
  ) THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'suppressed'); END IF;
  IF p_payload ? 'recipient'
    AND nullif(btrim(coalesce(p_payload->>'recipient', '')), '') IS NOT NULL
    AND admin_private.normalize_email_v1(p_payload->>'recipient') IS DISTINCT FROM admin_private.normalize_email_v1(c.email)
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'recipient_mismatch'); END IF;

  SELECT * INTO ob FROM public.payment_obligations
    WHERE service_order_id = ord.id AND kind = 'UPFRONT' AND state <> 'VOID'
    FOR UPDATE;
  IF ob.id IS NULL OR ob.customer_id IS DISTINCT FROM ord.customer_id
    OR ob.case_id IS DISTINCT FROM ord.case_id
    OR ob.amount_minor IS DISTINCT FROM ord.amount_minor
    OR ob.currency IS DISTINCT FROM 'GBP'
    OR ob.tax_behaviour NOT IN ('NOT_APPLICABLE', 'INCLUSIVE')
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'unmatched_payment'); END IF;
  IF (SELECT count(*) FROM public.payment_obligations other
      WHERE other.service_order_id = ord.id AND other.kind = 'UPFRONT' AND other.state <> 'VOID') > 1
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'unmatched_payment'); END IF;
  IF ob.state = 'PAID' OR EXISTS (SELECT 1 FROM public.payment_receipts receipt WHERE receipt.service_order_id = ord.id) THEN
    FOR action IN
      SELECT * FROM public.customer_actions existing
      WHERE existing.service_order_id = ord.id AND existing.kind = 'GUIDED_PAYMENT'
    LOOP
      PERFORM admin_private.cancel_unsent_guided_payment_request_v1(action.id);
    END LOOP;
    action := NULL;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_paid');
  END IF;
  IF ob.state IS DISTINCT FROM 'DUE' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unmatched_payment');
  END IF;
  IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unmatched_payment');
  END IF;

  SELECT count(*) INTO open_count FROM public.customer_actions
    WHERE service_order_id = ord.id AND kind = 'GUIDED_PAYMENT' AND status = 'OPEN';
  IF open_count > 1 THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'duplicate_action'); END IF;
  IF open_count = 1 THEN
    SELECT * INTO action FROM public.customer_actions
      WHERE service_order_id = ord.id AND kind = 'GUIDED_PAYMENT' AND status = 'OPEN'
      FOR UPDATE;
    IF action.expires_at > now() THEN
      reused := true;
    ELSE
      prep := admin_private.prepare_payment_action_v1(ord.id, 'GUIDED_PAYMENT');
      action := NULL;
    END IF;
  ELSE
    prep := admin_private.prepare_payment_action_v1(ord.id, 'GUIDED_PAYMENT');
  END IF;
  IF action.id IS NOT NULL THEN
    IF action.payment_obligation_id IS DISTINCT FROM ob.id
      OR action.customer_id IS DISTINCT FROM ord.customer_id
      OR action.case_id IS DISTINCT FROM ord.case_id
      OR admin_private.normalize_email_v1(action.expected_email_snapshot) IS DISTINCT FROM admin_private.normalize_email_v1(c.email)
    THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
  ELSE
    IF prep = 'exists' THEN
      SELECT * INTO action FROM public.customer_actions
        WHERE service_order_id = ord.id AND kind = 'GUIDED_PAYMENT' AND status = 'OPEN'
        FOR UPDATE;
    END IF;
    IF action.id IS NULL THEN
      secret := encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex');
      expires := now() + interval '7 days' - interval '1 minute';
      INSERT INTO public.customer_actions(
        customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
        kind, secret_hash, expected_email_snapshot, expires_at, created_by
      ) VALUES (
        ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id,
        'GUIDED_PAYMENT', secret, admin_private.normalize_email_v1(c.email), expires, actor
      ) RETURNING * INTO action;
      INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
      VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', 'GUIDED_PAYMENT', 'source', 'payment_request'));
    END IF;
  END IF;

  reason := admin_private.guided_payment_request_snapshot_reason_v1(
    subject, body_text, body_html, origin, cs.public_ref, ord.public_ref,
    qv.service_name, ord.service_code, ord.amount_minor, reply_to
  );
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', reason); END IF;

  SELECT * INTO comm FROM public.communications
    WHERE customer_action_id = action.id
      AND template_key = 'GUIDED_PAYMENT_REQUEST'
      AND lifecycle IS DISTINCT FROM 'CANCELLED'
    ORDER BY created_at DESC
    LIMIT 1;
  IF comm.id IS NOT NULL THEN
    result := jsonb_build_object(
      'status', 'success', 'id', comm.id, 'lifecycle', comm.lifecycle,
      'deliveryStatus', comm.delivery_status, 'replay', true, 'reusedAction', true, 'actionId', action.id
    );
    INSERT INTO admin_private.communication_command_receipts(request_id, actor_id, fingerprint, response, created_at)
    VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  INSERT INTO public.communications(
    case_id, customer_id, business_id, customer_action_id,
    channel, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version,
    author_id, reviewer_id, reviewed_at, queued_at, sender_address, reply_to_address,
    content_version, record_version, content_locked
  ) VALUES (
    cs.id, ord.customer_id, ord.business_id, action.id,
    'EMAIL', 'GUIDED_PAYMENT_REQUEST', 'OUTBOUND', admin_private.normalize_email_v1(c.email), subject, body_text, body_html,
    'PENDING', 'QUEUED', 'NONE', 'GUIDED_PAYMENT_REQUEST', 1,
    actor, actor, now(), now(), from_address, reply_to,
    1, 1, true
  ) RETURNING * INTO comm;
  PERFORM admin_private.enqueue_outbox_v1(
    'send-email:' || comm.id::text || ':v' || comm.content_version::text,
    'SEND_EMAIL',
    'communication',
    comm.id,
    jsonb_build_object('communicationId', comm.id, 'contentVersion', comm.content_version)
  );
  PERFORM admin_private.append_delivery_event_v1(comm.id, 'QUEUED', 'Payment-request email queued for the provider');
  PERFORM admin_private.write_record_audit_v1(
    actor, 'COMMUNICATION_CHANGED', 'success', comm.id, p_request, 'communication',
    'Queued a Guided payment-request email. The provider has not accepted it and the payment is not complete.',
    jsonb_build_object(
      'operation', 'queue_guided_payment_request',
      'serviceOrderId', ord.id,
      'communicationId', comm.id,
      'actionId', action.id
    )
  );
  result := jsonb_build_object(
    'status', 'success', 'id', comm.id, 'lifecycle', 'QUEUED', 'deliveryStatus', 'NONE',
    'replay', false, 'reusedAction', reused, 'actionId', action.id
  );
  INSERT INTO admin_private.communication_command_receipts(request_id, actor_id, fingerprint, response, created_at)
  VALUES (p_request, actor, fp, result, now());
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    cached := admin_private.communication_receipt_v1(actor, p_request, fp);
    IF cached IS NOT NULL THEN RETURN cached; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  WHEN raise_exception THEN
    IF left(SQLERRM, 23) = 'guided_payment_request:' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', substr(SQLERRM, 24));
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_queue_guided_payment_request_v1(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_queue_guided_payment_request_v1(text, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.communication_load_send_v1(p_communication uuid, p_content_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.communications; origin text; upload text;
BEGIN
  IF p_communication IS NULL OR p_content_version IS NULL OR p_content_version < 1 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication;
  IF row.id IS NULL OR row.lifecycle IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.lifecycle <> 'QUEUED' OR row.content_locked IS NOT TRUE OR row.content_version <> p_content_version
    OR btrim(coalesce(row.recipient, '')) = '' OR btrim(coalesce(row.subject, '')) = ''
    OR btrim(coalesce(row.body_text, '')) = '' OR btrim(coalesce(row.sender_address, '')) = ''
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.template_key IN ('EVIDENCE_REQUEST', 'QUOTE_OFFER') THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f-]{36}');
    IF upload IS NULL OR position('#t=' in row.body_text) > 0 OR position('#t=' in coalesce(row.body_html, '')) > 0 THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    origin := regexp_replace(upload, '/action/.*$', '');
  ELSIF row.template_key = 'GUIDED_PAYMENT_REQUEST' THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/payments');
    IF upload IS NULL
      OR position('#t=' in row.body_text) > 0
      OR position('#t=' in coalesce(row.body_html, '')) > 0
      OR position('/action/' in row.body_text) > 0
      OR position('/action/' in coalesce(row.body_html, '')) > 0
    THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    origin := regexp_replace(upload, '/portal/cases/.*$', '');
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'communicationId', row.id,
    'lifecycle', row.lifecycle,
    'deliveryStatus', coalesce(row.delivery_status, 'NONE'),
    'contentVersion', row.content_version,
    'contentLocked', row.content_locked,
    'recipient', row.recipient,
    'subject', row.subject,
    'bodyText', row.body_text,
    'bodyHtml', row.body_html,
    'templateKey', row.template_key,
    'customerActionId', row.customer_action_id,
    'customerOrigin', origin,
    'senderAddress', row.sender_address,
    'replyToAddress', row.reply_to_address,
    'inReplyTo', row.in_reply_to,
    'referencesHeader', row.references_header,
    'rfcMessageId', row.rfc_message_id,
    'linkKeyVersion', row.link_key_version,
    'firstProviderAttemptAt', row.first_provider_attempt_at,
    'suppressed', EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(row.recipient)
    )
  );
END; $$;

REVOKE ALL ON FUNCTION public.communication_load_send_v1(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.communication_load_send_v1(uuid, integer)
  TO service_role;

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

COMMIT;
