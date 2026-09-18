BEGIN;

ALTER TABLE public.case_document_versions
  ADD COLUMN record_version integer NOT NULL DEFAULT 1;
CREATE FUNCTION admin_private.bump_case_document_version_record_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_version := OLD.record_version + 1; RETURN NEW; END; $$;
CREATE TRIGGER case_document_versions_record_version BEFORE UPDATE ON public.case_document_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.bump_case_document_version_record_v1();
REVOKE ALL ON FUNCTION admin_private.bump_case_document_version_record_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX case_document_events_version_idx ON public.case_document_events(version_id);
CREATE UNIQUE INDEX case_document_versions_one_visible_idx ON public.case_document_versions(document_id) WHERE customer_visible;

CREATE FUNCTION admin_private.enforce_open_evidence_request_link_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE req public.evidence_requests;
BEGIN
  IF NEW.evidence_request_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO req FROM public.evidence_requests WHERE id = NEW.evidence_request_id;
  IF req.id IS NULL OR req.case_id <> NEW.case_id OR req.status <> 'OPEN' THEN
    RAISE EXCEPTION 'Evidence request is not an open request for this case';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_documents_open_request_link
  BEFORE INSERT OR UPDATE OF evidence_request_id, case_id ON public.case_documents
  FOR EACH ROW EXECUTE FUNCTION admin_private.enforce_open_evidence_request_link_v1();
REVOKE ALL ON FUNCTION admin_private.enforce_open_evidence_request_link_v1() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.case_document_events DROP CONSTRAINT case_document_events_event_check;
ALTER TABLE public.case_document_events ADD CONSTRAINT case_document_events_event_check CHECK (event IN (
  'UPLOAD_BEGUN','UPLOAD_FINALIZED','UPLOAD_FAILED','SCAN_REFRESHED',
  'REVIEW_ACCEPTED','REVIEW_REJECTED','VERSION_SUPERSEDED','VISIBILITY_CHANGED','ACCESS_VIEWED','ACCESS_DOWNLOADED'
));

CREATE OR REPLACE FUNCTION public.admin_evidence_version_v1(p_token text, p_case uuid, p_version uuid)
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
    'contentType', v.declared_content_type, 'sizeBytes', v.declared_size_bytes, 'customerVisible', v.customer_visible,
    'originalFilename', v.original_filename, 'recordVersion', v.record_version, 'reviewStatus', v.review_status
  );
END; $$;

CREATE FUNCTION public.admin_evidence_case_v1(p_token text, p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cases; requests jsonb; documents jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_case IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  IF c.id IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'title', r.title, 'requestText', r.request_text, 'status', r.status,
    'dueAt', r.due_at, 'createdAt', r.created_at, 'fulfilledAt', r.fulfilled_at, 'version', r.record_version
  ) ORDER BY r.created_at DESC, r.id DESC), '[]') INTO requests
  FROM public.evidence_requests r WHERE r.case_id = c.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'title', d.title, 'evidenceRequestId', d.evidence_request_id,
    'createdAt', d.created_at, 'updatedAt', d.updated_at, 'version', d.record_version,
    'versions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'versionNumber', v.version_number, 'originalFilename', v.original_filename,
        'contentType', v.declared_content_type, 'sizeBytes', v.declared_size_bytes,
        'uploadStatus', v.upload_status, 'scanStatus', v.scan_status, 'validationStatus', v.validation_status,
        'validationError', v.validation_error, 'reviewStatus', v.review_status, 'reviewNote', v.review_note,
        'customerVisible', v.customer_visible, 'createdAt', v.created_at, 'uploadedAt', v.uploaded_at,
        'validatedAt', v.validated_at, 'reviewedAt', v.reviewed_at, 'recordVersion', v.record_version
      ) ORDER BY v.version_number DESC), '[]')
      FROM public.case_document_versions v WHERE v.document_id = d.id
    )
  ) ORDER BY d.created_at DESC, d.id DESC), '[]') INTO documents
  FROM public.case_documents d WHERE d.case_id = c.id;
  RETURN jsonb_build_object('caseId', c.id, 'reference', c.public_ref, 'requests', requests, 'documents', documents);
END; $$;

CREATE FUNCTION public.admin_evidence_queue_v1(
  p_token text, p_filter text DEFAULT 'needs_review', p_before_time timestamptz DEFAULT NULL, p_before_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_filter IS NULL OR p_filter NOT IN ('needs_review','scanning','blocked','accepted','rejected','all')
    OR (p_before_time IS NULL) <> (p_before_id IS NULL)
    THEN RAISE EXCEPTION 'Invalid evidence filter'; END IF;
  SELECT coalesce(jsonb_agg(x.data ORDER BY x.sort_at DESC, x.id DESC), '[]') INTO result FROM (
    SELECT v.id, coalesce(v.uploaded_at, v.created_at) AS sort_at, jsonb_build_object(
      'caseId', c.id, 'reference', c.public_ref, 'client', u.full_name, 'business', b.display_name,
      'documentId', d.id, 'versionId', v.id, 'title', d.title, 'filename', v.original_filename,
      'contentType', v.declared_content_type, 'sizeBytes', v.declared_size_bytes,
      'scanStatus', v.scan_status, 'validationStatus', v.validation_status, 'reviewStatus', v.review_status,
      'customerVisible', v.customer_visible, 'uploadedAt', coalesce(v.uploaded_at, v.created_at)
    ) AS data
    FROM public.case_document_versions v
    JOIN public.case_documents d ON d.id = v.document_id
    JOIN public.cases c ON c.id = d.case_id
    JOIN public.customers u ON u.id = c.customer_id
    JOIN public.businesses b ON b.id = c.business_id
    WHERE (
      (p_filter = 'needs_review' AND v.upload_status = 'UPLOADED' AND v.scan_status = 'NO_THREATS_FOUND' AND v.validation_status = 'VALID' AND v.review_status = 'UNREVIEWED')
      OR (p_filter = 'scanning' AND v.upload_status = 'UPLOADED' AND v.scan_status = 'PENDING')
      OR (p_filter = 'blocked' AND v.upload_status = 'UPLOADED' AND (v.scan_status IN ('THREATS_FOUND','FAILED','UNSUPPORTED','ACCESS_DENIED') OR v.validation_status IN ('INVALID','ERROR')))
      OR (p_filter = 'accepted' AND v.review_status = 'ACCEPTED')
      OR (p_filter = 'rejected' AND v.review_status = 'REJECTED')
      OR (p_filter = 'all')
    )
    AND (p_before_time IS NULL OR (coalesce(v.uploaded_at, v.created_at), v.id) < (p_before_time, p_before_id))
    ORDER BY coalesce(v.uploaded_at, v.created_at) DESC, v.id DESC
    LIMIT 51
  ) x;
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_evidence_request_v1(
  p_token text, p_request uuid, p_case uuid, p_id uuid, p_version integer, p_operation text,
  p_title text, p_text text, p_due timestamptz, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.cases; req public.evidence_requests; actor uuid; fp text; cached jsonb; result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create','fulfill','cancel')
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_operation = 'create' THEN
    IF p_id IS NOT NULL OR p_version IS NOT NULL
      OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200
      OR p_text IS NULL OR length(btrim(p_text)) NOT BETWEEN 1 AND 4000
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  ELSE
    IF p_id IS NULL OR p_version IS NULL OR p_version < 1
      OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 1000
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  END IF;
  fp := md5(jsonb_build_array(p_case, p_id, p_version, p_operation, p_title, p_text, p_due, p_note)::text);
  cached := admin_private.evidence_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_operation = 'create' THEN
    INSERT INTO public.evidence_requests(case_id, title, request_text, due_at, created_by)
    VALUES (c.id, btrim(p_title), btrim(p_text), p_due, actor) RETURNING * INTO req;
  ELSE
    SELECT * INTO req FROM public.evidence_requests WHERE id = p_id FOR UPDATE;
    IF req.id IS NULL OR req.case_id <> c.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF req.record_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF req.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF p_operation = 'fulfill' THEN
      UPDATE public.evidence_requests SET status = 'FULFILLED', fulfilled_at = now() WHERE id = req.id RETURNING * INTO req;
    ELSE
      UPDATE public.evidence_requests SET status = 'CANCELLED' WHERE id = req.id RETURNING * INTO req;
    END IF;
  END IF;
  PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case',
    CASE p_operation WHEN 'create' THEN 'Evidence request created' WHEN 'fulfill' THEN btrim(p_note) ELSE btrim(p_note) END,
    jsonb_build_object('operation', p_operation, 'requestId', req.id));
  result := jsonb_build_object('status', 'success', 'id', req.id, 'version', req.record_version, 'requestStatus', req.status);
  INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_evidence_review_v1(
  p_token text, p_request uuid, p_case uuid, p_version uuid, p_expected integer, p_operation text, p_note text, p_visible boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.cases; d public.case_documents; v public.case_document_versions; other public.case_document_versions;
  actor uuid; fp text; cached jsonb; result jsonb; visible boolean;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_expected IS NULL OR p_expected < 1
    OR p_operation IS NULL OR p_operation NOT IN ('accept','reject','set_visibility')
    OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 2000
    OR (p_operation = 'set_visibility' AND p_visible IS NULL)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_case, p_version, p_expected, p_operation, p_note, p_visible)::text);
  cached := admin_private.evidence_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id FOR UPDATE;
  IF d.id IS NULL OR d.case_id <> p_case THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO c FROM public.cases WHERE id = d.case_id FOR UPDATE;
  IF v.record_version <> p_expected THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF v.review_status = 'SUPERSEDED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF p_operation IN ('accept','reject') THEN
    IF v.upload_status <> 'UPLOADED' OR v.scan_status <> 'NO_THREATS_FOUND' OR v.validation_status <> 'VALID'
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  END IF;
  IF p_operation = 'accept' THEN
    IF v.review_status = 'ACCEPTED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    FOR other IN SELECT * FROM public.case_document_versions WHERE document_id = d.id AND id <> v.id AND review_status = 'ACCEPTED' FOR UPDATE LOOP
      UPDATE public.case_document_versions SET review_status = 'SUPERSEDED', customer_visible = false WHERE id = other.id;
      INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
      VALUES (c.id, d.id, other.id, actor, 'VERSION_SUPERSEDED', jsonb_build_object('replacedBy', v.id));
    END LOOP;
    UPDATE public.case_document_versions
      SET review_status = 'ACCEPTED', review_note = btrim(p_note), reviewed_by = actor, reviewed_at = now()
      WHERE id = v.id RETURNING * INTO v;
    INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
    VALUES (c.id, d.id, v.id, actor, 'REVIEW_ACCEPTED', jsonb_build_object('versionNumber', v.version_number));
  ELSIF p_operation = 'reject' THEN
    UPDATE public.case_document_versions
      SET review_status = 'REJECTED', customer_visible = false, review_note = btrim(p_note), reviewed_by = actor, reviewed_at = now()
      WHERE id = v.id RETURNING * INTO v;
    INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
    VALUES (c.id, d.id, v.id, actor, 'REVIEW_REJECTED', jsonb_build_object('versionNumber', v.version_number));
  ELSE
    visible := p_visible;
    IF visible AND (v.scan_status <> 'NO_THREATS_FOUND' OR v.validation_status <> 'VALID' OR v.review_status <> 'ACCEPTED')
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF visible THEN
      FOR other IN SELECT * FROM public.case_document_versions WHERE document_id = d.id AND id <> v.id AND customer_visible FOR UPDATE LOOP
        UPDATE public.case_document_versions SET customer_visible = false WHERE id = other.id;
        INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
        VALUES (c.id, d.id, other.id, actor, 'VISIBILITY_CHANGED', jsonb_build_object('customerVisible', false));
      END LOOP;
    END IF;
    UPDATE public.case_document_versions SET customer_visible = visible WHERE id = v.id RETURNING * INTO v;
    INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
    VALUES (c.id, d.id, v.id, actor, 'VISIBILITY_CHANGED', jsonb_build_object('customerVisible', visible));
  END IF;
  PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', btrim(p_note),
    jsonb_build_object('operation', p_operation, 'documentId', d.id, 'versionId', v.id, 'reviewStatus', v.review_status, 'customerVisible', v.customer_visible));
  result := jsonb_build_object('status', 'success', 'id', v.id, 'reviewStatus', v.review_status, 'customerVisible', v.customer_visible, 'recordVersion', v.record_version);
  INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_evidence_access_v1(
  p_token text, p_request uuid, p_case uuid, p_version uuid, p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; c public.cases; d public.case_documents; v public.case_document_versions;
  actor uuid; fp text; cached jsonb; result jsonb; event_name text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_action IS NULL OR p_action NOT IN ('view','download')
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_case, p_version, p_action)::text);
  cached := admin_private.evidence_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF d.id IS NULL OR d.case_id <> p_case THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO c FROM public.cases WHERE id = d.case_id;
  IF v.upload_status <> 'UPLOADED' OR v.scan_status <> 'NO_THREATS_FOUND' OR v.validation_status <> 'VALID'
    THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF p_action = 'view' AND v.declared_content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  event_name := CASE p_action WHEN 'view' THEN 'ACCESS_VIEWED' ELSE 'ACCESS_DOWNLOADED' END;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (c.id, d.id, v.id, actor, event_name, jsonb_build_object('contentType', v.declared_content_type));
  PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case',
    CASE p_action WHEN 'view' THEN 'Evidence viewed' ELSE 'Evidence downloaded' END,
    jsonb_build_object('operation', p_action, 'documentId', d.id, 'versionId', v.id));
  result := jsonb_build_object('status', 'success', 'documentId', d.id, 'versionId', v.id, 'action', p_action);
  INSERT INTO admin_private.evidence_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.admin_evidence_case_v1(text, uuid),
  public.admin_evidence_queue_v1(text, text, timestamptz, uuid),
  public.admin_evidence_request_v1(text, uuid, uuid, uuid, integer, text, text, text, timestamptz, text),
  public.admin_evidence_review_v1(text, uuid, uuid, uuid, integer, text, text, boolean),
  public.admin_evidence_access_v1(text, uuid, uuid, uuid, text),
  public.admin_evidence_version_v1(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_evidence_case_v1(text, uuid),
  public.admin_evidence_queue_v1(text, text, timestamptz, uuid),
  public.admin_evidence_request_v1(text, uuid, uuid, uuid, integer, text, text, text, timestamptz, text),
  public.admin_evidence_review_v1(text, uuid, uuid, uuid, integer, text, text, boolean),
  public.admin_evidence_access_v1(text, uuid, uuid, uuid, text),
  public.admin_evidence_version_v1(text, uuid, uuid)
  TO service_role;

COMMIT;
