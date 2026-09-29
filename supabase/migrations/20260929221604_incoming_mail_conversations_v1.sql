-- Incoming mail and conversations v1 (Step 12). Additive only.
-- Do not replay applied Step 11 SQL. Do not enable live inbound or outbound mail.

BEGIN;

ALTER TABLE admin_private.job_outbox DROP CONSTRAINT job_outbox_topic_check;
ALTER TABLE admin_private.job_outbox ADD CONSTRAINT job_outbox_topic_check
  CHECK (topic IN ('SYSTEM_HEALTH_PROBE', 'SEND_EMAIL', 'IMPORT_INBOUND_EMAIL', 'IMPORT_INBOUND_ATTACHMENT'));
ALTER TABLE admin_private.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE admin_private.jobs ADD CONSTRAINT jobs_type_check
  CHECK (job_type IN ('SYSTEM_HEALTH_PROBE', 'SEND_EMAIL', 'IMPORT_INBOUND_EMAIL', 'IMPORT_INBOUND_ATTACHMENT'));

CREATE OR REPLACE FUNCTION admin_private.enqueue_outbox_v1(
  p_event_key text, p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_available_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE created admin_private.job_outbox;
BEGIN
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 8 AND 200
    OR p_topic IS NULL OR p_topic NOT IN ('SYSTEM_HEALTH_PROBE', 'SEND_EMAIL', 'IMPORT_INBOUND_EMAIL', 'IMPORT_INBOUND_ATTACHMENT')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid outbox event'; END IF;
  INSERT INTO admin_private.job_outbox(event_key, topic, aggregate_type, aggregate_id, payload, available_at)
  VALUES (btrim(p_event_key), p_topic, nullif(btrim(coalesce(p_aggregate_type, '')), ''), p_aggregate_id, p_payload, coalesce(p_available_at, now()))
  RETURNING * INTO created;
  RETURN created.id;
END; $$;

ALTER TABLE public.communications
  ADD COLUMN conversation_id uuid,
  ADD COLUMN reply_to_address text,
  ADD COLUMN in_reply_to text,
  ADD COLUMN references_header text,
  ADD COLUMN rfc_message_id text;

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN ('EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY') AND template_version >= 1)
);
ALTER TABLE public.communications ADD CONSTRAINT communications_reply_to_check CHECK (
  reply_to_address IS NULL
  OR (length(reply_to_address) BETWEEN 3 AND 254 AND reply_to_address ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);
ALTER TABLE public.communications ADD CONSTRAINT communications_rfc_ids_check CHECK (
  (in_reply_to IS NULL OR length(in_reply_to) BETWEEN 3 AND 300)
  AND (references_header IS NULL OR length(references_header) BETWEEN 3 AND 2000)
  AND (rfc_message_id IS NULL OR length(rfc_message_id) BETWEEN 3 AND 300)
);

CREATE UNIQUE INDEX communications_rfc_message_uidx
  ON public.communications (rfc_message_id)
  WHERE rfc_message_id IS NOT NULL;
CREATE INDEX communications_conversation_idx
  ON public.communications (conversation_id, created_at)
  WHERE conversation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION admin_private.protect_communication_snapshot_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.lifecycle IS NULL THEN RETURN NEW; END IF;
  IF OLD.content_locked IS TRUE AND NEW.content_locked IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Reviewed communication snapshot is immutable';
  END IF;
  IF OLD.rfc_message_id IS NOT NULL AND NEW.rfc_message_id IS DISTINCT FROM OLD.rfc_message_id THEN
    RAISE EXCEPTION 'Provider RFC Message-ID is immutable once set';
  END IF;
  IF OLD.content_locked IS TRUE THEN
    IF NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
      OR NEW.customer_action_id IS DISTINCT FROM OLD.customer_action_id
      OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
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
      OR NEW.reply_to_address IS DISTINCT FROM OLD.reply_to_address
      OR NEW.in_reply_to IS DISTINCT FROM OLD.in_reply_to
      OR NEW.references_header IS DISTINCT FROM OLD.references_header
      OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
      OR NEW.author_id IS DISTINCT FROM OLD.author_id
    THEN RAISE EXCEPTION 'Reviewed communication snapshot is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;

ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN ('EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY'));
INSERT INTO admin_private.communication_templates(template_key, version, name, subject_template, body_text_template)
VALUES (
  'CONVERSATION_REPLY', 1, 'Conversation reply',
  'Re: {subject}',
  'This is a ProfileRelaunch conversation reply.' || E'\n\n' || '{reply_body}'
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'UNMATCHED',
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  assigned_admin_id uuid,
  reply_alias text NOT NULL,
  subject text,
  needs_attention boolean NOT NULL DEFAULT true,
  unmatched_reason text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  record_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT conversations_state_check CHECK (state IN ('UNMATCHED', 'OPEN', 'CLOSED')),
  CONSTRAINT conversations_alias_check CHECK (reply_alias ~ '^[a-f0-9]{32}$'),
  CONSTRAINT conversations_subject_check CHECK (subject IS NULL OR length(subject) BETWEEN 1 AND 500),
  CONSTRAINT conversations_version_check CHECK (record_version >= 1),
  CONSTRAINT conversations_unmatched_reason_check CHECK (unmatched_reason IS NULL OR length(unmatched_reason) BETWEEN 3 AND 200),
  CONSTRAINT conversations_open_case_check CHECK (
    (state = 'UNMATCHED' AND case_id IS NULL)
    OR (state = 'OPEN' AND case_id IS NOT NULL)
    OR (state = 'CLOSED')
  ),
  UNIQUE (reply_alias)
);
CREATE INDEX conversations_state_idx ON public.conversations (state, last_activity_at DESC, id DESC);
CREATE INDEX conversations_case_idx ON public.conversations (case_id, last_activity_at DESC) WHERE case_id IS NOT NULL;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversations FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.communications
  ADD CONSTRAINT communications_conversation_fk
  FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT;

CREATE TABLE public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  import_status text NOT NULL DEFAULT 'IMPORTED',
  provider text,
  provider_email_id text,
  provider_event_id text,
  rfc_message_id text,
  in_reply_to text,
  references_header text,
  sender_address text,
  sender_display text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  body_text text,
  body_html_source text,
  received_at timestamptz,
  provider_occurred_at timestamptz,
  sender_match text NOT NULL DEFAULT 'NONE',
  auto_submitted text,
  loop_class text NOT NULL DEFAULT 'NONE',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_kind_check CHECK (kind IN ('INBOUND_EMAIL', 'PHONE_NOTE')),
  CONSTRAINT conversation_messages_import_check CHECK (import_status IN ('IMPORTED', 'LOOP', 'REJECTED')),
  CONSTRAINT conversation_messages_sender_match_check CHECK (
    sender_match IN ('NONE', 'MATCHES_VERIFIED_CONTACT', 'OWNED_ADDRESS', 'AUTOMATED')
  ),
  CONSTRAINT conversation_messages_loop_check CHECK (
    loop_class IN ('NONE', 'OWNED_SENDER', 'KNOWN_OUTBOUND_RFC', 'AUTO_SUBMITTED', 'DUPLICATE_PROVIDER')
  ),
  CONSTRAINT conversation_messages_provider_check CHECK (provider IS NULL OR provider = 'resend'),
  CONSTRAINT conversation_messages_email_shape_check CHECK (
    (kind = 'PHONE_NOTE' AND provider_email_id IS NULL AND body_text IS NOT NULL AND length(body_text) BETWEEN 3 AND 4000)
    OR (kind = 'INBOUND_EMAIL' AND provider = 'resend' AND length(coalesce(provider_email_id, '')) BETWEEN 8 AND 200)
  ),
  CONSTRAINT conversation_messages_arrays_check CHECK (
    jsonb_typeof(to_addresses) = 'array' AND jsonb_array_length(to_addresses) <= 20
    AND jsonb_typeof(cc_addresses) = 'array' AND jsonb_array_length(cc_addresses) <= 20
  ),
  CONSTRAINT conversation_messages_text_check CHECK (
    (subject IS NULL OR length(subject) BETWEEN 1 AND 500)
    AND (body_text IS NULL OR length(body_text) <= 200000)
    AND (body_html_source IS NULL OR length(body_html_source) <= 400000)
    AND (sender_address IS NULL OR length(sender_address) BETWEEN 3 AND 254)
    AND (rfc_message_id IS NULL OR length(rfc_message_id) BETWEEN 3 AND 300)
  )
);
CREATE UNIQUE INDEX conversation_messages_provider_email_uidx
  ON public.conversation_messages (provider, provider_email_id)
  WHERE provider_email_id IS NOT NULL;
CREATE INDEX conversation_messages_rfc_idx
  ON public.conversation_messages (rfc_message_id)
  WHERE rfc_message_id IS NOT NULL;
CREATE INDEX conversation_messages_conversation_idx
  ON public.conversation_messages (conversation_id, created_at, id);
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_messages FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.protect_conversation_message_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Conversation messages are append-only';
END; $$;
CREATE TRIGGER conversation_messages_protect
  BEFORE UPDATE OR DELETE ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_conversation_message_v1();
REVOKE ALL ON FUNCTION admin_private.protect_conversation_message_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.conversation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.conversation_messages(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  provider_attachment_id text NOT NULL,
  original_filename text NOT NULL,
  declared_mime text NOT NULL,
  size_bytes integer NOT NULL,
  storage_bucket text,
  storage_key text,
  ingestion_status text NOT NULL DEFAULT 'METADATA_RECORDED',
  scan_status text NOT NULL DEFAULT 'PENDING',
  validation_status text NOT NULL DEFAULT 'PENDING',
  promotion_state text NOT NULL DEFAULT 'NONE',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_attachments_provider_id_check CHECK (length(provider_attachment_id) BETWEEN 8 AND 200),
  CONSTRAINT conversation_attachments_filename_check CHECK (length(original_filename) BETWEEN 1 AND 200),
  CONSTRAINT conversation_attachments_mime_check CHECK (length(declared_mime) BETWEEN 3 AND 120),
  CONSTRAINT conversation_attachments_size_check CHECK (size_bytes >= 0 AND size_bytes <= 104857600),
  CONSTRAINT conversation_attachments_ingestion_check CHECK (
    ingestion_status IN ('METADATA_RECORDED', 'STORAGE_PENDING', 'STORED', 'CLEAN', 'MALWARE', 'UNSUPPORTED', 'FAILED')
  ),
  CONSTRAINT conversation_attachments_scan_check CHECK (
    scan_status IN ('PENDING', 'NO_THREATS_FOUND', 'THREATS_FOUND', 'UNSUPPORTED', 'ACCESS_DENIED', 'FAILED')
  ),
  CONSTRAINT conversation_attachments_validation_check CHECK (
    validation_status IN ('PENDING', 'VALID', 'INVALID', 'ERROR')
  ),
  CONSTRAINT conversation_attachments_promotion_check CHECK (promotion_state IN ('NONE', 'RECORDED')),
  CONSTRAINT conversation_attachments_clean_storage_check CHECK (
    ingestion_status <> 'CLEAN'
    OR (
      storage_bucket IS NOT NULL AND length(storage_bucket) BETWEEN 3 AND 120
      AND storage_key IS NOT NULL AND length(storage_key) BETWEEN 8 AND 500
      AND scan_status = 'NO_THREATS_FOUND'
      AND validation_status = 'VALID'
    )
  ),
  UNIQUE (message_id, provider_attachment_id)
);
CREATE INDEX conversation_attachments_message_idx ON public.conversation_attachments (message_id);
ALTER TABLE public.conversation_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_attachments FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.inbound_email_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_email_id text NOT NULL,
  event_type text NOT NULL,
  rfc_message_id text,
  sender_address text,
  subject text,
  sender_display text,
  provider_occurred_at timestamptz,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE RESTRICT,
  message_id uuid REFERENCES public.conversation_messages(id) ON DELETE RESTRICT,
  import_status text NOT NULL DEFAULT 'RECEIVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_receipts_provider_check CHECK (provider = 'resend'),
  CONSTRAINT inbound_email_receipts_ids_check CHECK (
    length(provider_event_id) BETWEEN 8 AND 200
    AND length(provider_email_id) BETWEEN 8 AND 200
    AND event_type = 'email.received'
  ),
  CONSTRAINT inbound_email_receipts_status_check CHECK (import_status IN ('RECEIVED', 'IMPORTED', 'LOOP', 'REJECTED')),
  UNIQUE (provider, provider_event_id),
  UNIQUE (provider, provider_email_id)
);
ALTER TABLE admin_private.inbound_email_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.inbound_email_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.conversation_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.conversation_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.conversation_command_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.conversation_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.conversation_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.conversation_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.conversation_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.normalize_rfc_id_v1(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT nullif(left(lower(btrim(btrim(coalesce(p_value, '')), '<>')), 300), '');
$$;
REVOKE ALL ON FUNCTION admin_private.normalize_rfc_id_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.new_conversation_alias_v1()
RETURNS text LANGUAGE sql SET search_path='' AS $$
  SELECT encode(extensions.gen_random_bytes(16), 'hex');
$$;
REVOKE ALL ON FUNCTION admin_private.new_conversation_alias_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.allowed_inbound_mime_v1(p_mime text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT lower(btrim(coalesce(p_mime, ''))) IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
$$;
REVOKE ALL ON FUNCTION admin_private.allowed_inbound_mime_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.parse_mailbox_v1(p_value text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE raw text; display text; addr text;
BEGIN
  raw := btrim(coalesce(p_value, ''));
  IF raw = '' OR length(raw) > 320 THEN RETURN NULL; END IF;
  IF raw ~ '^[^<>]{1,160}<[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>$' THEN
    display := nullif(left(btrim(btrim(substring(raw from '^([^<>]+)<')), ' "'), 120), '');
    addr := lower(substring(raw from '<([^<>]+)>$'));
    IF addr IS NULL OR length(addr) NOT BETWEEN 3 AND 254 THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('address', addr, 'display', display);
  END IF;
  IF raw ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND length(raw) BETWEEN 3 AND 254 THEN
    RETURN jsonb_build_object('address', lower(raw), 'display', NULL);
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.parse_mailbox_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.inbound_attachment_event_key_v1(p_email_id text, p_attachment_id text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN length('import-inbound-attachment:resend:' || p_email_id || ':' || p_attachment_id) <= 200
      THEN 'import-inbound-attachment:resend:' || p_email_id || ':' || p_attachment_id
    ELSE 'import-inbound-attachment:resend:' || encode(extensions.digest(p_email_id || ':' || p_attachment_id, 'sha256'), 'hex')
  END;
$$;
REVOKE ALL ON FUNCTION admin_private.inbound_attachment_event_key_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.resolve_inbound_thread_v1(
  p_in_reply_to text, p_references text, p_to jsonb, p_cc jsonb, p_inbound_domain text
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rfc_matches uuid[]; alias_matches uuid[]; tokens text[]; domain text; rfc_ids text[];
BEGIN
  tokens := regexp_split_to_array(
    btrim(coalesce(p_in_reply_to, '') || E'\n' || coalesce(p_references, '')),
    E'[ \\t\\n\\r,]+'
  );
  SELECT coalesce(array_agg(DISTINCT admin_private.normalize_rfc_id_v1(t)), ARRAY[]::text[])
    INTO rfc_ids
    FROM unnest(tokens) t
    WHERE admin_private.normalize_rfc_id_v1(t) IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT conversation_id), ARRAY[]::uuid[]) INTO rfc_matches
  FROM (
    SELECT m.conversation_id
    FROM public.conversation_messages m
    WHERE m.rfc_message_id IS NOT NULL AND m.rfc_message_id = ANY (rfc_ids)
    UNION
    SELECT c.conversation_id
    FROM public.communications c
    WHERE c.rfc_message_id IS NOT NULL AND c.conversation_id IS NOT NULL
      AND c.rfc_message_id = ANY (rfc_ids)
  ) found;
  domain := lower(btrim(coalesce(p_inbound_domain, '')));
  alias_matches := ARRAY[]::uuid[];
  IF domain <> '' AND domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN
    SELECT coalesce(array_agg(DISTINCT c.id), ARRAY[]::uuid[]) INTO alias_matches
      FROM public.conversations c
      WHERE exists (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(p_to, '[]'::jsonb) || coalesce(p_cc, '[]'::jsonb)) raw
        WHERE (admin_private.parse_mailbox_v1(raw)->>'address') = (c.reply_alias || '@' || domain)
      );
  END IF;
  IF coalesce(array_length(rfc_matches, 1), 0) = 1 THEN
    RETURN jsonb_build_object('status', 'matched', 'conversationId', rfc_matches[1]);
  END IF;
  IF coalesce(array_length(alias_matches, 1), 0) = 1 THEN
    RETURN jsonb_build_object('status', 'matched', 'conversationId', alias_matches[1]);
  END IF;
  IF coalesce(array_length(rfc_matches, 1), 0) > 1
    OR coalesce(array_length(alias_matches, 1), 0) > 1
  THEN
    RETURN jsonb_build_object('status', 'ambiguous');
  END IF;
  RETURN jsonb_build_object('status', 'none');
END; $$;
REVOKE ALL ON FUNCTION admin_private.resolve_inbound_thread_v1(text, text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.inbound_email_receive_event_v1(
  p_provider text, p_provider_event_id text, p_event_type text, p_provider_email_id text,
  p_rfc_message_id text DEFAULT NULL, p_sender_address text DEFAULT NULL, p_subject text DEFAULT NULL,
  p_provider_occurred_at timestamptz DEFAULT NULL, p_sender_display text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE existing admin_private.inbound_email_receipts;
  provider_name text; event_id text; event_name text; email_id text; rfc text; sender text; subject text;
  parsed jsonb; display text;
BEGIN
  provider_name := lower(btrim(coalesce(p_provider, '')));
  event_id := btrim(coalesce(p_provider_event_id, ''));
  event_name := btrim(coalesce(p_event_type, ''));
  email_id := btrim(coalesce(p_provider_email_id, ''));
  rfc := admin_private.normalize_rfc_id_v1(p_rfc_message_id);
  parsed := admin_private.parse_mailbox_v1(p_sender_address);
  sender := parsed->>'address';
  display := coalesce(nullif(left(btrim(coalesce(p_sender_display, '')), 120), ''), parsed->>'display');
  subject := nullif(left(btrim(coalesce(p_subject, '')), 500), '');
  IF p_provider_occurred_at IS NOT NULL AND (
    p_provider_occurred_at > now() + interval '1 hour'
    OR p_provider_occurred_at < now() - interval '30 days'
  ) THEN p_provider_occurred_at := NULL; END IF;
  IF provider_name <> 'resend' OR event_name <> 'email.received'
    OR length(event_id) NOT BETWEEN 8 AND 200 OR length(email_id) NOT BETWEEN 8 AND 200
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO existing FROM admin_private.inbound_email_receipts
    WHERE inbound_email_receipts.provider = provider_name AND inbound_email_receipts.provider_event_id = event_id;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'duplicate', true, 'providerEmailId', existing.provider_email_id);
  END IF;
  SELECT * INTO existing FROM admin_private.inbound_email_receipts
    WHERE inbound_email_receipts.provider = provider_name AND inbound_email_receipts.provider_email_id = email_id;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'duplicate', true, 'providerEmailId', email_id);
  END IF;
  INSERT INTO admin_private.inbound_email_receipts(
    provider, provider_event_id, provider_email_id, event_type, rfc_message_id, sender_address, sender_display, subject, provider_occurred_at
  ) VALUES (provider_name, event_id, email_id, event_name, rfc, sender, display, subject, p_provider_occurred_at);
  PERFORM admin_private.enqueue_outbox_v1(
    'import-inbound-email:resend:' || email_id,
    'IMPORT_INBOUND_EMAIL',
    'inbound_email',
    NULL,
    jsonb_build_object('provider', 'resend', 'providerEmailId', email_id, 'providerEventId', event_id),
    now()
  );
  RETURN jsonb_build_object('status', 'success', 'duplicate', false, 'providerEmailId', email_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'success', 'duplicate', true, 'providerEmailId', email_id);
END; $$;

CREATE FUNCTION public.inbound_email_load_import_v1(p_provider text, p_provider_email_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row admin_private.inbound_email_receipts;
BEGIN
  IF lower(btrim(coalesce(p_provider, ''))) <> 'resend'
    OR length(btrim(coalesce(p_provider_email_id, ''))) NOT BETWEEN 8 AND 200
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO row FROM admin_private.inbound_email_receipts
    WHERE provider = 'resend' AND provider_email_id = btrim(p_provider_email_id);
  IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.import_status IN ('IMPORTED', 'LOOP', 'REJECTED') THEN
    RETURN jsonb_build_object(
      'status', 'success', 'alreadyImported', true, 'importStatus', row.import_status,
      'conversationId', row.conversation_id, 'messageId', row.message_id
    );
  END IF;
  RETURN jsonb_build_object(
    'status', 'success', 'alreadyImported', false, 'importStatus', row.import_status,
    'providerEmailId', row.provider_email_id, 'providerEventId', row.provider_event_id,
    'rfcMessageId', row.rfc_message_id, 'senderAddress', row.sender_address, 'subject', row.subject
  );
END; $$;

CREATE FUNCTION public.inbound_email_import_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE
  receipt admin_private.inbound_email_receipts;
  conversation public.conversations;
  message public.conversation_messages;
  email_id text; event_id text; rfc text; sender text; subject text;
  in_reply text; refs text; auto_sub text; inbound_domain text;
  body_text text; body_html text; to_addr jsonb; cc_addr jsonb; owned jsonb;
  attachments jsonb; item jsonb; attachment_count integer := 0;
  matched jsonb; sender_match text := 'NONE'; loop_class text := 'NONE'; import_status text := 'IMPORTED';
  alias text; display text; i integer; parsed jsonb; unmatched text; att_row public.conversation_attachments;
  event_key text; normalized_to jsonb := '[]'::jsonb; normalized_cc jsonb := '[]'::jsonb; raw_addr text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  email_id := btrim(coalesce(p_payload->>'providerEmailId', ''));
  event_id := btrim(coalesce(p_payload->>'providerEventId', ''));
  IF length(email_id) NOT BETWEEN 8 AND 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO receipt FROM admin_private.inbound_email_receipts
    WHERE provider = 'resend' AND provider_email_id = email_id FOR UPDATE;
  IF receipt.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF receipt.import_status IN ('IMPORTED', 'LOOP', 'REJECTED') THEN
    RETURN jsonb_build_object(
      'status', 'success', 'duplicate', true, 'conversationId', receipt.conversation_id, 'messageId', receipt.message_id
    );
  END IF;
  rfc := coalesce(admin_private.normalize_rfc_id_v1(p_payload->>'rfcMessageId'), receipt.rfc_message_id);
  parsed := admin_private.parse_mailbox_v1(coalesce(p_payload->>'senderAddress', receipt.sender_address));
  sender := coalesce(parsed->>'address', receipt.sender_address);
  display := coalesce(
    nullif(left(btrim(coalesce(p_payload->>'senderDisplay', receipt.sender_display, '')), 120), ''),
    parsed->>'display'
  );
  subject := nullif(left(btrim(coalesce(p_payload->>'subject', receipt.subject, '')), 500), '');
  in_reply := admin_private.normalize_rfc_id_v1(p_payload->>'inReplyTo');
  refs := nullif(left(btrim(coalesce(p_payload->>'referencesHeader', '')), 2000), '');
  auto_sub := nullif(left(lower(btrim(coalesce(p_payload->>'autoSubmitted', ''))), 80), '');
  inbound_domain := lower(btrim(coalesce(p_payload->>'inboundDomain', '')));
  body_text := left(coalesce(p_payload->>'bodyText', ''), 200000);
  body_html := nullif(left(coalesce(p_payload->>'bodyHtml', ''), 400000), '');
  to_addr := coalesce(p_payload->'toAddresses', '[]'::jsonb);
  cc_addr := coalesce(p_payload->'ccAddresses', '[]'::jsonb);
  owned := coalesce(p_payload->'ownedAddresses', '[]'::jsonb);
  attachments := coalesce(p_payload->'attachments', '[]'::jsonb);
  IF jsonb_typeof(to_addr) <> 'array' OR jsonb_typeof(cc_addr) <> 'array'
    OR jsonb_typeof(owned) <> 'array' OR jsonb_typeof(attachments) <> 'array'
    OR jsonb_array_length(to_addr) > 20 OR jsonb_array_length(cc_addr) > 20
    OR jsonb_array_length(owned) > 20 OR jsonb_array_length(attachments) > 10
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  FOR raw_addr IN SELECT jsonb_array_elements_text(to_addr) LOOP
    parsed := admin_private.parse_mailbox_v1(raw_addr);
    IF parsed IS NOT NULL THEN normalized_to := normalized_to || jsonb_build_array(parsed->>'address'); END IF;
  END LOOP;
  FOR raw_addr IN SELECT jsonb_array_elements_text(cc_addr) LOOP
    parsed := admin_private.parse_mailbox_v1(raw_addr);
    IF parsed IS NOT NULL THEN normalized_cc := normalized_cc || jsonb_build_array(parsed->>'address'); END IF;
  END LOOP;
  to_addr := normalized_to;
  cc_addr := normalized_cc;
  IF sender IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customer_contact_verifications v
    WHERE v.channel = 'email' AND admin_private.normalize_email_v1(v.verified_value) = sender
  ) THEN sender_match := 'MATCHES_VERIFIED_CONTACT'; END IF;
  IF sender IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(owned) addr
    WHERE coalesce(admin_private.parse_mailbox_v1(addr)->>'address', admin_private.normalize_email_v1(addr)) = sender
  ) THEN
    sender_match := 'OWNED_ADDRESS';
    loop_class := 'OWNED_SENDER';
  END IF;
  IF rfc IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.communications c WHERE c.rfc_message_id = rfc
  ) THEN loop_class := 'KNOWN_OUTBOUND_RFC'; END IF;
  IF auto_sub IS NOT NULL AND auto_sub NOT IN ('', 'no') THEN
    sender_match := CASE WHEN sender_match = 'NONE' THEN 'AUTOMATED' ELSE sender_match END;
    IF loop_class = 'NONE' THEN loop_class := 'AUTO_SUBMITTED'; END IF;
  END IF;
  IF loop_class <> 'NONE' THEN import_status := 'LOOP'; END IF;
  matched := admin_private.resolve_inbound_thread_v1(in_reply, refs, to_addr, cc_addr, inbound_domain);
  IF matched->>'status' = 'matched' THEN
    SELECT * INTO conversation FROM public.conversations WHERE id = (matched->>'conversationId')::uuid FOR UPDATE;
  ELSE
    unmatched := CASE WHEN matched->>'status' = 'ambiguous' THEN 'Ambiguous thread relationship' ELSE 'No trusted thread relationship' END;
    alias := admin_private.new_conversation_alias_v1();
    INSERT INTO public.conversations(state, reply_alias, subject, unmatched_reason, needs_attention)
    VALUES (
      'UNMATCHED', alias, subject, unmatched, true
    ) RETURNING * INTO conversation;
  END IF;
  INSERT INTO public.conversation_messages(
    conversation_id, kind, import_status, provider, provider_email_id, provider_event_id,
    rfc_message_id, in_reply_to, references_header, sender_address, sender_display,
    to_addresses, cc_addresses, subject, body_text, body_html_source, received_at, provider_occurred_at,
    sender_match, auto_submitted, loop_class
  ) VALUES (
    conversation.id, 'INBOUND_EMAIL', import_status, 'resend', email_id, coalesce(nullif(event_id, ''), receipt.provider_event_id),
    rfc, in_reply, refs, sender, display, to_addr, cc_addr, subject, nullif(body_text, ''), body_html,
    coalesce((p_payload->>'receivedAt')::timestamptz, now()),
    receipt.provider_occurred_at,
    sender_match, auto_sub, loop_class
  ) RETURNING * INTO message;
  FOR i IN 0..jsonb_array_length(attachments) - 1 LOOP
    item := attachments -> i;
    IF jsonb_typeof(item) <> 'object' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF length(btrim(coalesce(item->>'providerAttachmentId', ''))) NOT BETWEEN 8 AND 200
      OR length(btrim(coalesce(item->>'filename', ''))) NOT BETWEEN 1 AND 200
      OR coalesce((item->>'sizeBytes')::bigint, -1) NOT BETWEEN 0 AND 104857600
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    attachment_count := attachment_count + 1;
    INSERT INTO public.conversation_attachments(
      message_id, conversation_id, provider_attachment_id, original_filename, declared_mime, size_bytes,
      ingestion_status, validation_status
    ) VALUES (
      message.id, conversation.id,
      btrim(item->>'providerAttachmentId'),
      left(btrim(item->>'filename'), 200),
      left(btrim(coalesce(item->>'mimeType', 'application/octet-stream')), 120),
      (item->>'sizeBytes')::integer,
      'METADATA_RECORDED',
      'PENDING'
    ) RETURNING * INTO att_row;
    event_key := admin_private.inbound_attachment_event_key_v1(email_id, att_row.provider_attachment_id);
    PERFORM admin_private.enqueue_outbox_v1(
      event_key,
      'IMPORT_INBOUND_ATTACHMENT',
      'conversation_attachment',
      att_row.id,
      jsonb_build_object(
        'provider', 'resend',
        'providerEmailId', email_id,
        'providerAttachmentId', att_row.provider_attachment_id,
        'attachmentId', att_row.id
      ),
      now()
    );
  END LOOP;
  UPDATE public.conversations
    SET last_activity_at = now(),
        updated_at = now(),
        needs_attention = true,
        subject = coalesce(conversations.subject, subject),
        record_version = conversations.record_version + 1
    WHERE id = conversation.id;
  UPDATE admin_private.inbound_email_receipts
    SET import_status = import_status, conversation_id = conversation.id, message_id = message.id
    WHERE id = receipt.id;
  RETURN jsonb_build_object(
    'status', 'success', 'duplicate', false,
    'conversationId', conversation.id, 'messageId', message.id,
    'importStatus', import_status, 'senderMatch', sender_match, 'loopClass', loop_class,
    'state', conversation.state
  );
END; $$;

CREATE FUNCTION public.inbound_attachment_load_import_v1(p_attachment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.conversation_attachments;
BEGIN
  IF p_attachment IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO row FROM public.conversation_attachments WHERE id = p_attachment;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'alreadyImported', row.ingestion_status IN ('CLEAN', 'MALWARE', 'UNSUPPORTED', 'FAILED'),
    'stored', row.storage_bucket IS NOT NULL AND row.storage_key IS NOT NULL,
    'id', row.id,
    'conversationId', row.conversation_id,
    'messageId', row.message_id,
    'providerAttachmentId', row.provider_attachment_id,
    'filename', row.original_filename,
    'mimeType', row.declared_mime,
    'sizeBytes', row.size_bytes,
    'ingestionStatus', row.ingestion_status,
    'scanStatus', row.scan_status,
    'validationStatus', row.validation_status,
    'storageBucket', row.storage_bucket,
    'storageKey', row.storage_key
  );
END; $$;

CREATE FUNCTION public.inbound_attachment_apply_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE row public.conversation_attachments; op text; bucket text; object_key text;
  scan text; validation text; ingestion text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR NULLIF(p_payload->>'attachmentId', '')::uuid IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  op := btrim(coalesce(p_payload->>'operation', ''));
  IF op NOT IN ('record_storage', 'mark_result', 'start_storage') THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO row FROM public.conversation_attachments WHERE id = (p_payload->>'attachmentId')::uuid FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.ingestion_status IN ('CLEAN', 'MALWARE', 'UNSUPPORTED', 'FAILED') THEN
    RETURN jsonb_build_object(
      'status', 'success', 'duplicate', true, 'id', row.id,
      'ingestionStatus', row.ingestion_status, 'scanStatus', row.scan_status, 'validationStatus', row.validation_status
    );
  END IF;
  IF op = 'start_storage' THEN
    IF row.ingestion_status IN ('STORAGE_PENDING', 'STORED') THEN
      RETURN jsonb_build_object('status', 'success', 'duplicate', true, 'id', row.id, 'ingestionStatus', row.ingestion_status);
    END IF;
    IF row.ingestion_status <> 'METADATA_RECORDED' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.conversation_attachments
      SET ingestion_status = 'STORAGE_PENDING'
      WHERE id = row.id RETURNING * INTO row;
    RETURN jsonb_build_object('status', 'success', 'duplicate', false, 'id', row.id, 'ingestionStatus', row.ingestion_status);
  END IF;
  IF op = 'record_storage' THEN
    bucket := nullif(left(btrim(coalesce(p_payload->>'storageBucket', '')), 120), '');
    object_key := nullif(left(btrim(coalesce(p_payload->>'storageKey', '')), 500), '');
    IF bucket IS NULL OR object_key IS NULL OR object_key !~ '^inbound/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF row.storage_bucket IS NOT NULL AND row.storage_key IS NOT NULL THEN
      IF row.storage_bucket = bucket AND row.storage_key = object_key THEN
        RETURN jsonb_build_object('status', 'success', 'duplicate', true, 'id', row.id, 'stored', true);
      END IF;
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    UPDATE public.conversation_attachments
      SET storage_bucket = bucket, storage_key = object_key, ingestion_status = 'STORED'
      WHERE id = row.id RETURNING * INTO row;
    RETURN jsonb_build_object('status', 'success', 'duplicate', false, 'id', row.id, 'stored', true, 'ingestionStatus', row.ingestion_status);
  END IF;
  scan := btrim(coalesce(p_payload->>'scanStatus', row.scan_status));
  validation := btrim(coalesce(p_payload->>'validationStatus', row.validation_status));
  ingestion := btrim(coalesce(p_payload->>'ingestionStatus', ''));
  IF scan NOT IN ('PENDING', 'NO_THREATS_FOUND', 'THREATS_FOUND', 'UNSUPPORTED', 'ACCESS_DENIED', 'FAILED')
    OR validation NOT IN ('PENDING', 'VALID', 'INVALID', 'ERROR')
    OR ingestion NOT IN ('STORED', 'CLEAN', 'MALWARE', 'UNSUPPORTED', 'FAILED')
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF ingestion = 'CLEAN' AND (
    row.storage_bucket IS NULL OR row.storage_key IS NULL
    OR scan <> 'NO_THREATS_FOUND' OR validation <> 'VALID'
  ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  UPDATE public.conversation_attachments
    SET scan_status = scan, validation_status = validation, ingestion_status = ingestion
    WHERE id = row.id RETURNING * INTO row;
  RETURN jsonb_build_object(
    'status', 'success', 'duplicate', false, 'id', row.id,
    'ingestionStatus', row.ingestion_status, 'scanStatus', row.scan_status, 'validationStatus', row.validation_status,
    'available', row.ingestion_status = 'CLEAN'
  );
END; $$;

CREATE FUNCTION public.inbound_attachment_mark_scan_v1(
  p_attachment uuid, p_scan_status text, p_storage_bucket text DEFAULT NULL, p_storage_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.conversation_attachments; stored jsonb;
BEGIN
  IF p_attachment IS NULL OR p_scan_status NOT IN ('PENDING', 'NO_THREATS_FOUND', 'THREATS_FOUND', 'UNSUPPORTED', 'ACCESS_DENIED', 'FAILED')
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_storage_bucket IS NOT NULL AND p_storage_key IS NOT NULL THEN
    stored := public.inbound_attachment_apply_v1(jsonb_build_object(
      'operation', 'record_storage', 'attachmentId', p_attachment,
      'storageBucket', p_storage_bucket, 'storageKey', p_storage_key
    ));
    IF stored->>'status' <> 'success' THEN RETURN stored; END IF;
  END IF;
  SELECT * INTO row FROM public.conversation_attachments WHERE id = p_attachment;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_scan_status = 'NO_THREATS_FOUND' AND (row.storage_bucket IS NULL OR row.storage_key IS NULL) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  RETURN public.inbound_attachment_apply_v1(jsonb_build_object(
    'operation', 'mark_result',
    'attachmentId', p_attachment,
    'scanStatus', p_scan_status,
    'validationStatus', CASE
      WHEN p_scan_status = 'NO_THREATS_FOUND' THEN 'VALID'
      WHEN p_scan_status IN ('THREATS_FOUND', 'UNSUPPORTED') THEN 'INVALID'
      WHEN p_scan_status IN ('ACCESS_DENIED', 'FAILED') THEN 'ERROR'
      ELSE row.validation_status
    END,
    'ingestionStatus', CASE
      WHEN p_scan_status = 'NO_THREATS_FOUND' THEN 'CLEAN'
      WHEN p_scan_status = 'THREATS_FOUND' THEN 'MALWARE'
      WHEN p_scan_status = 'UNSUPPORTED' THEN 'UNSUPPORTED'
      ELSE 'FAILED'
    END
  ));
END; $$;

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

CREATE FUNCTION public.communication_record_rfc_message_id_v1(
  p_communication uuid, p_rfc_message_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.communications; rfc text;
BEGIN
  rfc := admin_private.normalize_rfc_id_v1(p_rfc_message_id);
  IF p_communication IS NULL OR rfc IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.rfc_message_id IS NOT NULL THEN
    IF row.rfc_message_id = rfc THEN RETURN jsonb_build_object('status', 'success', 'rfcMessageId', row.rfc_message_id, 'duplicate', true); END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  UPDATE public.communications SET rfc_message_id = rfc, updated_at = now() WHERE id = row.id;
  RETURN jsonb_build_object('status', 'success', 'rfcMessageId', rfc, 'duplicate', false);
END; $$;

DROP FUNCTION IF EXISTS public.communication_apply_provider_event_v1(text, text, text, text, timestamptz, text);
CREATE FUNCTION public.communication_apply_provider_event_v1(
  p_provider text, p_provider_event_id text, p_event_type text, p_provider_message_id text,
  p_occurred_at timestamptz DEFAULT NULL, p_bounce_class text DEFAULT NULL, p_rfc_message_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE existing admin_private.communication_webhook_events; row public.communications;
  provider_name text; event_id text; event_name text; message text; bounce_class text; rfc text; apply boolean := false;
BEGIN
  provider_name := lower(btrim(coalesce(p_provider, '')));
  event_id := btrim(coalesce(p_provider_event_id, ''));
  event_name := btrim(coalesce(p_event_type, ''));
  message := nullif(left(btrim(coalesce(p_provider_message_id, '')), 200), '');
  rfc := admin_private.normalize_rfc_id_v1(p_rfc_message_id);
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
  IF row.id IS NOT NULL AND rfc IS NOT NULL AND row.rfc_message_id IS NULL THEN
    UPDATE public.communications SET rfc_message_id = rfc, updated_at = now() WHERE id = row.id;
  END IF;
  apply := row.id IS NOT NULL AND p_occurred_at IS NOT NULL
    AND admin_private.communication_apply_matched_event_v1(row.id, event_name, provider_name, event_id, message, p_occurred_at, bounce_class);
  INSERT INTO admin_private.communication_webhook_events(
    provider, provider_event_id, event_type, provider_message_id, communication_id, applied, provider_occurred_at, bounce_class
  ) VALUES (provider_name, event_id, event_name, message, row.id, apply, p_occurred_at, bounce_class);
  RETURN jsonb_build_object('status', 'success', 'duplicate', false, 'applied', apply);
END; $$;

CREATE FUNCTION public.admin_conversation_list_v1(p_token text, p_filter text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb; filter text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  filter := upper(btrim(coalesce(p_filter, '')));
  IF filter = '' THEN filter := NULL; END IF;
  IF filter IS NOT NULL AND filter NOT IN ('UNMATCHED', 'OPEN', 'CLOSED', 'NEEDS_ATTENTION') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'state', c.state,
    'subject', c.subject,
    'sender', m.sender_address,
    'receivedAt', coalesce(m.received_at, c.last_activity_at),
    'caseId', c.case_id,
    'caseReference', cs.public_ref,
    'senderMatch', coalesce(m.sender_match, 'NONE'),
    'hasAttachment', EXISTS (SELECT 1 FROM public.conversation_attachments a WHERE a.conversation_id = c.id),
    'assignedAdminId', c.assigned_admin_id,
    'needsAttention', c.needs_attention,
    'version', c.record_version
  ) ORDER BY c.last_activity_at DESC, c.id DESC), '[]'::jsonb) INTO items
  FROM public.conversations c
  LEFT JOIN public.cases cs ON cs.id = c.case_id
  LEFT JOIN LATERAL (
    SELECT sender_address, sender_match, received_at
    FROM public.conversation_messages
    WHERE conversation_id = c.id AND kind = 'INBOUND_EMAIL'
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) m ON true
  WHERE (filter IS NULL)
    OR (filter = 'NEEDS_ATTENTION' AND c.needs_attention)
    OR (filter <> 'NEEDS_ATTENTION' AND c.state = filter);
  RETURN jsonb_build_object('status', 'success', 'conversations', items);
END; $$;

CREATE FUNCTION public.admin_conversation_detail_v1(p_token text, p_conversation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.conversations; items jsonb; suppressed boolean := false;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_conversation IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.cases cs
    JOIN public.customer_contact_verifications v ON v.customer_id = cs.customer_id AND v.channel = 'email'
    JOIN admin_private.email_suppressions s ON s.address_normalized = admin_private.normalize_email_v1(v.verified_value)
    WHERE cs.id = c.case_id
  ) INTO suppressed;
  SELECT coalesce(jsonb_agg(entry ORDER BY (entry->>'sortAt'), (entry->>'id')), '[]'::jsonb) INTO items
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'kind', m.kind,
      'sortAt', coalesce(m.received_at, m.created_at),
      'importStatus', m.import_status,
      'sender', m.sender_address,
      'senderMatch', m.sender_match,
      'loopClass', m.loop_class,
      'subject', m.subject,
      'bodyText', m.body_text,
      'receivedAt', m.received_at,
      'createdAt', m.created_at,
      'rfcMessageId', m.rfc_message_id,
      'attachments', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id,
          'filename', a.original_filename,
          'mimeType', a.declared_mime,
          'sizeBytes', a.size_bytes,
          'scanStatus', a.scan_status,
          'validationStatus', a.validation_status,
          'available', a.ingestion_status = 'CLEAN' AND a.scan_status = 'NO_THREATS_FOUND' AND a.validation_status = 'VALID'
            AND a.storage_bucket IS NOT NULL AND a.storage_key IS NOT NULL,
          'promotionState', a.promotion_state
        ) ORDER BY a.created_at, a.id)
        FROM public.conversation_attachments a WHERE a.message_id = m.id
      ), '[]'::jsonb)
    ) AS entry
    FROM public.conversation_messages m
    WHERE m.conversation_id = c.id
    UNION ALL
    SELECT jsonb_build_object(
      'id', comm.id,
      'kind', 'OUTBOUND_EMAIL',
      'sortAt', comm.created_at,
      'lifecycle', comm.lifecycle,
      'deliveryStatus', comm.delivery_status,
      'recipient', comm.recipient,
      'subject', comm.subject,
      'bodyText', comm.body_text,
      'replyToAddress', comm.reply_to_address,
      'inReplyTo', comm.in_reply_to,
      'createdAt', comm.created_at,
      'version', comm.record_version
    )
    FROM public.communications comm
    WHERE comm.conversation_id = c.id
  ) timeline;
  RETURN jsonb_build_object(
    'status', 'success',
    'conversation', jsonb_build_object(
      'id', c.id,
      'state', c.state,
      'subject', c.subject,
      'caseId', c.case_id,
      'caseReference', (SELECT public_ref FROM public.cases WHERE id = c.case_id),
      'assignedAdminId', c.assigned_admin_id,
      'needsAttention', c.needs_attention,
      'replyAlias', c.reply_alias,
      'version', c.record_version,
      'recipientSuppressed', suppressed
    ),
    'entries', items
  );
END; $$;

CREATE FUNCTION public.admin_conversation_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE
  s jsonb; actor uuid; op text; fp text; cached jsonb; result jsonb;
  conversation public.conversations; cs public.cases; message public.conversation_messages;
  attachment public.conversation_attachments; comm public.communications;
  tpl admin_private.communication_templates; verified text; inbound_domain text;
  reply_to text; in_reply text; refs text; subject text; body text; html text;
  latest public.conversation_messages;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  op := btrim(coalesce(p_operation, ''));
  IF op NOT IN (
    'link_case', 'unlink_case', 'assign', 'unassign', 'close', 'reopen', 'attention',
    'phone_note', 'contact_recovery', 'draft_reply', 'promote_attachment'
  ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(op, p_payload, p_version)::text);
  cached := admin_private.conversation_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF NULLIF(p_payload->>'conversationId', '')::uuid IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO conversation FROM public.conversations WHERE id = (p_payload->>'conversationId')::uuid FOR UPDATE;
  IF conversation.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF op NOT IN ('phone_note') AND (p_version IS NULL OR conversation.record_version <> p_version) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF op = 'phone_note' THEN
    IF length(btrim(coalesce(p_payload->>'note', ''))) NOT BETWEEN 3 AND 4000
      OR coalesce(p_payload->>'note', '') ~* '<[^>]+>'
      OR coalesce(p_payload->>'direction', 'NOTE') NOT IN ('INBOUND', 'OUTBOUND', 'NOTE')
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    INSERT INTO public.conversation_messages(
      conversation_id, kind, import_status, body_text, subject, created_by, received_at
    ) VALUES (
      conversation.id, 'PHONE_NOTE', 'IMPORTED', btrim(p_payload->>'note'),
      left('Phone note (' || coalesce(p_payload->>'direction', 'NOTE') || ')', 80),
      actor, coalesce((p_payload->>'occurredAt')::timestamptz, now())
    ) RETURNING * INTO message;
    UPDATE public.conversations
      SET last_activity_at = now(), updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id RETURNING * INTO conversation;
    result := jsonb_build_object('status', 'success', 'id', message.id, 'conversationId', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Phone note recorded', jsonb_build_object('operation', op, 'messageId', message.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'link_case' THEN
    IF conversation.state <> 'UNMATCHED' OR conversation.case_id IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NULLIF(p_payload->>'caseId', '')::uuid FOR UPDATE;
    IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.conversations
      SET state = 'OPEN', case_id = cs.id, customer_id = cs.customer_id, business_id = cs.business_id,
          location_id = cs.location_id, unmatched_reason = NULL, needs_attention = true,
          updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version
      RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', conversation.state);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation linked to a case', jsonb_build_object('operation', op, 'caseId', cs.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'unlink_case' THEN
    IF conversation.case_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.conversation_id = conversation.id
        AND c.template_key = 'CONVERSATION_REPLY'
        AND c.lifecycle IN ('DRAFT', 'REVIEWED', 'QUEUED')
    ) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    UPDATE public.conversations
      SET state = 'UNMATCHED', case_id = NULL, customer_id = NULL, business_id = NULL, location_id = NULL,
          unmatched_reason = 'Unlinked by Admin', needs_attention = true,
          updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version
      RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', conversation.state);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation unlinked from its case', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'assign' THEN
    UPDATE public.conversations
      SET assigned_admin_id = actor, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation assigned', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'unassign' THEN
    UPDATE public.conversations
      SET assigned_admin_id = NULL, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation unassigned', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'close' THEN
    IF conversation.state NOT IN ('UNMATCHED', 'OPEN') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.conversations
      SET state = 'CLOSED', closed_at = now(), needs_attention = false, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', 'CLOSED');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation closed', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'reopen' THEN
    IF conversation.state <> 'CLOSED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.conversations
      SET state = CASE WHEN conversation.case_id IS NULL THEN 'UNMATCHED' ELSE 'OPEN' END,
          closed_at = NULL, needs_attention = true, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', conversation.state);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation reopened', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'attention' THEN
    UPDATE public.conversations
      SET needs_attention = coalesce((p_payload->>'needsAttention')::boolean, true),
          updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'needsAttention', conversation.needs_attention);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation attention updated', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'contact_recovery' THEN
    IF conversation.case_id IS NULL OR conversation.state = 'UNMATCHED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = conversation.case_id FOR UPDATE;
    IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.case_tasks(case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy)
    VALUES (
      cs.id,
      'Contact recovery for conversation ' || left(conversation.id::text, 8),
      'ADMIN',
      CASE WHEN coalesce(p_payload->>'kind', 'CALL') = 'FOLLOW_UP' THEN 'FOLLOW_UP' ELSE 'CALL' END,
      now() + interval '2 days',
      'Conversation ' || conversation.id::text || ' contact recovery; do not change the customer email automatically.',
      'UTC',
      'MANUAL_QUEUE'
    );
    UPDATE public.conversations
      SET last_activity_at = now(), updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Contact recovery task created', jsonb_build_object('operation', op, 'caseId', cs.id)
    );
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CASE_CHANGED', 'success', cs.id, p_request, 'case',
      'Contact recovery task created from a conversation', jsonb_build_object('conversationId', conversation.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'promote_attachment' THEN
    SELECT * INTO attachment FROM public.conversation_attachments
      WHERE id = NULLIF(p_payload->>'attachmentId', '')::uuid AND conversation_id = conversation.id;
    IF attachment.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF conversation.case_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF attachment.ingestion_status <> 'CLEAN'
      OR attachment.scan_status <> 'NO_THREATS_FOUND'
      OR attachment.validation_status <> 'VALID'
      OR attachment.storage_bucket IS NULL
      OR attachment.storage_key IS NULL
    THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    UPDATE public.conversation_attachments SET promotion_state = 'RECORDED' WHERE id = attachment.id;
    UPDATE public.conversations
      SET updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', attachment.id, 'promotionState', 'RECORDED', 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Attachment recorded for evidence follow-up; it is not accepted evidence', jsonb_build_object('operation', op, 'attachmentId', attachment.id, 'caseId', conversation.case_id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'draft_reply' THEN
    IF conversation.state <> 'OPEN' OR conversation.case_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = conversation.case_id FOR UPDATE;
    IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT verified_value INTO verified
      FROM public.customer_contact_verifications
      WHERE customer_id = cs.customer_id AND channel = 'email';
    IF verified IS NULL OR admin_private.normalize_email_v1(verified) NOT LIKE '%_@_%.%' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(verified)
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    inbound_domain := lower(btrim(coalesce(p_payload->>'inboundDomain', '')));
    IF inbound_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' OR inbound_domain = 'profilerelaunch.com' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF length(btrim(coalesce(p_payload->>'bodyText', ''))) NOT BETWEEN 10 AND 4000
      OR coalesce(p_payload->>'bodyText', '') ~* '<[^>]+>'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO tpl FROM admin_private.communication_templates
      WHERE template_key = 'CONVERSATION_REPLY' ORDER BY version DESC LIMIT 1;
    IF tpl.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    SELECT * INTO latest FROM public.conversation_messages
      WHERE conversation_id = conversation.id AND kind = 'INBOUND_EMAIL' AND rfc_message_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    reply_to := conversation.reply_alias || '@' || inbound_domain;
    in_reply := latest.rfc_message_id;
    refs := nullif(left(btrim(coalesce(latest.references_header || ' ', '') || coalesce(latest.rfc_message_id, '')), 2000), '');
    subject := admin_private.render_template_v1(tpl.subject_template, jsonb_build_object('subject', coalesce(conversation.subject, 'your case')));
    body := admin_private.render_template_v1(tpl.body_text_template, jsonb_build_object('reply_body', btrim(p_payload->>'bodyText')));
    IF subject IS NULL OR body IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    html := '<p>' || replace(admin_private.escape_html_v1(body), E'\n', '<br />') || '</p>';
    INSERT INTO public.communications(
      case_id, customer_id, business_id, conversation_id, communication_type, direction, recipient, subject,
      body_text, body_html, status, lifecycle, delivery_status, template_key, template_version, author_id,
      content_version, record_version, content_locked, reply_to_address, in_reply_to, references_header
    ) VALUES (
      cs.id, cs.customer_id, cs.business_id, conversation.id, 'CONVERSATION_REPLY', 'OUTBOUND',
      admin_private.normalize_email_v1(verified), subject, body, html, 'PENDING', 'DRAFT', 'NONE',
      tpl.template_key, tpl.version, actor, 1, 1, false, reply_to, in_reply, refs
    ) RETURNING * INTO comm;
    UPDATE public.conversations
      SET last_activity_at = now(), updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object(
      'status', 'success', 'id', comm.id, 'conversationId', conversation.id,
      'version', conversation.record_version, 'communicationVersion', comm.record_version, 'lifecycle', 'DRAFT'
    );
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation reply drafted', jsonb_build_object('operation', op, 'communicationId', comm.id)
    );
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', comm.id, p_request, 'communication',
      'Conversation reply drafted', jsonb_build_object('conversationId', conversation.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  RETURN jsonb_build_object('status', 'invalid');
END; $$;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED'
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
      'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED'
    ))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.inbound_email_receive_event_v1(text, text, text, text, text, text, text, timestamptz, text),
  public.inbound_email_load_import_v1(text, text),
  public.inbound_email_import_v1(jsonb),
  public.inbound_attachment_load_import_v1(uuid),
  public.inbound_attachment_apply_v1(jsonb),
  public.inbound_attachment_mark_scan_v1(uuid, text, text, text),
  public.communication_record_rfc_message_id_v1(uuid, text),
  public.communication_apply_provider_event_v1(text, text, text, text, timestamptz, text, text),
  public.communication_load_send_v1(uuid, integer),
  public.admin_conversation_list_v1(text, text),
  public.admin_conversation_detail_v1(text, uuid),
  public.admin_conversation_command_v1(text, uuid, text, jsonb, integer),
  public.admin_audit_list_v1(text, bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inbound_email_receive_event_v1(text, text, text, text, text, text, text, timestamptz, text),
  public.inbound_email_load_import_v1(text, text),
  public.inbound_email_import_v1(jsonb),
  public.inbound_attachment_load_import_v1(uuid),
  public.inbound_attachment_apply_v1(jsonb),
  public.inbound_attachment_mark_scan_v1(uuid, text, text, text),
  public.communication_record_rfc_message_id_v1(uuid, text),
  public.communication_apply_provider_event_v1(text, text, text, text, timestamptz, text, text),
  public.communication_load_send_v1(uuid, integer),
  public.admin_conversation_list_v1(text, text),
  public.admin_conversation_detail_v1(text, uuid),
  public.admin_conversation_command_v1(text, uuid, text, jsonb, integer),
  public.admin_audit_list_v1(text, bigint, text, text)
  TO service_role;

COMMIT;
