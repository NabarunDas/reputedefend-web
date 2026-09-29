BEGIN;

-- Step 11: reviewed outbound communications, templates, delivery events, SEND_EMAIL.
-- Does not reinterpret legacy communications.status SENT as inbox delivery.

ALTER TABLE public.customer_actions DROP CONSTRAINT IF EXISTS customer_actions_kind_check;
ALTER TABLE public.customer_actions
  ADD CONSTRAINT customer_actions_kind_check
  CHECK (kind IN ('AGREEMENT_ACCEPTANCE','AUTHORIZATION_REVOCATION','CASE_ACCESS','COMMUNICATION_ACCESS'));

ALTER TABLE public.customer_actions
  ADD COLUMN evidence_request_id uuid REFERENCES public.evidence_requests(id) ON DELETE RESTRICT,
  ADD COLUMN link_key_version integer;

ALTER TABLE public.customer_actions DROP CONSTRAINT IF EXISTS customer_actions_case_access_scope_check;
ALTER TABLE public.customer_actions
  ADD CONSTRAINT customer_actions_case_access_scope_check
  CHECK (
    kind NOT IN ('CASE_ACCESS','COMMUNICATION_ACCESS')
    OR (
      agreement_version_id IS NULL
      AND authorization_id IS NULL
      AND case_id IS NOT NULL
      AND customer_id IS NOT NULL
      AND business_id IS NOT NULL
    )
  );
ALTER TABLE public.customer_actions
  ADD CONSTRAINT customer_actions_communication_access_scope_check
  CHECK (
    (kind = 'COMMUNICATION_ACCESS' AND evidence_request_id IS NOT NULL AND link_key_version >= 1)
    OR (kind <> 'COMMUNICATION_ACCESS' AND evidence_request_id IS NULL AND link_key_version IS NULL)
  );

DROP INDEX IF EXISTS public.customer_actions_one_open_kind_idx;
CREATE UNIQUE INDEX customer_actions_one_open_kind_idx
  ON public.customer_actions (case_id, kind, coalesce(agreement_version_id, authorization_id, evidence_request_id))
  WHERE status = 'OPEN' AND case_id IS NOT NULL;
CREATE UNIQUE INDEX customer_actions_one_open_communication_access_idx
  ON public.customer_actions (evidence_request_id)
  WHERE status = 'OPEN' AND kind = 'COMMUNICATION_ACCESS';

CREATE OR REPLACE FUNCTION admin_private.protect_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
    OR NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
    OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
    OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.secret_hash IS DISTINCT FROM OLD.secret_hash
    OR NEW.expected_email_snapshot IS DISTINCT FROM OLD.expected_email_snapshot
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Customer action scope fields are immutable'; END IF;
  IF OLD.status = 'OPEN' THEN
    IF NEW.status NOT IN ('OPEN','COMPLETED','DECLINED','REVOKED') THEN
      RAISE EXCEPTION 'Invalid customer action status transition';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Customer action status is terminal';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION admin_private.protect_customer_action_scope_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.validate_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.agreement_versions; auth public.authorization_records; c public.customers; cs public.cases;
  req public.evidence_requests;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO c FROM public.customers WHERE id = NEW.customer_id;
    IF c.id IS NULL OR lower(NEW.expected_email_snapshot) IS DISTINCT FROM lower(c.email) THEN
      RAISE EXCEPTION 'Customer action email snapshot does not match the current customer email';
    END IF;
  END IF;
  IF NEW.kind = 'AGREEMENT_ACCEPTANCE' THEN
    IF NEW.agreement_version_id IS NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Agreement acceptance actions require an agreement version and no authorisation';
    END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = NEW.agreement_version_id;
    IF v.id IS NULL
      OR v.case_id IS DISTINCT FROM NEW.case_id
      OR v.customer_id IS DISTINCT FROM NEW.customer_id
      OR v.business_id IS DISTINCT FROM NEW.business_id
      OR v.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced agreement'; END IF;
  ELSIF NEW.kind = 'AUTHORIZATION_REVOCATION' THEN
    IF NEW.authorization_id IS NULL OR NEW.agreement_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'Authorisation revocation actions require an authorisation and no agreement version';
    END IF;
    SELECT * INTO auth FROM public.authorization_records WHERE id = NEW.authorization_id;
    IF auth.id IS NULL
      OR auth.case_id IS DISTINCT FROM NEW.case_id
      OR auth.customer_id IS DISTINCT FROM NEW.customer_id
      OR auth.business_id IS DISTINCT FROM NEW.business_id
      OR auth.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced authorisation'; END IF;
  ELSIF NEW.kind IN ('CASE_ACCESS','COMMUNICATION_ACCESS') THEN
    IF NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL OR NEW.case_id IS NULL THEN
      RAISE EXCEPTION 'Case access actions require a case and no agreement or authorisation';
    END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NEW.case_id;
    IF cs.id IS NULL
      OR cs.customer_id IS DISTINCT FROM NEW.customer_id
      OR cs.business_id IS DISTINCT FROM NEW.business_id
      OR cs.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced case'; END IF;
    IF TG_OP = 'INSERT' AND cs.status IN ('CLOSED','CANCELLED') THEN
      RAISE EXCEPTION 'Case access cannot be created for a closed case';
    END IF;
    IF NEW.kind = 'CASE_ACCESS' AND NEW.evidence_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'Case access actions cannot pin an evidence request';
    END IF;
    IF NEW.kind = 'COMMUNICATION_ACCESS' THEN
      IF NEW.evidence_request_id IS NULL OR NEW.link_key_version IS NULL OR NEW.link_key_version < 1 THEN
        RAISE EXCEPTION 'Communication access actions require an evidence request and link key version';
      END IF;
      SELECT * INTO req FROM public.evidence_requests WHERE id = NEW.evidence_request_id;
      IF req.id IS NULL
        OR req.case_id IS DISTINCT FROM NEW.case_id
        OR req.case_id IS DISTINCT FROM cs.id
        OR (TG_OP = 'INSERT' AND req.status <> 'OPEN')
      THEN RAISE EXCEPTION 'Communication access does not match the referenced evidence request'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid customer action kind';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.revoke_case_access_action_v1(p_action uuid, p_reason text, p_details jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions; reason text; details jsonb;
BEGIN
  reason := btrim(coalesce(p_reason, ''));
  IF p_action IS NULL OR length(reason) NOT BETWEEN 10 AND 2000 THEN RETURN false; END IF;
  SELECT * INTO a FROM public.customer_actions
    WHERE id = p_action AND kind IN ('CASE_ACCESS','COMMUNICATION_ACCESS') AND status = 'OPEN'
    FOR UPDATE;
  IF a.id IS NULL THEN RETURN false; END IF;
  UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id RETURNING * INTO a;
  details := coalesce(p_details, '{}'::jsonb) || jsonb_build_object('reason', left(reason, 200), 'kind', a.kind);
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'SYSTEM', NULL, 'ACTION_REVOKED', details);
  DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
  DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.revoke_case_access_on_case_status_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions; reason text; source text;
BEGIN
  IF NEW.status = 'CANCELLED' THEN
    source := 'CASE_CANCELLED';
    reason := 'The case was cancelled.';
  ELSE
    source := 'CASE_CLOSED';
    reason := 'The case was closed.';
  END IF;
  FOR a IN
    SELECT * FROM public.customer_actions
    WHERE case_id = NEW.id AND kind IN ('CASE_ACCESS','COMMUNICATION_ACCESS') AND status = 'OPEN'
    FOR UPDATE
  LOOP
    PERFORM admin_private.revoke_case_access_action_v1(a.id, reason, jsonb_build_object('source', source));
  END LOOP;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_case_access_action_v1(p_token_hash text)
RETURNS public.customer_actions
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.id IS NULL OR a.kind NOT IN ('CASE_ACCESS','COMMUNICATION_ACCESS') OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN NULL; END IF;
  RETURN a;
END; $$;

ALTER TABLE admin_private.job_outbox DROP CONSTRAINT job_outbox_topic_check;
ALTER TABLE admin_private.job_outbox ADD CONSTRAINT job_outbox_topic_check
  CHECK (topic IN ('SYSTEM_HEALTH_PROBE', 'SEND_EMAIL'));
ALTER TABLE admin_private.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE admin_private.jobs ADD CONSTRAINT jobs_type_check
  CHECK (job_type IN ('SYSTEM_HEALTH_PROBE', 'SEND_EMAIL'));

CREATE OR REPLACE FUNCTION admin_private.enqueue_outbox_v1(
  p_event_key text, p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_available_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE created admin_private.job_outbox;
BEGIN
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 8 AND 200
    OR p_topic IS NULL OR p_topic NOT IN ('SYSTEM_HEALTH_PROBE', 'SEND_EMAIL')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid outbox event'; END IF;
  INSERT INTO admin_private.job_outbox(event_key, topic, aggregate_type, aggregate_id, payload, available_at)
  VALUES (btrim(p_event_key), p_topic, nullif(btrim(coalesce(p_aggregate_type, '')), ''), p_aggregate_id, p_payload, coalesce(p_available_at, now()))
  RETURNING * INTO created;
  RETURN created.id;
END; $$;

ALTER TABLE public.communications
  ADD COLUMN lifecycle text,
  ADD COLUMN delivery_status text,
  ADD COLUMN template_key text,
  ADD COLUMN template_version integer,
  ADD COLUMN body_text text,
  ADD COLUMN body_html text,
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  ADD COLUMN evidence_request_id uuid REFERENCES public.evidence_requests(id) ON DELETE RESTRICT,
  ADD COLUMN customer_action_id uuid REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  ADD COLUMN author_id uuid,
  ADD COLUMN reviewer_id uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN queued_at timestamptz,
  ADD COLUMN first_provider_attempt_at timestamptz,
  ADD COLUMN sender_address text,
  ADD COLUMN link_key_version integer,
  ADD COLUMN delivery_occurred_at timestamptz,
  ADD COLUMN provider_accepted_at timestamptz,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN record_version integer NOT NULL DEFAULT 1,
  ADD COLUMN content_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN superseded_by uuid REFERENCES public.communications(id) ON DELETE RESTRICT,
  ADD CONSTRAINT communications_lifecycle_check CHECK (
    lifecycle IS NULL OR lifecycle IN ('DRAFT', 'REVIEWED', 'QUEUED', 'CANCELLED')
  ),
  ADD CONSTRAINT communications_delivery_check CHECK (
    delivery_status IS NULL OR delivery_status IN (
      'NONE', 'ACCEPTANCE_UNKNOWN', 'PROVIDER_ACCEPTED', 'DELIVERED',
      'BOUNCED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE', 'COMPLAINED', 'SUPPRESSED', 'FAILED'
    )
  ),
  ADD CONSTRAINT communications_template_check CHECK (
    (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
    OR (lifecycle IS NOT NULL AND template_key IN ('EVIDENCE_REQUEST', 'CASE_UPDATE') AND template_version >= 1)
  ),
  ADD CONSTRAINT communications_content_version_check CHECK (content_version >= 1 AND record_version >= 1),
  ADD CONSTRAINT communications_sender_address_check CHECK (
    sender_address IS NULL
    OR (length(sender_address) BETWEEN 3 AND 254 AND sender_address ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
  ),
  ADD CONSTRAINT communications_link_key_version_check CHECK (link_key_version IS NULL OR link_key_version >= 1);

CREATE INDEX communications_lifecycle_idx ON public.communications (lifecycle, updated_at DESC, id DESC)
  WHERE lifecycle IS NOT NULL;
CREATE INDEX communications_delivery_idx ON public.communications (delivery_status, updated_at DESC, id DESC)
  WHERE delivery_status IS NOT NULL;
CREATE UNIQUE INDEX communications_provider_message_uidx
  ON public.communications (provider, provider_message_id)
  WHERE lifecycle IS NOT NULL AND provider_message_id IS NOT NULL;

CREATE FUNCTION admin_private.protect_communication_snapshot_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.lifecycle IS NULL THEN RETURN NEW; END IF;
  IF OLD.content_locked IS TRUE AND NEW.content_locked IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Reviewed communication snapshot is immutable';
  END IF;
  IF OLD.content_locked IS TRUE THEN
    IF NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
      OR NEW.customer_action_id IS DISTINCT FROM OLD.customer_action_id
      OR NEW.communication_type IS DISTINCT FROM OLD.communication_type
      OR NEW.direction IS DISTINCT FROM OLD.direction
      OR NEW.recipient IS DISTINCT FROM OLD.recipient
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.body_text IS DISTINCT FROM OLD.body_text
      OR NEW.body_html IS DISTINCT FROM OLD.body_html
      OR NEW.template_key IS DISTINCT FROM OLD.template_key
      OR NEW.template_version IS DISTINCT FROM OLD.template_version
      OR NEW.content_version IS DISTINCT FROM OLD.content_version
      OR NEW.sender_address IS DISTINCT FROM OLD.sender_address
      OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
      OR NEW.author_id IS DISTINCT FROM OLD.author_id
    THEN RAISE EXCEPTION 'Reviewed communication snapshot is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER communications_protect_snapshot
  BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_communication_snapshot_v1();
REVOKE ALL ON FUNCTION admin_private.protect_communication_snapshot_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  subject_template text NOT NULL,
  body_text_template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_templates_key_check CHECK (template_key IN ('EVIDENCE_REQUEST', 'CASE_UPDATE')),
  CONSTRAINT communication_templates_version_check CHECK (version >= 1),
  CONSTRAINT communication_templates_text_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
    AND length(btrim(subject_template)) BETWEEN 1 AND 200
    AND length(btrim(body_text_template)) BETWEEN 20 AND 5000
  ),
  UNIQUE (template_key, version)
);
ALTER TABLE admin_private.communication_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.communication_templates FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO admin_private.communication_templates(template_key, version, name, subject_template, body_text_template)
VALUES
  (
    'EVIDENCE_REQUEST', 1, 'Evidence request',
    'Evidence needed for {case_ref}',
    'To continue with {case_ref}, we need {specific_document}. Please upload it securely using the link below. If you’re unsure what to send, reply and we’ll help.'
    || E'\n\n' || '{upload_url}'
  ),
  (
    'CASE_UPDATE', 1, 'Case update',
    'Update on {case_ref}',
    '{fact} {effect} {next_step}'
  );

CREATE TABLE admin_private.communication_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id uuid NOT NULL REFERENCES public.communications(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  provider text,
  provider_event_id text,
  provider_message_id text,
  summary text NOT NULL,
  CONSTRAINT communication_delivery_events_type_check CHECK (event_type IN (
    'QUEUED', 'PROVIDER_ACCEPTED', 'PROVIDER_ACCEPTANCE_UNKNOWN', 'DELIVERED',
    'BOUNCED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE', 'COMPLAINED', 'SUPPRESSED',
    'PROVIDER_REJECTED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE'
  )),
  CONSTRAINT communication_delivery_events_summary_check CHECK (length(btrim(summary)) BETWEEN 1 AND 500)
);
CREATE INDEX communication_delivery_events_comm_idx
  ON admin_private.communication_delivery_events (communication_id, occurred_at DESC, id DESC);
ALTER TABLE admin_private.communication_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.communication_delivery_events FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.communication_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'resend',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_message_id text,
  communication_id uuid REFERENCES public.communications(id) ON DELETE RESTRICT,
  applied boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  provider_occurred_at timestamptz,
  bounce_class text,
  CONSTRAINT communication_webhook_events_provider_check CHECK (provider IN ('resend')),
  CONSTRAINT communication_webhook_events_bounce_class_check CHECK (
    bounce_class IS NULL OR bounce_class IN ('permanent', 'transient', 'undetermined')
  ),
  CONSTRAINT communication_webhook_events_id_check CHECK (length(btrim(provider_event_id)) BETWEEN 8 AND 200),
  CONSTRAINT communication_webhook_events_type_check CHECK (length(btrim(event_type)) BETWEEN 1 AND 80),
  UNIQUE (provider, provider_event_id)
);
ALTER TABLE admin_private.communication_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.communication_webhook_events FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.email_suppressions (
  address_normalized text PRIMARY KEY,
  reason text NOT NULL,
  communication_id uuid REFERENCES public.communications(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_suppressions_reason_check CHECK (reason IN ('BOUNCED', 'COMPLAINED', 'SUPPRESSED')),
  CONSTRAINT email_suppressions_address_check CHECK (length(btrim(address_normalized)) BETWEEN 3 AND 254)
);
ALTER TABLE admin_private.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.email_suppressions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.communication_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.communication_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.communication_command_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.communication_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.communication_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.communication_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.communication_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.normalize_email_v1(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT lower(btrim(coalesce(p_email, '')));
$$;
REVOKE ALL ON FUNCTION admin_private.normalize_email_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.escape_html_v1(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;
REVOKE ALL ON FUNCTION admin_private.escape_html_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.render_template_v1(p_template text, p_values jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE rendered text; k text; v text;
BEGIN
  IF p_template IS NULL OR p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN RETURN NULL; END IF;
  rendered := p_template;
  FOR k, v IN SELECT key, value FROM jsonb_each_text(p_values)
  LOOP
    IF k !~ '^[a-z_]+$' OR v IS NULL OR btrim(v) = '' OR v ~ '\{[a-z_]+\}' THEN RETURN NULL; END IF;
    rendered := replace(rendered, '{' || k || '}', v);
  END LOOP;
  IF rendered ~ '\{[a-z_]+\}' THEN RETURN NULL; END IF;
  RETURN rendered;
END; $$;
REVOKE ALL ON FUNCTION admin_private.render_template_v1(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.append_delivery_event_v1(
  p_communication uuid, p_type text, p_summary text, p_provider text DEFAULT NULL,
  p_provider_event text DEFAULT NULL, p_provider_message text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO admin_private.communication_delivery_events(
    communication_id, event_type, occurred_at, summary, provider, provider_event_id, provider_message_id
  ) VALUES (
    p_communication, p_type, coalesce(p_occurred_at, now()), left(btrim(p_summary), 500),
    nullif(btrim(coalesce(p_provider, '')), ''),
    nullif(btrim(coalesce(p_provider_event, '')), ''), nullif(btrim(coalesce(p_provider_message, '')), '')
  );
END; $$;
REVOKE ALL ON FUNCTION admin_private.append_delivery_event_v1(uuid, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.suppress_email_v1(p_address text, p_reason text, p_communication uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE addr text;
BEGIN
  addr := admin_private.normalize_email_v1(p_address);
  IF addr = '' THEN RETURN; END IF;
  INSERT INTO admin_private.email_suppressions(address_normalized, reason, communication_id)
  VALUES (addr, p_reason, p_communication)
  ON CONFLICT (address_normalized) DO UPDATE SET reason = EXCLUDED.reason, communication_id = EXCLUDED.communication_id;
END; $$;
REVOKE ALL ON FUNCTION admin_private.suppress_email_v1(text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.communication_load_send_v1(p_communication uuid, p_content_version integer)
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
  IF row.template_key = 'EVIDENCE_REQUEST' THEN
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
    'linkKeyVersion', row.link_key_version,
    'firstProviderAttemptAt', row.first_provider_attempt_at,
    'suppressed', EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(row.recipient)
    )
  );
END; $$;

CREATE FUNCTION public.communication_begin_provider_attempt_v1(
  p_communication uuid, p_content_version integer, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.communications; started timestamptz; permitted boolean;
BEGIN
  IF p_communication IS NULL OR p_content_version IS NULL OR p_content_version < 1 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle <> 'QUEUED' OR row.content_locked IS NOT TRUE
    OR row.content_version <> p_content_version
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_idempotency_key IS NULL
    OR p_idempotency_key <> ('send-email:' || row.id::text || ':v' || row.content_version::text)
  THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF row.delivery_status IN ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED')
    OR EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(row.recipient)
    )
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF row.delivery_status IN ('PROVIDER_ACCEPTED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE') THEN
    RETURN jsonb_build_object(
      'status', 'success',
      'firstProviderAttemptAt', row.first_provider_attempt_at,
      'providerCallPermitted', false
    );
  END IF;
  UPDATE public.communications
    SET first_provider_attempt_at = coalesce(first_provider_attempt_at, now()),
        updated_at = now()
    WHERE id = row.id
    RETURNING first_provider_attempt_at INTO started;
  permitted := started IS NOT NULL AND started > now() - interval '23 hours';
  RETURN jsonb_build_object(
    'status', 'success',
    'firstProviderAttemptAt', started,
    'providerCallPermitted', permitted
  );
END; $$;

CREATE FUNCTION admin_private.communication_apply_matched_event_v1(
  p_communication uuid, p_event_name text, p_provider text, p_event_id text, p_message text, p_occurred_at timestamptz,
  p_bounce_class text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row public.communications; next_status text; summary text; bounce_class text; permanent_failure boolean;
BEGIN
  IF p_occurred_at IS NULL THEN RETURN false; END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL THEN RETURN false; END IF;
  bounce_class := lower(btrim(coalesce(p_bounce_class, '')));
  next_status := CASE p_event_name
    WHEN 'email.delivered' THEN 'DELIVERED'
    WHEN 'email.complained' THEN 'COMPLAINED'
    WHEN 'email.suppressed' THEN 'SUPPRESSED'
    WHEN 'email.bounced' THEN CASE bounce_class
      WHEN 'permanent' THEN 'BOUNCED'
      WHEN 'transient' THEN 'TRANSIENT_BOUNCE'
      ELSE 'UNDETERMINED_BOUNCE'
    END
    ELSE NULL
  END;
  IF next_status IS NULL THEN RETURN false; END IF;
  IF row.delivery_occurred_at IS NOT NULL AND p_occurred_at < row.delivery_occurred_at
    AND row.delivery_status IN ('DELIVERED', 'BOUNCED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE', 'COMPLAINED', 'SUPPRESSED', 'FAILED')
  THEN RETURN false; END IF;
  IF next_status = 'DELIVERED' AND row.delivery_status IN ('BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED') THEN
    RETURN false;
  END IF;
  IF next_status = 'DELIVERED' AND row.delivery_status = 'DELIVERED' THEN
    RETURN true;
  END IF;
  IF p_event_name = 'email.delivered' THEN
    UPDATE public.communications
      SET delivery_status = 'DELIVERED', delivered_at = coalesce(delivered_at, p_occurred_at),
          delivery_occurred_at = p_occurred_at, error_message = NULL, status = 'SENT',
          updated_at = now(), record_version = record_version + 1
      WHERE id = row.id AND delivery_status IS DISTINCT FROM 'DELIVERED';
    IF FOUND THEN
      PERFORM admin_private.append_delivery_event_v1(row.id, 'DELIVERED', 'Provider reported delivery', p_provider, p_event_id, p_message, p_occurred_at);
    END IF;
    RETURN true;
  END IF;
  summary := CASE next_status
    WHEN 'BOUNCED' THEN 'Recipient address permanently bounced'
    WHEN 'TRANSIENT_BOUNCE' THEN 'Recipient address bounced temporarily'
    WHEN 'UNDETERMINED_BOUNCE' THEN 'Recipient address bounce classification is unknown'
    WHEN 'COMPLAINED' THEN 'Recipient marked the message as spam'
    ELSE 'Recipient is suppressed'
  END;
  permanent_failure := next_status IN ('BOUNCED', 'COMPLAINED', 'SUPPRESSED');
  UPDATE public.communications
    SET delivery_status = next_status,
        status = CASE WHEN permanent_failure THEN 'FAILED' ELSE status END,
        failed_at = CASE WHEN permanent_failure THEN coalesce(failed_at, p_occurred_at) ELSE failed_at END,
        delivery_occurred_at = p_occurred_at,
        error_message = summary,
        updated_at = now(),
        record_version = record_version + 1
    WHERE id = row.id;
  PERFORM admin_private.append_delivery_event_v1(row.id, next_status, 'Provider reported ' || lower(next_status), p_provider, p_event_id, p_message, p_occurred_at);
  IF permanent_failure THEN
    PERFORM admin_private.suppress_email_v1(row.recipient, next_status, row.id);
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION admin_private.communication_apply_matched_event_v1(uuid, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.communication_reconcile_webhooks_v1(
  p_communication uuid, p_provider text, p_message text
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ev admin_private.communication_webhook_events; applied_now boolean;
BEGIN
  IF p_communication IS NULL OR p_message IS NULL OR p_message = '' THEN RETURN; END IF;
  FOR ev IN
    SELECT * FROM admin_private.communication_webhook_events
    WHERE communication_webhook_events.provider = p_provider
      AND communication_webhook_events.provider_message_id = p_message
      AND communication_webhook_events.applied = false
    ORDER BY communication_webhook_events.provider_occurred_at ASC NULLS LAST,
      communication_webhook_events.received_at ASC, communication_webhook_events.id ASC
  LOOP
    applied_now := admin_private.communication_apply_matched_event_v1(
      p_communication, ev.event_type, ev.provider, ev.provider_event_id, ev.provider_message_id, ev.provider_occurred_at, ev.bounce_class
    );
    UPDATE admin_private.communication_webhook_events
      SET communication_id = p_communication, applied = applied_now OR applied
      WHERE id = ev.id;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION admin_private.communication_reconcile_webhooks_v1(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.communication_mark_provider_accepted_v1(
  p_communication uuid, p_provider text, p_provider_message_id text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.communications; provider_name text; message text; ev admin_private.communication_webhook_events;
BEGIN
  IF p_communication IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  provider_name := left(btrim(coalesce(p_provider, 'resend')), 40);
  message := left(btrim(coalesce(p_provider_message_id, '')), 200);
  IF message = '' OR p_idempotency_key IS NULL
    OR p_idempotency_key <> ('send-email:' || p_communication::text || ':v' || (
      SELECT content_version FROM public.communications WHERE id = p_communication
    )::text)
  THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle <> 'QUEUED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF row.delivery_status IN ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED') THEN
    IF row.provider_message_id IS NULL THEN
      UPDATE public.communications SET provider = provider_name, provider_message_id = message, updated_at = now()
        WHERE id = row.id AND provider_message_id IS NULL;
    END IF;
    PERFORM admin_private.communication_reconcile_webhooks_v1(row.id, provider_name, message);
    RETURN jsonb_build_object('status', 'success', 'deliveryStatus', row.delivery_status, 'replay', true);
  END IF;
  IF row.delivery_status = 'PROVIDER_ACCEPTED' THEN
    PERFORM admin_private.communication_reconcile_webhooks_v1(row.id, provider_name, coalesce(row.provider_message_id, message));
    RETURN jsonb_build_object('status', 'success', 'deliveryStatus', 'PROVIDER_ACCEPTED', 'replay', true);
  END IF;
  UPDATE public.communications
    SET status = 'SENT',
        delivery_status = 'PROVIDER_ACCEPTED',
        provider = provider_name,
        provider_message_id = message,
        provider_accepted_at = now(),
        first_provider_attempt_at = coalesce(first_provider_attempt_at, now()),
        delivery_occurred_at = coalesce(delivery_occurred_at, now()),
        sent_at = coalesce(sent_at, now()),
        error_message = NULL,
        updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id;
  PERFORM admin_private.append_delivery_event_v1(row.id, 'PROVIDER_ACCEPTED', 'Email provider accepted the message', provider_name, NULL, message, now());
  PERFORM admin_private.communication_reconcile_webhooks_v1(row.id, provider_name, message);
  SELECT * INTO row FROM public.communications WHERE id = row.id;
  RETURN jsonb_build_object('status', 'success', 'deliveryStatus', row.delivery_status, 'replay', false);
END; $$;

CREATE FUNCTION public.communication_mark_acceptance_unknown_v1(
  p_communication uuid, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.communications;
BEGIN
  IF p_communication IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle <> 'QUEUED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key <> ('send-email:' || row.id::text || ':v' || row.content_version::text)
  THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF row.delivery_status IN ('PROVIDER_ACCEPTED', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED') THEN
    RETURN jsonb_build_object('status', 'success', 'deliveryStatus', row.delivery_status);
  END IF;
  UPDATE public.communications
    SET delivery_status = 'ACCEPTANCE_UNKNOWN',
        first_provider_attempt_at = coalesce(first_provider_attempt_at, now()),
        error_message = 'Provider acceptance is unknown. Check the email provider before sending again.',
        updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND coalesce(delivery_status, 'NONE') IN ('NONE', 'ACCEPTANCE_UNKNOWN', 'FAILED');
  PERFORM admin_private.append_delivery_event_v1(
    row.id, 'PROVIDER_ACCEPTANCE_UNKNOWN',
    'Provider acceptance is unknown. The same idempotency key may be retried only inside the safety window.',
    'resend', NULL, NULL, now()
  );
  RETURN jsonb_build_object('status', 'success', 'deliveryStatus', 'ACCEPTANCE_UNKNOWN');
END; $$;

CREATE FUNCTION public.communication_mark_provider_rejected_v1(
  p_communication uuid, p_error text, p_retryable boolean, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.communications; summary text;
BEGIN
  IF p_communication IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle <> 'QUEUED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key <> ('send-email:' || row.id::text || ':v' || row.content_version::text)
  THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF row.delivery_status IN ('PROVIDER_ACCEPTED', 'DELIVERED') THEN
    RETURN jsonb_build_object('status', 'success', 'deliveryStatus', row.delivery_status);
  END IF;
  summary := left(btrim(coalesce(p_error, 'Provider rejected the message')), 500);
  IF coalesce(p_retryable, false) THEN
    PERFORM admin_private.append_delivery_event_v1(row.id, 'RETRYABLE_FAILURE', summary, 'resend', NULL, NULL);
    RETURN jsonb_build_object('status', 'success', 'deliveryStatus', coalesce(row.delivery_status, 'NONE'));
  END IF;
  UPDATE public.communications
    SET status = 'FAILED',
        delivery_status = 'FAILED',
        error_message = summary,
        failed_at = now(),
        updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id;
  PERFORM admin_private.append_delivery_event_v1(row.id, 'PROVIDER_REJECTED', summary, 'resend', NULL, NULL);
  PERFORM admin_private.append_delivery_event_v1(row.id, 'PERMANENT_FAILURE', summary, 'resend', NULL, NULL);
  RETURN jsonb_build_object('status', 'success', 'deliveryStatus', 'FAILED');
END; $$;

CREATE FUNCTION public.communication_apply_provider_event_v1(
  p_provider text, p_provider_event_id text, p_event_type text, p_provider_message_id text,
  p_occurred_at timestamptz DEFAULT NULL, p_bounce_class text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing admin_private.communication_webhook_events; row public.communications;
  provider_name text; event_id text; event_name text; message text; bounce_class text; apply boolean := false;
BEGIN
  provider_name := lower(btrim(coalesce(p_provider, '')));
  event_id := btrim(coalesce(p_provider_event_id, ''));
  event_name := btrim(coalesce(p_event_type, ''));
  message := nullif(left(btrim(coalesce(p_provider_message_id, '')), 200), '');
  bounce_class := lower(btrim(coalesce(p_bounce_class, '')));
  IF bounce_class = '' THEN bounce_class := NULL; END IF;
  IF bounce_class IS NOT NULL AND bounce_class NOT IN ('permanent', 'transient', 'undetermined') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF event_name = 'email.bounced' AND bounce_class IS NULL THEN bounce_class := 'undetermined'; END IF;
  IF event_name <> 'email.bounced' THEN bounce_class := NULL; END IF;
  IF provider_name <> 'resend' OR length(event_id) NOT BETWEEN 8 AND 200 OR length(event_name) NOT BETWEEN 1 AND 80
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO existing FROM admin_private.communication_webhook_events
    WHERE communication_webhook_events.provider = provider_name AND communication_webhook_events.provider_event_id = event_id;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'duplicate', true, 'applied', existing.applied);
  END IF;
  IF message IS NOT NULL THEN
    SELECT * INTO row FROM public.communications
      WHERE provider = provider_name AND provider_message_id = message AND lifecycle IS NOT NULL
      FOR UPDATE;
  END IF;
  apply := row.id IS NOT NULL AND p_occurred_at IS NOT NULL
    AND admin_private.communication_apply_matched_event_v1(row.id, event_name, provider_name, event_id, message, p_occurred_at, bounce_class);
  INSERT INTO admin_private.communication_webhook_events(
    provider, provider_event_id, event_type, provider_message_id, communication_id, applied, provider_occurred_at, bounce_class
  ) VALUES (provider_name, event_id, event_name, message, row.id, apply, p_occurred_at, bounce_class);
  RETURN jsonb_build_object('status', 'success', 'duplicate', false, 'applied', apply);
END; $$;

CREATE FUNCTION public.admin_communication_list_v1(p_token text, p_case uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb; templates jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'caseId', c.case_id,
    'caseReference', cs.public_ref,
    'communicationType', c.communication_type,
    'templateKey', c.template_key,
    'templateVersion', c.template_version,
    'lifecycle', c.lifecycle,
    'deliveryStatus', c.delivery_status,
    'legacyStatus', CASE WHEN c.lifecycle IS NULL THEN c.status ELSE NULL END,
    'recipient', c.recipient,
    'subject', c.subject,
    'bodyText', c.body_text,
    'provider', c.provider,
    'providerMessageId', c.provider_message_id,
    'lastError', c.error_message,
    'contentLocked', c.content_locked,
    'contentVersion', c.content_version,
    'version', c.record_version,
    'draftedAt', c.created_at,
    'reviewedAt', c.reviewed_at,
    'queuedAt', c.queued_at,
    'firstProviderAttemptAt', c.first_provider_attempt_at,
    'providerAcceptedAt', c.provider_accepted_at,
    'deliveredAt', c.delivered_at,
    'failedAt', c.failed_at,
    'cancelledAt', c.cancelled_at,
    'supersededBy', c.superseded_by,
    'events', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'eventType', e.event_type,
        'occurredAt', e.occurred_at,
        'summary', e.summary,
        'providerMessageId', e.provider_message_id
      ) ORDER BY e.occurred_at DESC, e.id DESC), '[]')
      FROM (
        SELECT * FROM admin_private.communication_delivery_events de
        WHERE de.communication_id = c.id
        ORDER BY de.occurred_at DESC, de.id DESC
        LIMIT 8
      ) e
    )
  ) ORDER BY c.updated_at DESC, c.id DESC), '[]') INTO items
  FROM (
    SELECT * FROM public.communications
    WHERE (p_case IS NULL OR case_id = p_case)
    ORDER BY updated_at DESC, id DESC
    LIMIT 50
  ) c
  LEFT JOIN public.cases cs ON cs.id = c.case_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'templateKey', t.template_key, 'version', t.version, 'name', t.name
  ) ORDER BY t.template_key, t.version), '[]') INTO templates
  FROM admin_private.communication_templates t;
  RETURN jsonb_build_object('communications', items, 'templates', templates);
END; $$;

CREATE FUNCTION public.admin_communication_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; op text; fp text; cached jsonb; result jsonb;
  row public.communications; tpl admin_private.communication_templates;
  cs public.cases; req public.evidence_requests; action public.customer_actions;
  verified text; values jsonb; subject text; body text; html text;
  origin text; upload text; target_case uuid; comm uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  op := btrim(coalesce(p_operation, ''));
  IF op NOT IN ('draft', 'review', 'queue', 'cancel', 'resend_draft') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fp := md5(jsonb_build_array(op, p_payload, p_version)::text);
  cached := admin_private.communication_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  IF op = 'draft' OR op = 'resend_draft' THEN
    target_case := NULLIF(p_payload->>'caseId', '')::uuid;
    IF target_case IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = target_case FOR UPDATE;
    IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT verified_value INTO verified
      FROM public.customer_contact_verifications
      WHERE customer_id = cs.customer_id AND channel = 'email';
    IF verified IS NULL OR admin_private.normalize_email_v1(verified) NOT LIKE '%_@_%.%' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF op = 'resend_draft' THEN
      comm := NULLIF(p_payload->>'communicationId', '')::uuid;
      SELECT * INTO row FROM public.communications WHERE id = comm FOR UPDATE;
      IF row.id IS NULL OR row.case_id <> cs.id OR row.lifecycle IS NULL THEN
        RETURN jsonb_build_object('status', 'unavailable');
      END IF;
      IF row.delivery_status NOT IN ('BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED') THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      IF admin_private.normalize_email_v1(verified) = admin_private.normalize_email_v1(row.recipient) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      p_payload := jsonb_build_object(
        'templateKey', row.template_key,
        'caseId', cs.id,
        'evidenceRequestId', row.evidence_request_id,
        'customerOrigin', p_payload->>'customerOrigin',
        'actionId', p_payload->>'actionId',
        'secretHash', p_payload->>'secretHash',
        'linkKeyVersion', coalesce((p_payload->>'linkKeyVersion')::integer, row.link_key_version),
        'fact', p_payload->>'fact',
        'effect', p_payload->>'effect',
        'nextStep', p_payload->>'nextStep'
      );
    END IF;
    SELECT * INTO tpl FROM admin_private.communication_templates
      WHERE template_key = btrim(coalesce(p_payload->>'templateKey', ''))
      ORDER BY version DESC LIMIT 1;
    IF tpl.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(verified)
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    values := jsonb_build_object('case_ref', cs.public_ref);
    IF tpl.template_key = 'EVIDENCE_REQUEST' THEN
      SELECT * INTO req FROM public.evidence_requests
        WHERE id = NULLIF(p_payload->>'evidenceRequestId', '')::uuid AND case_id = cs.id;
      IF req.id IS NULL OR req.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      origin := btrim(coalesce(p_payload->>'customerOrigin', ''));
      IF origin !~ '^https://[A-Za-z0-9.-]+$'
        OR NULLIF(p_payload->>'actionId', '')::uuid IS NULL
        OR coalesce(p_payload->>'secretHash', '') !~ '^[a-f0-9]{64}$'
        OR coalesce((p_payload->>'linkKeyVersion')::integer, 0) < 1
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      IF req.case_id IS DISTINCT FROM cs.id
        OR cs.status IN ('CLOSED', 'CANCELLED')
        OR req.status <> 'OPEN'
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      SELECT * INTO action FROM public.customer_actions
        WHERE kind = 'COMMUNICATION_ACCESS' AND status = 'OPEN' AND evidence_request_id = req.id
        FOR UPDATE;
      IF action.id IS NOT NULL THEN
        IF action.expires_at > now() THEN RETURN jsonb_build_object('status', 'denied'); END IF;
        IF NOT admin_private.revoke_case_access_action_v1(
          action.id,
          'The previous communication-access capability expired.',
          jsonb_build_object('source', 'ACTION_EXPIRED')
        ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      END IF;
      BEGIN
        INSERT INTO public.customer_actions(
          id, customer_id, business_id, location_id, case_id, evidence_request_id, link_key_version,
          kind, secret_hash, expected_email_snapshot, expires_at, created_by
        ) VALUES (
          (p_payload->>'actionId')::uuid, cs.customer_id, cs.business_id, cs.location_id, cs.id, req.id,
          (p_payload->>'linkKeyVersion')::integer,
          'COMMUNICATION_ACCESS', p_payload->>'secretHash', admin_private.normalize_email_v1(verified),
          now() + interval '14 days', actor
        ) RETURNING * INTO action;
      EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'denied');
      END;
      upload := origin || '/action/' || action.id::text;
      IF position('#t=' in upload) > 0 THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      values := values || jsonb_build_object('specific_document', req.title, 'upload_url', upload);
    ELSE
      IF length(btrim(coalesce(p_payload->>'fact', ''))) NOT BETWEEN 10 AND 400
        OR length(btrim(coalesce(p_payload->>'effect', ''))) NOT BETWEEN 10 AND 400
        OR length(btrim(coalesce(p_payload->>'nextStep', ''))) NOT BETWEEN 10 AND 400
        OR coalesce(p_payload->>'fact', '') ~* '<[^>]+>'
        OR coalesce(p_payload->>'effect', '') ~* '<[^>]+>'
        OR coalesce(p_payload->>'nextStep', '') ~* '<[^>]+>'
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      values := values || jsonb_build_object(
        'fact', btrim(p_payload->>'fact'),
        'effect', btrim(p_payload->>'effect'),
        'next_step', btrim(p_payload->>'nextStep')
      );
    END IF;
    subject := admin_private.render_template_v1(tpl.subject_template, values);
    body := admin_private.render_template_v1(tpl.body_text_template, values);
    IF subject IS NULL OR body IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    html := '<p>' || replace(admin_private.escape_html_v1(body), E'\n', '<br />') || '</p>';
    INSERT INTO public.communications(
      case_id, customer_id, business_id, evidence_request_id, customer_action_id,
      communication_type, direction, recipient, subject, body_text, body_html,
      status, lifecycle, delivery_status, template_key, template_version,
      author_id, content_version, record_version, content_locked, link_key_version
    ) VALUES (
      cs.id, cs.customer_id, cs.business_id, req.id, action.id,
      tpl.template_key, 'OUTBOUND', admin_private.normalize_email_v1(verified), subject, body, html,
      'PENDING', 'DRAFT', 'NONE', tpl.template_key, tpl.version,
      actor, 1, 1, false, action.link_key_version
    ) RETURNING * INTO row;
    IF op = 'resend_draft' THEN
      UPDATE public.communications SET superseded_by = row.id, updated_at = now(), record_version = record_version + 1
        WHERE id = comm;
    END IF;
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'DRAFT');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
      CASE WHEN op = 'resend_draft' THEN 'Drafted a replacement communication after delivery failure' ELSE 'Communication drafted' END,
      jsonb_build_object('operation', op, 'templateKey', tpl.template_key, 'caseId', cs.id)
    );
    INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  comm := NULLIF(p_payload->>'communicationId', '')::uuid;
  IF comm IS NULL OR p_version IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO row FROM public.communications WHERE id = comm FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.record_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  IF op = 'review' THEN
    IF row.lifecycle <> 'DRAFT' OR row.content_locked THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF btrim(coalesce(p_payload->>'fromAddress', '')) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
      OR length(btrim(p_payload->>'fromAddress')) > 254
    THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.communications
      SET lifecycle = 'REVIEWED', reviewer_id = actor, reviewed_at = now(), content_locked = true,
          sender_address = lower(btrim(p_payload->>'fromAddress')),
          updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND lifecycle = 'DRAFT' AND record_version = p_version
      RETURNING * INTO row;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'REVIEWED');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
      'Communication reviewed', jsonb_build_object('operation', 'review')
    );
    INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'cancel' THEN
    IF row.lifecycle NOT IN ('DRAFT', 'REVIEWED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.communications
      SET lifecycle = 'CANCELLED', cancelled_at = now(), updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND record_version = p_version RETURNING * INTO row;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'CANCELLED');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
      'Communication cancelled', jsonb_build_object('operation', 'cancel')
    );
    INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'queue' AND coalesce((p_payload->>'sendEnabled')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF row.lifecycle <> 'REVIEWED' OR row.content_locked IS NOT TRUE THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF coalesce(p_payload->>'recipient', row.recipient) IS DISTINCT FROM row.recipient
    OR coalesce(p_payload->>'subject', row.subject) IS DISTINCT FROM row.subject
    OR coalesce(p_payload->>'bodyText', row.body_text) IS DISTINCT FROM row.body_text
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions s
    WHERE s.address_normalized = admin_private.normalize_email_v1(row.recipient)
  ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF btrim(coalesce(row.sender_address, '')) = '' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF row.template_key = 'EVIDENCE_REQUEST' THEN
    SELECT * INTO action FROM public.customer_actions
      WHERE id = row.customer_action_id AND kind = 'COMMUNICATION_ACCESS' AND status = 'OPEN' AND expires_at > now()
        AND evidence_request_id IS NOT DISTINCT FROM row.evidence_request_id;
    SELECT * INTO req FROM public.evidence_requests WHERE id = row.evidence_request_id AND status = 'OPEN' AND case_id = row.case_id;
    IF action.id IS NULL OR req.id IS NULL OR action.evidence_request_id IS DISTINCT FROM req.id THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  END IF;
  UPDATE public.communications
    SET lifecycle = 'QUEUED', queued_at = now(), updated_at = now(), record_version = row.record_version + 1
    WHERE id = row.id AND lifecycle = 'REVIEWED' AND record_version = p_version
    RETURNING * INTO row;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  PERFORM admin_private.enqueue_outbox_v1(
    'send-email:' || row.id::text || ':v' || row.content_version::text,
    'SEND_EMAIL',
    'communication',
    row.id,
    jsonb_build_object('communicationId', row.id, 'contentVersion', row.content_version),
    now()
  );
  PERFORM admin_private.append_delivery_event_v1(row.id, 'QUEUED', 'Queued for the durable email worker');
  result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'QUEUED');
  PERFORM admin_private.write_record_audit_v1(
    actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
    'Communication queued', jsonb_build_object('operation', 'queue', 'jobType', 'SEND_EMAIL')
  );
  INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_job_health_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hb admin_private.job_worker_heartbeats; counts jsonb; jobs jsonb; health text; expected integer; late integer;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO hb FROM admin_private.job_worker_heartbeats ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1;
  expected := coalesce(hb.expected_interval_seconds, 86400);
  late := coalesce(hb.late_after_seconds, 93600);
  IF hb.id IS NULL THEN health := 'NEVER_RUN';
  ELSIF coalesce(hb.last_started_at, hb.updated_at) >= now() - make_interval(secs => late) THEN health := 'HEALTHY';
  ELSE health := 'LATE';
  END IF;
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'PENDING'),
    'running', count(*) FILTER (WHERE status = 'RUNNING'),
    'retry', count(*) FILTER (WHERE status = 'RETRY'),
    'succeeded', count(*) FILTER (WHERE status = 'SUCCEEDED'),
    'deadLetter', count(*) FILTER (WHERE status = 'DEAD_LETTER')
  ) INTO counts FROM admin_private.jobs;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', j.id,
    'jobType', j.job_type,
    'status', j.status,
    'scheduledAt', j.scheduled_at,
    'attempts', j.attempts,
    'maxAttempts', j.max_attempts,
    'lastError', j.last_error,
    'deadLetteredAt', j.dead_lettered_at,
    'completedAt', j.completed_at,
    'replayCount', j.replay_count,
    'version', j.record_version,
    'summary', CASE j.job_type
      WHEN 'SYSTEM_HEALTH_PROBE' THEN 'System health probe'
      WHEN 'SEND_EMAIL' THEN 'Send email'
      ELSE j.job_type END
  ) ORDER BY j.updated_at DESC, j.id DESC), '[]') INTO jobs
  FROM (
    SELECT * FROM admin_private.jobs ORDER BY updated_at DESC, id DESC LIMIT 50
  ) j;
  RETURN jsonb_build_object(
    'heartbeat', CASE WHEN hb.id IS NULL THEN jsonb_build_object(
      'status', health, 'workerName', NULL, 'environment', NULL,
      'lastStartedAt', NULL, 'lastCompletedAt', NULL, 'lastSuccessAt', NULL,
      'lastError', NULL, 'deploymentId', NULL, 'updatedAt', NULL,
      'expectedIntervalSeconds', 86400, 'lateAfterSeconds', 93600
    ) ELSE jsonb_build_object(
      'status', health,
      'workerName', hb.worker_name,
      'environment', hb.environment,
      'lastStartedAt', hb.last_started_at,
      'lastCompletedAt', hb.last_completed_at,
      'lastSuccessAt', hb.last_success_at,
      'lastError', hb.last_error,
      'deploymentId', hb.deployment_id,
      'updatedAt', hb.updated_at,
      'expectedIntervalSeconds', expected,
      'lateAfterSeconds', late
    ) END,
    'counts', counts,
    'jobs', jobs
  );
END; $$;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED'
));
CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN (
      'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
      'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
      'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED'
    ))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_action_may_use_evidence_request_v1(
  p_action public.customer_actions, p_request public.evidence_requests, p_case public.cases
) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF p_action.id IS NULL OR p_request.id IS NULL OR p_case.id IS NULL THEN RETURN false; END IF;
  IF p_request.case_id IS DISTINCT FROM p_action.case_id OR p_request.case_id IS DISTINCT FROM p_case.id THEN RETURN false; END IF;
  IF p_request.status <> 'OPEN' THEN RETURN false; END IF;
  IF p_case.customer_id IS DISTINCT FROM p_action.customer_id
    OR p_case.business_id IS DISTINCT FROM p_action.business_id
    OR p_case.location_id IS DISTINCT FROM p_action.location_id
  THEN RETURN false; END IF;
  IF p_action.kind = 'CASE_ACCESS' THEN RETURN true; END IF;
  IF p_action.kind = 'COMMUNICATION_ACCESS' THEN
    RETURN p_action.evidence_request_id IS NOT NULL AND p_action.evidence_request_id = p_request.id;
  END IF;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION admin_private.customer_action_may_use_evidence_request_v1(public.customer_actions, public.evidence_requests, public.cases)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.customer_open_evidence_requests_v1(p_case uuid, p_action uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE result jsonb; a public.customer_actions; scoped uuid;
BEGIN
  IF p_case IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF p_action IS NOT NULL THEN
    SELECT * INTO a FROM public.customer_actions WHERE id = p_action;
    IF a.kind = 'COMMUNICATION_ACCESS' THEN
      scoped := a.evidence_request_id;
      IF scoped IS NULL THEN RETURN '[]'::jsonb; END IF;
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'requestId', r.id,
    'title', r.title,
    'requestText', r.request_text,
    'dueAt', r.due_at,
    'createdAt', r.created_at,
    'submissionStatus', CASE
      WHEN uploaded.id IS NOT NULL THEN 'AWAITING_REVIEW'
      WHEN pending.id IS NOT NULL THEN 'UPLOAD_PENDING'
      ELSE 'NOT_SUBMITTED'
    END,
    'filename', CASE
      WHEN uploaded.id IS NOT NULL THEN uploaded.original_filename
      WHEN pending.id IS NOT NULL THEN pending.original_filename
      ELSE NULL
    END,
    'submittedAt', uploaded.uploaded_at
  ) ORDER BY r.created_at, r.id), '[]') INTO result
  FROM public.evidence_requests r
  LEFT JOIN LATERAL (
    SELECT cv.id, cv.original_filename, cv.uploaded_at
    FROM public.case_document_versions cv
    WHERE cv.customer_evidence_request_id = r.id
      AND cv.submission_source = 'CUSTOMER'
      AND cv.upload_status = 'UPLOADED'
    ORDER BY cv.uploaded_at, cv.id
    LIMIT 1
  ) uploaded ON true
  LEFT JOIN LATERAL (
    SELECT cv.id, cv.original_filename
    FROM public.case_document_versions cv
    WHERE cv.customer_evidence_request_id = r.id
      AND cv.submission_source = 'CUSTOMER'
      AND cv.upload_status = 'PENDING_UPLOAD'
      AND cv.customer_action_id = p_action
    ORDER BY cv.created_at, cv.id
    LIMIT 1
  ) pending ON true
  WHERE r.case_id = p_case AND r.status = 'OPEN' AND (scoped IS NULL OR r.id = scoped);
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION admin_private.customer_open_evidence_requests_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_evidence_begin_v1(
  p_token_hash text, p_request uuid, p_evidence_request uuid,
  p_filename text, p_content_type text, p_size bigint, p_bucket text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions; sess admin_private.customer_action_sessions;
  cs public.cases; req public.evidence_requests; d public.case_documents; existing public.case_document_versions;
  actor uuid; fp text; cached jsonb; result jsonb; version_id uuid; object_key text; version_no integer; abandoned uuid;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL OR sess.action_id <> a.id THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  actor := sess.auth_user_id;
  IF p_request IS NULL OR p_evidence_request IS NULL OR p_filename IS NULL OR p_content_type IS NULL OR p_size IS NULL OR p_bucket IS NULL
    OR length(p_bucket) NOT BETWEEN 3 AND 63
    OR p_size < 1 OR p_size > 10485760
    OR NOT admin_private.evidence_extension_ok_v1(p_filename, p_content_type)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_evidence_request, btrim(p_filename), p_content_type, p_size, p_bucket, 'begin')::text);
  cached := admin_private.customer_evidence_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id FOR UPDATE;
  IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO req FROM public.evidence_requests WHERE id = p_evidence_request FOR UPDATE;
  IF NOT admin_private.customer_action_may_use_evidence_request_v1(a, req, cs) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(req.id::text || ':customer-evidence', 0));
  SELECT v.* INTO existing
  FROM public.case_document_versions v
  WHERE v.customer_evidence_request_id = req.id
    AND v.submission_source = 'CUSTOMER'
    AND v.upload_status IN ('PENDING_UPLOAD', 'UPLOADED')
  ORDER BY v.created_at, v.id
  LIMIT 1
  FOR UPDATE;
  IF existing.upload_status = 'UPLOADED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF existing.upload_status = 'PENDING_UPLOAD'
    AND existing.customer_action_id = a.id
    AND existing.original_filename = btrim(p_filename)
    AND existing.declared_content_type = p_content_type
    AND existing.declared_size_bytes = p_size
    AND existing.storage_bucket = p_bucket
  THEN
    SELECT * INTO d FROM public.case_documents WHERE id = existing.document_id;
    result := jsonb_build_object(
      'status', 'success', 'documentId', d.id, 'versionId', existing.id, 'versionNumber', existing.version_number,
      'storageKey', existing.storage_key, 'storageBucket', existing.storage_bucket,
      'contentType', existing.declared_content_type, 'maxBytes', 10485760
    );
    INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF existing.upload_status = 'PENDING_UPLOAD' THEN
    UPDATE public.case_document_versions
      SET upload_status = 'FAILED'
      WHERE id = existing.id AND upload_status = 'PENDING_UPLOAD';
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
    VALUES (cs.id, existing.document_id, existing.id, actor, 'UPLOAD_FAILED', jsonb_build_object(
      'versionNumber', existing.version_number, 'source', 'CUSTOMER_CASE_ACCESS', 'reason', 'RESTARTED_BEFORE_FINALIZE'
    ));
    abandoned := existing.id;
    SELECT * INTO d FROM public.case_documents WHERE id = existing.document_id FOR UPDATE;
  ELSE
    SELECT doc.* INTO d
    FROM public.case_documents doc
    WHERE doc.evidence_request_id = req.id
      AND EXISTS (
        SELECT 1 FROM public.case_document_versions v
        WHERE v.document_id = doc.id AND v.submission_source = 'CUSTOMER'
      )
    ORDER BY doc.created_at, doc.id
    LIMIT 1
    FOR UPDATE;
    IF d.id IS NULL THEN
      INSERT INTO public.case_documents(case_id, evidence_request_id, title, created_by)
      VALUES (cs.id, req.id, req.title, actor) RETURNING * INTO d;
    END IF;
  END IF;
  SELECT coalesce(max(version_number), 0) + 1 INTO version_no FROM public.case_document_versions WHERE document_id = d.id;
  version_id := gen_random_uuid();
  object_key := 'cases/' || cs.id::text || '/documents/' || d.id::text || '/versions/' || version_id::text;
  INSERT INTO public.case_document_versions(
    id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
    storage_provider, storage_bucket, storage_key, created_by,
    submission_source, customer_action_id, customer_evidence_request_id
  ) VALUES (
    version_id, d.id, version_no, btrim(p_filename), p_content_type, p_size, 'S3', p_bucket, object_key, actor,
    'CUSTOMER', a.id, req.id
  );
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (cs.id, d.id, version_id, actor, 'UPLOAD_BEGUN', jsonb_build_object(
    'versionNumber', version_no, 'contentType', p_content_type, 'sizeBytes', p_size, 'source', 'CUSTOMER_CASE_ACCESS'
  ));
  PERFORM admin_private.write_record_audit_v1(
    actor, 'EVIDENCE_CHANGED', 'success', cs.id, p_request, 'case',
    'Customer evidence upload started',
    jsonb_build_object(
      'operation', 'begin', 'source', 'CUSTOMER_CASE_ACCESS', 'documentId', d.id, 'versionId', version_id
    ) || CASE WHEN abandoned IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('abandonedVersionId', abandoned) END
  );
  result := jsonb_build_object(
    'status', 'success', 'documentId', d.id, 'versionId', version_id, 'versionNumber', version_no,
    'storageKey', object_key, 'storageBucket', p_bucket, 'contentType', p_content_type, 'maxBytes', 10485760
  );
  INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_evidence_upload_version_v1(p_token_hash text, p_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions; d public.case_documents; v public.case_document_versions;
  req public.evidence_requests; cs public.cases;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL OR p_version IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version;
  IF v.id IS NULL OR v.submission_source <> 'CUSTOMER' OR v.customer_action_id IS DISTINCT FROM a.id THEN RETURN NULL; END IF;
  IF v.upload_status NOT IN ('PENDING_UPLOAD', 'UPLOADED') THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF d.id IS NULL OR d.case_id <> a.case_id THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO req FROM public.evidence_requests WHERE id = coalesce(v.customer_evidence_request_id, d.evidence_request_id);
  IF NOT admin_private.customer_action_may_use_evidence_request_v1(a, req, cs) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'documentId', d.id,
    'versionId', v.id,
    'evidenceRequestId', req.id,
    'storageBucket', v.storage_bucket,
    'storageKey', v.storage_key,
    'contentType', v.declared_content_type,
    'sizeBytes', v.declared_size_bytes,
    'uploadStatus', v.upload_status,
    'submissionSource', v.submission_source
  );
END; $$;

CREATE OR REPLACE FUNCTION public.customer_evidence_finalize_v1(p_token_hash text, p_request uuid, p_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions; sess admin_private.customer_action_sessions;
  cs public.cases; d public.case_documents; v public.case_document_versions; req public.evidence_requests;
  actor uuid; fp text; cached jsonb; result jsonb;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL OR sess.action_id <> a.id THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  actor := sess.auth_user_id;
  IF p_request IS NULL OR p_version IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(p_version, 'finalize')::text);
  cached := admin_private.customer_evidence_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id FOR UPDATE;
  IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.submission_source <> 'CUSTOMER' OR v.customer_action_id IS DISTINCT FROM a.id THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id FOR UPDATE;
  IF d.id IS NULL OR d.case_id <> a.case_id THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO req FROM public.evidence_requests WHERE id = coalesce(v.customer_evidence_request_id, d.evidence_request_id) FOR UPDATE;
  IF NOT admin_private.customer_action_may_use_evidence_request_v1(a, req, cs) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF v.upload_status = 'UPLOADED' THEN
    result := jsonb_build_object(
      'status', 'success', 'documentId', d.id, 'versionId', v.id,
      'uploadStatus', v.upload_status, 'scanStatus', v.scan_status, 'validationStatus', v.validation_status,
      'reviewStatus', v.review_status, 'customerVisible', v.customer_visible
    );
    INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF v.upload_status <> 'PENDING_UPLOAD' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  UPDATE public.case_document_versions
    SET upload_status = 'UPLOADED', uploaded_at = now()
    WHERE id = v.id
      AND upload_status = 'PENDING_UPLOAD'
      AND scan_status = 'PENDING'
      AND validation_status = 'PENDING'
      AND review_status = 'UNREVIEWED'
      AND customer_visible IS FALSE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (cs.id, d.id, v.id, actor, 'UPLOAD_FINALIZED', jsonb_build_object(
    'versionNumber', v.version_number, 'source', 'CUSTOMER_CASE_ACCESS'
  ));
  PERFORM admin_private.write_record_audit_v1(
    actor, 'EVIDENCE_CHANGED', 'success', cs.id, p_request, 'case',
    'Customer evidence upload finalized',
    jsonb_build_object('operation', 'finalize', 'source', 'CUSTOMER_CASE_ACCESS', 'documentId', d.id, 'versionId', v.id)
  );
  result := jsonb_build_object(
    'status', 'success', 'documentId', d.id, 'versionId', v.id,
    'uploadStatus', 'UPLOADED', 'scanStatus', 'PENDING', 'validationStatus', 'PENDING',
    'reviewStatus', 'UNREVIEWED', 'customerVisible', false
  );
  INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.communication_load_send_v1(uuid, integer),
  public.communication_begin_provider_attempt_v1(uuid, integer, text),
  public.communication_mark_provider_accepted_v1(uuid, text, text, text),
  public.communication_mark_acceptance_unknown_v1(uuid, text),
  public.communication_mark_provider_rejected_v1(uuid, text, boolean, text),
  public.communication_apply_provider_event_v1(text, text, text, text, timestamptz, text),
  public.admin_communication_list_v1(text, uuid),
  public.admin_communication_command_v1(text, uuid, text, jsonb, integer),
  public.admin_job_health_v1(text),
  public.admin_audit_list_v1(text, bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.communication_load_send_v1(uuid, integer),
  public.communication_begin_provider_attempt_v1(uuid, integer, text),
  public.communication_mark_provider_accepted_v1(uuid, text, text, text),
  public.communication_mark_acceptance_unknown_v1(uuid, text),
  public.communication_mark_provider_rejected_v1(uuid, text, boolean, text),
  public.communication_apply_provider_event_v1(text, text, text, text, timestamptz, text),
  public.admin_communication_list_v1(text, uuid),
  public.admin_communication_command_v1(text, uuid, text, jsonb, integer),
  public.admin_job_health_v1(text),
  public.admin_audit_list_v1(text, bigint, text, text)
  TO service_role;

COMMIT;
