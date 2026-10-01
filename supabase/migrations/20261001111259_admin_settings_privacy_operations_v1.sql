-- Admin settings, staff/session, template lifecycle, privacy, complaints and incidents (Step 20).
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / DESTRUCTIVE PRIVACY ACTIONS DISABLED
-- Generated with: npx supabase migration new admin_settings_privacy_operations_v1
-- Do not apply from this PR. Do not request Supabase credentials.
-- Do not replay or modify applied migrations (Steps 10–19).
-- Single staff identity: admin@profilerelaunch.com. No staff users, roles, invitations or rebinding.
-- PRIVACY_DELETION_ENABLED remains unset. Cron remains 0 4 * * *.

BEGIN;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED',
  'PAYMENT_CHANGED','GUARD_CHANGED','REPORT_CHANGED','SETTINGS_CHANGED','TEMPLATE_CHANGED','PRIVACY_CHANGED',
  'COMPLAINT_CHANGED','INCIDENT_CHANGED'
));

CREATE FUNCTION admin_private.protect_admin_identity_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'The registered Admin identity cannot be removed'; END IF;
  IF OLD.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'Admin identity rebinding is not permitted';
  END IF;
  IF NEW.singleton IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Admin identity must remain the singleton row'; END IF;
  IF NEW.enabled IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'The registered Admin identity cannot be disabled'; END IF;
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

CREATE TABLE admin_private.privacy_export_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  privacy_request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL CHECK (NOT (result ? 'rows') AND octet_length(result::text) <= 2048),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.privacy_export_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.privacy_export_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.admin_setting_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  setting_key text NOT NULL CHECK (setting_key IN ('SERVICE_HOURS','RESPONSE_TARGETS','ALERT_ESCALATION','SUPPORTED_MARKETS')),
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
  CONSTRAINT admin_setting_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX admin_setting_versions_current_idx
  ON public.admin_setting_versions (setting_key, effective_from DESC, version DESC)
  WHERE status IN ('APPROVED','RETIRED');
ALTER TABLE public.admin_setting_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_setting_versions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.service_response_obligations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('ENQUIRY_FIRST_RESPONSE','CASE_FIRST_RESPONSE')),
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  policy_version_id uuid NOT NULL REFERENCES public.admin_setting_versions(id) ON DELETE RESTRICT,
  hours_version_id uuid NOT NULL REFERENCES public.admin_setting_versions(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  timezone text NOT NULL CHECK (timezone = 'Europe/London'),
  target_hours integer NOT NULL CHECK (target_hours BETWEEN 1 AND 168),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FULFILLED','CANCELLED')),
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_response_target_xor CHECK ((enquiry_id IS NOT NULL) <> (case_id IS NOT NULL))
);
CREATE UNIQUE INDEX service_response_obligations_enquiry_uidx
  ON public.service_response_obligations (enquiry_id) WHERE enquiry_id IS NOT NULL;
CREATE UNIQUE INDEX service_response_obligations_case_uidx
  ON public.service_response_obligations (case_id) WHERE case_id IS NOT NULL;
ALTER TABLE public.service_response_obligations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_response_obligations FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.retention_policy_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'UNSUCCESSFUL_ENQUIRIES','CASE_EVIDENCE','FINANCIAL_RECORDS','CONSENT_RECORDS','SECURITY_LOGS'
  )),
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  retention_mode text NOT NULL CHECK (retention_mode IN ('RETAIN_FOR_PERIOD','RETAIN_INDEFINITELY','MANUAL_REVIEW')),
  duration_days integer CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650),
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
  UNIQUE (category, version),
  CONSTRAINT retention_mode_duration CHECK (
    (retention_mode = 'RETAIN_FOR_PERIOD') = (duration_days IS NOT NULL)
  ),
  CONSTRAINT retention_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);
ALTER TABLE public.retention_policy_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.retention_policy_versions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.legal_holds (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  scope_kind text NOT NULL CHECK (scope_kind IN ('CUSTOMER','BUSINESS','CASE','CATEGORY')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  category text CHECK (category IS NULL OR category IN (
    'UNSUCCESSFUL_ENQUIRIES','CASE_EVIDENCE','FINANCIAL_RECORDS','CONSENT_RECORDS','SECURITY_LOGS'
  )),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  status text NOT NULL CHECK (status IN ('ACTIVE','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  released_at timestamptz,
  released_by uuid,
  release_reason text NOT NULL DEFAULT '',
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  CONSTRAINT legal_holds_one_scope CHECK (
    (scope_kind = 'CUSTOMER' AND customer_id IS NOT NULL AND business_id IS NULL AND case_id IS NULL AND category IS NULL)
    OR (scope_kind = 'BUSINESS' AND business_id IS NOT NULL AND customer_id IS NULL AND case_id IS NULL AND category IS NULL)
    OR (scope_kind = 'CASE' AND case_id IS NOT NULL AND customer_id IS NULL AND business_id IS NULL AND category IS NULL)
    OR (scope_kind = 'CATEGORY' AND category IS NOT NULL AND customer_id IS NULL AND business_id IS NULL AND case_id IS NULL)
  ),
  CONSTRAINT legal_holds_release_pair CHECK ((released_at IS NULL) = (released_by IS NULL))
);
CREATE INDEX legal_holds_active_idx ON public.legal_holds (scope_kind, status);
ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legal_holds FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('ACCESS','EXPORT','CORRECTION','DELETION')),
  status text NOT NULL CHECK (status IN (
    'RECEIVED','IDENTITY_REQUIRED','VERIFIED','REVIEWING','READY_FOR_ACTION','COMPLETED','REJECTED','CANCELLED'
  )),
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  subject_ref text NOT NULL DEFAULT '' CHECK (length(subject_ref) <= 80),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  identity_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (identity_status IN ('UNVERIFIED','VERIFIED_CONTACT','VERIFIED_MANUAL')),
  verified_at timestamptz,
  verified_by uuid,
  verification_note text NOT NULL DEFAULT '',
  owner uuid,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  resolution text NOT NULL DEFAULT '',
  preview jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(preview) = 'object' AND octet_length(preview::text) <= 4096),
  completed_at timestamptz,
  rejected_at timestamptz,
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE INDEX privacy_requests_customer_idx ON public.privacy_requests (customer_id, requested_at DESC, id DESC);
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.privacy_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.privacy_request_dispositions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  privacy_request_id uuid NOT NULL REFERENCES public.privacy_requests(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN (
    'UNSUCCESSFUL_ENQUIRIES','CASE_EVIDENCE','FINANCIAL_RECORDS','CONSENT_RECORDS','SECURITY_LOGS'
  )),
  proposed_action text NOT NULL CHECK (proposed_action IN ('EXPORT','CORRECT','DELETE','RETAIN','MANUAL_REVIEW')),
  status text NOT NULL CHECK (status IN ('PENDING','READY','BLOCKED','COMPLETED')),
  retention_policy_id uuid REFERENCES public.retention_policy_versions(id) ON DELETE RESTRICT,
  legal_hold_blocker boolean NOT NULL DEFAULT false,
  eligible_count integer NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  retained_count integer NOT NULL DEFAULT 0 CHECK (retained_count >= 0),
  blocked_reason text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (privacy_request_id, category)
);
ALTER TABLE public.privacy_request_dispositions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.privacy_request_dispositions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('CUSTOMER','PHONE','EMAIL','INTERNAL')),
  category text NOT NULL CHECK (category IN ('SERVICE','COMMUNICATION','BILLING','OUTCOME','OTHER')),
  status text NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED')),
  owner uuid,
  due_at timestamptz,
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 3 AND 2000),
  resolution text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  cancelled_at timestamptz,
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE INDEX complaints_open_idx ON public.complaints (status, received_at DESC, id DESC);
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.complaints FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.operational_incidents (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'WORKER_OUTAGE','PROVIDER_FAILURE','MONITORING_GAP','EMAIL','BILLING','SECURITY','PRIVACY','OTHER'
  )),
  severity text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  impact_summary text NOT NULL CHECK (length(btrim(impact_summary)) BETWEEN 3 AND 2000),
  owner uuid,
  linked_job_id uuid,
  linked_case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  resolution text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE INDEX operational_incidents_open_idx ON public.operational_incidents (status, started_at DESC, id DESC);
ALTER TABLE public.operational_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_incidents FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.settings_secret_payload_v1(p_payload jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) k
    WHERE lower(k) ~ '(secret|token|password|api[_-]?key|stripe|webhook|sk_|otp|private)'
  ) OR p_payload::text ~* '(sk_live|sk_test|whsec_|begin [a-z]+ private key)';
$$;

CREATE FUNCTION admin_private.hhmm_ok_v1(p_value text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_value ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$';
$$;

CREATE FUNCTION admin_private.settings_payload_valid_v1(p_key text, p_payload jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE keys text[]; rec jsonb; day int; prev_end text; n int := 0;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR admin_private.settings_secret_payload_v1(p_payload) THEN
    RETURN false;
  END IF;
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO keys FROM jsonb_object_keys(p_payload) k;
  IF p_key = 'SERVICE_HOURS' THEN
    IF keys <> ARRAY['bankHolidayDates','bankHolidayPolicy','timezone','weekendPolicy','windows']
      AND keys <> ARRAY['bankHolidayPolicy','timezone','weekendPolicy','windows'] THEN RETURN false; END IF;
    IF coalesce(p_payload->>'timezone','') <> 'Europe/London' THEN RETURN false; END IF;
    IF coalesce(p_payload->>'weekendPolicy','') NOT IN ('INCLUDED','EXCLUDED') THEN RETURN false; END IF;
    IF coalesce(p_payload->>'bankHolidayPolicy','') NOT IN ('INCLUDED','EXCLUDED_WITH_DATES') THEN RETURN false; END IF;
    IF p_payload->>'bankHolidayPolicy' = 'EXCLUDED_WITH_DATES' THEN
      IF jsonb_typeof(p_payload->'bankHolidayDates') <> 'array' OR jsonb_array_length(p_payload->'bankHolidayDates') < 1 THEN
        RETURN false;
      END IF;
    ELSIF p_payload ? 'bankHolidayDates' THEN RETURN false;
    END IF;
    IF jsonb_typeof(p_payload->'windows') <> 'array' OR jsonb_array_length(p_payload->'windows') NOT BETWEEN 1 AND 21 THEN
      RETURN false;
    END IF;
    FOR rec IN
      SELECT value FROM jsonb_array_elements(p_payload->'windows') value
      ORDER BY (value->>'day')::int, value->>'start'
    LOOP
      n := n + 1;
      IF (SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM jsonb_object_keys(rec) k) <> ARRAY['day','end','start'] THEN
        RETURN false;
      END IF;
      day := (rec->>'day')::int;
      IF day NOT BETWEEN 1 AND 7 THEN RETURN false; END IF;
      IF p_payload->>'weekendPolicy' = 'EXCLUDED' AND day IN (6,7) THEN RETURN false; END IF;
      IF NOT admin_private.hhmm_ok_v1(rec->>'start') OR NOT admin_private.hhmm_ok_v1(rec->>'end') THEN RETURN false; END IF;
      IF (rec->>'start') >= (rec->>'end') THEN RETURN false; END IF;
      IF prev_end IS NOT NULL AND split_part(prev_end, '|', 1)::int = day AND split_part(prev_end, '|', 2) > (rec->>'start') THEN
        RETURN false;
      END IF;
      prev_end := day::text || '|' || (rec->>'end');
    END LOOP;
    RETURN n > 0;
  END IF;
  IF p_key = 'RESPONSE_TARGETS' THEN
    IF keys <> ARRAY['CASE_FIRST_RESPONSE','ENQUIRY_FIRST_RESPONSE'] THEN RETURN false; END IF;
    IF jsonb_typeof(p_payload->'ENQUIRY_FIRST_RESPONSE') <> 'object' OR jsonb_typeof(p_payload->'CASE_FIRST_RESPONSE') <> 'object' THEN
      RETURN false;
    END IF;
    RETURN (p_payload#>>'{ENQUIRY_FIRST_RESPONSE,hours}')::int BETWEEN 1 AND 168
      AND (p_payload#>>'{CASE_FIRST_RESPONSE,hours}')::int BETWEEN 1 AND 168
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload->'ENQUIRY_FIRST_RESPONSE') k) = ARRAY['hours']
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload->'CASE_FIRST_RESPONSE') k) = ARRAY['hours'];
  END IF;
  IF p_key = 'ALERT_ESCALATION' THEN
    IF keys <> ARRAY['customerNotificationRequiresReview','humanReviewRequired'] THEN RETURN false; END IF;
    RETURN jsonb_typeof(p_payload->'humanReviewRequired') = 'boolean'
      AND jsonb_typeof(p_payload->'customerNotificationRequiresReview') = 'boolean';
  END IF;
  IF p_key = 'SUPPORTED_MARKETS' THEN
    IF keys <> ARRAY['countries','currencies'] THEN RETURN false; END IF;
    RETURN jsonb_typeof(p_payload->'currencies') = 'array'
      AND jsonb_typeof(p_payload->'countries') = 'array'
      AND jsonb_array_length(p_payload->'currencies') BETWEEN 1 AND 10
      AND jsonb_array_length(p_payload->'countries') BETWEEN 1 AND 30;
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
  IF NEW.status IN ('APPROVED','RETIRED') AND EXISTS (
    SELECT 1 FROM public.admin_setting_versions o
    WHERE o.setting_key = NEW.setting_key AND o.id <> NEW.id
      AND o.status IN ('APPROVED','RETIRED')
      AND tstzrange(o.effective_from, o.effective_to, '[)') && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'overlapping approved settings';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER admin_setting_versions_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_setting_versions
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_settings_version_v1();

CREATE FUNCTION admin_private.protect_retention_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Retention versions are append-only'; END IF;
  IF TG_OP = 'INSERT' AND (NEW.status IS DISTINCT FROM 'DRAFT' OR NEW.record_version IS DISTINCT FROM 1) THEN
    RAISE EXCEPTION 'Retention insert must start as draft version 1';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'RETIRED' THEN RAISE EXCEPTION 'Retired retention is immutable'; END IF;
    IF OLD.status = 'APPROVED' AND NEW.status = 'DRAFT' THEN RAISE EXCEPTION 'Approved retention cannot return to draft'; END IF;
    IF OLD.status = 'APPROVED' AND (
      NEW.retention_mode IS DISTINCT FROM OLD.retention_mode
      OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    ) THEN RAISE EXCEPTION 'Approved retention facts are immutable'; END IF;
    IF NEW.record_version IS DISTINCT FROM OLD.record_version + 1 THEN
      RAISE EXCEPTION 'Retention version increment is required';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retention_policy_versions_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.retention_policy_versions
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_retention_version_v1();

CREATE FUNCTION admin_private.protect_legal_hold_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Legal holds are not deleted'; END IF;
  IF TG_OP = 'INSERT' AND NEW.status IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'Legal hold insert must be ACTIVE'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'RELEASED' THEN RAISE EXCEPTION 'Released legal holds are immutable'; END IF;
    IF NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.category IS DISTINCT FROM OLD.category OR NEW.reason IS DISTINCT FROM OLD.reason
    THEN RAISE EXCEPTION 'Legal hold facts are immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER legal_holds_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.legal_holds
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_legal_hold_v1();

CREATE FUNCTION admin_private.privacy_transition_ok_v1(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_from, p_to) IN (
    ('RECEIVED','IDENTITY_REQUIRED'),('RECEIVED','VERIFIED'),('RECEIVED','REJECTED'),('RECEIVED','CANCELLED'),
    ('IDENTITY_REQUIRED','VERIFIED'),('IDENTITY_REQUIRED','REJECTED'),('IDENTITY_REQUIRED','CANCELLED'),
    ('VERIFIED','REVIEWING'),('VERIFIED','REJECTED'),('VERIFIED','CANCELLED'),
    ('REVIEWING','READY_FOR_ACTION'),('REVIEWING','REJECTED'),('REVIEWING','CANCELLED'),
    ('READY_FOR_ACTION','COMPLETED'),('READY_FOR_ACTION','REJECTED'),('READY_FOR_ACTION','CANCELLED')
  );
$$;

CREATE FUNCTION admin_private.protect_privacy_request_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Privacy requests are not deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('COMPLETED','REJECTED','CANCELLED') THEN RAISE EXCEPTION 'Terminal privacy requests cannot reopen'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT admin_private.privacy_transition_ok_v1(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid privacy request transition';
    END IF;
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN RAISE EXCEPTION 'Privacy request customer is immutable'; END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN RAISE EXCEPTION 'Privacy request kind is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER privacy_requests_protect
  BEFORE UPDATE OR DELETE ON public.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_privacy_request_v1();

CREATE FUNCTION admin_private.complaint_transition_ok_v1(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_from, p_to) IN (
    ('OPEN','ACKNOWLEDGED'),('OPEN','RESOLVED'),('OPEN','CANCELLED'),
    ('ACKNOWLEDGED','RESOLVED'),('ACKNOWLEDGED','CANCELLED')
  );
$$;

CREATE FUNCTION admin_private.protect_complaint_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Complaints are not deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('RESOLVED','CANCELLED') THEN RAISE EXCEPTION 'Resolved complaints are immutable'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT admin_private.complaint_transition_ok_v1(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid complaint transition';
    END IF;
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN RAISE EXCEPTION 'Complaint customer is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER complaints_protect
  BEFORE UPDATE OR DELETE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_complaint_v1();

CREATE FUNCTION admin_private.incident_transition_ok_v1(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_from, p_to) IN (
    ('OPEN','ACKNOWLEDGED'),('OPEN','RESOLVED'),('OPEN','CANCELLED'),
    ('ACKNOWLEDGED','RESOLVED'),('ACKNOWLEDGED','CANCELLED')
  ) OR p_from = p_to;
$$;

CREATE FUNCTION admin_private.protect_incident_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Incidents are not deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('RESOLVED','CANCELLED') THEN RAISE EXCEPTION 'Resolved incidents are immutable'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT admin_private.incident_transition_ok_v1(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid incident transition';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER operational_incidents_protect
  BEFORE UPDATE OR DELETE ON public.operational_incidents
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_incident_v1();

CREATE FUNCTION admin_private.protect_response_obligation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Response obligations are not deleted'; END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.due_at IS DISTINCT FROM OLD.due_at
    OR NEW.target_hours IS DISTINCT FROM OLD.target_hours
    OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
  ) THEN RAISE EXCEPTION 'Response obligation facts are immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER service_response_obligations_protect
  BEFORE UPDATE OR DELETE ON public.service_response_obligations
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_response_obligation_v1();

CREATE FUNCTION admin_private.current_setting_v1(p_key text, p_now timestamptz) RETURNS public.admin_setting_versions
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT s.*
  FROM public.admin_setting_versions s
  WHERE s.setting_key = p_key
    AND s.status IN ('APPROVED','RETIRED')
    AND s.effective_from <= coalesce(p_now, now())
    AND (s.effective_to IS NULL OR coalesce(p_now, now()) < s.effective_to)
  ORDER BY s.effective_from DESC, s.version DESC
  LIMIT 1;
$$;

CREATE FUNCTION admin_private.current_retention_v1(p_category text, p_now timestamptz) RETURNS public.retention_policy_versions
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT s.*
  FROM public.retention_policy_versions s
  WHERE s.category = p_category
    AND s.status IN ('APPROVED','RETIRED')
    AND s.effective_from <= coalesce(p_now, now())
    AND (s.effective_to IS NULL OR coalesce(p_now, now()) < s.effective_to)
  ORDER BY s.effective_from DESC, s.version DESC
  LIMIT 1;
$$;

CREATE FUNCTION admin_private.staffed_due_at_v1(p_opened timestamptz, p_target_hours integer, p_hours jsonb)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
  remaining integer := p_target_hours * 60;
  cursor_ts timestamptz := p_opened;
  local_ts timestamp;
  local_date date;
  dow int;
  win jsonb;
  win_start timestamptz;
  win_end timestamptz;
  consume int;
  guard int := 0;
  weekend_policy text := p_hours->>'weekendPolicy';
  holiday_policy text := p_hours->>'bankHolidayPolicy';
BEGIN
  IF p_opened IS NULL OR p_target_hours IS NULL OR p_hours IS NULL THEN RETURN NULL; END IF;
  WHILE remaining > 0 AND guard < 800 LOOP
    guard := guard + 1;
    local_ts := cursor_ts AT TIME ZONE 'Europe/London';
    local_date := local_ts::date;
    dow := extract(isodow FROM local_date)::int;
    IF weekend_policy = 'EXCLUDED' AND dow IN (6,7) THEN
      cursor_ts := ((local_date + 1)::timestamp AT TIME ZONE 'Europe/London');
      CONTINUE;
    END IF;
    IF holiday_policy = 'EXCLUDED_WITH_DATES'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_hours->'bankHolidayDates') d WHERE d = local_date::text
      )
    THEN
      cursor_ts := ((local_date + 1)::timestamp AT TIME ZONE 'Europe/London');
      CONTINUE;
    END IF;
    FOR win IN
      SELECT value FROM jsonb_array_elements(p_hours->'windows') value
      WHERE (value->>'day')::int = dow
      ORDER BY value->>'start'
    LOOP
      win_start := (local_date::text || ' ' || (win->>'start'))::timestamp AT TIME ZONE 'Europe/London';
      win_end := (local_date::text || ' ' || (win->>'end'))::timestamp AT TIME ZONE 'Europe/London';
      IF cursor_ts >= win_end THEN CONTINUE; END IF;
      IF cursor_ts < win_start THEN cursor_ts := win_start; END IF;
      consume := greatest(0, least(remaining, floor(extract(epoch FROM (win_end - cursor_ts)) / 60)::int));
      cursor_ts := cursor_ts + make_interval(mins => consume);
      remaining := remaining - consume;
      IF remaining <= 0 THEN RETURN cursor_ts; END IF;
    END LOOP;
    cursor_ts := ((local_date + 1)::timestamp AT TIME ZONE 'Europe/London');
  END LOOP;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.maybe_snapshot_response_obligation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE hours public.admin_setting_versions; targets public.admin_setting_versions;
  target_hours integer; due timestamptz; kind text; opened timestamptz;
BEGIN
  hours := admin_private.current_setting_v1('SERVICE_HOURS', NEW.created_at);
  targets := admin_private.current_setting_v1('RESPONSE_TARGETS', NEW.created_at);
  IF hours.id IS NULL OR targets.id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'enquiries' THEN
    kind := 'ENQUIRY_FIRST_RESPONSE';
    opened := NEW.created_at;
    target_hours := (targets.payload#>>'{ENQUIRY_FIRST_RESPONSE,hours}')::int;
  ELSE
    kind := 'CASE_FIRST_RESPONSE';
    opened := NEW.created_at;
    target_hours := (targets.payload#>>'{CASE_FIRST_RESPONSE,hours}')::int;
  END IF;
  due := admin_private.staffed_due_at_v1(opened, target_hours, hours.payload);
  IF due IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'enquiries' THEN
    INSERT INTO public.service_response_obligations(
      target_type, enquiry_id, policy_version_id, hours_version_id, opened_at, due_at, timezone, target_hours
    ) VALUES (kind, NEW.id, targets.id, hours.id, opened, due, 'Europe/London', target_hours)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.service_response_obligations(
      target_type, case_id, policy_version_id, hours_version_id, opened_at, due_at, timezone, target_hours
    ) VALUES (kind, NEW.id, targets.id, hours.id, opened, due, 'Europe/London', target_hours)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER enquiries_response_obligation
  AFTER INSERT ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION admin_private.maybe_snapshot_response_obligation_v1();
CREATE TRIGGER cases_response_obligation
  AFTER INSERT ON public.cases
  FOR EACH ROW EXECUTE FUNCTION admin_private.maybe_snapshot_response_obligation_v1();

CREATE FUNCTION admin_private.hold_blocks_v1(
  p_customer uuid, p_business uuid, p_case uuid, p_category text
) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.legal_holds h
    WHERE h.status = 'ACTIVE'
      AND (
        (h.scope_kind = 'CUSTOMER' AND p_customer IS NOT NULL AND h.customer_id = p_customer)
        OR (h.scope_kind = 'BUSINESS' AND p_business IS NOT NULL AND h.business_id = p_business)
        OR (h.scope_kind = 'CASE' AND p_case IS NOT NULL AND h.case_id = p_case)
        OR (h.scope_kind = 'CATEGORY' AND p_category IS NOT NULL AND h.category = p_category)
      )
  );
$$;

ALTER TABLE admin_private.communication_templates
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_by uuid,
  ADD COLUMN IF NOT EXISTS approval_source text,
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1);

UPDATE admin_private.communication_templates
SET status = 'APPROVED', approval_source = 'MIGRATED_EXISTING', reason = 'Existing reviewed template retained from earlier communications foundations.'
WHERE status IS NULL;

ALTER TABLE admin_private.communication_templates
  ALTER COLUMN status SET DEFAULT 'DRAFT',
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT communication_templates_status_check CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  ADD CONSTRAINT communication_templates_source_check CHECK (approval_source IN ('MIGRATED_EXISTING','ADMIN') OR approval_source IS NULL),
  ADD CONSTRAINT communication_templates_approved_source CHECK (
    status <> 'APPROVED'
    OR approval_source = 'MIGRATED_EXISTING'
    OR (approval_source = 'ADMIN' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  );

CREATE FUNCTION admin_private.protect_communication_template_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Templates are not deleted'; END IF;
  IF TG_OP = 'INSERT' AND NEW.status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Template insert must start as draft';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'RETIRED' THEN RAISE EXCEPTION 'Retired templates are immutable'; END IF;
    IF OLD.status = 'APPROVED' AND NEW.status = 'DRAFT' THEN RAISE EXCEPTION 'Approved templates cannot return to draft'; END IF;
    IF OLD.status = 'APPROVED' AND (
      NEW.subject_template IS DISTINCT FROM OLD.subject_template
      OR NEW.body_text_template IS DISTINCT FROM OLD.body_text_template
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.template_key IS DISTINCT FROM OLD.template_key
      OR NEW.version IS DISTINCT FROM OLD.version
    ) THEN RAISE EXCEPTION 'Approved template content is immutable'; END IF;
    IF NEW.record_version IS DISTINCT FROM OLD.record_version + 1 THEN
      RAISE EXCEPTION 'Template version increment is required';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER communication_templates_protect
  BEFORE INSERT OR UPDATE OR DELETE ON admin_private.communication_templates
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_communication_template_v1();

CREATE FUNCTION admin_private.template_placeholders_v1(p_key text)
RETURNS TABLE(name text, required boolean)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT * FROM (VALUES
    ('EVIDENCE_REQUEST','case_ref', true),
    ('EVIDENCE_REQUEST','specific_document', true),
    ('EVIDENCE_REQUEST','upload_url', true),
    ('CASE_UPDATE','fact', true),
    ('CASE_UPDATE','effect', true),
    ('CASE_UPDATE','next_step', true),
    ('CONVERSATION_REPLY','subject', true),
    ('CONVERSATION_REPLY','reply_body', true),
    ('GUARD_ALERT','location_name', true),
    ('GUARD_ALERT','fact', true),
    ('GUARD_ALERT','effect', true),
    ('GUARD_ALERT','next_step', true)
  ) v(template_key, name, required)
  WHERE v.template_key = p_key;
$$;

CREATE FUNCTION admin_private.template_text_valid_v1(p_key text, p_subject text, p_body text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE token text; allowed text[];
BEGIN
  IF length(btrim(p_subject)) NOT BETWEEN 1 AND 200 OR length(btrim(p_body)) NOT BETWEEN 20 AND 5000 THEN
    RETURN false;
  END IF;
  SELECT array_agg(name) INTO allowed FROM admin_private.template_placeholders_v1(p_key);
  IF EXISTS (
    SELECT 1 FROM admin_private.template_placeholders_v1(p_key) p
    WHERE p.required AND p_subject || ' ' || p_body !~ ('\{' || p.name || '\}')
  ) THEN RETURN false; END IF;
  FOR token IN SELECT (regexp_matches(p_subject || ' ' || p_body, '\{([^{}]+)\}', 'g'))[1] LOOP
    IF NOT token = ANY(allowed) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
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

CREATE FUNCTION admin_private.privacy_preview_v1(p_customer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  receipts integer; obligations integer; comms integer; enquiries integer; evidence integer;
  ret_fin public.retention_policy_versions;
  ret_enq public.retention_policy_versions;
  ret_ev public.retention_policy_versions;
  ret_cons public.retention_policy_versions;
  ret_sec public.retention_policy_versions;
BEGIN
  SELECT count(*)::int INTO receipts FROM public.payment_receipts WHERE customer_id = p_customer;
  SELECT count(*)::int INTO obligations FROM public.payment_obligations WHERE customer_id = p_customer;
  SELECT count(*)::int INTO comms FROM public.communications WHERE customer_id = p_customer;
  SELECT count(*)::int INTO evidence FROM public.case_documents d
    JOIN public.cases c ON c.id = d.case_id WHERE c.customer_id = p_customer;
  SELECT count(*)::int INTO enquiries FROM public.enquiries e
  WHERE e.status <> 'converted' AND e.case_id IS NULL AND e.monitoring_request_id IS NULL
    AND lower(btrim(coalesce(e.payload->>'email',''))) = (SELECT lower(email) FROM public.customers WHERE id = p_customer);
  ret_fin := admin_private.current_retention_v1('FINANCIAL_RECORDS', now());
  ret_enq := admin_private.current_retention_v1('UNSUCCESSFUL_ENQUIRIES', now());
  ret_ev := admin_private.current_retention_v1('CASE_EVIDENCE', now());
  ret_cons := admin_private.current_retention_v1('CONSENT_RECORDS', now());
  ret_sec := admin_private.current_retention_v1('SECURITY_LOGS', now());
  RETURN jsonb_build_object(
    'customerId', p_customer,
    'emailVerified', admin_private.contact_verified_v1(p_customer, 'email'),
    'automatedDeletion', false,
    'eligible', jsonb_build_object(
      'unsuccessfulEnquiries', CASE WHEN ret_enq.id IS NULL THEN 0 ELSE enquiries END
    ),
    'retained', jsonb_build_object(
      'paymentReceipts', receipts,
      'paymentObligations', obligations,
      'communications', comms,
      'financialAndAudit', 'Financial receipts, obligations and audit events are retained and are not deleted by a privacy request.'
    ),
    'blockedByHold', jsonb_build_object(
      'customer', admin_private.hold_blocks_v1(p_customer, NULL, NULL, NULL),
      'unsuccessfulEnquiries', admin_private.hold_blocks_v1(p_customer, NULL, NULL, 'UNSUCCESSFUL_ENQUIRIES'),
      'caseEvidence', admin_private.hold_blocks_v1(p_customer, NULL, NULL, 'CASE_EVIDENCE'),
      'financialRecords', admin_private.hold_blocks_v1(p_customer, NULL, NULL, 'FINANCIAL_RECORDS')
    ),
    'blockedNoApprovedRetention', jsonb_build_object(
      'unsuccessfulEnquiries', ret_enq.id IS NULL,
      'caseEvidence', ret_ev.id IS NULL,
      'financialRecords', ret_fin.id IS NULL,
      'consentRecords', ret_cons.id IS NULL,
      'securityLogs', ret_sec.id IS NULL
    ),
    'externalDeletionRequired', jsonb_build_object(
      'caseEvidence', evidence,
      'reason', 'Evidence objects remain BLOCKED_EXTERNAL_DELETION because storage delete is not granted.'
    ),
    'manualReview', jsonb_build_object(
      'consentRecords', 'Consent history is retained or sent to manual review; it is not auto-deleted.'
    )
  );
END; $$;

CREATE OR REPLACE FUNCTION admin_private.privacy_transition_ok_v1(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_from, p_to) IN (
    ('RECEIVED','IDENTITY_REQUIRED'),('RECEIVED','VERIFIED'),('RECEIVED','REJECTED'),('RECEIVED','CANCELLED'),
    ('IDENTITY_REQUIRED','VERIFIED'),('IDENTITY_REQUIRED','REJECTED'),('IDENTITY_REQUIRED','CANCELLED'),
    ('VERIFIED','REVIEWING'),('VERIFIED','COMPLETED'),('VERIFIED','REJECTED'),('VERIFIED','CANCELLED'),
    ('REVIEWING','READY_FOR_ACTION'),('REVIEWING','COMPLETED'),('REVIEWING','REJECTED'),('REVIEWING','CANCELLED'),
    ('READY_FOR_ACTION','COMPLETED'),('READY_FOR_ACTION','REJECTED'),('READY_FOR_ACTION','CANCELLED')
  );
$$;

CREATE FUNCTION admin_private.settings_uuid_v1(p_value text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN RETURN NULL; END IF;
  RETURN btrim(p_value)::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.settings_time_v1(p_value text) RETURNS time
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN RETURN NULL; END IF;
  IF btrim(p_value) !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN RETURN NULL; END IF;
  RETURN btrim(p_value)::time;
EXCEPTION WHEN others THEN
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.hold_category_v1(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE upper(btrim(coalesce(p_value, '')))
    WHEN 'UNSUCCESSFUL_ENQUIRIES' THEN 'UNSUCCESSFUL_ENQUIRIES'
    WHEN 'UNSUCCESSFUL_ENQUIRY' THEN 'UNSUCCESSFUL_ENQUIRIES'
    WHEN 'CASE_EVIDENCE' THEN 'CASE_EVIDENCE'
    WHEN 'FINANCIAL_RECORDS' THEN 'FINANCIAL_RECORDS'
    WHEN 'FINANCIAL' THEN 'FINANCIAL_RECORDS'
    WHEN 'CONSENT_RECORDS' THEN 'CONSENT_RECORDS'
    WHEN 'CONSENT' THEN 'CONSENT_RECORDS'
    WHEN 'SECURITY_LOGS' THEN 'SECURITY_LOGS'
    WHEN 'SECURITY_LOG' THEN 'SECURITY_LOGS'
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.setting_public_json_v1(p public.admin_setting_versions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p.id,
    'key', p.setting_key,
    'version', p.version,
    'status', p.status,
    'payload', p.payload,
    'effectiveFrom', p.effective_from,
    'effectiveTo', p.effective_to,
    'reason', p.reason,
    'recordVersion', p.record_version,
    'createdAt', p.created_at,
    'approvedAt', p.approved_at,
    'retiredAt', p.retired_at
  ) END;
$$;

CREATE FUNCTION admin_private.retention_public_json_v1(p public.retention_policy_versions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p.id,
    'category', p.category,
    'version', p.version,
    'status', p.status,
    'retentionMode', p.retention_mode,
    'durationDays', p.duration_days,
    'effectiveFrom', p.effective_from,
    'effectiveTo', p.effective_to,
    'reason', p.reason,
    'recordVersion', p.record_version,
    'createdAt', p.created_at,
    'approvedAt', p.approved_at,
    'retiredAt', p.retired_at
  ) END;
$$;

CREATE FUNCTION admin_private.template_public_json_v1(p admin_private.communication_templates) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p.id,
    'key', p.template_key,
    'templateKey', p.template_key,
    'version', p.version,
    'name', p.name,
    'subject', p.subject_template,
    'status', p.status,
    'approvalSource', p.approval_source,
    'recordVersion', p.record_version,
    'createdAt', p.created_at,
    'approvedAt', p.approved_at,
    'retiredAt', p.retired_at
  ) END;
$$;

CREATE FUNCTION admin_private.schedule_public_json_v1(p public.guard_check_schedule_versions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p.id,
    'status', p.status,
    'recordVersion', p.record_version,
    'timezone', p.timezone,
    'morningStart', p.morning_start,
    'morningEnd', p.morning_end,
    'eveningStart', p.evening_start,
    'eveningEnd', p.evening_end,
    'checksPerDay', p.checks_per_day,
    'includesWeekends', p.includes_weekends,
    'includesBankHolidays', p.includes_bank_holidays,
    'effectiveFrom', p.effective_from,
    'effectiveTo', p.effective_to,
    'createdAt', p.created_at,
    'approvedAt', p.approved_at,
    'retiredAt', p.retired_at
  ) END;
$$;

CREATE FUNCTION admin_private.settings_take_receipt_v1(p_actor uuid, p_request uuid, p_fp text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row admin_private.settings_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO row FROM admin_private.settings_command_receipts WHERE request_id = p_request;
  IF row.request_id IS NULL THEN RETURN NULL; END IF;
  IF row.actor_id IS DISTINCT FROM p_actor OR row.fingerprint IS DISTINCT FROM p_fp THEN
    RETURN jsonb_build_object('status','conflict','reason','idempotency_conflict');
  END IF;
  RETURN row.result;
END; $$;

CREATE FUNCTION admin_private.privacy_export_take_receipt_v1(p_actor uuid, p_request uuid, p_fp text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row admin_private.privacy_export_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO row FROM admin_private.privacy_export_receipts WHERE request_id = p_request;
  IF row.request_id IS NULL THEN RETURN NULL; END IF;
  IF row.actor_id IS DISTINCT FROM p_actor OR row.fingerprint IS DISTINCT FROM p_fp THEN
    RETURN jsonb_build_object('status','conflict','reason','idempotency_conflict');
  END IF;
  RETURN row.result;
END; $$;

CREATE FUNCTION admin_private.privacy_export_store_receipt_v1(
  p_request uuid, p_actor uuid, p_privacy uuid, p_fp text, p_result jsonb
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO admin_private.privacy_export_receipts(request_id, actor_id, privacy_request_id, fingerprint, result)
  VALUES (p_request, p_actor, p_privacy, p_fp, p_result)
  ON CONFLICT (request_id) DO NOTHING;
END; $$;

CREATE FUNCTION admin_private.privacy_export_rows_v1(p_customer uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'customer', (
      SELECT jsonb_build_object('id', c.id, 'fullName', c.full_name, 'email', c.email, 'phone', c.phone)
      FROM public.customers c WHERE c.id = p_customer
    ),
    'cases', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cs.id, 'publicRef', cs.public_ref, 'status', cs.status, 'type', cs.case_type
      ) ORDER BY cs.created_at DESC, cs.id DESC)
      FROM public.cases cs WHERE cs.customer_id = p_customer
    ), '[]'),
    'enquiries', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'status', e.status, 'createdAt', e.created_at, 'subject', coalesce(e.payload->>'subject', '')
      ) ORDER BY e.created_at DESC, e.id DESC)
      FROM public.enquiries e
      WHERE lower(btrim(coalesce(e.payload->>'email', ''))) = (SELECT lower(c.email) FROM public.customers c WHERE c.id = p_customer)
         OR e.case_id IN (SELECT cs.id FROM public.cases cs WHERE cs.customer_id = p_customer)
    ), '[]'),
    'communications', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'subject', m.subject, 'createdAt', m.created_at
      ) ORDER BY m.created_at DESC, m.id DESC)
      FROM public.communications m
      WHERE m.customer_id = p_customer
         OR m.case_id IN (SELECT cs.id FROM public.cases cs WHERE cs.customer_id = p_customer)
    ), '[]'),
    'paymentReceipts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'amountMinor', r.amount_minor, 'currency', r.currency, 'createdAt', r.created_at
      ) ORDER BY r.created_at DESC, r.id DESC)
      FROM public.payment_receipts r WHERE r.customer_id = p_customer
    ), '[]')
  );
$$;

CREATE FUNCTION admin_private.privacy_export_row_count_v1(p_rows jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p_rows ? 'customer' AND p_rows->'customer' IS NOT NULL AND p_rows->'customer' <> 'null'::jsonb THEN 1 ELSE 0 END
    + coalesce(jsonb_array_length(p_rows->'cases'), 0)
    + coalesce(jsonb_array_length(p_rows->'enquiries'), 0)
    + coalesce(jsonb_array_length(p_rows->'communications'), 0)
    + coalesce(jsonb_array_length(p_rows->'paymentReceipts'), 0);
$$;

CREATE FUNCTION admin_private.privacy_upsert_dispositions_v1(p_request uuid, p_preview jsonb, p_kind text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cat text;
  action text;
  st text;
  hold boolean;
  no_ret boolean;
  eligible integer;
  retained integer;
  blocked text;
  policy uuid;
  ret public.retention_policy_versions;
BEGIN
  FOREACH cat IN ARRAY ARRAY['UNSUCCESSFUL_ENQUIRIES','CASE_EVIDENCE','FINANCIAL_RECORDS','CONSENT_RECORDS','SECURITY_LOGS']
  LOOP
    ret := admin_private.current_retention_v1(cat, now());
    policy := ret.id;
    hold := coalesce((p_preview#>>'{blockedByHold,customer}')::boolean, false);
    no_ret := false;
    eligible := 0;
    retained := 0;
    blocked := '';
    IF cat = 'UNSUCCESSFUL_ENQUIRIES' THEN
      hold := hold OR coalesce((p_preview#>>'{blockedByHold,unsuccessfulEnquiries}')::boolean, false);
      no_ret := coalesce((p_preview#>>'{blockedNoApprovedRetention,unsuccessfulEnquiries}')::boolean, false);
      eligible := coalesce((p_preview#>>'{eligible,unsuccessfulEnquiries}')::int, 0);
      action := CASE WHEN p_kind IN ('ACCESS','EXPORT') THEN 'EXPORT' WHEN p_kind = 'CORRECTION' THEN 'CORRECT' ELSE 'DELETE' END;
      st := CASE WHEN hold OR no_ret THEN 'BLOCKED' ELSE 'READY' END;
      blocked := CASE WHEN hold THEN 'Legal hold' WHEN no_ret THEN 'No approved retention policy' ELSE '' END;
    ELSIF cat = 'CASE_EVIDENCE' THEN
      hold := hold OR coalesce((p_preview#>>'{blockedByHold,caseEvidence}')::boolean, false);
      no_ret := coalesce((p_preview#>>'{blockedNoApprovedRetention,caseEvidence}')::boolean, false);
      eligible := coalesce((p_preview#>>'{externalDeletionRequired,caseEvidence}')::int, 0);
      action := CASE WHEN p_kind IN ('ACCESS','EXPORT') THEN 'EXPORT' WHEN p_kind = 'CORRECTION' THEN 'CORRECT' ELSE 'DELETE' END;
      st := CASE WHEN hold OR no_ret OR eligible > 0 THEN 'BLOCKED' ELSE 'READY' END;
      blocked := CASE
        WHEN hold THEN 'Legal hold'
        WHEN no_ret THEN 'No approved retention policy'
        WHEN eligible > 0 THEN coalesce(p_preview#>>'{externalDeletionRequired,reason}', 'BLOCKED_EXTERNAL_DELETION')
        ELSE ''
      END;
    ELSIF cat = 'FINANCIAL_RECORDS' THEN
      hold := hold OR coalesce((p_preview#>>'{blockedByHold,financialRecords}')::boolean, false);
      no_ret := coalesce((p_preview#>>'{blockedNoApprovedRetention,financialRecords}')::boolean, false);
      retained := coalesce((p_preview#>>'{retained,paymentReceipts}')::int, 0)
        + coalesce((p_preview#>>'{retained,paymentObligations}')::int, 0);
      action := 'RETAIN';
      st := 'READY';
    ELSIF cat = 'CONSENT_RECORDS' THEN
      no_ret := coalesce((p_preview#>>'{blockedNoApprovedRetention,consentRecords}')::boolean, false);
      action := 'MANUAL_REVIEW';
      st := 'PENDING';
    ELSE
      no_ret := coalesce((p_preview#>>'{blockedNoApprovedRetention,securityLogs}')::boolean, false);
      action := 'RETAIN';
      st := 'READY';
    END IF;
    INSERT INTO public.privacy_request_dispositions(
      privacy_request_id, category, proposed_action, status, retention_policy_id,
      legal_hold_blocker, eligible_count, retained_count, blocked_reason, reason
    ) VALUES (
      p_request, cat, action, st, policy, hold, eligible, retained, blocked,
      CASE WHEN cat IN ('FINANCIAL_RECORDS','SECURITY_LOGS') THEN 'Retained. Financial and audit records are not deleted by a privacy request.'
           WHEN cat = 'CONSENT_RECORDS' THEN 'Consent history is retained or sent to manual review.'
           ELSE '' END
    )
    ON CONFLICT (privacy_request_id, category) DO UPDATE SET
      proposed_action = EXCLUDED.proposed_action,
      status = EXCLUDED.status,
      retention_policy_id = EXCLUDED.retention_policy_id,
      legal_hold_blocker = EXCLUDED.legal_hold_blocker,
      eligible_count = EXCLUDED.eligible_count,
      retained_count = EXCLUDED.retained_count,
      blocked_reason = EXCLUDED.blocked_reason,
      reason = EXCLUDED.reason,
      record_version = public.privacy_request_dispositions.record_version + 1;
  END LOOP;
END; $$;

CREATE FUNCTION admin_private.deletion_blocked_v1(p_req public.privacy_requests) RETURNS text
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE preview jsonb := coalesce(p_req.preview, '{}'::jsonb);
BEGIN
  IF admin_private.hold_blocks_v1(p_req.customer_id, NULL, NULL, NULL)
    OR admin_private.hold_blocks_v1(p_req.customer_id, NULL, NULL, 'UNSUCCESSFUL_ENQUIRIES')
    OR admin_private.hold_blocks_v1(p_req.customer_id, NULL, NULL, 'CASE_EVIDENCE')
    OR admin_private.hold_blocks_v1(p_req.customer_id, NULL, NULL, 'FINANCIAL_RECORDS')
    OR admin_private.hold_blocks_v1(p_req.customer_id, NULL, NULL, 'CONSENT_RECORDS')
    OR admin_private.hold_blocks_v1(p_req.customer_id, NULL, NULL, 'SECURITY_LOGS')
    OR EXISTS (
      SELECT 1 FROM public.privacy_request_dispositions d
      WHERE d.privacy_request_id = p_req.id AND d.legal_hold_blocker
    )
  THEN RETURN 'legal_hold'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.privacy_request_dispositions d WHERE d.privacy_request_id = p_req.id)
    OR EXISTS (
      SELECT 1 FROM public.privacy_request_dispositions d
      WHERE d.privacy_request_id = p_req.id AND d.status IN ('PENDING','BLOCKED')
    )
  THEN RETURN 'blocked_disposition'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.privacy_request_dispositions d
    WHERE d.privacy_request_id = p_req.id
      AND d.proposed_action = 'DELETE'
      AND (
        (d.category = 'UNSUCCESSFUL_ENQUIRIES' AND coalesce((preview#>>'{blockedNoApprovedRetention,unsuccessfulEnquiries}')::boolean, false))
        OR (d.category = 'CASE_EVIDENCE' AND coalesce((preview#>>'{blockedNoApprovedRetention,caseEvidence}')::boolean, false))
        OR (d.category = 'FINANCIAL_RECORDS' AND coalesce((preview#>>'{blockedNoApprovedRetention,financialRecords}')::boolean, false))
        OR (d.category = 'CONSENT_RECORDS' AND coalesce((preview#>>'{blockedNoApprovedRetention,consentRecords}')::boolean, false))
        OR (d.category = 'SECURITY_LOGS' AND coalesce((preview#>>'{blockedNoApprovedRetention,securityLogs}')::boolean, false))
      )
  ) THEN RETURN 'retention_required'; END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.settings_command_apply_v1(
  p_actor uuid, p_request uuid, p_operation text, p_payload jsonb, p_version integer, p_token text
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  op text := btrim(coalesce(p_operation, ''));
  clock timestamptz := now();
  london_day date := (now() AT TIME ZONE 'Europe/London')::date;
  tomorrow timestamptz := ((now() AT TIME ZONE 'Europe/London')::date + 1)::timestamp AT TIME ZONE 'Europe/London';
  result jsonb;
  want_key text;
  next_ver integer;
  reason text;
  row public.admin_setting_versions;
  prev public.admin_setting_versions;
  hours public.admin_setting_versions;
  ret public.retention_policy_versions;
  prev_ret public.retention_policy_versions;
  tpl admin_private.communication_templates;
  sched public.guard_check_schedule_versions;
  prev_sched public.guard_check_schedule_versions;
  hold public.legal_holds;
  req public.privacy_requests;
  disp public.privacy_request_dispositions;
  complaint public.complaints;
  incident public.operational_incidents;
  customer public.customers;
  cs public.cases;
  enq public.enquiries;
  preview_json jsonb;
  category text;
  mode text;
  days integer;
  effective timestamptz;
  effective_day date;
  morning_start time;
  morning_end time;
  evening_start time;
  evening_end time;
  scope text;
  note text;
  assignee uuid;
  event_count integer;
  block_reason text;
  action text;
  kind text;
  severity text;
BEGIN
  IF op = 'approve_template_draft' THEN op := 'approve_template'; END IF;
  IF op = 'verify_privacy_request' THEN op := 'verify_privacy_contact'; END IF;

  IF op IN (
    'approve_setting','retire_setting','approve_retention','retire_retention','approve_template','retire_template',
    'approve_schedule','retire_schedule','create_hold','release_hold','verify_privacy_manual','review_disposition',
    'complete_privacy_request','execute_deletion'
  ) AND NOT admin_private.settings_reauth_ok_v1(p_token) THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;

  IF op = 'create_setting_draft' THEN
    want_key := coalesce(nullif(btrim(p_payload->>'key'), ''), nullif(btrim(p_payload->>'settingKey'), ''));
    reason := btrim(coalesce(p_payload->>'reason', ''));
    IF want_key IS NULL OR want_key NOT IN ('SERVICE_HOURS','RESPONSE_TARGETS','ALERT_ESCALATION','SUPPORTED_MARKETS')
      OR jsonb_typeof(p_payload->'payload') IS DISTINCT FROM 'object'
      OR NOT admin_private.settings_payload_valid_v1(want_key, p_payload->'payload')
      OR length(reason) NOT BETWEEN 3 AND 500
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    effective := coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, tomorrow);
    SELECT coalesce(max(v.version), 0) + 1 INTO next_ver FROM public.admin_setting_versions v WHERE v.setting_key = want_key;
    INSERT INTO public.admin_setting_versions(setting_key, version, status, payload, effective_from, reason, created_by)
    VALUES (want_key, next_ver, 'DRAFT', p_payload->'payload', effective, reason, p_actor)
    RETURNING * INTO row;
    RETURN jsonb_build_object('status','success','id', row.id, 'version', row.record_version);

  ELSIF op = 'update_setting_draft' THEN
    SELECT * INTO row FROM public.admin_setting_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF row.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF row.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    reason := btrim(coalesce(nullif(p_payload->>'reason', ''), row.reason));
    IF length(reason) NOT BETWEEN 3 AND 500 THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF p_payload ? 'payload' AND jsonb_typeof(p_payload->'payload') = 'object'
      AND NOT admin_private.settings_payload_valid_v1(row.setting_key, p_payload->'payload')
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.admin_setting_versions SET
      payload = CASE WHEN p_payload ? 'payload' AND jsonb_typeof(p_payload->'payload') = 'object' THEN p_payload->'payload' ELSE payload END,
      reason = reason,
      effective_from = coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, effective_from),
      record_version = row.record_version + 1
    WHERE id = row.id RETURNING * INTO row;
    RETURN jsonb_build_object('status','success','id', row.id, 'version', row.record_version);

  ELSIF op = 'approve_setting' THEN
    SELECT * INTO row FROM public.admin_setting_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF row.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF row.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF row.effective_from < clock - interval '2 minutes' THEN RETURN jsonb_build_object('status','invalid','reason','retroactive_effective_from'); END IF;
    IF row.setting_key = 'RESPONSE_TARGETS' THEN
      hours := admin_private.current_setting_v1('SERVICE_HOURS', row.effective_from);
      IF hours.id IS NULL OR hours.status IS DISTINCT FROM 'APPROVED' THEN
        RETURN jsonb_build_object('status','denied','reason','service_hours_required');
      END IF;
    END IF;
    SELECT * INTO prev FROM public.admin_setting_versions
      WHERE setting_key = row.setting_key AND status = 'APPROVED' AND id <> row.id FOR UPDATE;
    IF prev.id IS NOT NULL THEN
      UPDATE public.admin_setting_versions
        SET status = 'RETIRED', effective_to = row.effective_from, retired_at = clock, retired_by = p_actor,
            record_version = record_version + 1
      WHERE id = prev.id;
    END IF;
    UPDATE public.admin_setting_versions
      SET status = 'APPROVED', approved_at = clock, approved_by = p_actor, record_version = row.record_version + 1
    WHERE id = row.id RETURNING * INTO row;
    RETURN jsonb_build_object('status','success','id', row.id, 'version', row.record_version);

  ELSIF op = 'retire_setting' THEN
    SELECT * INTO row FROM public.admin_setting_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF row.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF row.status IS DISTINCT FROM 'APPROVED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.admin_setting_versions
      SET status = 'RETIRED',
          effective_to = CASE WHEN effective_to IS NULL AND clock > effective_from THEN clock ELSE effective_to END,
          retired_at = clock, retired_by = p_actor, record_version = row.record_version + 1
    WHERE id = row.id RETURNING * INTO row;
    RETURN jsonb_build_object('status','success','id', row.id, 'version', row.record_version);

  ELSIF op = 'create_retention_draft' THEN
    category := admin_private.hold_category_v1(coalesce(p_payload->>'category', p_payload->>'key'));
    mode := upper(btrim(coalesce(p_payload->>'retentionMode', p_payload->>'retention_mode', '')));
    reason := btrim(coalesce(p_payload->>'reason', ''));
    days := coalesce((p_payload->>'durationDays')::int, (p_payload->>'duration_days')::int);
    IF category IS NULL OR mode NOT IN ('RETAIN_FOR_PERIOD','RETAIN_INDEFINITELY','MANUAL_REVIEW')
      OR length(reason) NOT BETWEEN 3 AND 500
      OR (mode = 'RETAIN_FOR_PERIOD') IS DISTINCT FROM (days IS NOT NULL)
      OR (days IS NOT NULL AND days NOT BETWEEN 1 AND 3650)
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    effective := coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, tomorrow);
    SELECT coalesce(max(v.version), 0) + 1 INTO next_ver FROM public.retention_policy_versions v WHERE v.category = category;
    INSERT INTO public.retention_policy_versions(
      category, version, status, retention_mode, duration_days, effective_from, reason, created_by
    ) VALUES (category, next_ver, 'DRAFT', mode, days, effective, reason, p_actor)
    RETURNING * INTO ret;
    RETURN jsonb_build_object('status','success','id', ret.id, 'version', ret.record_version);

  ELSIF op = 'update_retention_draft' THEN
    SELECT * INTO ret FROM public.retention_policy_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF ret.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF ret.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF ret.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    mode := upper(btrim(coalesce(nullif(p_payload->>'retentionMode', ''), nullif(p_payload->>'retention_mode', ''), ret.retention_mode)));
    reason := btrim(coalesce(nullif(p_payload->>'reason', ''), ret.reason));
    days := CASE
      WHEN p_payload ? 'durationDays' OR p_payload ? 'duration_days'
        THEN coalesce((p_payload->>'durationDays')::int, (p_payload->>'duration_days')::int)
      ELSE ret.duration_days
    END;
    IF mode NOT IN ('RETAIN_FOR_PERIOD','RETAIN_INDEFINITELY','MANUAL_REVIEW')
      OR length(reason) NOT BETWEEN 3 AND 500
      OR (mode = 'RETAIN_FOR_PERIOD') IS DISTINCT FROM (days IS NOT NULL)
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.retention_policy_versions SET
      retention_mode = mode, duration_days = days, reason = reason,
      effective_from = coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, effective_from),
      record_version = ret.record_version + 1
    WHERE id = ret.id RETURNING * INTO ret;
    RETURN jsonb_build_object('status','success','id', ret.id, 'version', ret.record_version);

  ELSIF op = 'approve_retention' THEN
    SELECT * INTO ret FROM public.retention_policy_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF ret.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF ret.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF ret.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF ret.effective_from < clock - interval '2 minutes' THEN RETURN jsonb_build_object('status','invalid','reason','retroactive_effective_from'); END IF;
    SELECT * INTO prev_ret FROM public.retention_policy_versions
      WHERE category = ret.category AND status = 'APPROVED' AND id <> ret.id FOR UPDATE;
    IF prev_ret.id IS NOT NULL THEN
      UPDATE public.retention_policy_versions
        SET status = 'RETIRED', effective_to = ret.effective_from, retired_at = clock, retired_by = p_actor,
            record_version = record_version + 1
      WHERE id = prev_ret.id;
    END IF;
    UPDATE public.retention_policy_versions
      SET status = 'APPROVED', approved_at = clock, approved_by = p_actor, record_version = ret.record_version + 1
    WHERE id = ret.id RETURNING * INTO ret;
    RETURN jsonb_build_object('status','success','id', ret.id, 'version', ret.record_version);

  ELSIF op = 'retire_retention' THEN
    SELECT * INTO ret FROM public.retention_policy_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF ret.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF ret.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF ret.status IS DISTINCT FROM 'APPROVED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.retention_policy_versions
      SET status = 'RETIRED',
          effective_to = CASE WHEN effective_to IS NULL AND clock > effective_from THEN clock ELSE effective_to END,
          retired_at = clock, retired_by = p_actor, record_version = ret.record_version + 1
    WHERE id = ret.id RETURNING * INTO ret;
    RETURN jsonb_build_object('status','success','id', ret.id, 'version', ret.record_version);

  ELSIF op = 'create_template_draft' THEN
    want_key := btrim(coalesce(p_payload->>'templateKey', p_payload->>'key', ''));
    IF want_key NOT IN ('EVIDENCE_REQUEST','CASE_UPDATE','CONVERSATION_REPLY','GUARD_ALERT')
      OR length(btrim(coalesce(p_payload->>'name', ''))) NOT BETWEEN 1 AND 120
      OR NOT admin_private.template_text_valid_v1(want_key, p_payload->>'subject', p_payload->>'body')
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    SELECT coalesce(max(t.version), 0) + 1 INTO next_ver
      FROM admin_private.communication_templates t WHERE t.template_key = want_key;
    INSERT INTO admin_private.communication_templates(
      template_key, version, name, subject_template, body_text_template, status, created_by, reason
    ) VALUES (
      want_key, next_ver, btrim(p_payload->>'name'), btrim(p_payload->>'subject'), btrim(p_payload->>'body'),
      'DRAFT', p_actor, btrim(coalesce(p_payload->>'reason', ''))
    ) RETURNING * INTO tpl;
    RETURN jsonb_build_object('status','success','id', tpl.id, 'version', tpl.record_version);

  ELSIF op = 'update_template_draft' THEN
    SELECT * INTO tpl FROM admin_private.communication_templates WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF tpl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF tpl.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF tpl.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF NOT admin_private.template_text_valid_v1(
      tpl.template_key,
      coalesce(p_payload->>'subject', tpl.subject_template),
      coalesce(p_payload->>'body', tpl.body_text_template)
    ) THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE admin_private.communication_templates SET
      name = coalesce(nullif(btrim(p_payload->>'name'), ''), name),
      subject_template = coalesce(nullif(p_payload->>'subject', ''), subject_template),
      body_text_template = coalesce(nullif(p_payload->>'body', ''), body_text_template),
      reason = coalesce(nullif(btrim(p_payload->>'reason'), ''), reason),
      record_version = tpl.record_version + 1
    WHERE id = tpl.id RETURNING * INTO tpl;
    RETURN jsonb_build_object('status','success','id', tpl.id, 'version', tpl.record_version);

  ELSIF op = 'approve_template' THEN
    SELECT * INTO tpl FROM admin_private.communication_templates WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF tpl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF tpl.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF tpl.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF NOT admin_private.template_text_valid_v1(tpl.template_key, tpl.subject_template, tpl.body_text_template) THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    UPDATE admin_private.communication_templates SET
      status = 'APPROVED', approval_source = 'ADMIN', approved_at = clock, approved_by = p_actor,
      record_version = tpl.record_version + 1
    WHERE id = tpl.id RETURNING * INTO tpl;
    RETURN jsonb_build_object('status','success','id', tpl.id, 'version', tpl.record_version, 'approvedVersion', tpl.version);

  ELSIF op = 'retire_template' THEN
    SELECT * INTO tpl FROM admin_private.communication_templates WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF tpl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF tpl.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF tpl.status IS DISTINCT FROM 'APPROVED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE admin_private.communication_templates SET
      status = 'RETIRED', retired_at = clock, retired_by = p_actor, record_version = tpl.record_version + 1
    WHERE id = tpl.id RETURNING * INTO tpl;
    RETURN jsonb_build_object('status','success','id', tpl.id, 'version', tpl.record_version);

  ELSIF op = 'create_schedule_draft' THEN
    morning_start := admin_private.settings_time_v1(p_payload->>'morningStart');
    morning_end := admin_private.settings_time_v1(p_payload->>'morningEnd');
    evening_start := admin_private.settings_time_v1(p_payload->>'eveningStart');
    evening_end := admin_private.settings_time_v1(p_payload->>'eveningEnd');
    effective_day := coalesce(nullif(p_payload->>'effectiveFrom', '')::date, london_day);
    IF morning_start IS NULL OR morning_end IS NULL OR evening_start IS NULL OR evening_end IS NULL
      OR morning_start >= morning_end OR evening_start >= evening_end OR morning_end > evening_start
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    INSERT INTO public.guard_check_schedule_versions(
      timezone, morning_start, morning_end, evening_start, evening_end, checks_per_day,
      includes_weekends, includes_bank_holidays, effective_from, status, created_by
    ) VALUES (
      'Europe/London', morning_start, morning_end, evening_start, evening_end, 2,
      true, true, effective_day, 'DRAFT', p_actor
    ) RETURNING * INTO sched;
    RETURN jsonb_build_object('status','success','id', sched.id, 'version', sched.record_version);

  ELSIF op = 'update_schedule_draft' THEN
    SELECT * INTO sched FROM public.guard_check_schedule_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF sched.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF sched.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF sched.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    morning_start := coalesce(admin_private.settings_time_v1(p_payload->>'morningStart'), sched.morning_start);
    morning_end := coalesce(admin_private.settings_time_v1(p_payload->>'morningEnd'), sched.morning_end);
    evening_start := coalesce(admin_private.settings_time_v1(p_payload->>'eveningStart'), sched.evening_start);
    evening_end := coalesce(admin_private.settings_time_v1(p_payload->>'eveningEnd'), sched.evening_end);
    IF morning_start >= morning_end OR evening_start >= evening_end OR morning_end > evening_start THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    UPDATE public.guard_check_schedule_versions SET
      morning_start = morning_start, morning_end = morning_end, evening_start = evening_start, evening_end = evening_end,
      effective_from = coalesce(nullif(p_payload->>'effectiveFrom', '')::date, effective_from),
      record_version = sched.record_version + 1
    WHERE id = sched.id RETURNING * INTO sched;
    RETURN jsonb_build_object('status','success','id', sched.id, 'version', sched.record_version);

  ELSIF op = 'approve_schedule' THEN
    SELECT * INTO sched FROM public.guard_check_schedule_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF sched.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF sched.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF sched.status IS DISTINCT FROM 'DRAFT' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF sched.effective_from < london_day THEN RETURN jsonb_build_object('status','invalid','reason','retroactive_effective_from'); END IF;
    FOR prev_sched IN
      SELECT * FROM public.guard_check_schedule_versions
      WHERE status = 'APPROVED' AND id <> sched.id
        AND daterange(effective_from, effective_to, '[)') && daterange(sched.effective_from, NULL, '[)')
      FOR UPDATE
    LOOP
      IF prev_sched.effective_from >= sched.effective_from THEN
        RETURN jsonb_build_object('status','invalid','reason','overlapping_approved_schedule');
      END IF;
      UPDATE public.guard_check_schedule_versions
        SET status = 'RETIRED', effective_to = sched.effective_from, retired_at = clock, retired_by = p_actor,
            record_version = record_version + 1
      WHERE id = prev_sched.id;
    END LOOP;
    UPDATE public.guard_check_schedule_versions
      SET status = 'APPROVED', approved_at = clock, approved_by = p_actor, record_version = sched.record_version + 1
    WHERE id = sched.id RETURNING * INTO sched;
    RETURN jsonb_build_object('status','success','id', sched.id, 'version', sched.record_version);

  ELSIF op = 'retire_schedule' THEN
    SELECT * INTO sched FROM public.guard_check_schedule_versions WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF sched.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF sched.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF sched.status IS DISTINCT FROM 'APPROVED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF sched.effective_to IS NULL AND london_day <= sched.effective_from THEN
      RETURN jsonb_build_object('status','invalid','reason','retroactive_effective_from');
    END IF;
    UPDATE public.guard_check_schedule_versions
      SET status = 'RETIRED',
          effective_to = CASE WHEN effective_to IS NULL THEN london_day ELSE effective_to END,
          retired_at = clock, retired_by = p_actor, record_version = sched.record_version + 1
    WHERE id = sched.id RETURNING * INTO sched;
    RETURN jsonb_build_object('status','success','id', sched.id, 'version', sched.record_version);

  ELSIF op = 'assign_rota' THEN
    assignee := coalesce(
      admin_private.settings_uuid_v1(p_payload->>'assignee'),
      admin_private.settings_uuid_v1(p_payload->>'assigneeId'),
      admin_private.settings_uuid_v1(p_payload->>'assigneeAuthUserId')
    );
    IF assignee IS NOT NULL AND assignee IS DISTINCT FROM p_actor THEN
      RETURN jsonb_build_object('status','denied','reason','single_admin_only');
    END IF;
    RETURN admin_private.guard_assign_rota_v1(p_actor, p_request, p_payload, p_version);

  ELSIF op = 'create_hold' THEN
    reason := btrim(coalesce(p_payload->>'reason', ''));
    scope := upper(btrim(coalesce(p_payload->>'scopeKind', p_payload->>'scope_kind', '')));
    category := admin_private.hold_category_v1(p_payload->>'category');
    IF scope = '' THEN
      scope := CASE
        WHEN admin_private.settings_uuid_v1(coalesce(p_payload->>'customerId', p_payload->>'customer_id')) IS NOT NULL THEN 'CUSTOMER'
        WHEN admin_private.settings_uuid_v1(coalesce(p_payload->>'businessId', p_payload->>'business_id')) IS NOT NULL THEN 'BUSINESS'
        WHEN admin_private.settings_uuid_v1(coalesce(p_payload->>'caseId', p_payload->>'case_id')) IS NOT NULL THEN 'CASE'
        WHEN category IS NOT NULL THEN 'CATEGORY'
        ELSE ''
      END;
    END IF;
    IF length(reason) NOT BETWEEN 3 AND 500 OR scope NOT IN ('CUSTOMER','BUSINESS','CASE','CATEGORY') THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    IF scope = 'CUSTOMER' THEN
      SELECT * INTO customer FROM public.customers WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'customerId', p_payload->>'customer_id'));
      IF customer.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
      INSERT INTO public.legal_holds(scope_kind, customer_id, reason, status, created_by)
      VALUES ('CUSTOMER', customer.id, reason, 'ACTIVE', p_actor) RETURNING * INTO hold;
    ELSIF scope = 'BUSINESS' THEN
      IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = admin_private.settings_uuid_v1(coalesce(p_payload->>'businessId', p_payload->>'business_id'))) THEN
        RETURN jsonb_build_object('status','invalid');
      END IF;
      INSERT INTO public.legal_holds(scope_kind, business_id, reason, status, created_by)
      VALUES ('BUSINESS', admin_private.settings_uuid_v1(coalesce(p_payload->>'businessId', p_payload->>'business_id')), reason, 'ACTIVE', p_actor)
      RETURNING * INTO hold;
    ELSIF scope = 'CASE' THEN
      SELECT * INTO cs FROM public.cases WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'caseId', p_payload->>'case_id'));
      IF cs.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
      INSERT INTO public.legal_holds(scope_kind, case_id, reason, status, created_by)
      VALUES ('CASE', cs.id, reason, 'ACTIVE', p_actor) RETURNING * INTO hold;
    ELSE
      IF category IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
      INSERT INTO public.legal_holds(scope_kind, category, reason, status, created_by)
      VALUES ('CATEGORY', category, reason, 'ACTIVE', p_actor) RETURNING * INTO hold;
    END IF;
    RETURN jsonb_build_object('status','success','id', hold.id, 'version', hold.record_version);

  ELSIF op = 'release_hold' THEN
    reason := btrim(coalesce(p_payload->>'reason', p_payload->>'releaseReason', ''));
    SELECT * INTO hold FROM public.legal_holds WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF hold.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF hold.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF hold.status IS DISTINCT FROM 'ACTIVE' OR length(reason) NOT BETWEEN 3 AND 500 THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    UPDATE public.legal_holds
      SET status = 'RELEASED', released_at = clock, released_by = p_actor, release_reason = reason,
          record_version = hold.record_version + 1
    WHERE id = hold.id RETURNING * INTO hold;
    RETURN jsonb_build_object('status','success','id', hold.id, 'version', hold.record_version);

  ELSIF op = 'create_privacy_request' THEN
    kind := upper(btrim(coalesce(p_payload->>'kind', '')));
    note := left(btrim(coalesce(p_payload->>'notes', p_payload->>'scopeNote', p_payload->>'scope_note', '')), 2000);
    IF kind NOT IN ('ACCESS','EXPORT','CORRECTION','DELETION') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    SELECT * INTO customer FROM public.customers WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'customerId', p_payload->>'customer_id'));
    IF customer.id IS NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
    INSERT INTO public.privacy_requests(kind, status, customer_id, subject_ref, notes, created_by, owner)
    VALUES (
      kind, 'RECEIVED', customer.id,
      left(btrim(coalesce(p_payload->>'subjectRef', p_payload->>'subject_ref', '')), 80),
      note, p_actor, p_actor
    ) RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op = 'request_privacy_identity' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status IS DISTINCT FROM 'RECEIVED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.privacy_requests SET status = 'IDENTITY_REQUIRED', record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op = 'verify_privacy_contact' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status NOT IN ('RECEIVED','IDENTITY_REQUIRED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(req.customer_id, 'email') THEN
      RETURN jsonb_build_object('status','denied','reason','email_not_verified');
    END IF;
    UPDATE public.privacy_requests SET
      status = 'VERIFIED', identity_status = 'VERIFIED_CONTACT', verified_at = clock, verified_by = p_actor,
      record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op = 'verify_privacy_manual' THEN
    note := btrim(coalesce(p_payload->>'note', p_payload->>'evidence', p_payload->>'verificationNote', ''));
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status NOT IN ('RECEIVED','IDENTITY_REQUIRED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF length(note) NOT BETWEEN 20 AND 500 OR note ~* '^\s*phone\s+(call|conversation)\s*$' THEN
      RETURN jsonb_build_object('status','invalid','reason','meaningful_evidence_required');
    END IF;
    UPDATE public.privacy_requests SET
      status = 'VERIFIED', identity_status = 'VERIFIED_MANUAL', verification_note = note,
      verified_at = clock, verified_by = p_actor, record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op = 'start_privacy_review' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status IS DISTINCT FROM 'VERIFIED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.privacy_requests SET status = 'REVIEWING', record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op = 'preview_privacy_request' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status NOT IN ('VERIFIED','REVIEWING','READY_FOR_ACTION') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    preview_json := admin_private.privacy_preview_v1(req.customer_id);
    PERFORM admin_private.privacy_upsert_dispositions_v1(req.id, preview_json, req.kind);
    UPDATE public.privacy_requests SET preview = preview_json, record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version, 'preview', preview_json);

  ELSIF op = 'mark_privacy_ready' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status IS DISTINCT FROM 'REVIEWING' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.kind IN ('ACCESS','EXPORT','CORRECTION') AND (
      req.preview = '{}'::jsonb
      OR EXISTS (
        SELECT 1 FROM public.privacy_request_dispositions d
        WHERE d.privacy_request_id = req.id AND d.status IN ('PENDING','BLOCKED')
      )
    ) THEN RETURN jsonb_build_object('status','denied','reason','pending_disposition'); END IF;
    UPDATE public.privacy_requests SET status = 'READY_FOR_ACTION', record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op = 'review_disposition' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'id', p_payload->>'privacyRequestId')) FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.status IN ('COMPLETED','REJECTED','CANCELLED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    category := admin_private.hold_category_v1(p_payload->>'category');
    action := upper(btrim(coalesce(p_payload->>'proposedAction', p_payload->>'action', '')));
    reason := btrim(coalesce(p_payload->>'reason', ''));
    SELECT * INTO disp FROM public.privacy_request_dispositions
      WHERE privacy_request_id = req.id AND category = category FOR UPDATE;
    IF disp.id IS NULL OR action NOT IN ('EXPORT','CORRECT','DELETE','RETAIN','MANUAL_REVIEW')
      OR length(reason) > 500
      OR coalesce(nullif(upper(btrim(p_payload->>'status')), ''), disp.status) NOT IN ('PENDING','READY','BLOCKED','COMPLETED')
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.privacy_request_dispositions SET
      proposed_action = action,
      reason = reason,
      status = coalesce(nullif(upper(btrim(p_payload->>'status')), ''), status),
      reviewed_at = clock, reviewed_by = p_actor, record_version = record_version + 1
    WHERE id = disp.id RETURNING * INTO disp;
    UPDATE public.privacy_requests SET record_version = record_version + 1 WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version, 'dispositionId', disp.id);

  ELSIF op = 'complete_privacy_request' THEN
    note := btrim(coalesce(p_payload->>'resolution', p_payload->>'outcomeNote', p_payload->>'outcome_note', ''));
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status NOT IN ('VERIFIED','REVIEWING','READY_FOR_ACTION') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF length(note) NOT BETWEEN 3 AND 1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.kind = 'DELETION' THEN
      block_reason := admin_private.deletion_blocked_v1(req);
      IF block_reason IS NOT NULL THEN RETURN jsonb_build_object('status','denied','reason', block_reason); END IF;
    END IF;
    UPDATE public.privacy_requests SET
      status = 'COMPLETED', resolution = note, completed_at = clock, record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op IN ('reject_privacy_request','cancel_privacy_request') THEN
    reason := btrim(coalesce(p_payload->>'reason', p_payload->>'resolution', ''));
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.status IN ('COMPLETED','REJECTED','CANCELLED') OR length(reason) NOT BETWEEN 3 AND 500 THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    UPDATE public.privacy_requests SET
      status = CASE WHEN op = 'reject_privacy_request' THEN 'REJECTED' ELSE 'CANCELLED' END,
      resolution = reason,
      rejected_at = CASE WHEN op = 'reject_privacy_request' THEN clock ELSE rejected_at END,
      record_version = req.record_version + 1
    WHERE id = req.id RETURNING * INTO req;
    RETURN jsonb_build_object('status','success','id', req.id, 'version', req.record_version);

  ELSIF op = 'execute_deletion' THEN
    SELECT * INTO req FROM public.privacy_requests WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'id', p_payload->>'privacyRequestId')) FOR UPDATE;
    IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF p_version IS NOT NULL AND req.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF req.kind IS DISTINCT FROM 'DELETION' OR req.status NOT IN ('VERIFIED','READY_FOR_ACTION') THEN
      RETURN jsonb_build_object('status','denied','reason','not_ready');
    END IF;
    IF req.identity_status NOT IN ('VERIFIED_CONTACT','VERIFIED_MANUAL') THEN
      RETURN jsonb_build_object('status','denied','reason','identity_unverified');
    END IF;
    SELECT * INTO enq FROM public.enquiries WHERE id = admin_private.settings_uuid_v1(p_payload->>'enquiryId') FOR UPDATE;
    SELECT * INTO customer FROM public.customers WHERE id = req.customer_id;
    IF enq.id IS NULL OR customer.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF enq.status = 'converted' OR enq.case_id IS NOT NULL OR enq.monitoring_request_id IS NOT NULL THEN
      RETURN jsonb_build_object('status','denied','reason','not_unsuccessful');
    END IF;
    IF lower(btrim(coalesce(enq.payload->>'email', ''))) IS DISTINCT FROM lower(customer.email) THEN
      RETURN jsonb_build_object('status','denied','reason','cross_customer');
    END IF;
    ret := admin_private.current_retention_v1('UNSUCCESSFUL_ENQUIRIES', clock);
    IF ret.id IS NULL OR ret.status IS DISTINCT FROM 'APPROVED' OR ret.retention_mode IS DISTINCT FROM 'RETAIN_FOR_PERIOD'
      OR ret.duration_days IS NULL OR enq.created_at + make_interval(days => ret.duration_days) > clock
    THEN RETURN jsonb_build_object('status','denied','reason','retention_required'); END IF;
    IF admin_private.hold_blocks_v1(req.customer_id, NULL, NULL, NULL)
      OR admin_private.hold_blocks_v1(req.customer_id, NULL, NULL, 'UNSUCCESSFUL_ENQUIRIES')
    THEN RETURN jsonb_build_object('status','denied','reason','legal_hold'); END IF;
    SELECT count(*)::int INTO event_count FROM public.enquiry_events WHERE enquiry_id = enq.id;
    BEGIN
      DELETE FROM public.enquiry_events WHERE enquiry_id = enq.id;
      DELETE FROM public.enquiries WHERE id = enq.id;
    EXCEPTION WHEN foreign_key_violation THEN
      RETURN jsonb_build_object('status','denied','reason','fail_closed');
    END;
    RETURN jsonb_build_object(
      'status','success','id', enq.id, 'privacyRequestId', req.id, 'deletedEvents', event_count
    );

  ELSIF op = 'create_complaint' THEN
    SELECT * INTO customer FROM public.customers WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'customerId', p_payload->>'customer_id'));
    IF customer.id IS NULL
      OR coalesce(p_payload->>'source', '') NOT IN ('CUSTOMER','PHONE','EMAIL','INTERNAL')
      OR coalesce(p_payload->>'category', '') NOT IN ('SERVICE','COMMUNICATION','BILLING','OUTCOME','OTHER')
      OR length(btrim(coalesce(p_payload->>'summary', p_payload->>'title', ''))) NOT BETWEEN 3 AND 2000
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    cs := NULL; enq := NULL;
    IF admin_private.settings_uuid_v1(coalesce(p_payload->>'caseId', p_payload->>'case_id')) IS NOT NULL THEN
      SELECT * INTO cs FROM public.cases WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'caseId', p_payload->>'case_id'));
      IF cs.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
      IF cs.customer_id IS DISTINCT FROM customer.id THEN RETURN jsonb_build_object('status','denied','reason','cross_customer'); END IF;
    END IF;
    IF admin_private.settings_uuid_v1(coalesce(p_payload->>'enquiryId', p_payload->>'enquiry_id')) IS NOT NULL THEN
      SELECT * INTO enq FROM public.enquiries WHERE id = admin_private.settings_uuid_v1(coalesce(p_payload->>'enquiryId', p_payload->>'enquiry_id'));
      IF enq.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
      IF enq.case_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.cases x WHERE x.id = enq.case_id AND x.customer_id = customer.id) THEN
          RETURN jsonb_build_object('status','denied','reason','cross_customer');
        END IF;
      ELSIF lower(btrim(coalesce(enq.payload->>'email', ''))) IS DISTINCT FROM lower(customer.email) THEN
        RETURN jsonb_build_object('status','denied','reason','cross_customer');
      END IF;
    END IF;
    INSERT INTO public.complaints(
      customer_id, case_id, enquiry_id, source, category, status, summary, created_by, owner
    ) VALUES (
      customer.id, cs.id, enq.id, p_payload->>'source', p_payload->>'category', 'OPEN',
      btrim(coalesce(p_payload->>'summary', p_payload->>'title')), p_actor, p_actor
    ) RETURNING * INTO complaint;
    RETURN jsonb_build_object('status','success','id', complaint.id, 'version', complaint.record_version);

  ELSIF op = 'acknowledge_complaint' THEN
    SELECT * INTO complaint FROM public.complaints WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF complaint.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF complaint.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF complaint.status IS DISTINCT FROM 'OPEN' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.complaints
      SET status = 'ACKNOWLEDGED', acknowledged_at = clock, record_version = complaint.record_version + 1
    WHERE id = complaint.id RETURNING * INTO complaint;
    RETURN jsonb_build_object('status','success','id', complaint.id, 'version', complaint.record_version);

  ELSIF op = 'resolve_complaint' THEN
    note := btrim(coalesce(p_payload->>'resolution', ''));
    SELECT * INTO complaint FROM public.complaints WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF complaint.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF complaint.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF complaint.status NOT IN ('OPEN','ACKNOWLEDGED') OR length(note) NOT BETWEEN 3 AND 2000 THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    UPDATE public.complaints
      SET status = 'RESOLVED', resolution = note, resolved_at = clock, resolved_by = p_actor,
          record_version = complaint.record_version + 1
    WHERE id = complaint.id RETURNING * INTO complaint;
    RETURN jsonb_build_object('status','success','id', complaint.id, 'version', complaint.record_version);

  ELSIF op = 'cancel_complaint' THEN
    SELECT * INTO complaint FROM public.complaints WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF complaint.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF complaint.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF complaint.status NOT IN ('OPEN','ACKNOWLEDGED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.complaints
      SET status = 'CANCELLED', cancelled_at = clock, record_version = complaint.record_version + 1
    WHERE id = complaint.id RETURNING * INTO complaint;
    RETURN jsonb_build_object('status','success','id', complaint.id, 'version', complaint.record_version);

  ELSIF op = 'create_incident' THEN
    kind := upper(btrim(coalesce(p_payload->>'kind', '')));
    severity := upper(btrim(coalesce(nullif(p_payload->>'severity', ''), 'MEDIUM')));
    note := btrim(coalesce(p_payload->>'impactSummary', p_payload->>'impact_summary', p_payload->>'summary', ''));
    IF kind NOT IN ('WORKER_OUTAGE','PROVIDER_FAILURE','MONITORING_GAP','EMAIL','BILLING','SECURITY','PRIVACY','OTHER')
      OR severity NOT IN ('LOW','MEDIUM','HIGH','CRITICAL')
      OR length(btrim(coalesce(p_payload->>'title', ''))) NOT BETWEEN 3 AND 200
      OR length(note) NOT BETWEEN 3 AND 2000
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF admin_private.settings_uuid_v1(coalesce(p_payload->>'linkedCaseId', p_payload->>'caseId')) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.cases x
        WHERE x.id = admin_private.settings_uuid_v1(coalesce(p_payload->>'linkedCaseId', p_payload->>'caseId'))
      )
    THEN RETURN jsonb_build_object('status','denied','reason','cross_customer'); END IF;
    INSERT INTO public.operational_incidents(
      kind, severity, status, title, impact_summary, linked_job_id, linked_case_id, created_by, owner
    ) VALUES (
      kind, severity, 'OPEN', btrim(p_payload->>'title'), note,
      admin_private.settings_uuid_v1(p_payload->>'linkedJobId'),
      admin_private.settings_uuid_v1(coalesce(p_payload->>'linkedCaseId', p_payload->>'caseId')),
      p_actor, p_actor
    ) RETURNING * INTO incident;
    RETURN jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);

  ELSIF op = 'acknowledge_incident' THEN
    SELECT * INTO incident FROM public.operational_incidents WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF incident.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF incident.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF incident.status IS DISTINCT FROM 'OPEN' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.operational_incidents
      SET status = 'ACKNOWLEDGED', acknowledged_at = clock, record_version = incident.record_version + 1
    WHERE id = incident.id RETURNING * INTO incident;
    RETURN jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);

  ELSIF op = 'update_incident_severity' THEN
    severity := upper(btrim(coalesce(p_payload->>'severity', '')));
    SELECT * INTO incident FROM public.operational_incidents WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF incident.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF incident.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF incident.status IN ('RESOLVED','CANCELLED') OR severity NOT IN ('LOW','MEDIUM','HIGH','CRITICAL') THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    UPDATE public.operational_incidents
      SET severity = severity, record_version = incident.record_version + 1
    WHERE id = incident.id RETURNING * INTO incident;
    RETURN jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);

  ELSIF op = 'resolve_incident' THEN
    note := btrim(coalesce(p_payload->>'resolution', ''));
    SELECT * INTO incident FROM public.operational_incidents WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF incident.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF incident.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF incident.status NOT IN ('OPEN','ACKNOWLEDGED') OR length(note) NOT BETWEEN 3 AND 2000 THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    UPDATE public.operational_incidents
      SET status = 'RESOLVED', resolution = note, resolved_at = clock, record_version = incident.record_version + 1
    WHERE id = incident.id RETURNING * INTO incident;
    RETURN jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);

  ELSIF op = 'cancel_incident' THEN
    SELECT * INTO incident FROM public.operational_incidents WHERE id = admin_private.settings_uuid_v1(p_payload->>'id') FOR UPDATE;
    IF incident.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF incident.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF incident.status NOT IN ('OPEN','ACKNOWLEDGED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
    UPDATE public.operational_incidents
      SET status = 'CANCELLED', cancelled_at = clock, record_version = incident.record_version + 1
    WHERE id = incident.id RETURNING * INTO incident;
    RETURN jsonb_build_object('status','success','id', incident.id, 'version', incident.record_version);
  END IF;

  RETURN jsonb_build_object('status','invalid');
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_id');
  WHEN others THEN
    IF SQLERRM = 'overlapping approved settings' THEN
      RETURN jsonb_build_object('status','invalid','reason','overlapping_approved_settings');
    END IF;
    IF SQLERRM = 'overlapping approved schedule' THEN
      RETURN jsonb_build_object('status','invalid','reason','overlapping_approved_schedule');
    END IF;
    RAISE;
END; $$;

CREATE FUNCTION public.admin_settings_overview_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  actor uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN NULL; END IF;
  actor := (s->>'userId')::uuid;
  RETURN jsonb_build_object(
    'status', 'success',
    'staff', jsonb_build_object(
      'title', 'ProfileRelaunch Administrator',
      'registeredAccount', 'admin@profilerelaunch.com',
      'identityBound', EXISTS (SELECT 1 FROM public.admin_identity i WHERE i.singleton AND i.auth_user_id IS NOT NULL),
      'removable', false,
      'roles', 'None. This workspace has one staff identity and no staff levels.',
      'lastSignIn', (SELECT max(e.created_at) FROM public.admin_auth_events e WHERE e.event = 'SIGNED_IN' AND e.auth_user_id = actor),
      'activeSessions', (
        SELECT count(*) FROM public.admin_sessions sess
        WHERE sess.auth_user_id = actor AND sess.revoked_at IS NULL AND sess.expires_at > now()
      ),
      'enabled', coalesce((SELECT i.enabled FROM public.admin_identity i WHERE i.singleton), false)
    ),
    'serviceHours', admin_private.setting_public_json_v1(admin_private.current_setting_v1('SERVICE_HOURS', now())),
    'responseTargets', admin_private.setting_public_json_v1(admin_private.current_setting_v1('RESPONSE_TARGETS', now())),
    'alertEscalation', admin_private.setting_public_json_v1(admin_private.current_setting_v1('ALERT_ESCALATION', now())),
    'supportedMarkets', admin_private.setting_public_json_v1(admin_private.current_setting_v1('SUPPORTED_MARKETS', now())),
    'retention', jsonb_build_object(
      'UNSUCCESSFUL_ENQUIRIES', admin_private.retention_public_json_v1(admin_private.current_retention_v1('UNSUCCESSFUL_ENQUIRIES', now())),
      'CASE_EVIDENCE', admin_private.retention_public_json_v1(admin_private.current_retention_v1('CASE_EVIDENCE', now())),
      'FINANCIAL_RECORDS', admin_private.retention_public_json_v1(admin_private.current_retention_v1('FINANCIAL_RECORDS', now())),
      'CONSENT_RECORDS', admin_private.retention_public_json_v1(admin_private.current_retention_v1('CONSENT_RECORDS', now())),
      'SECURITY_LOGS', admin_private.retention_public_json_v1(admin_private.current_retention_v1('SECURITY_LOGS', now()))
    ),
    'templates', jsonb_build_object(
      'approved', (SELECT count(*) FROM admin_private.communication_templates t WHERE t.status = 'APPROVED'),
      'drafts', (SELECT count(*) FROM admin_private.communication_templates t WHERE t.status = 'DRAFT')
    ),
    'openComplaints', (SELECT count(*) FROM public.complaints c WHERE c.status IN ('OPEN','ACKNOWLEDGED')),
    'openIncidents', (SELECT count(*) FROM public.operational_incidents i WHERE i.status IN ('OPEN','ACKNOWLEDGED')),
    'activeHolds', (SELECT count(*) FROM public.legal_holds h WHERE h.status = 'ACTIVE'),
    'openPrivacy', (
      SELECT count(*) FROM public.privacy_requests r
      WHERE r.status IN ('RECEIVED','IDENTITY_REQUIRED','VERIFIED','REVIEWING','READY_FOR_ACTION')
    ),
    'schedules', coalesce((
      SELECT jsonb_agg(admin_private.schedule_public_json_v1(v) ORDER BY v.effective_from DESC, v.id DESC)
      FROM public.guard_check_schedule_versions v
    ), '[]'),
    'rotaAssignments', jsonb_build_object(
      'active', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'coverageId', r.coverage_id, 'assigneeAuthUserId', r.assignee_auth_user_id,
          'status', r.status, 'createdAt', r.created_at
        ) ORDER BY r.created_at DESC)
        FROM public.guard_rota_assignments r WHERE r.status = 'ACTIVE'
      ), '[]'),
      'missingCoverage', coalesce((
        SELECT jsonb_agg(c.id ORDER BY c.created_at DESC)
        FROM public.guard_coverages c
        WHERE c.state <> 'ENDED'
          AND NOT EXISTS (
            SELECT 1 FROM public.guard_rota_assignments r
            WHERE r.coverage_id = c.id AND r.status = 'ACTIVE'
          )
      ), '[]'),
      'note', 'Rota assignment always binds to the single Admin identity. A different assignee is rejected.'
    ),
    'singleAdminNote', 'This workspace has one staff identity and no staff levels. assign_rota assigns only to the signed-in Admin and rejects a different assignee.',
    'temporalNote', 'Approved settings apply from effective_from. Historical obligations, communications and reports are not rewritten. No approved seeds are created by this migration.',
    'noApprovedSeeds', true
  );
END; $$;

CREATE FUNCTION public.admin_settings_list_v1(p_token text, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_key IS NULL OR p_key NOT IN ('SERVICE_HOURS','RESPONSE_TARGETS','ALERT_ESCALATION','SUPPORTED_MARKETS') THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'key', p_key,
    'current', admin_private.setting_public_json_v1(admin_private.current_setting_v1(p_key, now())),
    'versions', coalesce((
      SELECT jsonb_agg(admin_private.setting_public_json_v1(v) ORDER BY v.version DESC)
      FROM public.admin_setting_versions v WHERE v.setting_key = p_key
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_retention_list_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'current', jsonb_build_object(
      'UNSUCCESSFUL_ENQUIRIES', admin_private.retention_public_json_v1(admin_private.current_retention_v1('UNSUCCESSFUL_ENQUIRIES', now())),
      'CASE_EVIDENCE', admin_private.retention_public_json_v1(admin_private.current_retention_v1('CASE_EVIDENCE', now())),
      'FINANCIAL_RECORDS', admin_private.retention_public_json_v1(admin_private.current_retention_v1('FINANCIAL_RECORDS', now())),
      'CONSENT_RECORDS', admin_private.retention_public_json_v1(admin_private.current_retention_v1('CONSENT_RECORDS', now())),
      'SECURITY_LOGS', admin_private.retention_public_json_v1(admin_private.current_retention_v1('SECURITY_LOGS', now()))
    ),
    'versions', coalesce((
      SELECT jsonb_agg(admin_private.retention_public_json_v1(v) ORDER BY v.category, v.version DESC)
      FROM public.retention_policy_versions v
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_template_list_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'approved', coalesce((
      SELECT jsonb_agg(admin_private.template_public_json_v1(t) ORDER BY t.template_key, t.version DESC)
      FROM admin_private.communication_templates t WHERE t.status = 'APPROVED'
    ), '[]'),
    'drafts', coalesce((
      SELECT jsonb_agg(admin_private.template_public_json_v1(t) ORDER BY t.created_at DESC, t.id DESC)
      FROM admin_private.communication_templates t WHERE t.status = 'DRAFT'
    ), '[]'),
    'retired', coalesce((
      SELECT jsonb_agg(admin_private.template_public_json_v1(t) ORDER BY t.template_key, t.version DESC)
      FROM admin_private.communication_templates t WHERE t.status = 'RETIRED'
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_complaint_list_v1(p_token text, p_filter text DEFAULT 'open')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_filter IS NULL OR p_filter NOT IN ('open','resolved','all') THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'filter', p_filter,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'customerId', c.customer_id,
        'caseId', c.case_id,
        'enquiryId', c.enquiry_id,
        'reference', cs.public_ref,
        'source', c.source,
        'category', c.category,
        'status', c.status,
        'title', c.summary,
        'summary', c.summary,
        'resolution', c.resolution,
        'receivedAt', c.received_at,
        'dueAt', c.due_at,
        'recordVersion', c.record_version
      ) ORDER BY c.received_at DESC, c.id DESC)
      FROM (
        SELECT * FROM public.complaints x
        WHERE p_filter = 'all'
          OR (p_filter = 'open' AND x.status IN ('OPEN','ACKNOWLEDGED'))
          OR (p_filter = 'resolved' AND x.status = 'RESOLVED')
        ORDER BY x.received_at DESC, x.id DESC
        LIMIT 100
      ) c
      LEFT JOIN public.cases cs ON cs.id = c.case_id
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_privacy_list_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'holds', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id,
        'scopeKind', h.scope_kind,
        'category', h.category,
        'customerId', h.customer_id,
        'businessId', h.business_id,
        'caseId', h.case_id,
        'reason', h.reason,
        'status', h.status,
        'releaseReason', h.release_reason,
        'recordVersion', h.record_version,
        'createdAt', h.created_at,
        'releasedAt', h.released_at
      ) ORDER BY h.created_at DESC, h.id DESC)
      FROM public.legal_holds h
    ), '[]'),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'kind', r.kind,
        'customerId', r.customer_id,
        'status', r.status,
        'identityStatus', r.identity_status,
        'subjectRef', r.subject_ref,
        'notes', r.notes,
        'scopeNote', r.notes,
        'resolution', r.resolution,
        'outcomeNote', r.resolution,
        'preview', r.preview,
        'requestedAt', r.requested_at,
        'dueAt', r.due_at,
        'verifiedAt', r.verified_at,
        'completedAt', r.completed_at,
        'recordVersion', r.record_version,
        'dispositions', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', d.id,
            'category', d.category,
            'proposedAction', d.proposed_action,
            'status', d.status,
            'legalHoldBlocker', d.legal_hold_blocker,
            'eligibleCount', d.eligible_count,
            'retainedCount', d.retained_count,
            'blockedReason', d.blocked_reason,
            'reason', d.reason,
            'recordVersion', d.record_version
          ) ORDER BY d.category)
          FROM public.privacy_request_dispositions d
          WHERE d.privacy_request_id = r.id
        ), '[]')
      ) ORDER BY r.requested_at DESC, r.id DESC)
      FROM public.privacy_requests r
    ), '[]'),
    'retentionPolicies', coalesce((
      SELECT jsonb_agg(admin_private.retention_public_json_v1(v) ORDER BY v.category, v.version DESC)
      FROM public.retention_policy_versions v
    ), '[]')
  );
END; $$;

CREATE FUNCTION public.admin_incident_list_v1(p_token text, p_filter text DEFAULT 'open')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_filter IS NULL OR p_filter NOT IN ('open','resolved','all') THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'filter', p_filter,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'kind', i.kind,
        'severity', i.severity,
        'status', i.status,
        'title', i.title,
        'impactSummary', i.impact_summary,
        'summary', i.impact_summary,
        'openedAt', i.started_at,
        'startedAt', i.started_at,
        'resolvedAt', i.resolved_at,
        'resolution', i.resolution,
        'recordVersion', i.record_version
      ) ORDER BY i.started_at DESC, i.id DESC)
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
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  result jsonb;
  action text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_operation IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  fp := md5(jsonb_build_array(p_operation, p_payload, p_version)::text);
  cached := admin_private.settings_take_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  result := admin_private.settings_command_apply_v1(actor, p_request, p_operation, p_payload, p_version, p_token);
  IF result->>'status' NOT IN ('unauthorized','reauth_required') THEN
    PERFORM admin_private.settings_store_receipt_v1(p_request, actor, fp, result);
  END IF;
  IF result->>'status' IN ('success','denied') THEN
    action := CASE
      WHEN p_operation LIKE '%template%' THEN 'TEMPLATE_CHANGED'
      WHEN p_operation LIKE '%hold%' OR p_operation LIKE '%privacy%' OR p_operation = 'execute_deletion' THEN 'PRIVACY_CHANGED'
      WHEN p_operation LIKE '%complaint%' THEN 'COMPLAINT_CHANGED'
      WHEN p_operation LIKE '%incident%' THEN 'INCIDENT_CHANGED'
      ELSE 'SETTINGS_CHANGED'
    END;
    PERFORM admin_private.write_record_audit_v1(
      actor, action, result->>'status', NULLIF(result->>'id','')::uuid, p_request, 'admin_settings',
      left(p_operation, 80), jsonb_build_object('operation', p_operation)
    );
  END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_privacy_export_v1(
  p_token text, p_request uuid, p_privacy_request uuid, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  result jsonb;
  req public.privacy_requests;
  rows jsonb;
  n integer;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_privacy_request IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF NOT admin_private.settings_reauth_ok_v1(p_token) THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  fp := md5(jsonb_build_array('privacy_export', p_privacy_request, p_version)::text);
  cached := admin_private.privacy_export_take_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN
      SELECT * INTO req FROM public.privacy_requests WHERE id = p_privacy_request;
      rows := admin_private.privacy_export_rows_v1(req.customer_id);
      RETURN cached || jsonb_build_object('rows', rows);
    END IF;
    RETURN cached;
  END IF;
  SELECT * INTO req FROM public.privacy_requests WHERE id = p_privacy_request FOR UPDATE;
  IF req.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS NOT NULL AND req.record_version IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  IF req.kind NOT IN ('ACCESS','EXPORT') THEN RETURN jsonb_build_object('status','denied','reason','not_exportable'); END IF;
  IF req.identity_status NOT IN ('VERIFIED_CONTACT','VERIFIED_MANUAL') THEN
    result := jsonb_build_object('status','denied','reason','identity_unverified');
    PERFORM admin_private.privacy_export_store_receipt_v1(p_request, actor, p_privacy_request, fp, result);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'PRIVACY_CHANGED', 'denied', req.id, p_request, 'privacy_request',
      'privacy_export', jsonb_build_object('operation', 'privacy_export')
    );
    RETURN result;
  END IF;
  rows := admin_private.privacy_export_rows_v1(req.customer_id);
  n := admin_private.privacy_export_row_count_v1(rows);
  result := jsonb_build_object('status','success','id', req.id, 'rowCount', n, 'privacyRequestId', req.id);
  PERFORM admin_private.privacy_export_store_receipt_v1(p_request, actor, p_privacy_request, fp, result);
    PERFORM admin_private.write_record_audit_v1(
    actor, 'PRIVACY_CHANGED', 'success', req.id, p_request, 'privacy_request',
    'privacy_export', jsonb_build_object('rowCount', n)
  );
  RETURN result || jsonb_build_object('rows', rows);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(
  p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN (
      'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
      'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
      'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED',
      'PAYMENT_CHANGED','GUARD_CHANGED','REPORT_CHANGED','SETTINGS_CHANGED','TEMPLATE_CHANGED','PRIVACY_CHANGED',
      'COMPLAINT_CHANGED','INCIDENT_CHANGED'
    ))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome,
    'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details
  ) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (
    SELECT * FROM public.admin_audit_events
    WHERE (p_before IS NULL OR id < p_before)
      AND (p_action IS NULL OR action = p_action)
      AND (p_outcome IS NULL OR outcome = p_outcome)
    ORDER BY id DESC LIMIT 51
  ) e;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_communication_list_v1(p_token text, p_case uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb; templates jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'caseId', c.case_id,
    'caseReference', cs.public_ref,
    'communicationType', c.communication_type,
    'templateKey', c.template_key,
    'templateVersion', c.template_version,
    'lifecycle', c.lifecycle,
    'deliveryStatus', c.delivery_status,
    'legacyStatus', CASE WHEN c.lifecycle IS NULL THEN c.status ELSE NULL END,
    'recipient', c.recipient,
    'subject', c.subject,
    'bodyText', c.body_text,
    'provider', c.provider,
    'providerMessageId', c.provider_message_id,
    'lastError', c.error_message,
    'contentLocked', c.content_locked,
    'contentVersion', c.content_version,
    'version', c.record_version,
    'draftedAt', c.created_at,
    'reviewedAt', c.reviewed_at,
    'queuedAt', c.queued_at,
    'firstProviderAttemptAt', c.first_provider_attempt_at,
    'providerAcceptedAt', c.provider_accepted_at,
    'deliveredAt', c.delivered_at,
    'failedAt', c.failed_at,
    'cancelledAt', c.cancelled_at,
    'supersededBy', c.superseded_by,
    'events', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'eventType', e.event_type,
        'occurredAt', e.occurred_at,
        'summary', e.summary,
        'providerMessageId', e.provider_message_id
      ) ORDER BY e.occurred_at DESC, e.id DESC), '[]')
      FROM (
        SELECT * FROM admin_private.communication_delivery_events de
        WHERE de.communication_id = c.id
        ORDER BY de.occurred_at DESC, de.id DESC
        LIMIT 8
      ) e
    )
  ) ORDER BY c.updated_at DESC, c.id DESC), '[]') INTO items
  FROM (
    SELECT * FROM public.communications
    WHERE (p_case IS NULL OR case_id = p_case)
    ORDER BY updated_at DESC, id DESC
    LIMIT 50
  ) c
  LEFT JOIN public.cases cs ON cs.id = c.case_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'templateKey', t.template_key, 'version', t.version, 'name', t.name
  ) ORDER BY t.template_key, t.version), '[]') INTO templates
  FROM admin_private.communication_templates t WHERE t.status = 'APPROVED';
  RETURN jsonb_build_object('communications', items, 'templates', templates);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_communication_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; op text; fp text; cached jsonb; result jsonb;
  row public.communications; tpl admin_private.communication_templates;
  cs public.cases; req public.evidence_requests; action public.customer_actions;
  verified text; values jsonb; subject text; body text; html text;
  origin text; upload text; target_case uuid; comm uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  op := btrim(coalesce(p_operation, ''));
  IF op NOT IN ('draft', 'review', 'queue', 'cancel', 'resend_draft') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fp := md5(jsonb_build_array(op, p_payload, p_version)::text);
  cached := admin_private.communication_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  IF op = 'draft' OR op = 'resend_draft' THEN
    target_case := NULLIF(p_payload->>'caseId', '')::uuid;
    IF target_case IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = target_case FOR UPDATE;
    IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT verified_value INTO verified
      FROM public.customer_contact_verifications
      WHERE customer_id = cs.customer_id AND channel = 'email';
    IF verified IS NULL OR admin_private.normalize_email_v1(verified) NOT LIKE '%_@_%.%' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF op = 'resend_draft' THEN
      comm := NULLIF(p_payload->>'communicationId', '')::uuid;
      SELECT * INTO row FROM public.communications WHERE id = comm FOR UPDATE;
      IF row.id IS NULL OR row.case_id <> cs.id OR row.lifecycle IS NULL THEN
        RETURN jsonb_build_object('status', 'unavailable');
      END IF;
      IF row.delivery_status NOT IN ('BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED') THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      IF admin_private.normalize_email_v1(verified) = admin_private.normalize_email_v1(row.recipient) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      p_payload := jsonb_build_object(
        'templateKey', row.template_key,
        'caseId', cs.id,
        'evidenceRequestId', row.evidence_request_id,
        'customerOrigin', p_payload->>'customerOrigin',
        'actionId', p_payload->>'actionId',
        'secretHash', p_payload->>'secretHash',
        'linkKeyVersion', coalesce((p_payload->>'linkKeyVersion')::integer, row.link_key_version),
        'fact', p_payload->>'fact',
        'effect', p_payload->>'effect',
        'nextStep', p_payload->>'nextStep'
      );
    END IF;
    SELECT * INTO tpl FROM admin_private.communication_templates
      WHERE template_key = btrim(coalesce(p_payload->>'templateKey', '')) AND status = 'APPROVED'
      ORDER BY version DESC LIMIT 1;
    IF tpl.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(verified)
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    values := jsonb_build_object('case_ref', cs.public_ref);
    IF tpl.template_key = 'EVIDENCE_REQUEST' THEN
      SELECT * INTO req FROM public.evidence_requests
        WHERE id = NULLIF(p_payload->>'evidenceRequestId', '')::uuid AND case_id = cs.id;
      IF req.id IS NULL OR req.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      origin := btrim(coalesce(p_payload->>'customerOrigin', ''));
      IF origin !~ '^https://[A-Za-z0-9.-]+$'
        OR NULLIF(p_payload->>'actionId', '')::uuid IS NULL
        OR coalesce(p_payload->>'secretHash', '') !~ '^[a-f0-9]{64}$'
        OR coalesce((p_payload->>'linkKeyVersion')::integer, 0) < 1
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      IF req.case_id IS DISTINCT FROM cs.id
        OR cs.status IN ('CLOSED', 'CANCELLED')
        OR req.status <> 'OPEN'
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      SELECT * INTO action FROM public.customer_actions
        WHERE kind = 'COMMUNICATION_ACCESS' AND status = 'OPEN' AND evidence_request_id = req.id
        FOR UPDATE;
      IF action.id IS NOT NULL THEN
        IF action.expires_at > now() THEN RETURN jsonb_build_object('status', 'denied'); END IF;
        IF NOT admin_private.revoke_case_access_action_v1(
          action.id,
          'The previous communication-access capability expired.',
          jsonb_build_object('source', 'ACTION_EXPIRED')
        ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      END IF;
      BEGIN
        INSERT INTO public.customer_actions(
          id, customer_id, business_id, location_id, case_id, evidence_request_id, link_key_version,
          kind, secret_hash, expected_email_snapshot, expires_at, created_by
        ) VALUES (
          (p_payload->>'actionId')::uuid, cs.customer_id, cs.business_id, cs.location_id, cs.id, req.id,
          (p_payload->>'linkKeyVersion')::integer,
          'COMMUNICATION_ACCESS', p_payload->>'secretHash', admin_private.normalize_email_v1(verified),
          now() + interval '14 days', actor
        ) RETURNING * INTO action;
      EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'denied');
      END;
      upload := origin || '/action/' || action.id::text;
      IF position('#t=' in upload) > 0 THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      values := values || jsonb_build_object('specific_document', req.title, 'upload_url', upload);
    ELSE
      IF length(btrim(coalesce(p_payload->>'fact', ''))) NOT BETWEEN 10 AND 400
        OR length(btrim(coalesce(p_payload->>'effect', ''))) NOT BETWEEN 10 AND 400
        OR length(btrim(coalesce(p_payload->>'nextStep', ''))) NOT BETWEEN 10 AND 400
        OR coalesce(p_payload->>'fact', '') ~* '<[^>]+>'
        OR coalesce(p_payload->>'effect', '') ~* '<[^>]+>'
        OR coalesce(p_payload->>'nextStep', '') ~* '<[^>]+>'
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      values := values || jsonb_build_object(
        'fact', btrim(p_payload->>'fact'),
        'effect', btrim(p_payload->>'effect'),
        'next_step', btrim(p_payload->>'nextStep')
      );
    END IF;
    subject := admin_private.render_template_v1(tpl.subject_template, values);
    body := admin_private.render_template_v1(tpl.body_text_template, values);
    IF subject IS NULL OR body IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    html := '<p>' || replace(admin_private.escape_html_v1(body), E'\n', '<br />') || '</p>';
    INSERT INTO public.communications(
      case_id, customer_id, business_id, evidence_request_id, customer_action_id,
      communication_type, direction, recipient, subject, body_text, body_html,
      status, lifecycle, delivery_status, template_key, template_version,
      author_id, content_version, record_version, content_locked, link_key_version
    ) VALUES (
      cs.id, cs.customer_id, cs.business_id, req.id, action.id,
      tpl.template_key, 'OUTBOUND', admin_private.normalize_email_v1(verified), subject, body, html,
      'PENDING', 'DRAFT', 'NONE', tpl.template_key, tpl.version,
      actor, 1, 1, false, action.link_key_version
    ) RETURNING * INTO row;
    IF op = 'resend_draft' THEN
      UPDATE public.communications SET superseded_by = row.id, updated_at = now(), record_version = record_version + 1
        WHERE id = comm;
    END IF;
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'DRAFT');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
      CASE WHEN op = 'resend_draft' THEN 'Drafted a replacement communication after delivery failure' ELSE 'Communication drafted' END,
      jsonb_build_object('operation', op, 'templateKey', tpl.template_key, 'caseId', cs.id)
    );
    INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  comm := NULLIF(p_payload->>'communicationId', '')::uuid;
  IF comm IS NULL OR p_version IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO row FROM public.communications WHERE id = comm FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.record_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  IF op = 'review' THEN
    IF row.lifecycle <> 'DRAFT' OR row.content_locked THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF btrim(coalesce(p_payload->>'fromAddress', '')) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
      OR length(btrim(p_payload->>'fromAddress')) > 254
    THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.communications
      SET lifecycle = 'REVIEWED', reviewer_id = actor, reviewed_at = now(), content_locked = true,
          sender_address = lower(btrim(p_payload->>'fromAddress')),
          updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND lifecycle = 'DRAFT' AND record_version = p_version
      RETURNING * INTO row;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'REVIEWED');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
      'Communication reviewed', jsonb_build_object('operation', 'review')
    );
    INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'cancel' THEN
    IF row.lifecycle NOT IN ('DRAFT', 'REVIEWED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.communications
      SET lifecycle = 'CANCELLED', cancelled_at = now(), updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND record_version = p_version RETURNING * INTO row;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'CANCELLED');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
      'Communication cancelled', jsonb_build_object('operation', 'cancel')
    );
    INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'queue' AND coalesce((p_payload->>'sendEnabled')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF row.lifecycle <> 'REVIEWED' OR row.content_locked IS NOT TRUE THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF coalesce(p_payload->>'recipient', row.recipient) IS DISTINCT FROM row.recipient
    OR coalesce(p_payload->>'subject', row.subject) IS DISTINCT FROM row.subject
    OR coalesce(p_payload->>'bodyText', row.body_text) IS DISTINCT FROM row.body_text
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions s
    WHERE s.address_normalized = admin_private.normalize_email_v1(row.recipient)
  ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF btrim(coalesce(row.sender_address, '')) = '' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF row.template_key = 'EVIDENCE_REQUEST' THEN
    SELECT * INTO action FROM public.customer_actions
      WHERE id = row.customer_action_id AND kind = 'COMMUNICATION_ACCESS' AND status = 'OPEN' AND expires_at > now()
        AND evidence_request_id IS NOT DISTINCT FROM row.evidence_request_id;
    SELECT * INTO req FROM public.evidence_requests WHERE id = row.evidence_request_id AND status = 'OPEN' AND case_id = row.case_id;
    IF action.id IS NULL OR req.id IS NULL OR action.evidence_request_id IS DISTINCT FROM req.id THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  END IF;
  UPDATE public.communications
    SET lifecycle = 'QUEUED', queued_at = now(), updated_at = now(), record_version = row.record_version + 1
    WHERE id = row.id AND lifecycle = 'REVIEWED' AND record_version = p_version
    RETURNING * INTO row;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  PERFORM admin_private.enqueue_outbox_v1(
    'send-email:' || row.id::text || ':v' || row.content_version::text,
    'SEND_EMAIL',
    'communication',
    row.id,
    jsonb_build_object('communicationId', row.id, 'contentVersion', row.content_version),
    now()
  );
  PERFORM admin_private.append_delivery_event_v1(row.id, 'QUEUED', 'Queued for the durable email worker');
  result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version, 'lifecycle', 'QUEUED');
  PERFORM admin_private.write_record_audit_v1(
    actor, 'COMMUNICATION_CHANGED', 'success', row.id, p_request, 'communication',
    'Communication queued', jsonb_build_object('operation', 'queue', 'jobType', 'SEND_EMAIL')
  );
  INSERT INTO admin_private.communication_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_conversation_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE
  s jsonb; actor uuid; op text; fp text; cached jsonb; result jsonb;
  conversation public.conversations; cs public.cases; message public.conversation_messages;
  attachment public.conversation_attachments; comm public.communications;
  tpl admin_private.communication_templates; verified text; inbound_domain text;
  reply_to text; in_reply text; refs text; subject text; body text; html text;
  latest public.conversation_messages;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  op := btrim(coalesce(p_operation, ''));
  IF op NOT IN (
    'link_case', 'unlink_case', 'assign', 'unassign', 'close', 'reopen', 'attention',
    'phone_note', 'contact_recovery', 'draft_reply', 'promote_attachment'
  ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(op, p_payload, p_version)::text);
  cached := admin_private.conversation_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF NULLIF(p_payload->>'conversationId', '')::uuid IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO conversation FROM public.conversations WHERE id = (p_payload->>'conversationId')::uuid FOR UPDATE;
  IF conversation.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF op NOT IN ('phone_note') AND (p_version IS NULL OR conversation.record_version <> p_version) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF op = 'phone_note' THEN
    IF length(btrim(coalesce(p_payload->>'note', ''))) NOT BETWEEN 3 AND 4000
      OR coalesce(p_payload->>'note', '') ~* '<[^>]+>'
      OR coalesce(p_payload->>'direction', 'NOTE') NOT IN ('INBOUND', 'OUTBOUND', 'NOTE')
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    INSERT INTO public.conversation_messages(
      conversation_id, kind, import_status, body_text, subject, created_by, received_at
    ) VALUES (
      conversation.id, 'PHONE_NOTE', 'IMPORTED', btrim(p_payload->>'note'),
      left('Phone note (' || coalesce(p_payload->>'direction', 'NOTE') || ')', 80),
      actor, coalesce((p_payload->>'occurredAt')::timestamptz, now())
    ) RETURNING * INTO message;
    UPDATE public.conversations
      SET last_activity_at = now(), updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id RETURNING * INTO conversation;
    result := jsonb_build_object('status', 'success', 'id', message.id, 'conversationId', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Phone note recorded', jsonb_build_object('operation', op, 'messageId', message.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'link_case' THEN
    IF conversation.state <> 'UNMATCHED' OR conversation.case_id IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NULLIF(p_payload->>'caseId', '')::uuid FOR UPDATE;
    IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.conversations
      SET state = 'OPEN', case_id = cs.id, customer_id = cs.customer_id, business_id = cs.business_id,
          location_id = cs.location_id, unmatched_reason = NULL, needs_attention = true,
          updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version
      RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', conversation.state);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation linked to a case', jsonb_build_object('operation', op, 'caseId', cs.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'unlink_case' THEN
    IF conversation.case_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.conversation_id = conversation.id
        AND c.template_key = 'CONVERSATION_REPLY'
        AND c.lifecycle IN ('DRAFT', 'REVIEWED', 'QUEUED')
    ) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    UPDATE public.conversations
      SET state = 'UNMATCHED', case_id = NULL, customer_id = NULL, business_id = NULL, location_id = NULL,
          unmatched_reason = 'Unlinked by Admin', needs_attention = true,
          updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version
      RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', conversation.state);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation unlinked from its case', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'assign' THEN
    UPDATE public.conversations
      SET assigned_admin_id = actor, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation assigned', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'unassign' THEN
    UPDATE public.conversations
      SET assigned_admin_id = NULL, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation unassigned', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'close' THEN
    IF conversation.state NOT IN ('UNMATCHED', 'OPEN') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.conversations
      SET state = 'CLOSED', closed_at = now(), needs_attention = false, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', 'CLOSED');
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation closed', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'reopen' THEN
    IF conversation.state <> 'CLOSED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.conversations
      SET state = CASE WHEN conversation.case_id IS NULL THEN 'UNMATCHED' ELSE 'OPEN' END,
          closed_at = NULL, needs_attention = true, updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'state', conversation.state);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation reopened', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'attention' THEN
    UPDATE public.conversations
      SET needs_attention = coalesce((p_payload->>'needsAttention')::boolean, true),
          updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version, 'needsAttention', conversation.needs_attention);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation attention updated', jsonb_build_object('operation', op)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'contact_recovery' THEN
    IF conversation.case_id IS NULL OR conversation.state = 'UNMATCHED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = conversation.case_id FOR UPDATE;
    IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.case_tasks(case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy)
    VALUES (
      cs.id,
      'Contact recovery for conversation ' || left(conversation.id::text, 8),
      'ADMIN',
      CASE WHEN coalesce(p_payload->>'kind', 'CALL') = 'FOLLOW_UP' THEN 'FOLLOW_UP' ELSE 'CALL' END,
      now() + interval '2 days',
      'Conversation ' || conversation.id::text || ' contact recovery; do not change the customer email automatically.',
      'UTC',
      'MANUAL_QUEUE'
    );
    UPDATE public.conversations
      SET last_activity_at = now(), updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', conversation.id, 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Contact recovery task created', jsonb_build_object('operation', op, 'caseId', cs.id)
    );
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CASE_CHANGED', 'success', cs.id, p_request, 'case',
      'Contact recovery task created from a conversation', jsonb_build_object('conversationId', conversation.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'promote_attachment' THEN
    SELECT * INTO attachment FROM public.conversation_attachments
      WHERE id = NULLIF(p_payload->>'attachmentId', '')::uuid AND conversation_id = conversation.id;
    IF attachment.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF conversation.case_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF attachment.ingestion_status <> 'CLEAN'
      OR attachment.scan_status <> 'NO_THREATS_FOUND'
      OR attachment.validation_status <> 'VALID'
      OR attachment.storage_bucket IS NULL
      OR attachment.storage_key IS NULL
    THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    UPDATE public.conversation_attachments SET promotion_state = 'RECORDED' WHERE id = attachment.id;
    UPDATE public.conversations
      SET updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object('status', 'success', 'id', attachment.id, 'promotionState', 'RECORDED', 'version', conversation.record_version);
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Attachment recorded for evidence follow-up; it is not accepted evidence', jsonb_build_object('operation', op, 'attachmentId', attachment.id, 'caseId', conversation.case_id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF op = 'draft_reply' THEN
    IF conversation.state <> 'OPEN' OR conversation.case_id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = conversation.case_id FOR UPDATE;
    IF cs.id IS NULL OR cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT verified_value INTO verified
      FROM public.customer_contact_verifications
      WHERE customer_id = cs.customer_id AND channel = 'email';
    IF verified IS NULL OR admin_private.normalize_email_v1(verified) NOT LIKE '%_@_%.%' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(verified)
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    inbound_domain := lower(btrim(coalesce(p_payload->>'inboundDomain', '')));
    IF inbound_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' OR inbound_domain = 'profilerelaunch.com' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF length(btrim(coalesce(p_payload->>'bodyText', ''))) NOT BETWEEN 10 AND 4000
      OR coalesce(p_payload->>'bodyText', '') ~* '<[^>]+>'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO tpl FROM admin_private.communication_templates
      WHERE template_key = 'CONVERSATION_REPLY' AND status = 'APPROVED' ORDER BY version DESC LIMIT 1;
    IF tpl.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    SELECT * INTO latest FROM public.conversation_messages
      WHERE conversation_id = conversation.id AND kind = 'INBOUND_EMAIL' AND rfc_message_id IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT 1;
    reply_to := conversation.reply_alias || '@' || inbound_domain;
    in_reply := latest.rfc_message_id;
    refs := nullif(left(btrim(coalesce(latest.references_header || ' ', '') || coalesce(latest.rfc_message_id, '')), 2000), '');
    subject := admin_private.render_template_v1(tpl.subject_template, jsonb_build_object('subject', coalesce(conversation.subject, 'your case')));
    body := admin_private.render_template_v1(tpl.body_text_template, jsonb_build_object('reply_body', btrim(p_payload->>'bodyText')));
    IF subject IS NULL OR body IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    html := '<p>' || replace(admin_private.escape_html_v1(body), E'\n', '<br />') || '</p>';
    INSERT INTO public.communications(
      case_id, customer_id, business_id, conversation_id, communication_type, direction, recipient, subject,
      body_text, body_html, status, lifecycle, delivery_status, template_key, template_version, author_id,
      content_version, record_version, content_locked, reply_to_address, in_reply_to, references_header
    ) VALUES (
      cs.id, cs.customer_id, cs.business_id, conversation.id, 'CONVERSATION_REPLY', 'OUTBOUND',
      admin_private.normalize_email_v1(verified), subject, body, html, 'PENDING', 'DRAFT', 'NONE',
      tpl.template_key, tpl.version, actor, 1, 1, false, reply_to, in_reply, refs
    ) RETURNING * INTO comm;
    UPDATE public.conversations
      SET last_activity_at = now(), updated_at = now(), record_version = record_version + 1
      WHERE id = conversation.id AND record_version = p_version RETURNING * INTO conversation;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    result := jsonb_build_object(
      'status', 'success', 'id', comm.id, 'conversationId', conversation.id,
      'version', conversation.record_version, 'communicationVersion', comm.record_version, 'lifecycle', 'DRAFT'
    );
    PERFORM admin_private.write_record_audit_v1(
      actor, 'CONVERSATION_CHANGED', 'success', conversation.id, p_request, 'conversation',
      'Conversation reply drafted', jsonb_build_object('operation', op, 'communicationId', comm.id)
    );
    PERFORM admin_private.write_record_audit_v1(
      actor, 'COMMUNICATION_CHANGED', 'success', comm.id, p_request, 'communication',
      'Conversation reply drafted', jsonb_build_object('conversationId', conversation.id)
    );
    INSERT INTO admin_private.conversation_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  RETURN jsonb_build_object('status', 'invalid');
END; $$;

CREATE OR REPLACE FUNCTION admin_private.guard_alert_prepare_notification_v1(
  p_actor uuid, p_request uuid, p_payload jsonb, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  alert public.guard_alerts;
  loc public.locations;
  tpl admin_private.communication_templates;
  verified text;
  subject text;
  body text;
  html text;
  comm public.communications;
  kind text := btrim(coalesce(p_payload->>'notificationKind','INITIAL'));
  seq integer;
  values jsonb;
BEGIN
  SELECT * INTO alert FROM public.guard_alerts WHERE id = NULLIF(p_payload->>'alertId','')::uuid FOR UPDATE;
  IF alert.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.record_version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF kind NOT IN ('INITIAL','FOLLOW_UP','RESOLUTION') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF alert.needs_review IS TRUE AND kind IN ('INITIAL','FOLLOW_UP') THEN
    RETURN jsonb_build_object('status','denied','reason','needs_review');
  END IF;
  IF NOT admin_private.guard_alert_notification_allowed_v1(kind, alert.state, alert.review_disposition, alert.needs_review)
    OR alert.severity = 'UNASSESSED'
  THEN RETURN jsonb_build_object('status','denied','reason','not_confirmed_customer_issue'); END IF;
  IF kind = 'INITIAL' AND EXISTS (
    SELECT 1 FROM public.guard_alert_notifications n WHERE n.alert_id = alert.id AND n.notification_kind = 'INITIAL'
  ) THEN RETURN jsonb_build_object('status','denied','reason','initial_already_exists'); END IF;
  IF kind = 'FOLLOW_UP' AND (
    length(btrim(coalesce(p_payload->>'reason',''))) < 10
    OR NOT EXISTS (SELECT 1 FROM public.guard_alert_notifications n WHERE n.alert_id = alert.id AND n.notification_kind = 'INITIAL')
  ) THEN RETURN jsonb_build_object('status','denied','reason','follow_up_requires_approval'); END IF;
  IF kind = 'RESOLUTION' AND length(btrim(coalesce(p_payload->>'reason',''))) < 10 THEN
    RETURN jsonb_build_object('status','denied','reason','resolution_requires_approval');
  END IF;
  verified := admin_private.guard_alert_current_email_v1(alert.customer_id);
  IF verified IS NULL THEN RETURN jsonb_build_object('status','denied','reason','email_not_verified'); END IF;
  IF EXISTS (SELECT 1 FROM admin_private.email_suppressions s WHERE s.address_normalized = verified) THEN
    RETURN jsonb_build_object('status','denied','reason','recipient_suppressed');
  END IF;
  IF length(btrim(coalesce(p_payload->>'fact',''))) NOT BETWEEN 10 AND 400
    OR length(btrim(coalesce(p_payload->>'effect',''))) NOT BETWEEN 10 AND 400
    OR length(btrim(coalesce(p_payload->>'nextStep',''))) NOT BETWEEN 10 AND 400
    OR coalesce(p_payload->>'fact','') ~* '<[^>]+>'
    OR coalesce(p_payload->>'effect','') ~* '<[^>]+>'
    OR coalesce(p_payload->>'nextStep','') ~* '<[^>]+>'
  THEN RETURN jsonb_build_object('status','invalid','reason','unresolved_or_invalid_copy'); END IF;
  SELECT * INTO loc FROM public.locations WHERE id = alert.location_id;
  SELECT * INTO tpl FROM admin_private.communication_templates WHERE template_key = 'GUARD_ALERT' AND status = 'APPROVED' ORDER BY version DESC LIMIT 1;
  values := jsonb_build_object(
    'location_name', loc.location_name,
    'fact', btrim(p_payload->>'fact'),
    'effect', btrim(p_payload->>'effect'),
    'next_step', btrim(p_payload->>'nextStep')
  );
  subject := admin_private.render_template_v1(tpl.subject_template, values);
  body := admin_private.render_template_v1(tpl.body_text_template, values);
  IF subject IS NULL OR body IS NULL OR subject ~ '\{[a-z_]+\}' OR body ~ '\{[a-z_]+\}' THEN
    RETURN jsonb_build_object('status','invalid','reason','unresolved_placeholders');
  END IF;
  html := '<p>' || replace(admin_private.escape_html_v1(body), E'\n', '<br />') || '</p>';
  INSERT INTO public.communications(
    guard_alert_id, customer_id, business_id, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version, author_id, content_version, record_version, content_locked
  ) VALUES (
    alert.id, alert.customer_id, alert.business_id, 'GUARD_ALERT', 'OUTBOUND', verified, subject, body, html,
    'PENDING', 'DRAFT', 'NONE', 'GUARD_ALERT', tpl.version, p_actor, 1, 1, false
  ) RETURNING * INTO comm;
  SELECT coalesce(max(sequence_number), 0) + 1 INTO seq FROM public.guard_alert_notifications WHERE alert_id = alert.id;
  INSERT INTO public.guard_alert_notifications(alert_id, communication_id, notification_kind, sequence_number)
  VALUES (alert.id, comm.id, kind, seq);
  UPDATE public.guard_alerts SET updated_at = now(), record_version = record_version + 1 WHERE id = alert.id RETURNING * INTO alert;
  PERFORM admin_private.guard_alert_append_event_v1(
    alert.id, 'ADMIN', p_actor, 'NOTIFICATION_PREPARED', alert.state, alert.state, alert.severity, alert.severity,
    coalesce(btrim(p_payload->>'reason'), kind),
    jsonb_build_object('communicationId', comm.id, 'kind', kind)
  );
  PERFORM admin_private.write_record_audit_v1(
    p_actor, 'GUARD_CHANGED', 'success', alert.id, p_request, 'guard_alert',
    'Prepared Guard alert notification', jsonb_build_object('communicationId', comm.id, 'kind', kind)
  );
  RETURN jsonb_build_object('status','success','id', alert.id, 'version', alert.record_version, 'communicationId', comm.id, 'communicationVersion', comm.record_version);
END; $$;

REVOKE ALL ON FUNCTION
  admin_private.protect_admin_identity_v1(),
  admin_private.saved_filter_actor_is_staff_v1(uuid),
  admin_private.settings_secret_payload_v1(jsonb),
  admin_private.hhmm_ok_v1(text),
  admin_private.settings_payload_valid_v1(text, jsonb),
  admin_private.protect_settings_version_v1(),
  admin_private.protect_retention_version_v1(),
  admin_private.protect_legal_hold_v1(),
  admin_private.privacy_transition_ok_v1(text, text),
  admin_private.protect_privacy_request_v1(),
  admin_private.complaint_transition_ok_v1(text, text),
  admin_private.protect_complaint_v1(),
  admin_private.incident_transition_ok_v1(text, text),
  admin_private.protect_incident_v1(),
  admin_private.protect_response_obligation_v1(),
  admin_private.current_setting_v1(text, timestamptz),
  admin_private.current_retention_v1(text, timestamptz),
  admin_private.staffed_due_at_v1(timestamptz, integer, jsonb),
  admin_private.maybe_snapshot_response_obligation_v1(),
  admin_private.hold_blocks_v1(uuid, uuid, uuid, text),
  admin_private.protect_communication_template_v1(),
  admin_private.template_placeholders_v1(text),
  admin_private.template_text_valid_v1(text, text, text),
  admin_private.settings_reauth_ok_v1(text),
  admin_private.settings_receipt_v1(uuid, uuid, text),
  admin_private.settings_store_receipt_v1(uuid, uuid, text, jsonb),
  admin_private.privacy_preview_v1(uuid),
  admin_private.settings_uuid_v1(text),
  admin_private.settings_time_v1(text),
  admin_private.hold_category_v1(text),
  admin_private.setting_public_json_v1(public.admin_setting_versions),
  admin_private.retention_public_json_v1(public.retention_policy_versions),
  admin_private.template_public_json_v1(admin_private.communication_templates),
  admin_private.schedule_public_json_v1(public.guard_check_schedule_versions),
  admin_private.settings_take_receipt_v1(uuid, uuid, text),
  admin_private.privacy_export_take_receipt_v1(uuid, uuid, text),
  admin_private.privacy_export_store_receipt_v1(uuid, uuid, uuid, text, jsonb),
  admin_private.privacy_export_rows_v1(uuid),
  admin_private.privacy_export_row_count_v1(jsonb),
  admin_private.privacy_upsert_dispositions_v1(uuid, jsonb, text),
  admin_private.deletion_blocked_v1(public.privacy_requests),
  admin_private.settings_command_apply_v1(uuid, uuid, text, jsonb, integer, text),
  admin_private.guard_alert_prepare_notification_v1(uuid, uuid, jsonb, integer)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.admin_settings_overview_v1(text),
  public.admin_settings_list_v1(text, text),
  public.admin_retention_list_v1(text),
  public.admin_template_list_v1(text),
  public.admin_complaint_list_v1(text, text),
  public.admin_privacy_list_v1(text),
  public.admin_incident_list_v1(text, text),
  public.admin_settings_command_v1(text, uuid, text, jsonb, integer),
  public.admin_privacy_export_v1(text, uuid, uuid, integer),
  public.admin_audit_list_v1(text, bigint, text, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.admin_settings_overview_v1(text),
  public.admin_settings_list_v1(text, text),
  public.admin_retention_list_v1(text),
  public.admin_template_list_v1(text),
  public.admin_complaint_list_v1(text, text),
  public.admin_privacy_list_v1(text),
  public.admin_incident_list_v1(text, text),
  public.admin_settings_command_v1(text, uuid, text, jsonb, integer),
  public.admin_privacy_export_v1(text, uuid, uuid, integer),
  public.admin_audit_list_v1(text, bigint, text, text)
TO service_role;

COMMIT;
