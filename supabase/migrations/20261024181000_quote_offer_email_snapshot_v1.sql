-- QUOTE-EMAIL-VALIDATION-01. Accept the approved concise Guided Relaunch
-- quotation email without treating that wording as a changed quotation.
-- The stored quote, service agreement, recipient, authority, suppression,
-- validity, idempotency and payment gates are unchanged. Customised quotes
-- and every other service keep the previous line-by-line snapshot checks.
-- Source only. Do not apply this file to DEV or Production from this change.
-- It does not send mail, edit a quotation, or take a payment.

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
  p_reply_to text,
  p_tax text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  own text;
  amount_label text;
  pay text;
  until_label text;
  expected text;
  stripped text;
  label text;
  concise boolean;
  reply_case text := 'If you have any questions about this quotation, simply reply to this email and keep your case reference in the subject.';
  reply_quote text := 'If you have any questions about this quotation, simply reply to this email and keep your quotation reference in the subject.';
  reply_legacy text := 'If you have a question about this quotation, reply to this email.';
  website text := 'If you have a question about this quotation, contact us through the ProfileRelaunch website.';
  guided_scope text := $scope$Guided Relaunch (£99 upfront). The final customer price is £99 upfront. ProfileRelaunch prepares the work and the customer submits it. We prepare it. You submit it. We organise the evidence and prepare what needs to be submitted. You remain the person who files it with Google. A Guided fee is payable upfront only after you have accepted a valid quotation and this agreement. Total price, inclusive of any applicable taxes. No additional taxes or mandatory fees charged by ProfileRelaunch.

Standard wording version SCOPE-2026-10-21.3.$scope$;
  guided_exclusions text := $exclusions$Google makes final platform decisions. Managed success fees are payable only when the defined successful outcome is achieved under the service terms. Total price, inclusive of any applicable taxes. No additional taxes or mandatory fees charged by ProfileRelaunch. ProfileRelaunch does not submit the prepared profile work to Google. This quote does not include Managed case work, a success fee, or Relaunch Guard monitoring. This is an upfront guided recovery service. Payment collection is a later step and is not taken by accepting this quote. The quoted amount is payable later through the payment workflow. Accepting this quote does not charge a card and is not payment authorisation.$exclusions$;
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
  concise := p_service_name = 'Guided Relaunch'
    AND p_amount = 9900
    AND p_currency = 'GBP'
    AND p_payment = 'UPFRONT'
    AND p_tax IN ('NOT_APPLICABLE', 'INCLUSIVE')
    AND p_scope = guided_scope
    AND p_exclusions = guided_exclusions;
  IF position('Quotation: ' || p_public_ref IN p_text) = 0
    OR position('Service: ' || p_service_name IN p_text) = 0
    OR position('Amount: ' || amount_label IN p_text) = 0
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
  THEN RETURN 'snapshot_mismatch'; END IF;
  IF concise THEN
    IF position('Amount: ' || amount_label || ' — inclusive of any applicable taxes.' IN p_text) = 0
      OR position('Amount: ' || amount_label || ' — inclusive of any applicable taxes.' IN p_html) = 0
      OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_text) = 0
      OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN p_html) = 0
      OR position('Payment: The £99 fee is payable upfront through a separate payment step after you accept this quotation and the service agreement. Acceptance does not charge your card.' IN p_text) = 0
      OR position('Payment: The £99 fee is payable upfront through a separate payment step after you accept this quotation and the service agreement. Acceptance does not charge your card.' IN p_html) = 0
      OR position('We organise your evidence and prepare the materials needed for your Google Business Profile relaunch submission.' IN p_text) = 0
      OR position('We organise your evidence and prepare the materials needed for your Google Business Profile relaunch submission.' IN p_html) = 0
      OR position('You review and submit the prepared materials to Google yourself.' IN p_text) = 0
      OR position('You review and submit the prepared materials to Google yourself.' IN p_html) = 0
      OR position('Submitting the prepared work to Google or managing the case with Google on your behalf.' IN p_text) = 0
      OR position('Submitting the prepared work to Google or managing the case with Google on your behalf.' IN p_html) = 0
      OR position('Ongoing profile and review monitoring.' IN p_text) = 0
      OR position('Ongoing profile and review monitoring.' IN p_html) = 0
      OR position('A guaranteed result or processing time; Google makes the final decision.' IN p_text) = 0
      OR position('A guaranteed result or processing time; Google makes the final decision.' IN p_html) = 0
      OR position('We prepare it. You submit it.' IN p_text) > 0
      OR position('We prepare it. You submit it.' IN p_html) > 0
      OR position('Managed success fees are payable' IN p_text) > 0
      OR position('Managed success fees are payable' IN p_html) > 0
      OR position('Payment: Upfront' IN p_text) > 0
      OR position('Payment: Upfront' IN p_html) > 0
    THEN RETURN 'snapshot_mismatch'; END IF;
  ELSE
    IF position('Payment: ' || pay IN p_text) = 0
      OR NOT admin_private.quote_offer_lines_present_v1(p_scope, p_text)
      OR NOT admin_private.quote_offer_lines_present_v1(p_exclusions, p_text)
      OR position('The £99 fee is payable upfront through a separate payment step' IN p_text) > 0
      OR position('— inclusive of any applicable taxes.' IN p_text) > 0
    THEN RETURN 'snapshot_mismatch'; END IF;
  END IF;
  IF p_reply_to IS NULL THEN
    IF position(website IN p_text) = 0 OR position(website IN p_html) = 0 THEN
      RETURN 'snapshot_mismatch';
    END IF;
  ELSIF concise THEN
    IF (position(reply_case IN p_text) = 0 OR position(reply_case IN p_html) = 0)
      AND (position(reply_quote IN p_text) = 0 OR position(reply_quote IN p_html) = 0)
    THEN RETURN 'snapshot_mismatch'; END IF;
  ELSIF NOT (
    (position(reply_legacy IN p_text) > 0 AND position(reply_legacy IN p_html) > 0)
    OR (position(reply_case IN p_text) > 0 AND position(reply_case IN p_html) > 0)
    OR (position(reply_quote IN p_text) > 0 AND position(reply_quote IN p_html) > 0)
  ) THEN
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
$fn$;

REVOKE ALL ON FUNCTION admin_private.quote_offer_snapshot_reason_v1(
  text, text, text, text, uuid, text, text, integer, text, text, text, text, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_queue_quote_offer_email_v1(
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
  raw_allow text;
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
  raw_allow := coalesce(p_payload->>'devAllowlistedRecipient', '');
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
    md5(body_text), md5(body_html), from_address, coalesce(reply_to, ''), dev_lane, raw_allow
  )::text);
  cached := admin_private.communication_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF coalesce(p_payload->>'sendEnabled', 'false') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'send_disabled');
  END IF;

  SELECT * INTO qu FROM public.quotes WHERE id = quote_id FOR UPDATE;
  IF qu.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
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
    qv.valid_until, qv.commercial_agreement_hash, reply_to, qv.tax_behaviour
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

DROP FUNCTION admin_private.quote_offer_snapshot_reason_v1(
  text, text, text, text, uuid, text, text, integer, text, text, text, text, timestamptz, text, text
);
