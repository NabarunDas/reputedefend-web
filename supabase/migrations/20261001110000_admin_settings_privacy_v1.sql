-- Admin settings, staff/session operations, template lifecycle, privacy, complaints and incidents v1 (Step 20).
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED
-- Do not apply from this PR. Do not request Supabase credentials.
-- Do not replay or modify applied migrations (Steps 10–19).
-- Do not enable Guard, Stripe, live mail or Google. Cron remains 0 4 * * *.
-- Single staff identity: admin@profilerelaunch.com. No staff users, roles, invitations or rebinding.

BEGIN;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED',
  'PAYMENT_CHANGED','GUARD_CHANGED','REPORT_CHANGED','SETTINGS_CHANGED','TEMPLATE_CHANGED','PRIVACY_CHANGED','INCIDENT_CHANGED'
));

-- The singleton Admin identity cannot be removed or rebound. Last Owner cannot be removed
-- because there is exactly one staff identity and no role hierarchy.
CREATE FUNCTION admin_private.protect_admin_identity_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'The registered Admin identity cannot be removed';
  END IF;
  IF OLD.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'Admin identity rebinding is not permitted';
  END IF;
  IF NEW.singleton IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Admin identity must remain the singleton row';
  END IF;
  IF NEW.enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The registered Admin identity cannot be disabled';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER admin_identity_protect
  BEFORE UPDATE OR DELETE ON public.admin_identity
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_admin_identity_v1();

CREATE OR REPLACE FUNCTION admin_private.saved_filter_actor_is_staff_v1(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT admin_private.saved_filter_actor_is_admin_v1(p_actor);
$$;

CREATE TABLE admin_private.settings_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.settings_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.settings_command_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.admin_settings_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  setting_key text NOT NULL CHECK (setting_key IN ('SERVICE_HOURS','RETENTION')),
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 4096),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  retired_at timestamptz,
  retired_by uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  UNIQUE (setting_key, version),
  CONSTRAINT admin_settings_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX admin_settings_versions_current_idx
  ON public.admin_settings_versions (setting_key, effective_from DESC, version DESC)
  WHERE status IN ('APPROVED','RETIRED');
ALTER TABLE public.admin_settings_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_settings_versions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.communication_template_drafts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  template_key text NOT NULL CHECK (template_key IN (
    'EVIDENCE_REQUEST','CASE_UPDATE','CONVERSATION_REPLY','GUARD_ALERT'
  )),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  subject_template text NOT NULL CHECK (length(btrim(subject_template)) BETWEEN 1 AND 200),
  body_text_template text NOT NULL CHECK (length(btrim(body_text_template)) BETWEEN 20 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
ALTER TABLE admin_private.communication_template_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.communication_template_drafts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.legal_holds (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'UNSUCCESSFUL_ENQUIRY','CASE_EVIDENCE','FINANCIAL','CONSENT','SECURITY_LOG','CUSTOMER_RECORD'
  )),
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  status text NOT NULL CHECK (status IN ('ACTIVE','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  released_at timestamptz,
  released_by uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  CONSTRAINT legal_holds_release_pair CHECK ((released_at IS NULL) = (released_by IS NULL)),
  CONSTRAINT legal_holds_active CHECK (status <> 'ACTIVE' OR (released_at IS NULL AND released_by IS NULL))
);
CREATE INDEX legal_holds_active_idx ON public.legal_holds (category, customer_id) WHERE status = 'ACTIVE';
ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legal_holds FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('ACCESS','EXPORT','CORRECTION','DELETION')),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('RECEIVED','VERIFIED','IN_REVIEW','COMPLETED','REFUSED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  verified_at timestamptz,
  scope_note text NOT NULL CHECK (length(btrim(scope_note)) BETWEEN 3 AND 1000),
  outcome_note text NOT NULL DEFAULT '',
  preview jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(preview) = 'object' AND octet_length(preview::text) <= 4096),
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE INDEX privacy_requests_customer_idx ON public.privacy_requests (customer_id, requested_at DESC, id DESC);
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.privacy_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.operational_incidents (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('WORKER_OUTAGE','PROVIDER_FAILURE','STAFF_ABSENCE','MAIL_FAILURE','OTHER')),
  status text NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 3 AND 2000),
  linked_job_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE INDEX operational_incidents_open_idx ON public.operational_incidents (status, opened_at DESC, id DESC);
ALTER TABLE public.operational_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_incidents FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.settings_secret_payload_v1(p_payload jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) k
    WHERE lower(k) ~ '(secret|token|password|api[_-]?key|stripe|webhook|sk_|otp|private)'
  ) OR p_payload::text ~* '(sk_live|sk_test|whsec_|otp|begin [a-z]+ private key)';
$$;

CREATE FUNCTION admin_private.settings_payload_valid_v1(p_key text, p_payload jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE days integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR admin_private.settings_secret_payload_v1(p_payload) THEN
    RETURN false;
  END IF;
  IF p_key = 'SERVICE_HOURS' THEN
    RETURN coalesce(p_payload->>'timezone','') = 'Europe/London'
      AND jsonb_typeof(p_payload->'weekdays') = 'array'
      AND jsonb_array_length(p_payload->'weekdays') BETWEEN 1 AND 7
      AND (p_payload ? 'firstResponseTargetHours')
      AND (
        p_payload->'firstResponseTargetHours' = 'null'::jsonb
        OR (
          jsonb_typeof(p_payload->'firstResponseTargetHours') = 'number'
          AND (p_payload->>'firstResponseTargetHours')::integer BETWEEN 1 AND 168
        )
      );
  END IF;
  IF p_key = 'RETENTION' THEN
    FOREACH days IN ARRAY ARRAY[
      (p_payload->>'unsuccessfulEnquiriesDays')::integer,
      (p_payload->>'caseEvidenceDays')::integer,
      (p_payload->>'financialDays')::integer,
      (p_payload->>'consentDays')::integer,
      (p_payload->>'securityLogsDays')::integer
    ] LOOP
      IF days IS NULL OR days < 1 OR days > 3650 THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  END IF;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN false;
END; $$;

CREATE FUNCTION admin_private.protect_settings_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Settings versions are append-only'; END IF;
  IF NOT admin_private.settings_payload_valid_v1(NEW.setting_key, NEW.payload) THEN
    RAISE EXCEPTION 'Settings payload is invalid or contains secrets';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT' OR NEW.record_version IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Settings insert must start as draft version 1';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'RETIRED' THEN RAISE EXCEPTION 'Retired settings are immutable'; END IF;
  IF OLD.status = 'APPROVED' AND NEW.status = 'DRAFT' THEN RAISE EXCEPTION 'Approved settings cannot return to draft'; END IF;
  IF OLD.status = 'APPROVED' THEN
    IF NEW.payload IS DISTINCT FROM OLD.payload
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.setting_key IS DISTINCT FROM OLD.setting_key
      OR NEW.version IS DISTINCT FROM OLD.version
    THEN RAISE EXCEPTION 'Approved settings facts are immutable'; END IF;
  END IF;
  IF NEW.record_version IS DISTINCT FROM OLD.record_version + 1 THEN
    RAISE EXCEPTION 'Settings version increment is required';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER admin_settings_versions_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_settings_versions
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_settings_version_v1();

CREATE FUNCTION admin_private.protect_legal_hold_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Legal holds are not deleted'; END IF;
  IF TG_OP = 'INSERT' AND NEW.status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Legal hold insert must be ACTIVE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'RELEASED' THEN RAISE EXCEPTION 'Released legal holds are immutable'; END IF;
    IF NEW.category IS DISTINCT FROM OLD.category OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN RAISE EXCEPTION 'Legal hold facts are immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER legal_holds_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.legal_holds
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_legal_hold_v1();

CREATE FUNCTION admin_private.current_setting_v1(p_key text, p_now timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'key', s.setting_key, 'version', s.version, 'payload', s.payload,
    'effectiveFrom', s.effective_from, 'effectiveTo', s.effective_to, 'reason', s.reason
  )
  FROM public.admin_settings_versions s
  WHERE s.setting_key = p_key
    AND s.status IN ('APPROVED','RETIRED')
    AND s.effective_from <= coalesce(p_now, now())
    AND (s.effective_to IS NULL OR coalesce(p_now, now()) < s.effective_to)
  ORDER BY s.effective_from DESC, s.version DESC
  LIMIT 1;
$$;

CREATE FUNCTION admin_private.privacy_preview_v1(p_customer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE holds integer; receipts integer; obligations integer; comms integer; enquiries integer;
BEGIN
  SELECT count(*)::int INTO holds FROM public.legal_holds
  WHERE status = 'ACTIVE' AND (customer_id IS NULL OR customer_id = p_customer);
  SELECT count(*)::int INTO receipts FROM public.payment_receipts WHERE customer_id = p_customer;
  SELECT count(*)::int INTO obligations FROM public.payment_obligations WHERE customer_id = p_customer;
  SELECT count(*)::int INTO comms FROM public.communications WHERE customer_id = p_customer;
  SELECT count(*)::int INTO enquiries FROM public.enquiries e
  WHERE e.status <> 'converted'
    AND lower(btrim(coalesce(e.payload->>'email',''))) = (SELECT lower(email) FROM public.customers WHERE id = p_customer);
  RETURN jsonb_build_object(
    'customerId', p_customer,
    'emailVerified', admin_private.contact_verified_v1(p_customer, 'email'),
    'activeHoldCount', holds,
    'blockedByHold', holds > 0,
    'retained', jsonb_build_object(
      'paymentReceipts', receipts,
      'paymentObligations', obligations,
      'communications', comms,
      'auditAndFinancial', 'Financial receipts, obligations and audit events are retained under the approved retention policy and are not deleted by a privacy request.'
    ),
    'reviewable', jsonb_build_object('unsuccessfulOrOpenEnquiries', enquiries),
    'automatedDeletion', false
  );
END; $$;

CREATE FUNCTION admin_private.settings_receipt_v1(p_actor uuid, p_request uuid, p_fp text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT r.result FROM admin_private.settings_command_receipts r
  WHERE r.request_id = p_request AND r.actor_id = p_actor AND r.fingerprint = p_fp;
$$;

CREATE FUNCTION admin_private.settings_store_receipt_v1(p_request uuid, p_actor uuid, p_fp text, p_result jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO admin_private.settings_command_receipts(request_id, actor_id, fingerprint, result)
  VALUES (p_request, p_actor, p_fp, p_result)
  ON CONFLICT (request_id) DO NOTHING;
END; $$;

CREATE FUNCTION admin_private.settings_reauth_ok_v1(p_token text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_sessions s
    WHERE s.token_hash = p_token
      AND s.revoked_at IS NULL
      AND s.created_at >= now() - interval '5 minutes'
  );
$$;

CREATE FUNCTION public.admin_settings_overview_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; actor uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  actor := (s->>'userId')::uuid;
  RETURN jsonb_build_object(
    'status', 'success',
    'staff', jsonb_build_object(
      'title', 'ProfileRelaunch Administrator',
      'registeredAccount', 'admin@profilerelaunch.com',
      'identityBound', EXISTS (SELECT 1 FROM public.admin_identity i WHERE i.auth_user_id = actor AND i.enabled),
      'removable', false,
      'roles', 'None. This workspace has one staff identity and no staff levels.',
      'lastSignIn', (SELECT max(created_at) FROM public.admin_auth_events WHERE event = 'SIGNED_IN' AND auth_user_id = actor),
      'activeSessions', (SELECT count(*) FROM public.admin_sessions WHERE auth_user_id = actor AND revoked_at IS NULL AND expires_at > now())
    ),
    'serviceHours', admin_private.current_setting_v1('SERVICE_HOURS', now()),
    'retention', admin_private.current_setting_v1('RETENTION', now()),
    'templates', jsonb_build_object(
      'approved', (SELECT count(*) FROM admin_private.communication_templates),
      'drafts', (SELECT count(*) FROM admin_private.communication_template_drafts)
    ),
    'openComplaints', (
      SELECT count(*) FROM public.case_tasks t WHERE t.kind = 'COMPLAINT' AND t.status = 'OPEN'
    ),
    'openIncidents', (
      SELECT count(*) FROM public.operational_incidents i WHERE i.status IN ('OPEN','ACKNOWLEDGED')
    ),
    'activeHolds', (SELECT count(*) FROM public.legal_holds h WHERE h.status = 'ACTIVE'),
    'openPrivacy', (
      SELECT count(*) FROM public.privacy_requests r WHERE r.status IN ('RECEIVED','VERIFIED','IN_REVIEW')
    ),
    'schedules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'status', v.status, 'recordVersion', v.record_version,
        'effectiveFrom', v.effective_from, 'effectiveTo', v.effective_to,
        'morning', v.morning_start, 'evening', v.evening_start
      ) ORDER BY v.effective_from DESC, v.id DESC)
      FROM public.guard_check_schedule_versions v
    ), '[]'),
    'temporalNote', 'Approved settings apply from effective_from and never rewrite historical obligations, case due dates or Guard check history.'
  );
END; $$;

CREATE FUNCTION public.admin_settings_list_v1(p_token text, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  IF p_key IS NULL OR p_key NOT IN ('SERVICE_HOURS','RETENTION') THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  RETURN jsonb_build_object(
    'status','success',
    'current', admin_private.current_setting_v1(p_key, now()),
    'versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'version', v.version, 'recordVersion', v.record_version, 'status', v.status, 'payload', v.payload,
        'effectiveFrom', v.effective_from, 'effectiveTo', v.effective_to, 'reason', v.reason
      ) ORDER BY v.version DESC)
      FROM public.admin_settings_versions v WHERE v.setting_key = p_key
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_template_list_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'status','success',
    'approved', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key', t.template_key, 'version', t.version, 'name', t.name,
        'subject', t.subject_template, 'createdAt', t.created_at
      ) ORDER BY t.template_key, t.version DESC)
      FROM admin_private.communication_templates t
    ), '[]'),
    'drafts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'key', d.template_key, 'name', d.name, 'recordVersion', d.record_version,
        'subject', d.subject_template, 'body', d.body_text_template, 'createdAt', d.created_at
      ) ORDER BY d.created_at DESC)
      FROM admin_private.communication_template_drafts d
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_complaint_list_v1(p_token text, p_filter text DEFAULT 'open')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  IF p_filter IS NULL OR p_filter NOT IN ('open','resolved','all') THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  RETURN jsonb_build_object(
    'status','success',
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'caseId', t.case_id, 'reference', c.public_ref, 'title', t.title,
        'status', t.status, 'dueAt', t.due_at, 'resolution', t.resolution
      ) ORDER BY t.due_at, t.id)
      FROM (
        SELECT * FROM public.case_tasks
        WHERE kind = 'COMPLAINT'
          AND (
            p_filter = 'all'
            OR (p_filter = 'open' AND status = 'OPEN')
            OR (p_filter = 'resolved' AND status <> 'OPEN')
          )
        ORDER BY due_at, id
        LIMIT 50
      ) t
      JOIN public.cases c ON c.id = t.case_id
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_privacy_list_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'status','success',
    'holds', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id, 'category', h.category, 'customerId', h.customer_id, 'reason', h.reason,
        'status', h.status, 'recordVersion', h.record_version, 'createdAt', h.created_at
      ) ORDER BY h.created_at DESC)
      FROM public.legal_holds h
    ), '[]'),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'customerId', r.customer_id, 'status', r.status,
        'requestedAt', r.requested_at, 'dueAt', r.due_at, 'verifiedAt', r.verified_at,
        'scopeNote', r.scope_note, 'outcomeNote', r.outcome_note, 'preview', r.preview,
        'recordVersion', r.record_version
      ) ORDER BY r.requested_at DESC)
      FROM public.privacy_requests r
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_incident_list_v1(p_token text, p_filter text DEFAULT 'open')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  IF p_filter IS NULL OR p_filter NOT IN ('open','resolved','all') THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  RETURN jsonb_build_object(
    'status','success',
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'status', i.status, 'title', i.title, 'summary', i.summary,
        'openedAt', i.opened_at, 'resolvedAt', i.resolved_at, 'resolution', i.resolution,
        'recordVersion', i.record_version
      ) ORDER BY i.opened_at DESC, i.id DESC)
      FROM public.operational_incidents i
      WHERE p_filter = 'all'
        OR (p_filter = 'open' AND i.status IN ('OPEN','ACKNOWLEDGED'))
        OR (p_filter = 'resolved' AND i.status = 'RESOLVED')
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_settings_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; fp text; cached jsonb; result jsonb;
  want_key text; row public.admin_settings_versions; prev public.admin_settings_versions;
  draft admin_private.communication_template_drafts; next_ver integer;
  hold public.legal_holds; req public.privacy_requests; preview_json jsonb;
  incident public.operational_incidents; sched public.guard_check_schedule_versions;
  clock timestamptz := now(); london_day date;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_operation IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  fp := md5(jsonb_build_array(p_operation, p_payload, p_version)::text);
  cached := admin_private.settings_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  london_day := (clock AT TIME ZONE 'Europe/London')::date;

  IF p_operation = 'create_setting_draft' THEN
    want_key := p_payload->>'key';
    IF want_key IS NULL OR NOT admin_private.settings_payload_valid_v1(want_key, p_payload->'payload')
      OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 3 AND 500
    THEN result := jsonb_build_object('status','invalid');
    ELSE
      SELECT coalesce(max(v.version), 0) + 1 INTO next_ver
      FROM public.admin_settings_versions v WHERE v.setting_key = want_key;
      INSERT INTO public.admin_settings_versions(setting_key, version, status, payload, effective_from, reason, created_by)
      VALUES (
        want_key, next_ver, 'DRAFT', p_payload->'payload',
        coalesce(nullif(p_payload->>'effectiveFrom','')::timestamptz, (london_day + 1)::timestamp AT TIME ZONE 'Europe/London'),
        btrim(p_payload->>'reason'), actor
      ) RETURNING * INTO row;
      result := jsonb_build_object('status','success','id', row.id, 'version', row.record_version);
    END IF;

  ELSIF p_operation = 'approve_setting' THEN
    IF NOT admin_private.settings_reauth_ok_v1(p_token) THEN
      result := jsonb_build_object('status','reauth_required');
    ELSE
      SELECT * INTO row FROM public.admin_settings_versions WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
      IF row.id IS NULL THEN result := jsonb_build_object('status','invalid');
      ELSIF row.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
      ELSIF row.status IS DISTINCT FROM 'DRAFT' THEN result := jsonb_build_object('status','invalid');
      ELSIF row.effective_from < (london_day::timestamp AT TIME ZONE 'Europe/London') THEN
        result := jsonb_build_object('status','invalid','reason','retroactive_effective_from');
      ELSE
        SELECT * INTO prev FROM public.admin_settings_versions
        WHERE setting_key = row.setting_key AND status = 'APPROVED' FOR UPDATE;
        IF prev.id IS NOT NULL THEN
          UPDATE public.admin_settings_versions
            SET status = 'RETIRED', effective_to = row.effective_from, retired_at = clock, retired_by = actor,
                record_version = record_version + 1
          WHERE id = prev.id;
        END IF;
        UPDATE public.admin_settings_versions
          SET status = 'APPROVED', approved_at = clock, approved_by = actor, record_version = record_version + 1
        WHERE id = row.id RETURNING * INTO row;
        result := jsonb_build_object('status','success','id', row.id, 'version', row.record_version);
      END IF;
    END IF;

  ELSIF p_operation = 'create_template_draft' THEN
    IF coalesce(p_payload->>'templateKey','') NOT IN ('EVIDENCE_REQUEST','CASE_UPDATE','CONVERSATION_REPLY','GUARD_ALERT')
      OR length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 120
      OR length(btrim(coalesce(p_payload->>'subject',''))) NOT BETWEEN 1 AND 200
      OR length(btrim(coalesce(p_payload->>'body',''))) NOT BETWEEN 20 AND 5000
      OR btrim(p_payload->>'subject') LIKE '%{%}' AND btrim(p_payload->>'subject') !~ '\{[a-z0-9_]+\}'
    THEN result := jsonb_build_object('status','invalid');
    ELSE
      INSERT INTO admin_private.communication_template_drafts(template_key, name, subject_template, body_text_template, created_by)
      VALUES (
        p_payload->>'templateKey', btrim(p_payload->>'name'), btrim(p_payload->>'subject'), btrim(p_payload->>'body'), actor
      ) RETURNING * INTO draft;
      result := jsonb_build_object('status','success','id', draft.id, 'version', draft.record_version);
    END IF;

  ELSIF p_operation = 'approve_template_draft' THEN
    SELECT * INTO draft FROM admin_private.communication_template_drafts WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
    IF draft.id IS NULL THEN result := jsonb_build_object('status','invalid');
    ELSIF draft.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
    ELSIF draft.subject_template ~ '\{[^{}]*\}' AND draft.subject_template !~ '^([^{]|\{[a-z0-9_]+\})*$' THEN
      result := jsonb_build_object('status','invalid','reason','unresolved_placeholder');
    ELSE
      SELECT coalesce(max(version), 0) + 1 INTO next_ver
      FROM admin_private.communication_templates WHERE template_key = draft.template_key;
      INSERT INTO admin_private.communication_templates(template_key, version, name, subject_template, body_text_template)
      VALUES (draft.template_key, next_ver, draft.name, draft.subject_template, draft.body_text_template);
      DELETE FROM admin_private.communication_template_drafts WHERE id = draft.id;
      result := jsonb_build_object('status','success','id', draft.id, 'approvedVersion', next_ver);
    END IF;

  ELSIF p_operation = 'create_schedule_draft' THEN
    BEGIN
      INSERT INTO public.guard_check_schedule_versions(
        morning_start, morning_end, evening_start, evening_end, effective_from, status, created_by
      ) VALUES (
        (p_payload->>'morningStart')::time, (p_payload->>'morningEnd')::time,
        (p_payload->>'eveningStart')::time, (p_payload->>'eveningEnd')::time,
        coalesce(nullif(p_payload->>'effectiveFrom','')::date, london_day + 1),
        'DRAFT', actor
      ) RETURNING * INTO sched;
      result := jsonb_build_object('status','success','id', sched.id, 'version', sched.record_version);
    EXCEPTION WHEN others THEN
      result := jsonb_build_object('status','invalid','reason','invalid_schedule');
    END;

  ELSIF p_operation = 'approve_schedule' THEN
    IF NOT admin_private.settings_reauth_ok_v1(p_token) THEN
      result := jsonb_build_object('status','reauth_required');
    ELSE
      SELECT * INTO sched FROM public.guard_check_schedule_versions WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
      IF sched.id IS NULL OR sched.status IS DISTINCT FROM 'DRAFT' THEN result := jsonb_build_object('status','invalid');
      ELSIF sched.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
      ELSIF sched.effective_from < london_day THEN result := jsonb_build_object('status','invalid','reason','retroactive_effective_from');
      ELSIF EXISTS (
        SELECT 1 FROM public.guard_check_schedule_versions o
        WHERE o.id <> sched.id
          AND o.status = 'APPROVED'
          AND daterange(o.effective_from, o.effective_to, '[)') && daterange(sched.effective_from, NULL, '[)')
          AND o.effective_from >= sched.effective_from
      ) THEN
        result := jsonb_build_object('status','invalid','reason','overlapping_approved_schedule');
      ELSE
        UPDATE public.guard_check_schedule_versions
          SET status = 'RETIRED', effective_to = sched.effective_from, retired_at = clock, retired_by = actor,
              record_version = record_version + 1
        WHERE status = 'APPROVED'
          AND id <> sched.id
          AND daterange(effective_from, effective_to, '[)') && daterange(sched.effective_from, NULL, '[)')
          AND effective_from < sched.effective_from;
        UPDATE public.guard_check_schedule_versions
          SET status = 'APPROVED', approved_at = clock, approved_by = actor, record_version = record_version + 1
        WHERE id = sched.id RETURNING * INTO sched;
        result := jsonb_build_object('status','success','id', sched.id, 'version', sched.record_version);
      END IF;
    END IF;

  ELSIF p_operation = 'create_hold' THEN
    IF coalesce(p_payload->>'category','') NOT IN ('UNSUCCESSFUL_ENQUIRY','CASE_EVIDENCE','FINANCIAL','CONSENT','SECURITY_LOG','CUSTOMER_RECORD')
      OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 3 AND 500
    THEN result := jsonb_build_object('status','invalid');
    ELSIF nullif(p_payload->>'customerId','') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = nullif(p_payload->>'customerId','')::uuid)
    THEN result := jsonb_build_object('status','denied');
    ELSE
      INSERT INTO public.legal_holds(category, customer_id, reason, status, created_by)
      VALUES (
        p_payload->>'category', nullif(p_payload->>'customerId','')::uuid, btrim(p_payload->>'reason'), 'ACTIVE', actor
      ) RETURNING * INTO hold;
      result := jsonb_build_object('status','success','id', hold.id, 'version', hold.record_version);
    END IF;

  ELSIF p_operation = 'release_hold' THEN
    IF NOT admin_private.settings_reauth_ok_v1(p_token) THEN
      result := jsonb_build_object('status','reauth_required');
    ELSE
      SELECT * INTO hold FROM public.legal_holds WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
      IF hold.id IS NULL THEN result := jsonb_build_object('status','invalid');
      ELSIF hold.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
      ELSIF hold.status IS DISTINCT FROM 'ACTIVE' THEN result := jsonb_build_object('status','invalid');
      ELSE
        UPDATE public.legal_holds
          SET status = 'RELEASED', released_at = clock, released_by = actor, record_version = record_version + 1
        WHERE id = hold.id RETURNING * INTO hold;
        result := jsonb_build_object('status','success','id', hold.id, 'version', hold.record_version);
      END IF;
    END IF;

  ELSIF p_operation = 'create_privacy_request' THEN
    IF coalesce(p_payload->>'kind','') NOT IN ('ACCESS','EXPORT','CORRECTION','DELETION')
      OR nullif(p_payload->>'customerId','')::uuid IS NULL
      OR length(btrim(coalesce(p_payload->>'scopeNote',''))) NOT BETWEEN 3 AND 1000
    THEN result := jsonb_build_object('status','invalid');
    ELSIF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = (p_payload->>'customerId')::uuid) THEN
      result := jsonb_build_object('status','denied');
    ELSE
      INSERT INTO public.privacy_requests(kind, customer_id, status, due_at, scope_note, created_by)
      VALUES (
        p_payload->>'kind', (p_payload->>'customerId')::uuid, 'RECEIVED',
        nullif(p_payload->>'dueAt','')::timestamptz, btrim(p_payload->>'scopeNote'), actor
      ) RETURNING * INTO req;
      result := jsonb_build_object('status','success','id', req.id, 'version', req.record_version);
    END IF;

  ELSIF p_operation = 'verify_privacy_request' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
    IF req.id IS NULL THEN result := jsonb_build_object('status','invalid');
    ELSIF req.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
    ELSIF req.status IS DISTINCT FROM 'RECEIVED' THEN result := jsonb_build_object('status','invalid');
    ELSIF NOT admin_private.contact_verified_v1(req.customer_id, 'email') THEN
      result := jsonb_build_object('status','denied','reason','email_not_verified');
    ELSE
      UPDATE public.privacy_requests
        SET status = 'VERIFIED', verified_at = clock, record_version = record_version + 1
      WHERE id = req.id RETURNING * INTO req;
      result := jsonb_build_object('status','success','id', req.id, 'version', req.record_version);
    END IF;

  ELSIF p_operation = 'preview_privacy_request' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
    IF req.id IS NULL THEN result := jsonb_build_object('status','invalid');
    ELSIF req.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
    ELSIF req.status NOT IN ('RECEIVED','VERIFIED','IN_REVIEW') THEN result := jsonb_build_object('status','invalid');
    ELSE
      preview_json := admin_private.privacy_preview_v1(req.customer_id);
      UPDATE public.privacy_requests
        SET status = CASE WHEN req.status = 'RECEIVED' THEN 'IN_REVIEW' ELSE req.status END,
            preview = preview_json, record_version = record_version + 1
      WHERE id = req.id RETURNING * INTO req;
      result := jsonb_build_object('status','success','id', req.id, 'version', req.record_version, 'preview', preview_json);
    END IF;

  ELSIF p_operation = 'complete_privacy_request' THEN
    IF NOT admin_private.settings_reauth_ok_v1(p_token) THEN
      result := jsonb_build_object('status','reauth_required');
    ELSE
      SELECT * INTO req FROM public.privacy_requests WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
      IF req.id IS NULL THEN result := jsonb_build_object('status','invalid');
      ELSIF req.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
      ELSIF req.status NOT IN ('VERIFIED','IN_REVIEW') THEN result := jsonb_build_object('status','invalid');
      ELSE
        preview_json := admin_private.privacy_preview_v1(req.customer_id);
        IF req.kind = 'DELETION' AND (preview_json->>'blockedByHold')::boolean THEN
          UPDATE public.privacy_requests
            SET status = 'REFUSED', preview = preview_json, outcome_note = 'Legal hold blocks deletion. Financial and audit records remain.',
                record_version = record_version + 1
          WHERE id = req.id RETURNING * INTO req;
          result := jsonb_build_object('status','denied','reason','legal_hold','id', req.id, 'preview', preview_json);
        ELSE
          UPDATE public.privacy_requests
            SET status = 'COMPLETED', preview = preview_json,
                outcome_note = left(btrim(coalesce(p_payload->>'outcomeNote','Reviewed. Financial and audit records are retained.')), 1000),
                record_version = record_version + 1
          WHERE id = req.id RETURNING * INTO req;
          result := jsonb_build_object('status','success','id', req.id, 'version', req.record_version, 'preview', preview_json);
        END IF;
      END IF;
    END IF;

  ELSIF p_operation = 'create_incident' THEN
    IF coalesce(p_payload->>'kind','') NOT IN ('WORKER_OUTAGE','PROVIDER_FAILURE','STAFF_ABSENCE','MAIL_FAILURE','OTHER')
      OR length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 3 AND 200
      OR length(btrim(coalesce(p_payload->>'summary',''))) NOT BETWEEN 3 AND 2000
    THEN result := jsonb_build_object('status','invalid');
    ELSE
      INSERT INTO public.operational_incidents(kind, status, title, summary, linked_job_id, created_by)
      VALUES (
        p_payload->>'kind', 'OPEN', btrim(p_payload->>'title'), btrim(p_payload->>'summary'),
        nullif(p_payload->>'linkedJobId','')::uuid, actor
      ) RETURNING * INTO incident;
      result := jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);
    END IF;

  ELSIF p_operation = 'acknowledge_incident' THEN
    SELECT * INTO incident FROM public.operational_incidents WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
    IF incident.id IS NULL THEN result := jsonb_build_object('status','invalid');
    ELSIF incident.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
    ELSIF incident.status IS DISTINCT FROM 'OPEN' THEN result := jsonb_build_object('status','invalid');
    ELSE
      UPDATE public.operational_incidents
        SET status = 'ACKNOWLEDGED', acknowledged_at = clock, record_version = record_version + 1
      WHERE id = incident.id RETURNING * INTO incident;
      result := jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);
    END IF;

  ELSIF p_operation = 'resolve_incident' THEN
    SELECT * INTO incident FROM public.operational_incidents WHERE id = nullif(p_payload->>'id','')::uuid FOR UPDATE;
    IF incident.id IS NULL THEN result := jsonb_build_object('status','invalid');
    ELSIF incident.record_version IS DISTINCT FROM p_version THEN result := jsonb_build_object('status','conflict');
    ELSIF length(btrim(coalesce(p_payload->>'resolution',''))) NOT BETWEEN 3 AND 2000 THEN
      result := jsonb_build_object('status','invalid');
    ELSE
      UPDATE public.operational_incidents
        SET status = 'RESOLVED', resolved_at = clock, resolution = btrim(p_payload->>'resolution'),
            record_version = record_version + 1
      WHERE id = incident.id RETURNING * INTO incident;
      result := jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);
    END IF;
  ELSE
    result := jsonb_build_object('status','invalid');
  END IF;

  IF result->>'status' IN ('success','denied') THEN
    PERFORM admin_private.write_record_audit_v1(
      actor,
      CASE
        WHEN p_operation LIKE '%template%' THEN 'TEMPLATE_CHANGED'
        WHEN p_operation LIKE '%hold%' OR p_operation LIKE '%privacy%' THEN 'PRIVACY_CHANGED'
        WHEN p_operation LIKE '%incident%' THEN 'INCIDENT_CHANGED'
        ELSE 'SETTINGS_CHANGED'
      END,
      CASE WHEN result->>'status' = 'success' THEN 'success' ELSE 'denied' END,
      NULLIF(result->>'id','')::uuid, p_request, 'admin_settings',
      left(p_operation, 80),
      jsonb_build_object('operation', p_operation)
    );
  END IF;
  PERFORM admin_private.settings_store_receipt_v1(p_request, actor, fp, result);
  RETURN result;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('status','invalid','reason','invalid_id');
END; $$;

REVOKE ALL ON FUNCTION
  admin_private.protect_admin_identity_v1(),
  admin_private.settings_secret_payload_v1(jsonb),
  admin_private.settings_payload_valid_v1(text, jsonb),
  admin_private.protect_settings_version_v1(),
  admin_private.protect_legal_hold_v1(),
  admin_private.current_setting_v1(text, timestamptz),
  admin_private.privacy_preview_v1(uuid),
  admin_private.settings_receipt_v1(uuid, uuid, text),
  admin_private.settings_store_receipt_v1(uuid, uuid, text, jsonb),
  admin_private.settings_reauth_ok_v1(text)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.admin_settings_overview_v1(text),
  public.admin_settings_list_v1(text, text),
  public.admin_template_list_v1(text),
  public.admin_complaint_list_v1(text, text),
  public.admin_privacy_list_v1(text),
  public.admin_incident_list_v1(text, text),
  public.admin_settings_command_v1(text, uuid, text, jsonb, integer)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.admin_settings_overview_v1(text),
  public.admin_settings_list_v1(text, text),
  public.admin_template_list_v1(text),
  public.admin_complaint_list_v1(text, text),
  public.admin_privacy_list_v1(text),
  public.admin_incident_list_v1(text, text),
  public.admin_settings_command_v1(text, uuid, text, jsonb, integer)
TO service_role;

COMMIT;
