BEGIN;

-- Guided assessment basis. Source only.
-- Do not apply this migration to DEV or Production from this change.
-- It does not edit an existing case, close a case, send mail, or rewrite a
-- stored assessment fingerprint. It does not move a case stage. Publication
-- of a Guided pack advances preparation through the audited case command in
-- the preceding stage-sync migration.
-- A staff submission-pack document leaves the assessment basis only when it
-- is not linked to an evidence request, has no customer version, and every
-- pack item for it, including an item on a superseded pack, is a deliverable
-- or instructions. A missing role, an evidence role, a customer version, or
-- an evidence-request link keeps it.
-- An approval stays current when its stored fingerprint still matches that
-- filtered basis, or when it still matches the inclusive basis recorded
-- before those files were classified. The stored fingerprint is not rewritten.

CREATE FUNCTION admin_private.assessment_evidence_document_v1(p_document uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NOT (
    d.evidence_request_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.case_document_versions v
      WHERE v.document_id = d.id
        AND v.submission_source = 'CUSTOMER'
    )
    AND EXISTS (
      SELECT 1
      FROM public.case_prepared_pack_items i
      INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
      WHERE i.document_id = d.id
        AND r.role IN ('DELIVERABLE', 'INSTRUCTIONS')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.case_prepared_pack_items i
      LEFT JOIN public.guided_pack_item_roles r ON r.item_id = i.id
      WHERE i.document_id = d.id
        AND (r.role IS NULL OR r.role = 'EVIDENCE')
    )
  )
  FROM public.case_documents d
  WHERE d.id = p_document;
$$;

CREATE OR REPLACE FUNCTION admin_private.case_assessment_basis_v1(p_case uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'issue', btrim(coalesce(c.issue_description, '')),
    'reviewUrl', btrim(coalesce(c.review_url, '')),
    'profile', jsonb_build_object(
      'businessName', btrim(coalesce(b.display_name, '')),
      'website', btrim(coalesce(b.website_url, '')),
      'locationName', btrim(coalesce(l.location_name, '')),
      'country', btrim(coalesce(l.country, '')),
      'profileUrl', btrim(coalesce(l.business_profile_url, ''))
    ),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'title', btrim(r.title),
        'text', btrim(r.request_text)
      ) ORDER BY r.id)
      FROM public.evidence_requests r
      WHERE r.case_id = p_case
    ), '[]'::jsonb),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'requestId', d.evidence_request_id,
        'title', btrim(d.title)
      ) ORDER BY d.id)
      FROM public.case_documents d
      WHERE d.case_id = p_case
        AND admin_private.assessment_evidence_document_v1(d.id)
    ), '[]'::jsonb),
    'versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id,
        'requestId', d.evidence_request_id,
        'upload', v.upload_status,
        'scan', v.scan_status,
        'validation', v.validation_status,
        'review', v.review_status
      ) ORDER BY v.id)
      FROM public.case_document_versions v
      JOIN public.case_documents d ON d.id = v.document_id
      WHERE d.case_id = p_case
        AND admin_private.assessment_evidence_document_v1(d.id)
    ), '[]'::jsonb)
  )
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id
  WHERE c.id = p_case;
$$;

CREATE OR REPLACE FUNCTION admin_private.case_assessment_evidence_ready_v1(p_case uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.evidence_requests r WHERE r.case_id = p_case
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.evidence_requests r WHERE r.case_id = p_case AND r.status = 'OPEN'
  )
  AND EXISTS (
    SELECT 1
    FROM public.case_document_versions v
    JOIN public.case_documents d ON d.id = v.document_id
    WHERE d.case_id = p_case
      AND admin_private.assessment_evidence_document_v1(d.id)
      AND v.review_status = 'ACCEPTED'
      AND v.upload_status = 'UPLOADED'
      AND v.scan_status = 'NO_THREATS_FOUND'
      AND v.validation_status = 'VALID'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.case_document_versions v
    JOIN public.case_documents d ON d.id = v.document_id
    WHERE d.case_id = p_case
      AND admin_private.assessment_evidence_document_v1(d.id)
      AND v.review_status NOT IN ('REJECTED', 'SUPERSEDED')
      AND NOT (
        v.upload_status = 'UPLOADED'
        AND v.scan_status = 'NO_THREATS_FOUND'
        AND v.validation_status = 'VALID'
        AND v.review_status = 'ACCEPTED'
      )
  );
$$;

CREATE FUNCTION admin_private.case_assessment_inclusive_basis_v1(p_case uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'issue', btrim(coalesce(c.issue_description, '')),
    'reviewUrl', btrim(coalesce(c.review_url, '')),
    'profile', jsonb_build_object(
      'businessName', btrim(coalesce(b.display_name, '')),
      'website', btrim(coalesce(b.website_url, '')),
      'locationName', btrim(coalesce(l.location_name, '')),
      'country', btrim(coalesce(l.country, '')),
      'profileUrl', btrim(coalesce(l.business_profile_url, ''))
    ),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'title', btrim(r.title),
        'text', btrim(r.request_text)
      ) ORDER BY r.id)
      FROM public.evidence_requests r
      WHERE r.case_id = p_case
    ), '[]'::jsonb),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'requestId', d.evidence_request_id,
        'title', btrim(d.title)
      ) ORDER BY d.id)
      FROM public.case_documents d
      WHERE d.case_id = p_case
    ), '[]'::jsonb),
    'versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id,
        'requestId', d.evidence_request_id,
        'upload', v.upload_status,
        'scan', v.scan_status,
        'validation', v.validation_status,
        'review', v.review_status
      ) ORDER BY v.id)
      FROM public.case_document_versions v
      JOIN public.case_documents d ON d.id = v.document_id
      WHERE d.case_id = p_case
    ), '[]'::jsonb)
  )
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id
  WHERE c.id = p_case;
$$;

CREATE OR REPLACE FUNCTION public.admin_case_assessment_read_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.cases;
  basis jsonb;
  fingerprint text;
  inclusive_fingerprint text;
  reopened_at timestamptz;
  versions jsonb;
  highest integer;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_case IS NULL THEN
    RETURN jsonb_build_object('missing', true);
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  IF c.id IS NULL THEN
    RETURN jsonb_build_object('missing', true);
  END IF;
  basis := admin_private.case_assessment_basis_v1(c.id);
  fingerprint := admin_private.case_assessment_fingerprint_v1(basis);
  inclusive_fingerprint := admin_private.case_assessment_fingerprint_v1(admin_private.case_assessment_inclusive_basis_v1(c.id));
  SELECT max(e.created_at) INTO reopened_at
  FROM public.case_work_events e
  WHERE e.case_id = c.id AND e.event = 'reopen';
  SELECT max(version_number) INTO highest
  FROM public.case_assessments
  WHERE case_id = c.id AND status = 'APPROVED';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', assessment_row.id,
    'versionNumber', assessment_row.version_number,
    'status', assessment_row.status,
    'recordVersion', assessment_row.record_version,
    'findings', assessment_row.findings,
    'evidenceConsidered', assessment_row.evidence_considered,
    'profileIssue', assessment_row.profile_issue,
    'policyConcerns', assessment_row.policy_concerns,
    'recommendedAction', assessment_row.recommended_action,
    'servicePathway', assessment_row.service_pathway,
    'rationale', assessment_row.rationale,
    'risks', assessment_row.risks,
    'outstandingInformation', assessment_row.outstanding_information,
    'draftedAt', assessment_row.drafted_at,
    'reviewedAt', assessment_row.reviewed_at,
    'approvedAt', assessment_row.approved_at,
    'draftedBy', assessment_row.drafted_by,
    'reviewedBy', assessment_row.reviewed_by,
    'approvedBy', assessment_row.approved_by,
    'current', assessment_row.status = 'APPROVED' AND assessment_row.version_number = highest AND NOT assessment_row.stale,
    'stale', assessment_row.stale,
    'staleReason', assessment_row.stale_reason
  ) ORDER BY assessment_row.version_number DESC), '[]'::jsonb)
  INTO versions
  FROM (
    SELECT
      item.*,
      item.status = 'APPROVED' AND (
        (
          item.basis_fingerprint IS DISTINCT FROM fingerprint
          AND item.basis_fingerprint IS DISTINCT FROM inclusive_fingerprint
        )
        OR (reopened_at IS NOT NULL AND item.approved_at IS NOT NULL AND reopened_at > item.approved_at)
      ) AS stale,
      CASE
        WHEN item.status <> 'APPROVED' THEN NULL
        WHEN reopened_at IS NOT NULL AND item.approved_at IS NOT NULL AND reopened_at > item.approved_at THEN 'reopened'
        WHEN item.basis_fingerprint IS DISTINCT FROM fingerprint
          AND item.basis_fingerprint IS DISTINCT FROM inclusive_fingerprint THEN 'facts'
        ELSE NULL
      END AS stale_reason
    FROM public.case_assessments item
    WHERE item.case_id = c.id
  ) assessment_row;
  RETURN jsonb_build_object(
    'workflowVersion', c.workflow_version,
    'basisFingerprint', fingerprint,
    'reopenedAt', reopened_at,
    'versions', versions
  );
END;
$$;

REVOKE ALL ON FUNCTION
  admin_private.assessment_evidence_document_v1(uuid),
  admin_private.case_assessment_basis_v1(uuid),
  admin_private.case_assessment_evidence_ready_v1(uuid),
  admin_private.case_assessment_inclusive_basis_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_case_assessment_read_v1(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_case_assessment_read_v1(text, uuid) TO service_role;

COMMIT;
