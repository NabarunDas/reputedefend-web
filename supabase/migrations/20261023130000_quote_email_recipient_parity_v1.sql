BEGIN;
-- ENV-PARITY DEV quotation recipient support.
-- Replaces only the current function definition without changing existing data.
-- A quotation email is addressed to the verified customer from public.customers.
-- The same contact verification, business authority, suppression, agreement, quote
-- state, recipient mismatch, idempotency, portal and audit checks remain in force.
-- Legacy devAllowlistedRecipient is read ONLY for the historical idempotency
-- fingerprint of earlier requests, not to filter who may receive an email.
-- This is an ordinary migration usable in a clean DEV or Production schema;
-- applying it never sends an email or activates any provider.

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

COMMIT;
