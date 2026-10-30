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

REVOKE ALL ON FUNCTION
  admin_private.assessment_evidence_document_v1(uuid),
  admin_private.case_assessment_basis_v1(uuid),
  admin_private.case_assessment_evidence_ready_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
