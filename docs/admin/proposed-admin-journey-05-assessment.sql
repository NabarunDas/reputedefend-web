-- ADMIN-JOURNEY-05 proposed SQL. NOT a migration.
-- Do not apply this file to DEV. Do not apply it to Production.
-- It is the reviewable proposal for a later, separately approved database change.
-- Disposable PGlite tests load this file on a throwaway database only.
--
-- Adds public.case_assessments and two functions. It does not alter cases,
-- evidence, quotes, payments, email, Google submission, service_track, or the
-- case-flow transition matrix. An approved row is immutable. A recommendation
-- is not an accepted service agreement and does not activate a service.
-- Staff identity comes from the existing session. The client cannot name the actor.
-- basis_fingerprint is md5 of the canonical jsonb text, the same digest the
-- existing command receipts use. pgcrypto is not added.

CREATE TABLE public.case_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL CHECK (status IN ('DRAFT', 'REVIEWED', 'APPROVED')),
  findings text NOT NULL,
  evidence_considered text NOT NULL,
  profile_issue text NOT NULL DEFAULT '',
  policy_concerns text NOT NULL DEFAULT '',
  recommended_action text NOT NULL,
  service_pathway text NOT NULL CHECK (service_pathway IN ('GUIDED', 'MANAGED', 'UNDECIDED')),
  rationale text NOT NULL,
  risks text NOT NULL,
  outstanding_information text NOT NULL DEFAULT '',
  basis jsonb NOT NULL,
  basis_fingerprint text NOT NULL CHECK (basis_fingerprint ~ '^[0-9a-f]{32}$'),
  drafted_by uuid NOT NULL,
  drafted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, version_number),
  CHECK (length(btrim(findings)) BETWEEN 20 AND 4000),
  CHECK (length(findings) <= 4000),
  CHECK (length(btrim(evidence_considered)) BETWEEN 10 AND 4000),
  CHECK (length(evidence_considered) <= 4000),
  CHECK (length(profile_issue) <= 2000),
  CHECK (length(policy_concerns) <= 2000),
  CHECK (length(btrim(recommended_action)) BETWEEN 10 AND 2000),
  CHECK (length(recommended_action) <= 2000),
  CHECK (length(btrim(rationale)) BETWEEN 20 AND 4000),
  CHECK (length(rationale) <= 4000),
  CHECK (length(btrim(risks)) BETWEEN 10 AND 2000),
  CHECK (length(risks) <= 2000),
  CHECK (length(outstanding_information) <= 2000),
  CHECK (status <> 'APPROVED' OR service_pathway IN ('GUIDED', 'MANAGED')),
  CHECK (
    (status = 'DRAFT' AND reviewed_by IS NULL AND reviewed_at IS NULL AND approved_by IS NULL AND approved_at IS NULL)
    OR (status = 'REVIEWED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND approved_by IS NULL AND approved_at IS NULL)
    OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX case_assessments_one_open_idx
  ON public.case_assessments (case_id)
  WHERE status IN ('DRAFT', 'REVIEWED');

CREATE INDEX case_assessments_case_idx
  ON public.case_assessments (case_id, version_number DESC);

ALTER TABLE public.case_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_assessments FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.protect_case_assessment_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'An assessment cannot be deleted';
  END IF;
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'An approved assessment is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.bump_case_assessment_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER case_assessments_protect
  BEFORE UPDATE OR DELETE ON public.case_assessments
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_case_assessment_v1();

CREATE TRIGGER case_assessments_record_version
  BEFORE UPDATE ON public.case_assessments
  FOR EACH ROW EXECUTE FUNCTION admin_private.bump_case_assessment_version_v1();

REVOKE ALL ON FUNCTION admin_private.protect_case_assessment_v1(), admin_private.bump_case_assessment_version_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.case_assessment_field_v1(p_value text, p_min integer, p_max integer)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  trimmed text;
BEGIN
  IF p_value IS NULL OR length(p_value) > p_max THEN
    RETURN NULL;
  END IF;
  trimmed := btrim(p_value);
  IF length(trimmed) < p_min OR length(trimmed) > p_max THEN
    RETURN NULL;
  END IF;
  RETURN trimmed;
END;
$$;

CREATE FUNCTION admin_private.case_assessment_basis_v1(p_case uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'issue', btrim(coalesce(c.issue_description, '')),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status) ORDER BY r.id)
      FROM public.evidence_requests r
      WHERE r.case_id = p_case
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
  WHERE c.id = p_case;
$$;

CREATE FUNCTION admin_private.case_assessment_fingerprint_v1(p_basis jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT md5(p_basis::text);
$$;

CREATE FUNCTION admin_private.case_assessment_evidence_ready_v1(p_case uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
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
  admin_private.case_assessment_field_v1(text, integer, integer),
  admin_private.case_assessment_basis_v1(uuid),
  admin_private.case_assessment_fingerprint_v1(jsonb),
  admin_private.case_assessment_evidence_ready_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_case_assessment_command_v1(
  p_token text,
  p_request uuid,
  p_case uuid,
  p_version integer,
  p_operation text,
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  c public.cases;
  a public.case_assessments;
  r admin_private.case_command_receipts;
  fp text;
  result jsonb;
  actor uuid;
  requested integer;
  next_version integer;
  v_findings text;
  v_evidence text;
  v_profile text;
  v_policy text;
  v_action text;
  v_pathway text;
  v_rationale text;
  v_risks text;
  v_outstanding text;
  v_basis jsonb;
  v_fingerprint text;
  now_time timestamptz := now();
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_version < 1
     OR p_operation IS NULL OR p_operation NOT IN ('save_draft', 'submit_review', 'approve')
     OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
     OR octet_length(p_data::text) > 48000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF jsonb_typeof(p_data->'recordVersion') <> 'number'
     OR (p_data->>'recordVersion') !~ '^[0-9]+$'
     OR (p_data->>'recordVersion')::integer > 1000000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  requested := (p_data->>'recordVersion')::integer;

  IF p_operation = 'save_draft' THEN
    IF (
      SELECT array_agg(field_name ORDER BY field_name)
      FROM jsonb_object_keys(p_data) AS draft_key(field_name)
    ) IS DISTINCT FROM ARRAY[
      'evidenceConsidered', 'findings', 'outstandingInformation', 'policyConcerns',
      'profileIssue', 'rationale', 'recommendedAction', 'recordVersion', 'risks', 'servicePathway'
    ]::text[] THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    v_findings := admin_private.case_assessment_field_v1(p_data->>'findings', 20, 4000);
    v_evidence := admin_private.case_assessment_field_v1(p_data->>'evidenceConsidered', 10, 4000);
    v_profile := admin_private.case_assessment_field_v1(p_data->>'profileIssue', 0, 2000);
    v_policy := admin_private.case_assessment_field_v1(p_data->>'policyConcerns', 0, 2000);
    v_action := admin_private.case_assessment_field_v1(p_data->>'recommendedAction', 10, 2000);
    v_rationale := admin_private.case_assessment_field_v1(p_data->>'rationale', 20, 4000);
    v_risks := admin_private.case_assessment_field_v1(p_data->>'risks', 10, 2000);
    v_outstanding := admin_private.case_assessment_field_v1(p_data->>'outstandingInformation', 0, 2000);
    v_pathway := p_data->>'servicePathway';
    IF v_findings IS NULL OR v_evidence IS NULL OR v_profile IS NULL OR v_policy IS NULL
       OR v_action IS NULL OR v_rationale IS NULL OR v_risks IS NULL OR v_outstanding IS NULL
       OR v_pathway IS NULL OR v_pathway NOT IN ('GUIDED', 'MANAGED', 'UNDECIDED') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
  ELSE
    IF p_data - 'recordVersion' <> '{}'::jsonb OR requested < 1 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
  END IF;

  fp := md5(jsonb_build_array(p_case, p_version, p_operation, p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = actor AND r.fingerprint = fp THEN
      RETURN r.response;
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL OR c.workflow_version <> p_version THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF c.status IN ('CLOSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  SELECT * INTO a
  FROM public.case_assessments
  WHERE case_id = c.id AND status IN ('DRAFT', 'REVIEWED')
  FOR UPDATE;

  IF p_operation = 'save_draft' AND requested = 0 THEN
    IF a.id IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    SELECT coalesce(max(version_number), 0) + 1 INTO next_version
    FROM public.case_assessments WHERE case_id = c.id;
    v_basis := admin_private.case_assessment_basis_v1(c.id);
    v_fingerprint := admin_private.case_assessment_fingerprint_v1(v_basis);
    INSERT INTO public.case_assessments(
      case_id, version_number, status, findings, evidence_considered, profile_issue, policy_concerns,
      recommended_action, service_pathway, rationale, risks, outstanding_information,
      basis, basis_fingerprint, drafted_by, drafted_at
    ) VALUES (
      c.id, next_version, 'DRAFT', v_findings, v_evidence, v_profile, v_policy,
      v_action, v_pathway, v_rationale, v_risks, v_outstanding,
      v_basis, v_fingerprint, actor, now_time
    ) RETURNING * INTO a;
  ELSIF a.id IS NULL OR a.record_version <> requested THEN
    RETURN jsonb_build_object('status', 'conflict');
  ELSIF p_operation = 'save_draft' THEN
    v_basis := admin_private.case_assessment_basis_v1(c.id);
    v_fingerprint := admin_private.case_assessment_fingerprint_v1(v_basis);
    UPDATE public.case_assessments SET
      status = 'DRAFT',
      findings = v_findings,
      evidence_considered = v_evidence,
      profile_issue = v_profile,
      policy_concerns = v_policy,
      recommended_action = v_action,
      service_pathway = v_pathway,
      rationale = v_rationale,
      risks = v_risks,
      outstanding_information = v_outstanding,
      basis = v_basis,
      basis_fingerprint = v_fingerprint,
      reviewed_by = NULL,
      reviewed_at = NULL,
      approved_by = NULL,
      approved_at = NULL
    WHERE id = a.id
    RETURNING * INTO a;
  ELSIF p_operation = 'submit_review' THEN
    IF a.status <> 'DRAFT' THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    UPDATE public.case_assessments SET
      status = 'REVIEWED',
      reviewed_by = actor,
      reviewed_at = now_time
    WHERE id = a.id
    RETURNING * INTO a;
  ELSE
    IF a.status <> 'REVIEWED' THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    IF a.service_pathway NOT IN ('GUIDED', 'MANAGED') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF NOT admin_private.case_assessment_evidence_ready_v1(c.id) THEN
      RETURN jsonb_build_object('status', 'prerequisite');
    END IF;
    v_basis := admin_private.case_assessment_basis_v1(c.id);
    v_fingerprint := admin_private.case_assessment_fingerprint_v1(v_basis);
    IF a.basis_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RETURN jsonb_build_object('status', 'stale');
    END IF;
    UPDATE public.case_assessments SET
      status = 'APPROVED',
      approved_by = actor,
      approved_at = now_time
    WHERE id = a.id
    RETURNING * INTO a;
  END IF;

  PERFORM admin_private.write_record_audit_v1(
    actor, 'CASE_CHANGED', 'success', c.id, p_request, 'case_assessment',
    'Assessment ' || p_operation,
    jsonb_build_object('operation', p_operation, 'versionNumber', a.version_number, 'pathway', a.service_pathway)
  );
  UPDATE public.cases SET workflow_version = workflow_version WHERE id = c.id;
  result := jsonb_build_object(
    'status', 'success',
    'operation', p_operation,
    'id', a.id,
    'versionNumber', a.version_number,
    'recordVersion', a.record_version
  );
  INSERT INTO admin_private.case_command_receipts(request_id, actor_id, fingerprint, response, created_at)
  VALUES (p_request, actor, fp, result, now_time);
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict');
  WHEN check_violation THEN
    RETURN jsonb_build_object('status', 'invalid');
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
END;
$$;

CREATE FUNCTION public.admin_case_assessment_read_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.cases;
  basis jsonb;
  fingerprint text;
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
        item.basis_fingerprint IS DISTINCT FROM fingerprint
        OR (reopened_at IS NOT NULL AND item.approved_at IS NOT NULL AND reopened_at > item.approved_at)
      ) AS stale,
      CASE
        WHEN item.status <> 'APPROVED' THEN NULL
        WHEN reopened_at IS NOT NULL AND item.approved_at IS NOT NULL AND reopened_at > item.approved_at THEN 'reopened'
        WHEN item.basis_fingerprint IS DISTINCT FROM fingerprint THEN 'facts'
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

REVOKE ALL ON FUNCTION public.admin_case_assessment_command_v1(text, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_case_assessment_read_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_case_assessment_command_v1(text, uuid, uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_assessment_read_v1(text, uuid) TO service_role;
