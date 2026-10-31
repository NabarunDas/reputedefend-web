-- Immediate DEV dispatch for a published Guided pack and the same claim-and-lease
-- path for the other Admin customer emails that were only queued.
--
-- Source only. Do not apply this file to DEV or Production from the pull request.
-- It does not send mail, take a payment, insert an activation row, enable a
-- worker, or change stored case rows. The sweep claim still requires the
-- activation watermark. These claims do not.

CREATE OR REPLACE FUNCTION admin_private.dev_mail_link_reason_v1(
  p_template text, p_text text, p_html text, p_origin text, p_case_ref text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  body text := coalesce(p_text, '') || ' ' || coalesce(p_html, '');
  url text;
  action_id text;
  text_action text;
  html_action text;
  text_actions integer;
  html_actions integer;
  ref text;
  needs_portal boolean;
BEGIN
  IF position('#t=' in coalesce(p_text, '')) > 0 OR position('#t=' in coalesce(p_html, '')) > 0 THEN
    RETURN 'origin';
  END IF;
  FOR url IN
    SELECT m[1] FROM regexp_matches(body, 'https?://[^[:space:]<>"]+', 'g') AS m
  LOOP
    IF position('?' in url) > 0 OR position('#' in url) > 0 OR left(url, 8) IS DISTINCT FROM 'https://' THEN
      RETURN 'origin';
    END IF;
    -- Exact branding only. Not a path, subdomain, token, or action link.
    IF url IN (
      'https://profilerelaunch.com',
      'https://profilerelaunch.com/',
      'https://www.profilerelaunch.com',
      'https://www.profilerelaunch.com/',
      'https://profilerelaunch.com/brand/profile-relaunch-logo.png'
    ) THEN
      CONTINUE;
    END IF;
    IF p_origin IS NULL THEN
      IF url !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app(/|$)' THEN
        RETURN 'foreign_link';
      END IF;
    ELSIF NOT (url = p_origin OR left(url, length(p_origin) + 1) = p_origin || '/') THEN
      RETURN 'foreign_link';
    END IF;
    IF position('/portal/cases/' IN url) > 0 THEN
      IF p_case_ref IS NULL
        OR (
          position('/portal/cases/' || p_case_ref || '/' IN url) = 0
          AND right(url, length('/portal/cases/' || p_case_ref)) IS DISTINCT FROM '/portal/cases/' || p_case_ref
        )
      THEN
        RETURN 'origin';
      END IF;
    END IF;
    IF position('/action/' IN url) > 0 THEN
      IF p_template IN (
        'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT',
        'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION',
        'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION'
      ) THEN
        RETURN 'origin';
      END IF;
      IF p_origin IS NULL THEN
        IF url !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RETURN 'origin';
        END IF;
      ELSE
        IF left(url, length(p_origin) + 8) IS DISTINCT FROM p_origin || '/action/' THEN
          RETURN 'origin';
        END IF;
        action_id := substring(url FROM length(p_origin) + 9);
        IF action_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RETURN 'origin';
        END IF;
      END IF;
    END IF;
  END LOOP;
  IF p_template IN (
    'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION'
  ) THEN
    IF position('/action/' in body) > 0 THEN
      RETURN 'origin';
    END IF;
    RETURN NULL;
  END IF;
  needs_portal := p_template IN (
    'EVIDENCE_REQUEST', 'QUOTE_OFFER', 'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION'
  );
  IF NOT needs_portal THEN
    RETURN 'origin';
  END IF;
  IF p_case_ref IS NOT NULL THEN
    IF position(p_case_ref IN coalesce(p_text, '')) = 0 OR position(p_case_ref IN coalesce(p_html, '')) = 0 THEN
      RETURN 'origin';
    END IF;
    FOR ref IN
      SELECT m[1] FROM regexp_matches(body, '((?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6})', 'g') AS m
    LOOP
      IF ref IS DISTINCT FROM p_case_ref THEN
        RETURN 'origin';
      END IF;
    END LOOP;
  END IF;
  IF p_origin IS NOT NULL AND position(p_origin IN coalesce(p_text, '')) = 0 THEN
    RETURN 'origin';
  END IF;
  IF p_origin IS NULL AND position('https://profilerelaunch-customer-git-develop-' IN coalesce(p_text, '')) = 0 THEN
    RETURN 'origin';
  END IF;
  IF p_origin IS NOT NULL AND position(p_origin IN coalesce(p_html, '')) = 0 THEN
    RETURN 'origin';
  END IF;
  IF p_template IN ('EVIDENCE_REQUEST', 'QUOTE_OFFER') THEN
    SELECT count(*) INTO text_actions
    FROM regexp_matches(coalesce(p_text, ''), 'https://[^[:space:]<>"]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    SELECT count(*) INTO html_actions
    FROM regexp_matches(coalesce(p_html, ''), 'https://[^[:space:]<>"]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    text_action := substring(coalesce(p_text, '') FROM 'https://[^[:space:]<>"]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    html_action := substring(coalesce(p_html, '') FROM 'https://[^[:space:]<>"]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    IF text_actions IS DISTINCT FROM 1 OR html_actions IS DISTINCT FROM 1 OR text_action IS DISTINCT FROM html_action THEN
      RETURN 'origin';
    END IF;
  END IF;
  IF p_template = 'GUIDED_PACK_READY'
    AND (
      admin_private.fulfilment_page_count_v1(p_text, 'documents') IS DISTINCT FROM 1
      OR admin_private.fulfilment_page_count_v1(p_html, 'documents') IS DISTINCT FROM 1
    )
  THEN
    RETURN 'origin';
  END IF;
  IF p_template = 'GUIDED_COMPLETION'
    AND (
      position('/portal/cases/' IN coalesce(p_text, '')) = 0
      OR position('/documents' IN coalesce(p_text, '')) = 0
      OR position('/portal/cases/' IN coalesce(p_html, '')) = 0
      OR position('/documents' IN coalesce(p_html, '')) = 0
    )
  THEN
    RETURN 'origin';
  END IF;
  IF p_template = 'GUIDED_PAYMENT_REQUEST'
    AND (
      position('/portal/cases/' IN coalesce(p_text, '')) = 0
      OR position('/payments' IN coalesce(p_text, '')) = 0
      OR position('/portal/cases/' IN coalesce(p_html, '')) = 0
      OR position('/payments' IN coalesce(p_html, '')) = 0
      OR position('/action/' IN body) > 0
    )
  THEN
    RETURN 'origin';
  END IF;
  RETURN NULL;
END;
$fn$;

-- Promotes one existing SEND_EMAIL outbox row and leases its job.
-- The caller has already chosen the communication. This does not insert a
-- communication, does not check the activation watermark, and does not call a
-- provider. p_recent refuses an unattempted message older than two hours
-- unless that message already has a due RETRY job.
CREATE FUNCTION admin_private.dev_mail_lease_queued_send_v1(
  p_communication uuid,
  p_customer_origin text,
  p_recent boolean
) RETURNS jsonb
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
  v_link text;
  v_case_ref text;
BEGIN
  IF p_communication IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT * INTO comm
  FROM public.communications
  WHERE id = p_communication
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.communications WHERE id = p_communication) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF comm.lifecycle IS DISTINCT FROM 'QUEUED' OR comm.content_locked IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF comm.template_key = 'PAYMENT_CONFIRMATION' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'payment_worker_owned');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.cases cs
    JOIN public.customers cu ON cu.id = cs.customer_id
    WHERE cs.id = comm.case_id
      AND comm.customer_id = cs.customer_id
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
  IF comm.template_key = 'GUIDED_PACK_READY' THEN
    expected := 'documents';
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
      OR position('/action/' in comm.body_text) > 0
      OR position('/action/' in comm.body_html) > 0
    THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
    END IF;
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
  IF p_recent
    AND comm.first_provider_attempt_at IS NULL
    AND coalesce(comm.queued_at, comm.created_at) < now() - interval '2 hours'
    AND NOT EXISTS (
      SELECT 1
      FROM admin_private.jobs j
      WHERE j.outbox_id = outbox.id
        AND j.job_type = 'SEND_EMAIL'
        AND j.status = 'RETRY'
        AND j.scheduled_at <= now()
    )
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
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

REVOKE ALL ON FUNCTION admin_private.dev_mail_lease_queued_send_v1(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- The caller names a pack, not a communication. Only the announcement already
-- stored for the current published pack can be leased. A second call does not
-- insert another communication.
CREATE FUNCTION public.dev_mail_dispatch_claim_pack_v1(
  p_pack uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.case_prepared_packs;
  cs public.cases;
  comm public.communications;
  v_comm uuid;
BEGIN
  IF p_pack IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT * INTO pack
  FROM public.case_prepared_packs
  WHERE id = p_pack
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.case_prepared_packs WHERE id = p_pack) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF pack.status = 'STALE' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'stale');
  END IF;
  IF pack.status = 'SUPERSEDED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'superseded');
  END IF;
  IF pack.status IS DISTINCT FROM 'APPROVED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid');
  END IF;
  IF pack.published_at IS NULL OR pack.unpublished_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unpublished');
  END IF;
  IF NOT admin_private.pack_publishable_v1(pack.id)
    OR admin_private.guided_pack_materials_reason_v1(pack.id) IS NOT NULL
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.case_prepared_packs other
    WHERE other.case_id = pack.case_id
      AND other.id <> pack.id
      AND other.status IS DISTINCT FROM 'SUPERSEDED'
      AND other.pack_number > pack.pack_number
  ) OR EXISTS (
    SELECT 1
    FROM public.case_prepared_packs other
    WHERE other.case_id = pack.case_id
      AND other.id <> pack.id
      AND other.published_at IS NOT NULL
      AND other.unpublished_at IS NULL
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'superseded');
  END IF;
  SELECT communication_id INTO v_comm
  FROM public.guided_pack_announcements
  WHERE pack_id = pack.id;
  IF v_comm IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  SELECT * INTO comm FROM public.communications WHERE id = v_comm;
  SELECT * INTO cs FROM public.cases WHERE id = pack.case_id;
  IF comm.id IS NULL
    OR comm.template_key IS DISTINCT FROM 'GUIDED_PACK_READY'
    OR comm.case_id IS DISTINCT FROM pack.case_id
    OR comm.customer_id IS DISTINCT FROM cs.customer_id
    OR comm.content_locked IS NOT TRUE
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  RETURN admin_private.dev_mail_lease_queued_send_v1(comm.id, p_customer_origin, false);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text)
  TO service_role;

-- One queued Guided completion for a closed Guided case. It does not close the
-- case again and it does not insert a second completion email.
CREATE FUNCTION public.dev_mail_dispatch_claim_completion_v1(
  p_case uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cs public.cases;
  comm_id uuid;
  queued_count integer;
BEGIN
  IF p_case IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT * INTO cs
  FROM public.cases
  WHERE id = p_case
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.cases WHERE id = p_case) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF cs.service_track IS DISTINCT FROM 'GUIDED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_guided');
  END IF;
  IF cs.status IS DISTINCT FROM 'CLOSED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_closed');
  END IF;
  SELECT count(*)::int INTO queued_count
  FROM public.communications
  WHERE case_id = cs.id
    AND template_key = 'GUIDED_COMPLETION'
    AND lifecycle IS DISTINCT FROM 'CANCELLED';
  IF queued_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  SELECT id INTO comm_id
  FROM public.communications
  WHERE case_id = cs.id
    AND template_key = 'GUIDED_COMPLETION'
    AND lifecycle = 'QUEUED'
    AND content_locked IS TRUE
    AND customer_id = cs.customer_id;
  IF comm_id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  RETURN admin_private.dev_mail_lease_queued_send_v1(comm_id, p_customer_origin, false);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_completion_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_completion_v1(uuid, text)
  TO service_role;

-- A communication the Admin command just queued. Pack, payment and completion
-- mail stay on their own claims. An unattempted message older than two hours
-- is left unpromoted.
CREATE FUNCTION public.dev_mail_dispatch_claim_recent_v1(
  p_communication uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  template text;
BEGIN
  IF p_communication IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT template_key INTO template FROM public.communications WHERE id = p_communication;
  IF template = 'PAYMENT_CONFIRMATION' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'payment_worker_owned');
  END IF;
  IF template IS NULL OR template NOT IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  RETURN admin_private.dev_mail_lease_queued_send_v1(p_communication, p_customer_origin, true);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_recent_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_recent_v1(uuid, text)
  TO service_role;

-- The managed notice stored for this queue request. The caller cannot name a
-- communication or a recipient.
CREATE FUNCTION public.dev_mail_dispatch_claim_notice_v1(
  p_request uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice public.managed_customer_notices;
  template text;
BEGIN
  IF p_request IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT * INTO notice FROM public.managed_customer_notices WHERE request_id = p_request;
  IF notice.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  SELECT template_key INTO template FROM public.communications WHERE id = notice.communication_id;
  IF template IS NULL OR template NOT IN (
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  RETURN admin_private.dev_mail_lease_queued_send_v1(notice.communication_id, p_customer_origin, true);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_notice_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_notice_v1(uuid, text)
  TO service_role;

-- One due retry, or one unattempted message queued in the last two hours, for
-- this case. It does not promote older unattempted mail and it does not touch
-- a pack, payment or completion message.
CREATE FUNCTION public.dev_mail_dispatch_claim_case_retry_v1(
  p_case uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comm uuid;
BEGIN
  IF p_case IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT picked.id INTO v_comm
  FROM (
    SELECT c.id
    FROM public.communications c
    WHERE c.case_id = p_case
      AND c.lifecycle = 'QUEUED'
      AND c.content_locked IS TRUE
      AND c.template_key IN (
        'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT',
        'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION'
      )
      AND (
        (
          c.first_provider_attempt_at IS NULL
          AND coalesce(c.delivery_status, 'NONE') = 'NONE'
          AND coalesce(c.queued_at, c.created_at) >= now() - interval '2 hours'
        )
        OR EXISTS (
          SELECT 1
          FROM admin_private.jobs j
          JOIN admin_private.job_outbox ob ON ob.id = j.outbox_id
          WHERE ob.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
            AND j.job_type = 'SEND_EMAIL'
            AND j.status = 'RETRY'
            AND j.scheduled_at <= now()
        )
      )
    ORDER BY coalesce(c.queued_at, c.created_at), c.id
    LIMIT 1
    FOR UPDATE OF c SKIP LOCKED
  ) picked;
  IF v_comm IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  RETURN admin_private.dev_mail_lease_queued_send_v1(v_comm, p_customer_origin, true);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_case_retry_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_case_retry_v1(uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
