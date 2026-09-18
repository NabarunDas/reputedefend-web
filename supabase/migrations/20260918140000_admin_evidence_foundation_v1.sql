BEGIN;

CREATE TABLE public.evidence_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  request_text text NOT NULL CHECK (length(btrim(request_text)) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FULFILLED','CANCELLED')),
  due_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  record_version integer NOT NULL DEFAULT 1
);
CREATE INDEX evidence_requests_case_idx ON public.evidence_requests(case_id, created_at DESC, id DESC);

CREATE TABLE public.case_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  evidence_request_id uuid REFERENCES public.evidence_requests(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record_version integer NOT NULL DEFAULT 1
);
CREATE INDEX case_documents_case_idx ON public.case_documents(case_id, created_at DESC, id DESC);
CREATE INDEX case_documents_request_idx ON public.case_documents(evidence_request_id) WHERE evidence_request_id IS NOT NULL;

CREATE TABLE public.case_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.case_documents(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 255 AND original_filename !~ '[\\/]'),
  declared_content_type text NOT NULL CHECK (declared_content_type IN (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  declared_size_bytes bigint NOT NULL CHECK (declared_size_bytes BETWEEN 1 AND 10485760),
  storage_provider text NOT NULL DEFAULT 'S3' CHECK (storage_provider = 'S3'),
  storage_bucket text NOT NULL CHECK (length(storage_bucket) BETWEEN 3 AND 63),
  storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^cases/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/versions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  upload_status text NOT NULL DEFAULT 'PENDING_UPLOAD' CHECK (upload_status IN ('PENDING_UPLOAD','UPLOADED','FAILED')),
  scan_status text NOT NULL DEFAULT 'PENDING' CHECK (scan_status IN ('PENDING','NO_THREATS_FOUND','THREATS_FOUND','UNSUPPORTED','ACCESS_DENIED','FAILED')),
  scan_checked_at timestamptz,
  validation_status text NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','VALID','INVALID','ERROR')),
  validation_error text CHECK (validation_error IS NULL OR length(validation_error) BETWEEN 1 AND 500),
  review_status text NOT NULL DEFAULT 'UNREVIEWED' CHECK (review_status IN ('UNREVIEWED','ACCEPTED','REJECTED','SUPERSEDED')),
  review_note text CHECK (review_note IS NULL OR length(review_note) BETWEEN 1 AND 2000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  customer_visible boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  validated_at timestamptz,
  UNIQUE (document_id, version_number),
  CHECK (validation_status <> 'VALID' OR scan_status = 'NO_THREATS_FOUND'),
  CHECK (customer_visible = false OR (scan_status = 'NO_THREATS_FOUND' AND validation_status = 'VALID' AND review_status = 'ACCEPTED'))
);
CREATE INDEX case_document_versions_document_idx ON public.case_document_versions(document_id, version_number DESC);

CREATE TABLE public.case_document_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES public.case_documents(id) ON DELETE RESTRICT,
  version_id uuid REFERENCES public.case_document_versions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('UPLOAD_BEGUN','UPLOAD_FINALIZED','UPLOAD_FAILED','SCAN_REFRESHED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_document_events_document_idx ON public.case_document_events(document_id, id DESC);
CREATE INDEX case_document_events_case_idx ON public.case_document_events(case_id, id DESC);

CREATE TABLE admin_private.evidence_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.evidence_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evidence_requests, public.case_documents, public.case_document_versions, public.case_document_events, admin_private.evidence_command_receipts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.case_document_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.bump_evidence_request_version_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_version := OLD.record_version + 1; RETURN NEW; END; $$;
CREATE TRIGGER evidence_requests_record_version BEFORE UPDATE ON public.evidence_requests FOR EACH ROW EXECUTE FUNCTION admin_private.bump_evidence_request_version_v1();
CREATE FUNCTION admin_private.bump_case_document_version_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_version := OLD.record_version + 1; NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER case_documents_record_version BEFORE UPDATE ON public.case_documents FOR EACH ROW EXECUTE FUNCTION admin_private.bump_case_document_version_v1();
REVOKE ALL ON FUNCTION admin_private.bump_evidence_request_version_v1(), admin_private.bump_case_document_version_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.reject_evidence_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Evidence events are append-only'; END; $$;
CREATE TRIGGER case_document_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.case_document_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_evidence_event_change_v1();
REVOKE ALL ON FUNCTION admin_private.reject_evidence_event_change_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.evidence_extension_ok_v1(p_filename text, p_content_type text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT
    p_filename IS NOT NULL AND p_content_type IS NOT NULL
    AND length(btrim(p_filename)) BETWEEN 1 AND 255
    AND p_filename !~ '[\\/]'
    AND (
      (lower(substring(p_filename from '\.[^.]+$')) = '.pdf' AND p_content_type = 'application/pdf')
      OR (lower(substring(p_filename from '\.[^.]+$')) IN ('.jpg', '.jpeg') AND p_content_type = 'image/jpeg')
      OR (lower(substring(p_filename from '\.[^.]+$')) = '.png' AND p_content_type = 'image/png')
      OR (lower(substring(p_filename from '\.[^.]+$')) = '.webp' AND p_content_type = 'image/webp')
      OR (lower(substring(p_filename from '\.[^.]+$')) = '.docx' AND p_content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    );
$$;
REVOKE ALL ON FUNCTION admin_private.evidence_extension_ok_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.evidence_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text, p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.evidence_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.evidence_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.evidence_receipt_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_evidence_version_v1(p_token text, p_case uuid, p_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.case_document_versions; d public.case_documents;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_case IS NULL OR p_version IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version;
  IF v.id IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF d.id IS NULL OR d.case_id <> p_case THEN RETURN jsonb_build_object('missing', true); END IF;
  RETURN jsonb_build_object(
    'documentId', d.id, 'versionId', v.id, 'versionNumber', v.version_number,
    'storageKey', v.storage_key, 'storageBucket', v.storage_bucket,
    'uploadStatus', v.upload_status, 'scanStatus', v.scan_status, 'validationStatus', v.validation_status,
    'contentType', v.declared_content_type, 'sizeBytes', v.declared_size_bytes, 'customerVisible', v.customer_visible
  );
END; $$;

CREATE FUNCTION public.admin_evidence_begin_v1(
  p_token text, p_request uuid, p_case uuid, p_document uuid, p_filename text, p_content_type text,
  p_size bigint, p_title text, p_bucket text, p_evidence_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.cases; d public.case_documents; req public.evidence_requests;
  actor uuid; fp text; cached jsonb; result jsonb; version_id uuid; version_no integer; object_key text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_filename IS NULL OR p_content_type IS NULL OR p_size IS NULL OR p_title IS NULL OR p_bucket IS NULL
    OR length(btrim(p_title)) NOT BETWEEN 1 AND 200 OR length(p_bucket) NOT BETWEEN 3 AND 63
    OR p_size < 1 OR p_size > 10485760
    OR NOT admin_private.evidence_extension_ok_v1(p_filename, p_content_type)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_case, p_document, p_filename, p_content_type, p_size, p_title, p_bucket, p_evidence_request)::text);
  cached := admin_private.evidence_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_evidence_request IS NOT NULL THEN
    SELECT * INTO req FROM public.evidence_requests WHERE id = p_evidence_request AND case_id = c.id;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  END IF;
  IF p_document IS NULL THEN
    INSERT INTO public.case_documents(case_id, evidence_request_id, title, created_by)
    VALUES (c.id, p_evidence_request, btrim(p_title), actor) RETURNING * INTO d;
    version_no := 1;
  ELSE
    SELECT * INTO d FROM public.case_documents WHERE id = p_document FOR UPDATE;
    IF d.id IS NULL OR d.case_id <> c.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    SELECT coalesce(max(version_number), 0) + 1 INTO version_no FROM public.case_document_versions WHERE document_id = d.id;
    UPDATE public.case_documents SET title = btrim(p_title) WHERE id = d.id;
  END IF;
  version_id := gen_random_uuid();
  object_key := 'cases/' || c.id::text || '/documents/' || d.id::text || '/versions/' || version_id::text;
  INSERT INTO public.case_document_versions(
    id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
    storage_provider, storage_bucket, storage_key, created_by
  ) VALUES (
    version_id, d.id, version_no, btrim(p_filename), p_content_type, p_size, 'S3', p_bucket, object_key, actor
  );
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (c.id, d.id, version_id, actor, 'UPLOAD_BEGUN', jsonb_build_object('versionNumber', version_no, 'contentType', p_content_type, 'sizeBytes', p_size));
  PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Evidence upload started', jsonb_build_object('documentId', d.id, 'versionId', version_id, 'operation', 'begin'));
  result := jsonb_build_object(
    'status', 'success', 'caseId', c.id, 'documentId', d.id, 'versionId', version_id,
    'versionNumber', version_no, 'storageKey', object_key, 'storageBucket', p_bucket,
    'contentType', p_content_type, 'maxBytes', 10485760
  );
  INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_evidence_finalize_v1(p_token text, p_request uuid, p_case uuid, p_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.cases; d public.case_documents; v public.case_document_versions;
  actor uuid; fp text; cached jsonb; result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_case, p_version, 'finalize')::text);
  cached := admin_private.evidence_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id FOR UPDATE;
  IF d.id IS NULL OR d.case_id <> p_case THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO c FROM public.cases WHERE id = d.case_id;
  IF v.upload_status = 'UPLOADED' THEN
    result := jsonb_build_object('status', 'success', 'documentId', d.id, 'versionId', v.id, 'uploadStatus', v.upload_status, 'scanStatus', v.scan_status, 'validationStatus', v.validation_status);
    INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF v.upload_status <> 'PENDING_UPLOAD' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  UPDATE public.case_document_versions
    SET upload_status = 'UPLOADED', uploaded_at = now(), scan_status = 'PENDING', validation_status = 'PENDING', validation_error = NULL
    WHERE id = v.id;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (c.id, d.id, v.id, actor, 'UPLOAD_FINALIZED', jsonb_build_object('versionNumber', v.version_number));
  PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Evidence upload finalized', jsonb_build_object('documentId', d.id, 'versionId', v.id, 'operation', 'finalize'));
  result := jsonb_build_object('status', 'success', 'documentId', d.id, 'versionId', v.id, 'uploadStatus', 'UPLOADED', 'scanStatus', 'PENDING', 'validationStatus', 'PENDING');
  INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_evidence_refresh_scan_v1(
  p_token text, p_request uuid, p_case uuid, p_version uuid, p_scan text, p_validation text, p_validation_error text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.cases; d public.case_documents; v public.case_document_versions;
  actor uuid; fp text; cached jsonb; result jsonb; validated_at timestamptz;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL
    OR p_scan IS NULL OR p_scan NOT IN ('PENDING','NO_THREATS_FOUND','THREATS_FOUND','UNSUPPORTED','ACCESS_DENIED','FAILED')
    OR p_validation IS NULL OR p_validation NOT IN ('PENDING','VALID','INVALID','ERROR')
    OR (p_validation = 'VALID' AND p_scan <> 'NO_THREATS_FOUND')
    OR (p_scan <> 'NO_THREATS_FOUND' AND p_validation <> 'PENDING')
    OR (p_validation IN ('INVALID','ERROR') AND (p_validation_error IS NULL OR length(btrim(p_validation_error)) NOT BETWEEN 1 AND 500))
    OR (p_validation IN ('PENDING','VALID') AND p_validation_error IS NOT NULL)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_case, p_version, 'refresh_scan', p_scan, p_validation, p_validation_error)::text);
  cached := admin_private.evidence_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id FOR UPDATE;
  IF d.id IS NULL OR d.case_id <> p_case THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO c FROM public.cases WHERE id = d.case_id;
  IF v.upload_status <> 'UPLOADED' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  validated_at := CASE WHEN p_validation IN ('VALID','INVALID','ERROR') THEN now() ELSE NULL END;
  UPDATE public.case_document_versions
    SET scan_status = p_scan, scan_checked_at = now(), validation_status = p_validation,
        validation_error = CASE WHEN p_validation IN ('INVALID','ERROR') THEN btrim(p_validation_error) ELSE NULL END,
        validated_at = coalesce(validated_at, case_document_versions.validated_at)
    WHERE id = v.id;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (c.id, d.id, v.id, actor, 'SCAN_REFRESHED', jsonb_build_object('scanStatus', p_scan, 'validationStatus', p_validation));
  PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Evidence scan refreshed', jsonb_build_object('documentId', d.id, 'versionId', v.id, 'operation', 'refresh_scan', 'scanStatus', p_scan, 'validationStatus', p_validation));
  result := jsonb_build_object('status', 'success', 'documentId', d.id, 'versionId', v.id, 'uploadStatus', 'UPLOADED', 'scanStatus', p_scan, 'validationStatus', p_validation);
  INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.admin_evidence_begin_v1(text, uuid, uuid, uuid, text, text, bigint, text, text, uuid),
  public.admin_evidence_finalize_v1(text, uuid, uuid, uuid),
  public.admin_evidence_refresh_scan_v1(text, uuid, uuid, uuid, text, text, text),
  public.admin_evidence_version_v1(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_evidence_begin_v1(text, uuid, uuid, uuid, text, text, bigint, text, text, uuid),
  public.admin_evidence_finalize_v1(text, uuid, uuid, uuid),
  public.admin_evidence_refresh_scan_v1(text, uuid, uuid, uuid, text, text, text),
  public.admin_evidence_version_v1(text, uuid, uuid)
  TO service_role;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED'
));
CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN ('SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED','MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED'))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

COMMIT;
