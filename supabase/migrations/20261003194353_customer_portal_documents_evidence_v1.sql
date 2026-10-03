BEGIN;

-- Portal evidence uses the existing document, version, receipt, scan and review
-- records. A portal submission does not create a customer action or an action
-- session. portal_submission marks that provenance. The action-link constraint
-- stays in force for every other customer version.

ALTER TABLE public.case_document_versions
  ADD COLUMN portal_submission boolean NOT NULL DEFAULT false;

ALTER TABLE public.case_document_versions
  DROP CONSTRAINT case_document_versions_customer_provenance_check;

ALTER TABLE public.case_document_versions
  ADD CONSTRAINT case_document_versions_customer_provenance_check
  CHECK (
    (
      submission_source = 'ADMIN'
      AND customer_action_id IS NULL
      AND customer_evidence_request_id IS NULL
      AND portal_submission = false
    )
    OR (
      submission_source = 'CUSTOMER'
      AND customer_evidence_request_id IS NOT NULL
      AND (
        (customer_action_id IS NOT NULL AND portal_submission = false)
        OR (customer_action_id IS NULL AND portal_submission = true)
      )
    )
  );

CREATE FUNCTION admin_private.customer_portal_actor_v1(p_token_hash text)
RETURNS TABLE (customer_id uuid, auth_user_id uuid, email text)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE sess jsonb; v_customer uuid; v_auth uuid; v_email text;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN RETURN; END IF;
  BEGIN
    v_customer := (sess->>'customerId')::uuid;
    v_auth := (sess->>'authUserId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;
  v_email := sess->>'email';
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL OR length(btrim(v_email)) = 0 THEN
    RETURN;
  END IF;
  customer_id := v_customer;
  auth_user_id := v_auth;
  email := v_email;
  RETURN NEXT;
END; $$;

CREATE FUNCTION admin_private.customer_evidence_state_v1(
  p_upload text, p_scan text, p_validation text, p_review text
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_upload IS NULL THEN 'NOT_SUBMITTED'
    WHEN p_upload = 'PENDING_UPLOAD' THEN 'UPLOAD_IN_PROGRESS'
    WHEN p_upload = 'UPLOADED' AND p_review = 'ACCEPTED'
      AND p_scan = 'NO_THREATS_FOUND' AND p_validation = 'VALID' THEN 'ACCEPTED'
    WHEN p_upload = 'UPLOADED' AND p_review IN ('REJECTED', 'SUPERSEDED') THEN 'NEEDS_ANOTHER'
    WHEN p_upload = 'UPLOADED' AND p_validation IN ('INVALID', 'ERROR') THEN 'NEEDS_ANOTHER'
    WHEN p_upload = 'UPLOADED' AND p_scan = 'PENDING' THEN 'RECEIVED'
    WHEN p_upload = 'UPLOADED' AND p_scan = 'NO_THREATS_FOUND'
      AND p_validation = 'VALID' AND p_review = 'UNREVIEWED' THEN 'UNDER_REVIEW'
    WHEN p_upload = 'UPLOADED' AND p_scan = 'NO_THREATS_FOUND'
      AND p_validation = 'PENDING' THEN 'BEING_CHECKED'
    WHEN p_upload = 'UPLOADED' THEN 'BEING_CHECKED'
    ELSE 'BEING_CHECKED'
  END;
$$;

CREATE FUNCTION admin_private.customer_portal_owned_case_v1(p_customer uuid, p_reference text)
RETURNS uuid
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT c.id
  FROM public.cases c
  WHERE p_customer IS NOT NULL
    AND p_reference ~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    AND c.public_ref = p_reference
    AND c.customer_id = p_customer;
$$;

CREATE FUNCTION admin_private.customer_portal_evidence_selector_v1(p_case uuid, p_selector text)
RETURNS uuid
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT ranked.id
  FROM (
    SELECT r.id, row_number() OVER (ORDER BY r.created_at, r.id) AS n
    FROM public.evidence_requests r
    WHERE r.case_id = p_case
  ) ranked
  WHERE p_case IS NOT NULL
    AND p_selector ~ '^er-[1-9][0-9]{0,3}$'
    AND ranked.n = substring(p_selector from 4)::integer;
$$;

-- One eligibility projection for a currently published pack. The legacy
-- action-link functions and the portal both read this. It does not decide
-- who may see the case.
CREATE FUNCTION admin_private.customer_published_pack_documents_v1(p_case uuid)
RETURNS TABLE (
  pack_id uuid, pack_number integer, published_at timestamptz, item_id uuid, item_position integer,
  document_title text, original_filename text, content_type text, size_bytes bigint,
  version_id uuid, storage_bucket text, storage_key text
)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT p.id, p.pack_number, p.published_at, i.id, i.position, i.document_title, i.original_filename,
    i.content_type, i.size_bytes, v.id, v.storage_bucket, v.storage_key
  FROM public.case_prepared_packs p
  INNER JOIN public.case_prepared_pack_items i ON i.pack_id = p.id
  INNER JOIN public.case_document_versions v ON v.id = i.version_id
  INNER JOIN public.case_documents d ON d.id = i.document_id
  WHERE p.case_id = p_case
    AND p.status = 'APPROVED'
    AND p.published_at IS NOT NULL
    AND p.unpublished_at IS NULL
    AND d.case_id = p_case
    AND v.document_id = d.id
    AND v.upload_status = 'UPLOADED'
    AND v.scan_status = 'NO_THREATS_FOUND'
    AND v.validation_status = 'VALID'
    AND v.review_status = 'ACCEPTED'
    AND v.customer_visible IS TRUE
    AND admin_private.pack_publishable_v1(p.id);
$$;

CREATE OR REPLACE FUNCTION admin_private.customer_published_pack_item_v1(p_case uuid, p_version uuid)
RETURNS TABLE (
  pack_id uuid, pack_number integer, published_at timestamptz, item_id uuid, item_position integer,
  document_title text, original_filename text, content_type text, size_bytes bigint,
  version_id uuid, storage_bucket text, storage_key text
)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT d.pack_id, d.pack_number, d.published_at, d.item_id, d.item_position,
    d.document_title, d.original_filename, d.content_type, d.size_bytes,
    d.version_id, d.storage_bucket, d.storage_key
  FROM admin_private.customer_published_pack_documents_v1(p_case) d
  WHERE p_version IS NOT NULL AND d.version_id = p_version
  LIMIT 1;
$$;

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
    'versionId', d.version_id,
    'position', d.item_position,
    'documentTitle', d.document_title,
    'originalFilename', d.original_filename,
    'contentType', d.content_type,
    'sizeBytes', d.size_bytes
  ) ORDER BY d.item_position), '[]') INTO items
  FROM admin_private.customer_published_pack_documents_v1(a.case_id) d;
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

CREATE FUNCTION admin_private.customer_portal_case_evidence_v1(p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE requests jsonb; submissions jsonb; documents jsonb;
BEGIN
  IF p_case IS NULL THEN
    RETURN jsonb_build_object('requests', '[]'::jsonb, 'submissions', '[]'::jsonb, 'documents', '[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'selector', 'er-' || ranked.n,
    'title', ranked.title,
    'requestText', ranked.request_text,
    'dueAt', ranked.due_at,
    'state', ranked.state,
    'filename', ranked.filename,
    'submittedAt', ranked.submitted_at,
    'canUpload', ranked.can_upload
  ) ORDER BY ranked.n), '[]') INTO requests
  FROM (
    SELECT
      row_number() OVER (ORDER BY r.created_at, r.id) AS n,
      r.title,
      r.request_text,
      r.due_at,
      admin_private.customer_evidence_state_v1(v.upload_status, v.scan_status, v.validation_status, v.review_status) AS state,
      CASE WHEN v.upload_status IN ('PENDING_UPLOAD', 'UPLOADED') THEN v.original_filename ELSE NULL END AS filename,
      CASE WHEN v.upload_status = 'UPLOADED' THEN v.uploaded_at ELSE NULL END AS submitted_at,
      (
        cs.status NOT IN ('CLOSED', 'CANCELLED')
        AND r.status = 'OPEN'
        AND (v.id IS NULL OR v.upload_status IS DISTINCT FROM 'UPLOADED')
      ) AS can_upload
    FROM public.evidence_requests r
    JOIN public.cases cs ON cs.id = r.case_id
    LEFT JOIN LATERAL (
      SELECT cv.id, cv.upload_status, cv.scan_status, cv.validation_status, cv.review_status,
        cv.original_filename, cv.uploaded_at
      FROM public.case_document_versions cv
      WHERE cv.customer_evidence_request_id = r.id
        AND cv.submission_source = 'CUSTOMER'
        AND cv.upload_status IN ('PENDING_UPLOAD', 'UPLOADED')
      ORDER BY CASE cv.upload_status WHEN 'UPLOADED' THEN 0 ELSE 1 END, cv.created_at, cv.id
      LIMIT 1
    ) v ON true
    WHERE r.case_id = p_case
  ) ranked;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'title', r.title,
    'filename', v.original_filename,
    'submittedAt', v.uploaded_at,
    'state', admin_private.customer_evidence_state_v1(v.upload_status, v.scan_status, v.validation_status, v.review_status)
  ) ORDER BY v.uploaded_at, v.id), '[]') INTO submissions
  FROM public.evidence_requests r
  JOIN public.case_document_versions v ON v.customer_evidence_request_id = r.id
  WHERE r.case_id = p_case
    AND v.submission_source = 'CUSTOMER'
    AND v.upload_status = 'UPLOADED'
    AND v.uploaded_at IS NOT NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'selector', 'pd-' || d.item_position,
    'title', d.document_title,
    'filename', d.original_filename,
    'contentType', d.content_type,
    'sizeBytes', d.size_bytes,
    'publishedAt', d.published_at
  ) ORDER BY d.item_position), '[]') INTO documents
  FROM admin_private.customer_published_pack_documents_v1(p_case) d;

  RETURN jsonb_build_object('requests', requests, 'submissions', submissions, 'documents', documents);
END; $$;

CREATE FUNCTION public.customer_portal_documents_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; needs jsonb; submissions jsonb; documents jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'reference', c.public_ref,
    'caseType', c.case_type,
    'serviceTrack', c.service_track,
    'businessName', b.display_name,
    'locationName', l.location_name,
    'selector', req->>'selector',
    'title', req->>'title',
    'requestText', req->>'requestText',
    'dueAt', req->'dueAt',
    'state', req->>'state',
    'filename', req->'filename'
  ) ORDER BY c.public_ref, req->>'selector'), '[]') INTO needs
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id AND l.business_id = c.business_id
  CROSS JOIN LATERAL jsonb_array_elements(admin_private.customer_portal_case_evidence_v1(c.id)->'requests') req
  WHERE c.customer_id = v_customer
    AND (req->>'canUpload')::boolean IS TRUE;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'reference', c.public_ref,
    'caseType', c.case_type,
    'serviceTrack', c.service_track,
    'businessName', b.display_name,
    'locationName', l.location_name,
    'title', sub->>'title',
    'filename', sub->>'filename',
    'submittedAt', sub->'submittedAt',
    'state', sub->>'state'
  ) ORDER BY c.public_ref, sub->>'submittedAt'), '[]') INTO submissions
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id AND l.business_id = c.business_id
  CROSS JOIN LATERAL jsonb_array_elements(admin_private.customer_portal_case_evidence_v1(c.id)->'submissions') sub
  WHERE c.customer_id = v_customer;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'reference', c.public_ref,
    'caseType', c.case_type,
    'serviceTrack', c.service_track,
    'businessName', b.display_name,
    'locationName', l.location_name,
    'selector', doc->>'selector',
    'title', doc->>'title',
    'filename', doc->>'filename',
    'contentType', doc->>'contentType',
    'sizeBytes', doc->'sizeBytes',
    'publishedAt', doc->'publishedAt'
  ) ORDER BY c.public_ref, doc->>'selector'), '[]') INTO documents
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id AND l.business_id = c.business_id
  CROSS JOIN LATERAL jsonb_array_elements(admin_private.customer_portal_case_evidence_v1(c.id)->'documents') doc
  WHERE c.customer_id = v_customer;

  RETURN jsonb_build_object('needs', needs, 'submissions', submissions, 'documents', documents);
END; $$;

CREATE FUNCTION public.customer_portal_case_documents_v1(p_token_hash text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid; cs public.cases;
  b public.businesses; loc public.locations; body jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO b FROM public.businesses WHERE id = cs.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = cs.location_id AND business_id = cs.business_id;
  IF b.id IS NULL OR loc.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  body := admin_private.customer_portal_case_evidence_v1(cs.id);
  RETURN jsonb_build_object(
    'found', true,
    'case', jsonb_build_object(
      'reference', cs.public_ref,
      'caseType', cs.case_type,
      'serviceTrack', cs.service_track,
      'businessName', b.display_name,
      'locationName', loc.location_name
    ),
    'requests', body->'requests',
    'submissions', body->'submissions',
    'documents', body->'documents'
  );
END; $$;

CREATE FUNCTION public.customer_portal_evidence_begin_v1(
  p_token_hash text, p_request uuid, p_reference text, p_selector text,
  p_filename text, p_content_type text, p_size bigint, p_bucket text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid;
  cs public.cases; req public.evidence_requests; d public.case_documents; existing public.case_document_versions;
  fp text; cached jsonb; result jsonb; version_id uuid; object_key text; version_no integer; abandoned uuid;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_filename IS NULL OR p_content_type IS NULL OR p_size IS NULL OR p_bucket IS NULL
    OR length(p_bucket) NOT BETWEEN 3 AND 63
    OR p_size < 1 OR p_size > 10485760
    OR NOT admin_private.evidence_extension_ok_v1(p_filename, p_content_type)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_reference, p_selector, btrim(p_filename), p_content_type, p_size, p_bucket, 'portal-begin')::text);
  cached := admin_private.customer_evidence_receipt_v1(v_auth, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer FOR UPDATE;
  IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO req FROM public.evidence_requests
    WHERE id = admin_private.customer_portal_evidence_selector_v1(cs.id, p_selector)
    FOR UPDATE;
  IF req.id IS NULL OR req.case_id <> cs.id OR req.status <> 'OPEN' THEN
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
    AND existing.portal_submission IS TRUE
    AND existing.customer_action_id IS NULL
    AND existing.created_by = v_auth
    AND existing.original_filename = btrim(p_filename)
    AND existing.declared_content_type = p_content_type
    AND existing.declared_size_bytes = p_size
    AND existing.storage_bucket = p_bucket
  THEN
    SELECT * INTO d FROM public.case_documents WHERE id = existing.document_id;
    result := jsonb_build_object(
      'status', 'success',
      'storageKey', existing.storage_key,
      'storageBucket', existing.storage_bucket,
      'contentType', existing.declared_content_type,
      'maxBytes', 10485760
    );
    INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, v_auth, fp, result, now());
    RETURN result;
  END IF;
  IF existing.upload_status = 'PENDING_UPLOAD' THEN
    UPDATE public.case_document_versions
      SET upload_status = 'FAILED'
      WHERE id = existing.id AND upload_status = 'PENDING_UPLOAD';
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
    VALUES (cs.id, existing.document_id, existing.id, v_auth, 'UPLOAD_FAILED', jsonb_build_object(
      'versionNumber', existing.version_number, 'source', 'CUSTOMER_PORTAL', 'reason', 'RESTARTED_BEFORE_FINALIZE'
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
      VALUES (cs.id, req.id, req.title, v_auth) RETURNING * INTO d;
    END IF;
  END IF;
  SELECT coalesce(max(version_number), 0) + 1 INTO version_no
  FROM public.case_document_versions WHERE document_id = d.id;
  version_id := gen_random_uuid();
  object_key := 'cases/' || cs.id::text || '/documents/' || d.id::text || '/versions/' || version_id::text;
  INSERT INTO public.case_document_versions(
    id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
    storage_provider, storage_bucket, storage_key, created_by,
    submission_source, customer_action_id, customer_evidence_request_id, portal_submission
  ) VALUES (
    version_id, d.id, version_no, btrim(p_filename), p_content_type, p_size, 'S3', p_bucket, object_key, v_auth,
    'CUSTOMER', NULL, req.id, true
  );
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (cs.id, d.id, version_id, v_auth, 'UPLOAD_BEGUN', jsonb_build_object(
    'versionNumber', version_no, 'contentType', p_content_type, 'sizeBytes', p_size, 'source', 'CUSTOMER_PORTAL'
  ));
  PERFORM admin_private.write_record_audit_v1(
    v_auth, 'EVIDENCE_CHANGED', 'success', cs.id, p_request, 'case',
    'Customer evidence upload started',
    jsonb_build_object('operation', 'begin', 'source', 'CUSTOMER_PORTAL', 'documentId', d.id, 'versionId', version_id)
      || CASE WHEN abandoned IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('abandonedVersionId', abandoned) END
  );
  result := jsonb_build_object(
    'status', 'success',
    'storageKey', object_key,
    'storageBucket', p_bucket,
    'contentType', p_content_type,
    'maxBytes', 10485760
  );
  INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, v_auth, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.customer_portal_evidence_target_v1(
  p_token_hash text, p_reference text, p_selector text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid; cs public.cases;
  req public.evidence_requests; v public.case_document_versions;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  IF cs.status IN ('CLOSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('found', true, 'available', false);
  END IF;
  SELECT * INTO req FROM public.evidence_requests
    WHERE id = admin_private.customer_portal_evidence_selector_v1(cs.id, p_selector);
  IF req.id IS NULL OR req.case_id <> cs.id OR req.status <> 'OPEN' THEN
    RETURN jsonb_build_object('found', true, 'available', false);
  END IF;
  SELECT cv.* INTO v
  FROM public.case_document_versions cv
  WHERE cv.customer_evidence_request_id = req.id
    AND cv.submission_source = 'CUSTOMER'
    AND cv.portal_submission IS TRUE
    AND cv.customer_action_id IS NULL
    AND cv.created_by = v_auth
    AND cv.upload_status IN ('PENDING_UPLOAD', 'UPLOADED');
  IF v.id IS NULL THEN RETURN jsonb_build_object('found', true, 'available', false); END IF;
  RETURN jsonb_build_object(
    'found', true,
    'available', true,
    'filename', v.original_filename,
    'storageBucket', v.storage_bucket,
    'storageKey', v.storage_key,
    'contentType', v.declared_content_type,
    'sizeBytes', v.declared_size_bytes,
    'uploadStatus', v.upload_status
  );
END; $$;

CREATE FUNCTION public.customer_portal_evidence_finalize_v1(
  p_token_hash text, p_request uuid, p_reference text, p_selector text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid;
  cs public.cases; req public.evidence_requests; d public.case_documents; v public.case_document_versions;
  fp text; cached jsonb; result jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(p_reference, p_selector, 'portal-finalize')::text);
  cached := admin_private.customer_evidence_receipt_v1(v_auth, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer FOR UPDATE;
  IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO req FROM public.evidence_requests
    WHERE id = admin_private.customer_portal_evidence_selector_v1(cs.id, p_selector)
    FOR UPDATE;
  IF req.id IS NULL OR req.case_id <> cs.id OR req.status <> 'OPEN' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT cv.* INTO v
  FROM public.case_document_versions cv
  WHERE cv.customer_evidence_request_id = req.id
    AND cv.submission_source = 'CUSTOMER'
    AND cv.portal_submission IS TRUE
    AND cv.customer_action_id IS NULL
    AND cv.created_by = v_auth
    AND cv.upload_status IN ('PENDING_UPLOAD', 'UPLOADED')
  ORDER BY cv.created_at, cv.id
  LIMIT 1
  FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id FOR UPDATE;
  IF d.id IS NULL OR d.case_id <> cs.id THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF v.upload_status = 'UPLOADED' THEN
    result := jsonb_build_object('status', 'success');
    INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, v_auth, fp, result, now());
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
      AND customer_visible IS FALSE
      AND portal_submission IS TRUE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (cs.id, d.id, v.id, v_auth, 'UPLOAD_FINALIZED', jsonb_build_object(
    'versionNumber', v.version_number, 'source', 'CUSTOMER_PORTAL'
  ));
  PERFORM admin_private.write_record_audit_v1(
    v_auth, 'EVIDENCE_CHANGED', 'success', cs.id, p_request, 'case',
    'Customer evidence upload finalized',
    jsonb_build_object('operation', 'finalize', 'source', 'CUSTOMER_PORTAL', 'documentId', d.id, 'versionId', v.id)
  );
  result := jsonb_build_object('status', 'success');
  INSERT INTO admin_private.customer_evidence_upload_receipts VALUES (p_request, v_auth, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.customer_portal_document_resolve_v1(
  p_token_hash text, p_reference text, p_selector text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid; item record;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  IF p_selector IS NULL OR p_selector !~ '^pd-[1-9][0-9]{0,3}$' THEN
    RETURN jsonb_build_object('found', true, 'available', false);
  END IF;
  SELECT * INTO item
  FROM admin_private.customer_published_pack_documents_v1(v_case) d
  WHERE d.item_position = substring(p_selector from 4)::integer
    AND ('pd-' || d.item_position::text) = p_selector;
  IF item.version_id IS NULL OR NOT admin_private.pack_publishable_v1(item.pack_id) THEN
    RETURN jsonb_build_object('found', true, 'available', false);
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'available', true,
    'filename', item.original_filename,
    'contentType', item.content_type,
    'sizeBytes', item.size_bytes,
    'storageBucket', item.storage_bucket,
    'storageKey', item.storage_key
  );
END; $$;

CREATE FUNCTION public.customer_portal_document_access_v1(
  p_token_hash text, p_request uuid, p_reference text, p_selector text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid; item record;
  d public.case_documents; v public.case_document_versions; fp text; cached jsonb; result jsonb;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(p_reference, p_selector, 'portal-download')::text);
  cached := admin_private.customer_pack_receipt_v1(v_auth, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL OR p_selector IS NULL OR p_selector !~ '^pd-[1-9][0-9]{0,3}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO item
  FROM admin_private.customer_published_pack_documents_v1(v_case) doc
  WHERE doc.item_position = substring(p_selector from 4)::integer
    AND ('pd-' || doc.item_position::text) = p_selector;
  IF item.version_id IS NULL OR NOT admin_private.pack_publishable_v1(item.pack_id) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO item
  FROM admin_private.customer_published_pack_documents_v1(v_case) doc
  WHERE doc.version_id = item.version_id;
  IF item.version_id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = item.version_id;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF d.id IS NULL OR d.case_id <> v_case THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (v_case, d.id, v.id, v_auth, 'ACCESS_DOWNLOADED', jsonb_build_object(
    'source', 'CUSTOMER_PORTAL', 'contentType', v.declared_content_type
  ));
  PERFORM admin_private.write_record_audit_v1(
    v_auth, 'EVIDENCE_CHANGED', 'success', v_case, p_request, 'case',
    'Customer downloaded a published pack file',
    jsonb_build_object('operation', 'download', 'source', 'CUSTOMER_PORTAL', 'versionId', v.id)
  );
  result := jsonb_build_object('status', 'success');
  INSERT INTO admin_private.customer_pack_access_receipts VALUES (p_request, v_auth, fp, result, now());
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_actor_v1(text),
  admin_private.customer_evidence_state_v1(text, text, text, text),
  admin_private.customer_portal_owned_case_v1(uuid, text),
  admin_private.customer_portal_evidence_selector_v1(uuid, text),
  admin_private.customer_published_pack_documents_v1(uuid),
  admin_private.customer_portal_case_evidence_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_documents_v1(text),
  public.customer_portal_case_documents_v1(text, text),
  public.customer_portal_evidence_begin_v1(text, uuid, text, text, text, text, bigint, text),
  public.customer_portal_evidence_target_v1(text, text, text),
  public.customer_portal_evidence_finalize_v1(text, uuid, text, text),
  public.customer_portal_document_resolve_v1(text, text, text),
  public.customer_portal_document_access_v1(text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_documents_v1(text),
  public.customer_portal_case_documents_v1(text, text),
  public.customer_portal_evidence_begin_v1(text, uuid, text, text, text, text, bigint, text),
  public.customer_portal_evidence_target_v1(text, text, text),
  public.customer_portal_evidence_finalize_v1(text, uuid, text, text),
  public.customer_portal_document_resolve_v1(text, text, text),
  public.customer_portal_document_access_v1(text, uuid, text, text)
  TO service_role;

COMMIT;
