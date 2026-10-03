BEGIN;

-- UX-10D Customer case workspace.
--
-- A read-only projection of one case the portal customer directly owns
-- (cases.public_ref = the requested reference AND cases.customer_id = the
-- customer derived from the portal session). It does not decide whether a
-- case may progress, and it never writes case state.
--
-- The timeline is curated from specific tables. It does not read the generic
-- case event log or its payload. Customer-facing sentences are not stored here: PostgreSQL
-- returns a code and a timestamp only.
--
-- Customer progress (the six-step presentation) is not computed or persisted
-- in the database. It is a current-position view owned by the application.

CREATE FUNCTION admin_private.customer_portal_case_timeline_v1(
  p_case_id uuid,
  p_customer_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT coalesce((
    SELECT jsonb_agg(
      jsonb_build_object('code', code, 'occurredAt', occurred_at)
      ORDER BY occurred_at DESC, ordinal, source_id
    )
    FROM (
      SELECT code, occurred_at, ordinal, source_id
      FROM (
        SELECT
          'CASE_RECEIVED'::text AS code,
          c.submitted_at AS occurred_at,
          1 AS ordinal,
          c.id AS source_id
        FROM public.cases c
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'EVIDENCE_SUBMITTED', v.uploaded_at, 2, v.id
        FROM public.cases c
        JOIN public.case_document_versions v ON v.submission_source = 'CUSTOMER'
          AND v.upload_status = 'UPLOADED'
          AND v.uploaded_at IS NOT NULL
        JOIN public.case_documents d ON d.id = v.document_id AND d.case_id = c.id
        JOIN public.evidence_requests r ON r.id = v.customer_evidence_request_id AND r.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND (d.evidence_request_id IS NULL OR d.evidence_request_id = r.id)

        UNION ALL
        SELECT 'EVIDENCE_ACCEPTED', v.reviewed_at, 3, v.id
        FROM public.cases c
        JOIN public.case_document_versions v ON v.submission_source = 'CUSTOMER'
          AND v.review_status = 'ACCEPTED'
          AND v.reviewed_at IS NOT NULL
        JOIN public.case_documents d ON d.id = v.document_id AND d.case_id = c.id
        JOIN public.evidence_requests r ON r.id = v.customer_evidence_request_id AND r.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND (d.evidence_request_id IS NULL OR d.evidence_request_id = r.id)

        UNION ALL
        SELECT 'QUOTE_ACCEPTED', qa.accepted_at, 4, qa.id
        FROM public.cases c
        JOIN public.quote_versions qv ON qv.case_id = c.id AND qv.customer_id = c.customer_id
        JOIN public.quotes q ON q.id = qv.quote_id AND q.case_id = c.id AND q.customer_id = c.customer_id
        JOIN public.quote_acceptances qa ON qa.quote_version_id = qv.id AND qa.quote_id = q.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 'SERVICE_AGREEMENT_ACCEPTED'
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 'CASE_PERMISSION_CONFIRMED'
          END,
          ar.accepted_at,
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 5
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 6
          END,
          ar.id
        FROM public.cases c
        JOIN public.authorization_records ar
          ON ar.case_id = c.id
         AND ar.customer_id = c.customer_id
         AND ar.authorization_kind IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 'SERVICE_AGREEMENT_WITHDRAWN'
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 'CASE_PERMISSION_WITHDRAWN'
          END,
          ar.revoked_at,
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 7
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 8
          END,
          ar.id
        FROM public.cases c
        JOIN public.authorization_records ar
          ON ar.case_id = c.id
         AND ar.customer_id = c.customer_id
         AND ar.authorization_kind IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
         AND ar.revoked_at IS NOT NULL
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'PAYMENT_RECEIVED', rc.paid_at, 9, rc.id
        FROM public.cases c
        JOIN public.payment_receipts rc ON rc.customer_id = c.customer_id
        JOIN public.payment_obligations ob
          ON ob.id = rc.obligation_id
         AND ob.customer_id = c.customer_id
         AND ob.case_id = c.id
         AND ob.service_order_id = rc.service_order_id
        JOIN public.service_orders so
          ON so.id = rc.service_order_id
         AND so.customer_id = c.customer_id
         AND so.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'SUBMITTED_TO_GOOGLE', s.submitted_at, 10, s.id
        FROM public.cases c
        JOIN public.case_submissions s ON s.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'GOOGLE_DECISION_RECORDED', sr.created_at, 11, s.id
        FROM public.cases c
        JOIN public.case_submissions s ON s.case_id = c.id
        JOIN public.case_submission_results sr ON sr.submission_id = s.id AND sr.result = 'DECIDED'
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT
          CASE c.status
            WHEN 'CLOSED' THEN 'CASE_COMPLETED'
            WHEN 'CANCELLED' THEN 'CASE_CANCELLED'
          END,
          c.closed_at,
          CASE c.status WHEN 'CLOSED' THEN 12 ELSE 13 END,
          c.id
        FROM public.cases c
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.closed_at IS NOT NULL
          AND c.status IN ('CLOSED', 'CANCELLED')
      ) raw
      WHERE code IS NOT NULL AND occurred_at IS NOT NULL
      ORDER BY occurred_at DESC, ordinal, source_id
      LIMIT 21
    ) limited
  ), '[]'::jsonb);
$$;

COMMENT ON FUNCTION admin_private.customer_portal_case_timeline_v1(uuid, uuid) IS
  'At most 21 customer-safe timeline codes for one owned case, newest first. Codes and timestamps only. Not workflow history.';

CREATE FUNCTION public.customer_portal_case_v1(
  p_token_hash text,
  p_reference text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  sess jsonb;
  v_customer uuid;
  v_email text;
  v_case_id uuid;
  v_case jsonb;
  v_events jsonb;
  v_count integer;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_customer := (sess->>'customerId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
  v_email := sess->>'email';
  IF v_customer IS NULL OR v_email IS NULL OR length(btrim(v_email)) = 0 THEN
    RETURN NULL;
  END IF;

  -- A reference that does not exist and a reference owned by someone else
  -- return the same object. An ill-formed reference does too. Neither result
  -- says why.
  IF p_reference IS NULL OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT
    c.id,
    jsonb_build_object(
      'reference', c.public_ref,
      'caseType', c.case_type,
      'serviceTrack', c.service_track,
      'businessName', b.display_name,
      'locationName', l.location_name,
      'status', c.status,
      'workStage', c.work_stage,
      'submittedAt', c.submitted_at,
      'closedAt', c.closed_at,
      'attentionItems', admin_private.customer_portal_case_attention_v1(v_customer, v_email, c.id, pg_catalog.now()),
      'outcomeCode', CASE
        WHEN c.case_type = 'PROFILE_RECOVERY' AND c.outcome = 'RESTORED' THEN 'RESTORED'
        WHEN c.case_type = 'REVIEW_PROTECTION' AND c.outcome = 'REMOVED' THEN 'REMOVED'
        ELSE NULL
      END
    )
  INTO v_case_id, v_case
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id AND l.business_id = c.business_id
  WHERE c.public_ref = p_reference
    AND c.customer_id = v_customer;

  IF v_case_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_events := admin_private.customer_portal_case_timeline_v1(v_case_id, v_customer);
  v_count := jsonb_array_length(v_events);

  RETURN jsonb_build_object(
    'found', true,
    'case', v_case,
    'timeline', coalesce((
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM jsonb_array_elements(v_events) WITH ORDINALITY AS t(elem, ord)
      WHERE ord <= 20
    ), '[]'::jsonb),
    'timelineTruncated', v_count > 20
  );
END;
$$;

COMMENT ON FUNCTION public.customer_portal_case_v1(text, text) IS
  'One owned customer case, or {found:false}. Invalid portal sessions return NULL. No case id is accepted or returned.';

REVOKE ALL ON FUNCTION admin_private.customer_portal_case_timeline_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.customer_portal_case_v1(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_case_v1(text, text) TO service_role;

COMMIT;
