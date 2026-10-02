-- UX-3 case queue: one batch CaseFlow fact projection.
-- Adds public.admin_case_flow_facts_v1(text, uuid[]).
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED
-- Generated with: npx supabase migration new admin_case_flow_batch_v1
-- Do not apply from this PR. Do not replay or modify applied migrations (Steps 1-24).
--
-- ---------------------------------------------------------------------------
-- Why this exists.
--
-- UX-1 built the CaseFlow model on top of eight Admin read RPCs, composed per
-- case in TypeScript: admin_case_detail_v1, admin_case_authorization_v1,
-- admin_evidence_case_v1, admin_prepared_pack_case_v1,
-- admin_communication_list_v1, admin_quote_list_v1, admin_payment_list_v1 and
-- admin_complaint_list_v1. That is affordable for one case on the Case page.
-- It is not affordable for a queue: fifty rows would be four hundred round
-- trips. This function is the projection that replaces it — one call returns
-- the complete fact tree for every requested case.
--
-- What it is NOT.
--
-- It carries no workflow decision. It does not say which phase a case is in,
-- what the next action is, who is waiting or what is blocking. Those stay in
-- resolveCaseFlow(), the pure TypeScript resolver UX-1 shipped and UX-3 does
-- not touch. This file supplies the same raw facts the eight reads supplied,
-- scoped to the requested cases, and nothing more.
--
-- Two facts become stronger as a result, because scoping fixes a real gap.
-- admin_quote_list_v1 and admin_complaint_list_v1 are global and capped at one
-- hundred rows, so UX-1 had to carry a `complete` flag meaning "an empty
-- result might only mean the page was full". This projection filters by
-- case_id in the database, inspects every row for that case, and can therefore
-- report commercial and complaint state as complete. The resolver's
-- CONFIRM_COMMERCIAL_STATE path still exists; it simply stops firing for a
-- reason that was never about the case.
--
-- The reopened fact becomes exact for the same reason. UX-1 read it from the
-- most recent fifty-one case_work_events rows returned by admin_case_detail_v1
-- and recorded the limitation as DATA_PROJECTION_GAP. Here it is an EXISTS
-- over the whole event history, which closes that gap without returning any
-- history to the caller.
--
-- Security.
--
-- Identical to every other Admin read RPC in this repository: SECURITY DEFINER
-- with an empty search_path, gated on public.admin_session_v1(p_token) — the
-- hashed Admin session token, hashed on the server in TypeScript — revoked
-- from PUBLIC, anon and authenticated, and granted only to service_role. No
-- caller-supplied identity is trusted, no RLS policy is widened, and no table
-- or column is added. Nothing secret-bearing is projected: no customer-action
-- secret, no storage bucket or key, no provider or OAuth credential, no token
-- and no email address, masked or otherwise.
--
-- Bounds.
--
-- The case list is capped at fifty identifiers, matching the Cases page size.
-- A null array, a null element or an oversized array is rejected outright; an
-- empty array returns an empty result; duplicates are collapsed. Callers get
-- facts only for cases that exist, so a requested identifier that does not
-- resolve is simply absent and the TypeScript loader fails closed on it.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE FUNCTION public.admin_case_flow_facts_v1(p_token text, p_case_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; payload jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_case_ids IS NULL THEN RAISE EXCEPTION 'Invalid case flow batch'; END IF;
  IF cardinality(p_case_ids) > 50 THEN RAISE EXCEPTION 'Invalid case flow batch'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_case_ids) x WHERE x IS NULL) THEN RAISE EXCEPTION 'Invalid case flow batch'; END IF;
  IF cardinality(p_case_ids) = 0 THEN RETURN jsonb_build_object('cases', '[]'::jsonb); END IF;
  SELECT array_agg(DISTINCT x) INTO ids FROM unnest(p_case_ids) x;

  SELECT coalesce(jsonb_agg(row.facts ORDER BY row.id), '[]'::jsonb) INTO payload
  FROM (
    SELECT c.id, jsonb_build_object(
      'caseId', c.id,
      'reference', c.public_ref,
      'caseType', c.case_type,
      'technicalStage', c.work_stage,
      'caseStatus', c.status,
      'serviceTrack', c.service_track,
      'outcome', c.outcome,
      'outcomeSummary', c.closure_summary,
      'customerId', c.customer_id,
      'businessId', c.business_id,
      'locationId', c.location_id,
      'plannedNextAction', c.next_action,
      'plannedNextActionDueAt', c.next_action_at,
      'allowedTransitions', coalesce((
        SELECT jsonb_agg(t.to_stage ORDER BY t.to_stage)
        FROM admin_private.case_transitions t WHERE t.from_stage = c.work_stage
      ), '[]'::jsonb),
      -- Exact, unlike the UX-1 reading of a fifty-one row event window.
      'reopened', EXISTS (
        SELECT 1 FROM public.case_work_events e WHERE e.case_id = c.id AND e.event = 'reopen'
      ),
      'tasks', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'title', t.title, 'owner', t.owner, 'kind', t.kind,
          'status', t.status, 'dueAt', t.due_at
        ) ORDER BY t.due_at, t.id)
        FROM public.case_tasks t WHERE t.case_id = c.id
      ), '[]'::jsonb),
      'submissions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'actor', s.actor, 'submittedAt', s.submitted_at, 'result', sr.result
        ) ORDER BY s.created_at, s.id)
        FROM public.case_submissions s
        LEFT JOIN public.case_submission_results sr ON sr.submission_id = s.id
        WHERE s.case_id = c.id
      ), '[]'::jsonb),
      'authorization', jsonb_build_object(
        'membershipStatus', coalesce((
          SELECT m.status FROM public.business_memberships m
          WHERE m.customer_id = c.customer_id AND m.business_id = c.business_id
        ), 'missing'),
        -- The authoritative readiness aggregate, consumed not recomputed.
        'customerEmailVerified', coalesce((rd.readiness->>'customerEmailVerified')::boolean, false),
        'businessAuthorityVerified', coalesce((rd.readiness->>'businessAuthorityVerified')::boolean, false),
        'serviceAgreementAccepted', coalesce((rd.readiness->>'serviceAgreementAccepted')::boolean, false),
        'caseManagementPermissionActive', coalesce((rd.readiness->>'caseManagementPermissionActive')::boolean, false),
        'managerAccessVerified', coalesce((rd.readiness->>'managerAccessVerified')::boolean, false),
        'authorizationReady', coalesce((rd.readiness->>'authorizationReady')::boolean, false),
        'reviewRequired', coalesce((
          SELECT jsonb_agg(r.authorization_kind ORDER BY r.accepted_at DESC)
          FROM public.authorization_records r
          WHERE r.case_id = c.id AND r.status = 'REVIEW_REQUIRED'
        ), '[]'::jsonb),
        'agreementKinds', coalesce((
          SELECT jsonb_agg(DISTINCT v.agreement_kind)
          FROM public.agreement_versions v WHERE v.case_id = c.id
        ), '[]'::jsonb),
        'hasLocation', c.location_id IS NOT NULL
      ),
      -- The action secret is not a column of customer_actions and is not
      -- derivable from anything returned here.
      'customerActions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'kind', a.kind,
          'agreementKind', (
            SELECT av.agreement_kind FROM public.agreement_versions av WHERE av.id = a.agreement_version_id
          ),
          'status', a.status, 'expiresAt', a.expires_at
        ) ORDER BY a.created_at DESC)
        FROM (
          SELECT * FROM public.customer_actions
          WHERE case_id = c.id ORDER BY created_at DESC LIMIT 20
        ) a
      ), '[]'::jsonb),
      'evidence', jsonb_build_object(
        'requests', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', r.id, 'status', r.status, 'dueAt', r.due_at, 'createdAt', r.created_at
          ) ORDER BY r.created_at DESC, r.id DESC)
          FROM public.evidence_requests r WHERE r.case_id = c.id
        ), '[]'::jsonb),
        'versions', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'documentId', d.id, 'versionId', v.id, 'evidenceRequestId', d.evidence_request_id,
            'uploadStatus', v.upload_status, 'scanStatus', v.scan_status,
            'validationStatus', v.validation_status, 'reviewStatus', v.review_status
          ) ORDER BY d.created_at DESC, d.id DESC, v.version_number DESC)
          FROM public.case_documents d
          INNER JOIN public.case_document_versions v ON v.document_id = d.id
          WHERE d.case_id = c.id
        ), '[]'::jsonb)
      ),
      'packs', jsonb_build_object(
        'packs', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', p.id, 'packNumber', p.pack_number, 'status', p.status,
            'published', (p.published_at IS NOT NULL AND p.unpublished_at IS NULL),
            'everPublished', (p.published_at IS NOT NULL),
            'itemCount', (
              SELECT count(*) FROM public.case_prepared_pack_items i
              INNER JOIN public.case_document_versions iv ON iv.id = i.version_id
              WHERE i.pack_id = p.id
            )
          ) ORDER BY p.pack_number DESC)
          FROM (
            SELECT * FROM public.case_prepared_packs
            WHERE case_id = c.id ORDER BY pack_number DESC LIMIT 20
          ) p
        ), '[]'::jsonb),
        'eligibleCount', (
          SELECT count(*) FROM public.case_document_versions v
          INNER JOIN public.case_documents d ON d.id = v.document_id
          WHERE d.case_id = c.id
            AND v.upload_status = 'UPLOADED'
            AND v.scan_status = 'NO_THREATS_FOUND'
            AND v.validation_status = 'VALID'
            AND v.review_status = 'ACCEPTED'
        )
      ),
      'commercial', jsonb_build_object(
        -- Case-scoped, so an empty list genuinely means there is no quote.
        'complete', true,
        'quotes', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', qu.id, 'status', qu.status, 'taxBehaviour', qv.tax_behaviour,
            'validUntil', qv.valid_until,
            'actionStatus', act.status, 'actionExpiresAt', act.expires_at,
            'orderId', ord.id
          ) ORDER BY qu.created_at DESC)
          FROM public.quotes qu
          INNER JOIN public.quote_versions qv ON qv.id = qu.current_version_id
          LEFT JOIN LATERAL (
            SELECT a.status, a.expires_at FROM public.customer_actions a
            WHERE a.quote_version_id = qv.id AND a.kind = 'QUOTE_ACCEPTANCE'
            ORDER BY a.created_at DESC LIMIT 1
          ) act ON true
          LEFT JOIN public.service_orders ord ON ord.quote_version_id = qv.id
          WHERE qu.case_id = c.id
        ), '[]'::jsonb)
      ),
      'payment', jsonb_build_object(
        'complete', true,
        'orders', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'orderId', o.id, 'paymentModel', o.payment_model, 'orderState', o.state,
            'obligationKind', ob.kind, 'obligationState', ob.state,
            'setupReady', EXISTS (
              SELECT 1 FROM public.saved_payment_methods pm
              WHERE pm.service_order_id = o.id AND pm.status = 'USABLE'
            ),
            'consentRecorded', pc.id IS NOT NULL,
            'receiptRecorded', pr.id IS NOT NULL
          ) ORDER BY o.created_at DESC)
          FROM public.service_orders o
          LEFT JOIN public.payment_obligations ob ON ob.service_order_id = o.id AND ob.state <> 'VOID'
          LEFT JOIN public.payment_consents pc ON pc.service_order_id = o.id
          LEFT JOIN public.payment_receipts pr ON pr.service_order_id = o.id
          WHERE o.case_id = c.id
        ), '[]'::jsonb)
      ),
      'communications', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'templateKey', m.template_key, 'lifecycle', m.lifecycle,
          'deliveryStatus', m.delivery_status,
          'legacyStatus', CASE WHEN m.lifecycle IS NULL THEN m.status ELSE NULL END,
          'draftedAt', m.created_at
        ) ORDER BY m.updated_at DESC, m.id DESC)
        FROM (
          SELECT * FROM public.communications
          WHERE case_id = c.id ORDER BY updated_at DESC, id DESC LIMIT 50
        ) m
      ), '[]'::jsonb),
      'complaints', jsonb_build_object(
        -- Case-scoped, so an empty list genuinely means there is no complaint.
        'complete', true,
        'open', coalesce((
          SELECT jsonb_agg(jsonb_build_object('id', x.id, 'dueAt', x.due_at)
            ORDER BY x.received_at DESC, x.id DESC)
          FROM public.complaints x
          WHERE x.case_id = c.id AND x.status IN ('OPEN','ACKNOWLEDGED')
        ), '[]'::jsonb)
      )
    ) AS facts
    FROM public.cases c
    CROSS JOIN LATERAL (
      SELECT admin_private.case_authorization_readiness_v1(c.id) AS readiness
    ) rd
    WHERE c.id = ANY(ids)
  ) row;

  RETURN jsonb_build_object('cases', payload);
END; $$;

REVOKE ALL ON FUNCTION public.admin_case_flow_facts_v1(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_case_flow_facts_v1(text, uuid[]) TO service_role;

COMMIT;
