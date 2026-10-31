BEGIN;

-- Guided customer handover and Google-outcome reporting. Source only.
-- Do not apply this file to DEV or Production from this change.
-- It does not send mail, charge a card, close a case, or edit a stored outcome.
-- A customer report is not written as a ProfileRelaunch case_submissions row.

ALTER TABLE public.guided_customer_reports
  ADD COLUMN outcome text,
  ADD COLUMN decided_on date,
  ADD COLUMN evidence_document_id uuid;

ALTER TABLE public.guided_customer_reports
  DROP CONSTRAINT guided_customer_reports_kind_check;
ALTER TABLE public.guided_customer_reports
  DROP CONSTRAINT guided_customer_reports_shape_check;

ALTER TABLE public.guided_customer_reports
  ADD CONSTRAINT guided_customer_reports_kind_check
  CHECK (kind IN ('CORRECTION', 'GOOGLE_SUBMISSION', 'GOOGLE_OUTCOME'));

ALTER TABLE public.guided_customer_reports
  ADD CONSTRAINT guided_customer_reports_evidence_fk
  FOREIGN KEY (evidence_document_id) REFERENCES public.case_documents(id) ON DELETE RESTRICT;

ALTER TABLE public.guided_customer_reports
  ADD CONSTRAINT guided_customer_reports_shape_check CHECK (
    (kind = 'CORRECTION' AND submitted_on IS NULL AND google_reference IS NULL AND task_id IS NOT NULL
      AND outcome IS NULL AND decided_on IS NULL AND evidence_document_id IS NULL)
    OR (
      kind = 'GOOGLE_SUBMISSION' AND submitted_on IS NOT NULL
      AND outcome IS NULL AND decided_on IS NULL AND evidence_document_id IS NULL
      AND (
        google_reference IS NULL
        OR (
          length(btrim(google_reference)) BETWEEN 1 AND 200
          AND google_reference ~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          AND position('http' IN lower(google_reference)) = 0
        )
      )
    )
    OR (
      kind = 'GOOGLE_OUTCOME' AND submitted_on IS NULL AND decided_on IS NOT NULL AND task_id IS NOT NULL
      AND outcome IN ('STILL_WAITING', 'REINSTATED', 'NOT_REINSTATED', 'MORE_INFORMATION', 'OTHER')
      AND (
        google_reference IS NULL
        OR (
          length(btrim(google_reference)) BETWEEN 1 AND 200
          AND google_reference ~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          AND position('http' IN lower(google_reference)) = 0
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.customer_portal_case_documents_v1(p_token_hash text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid; cs public.cases;
  b public.businesses; loc public.locations; body jsonb; p public.case_prepared_packs;
  ord public.service_orders; pack_json jsonb; selectors jsonb; reason text;
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
  reason := admin_private.guided_settlement_reason_v1(cs.id);
  pack_json := NULL;
  IF cs.service_track = 'GUIDED' AND reason IS NOT NULL THEN
    body := jsonb_set(body, '{documents}', '[]'::jsonb);
  ELSIF cs.service_track = 'GUIDED' AND reason IS NULL THEN
    SELECT * INTO p FROM public.case_prepared_packs
    WHERE case_id = cs.id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
    LIMIT 1;
    IF p.id IS NOT NULL AND admin_private.pack_publishable_v1(p.id) THEN
      SELECT * INTO ord FROM public.service_orders candidate
      WHERE candidate.case_id = cs.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
        AND candidate.payment_model = 'UPFRONT';
      SELECT coalesce(jsonb_agg('pd-' || i.position::text ORDER BY i.position), '[]'::jsonb) INTO selectors
      FROM public.case_prepared_pack_items i
      INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
      WHERE i.pack_id = p.id AND r.role = 'INSTRUCTIONS';
      pack_json := jsonb_build_object(
        'title', CASE ord.service_code WHEN 'GUIDED_REVIEW' THEN 'Guided Review submission pack' ELSE 'Guided Relaunch submission pack' END,
        'serviceName', CASE ord.service_code WHEN 'GUIDED_REVIEW' THEN 'Guided Review' ELSE 'Guided Relaunch' END,
        'packNumber', p.pack_number,
        'instructions', 'You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you.',
        'instructionSelectors', coalesce(selectors, '[]'::jsonb),
        'customerSubmitted', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION'
        ),
        'correctionRequested', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          INNER JOIN public.case_tasks task ON task.id = report.task_id
          WHERE report.pack_id = p.id AND report.kind = 'CORRECTION' AND task.status = 'OPEN'
        )
,
        'outcomeReported', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_OUTCOME'
        ),
        'outcomeReviewed', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          INNER JOIN public.case_tasks task ON task.id = report.task_id
          WHERE report.id = (
            SELECT latest.id FROM public.guided_customer_reports latest
            WHERE latest.pack_id = p.id AND latest.kind = 'GOOGLE_OUTCOME'
            ORDER BY latest.created_at DESC, latest.id DESC
            LIMIT 1
          )
          AND task.status <> 'OPEN'
        )
      );
    END IF;
  END IF;
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
    'documents', body->'documents',
    'pack', pack_json
  );
END; $$;


CREATE OR REPLACE FUNCTION public.customer_portal_guided_handover_v1(
  p_token_hash text, p_request uuid, p_reference text, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_customer uuid; v_auth uuid; v_email text; v_case uuid;
  cs public.cases; p public.case_prepared_packs; fp text; cached jsonb; result jsonb;
  note text; reference text; submitted date; decided date; task_id uuid;
  outcome text; selector text; evidence_request uuid; evidence_id uuid;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_operation NOT IN ('request_correction', 'report_submission', 'report_outcome')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_reference, p_operation, p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT response INTO cached FROM admin_private.guided_handover_receipts
  WHERE request_id = p_request AND actor_id = v_auth AND fingerprint = fp;
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF EXISTS (SELECT 1 FROM admin_private.guided_handover_receipts WHERE request_id = p_request) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer FOR UPDATE;
  IF cs.id IS NULL OR cs.service_track IS DISTINCT FROM 'GUIDED' OR cs.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF admin_private.guided_settlement_reason_v1(cs.id) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unavailable');
  END IF;
  SELECT * INTO p FROM public.case_prepared_packs
  WHERE case_id = cs.id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
  LIMIT 1;
  IF p.id IS NULL OR NOT admin_private.pack_publishable_v1(p.id) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  note := btrim(coalesce(p_data->>'note', ''));
  IF length(note) NOT BETWEEN 10 AND 2000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'request_correction' THEN
    IF (p_data - 'note') <> '{}'::jsonb OR p_data ? 'submittedOn' OR p_data ? 'googleReference' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.guided_customer_reports report
      INNER JOIN public.case_tasks task ON task.id = report.task_id
      WHERE report.pack_id = p.id AND report.kind = 'CORRECTION' AND task.status = 'OPEN'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.case_tasks(
      case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy
    ) VALUES (
      cs.id, 'Review a correction to the Guided pack', 'ADMIN', 'FOLLOW_UP', now() + interval '2 days',
      'The customer asked for a correction before submitting the pack to Google', 'Europe/London', 'MANUAL_QUEUE'
    ) RETURNING id INTO task_id;
    INSERT INTO public.guided_customer_reports(case_id, customer_id, pack_id, kind, note, task_id)
    VALUES (cs.id, cs.customer_id, p.id, 'CORRECTION', note, task_id);
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility)
    VALUES (cs.id, v_auth, 'CUSTOMER_CORRECTION', note, 'CUSTOMER');
    result := jsonb_build_object('status', 'success', 'kind', 'CORRECTION');
  ELSIF p_operation = 'report_submission' THEN
    IF (p_data - 'note' - 'submittedOn' - 'googleReference') <> '{}'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    reference := nullif(btrim(coalesce(p_data->>'googleReference', '')), '');
    BEGIN submitted := (p_data->>'submittedOn')::date; EXCEPTION WHEN OTHERS THEN submitted := NULL; END;
    IF submitted IS NULL OR submitted > current_date OR submitted < DATE '2020-01-01'
      OR (
        reference IS NOT NULL AND (
          reference !~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          OR position('http' IN lower(reference)) > 0
        )
      )
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (SELECT 1 FROM public.guided_customer_reports report WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION') THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    INSERT INTO public.case_tasks(
      case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy
    ) VALUES (
      cs.id, 'Review the customer''s Google submission report', 'ADMIN', 'FOLLOW_UP', now() + interval '2 days',
      'The customer reported that they submitted the Guided pack to Google', 'Europe/London', 'MANUAL_QUEUE'
    ) RETURNING id INTO task_id;
    INSERT INTO public.guided_customer_reports(
      case_id, customer_id, pack_id, kind, note, submitted_on, google_reference, task_id
    ) VALUES (cs.id, cs.customer_id, p.id, 'GOOGLE_SUBMISSION', note, submitted, reference, task_id);
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
    VALUES (
      cs.id, v_auth, 'CUSTOMER_REPORTED_SUBMISSION', note, 'CUSTOMER',
      jsonb_build_object('recordedBy', 'customer', 'profileRelaunchSubmitted', false)
    );
    result := jsonb_build_object('status', 'success', 'kind', 'GOOGLE_SUBMISSION');
  ELSE
    IF (p_data - 'note' - 'outcome' - 'decidedOn' - 'googleReference' - 'evidenceSelector') <> '{}'::jsonb
      OR NOT (p_data ? 'outcome' AND p_data ? 'decidedOn')
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.guided_customer_reports report
      WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION'
    ) THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'submission'); END IF;
    outcome := p_data->>'outcome';
    IF outcome NOT IN ('STILL_WAITING', 'REINSTATED', 'NOT_REINSTATED', 'MORE_INFORMATION', 'OTHER') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    reference := nullif(btrim(coalesce(p_data->>'googleReference', '')), '');
    BEGIN decided := (p_data->>'decidedOn')::date; EXCEPTION WHEN OTHERS THEN decided := NULL; END;
    IF decided IS NULL OR decided > current_date OR decided < DATE '2020-01-01'
      OR (
        reference IS NOT NULL AND (
          reference !~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          OR position('http' IN lower(reference)) > 0
        )
      )
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    evidence_id := NULL;
    IF p_data ? 'evidenceSelector' THEN
      selector := btrim(coalesce(p_data->>'evidenceSelector', ''));
      evidence_request := admin_private.customer_portal_evidence_selector_v1(cs.id, selector);
      IF evidence_request IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      SELECT d.id INTO evidence_id
      FROM public.case_documents d
      INNER JOIN public.case_document_versions v ON v.document_id = d.id
      WHERE d.case_id = cs.id
        AND d.evidence_request_id = evidence_request
        AND v.customer_evidence_request_id = evidence_request
        AND v.submission_source = 'CUSTOMER'
        AND v.upload_status = 'UPLOADED'
        AND v.uploaded_at IS NOT NULL
      ORDER BY v.uploaded_at DESC, v.id DESC
      LIMIT 1;
      IF evidence_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    END IF;
    SELECT task.id INTO task_id
    FROM public.case_tasks task
    INNER JOIN public.guided_customer_reports report ON report.task_id = task.id
    WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_OUTCOME' AND task.status = 'OPEN'
    LIMIT 1;
    IF task_id IS NULL THEN
      INSERT INTO public.case_tasks(
        case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy
      ) VALUES (
        cs.id, 'Review the customer''s Google outcome report', 'ADMIN', 'FOLLOW_UP', now() + interval '2 days',
        'The customer reported a Google outcome for the Guided pack', 'Europe/London', 'MANUAL_QUEUE'
      ) RETURNING id INTO task_id;
    END IF;
    INSERT INTO public.guided_customer_reports(
      case_id, customer_id, pack_id, kind, note, google_reference, task_id, outcome, decided_on, evidence_document_id
    ) VALUES (
      cs.id, cs.customer_id, p.id, 'GOOGLE_OUTCOME', note, reference, task_id, outcome, decided, evidence_id
    );
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
    VALUES (
      cs.id, v_auth, 'CUSTOMER_REPORTED_OUTCOME', note, 'CUSTOMER',
      jsonb_build_object('outcome', outcome, 'verified', false, 'recordedBy', 'customer')
    );
    result := jsonb_build_object('status', 'success', 'kind', 'GOOGLE_OUTCOME', 'outcome', outcome);
  END IF;
  INSERT INTO admin_private.guided_handover_receipts VALUES (p_request, v_auth, fp, result, now());
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.customer_portal_case_documents_v1(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_case_documents_v1(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION admin_private.fulfilment_snapshot_reason_v1(
  p_case uuid, p_template text, p_subject text, p_text text, p_html text, p_origin text
) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  c public.cases;
  ord public.service_orders;
  page text;
  button text;
  expected text;
  amount_label text;
  service_name text;
  stripped text;
  settlement text;
BEGIN
  settlement := admin_private.guided_settlement_reason_v1(p_case);
  IF settlement IS NOT NULL THEN RETURN settlement; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT';
  service_name := CASE ord.service_code WHEN 'GUIDED_RELAUNCH' THEN 'Guided Relaunch' ELSE 'Guided Review' END;
  amount_label := '£' || (ord.amount_minor / 100)::text || '.' || lpad((ord.amount_minor % 100)::text, 2, '0') || ' GBP';
  IF p_template = 'PAYMENT_CONFIRMATION' THEN
    page := 'payments';
    button := 'View your receipt';
  ELSIF p_template IN ('GUIDED_PACK_READY', 'GUIDED_COMPLETION') THEN
    page := 'documents';
    button := 'View your completed pack';
  ELSE
    RETURN 'template';
  END IF;
  expected := p_origin || '/portal/cases/' || c.public_ref || '/' || page;
  IF p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 8 AND 200
    OR position(c.public_ref IN p_subject) = 0
    OR (p_template = 'PAYMENT_CONFIRMATION' AND position(ord.public_ref IN p_subject) = 0)
    OR position(service_name IN coalesce(p_text, '')) = 0
    OR position(amount_label IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_html, '')) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN coalesce(p_text, '')) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN coalesce(p_text, '')) = 0
    OR position('#t=' IN coalesce(p_subject, '') || coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('/action/' IN coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('pi_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR position('cus_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR admin_private.fulfilment_page_count_v1(p_text, page) IS DISTINCT FROM 1
    OR admin_private.fulfilment_page_count_v1(p_html, page) IS DISTINCT FROM 1
    OR position(expected IN coalesce(p_text, '')) = 0
    OR position(expected IN coalesce(p_html, '')) = 0
    OR position('reply to this email' IN lower(coalesce(p_text, ''))) = 0
    OR position('reply to this email' IN lower(coalesce(p_html, ''))) = 0
  THEN RETURN 'snapshot'; END IF;
  IF p_template IN ('GUIDED_PACK_READY', 'GUIDED_COMPLETION') AND position(
    'You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you.'
    IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  IF p_template = 'GUIDED_COMPLETION' AND position(
    'Relaunch Guard is optional. This email does not enrol you.' IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  IF p_template = 'GUIDED_COMPLETION' AND position(
    'Your ' || service_name || ' service is complete. Your submission pack remains available in your account. You can tell us when you''ve submitted it to Google and update us when you hear back.'
    IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_text, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_html, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_guided_fulfilment_close_v1(
  p_token text, p_request uuid, p_case uuid, p_version integer, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  s jsonb;
  c public.cases;
  r admin_private.case_command_receipts;
  actor uuid;
  fp text;
  note text;
  summary text;
  pack uuid;
  published integer;
  mail jsonb;
  comm uuid;
  result jsonb;
  now_time timestamptz := now();
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_data IS NULL
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 65536
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_data - ARRAY['note','summary','subject','bodyText','bodyHtml','fromAddress','replyTo','customerOrigin','sendEnabled'] <> '{}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  note := p_data->>'note';
  summary := p_data->>'summary';
  IF note IS NULL OR length(btrim(note)) NOT BETWEEN 10 AND 1000
    OR summary IS NULL OR length(btrim(summary)) NOT BETWEEN 10 AND 2000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  actor := (s->>'userId')::uuid;
  fp := md5(jsonb_build_array(p_case, p_version, 'guided_close', p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = actor AND r.fingerprint = fp THEN RETURN r.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL OR c.workflow_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF c.status = 'CANCELLED' THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'cancelled'); END IF;
  IF c.status = 'CLOSED' THEN
    IF c.service_track IS DISTINCT FROM 'GUIDED' OR c.outcome IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.guided_service_deliveries delivery WHERE delivery.case_id = c.id)
    THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'closed'); END IF;
    mail := admin_private.queue_guided_completion_v1(c.id, actor, p_data);
    IF mail->>'status' NOT IN ('success', 'not_sent') THEN
      RAISE EXCEPTION 'fulfilment_email:%', coalesce(mail->>'reason', 'mail') USING ERRCODE = 'P0001';
    END IF;
    comm := NULLIF(mail->>'id', '')::uuid;
    IF comm IS NOT NULL THEN
      UPDATE public.guided_service_deliveries
        SET communication_id = comm
        WHERE case_id = c.id AND communication_id IS NULL;
    END IF;
    result := jsonb_build_object(
      'status', 'success',
      'id', c.id,
      'completionEmail', CASE WHEN mail->>'replay' = 'true' THEN 'already_queued' ELSE mail->>'status' END,
      'recovered', true
    );
    INSERT INTO admin_private.case_command_receipts VALUES (p_request, actor, fp, result, now_time);
    RETURN result;
  END IF;
  IF c.service_track IS DISTINCT FROM 'GUIDED' THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'not_guided'); END IF;
  IF c.outcome IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'outcome_recorded'); END IF;
  IF admin_private.guided_settlement_reason_v1(c.id) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', admin_private.guided_settlement_reason_v1(c.id));
  END IF;
  IF EXISTS (
      SELECT 1 FROM public.case_tasks task
      WHERE task.case_id = c.id AND task.status = 'OPEN'
        AND NOT EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          WHERE report.task_id = task.id
            AND report.case_id = c.id
            AND report.kind IN ('GOOGLE_SUBMISSION', 'GOOGLE_OUTCOME')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.case_submissions a
      WHERE a.case_id = c.id AND NOT EXISTS (SELECT 1 FROM public.case_submission_results b WHERE b.submission_id = a.id)
    )
  THEN RETURN jsonb_build_object('status', 'open_work'); END IF;
  SELECT count(*)::int INTO published FROM public.case_prepared_packs p
  WHERE p.case_id = c.id AND p.status = 'APPROVED' AND p.published_at IS NOT NULL AND p.unpublished_at IS NULL;
  IF published IS DISTINCT FROM 1 THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'pack'); END IF;
  SELECT p.id INTO pack FROM public.case_prepared_packs p
  WHERE p.case_id = c.id AND p.status = 'APPROVED' AND p.published_at IS NOT NULL AND p.unpublished_at IS NULL
    AND admin_private.pack_publishable_v1(p.id);
  IF pack IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'pack'); END IF;
  mail := admin_private.queue_guided_completion_v1(c.id, actor, p_data);
  IF mail->>'status' NOT IN ('success', 'not_sent') THEN
    RAISE EXCEPTION 'fulfilment_email:%', coalesce(mail->>'reason', 'mail') USING ERRCODE = 'P0001';
  END IF;
  comm := NULLIF(mail->>'id', '')::uuid;
  INSERT INTO public.guided_service_deliveries(case_id, pack_id, communication_id)
  VALUES (c.id, pack, comm)
  ON CONFLICT (case_id) DO UPDATE
    SET pack_id = EXCLUDED.pack_id,
        communication_id = COALESCE(EXCLUDED.communication_id, public.guided_service_deliveries.communication_id);
  UPDATE public.cases
    SET status = 'CLOSED', work_stage = 'FINISHED', closure_summary = summary,
        closed_at = now_time, next_action = '', next_action_at = NULL
  WHERE id = c.id;
  INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
  VALUES (
    c.id, actor, 'close', note, 'INTERNAL',
    jsonb_build_object('fulfilment', 'guided_preparation', 'summary', summary, 'packId', pack)
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'CASE_CHANGED', 'success', c.id, p_request, 'case', note,
    jsonb_build_object('operation', 'guided_close', 'previousVersion', p_version)
  );
  result := jsonb_build_object('status', 'success', 'id', c.id, 'completionEmail', mail->>'status');
  INSERT INTO admin_private.case_command_receipts VALUES (p_request, actor, fp, result, now_time);
  RETURN result;
EXCEPTION
  WHEN raise_exception THEN
    IF left(SQLERRM, 17) = 'fulfilment_email:' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', substr(SQLERRM, 18));
    END IF;
    RAISE;
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;


CREATE OR REPLACE FUNCTION admin_private.customer_portal_case_timeline_v1(
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
        SELECT 'PACK_PUBLISHED', p.published_at, 14, p.id
        FROM public.cases c
        JOIN public.case_prepared_packs p ON p.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.service_track = 'GUIDED'
          AND p.status = 'APPROVED'
          AND p.published_at IS NOT NULL
          AND p.unpublished_at IS NULL
          AND admin_private.pack_publishable_v1(p.id)

        UNION ALL
        SELECT 'NOTIFICATION_DELIVERED', comm.delivered_at, 15, comm.id
        FROM public.cases c
        JOIN public.communications comm
          ON comm.case_id = c.id
         AND comm.customer_id = c.customer_id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND comm.template_key = 'GUIDED_PACK_READY'
          AND comm.lifecycle IS DISTINCT FROM 'CANCELLED'
          AND comm.delivery_status = 'DELIVERED'
          AND comm.delivered_at IS NOT NULL

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

        UNION ALL
        SELECT 'CUSTOMER_REPORTED_SUBMISSION', report.created_at, 16, report.id
        FROM public.cases c
        JOIN public.guided_customer_reports report
          ON report.case_id = c.id AND report.customer_id = c.customer_id AND report.kind = 'GOOGLE_SUBMISSION'
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.service_track = 'GUIDED'

        UNION ALL
        SELECT 'CUSTOMER_REPORTED_OUTCOME', report.created_at, 17, report.id
        FROM public.cases c
        JOIN public.guided_customer_reports report
          ON report.case_id = c.id AND report.customer_id = c.customer_id AND report.kind = 'GOOGLE_OUTCOME'
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.service_track = 'GUIDED'

      ) raw
      WHERE code IS NOT NULL AND occurred_at IS NOT NULL
      ORDER BY occurred_at DESC, ordinal, source_id
      LIMIT 21
    ) limited
  ), '[]'::jsonb);
$$;



CREATE FUNCTION public.admin_guided_report_review_v1(
  p_token text, p_request uuid, p_case uuid, p_version integer, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  s jsonb;
  c public.cases;
  t public.case_tasks;
  r admin_private.case_command_receipts;
  actor uuid;
  fp text;
  note text;
  result jsonb;
  now_time timestamptz := now();
  before_status text;
  before_outcome text;
  before_closed timestamptz;
  after_status text;
  after_outcome text;
  after_closed timestamptz;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_data IS NULL
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 16000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_data - ARRAY['note','taskId','status'] <> '{}'::jsonb
    OR p_data->>'status' IS NULL OR p_data->>'status' NOT IN ('DONE', 'CANCELLED')
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  note := p_data->>'note';
  IF note IS NULL OR length(btrim(note)) NOT BETWEEN 10 AND 1000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  actor := (s->>'userId')::uuid;
  fp := md5(jsonb_build_array(p_case, p_version, 'review_guided_report', p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = actor AND r.fingerprint = fp THEN RETURN r.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL OR c.workflow_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF c.service_track IS DISTINCT FROM 'GUIDED' OR c.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  SELECT * INTO t FROM public.case_tasks
  WHERE id = (p_data->>'taskId')::uuid AND case_id = c.id AND status = 'OPEN';
  IF t.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.guided_customer_reports report
    WHERE report.task_id = t.id AND report.case_id = c.id
  ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  before_status := c.status;
  before_outcome := c.outcome;
  before_closed := c.closed_at;
  UPDATE public.case_tasks
    SET status = p_data->>'status', resolution = note, resolved_at = now_time
    WHERE id = t.id AND status = 'OPEN';
  UPDATE public.cases SET workflow_version = workflow_version WHERE id = c.id;
  SELECT status, outcome, closed_at INTO after_status, after_outcome, after_closed
  FROM public.cases WHERE id = c.id;
  IF after_status IS DISTINCT FROM before_status OR after_outcome IS DISTINCT FROM before_outcome
    OR after_closed IS DISTINCT FROM before_closed
  THEN
    RAISE EXCEPTION 'guided_report_review:case' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
  VALUES (
    c.id, actor, 'review_guided_report', note, 'INTERNAL',
    jsonb_build_object('taskId', t.id, 'status', p_data->>'status', 'reopened', false)
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'CASE_CHANGED', 'success', c.id, p_request, 'case', note,
    jsonb_build_object('operation', 'review_guided_report', 'taskId', t.id, 'previousVersion', p_version)
  );
  result := jsonb_build_object('status', 'success', 'id', c.id);
  INSERT INTO admin_private.case_command_receipts VALUES (p_request, actor, fp, result, now_time);
  RETURN result;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;

COMMENT ON FUNCTION admin_private.customer_portal_case_timeline_v1(uuid, uuid) IS
  'At most 21 customer-safe timeline codes for one owned case, newest first. A customer-reported Guided submission is not a ProfileRelaunch case submission. A customer-reported Google outcome is not an independently verified decision.';

NOTIFY pgrst, 'reload schema';

COMMIT;
