BEGIN;

-- UX-10C Customer dashboard and cases.
--
-- A presentation over cases the portal customer directly owns
-- (cases.customer_id = the customer derived from the portal session).
-- It does not decide whether a case may progress, and it never writes case state.
--
-- Attention ordering below is for display only. It is not an Admin CaseFlow
-- priority model and it must not be used to authorise anything.

CREATE FUNCTION admin_private.customer_portal_case_attention_v1(
  p_customer_id uuid,
  p_email text,
  p_case_id uuid,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY ordinal, sort_at NULLS LAST, tie, sort_id), '[]'::jsonb)
  FROM (
    SELECT
      jsonb_strip_nulls(jsonb_build_object(
        'code', 'EVIDENCE_REQUIRED',
        'dueAt', r.due_at
      )) AS item,
      1 AS ordinal,
      r.due_at AS sort_at,
      r.created_at AS tie,
      r.id AS sort_id
    FROM public.cases c
    JOIN public.evidence_requests r ON r.case_id = c.id AND r.status = 'OPEN'
    WHERE c.id = p_case_id
      AND c.customer_id = p_customer_id
      AND c.status NOT IN ('CLOSED', 'CANCELLED')
      AND EXISTS (
        SELECT 1
        FROM public.customer_actions a
        WHERE a.evidence_request_id = r.id
          AND a.case_id = c.id
          AND a.customer_id = p_customer_id
          AND a.kind = 'COMMUNICATION_ACCESS'
          AND a.status = 'OPEN'
          AND a.expires_at > p_now
          AND lower(a.expected_email_snapshot) = lower(p_email)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.case_document_versions v
        WHERE v.customer_evidence_request_id = r.id
          AND v.submission_source = 'CUSTOMER'
          AND v.upload_status = 'UPLOADED'
      )
    UNION ALL
    SELECT
      jsonb_build_object(
        'code', CASE
          WHEN a.kind = 'QUOTE_ACCEPTANCE' THEN 'QUOTE_ACCEPTANCE'
          WHEN a.kind = 'AGREEMENT_ACCEPTANCE' AND v.agreement_kind = 'SERVICE_AGREEMENT' THEN 'SERVICE_AGREEMENT'
          WHEN a.kind = 'AGREEMENT_ACCEPTANCE' AND v.agreement_kind = 'CASE_MANAGEMENT_PERMISSION' THEN 'CASE_PERMISSION'
          WHEN a.kind = 'GUIDED_PAYMENT' THEN 'GUIDED_PAYMENT'
          WHEN a.kind = 'MANAGED_PAYMENT_SETUP' THEN 'MANAGED_PAYMENT_SETUP'
          WHEN a.kind = 'PAYMENT_RECOVERY' THEN 'PAYMENT_RECOVERY'
          WHEN a.kind = 'INVOICE_PAYMENT' THEN 'INVOICE_PAYMENT'
          ELSE NULL
        END,
        'expiresAt', a.expires_at
      ),
      CASE
        WHEN a.kind = 'QUOTE_ACCEPTANCE' THEN 2
        WHEN a.kind = 'AGREEMENT_ACCEPTANCE' AND v.agreement_kind = 'SERVICE_AGREEMENT' THEN 3
        WHEN a.kind = 'AGREEMENT_ACCEPTANCE' AND v.agreement_kind = 'CASE_MANAGEMENT_PERMISSION' THEN 4
        WHEN a.kind = 'GUIDED_PAYMENT' THEN 5
        WHEN a.kind = 'MANAGED_PAYMENT_SETUP' THEN 6
        WHEN a.kind = 'PAYMENT_RECOVERY' THEN 7
        WHEN a.kind = 'INVOICE_PAYMENT' THEN 8
        ELSE 99
      END,
      a.expires_at,
      a.created_at,
      a.id
    FROM public.cases c
    JOIN public.customer_actions a
      ON a.case_id = c.id
     AND a.customer_id = p_customer_id
     AND a.status = 'OPEN'
     AND a.expires_at > p_now
     AND lower(a.expected_email_snapshot) = lower(p_email)
     AND a.kind IN (
       'QUOTE_ACCEPTANCE', 'AGREEMENT_ACCEPTANCE', 'GUIDED_PAYMENT',
       'MANAGED_PAYMENT_SETUP', 'PAYMENT_RECOVERY', 'INVOICE_PAYMENT'
     )
    LEFT JOIN public.agreement_versions v ON v.id = a.agreement_version_id
    WHERE c.id = p_case_id
      AND c.customer_id = p_customer_id
      AND c.status NOT IN ('CLOSED', 'CANCELLED')
  ) found
  WHERE item->>'code' IS NOT NULL;
$$;

COMMENT ON FUNCTION admin_private.customer_portal_case_attention_v1(uuid, text, uuid, timestamptz) IS
  'Customer-safe attention codes for one owned open case. Display order is presentation-only and authorises nothing.';

CREATE FUNCTION public.customer_portal_dashboard_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  sess jsonb;
  v_customer uuid;
  v_email text;
  result jsonb;
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

  WITH owned AS MATERIALIZED (
    SELECT
      c.public_ref,
      c.case_type,
      c.service_track,
      b.display_name AS business_name,
      l.location_name,
      c.status,
      c.work_stage,
      c.submitted_at,
      c.closed_at,
      c.status IN ('CLOSED', 'CANCELLED') AS previous,
      admin_private.customer_portal_case_attention_v1(v_customer, v_email, c.id, pg_catalog.now()) AS attention
    FROM public.cases c
    JOIN public.businesses b ON b.id = c.business_id
    JOIN public.locations l ON l.id = c.location_id AND l.business_id = c.business_id
    WHERE c.customer_id = v_customer
  ),
  projected AS (
    SELECT
      previous,
      submitted_at,
      public_ref,
      attention,
      jsonb_build_object(
        'reference', public_ref,
        'caseType', case_type,
        'serviceTrack', service_track,
        'businessName', business_name,
        'locationName', location_name,
        'status', status,
        'workStage', work_stage,
        'submittedAt', submitted_at,
        'closedAt', closed_at,
        'attentionItems', attention
      ) AS row_json
    FROM owned
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'activeCases', (SELECT count(*)::int FROM projected WHERE NOT previous),
      'attentionCases', (SELECT count(*)::int FROM projected WHERE NOT previous AND jsonb_array_length(attention) > 0),
      'previousCases', (SELECT count(*)::int FROM projected WHERE previous)
    ),
    'attentionCases', coalesce((
      SELECT jsonb_agg(row_json ORDER BY submitted_at DESC, public_ref DESC)
      FROM (
        SELECT row_json, submitted_at, public_ref
        FROM projected
        WHERE NOT previous AND jsonb_array_length(attention) > 0
        ORDER BY submitted_at DESC, public_ref DESC
        LIMIT 5
      ) attention_page
    ), '[]'::jsonb),
    'recentCases', coalesce((
      SELECT jsonb_agg(row_json ORDER BY previous, submitted_at DESC, public_ref DESC)
      FROM (
        SELECT row_json, previous, submitted_at, public_ref
        FROM projected
        ORDER BY previous, submitted_at DESC, public_ref DESC
        LIMIT 3
      ) recent_page
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.customer_portal_cases_v1(
  p_token_hash text,
  p_view text,
  p_before_time timestamptz,
  p_before_ref text
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
  result jsonb;
BEGIN
  IF p_view IS NULL OR p_view NOT IN ('active', 'previous', 'all') THEN
    RAISE EXCEPTION 'invalid customer portal cases view' USING ERRCODE = '22023';
  END IF;
  IF (p_before_time IS NULL) IS DISTINCT FROM (p_before_ref IS NULL) THEN
    RAISE EXCEPTION 'invalid customer portal cases cursor' USING ERRCODE = '22023';
  END IF;
  IF p_before_ref IS NOT NULL AND p_before_ref !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'invalid customer portal cases cursor' USING ERRCODE = '22023';
  END IF;

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

  WITH page AS (
    SELECT *
    FROM (
      SELECT
        c.id,
        c.public_ref,
        c.case_type,
        c.service_track,
        b.display_name AS business_name,
        l.location_name,
        c.status,
        c.work_stage,
        c.submitted_at,
        c.closed_at,
        row_number() OVER (ORDER BY c.submitted_at DESC, c.public_ref DESC) AS rn,
        count(*) OVER () AS total
      FROM public.cases c
      JOIN public.businesses b ON b.id = c.business_id
      JOIN public.locations l ON l.id = c.location_id AND l.business_id = c.business_id
      WHERE c.customer_id = v_customer
        AND (
          p_view = 'all'
          OR (p_view = 'active' AND c.status NOT IN ('CLOSED', 'CANCELLED'))
          OR (p_view = 'previous' AND c.status IN ('CLOSED', 'CANCELLED'))
        )
        AND (
          p_before_time IS NULL
          OR (c.submitted_at, c.public_ref) < (p_before_time, p_before_ref)
        )
    ) numbered
    ORDER BY rn
    LIMIT 21
  )
  SELECT jsonb_build_object(
    'cases', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'reference', public_ref,
          'caseType', case_type,
          'serviceTrack', service_track,
          'businessName', business_name,
          'locationName', location_name,
          'status', status,
          'workStage', work_stage,
          'submittedAt', submitted_at,
          'closedAt', closed_at,
          'attentionItems', admin_private.customer_portal_case_attention_v1(v_customer, v_email, id, pg_catalog.now())
        )
        ORDER BY rn
      )
      FROM page
      WHERE rn <= 20
    ), '[]'::jsonb),
    'nextCursor', (
      SELECT CASE
        WHEN total > 20 THEN jsonb_build_object('submittedAt', submitted_at, 'reference', public_ref)
        ELSE NULL
      END
      FROM page
      WHERE rn = 20
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_case_attention_v1(uuid, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.customer_portal_dashboard_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_cases_v1(text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_dashboard_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_portal_cases_v1(text, text, timestamptz, text) TO service_role;

COMMIT;
