BEGIN;

-- COMM-QUOTE-01. Queues one quotation email through the existing communications
-- row, SEND_EMAIL outbox and delivery events. The acceptance secret is an HMAC
-- of a distinct quote-acceptance domain. Only its SHA-256 is stored. The raw
-- bearer is not written to SQL, the job payload, the audit row or the receipt.
-- Source only. Do not apply this file to DEV or Production from this change.
-- It does not send mail, enable Resend, enable Stripe, or alter QT-26-TBGP5Q.

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER'
  ) AND template_version >= 1)
);
ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN ('EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER'));

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES (
  'QUOTE_OFFER',
  1,
  'Quotation',
  'Your ProfileRelaunch quotation {public_ref}',
  'The live quotation email is composed by the server from the offered quotation. This catalogue row documents the template key.',
  'DRAFT',
  'Catalogue row for the server-composed quotation email.'
);
UPDATE admin_private.communication_templates
SET status = 'APPROVED',
    approval_source = 'MIGRATED_EXISTING',
    reason = 'Server-composed quotation snapshot. The approved row documents the key and is not the live email.',
    record_version = record_version + 1
WHERE template_key = 'QUOTE_OFFER' AND version = 1 AND status = 'DRAFT';

CREATE FUNCTION admin_private.quote_offer_lines_present_v1(p_source text, p_body text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  line text;
  seen integer := 0;
BEGIN
  IF p_source IS NULL OR btrim(p_source) = '' OR p_body IS NULL THEN RETURN false; END IF;
  FOR line IN SELECT btrim(item) FROM regexp_split_to_table(p_source, E'\n') AS item
  LOOP
    IF line = '' OR line LIKE 'Standard wording version %' THEN CONTINUE; END IF;
    seen := seen + 1;
    IF seen > 20 OR length(line) > 2000 OR position(line IN p_body) = 0 THEN RETURN false; END IF;
  END LOOP;
  RETURN seen >= 1;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.quote_offer_lines_present_v1(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.quote_offer_snapshot_reason_v1(
  p_subject text,
  p_text text,
  p_html text,
  p_origin text,
  p_action uuid,
  p_public_ref text,
  p_service_name text,
  p_amount integer,
  p_currency text,
  p_payment text,
  p_scope text,
  p_exclusions text,
  p_valid timestamptz,
  p_agreement_hash text,
  p_reply_to text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  own text;
  amount_label text;
  pay text;
  until_label text;
  expected text;
  stripped text;
  label text;
BEGIN
  IF p_subject IS NULL OR p_text IS NULL OR p_html IS NULL OR p_origin IS NULL OR p_action IS NULL
    OR p_public_ref IS NULL OR p_service_name IS NULL OR p_amount IS NULL OR p_currency IS NULL
    OR p_payment IS NULL OR p_valid IS NULL
    OR length(btrim(p_subject)) NOT BETWEEN 1 AND 200
    OR length(p_text) NOT BETWEEN 20 AND 100000
    OR length(p_html) NOT BETWEEN 20 AND 100000
    OR p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_currency !~ '^[A-Z]{3}$'
    OR p_amount < 0
    OR position(p_public_ref IN p_subject) = 0
    OR position('#t=' IN p_subject) > 0
    OR p_subject ~ '[<>]'
    OR p_subject ~* 'https?://'
  THEN RETURN 'snapshot_mismatch'; END IF;
  own := '£' || (p_amount / 100)::text || '.' || lpad((p_amount % 100)::text, 2, '0');
  amount_label := own || ' ' || p_currency;
  pay := CASE p_payment
    WHEN 'UPFRONT' THEN 'Upfront'
    WHEN 'SUCCESS_FEE' THEN 'Success fee'
    WHEN 'RECURRING_MONTHLY' THEN 'Recurring monthly'
    ELSE NULL
  END;
  IF pay IS NULL THEN RETURN 'snapshot_mismatch'; END IF;
  until_label := to_char(p_valid AT TIME ZONE 'Europe/London', 'FMDD FMMonth YYYY');
  expected := p_origin || '/action/' || p_action::text;
  IF position('Quotation: ' || p_public_ref IN p_text) = 0
    OR position('Service: ' || p_service_name IN p_text) = 0
    OR position('Amount: ' || amount_label IN p_text) = 0
    OR position('Payment: ' || pay IN p_text) = 0
    OR position('This quotation is valid until ' || until_label || '.' IN p_text) = 0
    OR position('Included in this quotation' IN p_text) = 0
    OR position('Not included' IN p_text) = 0
    OR position('This secure link expires before that date and no later than seven days after it is sent.' IN p_text) = 0
    OR position('Review and accept quotation' IN p_text) = 0
    OR position('Review and accept quotation' IN p_html) = 0
    OR position('Kind regards,' IN p_text) = 0
    OR position('ProfileRelaunch Support Team' IN p_text) = 0
    OR position('ProfileRelaunch is independent of Google. We do not control Google''s systems, decisions or timescales.' IN p_text) = 0
    OR position('independent of Google' IN p_html) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_text) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN p_html) = 0
    OR position('https://profilerelaunch.com' IN p_text) = 0
    OR NOT admin_private.quote_offer_lines_present_v1(p_scope, p_text)
    OR NOT admin_private.quote_offer_lines_present_v1(p_exclusions, p_text)
  THEN RETURN 'snapshot_mismatch'; END IF;
  IF p_reply_to IS NULL THEN
    IF position('If you have a question about this quotation, contact us through the ProfileRelaunch website.' IN p_text) = 0 THEN
      RETURN 'snapshot_mismatch';
    END IF;
  ELSIF position('If you have a question about this quotation, reply to this email.' IN p_text) = 0 THEN
    RETURN 'snapshot_mismatch';
  END IF;
  FOR label IN SELECT unnest(ARRAY['£99.00', '£59.00', '£299.00', '£149.00', '£9.99'])
  LOOP
    IF position(label IN own) = 0 AND (
      position(label IN p_text) > 0 OR position(label IN p_html) > 0
    ) THEN RETURN 'snapshot_mismatch'; END IF;
  END LOOP;
  IF position('#t=' IN p_text) > 0 OR position('#t=' IN p_html) > 0
    OR position('SHA-256' IN p_text) > 0 OR position('SHA-256' IN p_html) > 0
    OR position('PS-' IN p_text) > 0 OR position('PS-' IN p_html) > 0
    OR position('Standard wording version ' IN p_text) > 0
    OR position('Standard wording version ' IN p_html) > 0
    OR position('<script' IN lower(p_html)) > 0
    OR (p_agreement_hash IS NOT NULL AND (
      position(p_agreement_hash IN p_text) > 0 OR position(p_agreement_hash IN p_html) > 0
    ))
    OR (length(p_text) - length(replace(p_text, expected, ''))) IS DISTINCT FROM length(expected)
    OR (length(p_html) - length(replace(p_html, expected, ''))) IS DISTINCT FROM length(expected)
  THEN RETURN 'snapshot_mismatch'; END IF;
  stripped := replace(replace(p_text, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN
    RETURN 'snapshot_mismatch';
  END IF;
  stripped := replace(replace(p_html, expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN
    RETURN 'snapshot_mismatch';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.quote_offer_snapshot_reason_v1(
  text, text, text, text, uuid, text, text, integer, text, text, text, text, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.protect_quote_offer_email_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.template_key IS DISTINCT FROM 'QUOTE_OFFER' THEN RETURN NEW; END IF;
  IF NEW.lifecycle IS DISTINCT FROM 'QUEUED'
    OR NEW.content_locked IS NOT TRUE
    OR coalesce(NEW.link_key_version, 0) < 1
    OR NEW.customer_action_id IS NULL
    OR NEW.template_version IS DISTINCT FROM 1
    OR position('#t=' IN coalesce(NEW.subject, '')) > 0
    OR position('#t=' IN coalesce(NEW.body_text, '')) > 0
    OR position('#t=' IN coalesce(NEW.body_html, '')) > 0
  THEN
    RAISE EXCEPTION 'quote_offer_email:invalid' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.protect_quote_offer_email_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS communications_quote_offer_email_guard ON public.communications;
CREATE TRIGGER communications_quote_offer_email_guard
  BEFORE INSERT ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.protect_quote_offer_email_v1();

CREATE FUNCTION admin_private.cancel_unsent_quote_offer_email_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.kind IS DISTINCT FROM 'QUOTE_ACCEPTANCE' OR OLD.status IS DISTINCT FROM 'OPEN' OR NEW.status IS DISTINCT FROM 'REVOKED' THEN
    RETURN NEW;
  END IF;
  UPDATE public.communications
    SET lifecycle = 'CANCELLED',
        cancelled_at = now(),
        updated_at = now(),
        record_version = record_version + 1
    WHERE customer_action_id = NEW.id
      AND template_key = 'QUOTE_OFFER'
      AND lifecycle = 'QUEUED'
      AND first_provider_attempt_at IS NULL
      AND delivery_status = 'NONE';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.cancel_unsent_quote_offer_email_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS customer_actions_cancel_unsent_quote_offer ON public.customer_actions;
CREATE TRIGGER customer_actions_cancel_unsent_quote_offer
  AFTER UPDATE OF status ON public.customer_actions
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.cancel_unsent_quote_offer_email_v1();

CREATE FUNCTION public.admin_queue_quote_offer_email_v1(
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
  quote_id uuid;
  action_id uuid;
  link_version integer;
  secret text;
  origin text;
  subject text;
  body_text text;
  body_html text;
  from_address text;
  reply_to text;
  dev_lane boolean;
  fp text;
  cached jsonb;
  qu public.quotes;
  qv public.quote_versions;
  c public.customers;
  cs public.cases;
  parent_case uuid;
  parent_monitoring uuid;
  expires timestamptz;
  prep text;
  action public.customer_actions;
  comm public.communications;
  open_comm public.communications;
  result jsonb;
  reason text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 200000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  BEGIN
    quote_id := (p_payload->>'quoteId')::uuid;
    action_id := (p_payload->>'actionId')::uuid;
    link_version := (p_payload->>'linkKeyVersion')::integer;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  secret := p_payload->>'secretHash';
  origin := btrim(coalesce(p_payload->>'customerOrigin', ''));
  subject := btrim(coalesce(p_payload->>'subject', ''));
  body_text := p_payload->>'bodyText';
  body_html := p_payload->>'bodyHtml';
  from_address := lower(btrim(coalesce(p_payload->>'fromAddress', '')));
  dev_lane := coalesce(p_payload->>'devLane', 'false') = 'true';
  IF quote_id IS NULL OR action_id IS NULL OR link_version IS NULL OR link_version < 1 OR link_version > 100
    OR secret IS NULL OR secret !~ '^[a-f0-9]{64}$'
    OR origin !~ '^https://[A-Za-z0-9.-]+$'
    OR from_address !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    OR length(from_address) > 254
    OR body_text IS NULL OR body_html IS NULL
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
    'queue_quote_offer_email', quote_id, action_id, link_version, origin, subject,
    md5(body_text), md5(body_html), from_address, coalesce(reply_to, ''), dev_lane
  )::text);
  cached := admin_private.communication_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF coalesce(p_payload->>'sendEnabled', 'false') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'send_disabled');
  END IF;

  SELECT * INTO qu FROM public.quotes WHERE id = quote_id FOR UPDATE;
  IF qu.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF qu.public_ref = 'QT-26-TBGP5Q' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'preserved_quote');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = qu.current_version_id FOR UPDATE;
  IF qv.id IS NULL OR qv.quote_id IS DISTINCT FROM qu.id THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF qu.status IS DISTINCT FROM 'OFFERED' OR qv.status IS DISTINCT FROM 'OFFERED' OR qv.tax_behaviour = 'UNCONFIRMED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'quote_not_offered');
  END IF;
  IF qv.valid_until IS NULL OR qv.valid_until <= now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'quote_expired');
  END IF;
  IF qv.service_code IS NULL
    OR qv.commercial_agreement_version IS NULL
    OR qv.commercial_agreement_hash IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.paid_service_agreement_catalogue cat
      WHERE cat.version_id = qv.commercial_agreement_version
        AND cat.content_hash = qv.commercial_agreement_hash
        AND cat.service_code = qv.service_code
        AND cat.service_code IS NOT NULL
        AND cat.status = 'APPROVED'
        AND cat.operative IS TRUE
    )
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'agreement_not_operative');
  END IF;
  SELECT * INTO c FROM public.customers WHERE id = qu.customer_id;
  IF c.id IS NULL OR NOT admin_private.contact_verified_v1(qu.customer_id, 'email') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'contact_unverified');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = qu.customer_id AND m.business_id = qu.business_id AND m.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'authority_unverified');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions sup
    WHERE sup.address_normalized = admin_private.normalize_email_v1(c.email)
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'suppressed');
  END IF;
  IF p_payload ? 'recipient'
    AND nullif(btrim(coalesce(p_payload->>'recipient', '')), '') IS NOT NULL
    AND admin_private.normalize_email_v1(p_payload->>'recipient') IS DISTINCT FROM admin_private.normalize_email_v1(c.email)
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'recipient_mismatch');
  END IF;
  IF dev_lane AND NOT (
    length(admin_private.normalize_email_v1(c.email)) BETWEEN 3 AND 254
    AND position(' ' IN admin_private.normalize_email_v1(c.email)) = 0
    AND right(admin_private.normalize_email_v1(c.email), 12) = '@example.com'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dev_recipient');
  END IF;
  IF qu.case_id IS NOT NULL THEN
    SELECT * INTO cs FROM public.cases WHERE id = qu.case_id FOR UPDATE;
    IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'case_required'); END IF;
    IF cs.status IN ('CLOSED', 'CANCELLED') THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'case_closed');
    END IF;
    parent_case := cs.id;
    parent_monitoring := NULL;
  ELSIF qu.monitoring_request_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.monitoring_requests mon WHERE mon.id = qu.monitoring_request_id
  ) THEN
    parent_case := NULL;
    parent_monitoring := qu.monitoring_request_id;
  ELSE
    RETURN jsonb_build_object('status', 'denied', 'reason', 'case_required');
  END IF;
  IF qv.valid_until <= now() + interval '16 minutes' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'link_window');
  END IF;
  expires := LEAST(qv.valid_until - interval '1 minute', now() + interval '7 days' - interval '1 minute');
  IF expires <= now() + interval '15 minutes' OR expires >= qv.valid_until OR expires > now() + interval '7 days' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'link_window');
  END IF;
  reason := admin_private.quote_offer_snapshot_reason_v1(
    subject, body_text, body_html, origin, action_id, qu.public_ref, qv.service_name,
    qv.total_amount_minor, qv.currency, qv.payment_model, qv.scope_text, qv.exclusions_text,
    qv.valid_until, qv.commercial_agreement_hash, reply_to
  );
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', reason); END IF;
  IF position(secret IN body_text) > 0 OR position(secret IN body_html) > 0 OR position(secret IN subject) > 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  prep := admin_private.prepare_quote_acceptance_action_v1(qv.id);
  IF prep = 'exists' THEN
    SELECT * INTO action FROM public.customer_actions
      WHERE quote_version_id = qv.id AND kind = 'QUOTE_ACCEPTANCE' AND status = 'OPEN'
      ORDER BY created_at DESC LIMIT 1;
    SELECT * INTO open_comm FROM public.communications
      WHERE customer_action_id = action.id AND template_key = 'QUOTE_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED'
      ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object(
      'status', 'denied',
      'reason', 'open_action',
      'actionId', action.id,
      'communicationId', open_comm.id,
      'lifecycle', open_comm.lifecycle,
      'deliveryStatus', open_comm.delivery_status
    );
  END IF;

  INSERT INTO public.customer_actions(
    id, customer_id, business_id, location_id, case_id, quote_version_id,
    kind, secret_hash, expected_email_snapshot, expires_at, created_by
  ) VALUES (
    action_id, qu.customer_id, qu.business_id, qu.location_id, qu.case_id, qv.id,
    'QUOTE_ACCEPTANCE', secret, admin_private.normalize_email_v1(c.email), expires, actor
  ) RETURNING * INTO action;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (
    action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED',
    jsonb_build_object('kind', 'QUOTE_ACCEPTANCE', 'quoteVersionId', qv.id)
  );
  INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
  VALUES (qu.id, qv.id, 'ADMIN', actor, 'ACTION_ISSUED', jsonb_build_object('actionId', action.id));
  INSERT INTO public.communications(
    case_id, monitoring_request_id, customer_id, business_id, customer_action_id,
    channel, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version,
    author_id, reviewer_id, reviewed_at, queued_at, sender_address, reply_to_address,
    content_version, record_version, content_locked, link_key_version
  ) VALUES (
    parent_case, parent_monitoring, qu.customer_id, qu.business_id, action.id,
    'EMAIL', 'QUOTE_OFFER', 'OUTBOUND', admin_private.normalize_email_v1(c.email), subject, body_text, body_html,
    'PENDING', 'QUEUED', 'NONE', 'QUOTE_OFFER', 1,
    actor, actor, now(), now(), from_address, reply_to,
    1, 1, true, link_version
  ) RETURNING * INTO comm;
  PERFORM admin_private.enqueue_outbox_v1(
    'send-email:' || comm.id::text || ':v' || comm.content_version::text,
    'SEND_EMAIL',
    'communication',
    comm.id,
    jsonb_build_object('communicationId', comm.id, 'contentVersion', comm.content_version)
  );
  PERFORM admin_private.append_delivery_event_v1(comm.id, 'QUEUED', 'Quotation email queued for the provider');
  PERFORM admin_private.write_record_audit_v1(
    actor, 'COMMUNICATION_CHANGED', 'success', comm.id, p_request, 'communication',
    'Queued a quotation email. The provider has not accepted it.',
    jsonb_build_object(
      'operation', 'queue_quote_offer_email',
      'quoteId', qu.id,
      'quoteVersionId', qv.id,
      'communicationId', comm.id,
      'actionId', action.id,
      'linkKeyVersion', link_version
    )
  );
  result := jsonb_build_object(
    'status', 'success', 'id', comm.id, 'lifecycle', 'QUEUED', 'deliveryStatus', 'NONE'
  );
  INSERT INTO admin_private.communication_command_receipts(request_id, actor_id, fingerprint, response, created_at)
  VALUES (p_request, actor, fp, result, now());
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    cached := admin_private.communication_receipt_v1(actor, p_request, fp);
    IF cached IS NOT NULL THEN RETURN cached; END IF;
    IF EXISTS (
      SELECT 1 FROM public.customer_actions existing
      WHERE existing.quote_version_id = qv.id AND existing.kind = 'QUOTE_ACCEPTANCE' AND existing.status = 'OPEN'
    ) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'open_action');
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  WHEN raise_exception THEN
    IF SQLERRM = 'closed_case_send_refused' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'case_closed');
    END IF;
    IF left(SQLERRM, 17) = 'quote_offer_email:' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', substr(SQLERRM, 18));
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_queue_quote_offer_email_v1(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_queue_quote_offer_email_v1(text, uuid, jsonb)
  TO service_role;


-- The worker and the DEV claim read the customer origin from a quotation
-- snapshot the same way they already read an evidence-request snapshot.
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
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'reauth_required', NULL, p_request, 'job',
      'DEV email processing requires a fresh sign-in',
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
