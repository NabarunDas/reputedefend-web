BEGIN;
-- CUSTOMER-EVIDENCE-MULTI: one secure email link; one requested item per
-- evidence record. Keep the same session/OTP, file validation, S3 storage,
-- scan, administrative evidence review and durable event/audit rules.
-- Legacy v1 upload function remains unchanged. Its original one-active-file
-- constraint remains for older clients; the new item uploads get one active
-- file per reviewed item instead.
ALTER TABLE public.case_document_versions
  ADD COLUMN evidence_item_title text;
ALTER TABLE public.case_document_versions
  ADD CONSTRAINT case_document_versions_evidence_item_title_check
  CHECK (evidence_item_title IS NULL OR char_length(btrim(evidence_item_title)) BETWEEN 1 AND 200);
DROP INDEX public.case_document_versions_one_customer_request_idx;
CREATE UNIQUE INDEX case_document_versions_one_customer_request_idx
  ON public.case_document_versions(customer_evidence_request_id)
  WHERE submission_source = 'CUSTOMER'
    AND upload_status IN ('PENDING_UPLOAD','UPLOADED')
    AND evidence_item_title IS NULL;
CREATE UNIQUE INDEX case_document_versions_one_customer_item_idx
  ON public.case_document_versions(customer_evidence_request_id, evidence_item_title)
  WHERE submission_source = 'CUSTOMER'
    AND upload_status IN ('PENDING_UPLOAD','UPLOADED')
    AND evidence_item_title IS NOT NULL;

CREATE OR REPLACE FUNCTION admin_private.customer_open_evidence_requests_v1(p_case uuid, p_action uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    'submittedAt', uploaded.uploaded_at,
    -- Individual document slots, derived from the same reviewed evidence
    -- request the customer email names. Legacy singular fields remain intact.
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'title', needed.title,
        'submissionStatus', CASE
          WHEN item_uploaded.id IS NOT NULL THEN 'AWAITING_REVIEW'
          WHEN item_pending.id IS NOT NULL THEN 'UPLOAD_PENDING'
          ELSE 'NOT_SUBMITTED'
        END,
        'filename', coalesce(item_uploaded.original_filename, item_pending.original_filename),
        'submittedAt', item_uploaded.uploaded_at
      ) ORDER BY needed.ordinal), '[]'::jsonb)
      FROM (
        SELECT btrim(part) AS title, ordinal
        FROM unnest(string_to_array(r.title, '; ')) WITH ORDINALITY AS parts(part, ordinal)
        WHERE btrim(part) <> ''
      ) needed
      LEFT JOIN LATERAL (
        SELECT cv.id, cv.original_filename, cv.uploaded_at
        FROM public.case_document_versions cv
        JOIN public.case_documents d ON d.id = cv.document_id
        WHERE cv.customer_evidence_request_id = r.id
          AND cv.submission_source = 'CUSTOMER'
          AND cv.upload_status = 'UPLOADED'
          AND coalesce(cv.evidence_item_title, d.title) = needed.title
        ORDER BY cv.uploaded_at, cv.id
        LIMIT 1
      ) item_uploaded ON TRUE
      LEFT JOIN LATERAL (
        SELECT cv.id, cv.original_filename
        FROM public.case_document_versions cv
        JOIN public.case_documents d ON d.id = cv.document_id
        WHERE cv.customer_evidence_request_id = r.id
          AND cv.submission_source = 'CUSTOMER'
          AND cv.upload_status = 'PENDING_UPLOAD'
          AND cv.customer_action_id = p_action
          AND coalesce(cv.evidence_item_title, d.title) = needed.title
        ORDER BY cv.created_at, cv.id
        LIMIT 1
      ) item_pending ON TRUE
    )
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
END; $function$;

CREATE FUNCTION public.customer_evidence_begin_v2(p_token_hash text, p_request uuid, p_evidence_request uuid, p_item_title text, p_filename text, p_content_type text, p_size bigint, p_bucket text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.customer_actions; sess admin_private.customer_action_sessions;
  cs public.cases; req public.evidence_requests; d public.case_documents; existing public.case_document_versions;
  actor uuid; fp text; cached jsonb; result jsonb; version_id uuid; object_key text; version_no integer; abandoned uuid;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL OR sess.action_id <> a.id THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  actor := sess.auth_user_id;
  IF p_request IS NULL OR p_evidence_request IS NULL OR p_item_title IS NULL OR btrim(p_item_title) = ''
    OR char_length(btrim(p_item_title)) > 200 OR p_filename IS NULL OR p_content_type IS NULL OR p_size IS NULL OR p_bucket IS NULL
    OR length(p_bucket) NOT BETWEEN 3 AND 63
    OR p_size < 1 OR p_size > 10485760
    OR NOT admin_private.evidence_extension_ok_v1(p_filename, p_content_type)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_evidence_request, btrim(p_item_title), btrim(p_filename), p_content_type, p_size, p_bucket, 'begin_v2')::text);
  cached := admin_private.customer_evidence_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id FOR UPDATE;
  IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO req FROM public.evidence_requests WHERE id = p_evidence_request FOR UPDATE;
  IF NOT admin_private.customer_action_may_use_evidence_request_v1(a, req, cs) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  -- The requested item must exactly match the saved staff-approved list.
  IF NOT EXISTS (
    SELECT 1 FROM unnest(string_to_array(req.title, '; ')) AS parts(part)
    WHERE btrim(parts.part) = btrim(p_item_title)
  ) OR (
    SELECT count(*) FROM unnest(string_to_array(req.title, '; ')) AS parts(part)
    WHERE btrim(parts.part) <> ''
  ) > 16 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(req.id::text || ':customer-evidence', 0));
  SELECT v.* INTO existing
  FROM public.case_document_versions v
  JOIN public.case_documents doc ON doc.id = v.document_id
  WHERE v.customer_evidence_request_id = req.id
    AND coalesce(v.evidence_item_title, doc.title) = btrim(p_item_title)
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
    -- Distinct requested documents must remain separate evidence records.
    -- Existing uploaded documents for another item cannot be overwritten.
    INSERT INTO public.case_documents(case_id, evidence_request_id, title, created_by)
    VALUES (cs.id, req.id, btrim(p_item_title), actor)
    RETURNING * INTO d;
  END IF;
  SELECT coalesce(max(version_number), 0) + 1 INTO version_no FROM public.case_document_versions WHERE document_id = d.id;
  version_id := gen_random_uuid();
  object_key := 'cases/' || cs.id::text || '/documents/' || d.id::text || '/versions/' || version_id::text;
  INSERT INTO public.case_document_versions(
    id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
    storage_provider, storage_bucket, storage_key, created_by,
    submission_source, customer_action_id, customer_evidence_request_id, evidence_item_title
  ) VALUES (
    version_id, d.id, version_no, btrim(p_filename), p_content_type, p_size, 'S3', p_bucket, object_key, actor,
    'CUSTOMER', a.id, req.id, btrim(p_item_title)
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
END; $function$;

REVOKE ALL ON FUNCTION public.customer_evidence_begin_v2(text, uuid, uuid, text, text, text, bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_evidence_begin_v2(text, uuid, uuid, text, text, text, bigint, text) TO service_role;
COMMIT;
