-- PAYMENTS-E2E-POSTCHECKOUT-01. Source only. Do not apply to DEV or Production
-- from this change. Do not replay 20261025163000, 20261026140000 or
-- 20261026170000. This file does not charge a card, refund a payment, mark an
-- obligation paid, or edit a Stripe event receipt.
--
-- It stores a customer-safe receipt reference, returns that reference from the
-- owned receipt download, and lets the closed DEV payment worker claim the one
-- payment-confirmation email it queued. The claim promotes that one row
-- itself. It does not promote a shared outbox batch.

BEGIN;

CREATE FUNCTION admin_private.payment_receipt_public_ref_v1()
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  yy text;
  bytes bytea;
  token text;
  candidate text;
  i integer;
  attempts integer := 0;
BEGIN
  yy := to_char(timezone('utc', now()), 'YY');
  LOOP
    attempts := attempts + 1;
    IF attempts > 20 THEN RAISE EXCEPTION 'could not generate a unique receipt reference'; END IF;
    bytes := extensions.gen_random_bytes(6);
    token := '';
    FOR i IN 0..5 LOOP
      token := token || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;
    candidate := 'RC-' || yy || '-' || token;
    IF NOT EXISTS (SELECT 1 FROM public.payment_receipts WHERE public_ref = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.payment_receipt_public_ref_v1()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.payment_receipts ADD COLUMN public_ref text;

DO $$
DECLARE
  receipt uuid;
BEGIN
  FOR receipt IN SELECT id FROM public.payment_receipts WHERE public_ref IS NULL LOOP
    UPDATE public.payment_receipts
      SET public_ref = admin_private.payment_receipt_public_ref_v1()
      WHERE id = receipt AND public_ref IS NULL;
  END LOOP;
END;
$$;

ALTER TABLE public.payment_receipts
  ALTER COLUMN public_ref SET DEFAULT admin_private.payment_receipt_public_ref_v1();
ALTER TABLE public.payment_receipts
  ALTER COLUMN public_ref SET NOT NULL;
ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_public_ref_format
  CHECK (public_ref ~ '^RC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$');
CREATE UNIQUE INDEX payment_receipts_public_ref_key ON public.payment_receipts (public_ref);

CREATE OR REPLACE FUNCTION public.customer_portal_receipt_v1(p_token_hash text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
    'receiptRef', r.public_ref,
    'reference', cs.public_ref,
    'orderRef', ord.public_ref,
    'serviceName', qv.service_name,
    'amountMinor', r.amount_minor,
    'currency', r.currency,
    'taxBehaviour', r.tax_behaviour,
    'taxAmountMinor', r.tax_amount_minor,
    'paidAt', r.paid_at,
    'paymentStatus', 'Paid',
    'providerLabel', 'Card payment through Stripe'
  ) INTO v_row
  FROM public.payment_receipts r
  JOIN public.service_orders ord ON ord.id = r.service_order_id AND ord.customer_id = v_customer
  JOIN public.quote_versions qv ON qv.id = ord.quote_version_id
  JOIN public.cases cs ON cs.id = ord.case_id AND cs.customer_id = v_customer
  WHERE r.customer_id = v_customer
    AND admin_private.customer_portal_receipt_selector_v1(r.id) = p_selector;
  IF v_row IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  RETURN v_row;
END;
$receipt$;

-- One PAYMENT_CONFIRMATION that this worker queued. Other templates stay queued.
CREATE FUNCTION public.dev_payment_confirmation_claim_v1(p_customer_origin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
  v_key text;
BEGIN
  IF p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;

  SELECT c.* INTO comm
  FROM public.guided_payment_confirmations link
  JOIN public.communications c ON c.id = link.communication_id
  JOIN public.payment_receipts receipt ON receipt.id = link.receipt_id
  WHERE c.template_key = 'PAYMENT_CONFIRMATION'
    AND c.lifecycle = 'QUEUED'
    AND c.content_locked IS TRUE
    AND c.delivery_status IS DISTINCT FROM 'PROVIDER_ACCEPTED'
    AND c.delivery_status IS DISTINCT FROM 'DELIVERED'
    AND c.delivery_status IS DISTINCT FROM 'TRANSIENT_BOUNCE'
    AND c.delivery_status IS DISTINCT FROM 'UNDETERMINED_BOUNCE'
    AND c.delivery_status IS DISTINCT FROM 'ACCEPTANCE_UNKNOWN'
    AND c.first_provider_attempt_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM admin_private.job_outbox queued
      JOIN admin_private.jobs job ON job.outbox_id = queued.id
      WHERE queued.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
        AND (
          job.status IN ('SUCCEEDED', 'DEAD_LETTER')
          OR (
            job.status = 'RUNNING'
            AND job.lease_expires_at IS NOT NULL
            AND job.lease_expires_at >= now()
          )
        )
    )
  ORDER BY c.created_at
  LIMIT 1
  FOR UPDATE OF c SKIP LOCKED;

  IF comm.id IS NULL THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;

  expected := 'payments';
  text_upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
  html_upload := substring(coalesce(comm.body_html, '') from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
  text_urls := admin_private.fulfilment_page_count_v1(comm.body_text, expected);
  html_urls := admin_private.fulfilment_page_count_v1(comm.body_html, expected);
  IF comm.body_html IS NULL
    OR text_urls IS DISTINCT FROM 1
    OR html_urls IS DISTINCT FROM 1
    OR text_upload IS DISTINCT FROM html_upload
    OR text_upload IS NULL
    OR position(p_customer_origin || '/portal/cases/' IN text_upload) IS DISTINCT FROM 1
    OR right(text_upload, length(expected)) IS DISTINCT FROM expected
    OR position('#t=' in comm.body_text) > 0
    OR position('#t=' in comm.body_html) > 0
    OR position('/action/' in comm.body_text) > 0
    OR position('/action/' in comm.body_html) > 0
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;

  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

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
  IF comm.delivery_status IN ('PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
  END IF;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' OR comm.first_provider_attempt_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown', 'jobId', row.id, 'jobStatus', row.status);
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
        lease_owner = 'dev-payment-events', lease_token = token,
        attempts = row.attempts + 1, updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-payment-events', token, NULL);

  RETURN jsonb_build_object(
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
END;
$$;

REVOKE ALL ON FUNCTION public.dev_payment_confirmation_claim_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev_payment_confirmation_claim_v1(text) TO service_role;

COMMIT;
