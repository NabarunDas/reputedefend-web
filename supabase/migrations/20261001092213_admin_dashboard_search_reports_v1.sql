-- Admin dashboard, global search, saved filters, reports and audited CSV exports v1 (Step 19).
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED
-- Do not apply from this PR. Do not replay or modify applied migrations.
-- Do not enable Guard, Stripe, live mail, Google API or change Cron (0 4 * * *).
-- Reporting is read-mostly. Intended mutations are saved filters and export receipts only.

BEGIN;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED',
  'PAYMENT_CHANGED','GUARD_CHANGED','REPORT_CHANGED'
));

CREATE TABLE public.admin_saved_filters (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  actor_id uuid NOT NULL,
  module text NOT NULL CHECK (module IN (
    'ENQUIRIES','CASES','TASKS','GUARD_CHECKS','GUARD_ALERTS','MONEY','REPORTS'
  )),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  filter jsonb NOT NULL CHECK (jsonb_typeof(filter) = 'object' AND octet_length(filter::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  UNIQUE (actor_id, module, name)
);
CREATE INDEX admin_saved_filters_actor_idx ON public.admin_saved_filters (actor_id, module, updated_at DESC, id DESC);
ALTER TABLE public.admin_saved_filters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_saved_filters FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.report_export_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  report_key text NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  timezone text NOT NULL DEFAULT 'Europe/London',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  outcome text NOT NULL CHECK (outcome IN ('success','denied','conflict','invalid')),
  reason text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL DEFAULT '{}'::jsonb
);
REVOKE ALL ON TABLE admin_private.report_export_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.report_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE admin_private.report_command_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX payment_receipts_paid_at_idx ON public.payment_receipts (paid_at DESC, id DESC);
CREATE INDEX guard_subscription_invoices_paid_created_idx
  ON public.guard_subscription_invoices (created_at DESC, id DESC) WHERE status = 'PAID';
CREATE INDEX guard_refunds_succeeded_idx
  ON public.guard_refunds (succeeded_at DESC, id DESC) WHERE status = 'SUCCEEDED';
CREATE INDEX quote_versions_offered_at_idx
  ON public.quote_versions (offered_at, quote_id) WHERE offered_at IS NOT NULL;
CREATE INDEX service_orders_accepted_at_idx ON public.service_orders (accepted_at DESC, id DESC);
CREATE INDEX cases_open_submitted_idx ON public.cases (submitted_at, id)
  WHERE status NOT IN ('CLOSED','CANCELLED');
CREATE INDEX locations_name_search_idx ON public.locations (lower(btrim(location_name)));
CREATE INDEX payment_invoices_provider_ref_idx
  ON public.payment_invoices (lower(provider_invoice_id))
  WHERE provider_invoice_id IS NOT NULL;

CREATE FUNCTION admin_private.report_export_limit_v1() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 5000; $$;

CREATE FUNCTION admin_private.report_key_allowed_v1(p_key text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_key IN (
    'overdue_work','unassigned_enquiries','missed_guard_checks','unreviewed_guard_alerts',
    'guard_alerts_needs_review','failed_customer_email','access_recovery','contact_recovery',
    'payment_exceptions','guard_billing_exceptions','failed_jobs',
    'clients_total','clients_active_service','contacts_enquiry_only','open_enquiries','open_cases',
    'collected_gross','collected_refunds','outstanding_money',
    'guard_locations_requested','guard_locations_onboarding','guard_locations_paid_active',
    'guard_locations_included_active','guard_locations_paused','guard_locations_ending','guard_locations_ended',
    'guard_recurring','check_coverage_due','check_coverage_completed',
    'enquiry_to_case','quote_conversion','service_mix','first_response','case_age','outcomes',
    'evidence_turnaround','overdue_invoices','guard_activation','guard_churn',
    'guard_coverage_failures','handling_time'
  );
$$;

CREATE FUNCTION admin_private.saved_filter_keys_allowed_v1(p_module text, p_filter jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_typeof(p_filter) = 'object'
    AND octet_length(p_filter::text) <= 4096
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_filter) k
      WHERE k NOT IN (
        'q','state','filter','status','queue','reportKey','preset','startDate','endDate','sort'
      )
    );
$$;

CREATE FUNCTION admin_private.report_period_v1(
  p_preset text, p_start_date date, p_end_date date, p_now timestamptz
) RETURNS TABLE(start_at timestamptz, end_at timestamptz, timezone text, preset text)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  clock timestamptz := coalesce(p_now, now());
  today_london date;
  start_local date;
  end_local date;
BEGIN
  IF p_preset IS NULL OR p_preset NOT IN ('today','last_7_days','current_month','custom') THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;
  today_london := (clock AT TIME ZONE 'Europe/London')::date;
  IF p_preset = 'today' THEN
    start_local := today_london;
    end_local := today_london + 1;
  ELSIF p_preset = 'last_7_days' THEN
    start_local := today_london - 6;
    end_local := today_london + 1;
  ELSIF p_preset = 'current_month' THEN
    start_local := date_trunc('month', today_london::timestamp)::date;
    end_local := (date_trunc('month', today_london::timestamp) + interval '1 month')::date;
  ELSE
    IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
      RAISE EXCEPTION 'invalid_period';
    END IF;
    IF (p_end_date - p_start_date) > 366 THEN
      RAISE EXCEPTION 'invalid_period';
    END IF;
    start_local := p_start_date;
    end_local := p_end_date + 1;
  END IF;
  start_at := (start_local::timestamp AT TIME ZONE 'Europe/London');
  end_at := (end_local::timestamp AT TIME ZONE 'Europe/London');
  timezone := 'Europe/London';
  preset := p_preset;
  RETURN NEXT;
END; $$;

CREATE FUNCTION admin_private.search_escape_v1(p_q text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

CREATE FUNCTION admin_private.customer_is_active_service_v1(p_customer uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.customer_id = p_customer AND c.status NOT IN ('CLOSED','CANCELLED')
  ) OR EXISTS (
    SELECT 1 FROM public.guard_coverages g
    WHERE g.customer_id = p_customer AND g.state = 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM public.service_orders o
    WHERE o.customer_id = p_customer
      AND o.state IN ('ACCEPTED_AWAITING_PAYMENT','ACCEPTED_SUCCESS_FEE','ACCEPTED_RECURRING')
  );
$$;

CREATE FUNCTION admin_private.verified_current_email_v1(p_customer uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT v.verified_value
  FROM public.customer_contact_verifications v
  JOIN public.customers c ON c.id = v.customer_id
  WHERE v.customer_id = p_customer
    AND v.channel = 'email'
    AND v.verified_value = lower(c.email)
  LIMIT 1;
$$;

CREATE FUNCTION admin_private.report_rows_v1(
  p_key text, p_start timestamptz, p_end timestamptz, p_now timestamptz
) RETURNS TABLE (
  row_id uuid,
  occurred_at timestamptz,
  amount_minor bigint,
  currency text,
  label text,
  href text,
  elapsed_seconds integer
)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE clock timestamptz := coalesce(p_now, now());
BEGIN
  IF NOT admin_private.report_key_allowed_v1(p_key) THEN
    RAISE EXCEPTION 'invalid_report_key';
  END IF;

  IF p_key = 'overdue_work' THEN
    RETURN QUERY
    SELECT t.id, t.due_at, 0::bigint, NULL::text, left(cs.public_ref || ': ' || t.title, 200),
           '/cases/' || cs.id::text, NULL::integer
    FROM public.case_tasks t
    JOIN public.cases cs ON cs.id = t.case_id
    WHERE t.status = 'OPEN' AND t.due_at < clock;
  ELSIF p_key = 'unassigned_enquiries' THEN
    RETURN QUERY
    SELECT e.id, e.created_at, 0::bigint, NULL::text, left(coalesce(e.payload->>'name', e.source), 200),
           '/enquiries/' || e.id::text, NULL::integer
    FROM public.enquiries e
    WHERE e.status IN ('new','open','waiting') AND e.assigned IS NOT TRUE;
  ELSIF p_key = 'missed_guard_checks' THEN
    RETURN QUERY
    SELECT o.id, coalesce(o.missed_at, o.window_end_utc), 0::bigint, NULL::text, o.window_code,
           '/guard/checks/' || o.id::text, NULL::integer
    FROM public.guard_check_obligations o
    WHERE o.state NOT IN ('COMPLETED','CANCELLED')
      AND (o.missed_at IS NOT NULL OR o.window_end_utc < clock);
  ELSIF p_key = 'unreviewed_guard_alerts' THEN
    RETURN QUERY
    SELECT a.id, a.opened_at, 0::bigint, NULL::text, a.state, '/guard/alerts/' || a.id::text, NULL::integer
    FROM public.guard_alerts a WHERE a.state = 'NEW';
  ELSIF p_key = 'guard_alerts_needs_review' THEN
    RETURN QUERY
    SELECT a.id, a.latest_observed_at, 0::bigint, NULL::text, a.state, '/guard/alerts/' || a.id::text, NULL::integer
    FROM public.guard_alerts a
    WHERE a.needs_review IS TRUE AND a.state IN ('NEW','ACKNOWLEDGED');
  ELSIF p_key = 'failed_customer_email' THEN
    RETURN QUERY
    SELECT c.id, coalesce(c.failed_at, c.updated_at), 0::bigint, NULL::text, c.delivery_status,
           '/communications?case=' || coalesce(c.case_id::text, ''), NULL::integer
    FROM public.communications c
    WHERE c.lifecycle IS NOT NULL
      AND c.delivery_status IN ('BOUNCED','COMPLAINED','SUPPRESSED','FAILED');
  ELSIF p_key = 'access_recovery' THEN
    RETURN QUERY
    SELECT s.id, s.opened_at, 0::bigint, NULL::text, s.reason_code,
           '/guard/alerts?access=', NULL::integer
    FROM public.guard_service_actions s
    WHERE s.kind = 'ACCESS_RECOVERY' AND s.state IN ('OPEN','ACKNOWLEDGED');
  ELSIF p_key = 'contact_recovery' THEN
    RETURN QUERY
    SELECT s.id, s.opened_at, 0::bigint, NULL::text, s.reason_code,
           '/guard/alerts?contact=', NULL::integer
    FROM public.guard_service_actions s
    WHERE s.kind = 'CONTACT_RECOVERY' AND s.state IN ('OPEN','ACKNOWLEDGED');
  ELSIF p_key = 'payment_exceptions' THEN
    RETURN QUERY
    SELECT o.id, o.created_at, o.amount_minor::bigint, o.currency, o.state,
           '/money', NULL::integer
    FROM public.payment_obligations o
    WHERE o.state IN ('FAILED','AUTHENTICATION_REQUIRED')
    UNION ALL
    SELECT d.id, d.opened_at, d.amount_minor::bigint, d.currency, d.finance_work_status,
           '/money', NULL::integer
    FROM public.guard_disputes d
    WHERE d.finance_work_status IN ('OPEN','ACKNOWLEDGED');
  ELSIF p_key = 'guard_billing_exceptions' THEN
    RETURN QUERY
    SELECT md5('recon:' || i.id::text)::uuid, i.created_at, 0::bigint, NULL::text, i.code, '/money', NULL::integer
    FROM public.guard_reconciliation_issues i
    UNION ALL
    SELECT b.coverage_id, coalesce(b.updated_at, now()), 0::bigint, NULL::text, b.billing_state,
           '/guard', NULL::integer
    FROM public.guard_billing b
    WHERE b.billing_state = 'PAST_DUE'
    UNION ALL
    SELECT r.id, coalesce(r.failed_at, r.created_at), r.amount_minor::bigint, r.currency, r.status,
           '/money', NULL::integer
    FROM public.guard_refunds r
    WHERE r.status = 'FAILED';
  ELSIF p_key = 'failed_jobs' THEN
    RETURN QUERY
    SELECT j.id, coalesce(j.dead_lettered_at, j.updated_at), 0::bigint, NULL::text, j.job_type,
           '/operations/jobs', NULL::integer
    FROM admin_private.jobs j
    WHERE j.status = 'DEAD_LETTER';
  ELSIF p_key = 'clients_total' THEN
    RETURN QUERY
    SELECT c.id, c.created_at, 0::bigint, NULL::text, c.full_name, '/records/client/' || c.id::text, NULL::integer
    FROM public.customers c;
  ELSIF p_key = 'clients_active_service' THEN
    RETURN QUERY
    SELECT c.id, c.created_at, 0::bigint, NULL::text, c.full_name, '/records/client/' || c.id::text, NULL::integer
    FROM public.customers c
    WHERE admin_private.customer_is_active_service_v1(c.id);
  ELSIF p_key = 'contacts_enquiry_only' THEN
    RETURN QUERY
    SELECT e.id, e.created_at, 0::bigint, NULL::text, left(coalesce(e.payload->>'email', e.source), 200),
           '/enquiries/' || e.id::text, NULL::integer
    FROM public.enquiries e
    WHERE e.status NOT IN ('converted','spam')
      AND e.case_id IS NULL
      AND e.monitoring_request_id IS NULL;
  ELSIF p_key = 'open_enquiries' THEN
    RETURN QUERY
    SELECT e.id, e.created_at, 0::bigint, NULL::text, e.status, '/enquiries/' || e.id::text, NULL::integer
    FROM public.enquiries e
    WHERE e.status IN ('new','open','waiting');
  ELSIF p_key = 'open_cases' THEN
    RETURN QUERY
    SELECT c.id, c.submitted_at, 0::bigint, NULL::text, c.public_ref, '/cases/' || c.id::text, NULL::integer
    FROM public.cases c
    WHERE c.status NOT IN ('CLOSED','CANCELLED');
  ELSIF p_key = 'collected_gross' THEN
    RETURN QUERY
    SELECT r.id, r.paid_at, r.amount_minor::bigint, r.currency, 'receipt', '/money', NULL::integer
    FROM public.payment_receipts r
    WHERE r.paid_at >= p_start AND r.paid_at < p_end
    UNION ALL
    SELECT i.id, i.created_at, i.amount_paid_minor::bigint, i.currency, 'guard_invoice', '/money', NULL::integer
    FROM public.guard_subscription_invoices i
    WHERE i.status = 'PAID' AND i.created_at >= p_start AND i.created_at < p_end;
  ELSIF p_key = 'collected_refunds' THEN
    RETURN QUERY
    SELECT r.id, r.succeeded_at, r.amount_minor::bigint, r.currency, 'refund', '/money', NULL::integer
    FROM public.guard_refunds r
    WHERE r.status = 'SUCCEEDED' AND r.succeeded_at >= p_start AND r.succeeded_at < p_end;
  ELSIF p_key = 'outstanding_money' THEN
    RETURN QUERY
    SELECT o.id, o.created_at, o.amount_minor::bigint, o.currency, o.kind, '/money', NULL::integer
    FROM public.payment_obligations o
    WHERE o.state IN ('DUE','COLLECTING','AUTHENTICATION_REQUIRED','FAILED')
      AND o.kind = 'UPFRONT';
  ELSIF p_key = 'overdue_invoices' THEN
    RETURN QUERY
    SELECT i.id, i.created_at, i.amount_minor::bigint, i.currency, i.status, '/money', NULL::integer
    FROM public.payment_invoices i
    JOIN public.payment_obligations o ON o.id = i.obligation_id
    WHERE i.status = 'ISSUED' AND o.kind = 'UPFRONT' AND i.created_at < clock;
  ELSIF p_key LIKE 'guard_locations_%' THEN
    RETURN QUERY
    SELECT g.id, coalesce(g.activated_at, g.created_at), 0::bigint, NULL::text, g.state,
           '/guard', NULL::integer
    FROM public.guard_coverages g
    WHERE (p_key = 'guard_locations_requested' AND g.state = 'REQUESTED')
       OR (p_key = 'guard_locations_onboarding' AND g.state IN (
            'AWAITING_AUTHORIZATION','VERIFYING_ACCESS','BASELINE_REQUIRED','AWAITING_PAYMENT','READY_TO_ACTIVATE'
          ))
       OR (p_key = 'guard_locations_paid_active' AND g.state = 'ACTIVE' AND g.coverage_basis = 'DIRECT_GUARD')
       OR (p_key = 'guard_locations_included_active' AND g.state = 'ACTIVE' AND g.coverage_basis = 'INCLUDED')
       OR (p_key = 'guard_locations_paused' AND g.state = 'PAUSED')
       OR (p_key = 'guard_locations_ending' AND g.state = 'ENDING')
       OR (p_key = 'guard_locations_ended' AND g.state = 'ENDED');
  ELSIF p_key = 'guard_recurring' THEN
    RETURN QUERY
    SELECT g.id, coalesce(g.activated_at, g.created_at), s.amount_minor::bigint, s.currency, 'gbp_month',
           '/guard', NULL::integer
    FROM public.guard_coverages g
    JOIN public.guard_billing b ON b.coverage_id = g.id
    JOIN public.guard_subscriptions s ON s.coverage_id = g.id
    WHERE g.state = 'ACTIVE'
      AND g.coverage_basis = 'DIRECT_GUARD'
      AND b.billing_state = 'CURRENT'
      AND b.entitlement_source = 'PROVIDER'
      AND s.lifecycle_state IN ('ACTIVE','PAST_DUE');
  ELSIF p_key = 'check_coverage_due' THEN
    RETURN QUERY
    SELECT o.id, o.window_start_utc, 0::bigint, NULL::text, o.state,
           '/guard/checks/' || o.id::text, NULL::integer
    FROM public.guard_check_obligations o
    WHERE o.window_start_utc >= p_start AND o.window_start_utc < p_end
      AND o.state <> 'CANCELLED';
  ELSIF p_key = 'check_coverage_completed' THEN
    RETURN QUERY
    SELECT o.id, o.completed_at, 0::bigint, NULL::text, o.state,
           '/guard/checks/' || o.id::text, NULL::integer
    FROM public.guard_check_obligations o
    WHERE o.window_start_utc >= p_start AND o.window_start_utc < p_end
      AND o.state = 'COMPLETED'
      AND EXISTS (
        SELECT 1 FROM public.guard_check_observations obs
        WHERE obs.obligation_id = o.id
          AND obs.classification IN ('HEALTHY','CHANGE_DETECTED','PROFILE_UNAVAILABLE')
      );
  ELSIF p_key = 'enquiry_to_case' THEN
    RETURN QUERY
    SELECT e.id, e.created_at, 0::bigint, NULL::text, e.status,
           '/enquiries/' || e.id::text, NULL::integer
    FROM public.enquiries e
    WHERE e.created_at >= p_start AND e.created_at < p_end
      AND e.status <> 'spam'
      AND e.monitoring_request_id IS NULL;
  ELSIF p_key = 'quote_conversion' THEN
    RETURN QUERY
    SELECT q.id, first_offered.offered_at, 0::bigint, NULL::text, q.status,
           '/commercial', NULL::integer
    FROM public.quotes q
    JOIN LATERAL (
      SELECT min(v.offered_at) AS offered_at FROM public.quote_versions v WHERE v.quote_id = q.id AND v.offered_at IS NOT NULL
    ) first_offered ON first_offered.offered_at IS NOT NULL
    WHERE first_offered.offered_at >= p_start AND first_offered.offered_at < p_end;
  ELSIF p_key = 'service_mix' THEN
    RETURN QUERY
    SELECT o.id, o.accepted_at, o.amount_minor::bigint, o.currency, o.payment_model || '/' || o.service_code,
           '/commercial', NULL::integer
    FROM public.service_orders o
    WHERE o.accepted_at >= p_start AND o.accepted_at < p_end;
  ELSIF p_key = 'first_response' THEN
    RETURN QUERY
    SELECT e.id, e.created_at, 0::bigint, NULL::text, 'enquiry',
           '/enquiries/' || e.id::text,
           CASE WHEN ev.created_at IS NULL THEN NULL ELSE floor(extract(epoch FROM ev.created_at - e.created_at))::integer END
    FROM public.enquiries e
    LEFT JOIN LATERAL (
      SELECT min(x.created_at) AS created_at FROM public.enquiry_events x WHERE x.enquiry_id = e.id AND x.event = 'triaged'
    ) ev ON TRUE
    WHERE e.created_at >= p_start AND e.created_at < p_end AND e.status <> 'spam'
    UNION ALL
    SELECT c.id, c.submitted_at, 0::bigint, NULL::text, 'case',
           '/cases/' || c.id::text,
           CASE WHEN we.created_at IS NULL THEN NULL ELSE floor(extract(epoch FROM we.created_at - c.submitted_at))::integer END
    FROM public.cases c
    LEFT JOIN LATERAL (
      SELECT min(x.created_at) AS created_at FROM public.case_work_events x WHERE x.case_id = c.id
    ) we ON TRUE
    WHERE c.submitted_at >= p_start AND c.submitted_at < p_end;
  ELSIF p_key = 'case_age' THEN
    RETURN QUERY
    SELECT c.id, c.submitted_at, 0::bigint, NULL::text, c.status,
           '/cases/' || c.id::text,
           floor(extract(epoch FROM clock - c.submitted_at))::integer
    FROM public.cases c
    WHERE c.status NOT IN ('CLOSED','CANCELLED');
  ELSIF p_key = 'outcomes' THEN
    RETURN QUERY
    SELECT c.id, coalesce(c.closed_at, c.updated_at), 0::bigint, NULL::text, coalesce(c.outcome, 'UNDECIDED'),
           '/cases/' || c.id::text, NULL::integer
    FROM public.cases c
    WHERE c.outcome IS NOT NULL
      AND c.status = 'CLOSED'
      AND coalesce(c.closed_at, c.updated_at) >= p_start
      AND coalesce(c.closed_at, c.updated_at) < p_end;
  ELSIF p_key = 'evidence_turnaround' THEN
    RETURN QUERY
    SELECT r.id, r.created_at, 0::bigint, NULL::text, r.status,
           '/documents',
           CASE WHEN acc.reviewed_at IS NULL THEN NULL ELSE floor(extract(epoch FROM acc.reviewed_at - r.created_at))::integer END
    FROM public.evidence_requests r
    LEFT JOIN LATERAL (
      SELECT min(v.reviewed_at) AS reviewed_at
      FROM public.case_documents d
      JOIN public.case_document_versions v ON v.document_id = d.id
      WHERE d.evidence_request_id = r.id AND v.review_status = 'ACCEPTED' AND v.reviewed_at IS NOT NULL
    ) acc ON TRUE
    WHERE r.created_at >= p_start AND r.created_at < p_end;
  ELSIF p_key = 'guard_activation' THEN
    RETURN QUERY
    SELECT md5('coverage_event:' || e.id::text)::uuid, e.created_at, 0::bigint, NULL::text, e.new_state, '/guard', NULL::integer
    FROM public.guard_coverage_events e
    WHERE e.event = 'ACTIVATED' AND e.created_at >= p_start AND e.created_at < p_end;
  ELSIF p_key = 'guard_churn' THEN
    RETURN QUERY
    SELECT md5('coverage_event:' || e.id::text)::uuid, e.created_at, 0::bigint, NULL::text, e.new_state, '/guard', NULL::integer
    FROM public.guard_coverage_events e
    WHERE e.new_state IN ('ENDING','ENDED')
      AND coalesce(e.previous_state, '') NOT IN ('ENDING','ENDED')
      AND e.created_at >= p_start AND e.created_at < p_end;
  ELSIF p_key = 'guard_coverage_failures' THEN
    RETURN QUERY
    SELECT o.id, o.window_start_utc, 0::bigint, NULL::text, o.state,
           '/guard/checks/' || o.id::text, NULL::integer
    FROM public.guard_check_obligations o
    WHERE o.window_start_utc >= p_start AND o.window_start_utc < p_end
      AND o.state <> 'CANCELLED'
      AND (
        o.missed_at IS NOT NULL
        OR o.state <> 'COMPLETED'
        OR EXISTS (
          SELECT 1 FROM public.guard_check_observations obs
          WHERE obs.obligation_id = o.id AND obs.classification = 'INCOMPLETE'
        )
      );
  ELSIF p_key = 'handling_time' THEN
    RETURN QUERY
    SELECT o.id, o.completed_at, 0::bigint, NULL::text, 'obligation',
           '/guard/checks/' || o.id::text, o.handling_seconds
    FROM public.guard_check_obligations o
    WHERE o.state = 'COMPLETED'
      AND o.completed_at >= p_start AND o.completed_at < p_end
      AND o.handling_seconds IS NOT NULL;
  END IF;
END; $$;

CREATE FUNCTION admin_private.report_amount_groups_v1(p_key text, p_start timestamptz, p_end timestamptz, p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency', currency, 'amountMinor', amount_minor, 'count', n
  ) ORDER BY currency), '[]'::jsonb)
  FROM (
    SELECT r.currency, sum(r.amount_minor)::bigint AS amount_minor, count(*)::int AS n
    FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r
    WHERE r.currency IS NOT NULL
    GROUP BY r.currency
  ) x;
$$;

CREATE FUNCTION admin_private.percentile_seconds_v1(p_values integer[], p_fraction double precision)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_values IS NULL OR coalesce(array_length(p_values, 1), 0) = 0 THEN NULL
    ELSE (
      SELECT percentile_cont(p_fraction) WITHIN GROUP (ORDER BY v)::integer
      FROM unnest(p_values) v
      WHERE v IS NOT NULL
    )
  END;
$$;

CREATE FUNCTION admin_private.report_summary_payload_v1(
  p_key text, p_start timestamptz, p_end timestamptz, p_now timestamptz
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  total integer;
  measured integer;
  elapsed integer[];
  numerator integer;
  denominator integer;
BEGIN
  SELECT count(*)::int INTO total FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now);
  IF p_key IN ('collected_gross','collected_refunds','outstanding_money','overdue_invoices','guard_recurring','service_mix') THEN
    RETURN jsonb_build_object(
      'key', p_key, 'count', total,
      'amounts', admin_private.report_amount_groups_v1(p_key, p_start, p_end, p_now)
    );
  END IF;
  IF p_key IN ('first_response','evidence_turnaround','handling_time') THEN
    SELECT coalesce(array_agg(elapsed_seconds), '{}') INTO elapsed
    FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now)
    WHERE elapsed_seconds IS NOT NULL;
    measured := coalesce(array_length(elapsed, 1), 0);
    RETURN jsonb_build_object(
      'key', p_key, 'count', total, 'measured', measured, 'excluded', total - measured,
      'medianSeconds', admin_private.percentile_seconds_v1(elapsed, 0.5),
      'p90Seconds', admin_private.percentile_seconds_v1(elapsed, 0.9)
    );
  END IF;
  IF p_key = 'check_coverage_completed' THEN
    SELECT count(*)::int INTO numerator FROM admin_private.report_rows_v1('check_coverage_completed', p_start, p_end, p_now);
    SELECT count(*)::int INTO denominator FROM admin_private.report_rows_v1('check_coverage_due', p_start, p_end, p_now);
    RETURN jsonb_build_object(
      'key', p_key, 'count', numerator, 'numerator', numerator, 'denominator', denominator,
      'percentage', CASE WHEN denominator = 0 THEN NULL ELSE round((numerator::numeric / denominator) * 100, 1) END
    );
  END IF;
  IF p_key = 'enquiry_to_case' THEN
    RETURN jsonb_build_object(
      'key', p_key, 'count', total,
      'eligible', total,
      'converted', (SELECT count(*) FROM public.enquiries e WHERE e.created_at >= p_start AND e.created_at < p_end AND e.status <> 'spam' AND e.monitoring_request_id IS NULL AND e.case_id IS NOT NULL),
      'monitoring', (SELECT count(*) FROM public.enquiries e WHERE e.created_at >= p_start AND e.created_at < p_end AND e.monitoring_request_id IS NOT NULL),
      'notYetConverted', (SELECT count(*) FROM public.enquiries e WHERE e.created_at >= p_start AND e.created_at < p_end AND e.monitoring_request_id IS NULL AND e.status IN ('new','open','waiting','closed')),
      'excludedSpam', (SELECT count(*) FROM public.enquiries e WHERE e.created_at >= p_start AND e.created_at < p_end AND e.status = 'spam')
    );
  END IF;
  IF p_key = 'quote_conversion' THEN
    RETURN jsonb_build_object(
      'key', p_key, 'count', total,
      'offered', total,
      'accepted', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r JOIN public.quotes q ON q.id = r.row_id WHERE q.status = 'ACCEPTED'),
      'closedOther', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r JOIN public.quotes q ON q.id = r.row_id WHERE q.status IN ('DECLINED','CANCELLED','SUPERSEDED','EXPIRED')),
      'stillOpen', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r JOIN public.quotes q ON q.id = r.row_id WHERE q.status = 'OFFERED')
    );
  END IF;
  IF p_key = 'outcomes' THEN
    RETURN jsonb_build_object(
      'key', p_key, 'count', total,
      'success', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r WHERE r.label IN ('RESTORED','REMOVED')),
      'excludedOpen', (SELECT count(*) FROM public.cases c WHERE c.status NOT IN ('CLOSED','CANCELLED') OR c.outcome IS NULL)
    );
  END IF;
  IF p_key = 'case_age' THEN
    RETURN jsonb_build_object(
      'key', p_key, 'count', total,
      'buckets', jsonb_build_object(
        'under1Day', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r WHERE r.elapsed_seconds < 86400),
        'days1to3', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r WHERE r.elapsed_seconds >= 86400 AND r.elapsed_seconds < 4 * 86400),
        'days4to7', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r WHERE r.elapsed_seconds >= 4 * 86400 AND r.elapsed_seconds < 8 * 86400),
        'days8to14', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r WHERE r.elapsed_seconds >= 8 * 86400 AND r.elapsed_seconds < 15 * 86400),
        'days15to30', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r WHERE r.elapsed_seconds >= 15 * 86400 AND r.elapsed_seconds < 31 * 86400),
        'over30Days', (SELECT count(*) FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r WHERE r.elapsed_seconds >= 31 * 86400)
      )
    );
  END IF;
  RETURN jsonb_build_object('key', p_key, 'count', total);
END; $$;

CREATE FUNCTION admin_private.dashboard_today_v1(p_preset text, p_start_date date, p_end_date date, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  period record;
  clock timestamptz := coalesce(p_now, now());
  hb admin_private.job_worker_heartbeats;
  health text;
  late integer;
  schedule_ok boolean;
BEGIN
  SELECT * INTO period FROM admin_private.report_period_v1(p_preset, p_start_date, p_end_date, clock);
  SELECT * INTO hb FROM admin_private.job_worker_heartbeats ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1;
  late := coalesce(hb.late_after_seconds, 93600);
  IF hb.id IS NULL THEN health := 'NEVER_RUN';
  ELSIF coalesce(hb.last_started_at, hb.updated_at) >= clock - make_interval(secs => late) THEN health := 'HEALTHY';
  ELSE health := 'LATE';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.guard_check_schedule_versions s
    WHERE s.status = 'APPROVED'
      AND s.effective_from <= (clock AT TIME ZONE 'Europe/London')::date
      AND (s.effective_to IS NULL OR s.effective_to >= (clock AT TIME ZONE 'Europe/London')::date)
  ) INTO schedule_ok;
  RETURN jsonb_build_object(
    'computedAt', clock,
    'timezone', 'Europe/London',
    'period', jsonb_build_object(
      'preset', period.preset, 'start', period.start_at, 'end', period.end_at, 'timezone', period.timezone
    ),
    'freshness', jsonb_build_object(
      'status', health,
      'lastStartedAt', hb.last_started_at,
      'lastCompletedAt', hb.last_completed_at,
      'lateAfterSeconds', late
    ),
    'monitoringScheduleConfigured', schedule_ok,
    'needsAttention', jsonb_build_object(
      'overdueWork', admin_private.report_summary_payload_v1('overdue_work', period.start_at, period.end_at, clock),
      'unassignedEnquiries', admin_private.report_summary_payload_v1('unassigned_enquiries', period.start_at, period.end_at, clock),
      'missedGuardChecks', admin_private.report_summary_payload_v1('missed_guard_checks', period.start_at, period.end_at, clock),
      'unreviewedGuardAlerts', admin_private.report_summary_payload_v1('unreviewed_guard_alerts', period.start_at, period.end_at, clock),
      'guardAlertsNeedsReview', admin_private.report_summary_payload_v1('guard_alerts_needs_review', period.start_at, period.end_at, clock),
      'failedCustomerEmail', admin_private.report_summary_payload_v1('failed_customer_email', period.start_at, period.end_at, clock),
      'accessRecovery', admin_private.report_summary_payload_v1('access_recovery', period.start_at, period.end_at, clock),
      'contactRecovery', admin_private.report_summary_payload_v1('contact_recovery', period.start_at, period.end_at, clock),
      'paymentExceptions', admin_private.report_summary_payload_v1('payment_exceptions', period.start_at, period.end_at, clock),
      'guardBillingExceptions', admin_private.report_summary_payload_v1('guard_billing_exceptions', period.start_at, period.end_at, clock),
      'failedJobs', admin_private.report_summary_payload_v1('failed_jobs', period.start_at, period.end_at, clock)
    ),
    'metrics', jsonb_build_object(
      'clientsTotal', admin_private.report_summary_payload_v1('clients_total', period.start_at, period.end_at, clock),
      'clientsActiveService', admin_private.report_summary_payload_v1('clients_active_service', period.start_at, period.end_at, clock),
      'contactsEnquiryOnly', admin_private.report_summary_payload_v1('contacts_enquiry_only', period.start_at, period.end_at, clock),
      'openEnquiries', admin_private.report_summary_payload_v1('open_enquiries', period.start_at, period.end_at, clock),
      'openCases', admin_private.report_summary_payload_v1('open_cases', period.start_at, period.end_at, clock),
      'collectedGross', admin_private.report_summary_payload_v1('collected_gross', period.start_at, period.end_at, clock),
      'collectedRefunds', admin_private.report_summary_payload_v1('collected_refunds', period.start_at, period.end_at, clock),
      'outstandingMoney', admin_private.report_summary_payload_v1('outstanding_money', period.start_at, period.end_at, clock),
      'guardRequested', admin_private.report_summary_payload_v1('guard_locations_requested', period.start_at, period.end_at, clock),
      'guardOnboarding', admin_private.report_summary_payload_v1('guard_locations_onboarding', period.start_at, period.end_at, clock),
      'guardPaidActive', admin_private.report_summary_payload_v1('guard_locations_paid_active', period.start_at, period.end_at, clock),
      'guardIncludedActive', admin_private.report_summary_payload_v1('guard_locations_included_active', period.start_at, period.end_at, clock),
      'guardPaused', admin_private.report_summary_payload_v1('guard_locations_paused', period.start_at, period.end_at, clock),
      'guardEnding', admin_private.report_summary_payload_v1('guard_locations_ending', period.start_at, period.end_at, clock),
      'guardEnded', admin_private.report_summary_payload_v1('guard_locations_ended', period.start_at, period.end_at, clock),
      'guardRecurring', admin_private.report_summary_payload_v1('guard_recurring', period.start_at, period.end_at, clock),
      'checkDue', admin_private.report_summary_payload_v1('check_coverage_due', period.start_at, period.end_at, clock),
      'checkCoverage', admin_private.report_summary_payload_v1('check_coverage_completed', period.start_at, period.end_at, clock)
    ),
    'secondary', jsonb_build_object(
      'caseMix', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('type', case_type, 'track', service_track, 'count', n) ORDER BY case_type, service_track), '[]')
        FROM (
          SELECT case_type, service_track, count(*)::int AS n
          FROM public.cases WHERE status NOT IN ('CLOSED','CANCELLED')
          GROUP BY case_type, service_track
        ) x
      ),
      'upcomingDeadlines', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id, 'title', t.title, 'dueAt', t.due_at, 'caseId', t.case_id, 'reference', c.public_ref
        ) ORDER BY t.due_at, t.id), '[]')
        FROM (
          SELECT * FROM public.case_tasks
          WHERE status = 'OPEN' AND due_at >= clock
          ORDER BY due_at, id LIMIT 10
        ) t
        JOIN public.cases c ON c.id = t.case_id
      ),
      'workload', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('owner', owner, 'count', n) ORDER BY owner), '[]')
        FROM (SELECT owner, count(*)::int AS n FROM public.case_tasks WHERE status = 'OPEN' GROUP BY owner) x
      ),
      'recentPayments', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'paidAt', r.paid_at, 'amountMinor', r.amount_minor, 'currency', r.currency
        ) ORDER BY r.paid_at DESC, r.id DESC), '[]')
        FROM (SELECT * FROM public.payment_receipts ORDER BY paid_at DESC, id DESC LIMIT 10) r
      ),
      'todayWindows', CASE WHEN schedule_ok THEN (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id, 'windowCode', o.window_code, 'state', o.state, 'start', o.window_start_utc
        ) ORDER BY o.window_start_utc, o.id), '[]')
        FROM public.guard_check_obligations o
        WHERE o.service_date = (clock AT TIME ZONE 'Europe/London')::date
      ) ELSE '[]'::jsonb END
    )
  );
END; $$;

CREATE FUNCTION admin_private.decode_report_cursor_v1(p_cursor text, OUT occurred_at timestamptz, OUT row_id uuid)
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE parts text[];
BEGIN
  IF p_cursor IS NULL OR btrim(p_cursor) = '' THEN RETURN; END IF;
  parts := string_to_array(p_cursor, '|');
  IF array_length(parts, 1) <> 2 THEN RAISE EXCEPTION 'invalid_cursor'; END IF;
  occurred_at := parts[1]::timestamptz;
  row_id := parts[2]::uuid;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'invalid_cursor';
END; $$;

CREATE FUNCTION admin_private.report_detail_page_v1(
  p_key text, p_start timestamptz, p_end timestamptz, p_now timestamptz,
  p_cursor text, p_limit integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  cur_at timestamptz;
  cur_id uuid;
  rows jsonb;
  n integer;
BEGIN
  IF p_cursor IS NOT NULL THEN
    SELECT * INTO cur_at, cur_id FROM admin_private.decode_report_cursor_v1(p_cursor);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', x.row_id, 'occurredAt', x.occurred_at, 'amountMinor', x.amount_minor,
    'currency', x.currency, 'label', x.label, 'href', x.href, 'elapsedSeconds', x.elapsed_seconds
  ) ORDER BY x.occurred_at DESC, x.row_id DESC), '[]'), count(*)::int
  INTO rows, n
  FROM (
    SELECT *
    FROM admin_private.report_rows_v1(p_key, p_start, p_end, p_now) r
    WHERE cur_at IS NULL OR (r.occurred_at, r.row_id) < (cur_at, cur_id)
    ORDER BY r.occurred_at DESC, r.row_id DESC
    LIMIT lim + 1
  ) x;
  RETURN jsonb_build_object(
    'key', p_key,
    'rows', coalesce((
      SELECT jsonb_agg(elem) FROM (
        SELECT elem FROM jsonb_array_elements(rows) WITH ORDINALITY z(elem, ord) WHERE ord <= lim
      ) q
    ), '[]'),
    'hasMore', n > lim,
    'nextCursor', CASE WHEN n > lim THEN
      (SELECT (elem->>'occurredAt') || '|' || (elem->>'id')
       FROM jsonb_array_elements(rows) WITH ORDINALITY z(elem, ord) WHERE ord = lim)
    ELSE NULL END
  );
END; $$;

CREATE FUNCTION admin_private.saved_filters_protect_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NOT admin_private.saved_filter_keys_allowed_v1(NEW.module, NEW.filter) THEN
    RAISE EXCEPTION 'Guard saved filter payload is invalid';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.actor_id IS DISTINCT FROM OLD.actor_id
      OR NEW.module IS DISTINCT FROM OLD.module
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN RAISE EXCEPTION 'Saved filter identity is immutable'; END IF;
    IF NEW.record_version IS DISTINCT FROM OLD.record_version + 1 THEN
      RAISE EXCEPTION 'Saved filter version must advance by one';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER admin_saved_filters_protect
  BEFORE INSERT OR UPDATE ON public.admin_saved_filters
  FOR EACH ROW EXECUTE FUNCTION admin_private.saved_filters_protect_v1();

CREATE FUNCTION admin_private.report_export_receipts_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Report export receipts are immutable';
END; $$;
CREATE TRIGGER report_export_receipts_immutable
  BEFORE UPDATE OR DELETE ON admin_private.report_export_receipts
  FOR EACH ROW EXECUTE FUNCTION admin_private.report_export_receipts_immutable_v1();

CREATE FUNCTION admin_private.report_receipt_v1(p_actor uuid, p_request uuid, p_fp text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row admin_private.report_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO row FROM admin_private.report_command_receipts WHERE request_id = p_request;
  IF row.request_id IS NULL THEN RETURN NULL; END IF;
  IF row.actor_id IS DISTINCT FROM p_actor OR row.fingerprint IS DISTINCT FROM p_fp THEN
    RETURN jsonb_build_object('status','conflict','reason','idempotency_conflict');
  END IF;
  RETURN row.result;
END; $$;

CREATE FUNCTION admin_private.report_store_receipt_v1(p_request uuid, p_actor uuid, p_fp text, p_result jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO admin_private.report_command_receipts(request_id, actor_id, fingerprint, result)
  VALUES (p_request, p_actor, p_fp, p_result)
  ON CONFLICT (request_id) DO NOTHING;
END; $$;

CREATE FUNCTION public.admin_dashboard_today_v1(
  p_token text, p_preset text, p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL, p_now timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  BEGIN
    RETURN admin_private.dashboard_today_v1(coalesce(p_preset, 'today'), p_start_date, p_end_date, p_now);
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'invalid_period' THEN RETURN jsonb_build_object('status','invalid','reason','invalid_period'); END IF;
    RAISE;
  END;
END; $$;

CREATE FUNCTION public.admin_report_summary_v1(
  p_token text, p_key text, p_preset text, p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL, p_now timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE period record;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF NOT admin_private.report_key_allowed_v1(p_key) THEN RETURN jsonb_build_object('status','invalid','reason','invalid_report_key'); END IF;
  BEGIN
    SELECT * INTO period FROM admin_private.report_period_v1(coalesce(p_preset, 'today'), p_start_date, p_end_date, p_now);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_period');
  END;
  RETURN jsonb_build_object(
    'status','success',
    'period', jsonb_build_object('preset', period.preset, 'start', period.start_at, 'end', period.end_at, 'timezone', period.timezone),
    'summary', admin_private.report_summary_payload_v1(p_key, period.start_at, period.end_at, p_now)
  );
END; $$;

CREATE FUNCTION public.admin_report_detail_v1(
  p_token text, p_key text, p_preset text, p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL,
  p_cursor text DEFAULT NULL, p_limit integer DEFAULT 50, p_now timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE period record; page jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF NOT admin_private.report_key_allowed_v1(p_key) THEN RETURN jsonb_build_object('status','invalid','reason','invalid_report_key'); END IF;
  BEGIN
    SELECT * INTO period FROM admin_private.report_period_v1(coalesce(p_preset, 'today'), p_start_date, p_end_date, p_now);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_period');
  END;
  BEGIN
    page := admin_private.report_detail_page_v1(p_key, period.start_at, period.end_at, p_now, p_cursor, p_limit);
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'invalid_cursor' THEN RETURN jsonb_build_object('status','invalid','reason','invalid_cursor'); END IF;
    RAISE;
  END;
  RETURN jsonb_build_object(
    'status','success',
    'period', jsonb_build_object('preset', period.preset, 'start', period.start_at, 'end', period.end_at, 'timezone', period.timezone),
    'summary', admin_private.report_summary_payload_v1(p_key, period.start_at, period.end_at, p_now),
    'page', page
  );
END; $$;

CREATE FUNCTION public.admin_global_search_v1(
  p_token text, p_query text, p_cursor text DEFAULT NULL, p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  q text := lower(btrim(coalesce(p_query, '')));
  escaped text;
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  cur_rank integer;
  cur_id uuid;
  rows jsonb := '[]'::jsonb;
  n integer := 0;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF char_length(q) < 2 OR char_length(q) > 100 THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_query');
  END IF;
  escaped := admin_private.search_escape_v1(q);
  IF p_cursor IS NOT NULL THEN
    BEGIN
      cur_rank := split_part(p_cursor, '|', 1)::integer;
      cur_id := split_part(p_cursor, '|', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('status','invalid','reason','invalid_cursor');
    END;
  END IF;
  WITH hits AS (
    SELECT 1 AS rank, c.id, c.public_ref AS label, 'case'::text AS category, '/cases/' || c.id::text AS href, c.created_at
    FROM public.cases c
    WHERE lower(c.public_ref) LIKE escaped || '%' ESCAPE '\'
    UNION ALL
    SELECT 2, cu.id, cu.full_name, 'client', '/records/client/' || cu.id::text, cu.created_at
    FROM public.customers cu
    WHERE lower(btrim(cu.full_name)) LIKE '%' || escaped || '%' ESCAPE '\'
    UNION ALL
    SELECT 3, cu.id, admin_private.verified_current_email_v1(cu.id), 'email', '/records/client/' || cu.id::text, cu.created_at
    FROM public.customers cu
    WHERE admin_private.verified_current_email_v1(cu.id) IS NOT NULL
      AND admin_private.verified_current_email_v1(cu.id) LIKE '%' || escaped || '%' ESCAPE '\'
    UNION ALL
    SELECT 4, b.id, b.display_name, 'business', '/records/business/' || b.id::text, b.created_at
    FROM public.businesses b
    WHERE lower(btrim(b.display_name)) LIKE '%' || escaped || '%' ESCAPE '\'
    UNION ALL
    SELECT 5, l.id, l.location_name, 'location', '/records/location/' || l.id::text, l.created_at
    FROM public.locations l
    WHERE lower(btrim(l.location_name)) LIKE '%' || escaped || '%' ESCAPE '\'
    UNION ALL
    SELECT 6, i.id, coalesce(i.provider_invoice_id, i.id::text), 'invoice', '/money', i.created_at
    FROM public.payment_invoices i
    WHERE i.provider_invoice_id IS NOT NULL AND lower(i.provider_invoice_id) LIKE escaped || '%' ESCAPE '\'
  ), ordered AS (
    SELECT * FROM hits
    WHERE cur_rank IS NULL OR (rank, id) > (cur_rank, cur_id)
    ORDER BY rank, id
    LIMIT lim + 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'label', o.label, 'category', o.category, 'href', o.href, 'rank', o.rank
  ) ORDER BY o.rank, o.id), '[]'), count(*)::int
  INTO rows, n
  FROM ordered o;
  RETURN jsonb_build_object(
    'status','success',
    'results', coalesce((
      SELECT jsonb_agg(elem) FROM (
        SELECT elem FROM jsonb_array_elements(rows) WITH ORDINALITY z(elem, ord) WHERE ord <= lim
      ) q
    ), '[]'),
    'hasMore', n > lim,
    'nextCursor', CASE WHEN n > lim THEN
      (SELECT (elem->>'rank') || '|' || (elem->>'id')
       FROM jsonb_array_elements(rows) WITH ORDINALITY z(elem, ord) WHERE ord = lim)
    ELSE NULL END
  );
END; $$;

CREATE FUNCTION public.admin_saved_filter_list_v1(p_token text, p_module text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; actor uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  actor := (s->>'userId')::uuid;
  IF p_module IS NULL OR p_module NOT IN ('ENQUIRIES','CASES','TASKS','GUARD_CHECKS','GUARD_ALERTS','MONEY','REPORTS') THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  RETURN jsonb_build_object(
    'status','success',
    'filters', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'module', f.module, 'name', f.name, 'filter', f.filter,
        'version', f.record_version, 'updatedAt', f.updated_at
      ) ORDER BY f.name)
      FROM public.admin_saved_filters f WHERE f.actor_id = actor AND f.module = p_module
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_saved_filter_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; fp text; cached jsonb; result jsonb; row public.admin_saved_filters;
  module text; fname text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_operation IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  fp := md5(jsonb_build_array(p_operation, p_payload, p_version)::text);
  cached := admin_private.report_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  module := p_payload->>'module';
  fname := btrim(coalesce(p_payload->>'name', ''));
  IF p_operation = 'create' THEN
    IF module IS NULL
      OR module NOT IN ('ENQUIRIES','CASES','TASKS','GUARD_CHECKS','GUARD_ALERTS','MONEY','REPORTS')
      OR NOT admin_private.saved_filter_keys_allowed_v1(module, coalesce(p_payload->'filter', '{}'::jsonb))
      OR length(fname) NOT BETWEEN 1 AND 80
    THEN result := jsonb_build_object('status','invalid'); 
    ELSIF EXISTS (SELECT 1 FROM public.admin_saved_filters f WHERE f.actor_id = actor AND f.module = module AND f.name = fname) THEN
      result := jsonb_build_object('status','conflict','reason','duplicate_name');
    ELSE
      INSERT INTO public.admin_saved_filters(actor_id, module, name, filter)
      VALUES (actor, module, fname, coalesce(p_payload->'filter', '{}'::jsonb))
      RETURNING * INTO row;
      result := jsonb_build_object('status','success','id', row.id, 'version', row.record_version);
    END IF;
  ELSIF p_operation IN ('rename','replace','delete') THEN
    SELECT * INTO row FROM public.admin_saved_filters WHERE id = NULLIF(p_payload->>'id','')::uuid FOR UPDATE;
    IF row.id IS NULL THEN result := jsonb_build_object('status','invalid');
    ELSIF row.actor_id IS DISTINCT FROM actor THEN result := jsonb_build_object('status','denied');
    ELSIF row.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
    ELSIF p_operation = 'delete' THEN
      DELETE FROM public.admin_saved_filters WHERE id = row.id;
      result := jsonb_build_object('status','success','id', row.id, 'version', row.record_version);
    ELSIF p_operation = 'rename' THEN
      IF length(fname) NOT BETWEEN 1 AND 80 THEN result := jsonb_build_object('status','invalid');
      ELSIF EXISTS (SELECT 1 FROM public.admin_saved_filters f WHERE f.actor_id = actor AND f.module = row.module AND f.name = fname AND f.id <> row.id) THEN
        result := jsonb_build_object('status','conflict','reason','duplicate_name');
      ELSE
        UPDATE public.admin_saved_filters SET name = fname, record_version = record_version + 1 WHERE id = row.id RETURNING * INTO row;
        result := jsonb_build_object('status','success','id', row.id, 'version', row.record_version);
      END IF;
    ELSE
      IF NOT admin_private.saved_filter_keys_allowed_v1(row.module, coalesce(p_payload->'filter', '{}'::jsonb)) THEN
        result := jsonb_build_object('status','invalid');
      ELSE
        UPDATE public.admin_saved_filters SET filter = coalesce(p_payload->'filter', '{}'::jsonb), record_version = record_version + 1
        WHERE id = row.id RETURNING * INTO row;
        result := jsonb_build_object('status','success','id', row.id, 'version', row.record_version);
      END IF;
    END IF;
  ELSE
    result := jsonb_build_object('status','invalid');
  END IF;
  IF result->>'status' = 'success' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'REPORT_CHANGED', 'success', NULLIF(result->>'id','')::uuid, p_request, 'admin_saved_filter',
      'Saved filter ' || p_operation, jsonb_build_object('module', module, 'operation', p_operation)
    );
  END IF;
  PERFORM admin_private.report_store_receipt_v1(p_request, actor, fp, result);
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_report_export_v1(
  p_token text, p_request uuid, p_key text, p_preset text,
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL, p_now timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; fp text; period record; n integer; rows jsonb; receipt admin_private.report_export_receipts; result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR NOT admin_private.report_key_allowed_v1(p_key) THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_report_key');
  END IF;
  BEGIN
    SELECT * INTO period FROM admin_private.report_period_v1(coalesce(p_preset, 'today'), p_start_date, p_end_date, p_now);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_period');
  END;
  fp := md5(jsonb_build_array(p_key, period.start_at, period.end_at, period.timezone)::text);
  SELECT * INTO receipt FROM admin_private.report_export_receipts WHERE request_id = p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.actor_id IS DISTINCT FROM actor OR receipt.fingerprint IS DISTINCT FROM fp THEN
      RETURN jsonb_build_object('status','conflict','reason','idempotency_conflict');
    END IF;
    RETURN receipt.result;
  END IF;
  SELECT count(*)::int INTO n FROM admin_private.report_rows_v1(p_key, period.start_at, period.end_at, p_now);
  IF n > admin_private.report_export_limit_v1() THEN
    result := jsonb_build_object('status','denied','reason','export_limit', 'limit', admin_private.report_export_limit_v1(), 'count', n);
    INSERT INTO admin_private.report_export_receipts(
      request_id, actor_id, fingerprint, report_key, period_start, period_end, timezone, row_count, outcome, reason, result
    ) VALUES (p_request, actor, fp, p_key, period.start_at, period.end_at, period.timezone, n, 'denied', 'export_limit', result);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'REPORT_CHANGED', 'denied', NULL, p_request, 'report_export',
      'CSV export exceeded row limit', jsonb_build_object('reportKey', p_key, 'rowCount', n)
    );
    RETURN result;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.row_id, 'occurredAt', r.occurred_at, 'amountMinor', r.amount_minor,
    'currency', r.currency, 'label', r.label, 'elapsedSeconds', r.elapsed_seconds
  ) ORDER BY r.occurred_at DESC, r.row_id DESC), '[]')
  INTO rows
  FROM admin_private.report_rows_v1(p_key, period.start_at, period.end_at, p_now) r;
  result := jsonb_build_object(
    'status','success', 'reportKey', p_key, 'rowCount', n, 'rows', rows,
    'period', jsonb_build_object('start', period.start_at, 'end', period.end_at, 'timezone', period.timezone)
  );
  INSERT INTO admin_private.report_export_receipts(
    request_id, actor_id, fingerprint, report_key, period_start, period_end, timezone, row_count, outcome, result
  ) VALUES (p_request, actor, fp, p_key, period.start_at, period.end_at, period.timezone, n, 'success', result);
  PERFORM admin_private.write_record_audit_v1(
    actor, 'REPORT_CHANGED', 'success', NULL, p_request, 'report_export',
    'CSV export requested', jsonb_build_object('reportKey', p_key, 'rowCount', n)
  );
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_customer_preview_v1(p_token text, p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; c public.customers;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  IF p_customer IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_customer;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
  RETURN jsonb_build_object(
    'status','success',
    'customer', jsonb_build_object(
      'id', c.id,
      'fullName', c.full_name,
      'email', CASE WHEN admin_private.verified_current_email_v1(c.id) IS NOT NULL THEN c.email ELSE NULL END,
      'emailVerified', admin_private.verified_current_email_v1(c.id) IS NOT NULL
    ),
    'memberships', coalesce((
      SELECT jsonb_agg(jsonb_build_object('businessId', m.business_id, 'businessName', b.display_name) ORDER BY b.display_name)
      FROM public.business_memberships m
      JOIN public.businesses b ON b.id = m.business_id
      WHERE m.customer_id = c.id AND m.status = 'verified'
    ), '[]'),
    'locations', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.location_name, 'businessId', l.business_id) ORDER BY l.location_name)
      FROM public.locations l
      WHERE EXISTS (
        SELECT 1 FROM public.business_memberships m
        WHERE m.customer_id = c.id AND m.business_id = l.business_id AND m.status = 'verified'
      )
    ), '[]'),
    'cases', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cs.id, 'reference', cs.public_ref, 'type', cs.case_type, 'status', cs.status,
        'notes', coalesce((
          SELECT jsonb_agg(w.note ORDER BY w.id)
          FROM public.case_work_events w WHERE w.case_id = cs.id AND w.visibility = 'CUSTOMER'
        ), '[]')
      ) ORDER BY cs.submitted_at DESC)
      FROM public.cases cs WHERE cs.customer_id = c.id
    ), '[]'),
    'evidenceRequests', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'dueAt', r.due_at, 'status', r.status) ORDER BY r.created_at DESC)
      FROM public.evidence_requests r
      JOIN public.cases cs ON cs.id = r.case_id
      WHERE cs.customer_id = c.id AND r.status = 'OPEN'
    ), '[]'),
    'visibleDocuments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'title', d.title, 'filename', v.original_filename, 'contentType', v.declared_content_type
      ) ORDER BY v.created_at DESC)
      FROM public.case_documents d
      JOIN public.case_document_versions v ON v.document_id = d.id
      JOIN public.cases cs ON cs.id = d.case_id
      WHERE cs.customer_id = c.id AND v.customer_visible IS TRUE
    ), '[]'),
    'orders', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'reference', o.public_ref, 'serviceCode', o.service_code, 'amountMinor', o.amount_minor, 'currency', o.currency
      ) ORDER BY o.accepted_at DESC)
      FROM public.service_orders o WHERE o.customer_id = c.id
    ), '[]')
  );
END; $$;

REVOKE ALL ON FUNCTION
  admin_private.report_export_limit_v1(),
  admin_private.report_key_allowed_v1(text),
  admin_private.saved_filter_keys_allowed_v1(text, jsonb),
  admin_private.report_period_v1(text, date, date, timestamptz),
  admin_private.search_escape_v1(text),
  admin_private.customer_is_active_service_v1(uuid),
  admin_private.verified_current_email_v1(uuid),
  admin_private.report_rows_v1(text, timestamptz, timestamptz, timestamptz),
  admin_private.report_amount_groups_v1(text, timestamptz, timestamptz, timestamptz),
  admin_private.percentile_seconds_v1(integer[], double precision),
  admin_private.report_summary_payload_v1(text, timestamptz, timestamptz, timestamptz),
  admin_private.dashboard_today_v1(text, date, date, timestamptz),
  admin_private.decode_report_cursor_v1(text),
  admin_private.report_detail_page_v1(text, timestamptz, timestamptz, timestamptz, text, integer),
  admin_private.saved_filters_protect_v1(),
  admin_private.report_export_receipts_immutable_v1(),
  admin_private.report_receipt_v1(uuid, uuid, text),
  admin_private.report_store_receipt_v1(uuid, uuid, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.admin_dashboard_today_v1(text, text, date, date, timestamptz),
  public.admin_report_summary_v1(text, text, text, date, date, timestamptz),
  public.admin_report_detail_v1(text, text, text, date, date, text, integer, timestamptz),
  public.admin_global_search_v1(text, text, text, integer),
  public.admin_saved_filter_list_v1(text, text),
  public.admin_saved_filter_command_v1(text, uuid, text, jsonb, integer),
  public.admin_report_export_v1(text, uuid, text, text, date, date, timestamptz),
  public.admin_customer_preview_v1(text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.admin_dashboard_today_v1(text, text, date, date, timestamptz),
  public.admin_report_summary_v1(text, text, text, date, date, timestamptz),
  public.admin_report_detail_v1(text, text, text, date, date, text, integer, timestamptz),
  public.admin_global_search_v1(text, text, text, integer),
  public.admin_saved_filter_list_v1(text, text),
  public.admin_saved_filter_command_v1(text, uuid, text, jsonb, integer),
  public.admin_report_export_v1(text, uuid, text, text, date, date, timestamptz),
  public.admin_customer_preview_v1(text, uuid)
TO service_role;

COMMIT;
