BEGIN;

-- Guided payment request after quotation-email acceptance.
-- Secure Action sessions and Customer Portal sessions are different.
-- The action function accepts only an unexpired customer_action_sessions row
-- for a completed QUOTE_ACCEPTANCE. It does not call customer_portal_actor_v1.
-- The portal function is replaced here so it no longer sets a 900-second hold.
-- Both wrappers stamp the sender, reply mailbox and portal origin from the
-- QUOTE_OFFER stored for that acceptance. A caller-supplied address is removed
-- before the queue body runs. Neither wrapper sets a dispatch hold, so the
-- outbox is eligible at once. A payment receipt still cancels an unsent email.
-- The body remains authoritative for the order, obligation, duplicate action,
-- paid, authority and snapshot checks. These wrappers do not insert an action,
-- queue an email, or mark a payment by themselves.
-- Immediate sending stays in the Admin dispatcher. This file does not call a
-- provider, enable the mail worker, or insert an activation row.
-- dev_mail_dispatch_claim_request_v1 leases only the GUIDED_PAYMENT_REQUEST
-- stored for one queue request. The caller cannot name a communication, and a
-- request id for any other template is refused. The sweep claim
-- public.dev_mail_dispatch_claim_v1 still requires the activation watermark.
-- Source only. Do not apply this file to DEV or Production from this change.

CREATE FUNCTION admin_private.guided_payment_approved_identity_v1(p_order uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ord public.service_orders;
  act_id uuid;
  comm public.communications;
  upload text;
  origin text;
  sender text;
  reply_to text;
BEGIN
  SELECT * INTO ord FROM public.service_orders WHERE id = p_order;
  IF ord.id IS NULL OR ord.quote_acceptance_id IS NULL THEN RETURN NULL; END IF;
  SELECT acc.customer_action_id INTO act_id
  FROM public.quote_acceptances acc
  WHERE acc.id = ord.quote_acceptance_id
    AND acc.quote_version_id = ord.quote_version_id;
  IF act_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO comm FROM public.communications
  WHERE customer_action_id = act_id
    AND template_key = 'QUOTE_OFFER'
    AND lifecycle IS DISTINCT FROM 'CANCELLED'
    AND content_locked IS TRUE
    AND sender_address IS NOT NULL
    AND reply_to_address IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  IF comm.id IS NULL THEN RETURN NULL; END IF;
  upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
  IF upload IS NULL THEN RETURN NULL; END IF;
  origin := regexp_replace(upload, '/action/.*$', '');
  IF origin !~ '^https://[A-Za-z0-9.-]+$' THEN RETURN NULL; END IF;
  IF upload IS DISTINCT FROM origin || '/action/' || act_id::text THEN RETURN NULL; END IF;
  sender := lower(btrim(comm.sender_address));
  reply_to := lower(btrim(comm.reply_to_address));
  IF sender !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(sender) > 254
    OR reply_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(reply_to) > 254
  THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('customerOrigin', origin, 'fromAddress', sender, 'replyTo', reply_to);
END;
$$;

REVOKE ALL ON FUNCTION admin_private.guided_payment_approved_identity_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.guided_payment_customer_payload_v1(
  p_payload jsonb,
  p_order uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  identity jsonb;
  payload jsonb;
BEGIN
  IF p_payload ? 'useCurrentVersion' OR p_payload ? 'actorType' OR p_payload ? 'dispatchHoldSeconds' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  identity := admin_private.guided_payment_approved_identity_v1(p_order);
  IF identity IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mail_identity');
  END IF;
  payload := (p_payload - ARRAY['fromAddress', 'replyTo', 'customerOrigin', 'sendEnabled', 'recipient'])
    || identity
    || jsonb_build_object('useCurrentVersion', true, 'actorType', 'CUSTOMER', 'sendEnabled', true);
  RETURN jsonb_build_object('status', 'ready', 'payload', payload);
END;
$$;

REVOKE ALL ON FUNCTION admin_private.guided_payment_customer_payload_v1(jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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
  prepared jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL OR p_payload IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
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
  prepared := admin_private.guided_payment_customer_payload_v1(p_payload, order_id);
  IF prepared->>'status' IS DISTINCT FROM 'ready' THEN RETURN prepared; END IF;
  RETURN admin_private.queue_guided_payment_request_body_v1(sess.auth_user_id, p_request, prepared->'payload');
END;
$$;

REVOKE ALL ON FUNCTION public.customer_action_queue_guided_payment_request_v1(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_queue_guided_payment_request_v1(text, uuid, jsonb)
  TO service_role;

-- Returns the sender, reply mailbox and portal origin stored on the accepted
-- quotation. It does not return the recipient and it does not queue mail.
CREATE FUNCTION public.customer_guided_payment_mail_identity_v1(
  p_token_hash text,
  p_service_order uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess admin_private.customer_action_sessions;
  act public.customer_actions;
  ord public.service_orders;
  v_customer uuid;
  identity jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_service_order IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions
    WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NOT NULL THEN
    SELECT * INTO act FROM public.customer_actions WHERE id = sess.action_id;
    IF act.id IS NULL OR act.kind IS DISTINCT FROM 'QUOTE_ACCEPTANCE' OR act.status IS DISTINCT FROM 'COMPLETED' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
    END IF;
    SELECT * INTO ord FROM public.service_orders WHERE id = p_service_order;
    IF ord.id IS NULL
      OR ord.customer_id IS DISTINCT FROM act.customer_id
      OR ord.case_id IS DISTINCT FROM act.case_id
    THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.quote_acceptances acc
      WHERE acc.id = ord.quote_acceptance_id
        AND acc.customer_action_id = act.id
        AND acc.quote_version_id = ord.quote_version_id
    ) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
    END IF;
  ELSE
    SELECT customer_id INTO v_customer FROM admin_private.customer_portal_actor_v1(p_token_hash);
    IF v_customer IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
    SELECT * INTO ord FROM public.service_orders WHERE id = p_service_order AND customer_id = v_customer;
    IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
  END IF;
  identity := admin_private.guided_payment_approved_identity_v1(ord.id);
  IF identity IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mail_identity'); END IF;
  RETURN identity || jsonb_build_object('status', 'success');
END;
$$;

REVOKE ALL ON FUNCTION public.customer_guided_payment_mail_identity_v1(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_guided_payment_mail_identity_v1(text, uuid)
  TO service_role;

-- Replaces the applied portal wrapper. The replacement does not set a dispatch
-- hold. Identity is taken from the stored quotation, not from the caller.
CREATE OR REPLACE FUNCTION public.customer_queue_guided_payment_request_v1(
  p_token_hash text,
  p_request uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer uuid;
  v_auth uuid;
  order_id uuid;
  ord public.service_orders;
  prepared jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  SELECT customer_id, auth_user_id INTO v_customer, v_auth
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR p_request IS NULL OR p_payload IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  BEGIN
    order_id := (p_payload->>'serviceOrderId')::uuid;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF order_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = order_id;
  IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM v_customer THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_acceptances acc
    WHERE acc.id = ord.quote_acceptance_id
      AND acc.quote_version_id = ord.quote_version_id
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  prepared := admin_private.guided_payment_customer_payload_v1(p_payload, order_id);
  IF prepared->>'status' IS DISTINCT FROM 'ready' THEN RETURN prepared; END IF;
  RETURN admin_private.queue_guided_payment_request_body_v1(v_auth, p_request, prepared->'payload');
END;
$$;

REVOKE ALL ON FUNCTION public.customer_queue_guided_payment_request_v1(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_queue_guided_payment_request_v1(text, uuid, jsonb)
  TO service_role;

-- Leases the payment-request communication stored for one queue request.
-- The caller cannot name a communication. Only a GUIDED_PAYMENT_REQUEST for a
-- GUIDED_PAYMENT action is eligible. Any other template, including a quotation
-- or an evidence request, is refused. An already-paid obligation is cancelled
-- while it is still unsent and is not leased. A future outbox time, a provider
-- attempt, and an exhausted lease stay refused. This does not check the
-- activation watermark: that watermark still gates
-- public.dev_mail_dispatch_claim_v1, so the sweep cannot send older mail.
-- This function does not call a provider.
CREATE FUNCTION public.dev_mail_dispatch_claim_request_v1(
  p_request uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
  comm public.communications;
  outbox admin_private.job_outbox;
  row admin_private.jobs;
  token uuid;
  attempt_no integer;
  v_key text;
  v_link text;
  v_case_ref text;
BEGIN
  IF p_request IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT response INTO receipt
  FROM admin_private.communication_command_receipts
  WHERE request_id = p_request;
  IF receipt IS NULL OR receipt->>'status' IS DISTINCT FROM 'success' OR receipt->>'id' IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  BEGIN
    SELECT * INTO comm FROM public.communications
      WHERE id = (receipt->>'id')::uuid
      FOR UPDATE SKIP LOCKED;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.communications WHERE id = (receipt->>'id')::uuid) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF comm.lifecycle IS DISTINCT FROM 'QUEUED' OR comm.content_locked IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF comm.template_key IS DISTINCT FROM 'GUIDED_PAYMENT_REQUEST' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_actions pay
    WHERE pay.id = comm.customer_action_id AND pay.kind = 'GUIDED_PAYMENT'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.customer_actions pay
    JOIN public.payment_obligations ob ON ob.id = pay.payment_obligation_id
    WHERE pay.id = comm.customer_action_id
      AND (
        ob.state = 'PAID'
        OR EXISTS (
          SELECT 1 FROM public.payment_receipts receipt_row
          WHERE receipt_row.service_order_id = pay.service_order_id
        )
      )
  ) THEN
    PERFORM admin_private.cancel_unsent_guided_payment_request_v1(comm.customer_action_id);
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_paid');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.cases cs
    JOIN public.customers cu ON cu.id = cs.customer_id
    WHERE cs.id = comm.case_id
      AND admin_private.normalize_email_v1(comm.recipient) = admin_private.normalize_email_v1(cu.email)
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'recipient_mismatch');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions s
    WHERE s.address_normalized = admin_private.normalize_email_v1(comm.recipient)
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'suppressed');
  END IF;
  IF comm.delivery_status IN (
    'PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE',
    'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed');
  END IF;
  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown');
  END IF;
  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT cs.public_ref INTO v_case_ref FROM public.cases cs WHERE cs.id = comm.case_id;
  v_link := admin_private.dev_mail_link_reason_v1(comm.template_key, comm.body_text, comm.body_html, p_customer_origin, v_case_ref);
  IF v_link IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', v_link);
  END IF;
  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = v_key FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF outbox.topic IS DISTINCT FROM 'SEND_EMAIL'
    OR outbox.aggregate_id IS DISTINCT FROM comm.id
    OR outbox.payload->>'communicationId' IS DISTINCT FROM comm.id::text
    OR outbox.payload->>'contentVersion' IS DISTINCT FROM comm.content_version::text
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;
  IF comm.first_provider_attempt_at IS NOT NULL AND EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RUNNING'
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at >= now()
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  IF comm.first_provider_attempt_at IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RETRY'
      AND j.scheduled_at <= now()
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RUNNING'
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at >= now()
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'DEAD_LETTER'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter');
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
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', row.status);
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'jobId', row.id);
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
      RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
          lease_owner = NULL, lease_token = NULL,
          last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
  END IF;
  token := extensions.gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING', claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-mail-dispatch', lease_token = token,
        attempts = row.attempts + 1, updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-mail-dispatch', token, NULL);
  RETURN jsonb_build_object(
    'status', 'success',
    'replay', false,
    'jobId', row.id,
    'jobType', row.job_type,
    'idempotencyKey', row.idempotency_key,
    'payload', row.payload,
    'leaseToken', token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_request_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_request_v1(uuid, text)
  TO service_role;

-- Records a fixed handover reason for the accepted order. It does not accept
-- a message, an address, or a communication id, and it does not queue or send.
CREATE FUNCTION public.customer_record_guided_payment_handover_v1(
  p_token_hash text,
  p_request uuid,
  p_service_order uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess admin_private.customer_action_sessions;
  act public.customer_actions;
  ord public.service_orders;
  v_customer uuid;
  v_auth uuid;
  v_outcome text;
  v_reason text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL OR p_service_order IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  v_reason := CASE p_reason
    WHEN 'mail_not_configured' THEN 'Guided payment email was not queued because outgoing mail is not configured'
    WHEN 'queue_denied' THEN 'Guided payment email was not queued'
    WHEN 'queue_unavailable' THEN 'Guided payment email queue could not be confirmed'
    WHEN 'dispatch_not_configured' THEN 'Guided payment email stayed queued because immediate development sending is not configured'
    WHEN 'dispatch_held' THEN 'Guided payment email stayed queued until its dispatch hold ends'
    WHEN 'dispatch_conflict' THEN 'Guided payment email stayed queued because it is already being processed'
    WHEN 'provider_accepted' THEN 'Development payment email was accepted by the provider'
    WHEN 'provider_retryable' THEN 'Development payment email stayed retryable after the provider did not accept it'
    WHEN 'provider_dead' THEN 'Development payment email was not accepted and was not submitted again'
    WHEN 'acceptance_unknown' THEN 'Development payment email was not submitted again because provider acceptance is unknown'
    WHEN 'queued' THEN 'Guided payment email was queued and the provider has not accepted it'
    WHEN 'already_paid' THEN 'Guided payment email was not sent because the order is already paid'
    ELSE NULL
  END;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  v_outcome := CASE
    WHEN p_reason IN ('provider_accepted', 'queued', 'dispatch_held') THEN 'success'
    ELSE 'denied'
  END;
  SELECT * INTO sess FROM admin_private.customer_action_sessions
    WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NOT NULL THEN
    SELECT * INTO act FROM public.customer_actions WHERE id = sess.action_id;
    IF act.id IS NULL OR act.kind IS DISTINCT FROM 'QUOTE_ACCEPTANCE' OR act.status IS DISTINCT FROM 'COMPLETED' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
    END IF;
    SELECT candidate.* INTO ord
    FROM public.service_orders candidate
    JOIN public.quote_acceptances acc ON acc.id = candidate.quote_acceptance_id
    WHERE candidate.id = p_service_order
      AND acc.customer_action_id = act.id
      AND acc.quote_version_id = act.quote_version_id
      AND candidate.customer_id = act.customer_id
      AND candidate.case_id = act.case_id;
    IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
    v_auth := sess.auth_user_id;
  ELSE
    SELECT customer_id, auth_user_id INTO v_customer, v_auth
    FROM admin_private.customer_portal_actor_v1(p_token_hash);
    IF v_customer IS NULL OR v_auth IS NULL THEN
      RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    SELECT * INTO ord FROM public.service_orders WHERE id = p_service_order AND customer_id = v_customer;
    IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
  END IF;
  PERFORM admin_private.write_record_audit_v1(
    v_auth, 'COMMUNICATION_CHANGED', v_outcome, ord.case_id, p_request, 'case', v_reason,
    jsonb_build_object('operation', 'guided_payment_handover', 'reason', p_reason)
  );
  RETURN jsonb_build_object('status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.customer_record_guided_payment_handover_v1(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_record_guided_payment_handover_v1(text, uuid, uuid, text)
  TO service_role;

COMMIT;
