BEGIN;

ALTER TABLE public.case_document_versions
  ADD COLUMN submission_source text NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN customer_action_id uuid REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  ADD COLUMN customer_evidence_request_id uuid REFERENCES public.evidence_requests(id) ON DELETE RESTRICT;

ALTER TABLE public.case_document_versions
  ADD CONSTRAINT case_document_versions_submission_source_check
    CHECK (submission_source IN ('ADMIN', 'CUSTOMER')),
  ADD CONSTRAINT case_document_versions_customer_provenance_check
    CHECK (
      (submission_source = 'ADMIN' AND customer_action_id IS NULL AND customer_evidence_request_id IS NULL)
      OR (submission_source = 'CUSTOMER' AND customer_action_id IS NOT NULL AND customer_evidence_request_id IS NOT NULL)
    );

CREATE UNIQUE INDEX case_document_versions_one_customer_request_idx
  ON public.case_document_versions (customer_evidence_request_id)
  WHERE submission_source = 'CUSTOMER'
    AND upload_status IN ('PENDING_UPLOAD', 'UPLOADED');
CREATE INDEX case_document_versions_customer_action_idx
  ON public.case_document_versions (customer_action_id)
  WHERE customer_action_id IS NOT NULL;

CREATE TABLE admin_private.customer_evidence_upload_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.customer_evidence_upload_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.customer_evidence_upload_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.customer_evidence_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.customer_evidence_upload_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.customer_evidence_upload_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.customer_evidence_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.customer_open_evidence_requests_v1(p_case uuid, p_action uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_case IS NULL THEN RETURN '[]'::jsonb; END IF;
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
  WHERE r.case_id = p_case AND r.status = 'OPEN';
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION admin_private.customer_open_evidence_requests_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_case_pack_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions;
  cs public.cases; b public.businesses; loc public.locations; p public.case_prepared_packs; items jsonb; requests jsonb;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  requests := admin_private.customer_open_evidence_requests_v1(a.case_id, a.id);
  SELECT * INTO p FROM public.case_prepared_packs
    WHERE case_id = a.case_id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
    LIMIT 1;
  IF p.id IS NULL OR NOT admin_private.pack_publishable_v1(p.id) THEN
    RETURN jsonb_build_object(
      'kind', a.kind,
      'caseReference', cs.public_ref,
      'businessName', b.display_name,
      'locationName', loc.location_name,
      'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
      'pack', NULL,
      'evidenceRequests', requests
    );
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'versionId', i.version_id,
    'position', i.position,
    'documentTitle', i.document_title,
    'originalFilename', i.original_filename,
    'contentType', i.content_type,
    'sizeBytes', i.size_bytes
  ) ORDER BY i.position), '[]') INTO items
  FROM public.case_prepared_pack_items i
  INNER JOIN public.case_document_versions v ON v.id = i.version_id
  WHERE i.pack_id = p.id
    AND v.customer_visible IS TRUE
    AND v.upload_status = 'UPLOADED'
    AND v.scan_status = 'NO_THREATS_FOUND'
    AND v.validation_status = 'VALID'
    AND v.review_status = 'ACCEPTED';
  RETURN jsonb_build_object(
    'kind', a.kind,
    'caseReference', cs.public_ref,
    'businessName', b.display_name,
    'locationName', loc.location_name,
    'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
    'pack', jsonb_build_object(
      'packNumber', p.pack_number,
      'publishedAt', p.published_at,
      'items', items
    ),
    'evidenceRequests', requests
  );
END; $$;

CREATE FUNCTION public.customer_evidence_begin_v1(
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
  IF req.id IS NULL OR req.case_id <> a.case_id OR req.status <> 'OPEN' THEN
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

CREATE FUNCTION public.customer_evidence_upload_version_v1(p_token_hash text, p_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions; d public.case_documents; v public.case_document_versions; req public.evidence_requests;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL OR p_version IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version;
  IF v.id IS NULL OR v.submission_source <> 'CUSTOMER' OR v.customer_action_id IS DISTINCT FROM a.id THEN RETURN NULL; END IF;
  IF v.upload_status NOT IN ('PENDING_UPLOAD', 'UPLOADED') THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF d.id IS NULL OR d.case_id <> a.case_id THEN RETURN NULL; END IF;
  SELECT * INTO req FROM public.evidence_requests WHERE id = coalesce(v.customer_evidence_request_id, d.evidence_request_id);
  IF req.id IS NULL OR req.case_id <> a.case_id OR req.status <> 'OPEN' THEN RETURN NULL; END IF;
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

CREATE FUNCTION public.customer_evidence_finalize_v1(p_token_hash text, p_request uuid, p_version uuid)
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
  IF req.id IS NULL OR req.case_id <> a.case_id OR req.status <> 'OPEN' THEN
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

CREATE OR REPLACE FUNCTION public.admin_evidence_case_v1(p_token text, p_case uuid)
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
        'validatedAt', v.validated_at, 'reviewedAt', v.reviewed_at, 'recordVersion', v.record_version,
        'submissionSource', v.submission_source
      ) ORDER BY v.version_number DESC), '[]')
      FROM public.case_document_versions v WHERE v.document_id = d.id
    )
  ) ORDER BY d.created_at DESC, d.id DESC), '[]') INTO documents
  FROM public.case_documents d WHERE d.case_id = c.id;
  RETURN jsonb_build_object('caseId', c.id, 'reference', c.public_ref, 'requests', requests, 'documents', documents);
END; $$;

REVOKE ALL ON FUNCTION public.customer_evidence_begin_v1(text, uuid, uuid, text, text, bigint, text),
  public.customer_evidence_upload_version_v1(text, uuid),
  public.customer_evidence_finalize_v1(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_evidence_begin_v1(text, uuid, uuid, text, text, bigint, text),
  public.customer_evidence_upload_version_v1(text, uuid),
  public.customer_evidence_finalize_v1(text, uuid, uuid)
  TO service_role;

COMMIT;
