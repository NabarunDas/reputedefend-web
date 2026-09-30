-- Guard onboarding and activation v1 (Step 15). Additive only.
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / LIVE GUARD DISABLED.
-- Do not apply from this PR. Do not create Stripe subscriptions. Do not enable live monitoring.
-- Do not change Cron. Do not modify already-applied migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.guard_onboarding_locations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  monitoring_request_id uuid NOT NULL REFERENCES public.monitoring_requests(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('INTAKE_PRIMARY','ADMIN_ADDED')),
  ordinal integer NOT NULL CHECK (ordinal >= 1),
  status text NOT NULL CHECK (status IN ('IDENTIFIED','READY_FOR_ONBOARDING','REMOVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE UNIQUE INDEX guard_onboarding_locations_request_location_idx
  ON public.guard_onboarding_locations (monitoring_request_id, location_id)
  WHERE status <> 'REMOVED';
CREATE INDEX guard_onboarding_locations_request_idx
  ON public.guard_onboarding_locations (monitoring_request_id, ordinal);

CREATE TABLE public.guard_coverages (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  monitoring_request_id uuid REFERENCES public.monitoring_requests(id) ON DELETE RESTRICT,
  onboarding_location_id uuid REFERENCES public.guard_onboarding_locations(id) ON DELETE RESTRICT,
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  source_recovery_case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  source_managed_order_id uuid REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  coverage_basis text NOT NULL CHECK (coverage_basis IN ('DIRECT_GUARD','INCLUDED')),
  coverage_origin text NOT NULL CHECK (coverage_origin IN ('DIRECT_GUARD','INCLUDED_RECOVERY')),
  state text NOT NULL CHECK (state IN (
    'REQUESTED','AWAITING_AUTHORIZATION','VERIFYING_ACCESS','BASELINE_REQUIRED',
    'AWAITING_PAYMENT','READY_TO_ACTIVATE','ACTIVE','PAUSED','ENDING','ENDED'
  )),
  activated_at timestamptz,
  paused_at timestamptz,
  ending_at timestamptz,
  ended_at timestamptz,
  included_start_at timestamptz,
  included_end_at timestamptz,
  permission_id uuid,
  baseline_id uuid,
  rota_id uuid,
  access_id uuid,
  first_planned_window_code text CHECK (first_planned_window_code IS NULL OR first_planned_window_code IN ('MORNING','EVENING')),
  first_planned_on date,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guard_coverages_basis_origin CHECK (
    (coverage_basis = 'DIRECT_GUARD' AND coverage_origin = 'DIRECT_GUARD' AND service_order_id IS NOT NULL
      AND source_recovery_case_id IS NULL AND source_managed_order_id IS NULL)
    OR (coverage_basis = 'INCLUDED' AND coverage_origin = 'INCLUDED_RECOVERY' AND service_order_id IS NULL
      AND source_recovery_case_id IS NOT NULL AND source_managed_order_id IS NOT NULL)
  ),
  CONSTRAINT guard_coverages_activation_facts CHECK (
    (state <> 'ACTIVE' AND activated_at IS NULL)
    OR (state = 'ACTIVE' AND activated_at IS NOT NULL)
  ),
  CONSTRAINT guard_coverages_included_period CHECK (
    (coverage_basis <> 'INCLUDED')
    OR (
      (included_start_at IS NULL AND included_end_at IS NULL AND activated_at IS NULL)
      OR (included_start_at IS NOT NULL AND included_end_at IS NOT NULL AND included_start_at = activated_at
        AND included_end_at = activated_at + interval '30 days')
    )
  )
);
CREATE UNIQUE INDEX guard_coverages_one_open_location_idx
  ON public.guard_coverages (location_id) WHERE state <> 'ENDED';
CREATE UNIQUE INDEX guard_coverages_one_direct_order_idx
  ON public.guard_coverages (service_order_id) WHERE service_order_id IS NOT NULL AND state <> 'ENDED';
CREATE UNIQUE INDEX guard_coverages_one_included_order_idx
  ON public.guard_coverages (source_managed_order_id) WHERE source_managed_order_id IS NOT NULL AND state <> 'ENDED';
CREATE INDEX guard_coverages_customer_idx ON public.guard_coverages (customer_id, state);
CREATE INDEX guard_coverages_request_idx ON public.guard_coverages (monitoring_request_id);

CREATE TABLE public.guard_coverage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('ADMIN','CUSTOMER','SYSTEM')),
  actor_id uuid,
  event text NOT NULL CHECK (event IN (
    'COVERAGE_CREATED','STATE_CHANGED','PERMISSION_RECORDED','PERMISSION_REVOKED',
    'BASELINE_RECORDED','ROTA_ASSIGNED','ACTIVATED','EXCEPTION_OPENED','EXCEPTION_ACKNOWLEDGED'
  )),
  previous_state text,
  new_state text,
  reason text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guard_coverage_events_coverage_idx ON public.guard_coverage_events (coverage_id, id DESC);

CREATE TABLE public.guard_billing (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL UNIQUE REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  billing_state text NOT NULL CHECK (billing_state IN ('NOT_REQUIRED','PENDING','CURRENT','PAST_DUE','PAUSED','ENDED')),
  entitlement_source text NOT NULL CHECK (entitlement_source IN ('NONE','INCLUDED','PROVIDER')),
  paid_through_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guard_billing_basis_state CHECK (
    (entitlement_source = 'INCLUDED' AND billing_state = 'NOT_REQUIRED')
    OR (entitlement_source = 'NONE' AND billing_state IN ('PENDING','PAST_DUE','PAUSED','ENDED'))
    OR (entitlement_source = 'PROVIDER' AND billing_state IN ('CURRENT','PAST_DUE','PAUSED','ENDED'))
  )
);

CREATE TABLE public.guard_included_offers (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  source_recovery_case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  source_managed_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('ELIGIBLE','OFFERED','ACCEPTED','DECLINED','EXPIRED')),
  included_days integer NOT NULL DEFAULT 30 CHECK (included_days = 30),
  eligibility_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  offered_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);

CREATE TABLE public.guard_permissions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  included_offer_id uuid REFERENCES public.guard_included_offers(id) ON DELETE RESTRICT,
  permission_version text NOT NULL CHECK (permission_version = 'GUARD_PERMISSION_V1'),
  accepted_text text NOT NULL CHECK (char_length(accepted_text) BETWEEN 40 AND 5000),
  status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED','REVIEW_REQUIRED')),
  accepted_by_auth_user_id uuid NOT NULL,
  accepted_email_snapshot text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  customer_action_id uuid NOT NULL REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text NOT NULL DEFAULT '',
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  CHECK (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND length(btrim(revocation_reason)) BETWEEN 10 AND 2000))
);
CREATE UNIQUE INDEX guard_permissions_one_active_coverage_idx
  ON public.guard_permissions (coverage_id) WHERE status = 'ACTIVE';

CREATE TABLE public.guard_baselines (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL CHECK (status IN ('VERIFIED','SUPERSEDED','REJECTED','INCOMPLETE')),
  profile_url text NOT NULL CHECK (char_length(btrim(profile_url)) BETWEEN 8 AND 500),
  profile_availability text NOT NULL CHECK (profile_availability IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')),
  displayed_business_name text NOT NULL CHECK (char_length(btrim(displayed_business_name)) BETWEEN 1 AND 200),
  profile_details_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_count integer CHECK (review_count IS NULL OR review_count >= 0),
  rating numeric CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  latest_review_reference text NOT NULL DEFAULT '',
  latest_review_at timestamptz,
  capture_method text NOT NULL CHECK (capture_method = 'MANUAL_ADMIN'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid NOT NULL,
  notes text NOT NULL DEFAULT '',
  UNIQUE (coverage_id, version_number)
);
CREATE UNIQUE INDEX guard_baselines_one_verified_coverage_idx
  ON public.guard_baselines (coverage_id) WHERE status = 'VERIFIED';

CREATE TABLE public.guard_rota_assignments (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  assignee_auth_user_id uuid NOT NULL,
  checks_per_day integer NOT NULL DEFAULT 2 CHECK (checks_per_day = 2),
  timezone text NOT NULL DEFAULT 'Europe/London' CHECK (timezone = 'Europe/London'),
  includes_weekends boolean NOT NULL DEFAULT true CHECK (includes_weekends = true),
  includes_bank_holidays boolean NOT NULL DEFAULT true CHECK (includes_bank_holidays = true),
  delivery_method text NOT NULL DEFAULT 'manual' CHECK (delivery_method = 'manual'),
  alert_channel text NOT NULL DEFAULT 'email' CHECK (alert_channel = 'email'),
  morning_window_code text NOT NULL DEFAULT 'MORNING' CHECK (morning_window_code = 'MORNING'),
  evening_window_code text NOT NULL DEFAULT 'EVENING' CHECK (evening_window_code = 'EVENING'),
  first_planned_window_code text CHECK (first_planned_window_code IS NULL OR first_planned_window_code IN ('MORNING','EVENING')),
  first_planned_on date,
  status text NOT NULL CHECK (status IN ('ACTIVE','SUPERSEDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE UNIQUE INDEX guard_rota_one_active_coverage_idx
  ON public.guard_rota_assignments (coverage_id) WHERE status = 'ACTIVE';

CREATE TABLE public.guard_activation_exceptions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  severity text NOT NULL DEFAULT 'URGENT' CHECK (severity = 'URGENT'),
  reason_code text NOT NULL CHECK (reason_code IN ('PAID_NOT_READY','ACTIVATION_BLOCKED')),
  blocker_codes text[] NOT NULL,
  billing_state_snapshot text NOT NULL,
  coverage_state_snapshot text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE UNIQUE INDEX guard_activation_exceptions_one_open_idx
  ON public.guard_activation_exceptions (coverage_id) WHERE status = 'OPEN';

CREATE TABLE admin_private.guard_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guard_coverages
  ADD CONSTRAINT guard_coverages_permission_fk FOREIGN KEY (permission_id) REFERENCES public.guard_permissions(id) ON DELETE RESTRICT;
ALTER TABLE public.guard_coverages
  ADD CONSTRAINT guard_coverages_baseline_fk FOREIGN KEY (baseline_id) REFERENCES public.guard_baselines(id) ON DELETE RESTRICT;
ALTER TABLE public.guard_coverages
  ADD CONSTRAINT guard_coverages_rota_fk FOREIGN KEY (rota_id) REFERENCES public.guard_rota_assignments(id) ON DELETE RESTRICT;
ALTER TABLE public.guard_coverages
  ADD CONSTRAINT guard_coverages_access_fk FOREIGN KEY (access_id) REFERENCES public.location_manager_access(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_actions
  ADD COLUMN guard_coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  ADD COLUMN guard_included_offer_id uuid REFERENCES public.guard_included_offers(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_actions DROP CONSTRAINT customer_actions_kind_check;
ALTER TABLE public.customer_actions ADD CONSTRAINT customer_actions_kind_check CHECK (kind IN (
  'AGREEMENT_ACCEPTANCE','AUTHORIZATION_REVOCATION','CASE_ACCESS','COMMUNICATION_ACCESS','QUOTE_ACCEPTANCE',
  'GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT','GUARD_PERMISSION'
));

ALTER TABLE public.customer_actions ADD CONSTRAINT customer_actions_guard_scope_check CHECK (
  (kind = 'GUARD_PERMISSION' AND guard_coverage_id IS NOT NULL AND location_id IS NOT NULL AND case_id IS NULL
    AND service_order_id IS NULL AND payment_obligation_id IS NULL AND payment_invoice_id IS NULL
    AND quote_version_id IS NULL AND agreement_version_id IS NULL AND authorization_id IS NULL
    AND evidence_request_id IS NULL AND link_key_version IS NULL)
  OR (kind <> 'GUARD_PERMISSION' AND guard_coverage_id IS NULL AND guard_included_offer_id IS NULL)
);

CREATE UNIQUE INDEX customer_actions_one_open_guard_idx
  ON public.customer_actions (guard_coverage_id)
  WHERE status = 'OPEN' AND kind = 'GUARD_PERMISSION';

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED',
  'PAYMENT_CHANGED','GUARD_CHANGED'
));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.guard_onboarding_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_coverage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_included_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_rota_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_activation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guard_command_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guard_onboarding_locations, public.guard_coverages, public.guard_coverage_events,
  public.guard_billing, public.guard_included_offers, public.guard_permissions, public.guard_baselines,
  public.guard_rota_assignments, public.guard_activation_exceptions, admin_private.guard_command_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.guard_coverage_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.guard_onboarding_locations, public.guard_coverages, public.guard_coverage_events,
  public.guard_billing, public.guard_included_offers, public.guard_permissions, public.guard_baselines,
  public.guard_rota_assignments, public.guard_activation_exceptions, admin_private.guard_command_receipts
  TO service_role;
GRANT ALL ON SEQUENCE public.guard_coverage_events_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Protect / validate
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin_private.reject_guard_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Guard coverage events are append-only'; END; $$;
CREATE TRIGGER guard_coverage_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.guard_coverage_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_guard_event_change_v1();

CREATE FUNCTION admin_private.reject_guard_baseline_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Guard baselines are immutable'; END IF;
  IF NEW.coverage_id IS DISTINCT FROM OLD.coverage_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.profile_url IS DISTINCT FROM OLD.profile_url
    OR NEW.profile_availability IS DISTINCT FROM OLD.profile_availability
    OR NEW.displayed_business_name IS DISTINCT FROM OLD.displayed_business_name
    OR NEW.profile_details_snapshot IS DISTINCT FROM OLD.profile_details_snapshot
    OR NEW.review_count IS DISTINCT FROM OLD.review_count
    OR NEW.rating IS DISTINCT FROM OLD.rating
    OR NEW.latest_review_reference IS DISTINCT FROM OLD.latest_review_reference
    OR NEW.latest_review_at IS DISTINCT FROM OLD.latest_review_at
    OR NEW.capture_method IS DISTINCT FROM OLD.capture_method
    OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
    OR NEW.captured_by IS DISTINCT FROM OLD.captured_by
    OR NEW.notes IS DISTINCT FROM OLD.notes
  THEN RAISE EXCEPTION 'Guard baseline facts are immutable'; END IF;
  IF OLD.status = 'VERIFIED' AND NEW.status NOT IN ('VERIFIED','SUPERSEDED') THEN
    RAISE EXCEPTION 'Verified baselines can only be superseded';
  END IF;
  IF octet_length(NEW.profile_details_snapshot::text) > 4000 THEN
    RAISE EXCEPTION 'Guard baseline snapshot is too large';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_baselines_protect BEFORE UPDATE OR DELETE ON public.guard_baselines
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_guard_baseline_mutation_v1();

CREATE FUNCTION admin_private.protect_guard_mapping_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.monitoring_request_id IS DISTINCT FROM OLD.monitoring_request_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN RAISE EXCEPTION 'Onboarding mapping identity is immutable'; END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_onboarding_locations_protect BEFORE UPDATE ON public.guard_onboarding_locations
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_guard_mapping_v1();

CREATE FUNCTION admin_private.protect_guard_coverage_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.coverage_basis IS DISTINCT FROM OLD.coverage_basis
    OR NEW.coverage_origin IS DISTINCT FROM OLD.coverage_origin
    OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
    OR NEW.source_recovery_case_id IS DISTINCT FROM OLD.source_recovery_case_id
    OR NEW.source_managed_order_id IS DISTINCT FROM OLD.source_managed_order_id
  THEN RAISE EXCEPTION 'Guard coverage identity is immutable'; END IF;
  IF OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'Activation timestamp is immutable';
  END IF;
  IF OLD.included_start_at IS NOT NULL AND (
    NEW.included_start_at IS DISTINCT FROM OLD.included_start_at
    OR NEW.included_end_at IS DISTINCT FROM OLD.included_end_at
  ) THEN RAISE EXCEPTION 'Included Guard period is immutable'; END IF;
  IF OLD.state IN ('ENDED') AND NEW.state IS DISTINCT FROM 'ENDED' THEN
    RAISE EXCEPTION 'Ended coverage cannot change state';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_coverages_protect BEFORE UPDATE ON public.guard_coverages
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_guard_coverage_v1();

CREATE FUNCTION admin_private.protect_guard_billing_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.coverage_id IS DISTINCT FROM OLD.coverage_id THEN
    RAISE EXCEPTION 'Guard billing coverage is immutable';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_billing_protect BEFORE UPDATE ON public.guard_billing
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_guard_billing_v1();

CREATE FUNCTION admin_private.protect_guard_offer_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.source_recovery_case_id IS DISTINCT FROM OLD.source_recovery_case_id
    OR NEW.source_managed_order_id IS DISTINCT FROM OLD.source_managed_order_id
    OR NEW.included_days IS DISTINCT FROM OLD.included_days
    OR NEW.eligibility_snapshot IS DISTINCT FROM OLD.eligibility_snapshot
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Included Guard offer identity is immutable'; END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_included_offers_protect BEFORE UPDATE ON public.guard_included_offers
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_guard_offer_v1();

CREATE FUNCTION admin_private.protect_guard_permission_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.coverage_id IS DISTINCT FROM OLD.coverage_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.included_offer_id IS DISTINCT FROM OLD.included_offer_id
    OR NEW.permission_version IS DISTINCT FROM OLD.permission_version
    OR NEW.accepted_text IS DISTINCT FROM OLD.accepted_text
    OR NEW.accepted_by_auth_user_id IS DISTINCT FROM OLD.accepted_by_auth_user_id
    OR NEW.accepted_email_snapshot IS DISTINCT FROM OLD.accepted_email_snapshot
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.customer_action_id IS DISTINCT FROM OLD.customer_action_id
  THEN RAISE EXCEPTION 'Guard permission acceptance is immutable'; END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_permissions_protect BEFORE UPDATE ON public.guard_permissions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_guard_permission_v1();

CREATE FUNCTION admin_private.validate_guard_mapping_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE req public.monitoring_requests; loc public.locations;
BEGIN
  SELECT * INTO req FROM public.monitoring_requests WHERE id = NEW.monitoring_request_id;
  SELECT * INTO loc FROM public.locations WHERE id = NEW.location_id;
  IF req.id IS NULL OR loc.id IS NULL THEN RAISE EXCEPTION 'Onboarding mapping references are missing'; END IF;
  IF NEW.customer_id IS DISTINCT FROM req.customer_id OR NEW.business_id IS DISTINCT FROM req.business_id THEN
    RAISE EXCEPTION 'Onboarding mapping must use the request customer and business';
  END IF;
  IF loc.business_id IS DISTINCT FROM NEW.business_id THEN
    RAISE EXCEPTION 'Mapped location must belong to the same business';
  END IF;
  IF NEW.source = 'INTAKE_PRIMARY' AND NEW.location_id IS DISTINCT FROM req.location_id THEN
    RAISE EXCEPTION 'Intake primary mapping must use the request primary location';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_onboarding_locations_validate BEFORE INSERT OR UPDATE ON public.guard_onboarding_locations
FOR EACH ROW EXECUTE FUNCTION admin_private.validate_guard_mapping_v1();

CREATE FUNCTION admin_private.validate_guard_baseline_size_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF octet_length(NEW.profile_details_snapshot::text) > 4000
    OR jsonb_typeof(NEW.profile_details_snapshot) <> 'object'
    OR NEW.profile_details_snapshot ? 'html'
    OR NEW.profile_details_snapshot ? 'cookies'
    OR NEW.profile_details_snapshot ? 'credentials'
  THEN RAISE EXCEPTION 'Guard baseline snapshot is invalid'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_baselines_validate BEFORE INSERT ON public.guard_baselines
FOR EACH ROW EXECUTE FUNCTION admin_private.validate_guard_baseline_size_v1();

-- ---------------------------------------------------------------------------
-- Intake mapping: backfill one primary row; keep future intake in sync
-- ---------------------------------------------------------------------------

INSERT INTO public.guard_onboarding_locations (
  monitoring_request_id, customer_id, business_id, location_id, source, ordinal, status, created_by
)
SELECT r.id, r.customer_id, r.business_id, r.location_id, 'INTAKE_PRIMARY', 1, 'IDENTIFIED', NULL
FROM public.monitoring_requests r
WHERE NOT EXISTS (
  SELECT 1 FROM public.guard_onboarding_locations m
  WHERE m.monitoring_request_id = r.id AND m.location_id = r.location_id AND m.status <> 'REMOVED'
);

CREATE FUNCTION admin_private.ensure_intake_primary_mapping_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.guard_onboarding_locations m
    WHERE m.monitoring_request_id = NEW.id AND m.location_id = NEW.location_id AND m.status <> 'REMOVED'
  ) THEN
    INSERT INTO public.guard_onboarding_locations (
      monitoring_request_id, customer_id, business_id, location_id, source, ordinal, status, created_by
    ) VALUES (NEW.id, NEW.customer_id, NEW.business_id, NEW.location_id, 'INTAKE_PRIMARY', 1, 'IDENTIFIED', NULL);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER monitoring_requests_intake_mapping AFTER INSERT ON public.monitoring_requests
FOR EACH ROW EXECUTE FUNCTION admin_private.ensure_intake_primary_mapping_v1();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin_private.guard_permission_text_v1(p_basis text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_basis
    WHEN 'INCLUDED' THEN
      'I choose the included 30-day Relaunch Guard offer for this restored location and authorise ProfileRelaunch to monitor the Google Business Profile for this exact location. The 30 days start only when Guard is activated. This is not a paid subscription and does not authorise a future charge.'
    ELSE
      'I authorise ProfileRelaunch to monitor the Google Business Profile for this exact location. This is operational monitoring permission. It is not payment, not a subscription, and does not start monitoring by itself.'
  END;
$$;

CREATE FUNCTION admin_private.guard_location_authorized_v1(p_customer uuid, p_business uuid, p_location uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.locations loc
    JOIN public.business_memberships m
      ON m.customer_id = p_customer AND m.business_id = loc.business_id AND m.status = 'verified'
    WHERE loc.id = p_location AND loc.business_id = p_business
  );
$$;

CREATE FUNCTION admin_private.guard_contact_ready_v1(p_customer uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT admin_private.contact_verified_v1(p_customer, 'email')
      OR admin_private.contact_verified_v1(p_customer, 'phone');
$$;

CREATE FUNCTION admin_private.guard_access_record_v1(p_business uuid, p_location uuid)
RETURNS public.location_manager_access LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT a FROM public.location_manager_access a
  WHERE a.location_id = p_location AND a.business_id = p_business
    AND a.status = 'VERIFIED' AND a.access_level IN ('MANAGER','OWNER');
$$;

CREATE FUNCTION admin_private.included_guard_eligible_v1(
  p_customer uuid, p_business uuid, p_location uuid, p_case uuid, p_order uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE cs public.cases; ord public.service_orders;
BEGIN
  SELECT * INTO cs FROM public.cases WHERE id = p_case;
  SELECT * INTO ord FROM public.service_orders WHERE id = p_order;
  IF cs.id IS NULL OR ord.id IS NULL THEN RETURN false; END IF;
  IF cs.case_type IS DISTINCT FROM 'PROFILE_RECOVERY' OR cs.service_track IS DISTINCT FROM 'MANAGED'
    OR cs.outcome IS DISTINCT FROM 'RESTORED' THEN RETURN false; END IF;
  IF cs.customer_id IS DISTINCT FROM p_customer OR cs.business_id IS DISTINCT FROM p_business
    OR cs.location_id IS DISTINCT FROM p_location THEN RETURN false; END IF;
  IF NOT admin_private.qualifying_success_outcome_v1(cs) THEN RETURN false; END IF;
  IF ord.service_code IS DISTINCT FROM 'MANAGED_RELAUNCH' OR ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE'
    OR ord.state IS DISTINCT FROM 'ACCEPTED_SUCCESS_FEE' THEN RETURN false; END IF;
  IF ord.customer_id IS DISTINCT FROM p_customer OR ord.business_id IS DISTINCT FROM p_business
    OR ord.location_id IS DISTINCT FROM p_location OR ord.case_id IS DISTINCT FROM p_case THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.success_fee_approvals a WHERE a.service_order_id = ord.id AND a.case_id = cs.id) THEN
    RETURN false;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.guard_append_event_v1(
  p_coverage uuid, p_actor_type text, p_actor uuid, p_event text,
  p_previous text, p_new text, p_reason text, p_details jsonb
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO public.guard_coverage_events(coverage_id, actor_type, actor_id, event, previous_state, new_state, reason, details)
  VALUES (p_coverage, p_actor_type, p_actor, p_event, p_previous, p_new, coalesce(p_reason, ''), coalesce(p_details, '{}'::jsonb));
END; $$;

CREATE FUNCTION admin_private.guard_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row admin_private.guard_command_receipts;
BEGIN
  SELECT * INTO row FROM admin_private.guard_command_receipts WHERE request_id = p_request;
  IF row.request_id IS NULL THEN RETURN NULL; END IF;
  IF row.actor_id IS DISTINCT FROM p_actor OR row.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'Guard command receipt conflict';
  END IF;
  RETURN row.response;
END; $$;

-- Step 16 data contract. Not granted to service_role. Tests may call it as the migration owner.
CREATE FUNCTION admin_private.guard_set_billing_entitlement_v1(
  p_coverage uuid, p_state text, p_paid_through timestamptz, p_source text
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('NOT_REQUIRED','PENDING','CURRENT','PAST_DUE','PAUSED','ENDED') THEN
    RAISE EXCEPTION 'Invalid Guard billing state';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('NONE','INCLUDED','PROVIDER') THEN
    RAISE EXCEPTION 'Invalid Guard billing source';
  END IF;
  IF p_state = 'CURRENT' AND (p_source IS DISTINCT FROM 'PROVIDER' OR p_paid_through IS NULL OR p_paid_through <= now()) THEN
    RAISE EXCEPTION 'CURRENT Guard billing requires a still-valid provider entitlement';
  END IF;
  UPDATE public.guard_billing
    SET billing_state = p_state, entitlement_source = p_source, paid_through_at = p_paid_through
    WHERE coverage_id = p_coverage;
END; $$;

CREATE FUNCTION admin_private.guard_coverage_readiness_v1(p_coverage uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; map public.guard_onboarding_locations; bill public.guard_billing;
  perm public.guard_permissions; acc public.location_manager_access; base public.guard_baselines;
  rota public.guard_rota_assignments; off public.guard_included_offers; ord public.service_orders;
  mapping_ready boolean := false; membership_ready boolean := false; permission_ready boolean := false;
  access_ready boolean := false; contact_ready boolean := false; baseline_ready boolean := false;
  rota_ready boolean := false; commercial_ready boolean := false; billing_ready boolean := false;
  included_eligibility_ready boolean := false; included_choice_ready boolean := false;
  ready boolean := false; blockers text[] := '{}'; projected text;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = p_coverage;
  IF cov.id IS NULL THEN RETURN jsonb_build_object('status', 'missing'); END IF;
  SELECT * INTO map FROM public.guard_onboarding_locations WHERE id = cov.onboarding_location_id;
  SELECT * INTO bill FROM public.guard_billing WHERE coverage_id = cov.id;
  SELECT * INTO perm FROM public.guard_permissions WHERE coverage_id = cov.id AND status = 'ACTIVE';
  SELECT * INTO acc FROM admin_private.guard_access_record_v1(cov.business_id, cov.location_id);
  SELECT * INTO base FROM public.guard_baselines WHERE coverage_id = cov.id AND status = 'VERIFIED';
  SELECT * INTO rota FROM public.guard_rota_assignments WHERE coverage_id = cov.id AND status = 'ACTIVE';
  SELECT * INTO off FROM public.guard_included_offers WHERE coverage_id = cov.id;
  IF cov.service_order_id IS NOT NULL THEN SELECT * INTO ord FROM public.service_orders WHERE id = cov.service_order_id; END IF;

  mapping_ready := (
    (cov.onboarding_location_id IS NULL AND cov.coverage_basis = 'INCLUDED')
    OR (map.id IS NOT NULL AND map.status IN ('IDENTIFIED','READY_FOR_ONBOARDING')
      AND map.location_id = cov.location_id AND map.customer_id = cov.customer_id AND map.business_id = cov.business_id)
  );
  membership_ready := admin_private.guard_location_authorized_v1(cov.customer_id, cov.business_id, cov.location_id);
  permission_ready := perm.id IS NOT NULL AND perm.status = 'ACTIVE' AND perm.location_id = cov.location_id
    AND perm.permission_version = 'GUARD_PERMISSION_V1'
    AND (cov.coverage_basis <> 'INCLUDED' OR perm.included_offer_id IS NOT NULL);
  access_ready := acc.id IS NOT NULL;
  contact_ready := admin_private.guard_contact_ready_v1(cov.customer_id);
  baseline_ready := base.id IS NOT NULL AND base.location_id = cov.location_id AND base.status = 'VERIFIED';
  rota_ready := rota.id IS NOT NULL AND rota.status = 'ACTIVE' AND rota.assignee_auth_user_id IS NOT NULL;
  IF cov.coverage_basis = 'DIRECT_GUARD' THEN
    commercial_ready := ord.id IS NOT NULL AND ord.service_code = 'RELAUNCH_GUARD'
      AND ord.payment_model = 'RECURRING_MONTHLY' AND ord.state = 'ACCEPTED_RECURRING'
      AND ord.customer_id = cov.customer_id AND ord.business_id = cov.business_id
      AND ord.location_id = cov.location_id
      AND (ord.monitoring_request_id IS NULL OR ord.monitoring_request_id IS NOT DISTINCT FROM cov.monitoring_request_id);
    billing_ready := bill.billing_state = 'CURRENT' AND bill.entitlement_source = 'PROVIDER'
      AND bill.paid_through_at IS NOT NULL AND bill.paid_through_at > now();
    included_eligibility_ready := true;
    included_choice_ready := true;
  ELSE
    commercial_ready := off.id IS NOT NULL AND admin_private.included_guard_eligible_v1(
      cov.customer_id, cov.business_id, cov.location_id, cov.source_recovery_case_id, cov.source_managed_order_id
    );
    billing_ready := bill.billing_state = 'NOT_REQUIRED' AND bill.entitlement_source = 'INCLUDED';
    included_eligibility_ready := commercial_ready AND off.included_days = 30
      AND (cov.included_start_at IS NULL);
    included_choice_ready := off.status = 'ACCEPTED' AND perm.included_offer_id IS NOT DISTINCT FROM off.id;
  END IF;

  IF NOT mapping_ready THEN blockers := blockers || ARRAY['MAPPING_NOT_READY']; END IF;
  IF NOT membership_ready THEN blockers := blockers || ARRAY['MEMBERSHIP_UNVERIFIED']; END IF;
  IF NOT permission_ready THEN blockers := blockers || ARRAY['PERMISSION_INACTIVE']; END IF;
  IF NOT access_ready THEN blockers := blockers || ARRAY['ACCESS_NOT_VERIFIED']; END IF;
  IF NOT contact_ready THEN blockers := blockers || ARRAY['CONTACT_NOT_CURRENT']; END IF;
  IF NOT baseline_ready THEN blockers := blockers || ARRAY['BASELINE_NOT_VERIFIED']; END IF;
  IF NOT rota_ready THEN blockers := blockers || ARRAY['ROTA_NOT_ASSIGNED']; END IF;
  IF NOT commercial_ready THEN blockers := blockers || ARRAY['COMMERCIAL_ORDER_MISSING']; END IF;
  IF NOT billing_ready THEN blockers := blockers || ARRAY['BILLING_NOT_CURRENT']; END IF;
  IF cov.coverage_basis = 'INCLUDED' AND NOT included_eligibility_ready THEN
    blockers := blockers || ARRAY['INCLUDED_ELIGIBILITY_MISSING'];
  END IF;
  IF cov.coverage_basis = 'INCLUDED' AND NOT included_choice_ready THEN
    blockers := blockers || ARRAY['INCLUDED_CHOICE_MISSING'];
  END IF;
  IF cov.state IN ('ACTIVE','PAUSED','ENDING','ENDED') THEN
    blockers := blockers || ARRAY['COVERAGE_STATE_INVALID'];
  END IF;

  ready := mapping_ready AND membership_ready AND permission_ready AND access_ready AND contact_ready
    AND baseline_ready AND rota_ready AND commercial_ready AND billing_ready
    AND included_eligibility_ready AND included_choice_ready
    AND cov.state NOT IN ('ACTIVE','PAUSED','ENDING','ENDED');

  IF cov.state IN ('ACTIVE','PAUSED','ENDING','ENDED') THEN projected := cov.state;
  ELSIF NOT permission_ready THEN projected := 'AWAITING_AUTHORIZATION';
  ELSIF NOT access_ready THEN projected := 'VERIFYING_ACCESS';
  ELSIF NOT baseline_ready THEN projected := 'BASELINE_REQUIRED';
  ELSIF cov.coverage_basis = 'DIRECT_GUARD' AND NOT billing_ready THEN projected := 'AWAITING_PAYMENT';
  ELSIF ready THEN projected := 'READY_TO_ACTIVATE';
  ELSE projected := 'REQUESTED';
  END IF;

  RETURN jsonb_build_object(
    'coverageId', cov.id, 'state', cov.state, 'projectedState', projected, 'coverageBasis', cov.coverage_basis,
    'mappingReady', mapping_ready, 'businessMembershipReady', membership_ready, 'permissionReady', permission_ready,
    'accessReady', access_ready, 'contactReady', contact_ready, 'baselineReady', baseline_ready,
    'rotaReady', rota_ready, 'commercialOrderReady', commercial_ready, 'billingReady', billing_ready,
    'includedEligibilityReady', included_eligibility_ready, 'includedChoiceReady', included_choice_ready,
    'readyToActivate', ready, 'blockerCodes', to_jsonb(blockers),
    'permissionId', perm.id, 'accessId', acc.id, 'accessVersion', acc.record_version,
    'baselineId', base.id, 'rotaId', rota.id, 'billingState', bill.billing_state,
    'includedOfferId', off.id, 'includedOfferStatus', off.status
  );
END; $$;

CREATE FUNCTION public.guard_coverage_readiness_v1(p_coverage uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT admin_private.guard_coverage_readiness_v1(p_coverage);
$$;

CREATE FUNCTION admin_private.guard_sync_coverage_state_v1(p_coverage uuid, p_actor_type text, p_actor uuid)
RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cov public.guard_coverages; ready jsonb; projected text;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = p_coverage FOR UPDATE;
  IF cov.id IS NULL OR cov.state IN ('ACTIVE','PAUSED','ENDING','ENDED') THEN RETURN cov.state; END IF;
  ready := admin_private.guard_coverage_readiness_v1(p_coverage);
  projected := ready->>'projectedState';
  IF projected IS NOT NULL AND projected IS DISTINCT FROM cov.state THEN
    UPDATE public.guard_coverages SET state = projected WHERE id = cov.id;
    PERFORM admin_private.guard_append_event_v1(
      cov.id, p_actor_type, p_actor, 'STATE_CHANGED', cov.state, projected, 'Readiness projection',
      jsonb_build_object('blockerCodes', ready->'blockerCodes')
    );
    RETURN projected;
  END IF;
  RETURN cov.state;
END; $$;

CREATE FUNCTION admin_private.prepare_guard_permission_action_v1(p_coverage uuid) RETURNS text
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions;
BEGIN
  SELECT * INTO a FROM public.customer_actions
    WHERE guard_coverage_id = p_coverage AND kind = 'GUARD_PERMISSION' AND status = 'OPEN' FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'clear'; END IF;
  IF a.expires_at > now() THEN RETURN 'exists'; END IF;
  UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, NULL, 'ADMIN', a.created_by, 'ACTION_REVOKED',
    jsonb_build_object('reason', 'The previous Guard permission capability expired.', 'source', 'ACTION_EXPIRED', 'kind', a.kind));
  DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
  DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
  RETURN 'expired';
END; $$;

CREATE FUNCTION admin_private.guard_identify_location_v1(p_actor uuid, p_request uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE req public.monitoring_requests; loc public.locations; map public.guard_onboarding_locations; n integer;
BEGIN
  SELECT * INTO req FROM public.monitoring_requests WHERE id = NULLIF(p_payload->>'monitoringRequestId','')::uuid FOR UPDATE;
  SELECT * INTO loc FROM public.locations WHERE id = NULLIF(p_payload->>'locationId','')::uuid;
  IF req.id IS NULL OR loc.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF NOT admin_private.guard_location_authorized_v1(req.customer_id, req.business_id, loc.id) THEN
    RETURN jsonb_build_object('status','denied','reason','membership_or_business');
  END IF;
  IF loc.business_id IS DISTINCT FROM req.business_id THEN
    RETURN jsonb_build_object('status','denied','reason','business_mismatch');
  END IF;
  SELECT * INTO map FROM public.guard_onboarding_locations
    WHERE monitoring_request_id = req.id AND location_id = loc.id AND status <> 'REMOVED';
  IF map.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', map.id, 'version', map.record_version, 'replay', true);
  END IF;
  SELECT coalesce(max(ordinal),0)+1 INTO n FROM public.guard_onboarding_locations WHERE monitoring_request_id = req.id;
  INSERT INTO public.guard_onboarding_locations(
    monitoring_request_id, customer_id, business_id, location_id, source, ordinal, status, created_by
  ) VALUES (req.id, req.customer_id, req.business_id, loc.id, 'ADMIN_ADDED', n, 'IDENTIFIED', p_actor)
  RETURNING * INTO map;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', map.id, p_request, 'guard_onboarding_location',
    'Identified a Guard onboarding location', jsonb_build_object('monitoringRequestId', req.id, 'locationId', loc.id));
  RETURN jsonb_build_object('status','success','id', map.id, 'version', map.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_remove_location_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE map public.guard_onboarding_locations;
BEGIN
  SELECT * INTO map FROM public.guard_onboarding_locations WHERE id = NULLIF(p_payload->>'mappingId','')::uuid FOR UPDATE;
  IF map.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM map.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF map.source = 'INTAKE_PRIMARY' THEN RETURN jsonb_build_object('status','denied','reason','intake_primary'); END IF;
  IF map.status = 'REMOVED' THEN RETURN jsonb_build_object('status','success','id', map.id, 'version', map.record_version, 'replay', true); END IF;
  IF EXISTS (
    SELECT 1 FROM public.guard_coverages c
    WHERE c.onboarding_location_id = map.id AND c.state <> 'ENDED'
  ) THEN RETURN jsonb_build_object('status','denied','reason','coverage_exists'); END IF;
  UPDATE public.guard_onboarding_locations SET status = 'REMOVED' WHERE id = map.id RETURNING * INTO map;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', map.id, p_request, 'guard_onboarding_location',
    'Removed a Guard onboarding location', jsonb_build_object('monitoringRequestId', map.monitoring_request_id, 'locationId', map.location_id));
  RETURN jsonb_build_object('status','success','id', map.id, 'version', map.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_mark_mapping_ready_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE map public.guard_onboarding_locations;
BEGIN
  SELECT * INTO map FROM public.guard_onboarding_locations WHERE id = NULLIF(p_payload->>'mappingId','')::uuid FOR UPDATE;
  IF map.id IS NULL OR map.status = 'REMOVED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM map.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF NOT admin_private.guard_location_authorized_v1(map.customer_id, map.business_id, map.location_id) THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF map.status = 'READY_FOR_ONBOARDING' THEN
    RETURN jsonb_build_object('status','success','id', map.id, 'version', map.record_version, 'replay', true);
  END IF;
  UPDATE public.guard_onboarding_locations SET status = 'READY_FOR_ONBOARDING' WHERE id = map.id RETURNING * INTO map;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', map.id, p_request, 'guard_onboarding_location',
    'Marked a Guard onboarding location ready', jsonb_build_object('locationId', map.location_id));
  RETURN jsonb_build_object('status','success','id', map.id, 'version', map.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_create_direct_coverage_v1(p_actor uuid, p_request uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  map public.guard_onboarding_locations; ord public.service_orders; cov public.guard_coverages; bill public.guard_billing;
BEGIN
  SELECT * INTO map FROM public.guard_onboarding_locations WHERE id = NULLIF(p_payload->>'mappingId','')::uuid FOR UPDATE;
  SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(p_payload->>'serviceOrderId','')::uuid;
  IF map.id IS NULL OR ord.id IS NULL OR map.status = 'REMOVED' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF NOT admin_private.guard_location_authorized_v1(map.customer_id, map.business_id, map.location_id) THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF ord.service_code IS DISTINCT FROM 'RELAUNCH_GUARD' OR ord.payment_model IS DISTINCT FROM 'RECURRING_MONTHLY'
    OR ord.state IS DISTINCT FROM 'ACCEPTED_RECURRING' THEN RETURN jsonb_build_object('status','denied','reason','order'); END IF;
  IF ord.customer_id IS DISTINCT FROM map.customer_id OR ord.business_id IS DISTINCT FROM map.business_id
    OR ord.location_id IS DISTINCT FROM map.location_id THEN RETURN jsonb_build_object('status','denied','reason','scope'); END IF;
  IF ord.monitoring_request_id IS NOT NULL AND ord.monitoring_request_id IS DISTINCT FROM map.monitoring_request_id THEN
    RETURN jsonb_build_object('status','denied','reason','request_mismatch');
  END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE service_order_id = ord.id AND state <> 'ENDED';
  IF cov.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', cov.id, 'version', cov.record_version, 'replay', true);
  END IF;
  INSERT INTO public.guard_coverages(
    customer_id, business_id, location_id, monitoring_request_id, onboarding_location_id, service_order_id,
    coverage_basis, coverage_origin, state
  ) VALUES (
    map.customer_id, map.business_id, map.location_id, map.monitoring_request_id, map.id, ord.id,
    'DIRECT_GUARD', 'DIRECT_GUARD', 'REQUESTED'
  ) RETURNING * INTO cov;
  INSERT INTO public.guard_billing(coverage_id, billing_state, entitlement_source)
  VALUES (cov.id, 'PENDING', 'NONE') RETURNING * INTO bill;
  PERFORM admin_private.guard_append_event_v1(cov.id, 'ADMIN', p_actor, 'COVERAGE_CREATED', NULL, 'REQUESTED',
    'Direct Guard coverage created', jsonb_build_object('serviceOrderId', ord.id, 'mappingId', map.id));
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'ADMIN', p_actor);
  SELECT * INTO cov FROM public.guard_coverages WHERE id = cov.id;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Created direct Guard coverage', jsonb_build_object('serviceOrderId', ord.id, 'billingState', bill.billing_state));
  RETURN jsonb_build_object('status','success','id', cov.id, 'version', cov.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_create_included_offer_v1(p_actor uuid, p_request uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cs public.cases; ord public.service_orders; off public.guard_included_offers; cov public.guard_coverages;
  map public.guard_onboarding_locations;
BEGIN
  SELECT * INTO cs FROM public.cases WHERE id = NULLIF(p_payload->>'caseId','')::uuid;
  SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(p_payload->>'serviceOrderId','')::uuid;
  IF cs.id IS NULL OR ord.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF NOT admin_private.included_guard_eligible_v1(cs.customer_id, cs.business_id, cs.location_id, cs.id, ord.id) THEN
    RETURN jsonb_build_object('status','denied','reason','ineligible');
  END IF;
  IF NOT admin_private.guard_location_authorized_v1(cs.customer_id, cs.business_id, cs.location_id) THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  SELECT * INTO off FROM public.guard_included_offers WHERE source_managed_order_id = ord.id;
  IF off.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', off.coverage_id, 'offerId', off.id, 'version', off.record_version, 'replay', true);
  END IF;
  SELECT * INTO map FROM public.guard_onboarding_locations
    WHERE location_id = cs.location_id AND customer_id = cs.customer_id AND business_id = cs.business_id
      AND status <> 'REMOVED'
    ORDER BY created_at ASC LIMIT 1;
  INSERT INTO public.guard_coverages(
    customer_id, business_id, location_id, monitoring_request_id, onboarding_location_id,
    source_recovery_case_id, source_managed_order_id, coverage_basis, coverage_origin, state
  ) VALUES (
    cs.customer_id, cs.business_id, cs.location_id, map.monitoring_request_id, map.id,
    cs.id, ord.id, 'INCLUDED', 'INCLUDED_RECOVERY', 'REQUESTED'
  ) RETURNING * INTO cov;
  INSERT INTO public.guard_billing(coverage_id, billing_state, entitlement_source)
  VALUES (cov.id, 'NOT_REQUIRED', 'INCLUDED');
  INSERT INTO public.guard_included_offers(
    customer_id, business_id, location_id, source_recovery_case_id, source_managed_order_id,
    coverage_id, status, eligibility_snapshot, created_by
  ) VALUES (
    cs.customer_id, cs.business_id, cs.location_id, cs.id, ord.id, cov.id, 'ELIGIBLE',
    jsonb_build_object(
      'caseId', cs.id, 'caseType', cs.case_type, 'outcome', cs.outcome, 'serviceTrack', cs.service_track,
      'serviceOrderId', ord.id, 'includedDays', 30
    ),
    p_actor
  ) RETURNING * INTO off;
  PERFORM admin_private.guard_append_event_v1(cov.id, 'ADMIN', p_actor, 'COVERAGE_CREATED', NULL, 'REQUESTED',
    'Included Guard coverage created', jsonb_build_object('offerId', off.id, 'managedOrderId', ord.id));
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'ADMIN', p_actor);
  SELECT * INTO cov FROM public.guard_coverages WHERE id = cov.id;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Created included Guard offer', jsonb_build_object('offerId', off.id, 'billingState', 'NOT_REQUIRED'));
  RETURN jsonb_build_object('status','success','id', cov.id, 'offerId', off.id, 'version', cov.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_issue_permission_action_v1(p_actor uuid, p_request uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; off public.guard_included_offers; a public.customer_actions; prep text; expires timestamptz;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  IF cov.id IS NULL OR cov.state IN ('ENDED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  expires := NULLIF(p_payload->>'expiresAt','')::timestamptz;
  IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF NULLIF(p_payload->>'secretHash','') IS NULL OR p_payload->>'secretHash' !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF NOT admin_private.guard_location_authorized_v1(cov.customer_id, cov.business_id, cov.location_id) THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF NOT admin_private.contact_verified_v1(cov.customer_id, 'email') THEN
    RETURN jsonb_build_object('status','denied','reason','email');
  END IF;
  IF cov.coverage_basis = 'INCLUDED' THEN
    SELECT * INTO off FROM public.guard_included_offers WHERE coverage_id = cov.id FOR UPDATE;
    IF off.id IS NULL OR off.status NOT IN ('ELIGIBLE','OFFERED') THEN RETURN jsonb_build_object('status','denied'); END IF;
  END IF;
  prep := admin_private.prepare_guard_permission_action_v1(cov.id);
  IF prep = 'exists' THEN
    SELECT * INTO a FROM public.customer_actions
      WHERE guard_coverage_id = cov.id AND kind = 'GUARD_PERMISSION' AND status = 'OPEN';
    RETURN jsonb_build_object('status','success','id', a.id, 'expiresAt', a.expires_at, 'replay', true);
  END IF;
  INSERT INTO public.customer_actions(
    customer_id, business_id, location_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by,
    guard_coverage_id, guard_included_offer_id
  ) VALUES (
    cov.customer_id, cov.business_id, cov.location_id, 'GUARD_PERMISSION', p_payload->>'secretHash',
    (SELECT email FROM public.customers WHERE id = cov.customer_id), expires, p_actor, cov.id, off.id
  ) RETURNING * INTO a;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, NULL, 'ADMIN', p_actor, 'ACTION_CREATED', jsonb_build_object('kind','GUARD_PERMISSION','coverageId', cov.id));
  IF off.id IS NOT NULL AND off.status = 'ELIGIBLE' THEN
    UPDATE public.guard_included_offers SET status = 'OFFERED', offered_at = now() WHERE id = off.id;
  END IF;
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'ADMIN', p_actor);
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Issued a Guard permission action', jsonb_build_object('actionId', a.id));
  RETURN jsonb_build_object('status','success','id', a.id, 'expiresAt', a.expires_at);
END; $$;

CREATE FUNCTION admin_private.guard_record_baseline_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; prev public.guard_baselines; base public.guard_baselines; n integer; details jsonb;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  IF cov.id IS NULL OR cov.state IN ('ENDED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM cov.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  details := coalesce(p_payload->'profileDetails', '{}'::jsonb);
  IF jsonb_typeof(details) <> 'object' OR octet_length(details::text) > 4000 THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF NULLIF(btrim(p_payload->>'profileUrl'),'') IS NULL OR char_length(btrim(p_payload->>'profileUrl')) > 500
    OR NULLIF(btrim(p_payload->>'displayedBusinessName'),'') IS NULL
    OR p_payload->>'profileAvailability' NOT IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO prev FROM public.guard_baselines WHERE coverage_id = cov.id AND status = 'VERIFIED' FOR UPDATE;
  SELECT coalesce(max(version_number),0)+1 INTO n FROM public.guard_baselines WHERE coverage_id = cov.id;
  INSERT INTO public.guard_baselines(
    coverage_id, location_id, version_number, status, profile_url, profile_availability, displayed_business_name,
    profile_details_snapshot, review_count, rating, latest_review_reference, latest_review_at, captured_by, notes
  ) VALUES (
    cov.id, cov.location_id, n, 'VERIFIED', btrim(p_payload->>'profileUrl'), p_payload->>'profileAvailability',
    btrim(p_payload->>'displayedBusinessName'), details,
    NULLIF(p_payload->>'reviewCount','')::integer, NULLIF(p_payload->>'rating','')::numeric,
    coalesce(p_payload->>'latestReviewReference',''), NULLIF(p_payload->>'latestReviewAt','')::timestamptz,
    p_actor, coalesce(p_payload->>'notes','')
  ) RETURNING * INTO base;
  IF prev.id IS NOT NULL THEN
    UPDATE public.guard_baselines SET status = 'SUPERSEDED' WHERE id = prev.id;
  END IF;
  UPDATE public.guard_coverages SET baseline_id = base.id WHERE id = cov.id;
  PERFORM admin_private.guard_append_event_v1(cov.id, 'ADMIN', p_actor, 'BASELINE_RECORDED', cov.state, cov.state,
    'Verified baseline recorded', jsonb_build_object('baselineId', base.id, 'versionNumber', base.version_number));
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'ADMIN', p_actor);
  SELECT record_version INTO n FROM public.guard_coverages WHERE id = cov.id;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Recorded a verified Guard baseline', jsonb_build_object('baselineId', base.id));
  RETURN jsonb_build_object('status','success','id', cov.id, 'baselineId', base.id, 'version', n);
END; $$;

CREATE FUNCTION admin_private.guard_assign_rota_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cov public.guard_coverages; prev public.guard_rota_assignments; rota public.guard_rota_assignments;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  IF cov.id IS NULL OR cov.state IN ('ENDED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM cov.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  SELECT * INTO prev FROM public.guard_rota_assignments WHERE coverage_id = cov.id AND status = 'ACTIVE' FOR UPDATE;
  IF prev.id IS NOT NULL AND prev.assignee_auth_user_id = p_actor THEN
    RETURN jsonb_build_object('status','success','id', cov.id, 'rotaId', prev.id, 'version', cov.record_version, 'replay', true);
  END IF;
  IF prev.id IS NOT NULL THEN
    UPDATE public.guard_rota_assignments SET status = 'SUPERSEDED' WHERE id = prev.id;
  END IF;
  INSERT INTO public.guard_rota_assignments(coverage_id, assignee_auth_user_id, created_by)
  VALUES (cov.id, p_actor, p_actor) RETURNING * INTO rota;
  UPDATE public.guard_coverages SET rota_id = rota.id WHERE id = cov.id;
  PERFORM admin_private.guard_append_event_v1(cov.id, 'ADMIN', p_actor, 'ROTA_ASSIGNED', cov.state, cov.state,
    'Monitoring rota assigned', jsonb_build_object('rotaId', rota.id, 'windows', jsonb_build_array('MORNING','EVENING')));
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'ADMIN', p_actor);
  SELECT * INTO cov FROM public.guard_coverages WHERE id = cov.id;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Assigned the Guard monitoring rota', jsonb_build_object('rotaId', rota.id));
  RETURN jsonb_build_object('status','success','id', cov.id, 'rotaId', rota.id, 'version', cov.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_open_exception_v1(
  p_coverage uuid, p_actor uuid, p_ready jsonb, p_reason text, p_notes text
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row public.guard_activation_exceptions; codes text[];
BEGIN
  SELECT coalesce(ARRAY(SELECT jsonb_array_elements_text(p_ready->'blockerCodes')), '{}') INTO codes;
  SELECT * INTO row FROM public.guard_activation_exceptions WHERE coverage_id = p_coverage AND status = 'OPEN';
  IF row.id IS NOT NULL THEN RETURN row.id; END IF;
  INSERT INTO public.guard_activation_exceptions(
    coverage_id, reason_code, blocker_codes, billing_state_snapshot, coverage_state_snapshot, status, notes, created_by
  ) VALUES (
    p_coverage, p_reason, codes, coalesce(p_ready->>'billingState',''), coalesce(p_ready->>'state',''),
    'OPEN', coalesce(p_notes,''), p_actor
  ) RETURNING * INTO row;
  PERFORM admin_private.guard_append_event_v1(p_coverage, 'ADMIN', p_actor, 'EXCEPTION_OPENED', p_ready->>'state', p_ready->>'state',
    'Activation exception opened', jsonb_build_object('exceptionId', row.id, 'reason', p_reason, 'blockerCodes', p_ready->'blockerCodes'));
  RETURN row.id;
END; $$;

CREATE FUNCTION admin_private.guard_activate_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; ready jsonb; rota public.guard_rota_assignments; window_code text; on_date date;
  exception_id uuid; london_hour integer;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  IF cov.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF cov.state = 'ACTIVE' AND cov.activated_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', cov.id, 'version', cov.record_version, 'replay', true, 'activatedAt', cov.activated_at);
  END IF;
  IF p_version IS DISTINCT FROM cov.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  ready := admin_private.guard_coverage_readiness_v1(cov.id);
  IF (ready->>'billingReady')::boolean IS TRUE AND (ready->>'readyToActivate')::boolean IS NOT TRUE THEN
    exception_id := admin_private.guard_open_exception_v1(cov.id, p_actor, ready, 'PAID_NOT_READY', coalesce(p_payload->>'notes',''));
    PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'denied', cov.id, p_request, 'guard_coverage',
      'Activation blocked after payment entitlement', jsonb_build_object('exceptionId', exception_id, 'blockerCodes', ready->'blockerCodes'));
    RETURN jsonb_build_object('status','denied','reason','paid_not_ready','exceptionId', exception_id, 'readiness', ready);
  END IF;
  IF (ready->>'readyToActivate')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('status','denied','reason','not_ready','readiness', ready);
  END IF;
  london_hour := extract(hour from timezone('Europe/London', now()))::integer;
  window_code := CASE WHEN london_hour < 12 THEN 'MORNING' ELSE 'EVENING' END;
  on_date := (timezone('Europe/London', now()))::date;
  UPDATE public.guard_rota_assignments
    SET first_planned_window_code = window_code, first_planned_on = on_date
    WHERE coverage_id = cov.id AND status = 'ACTIVE'
    RETURNING * INTO rota;
  UPDATE public.guard_coverages SET
    state = 'ACTIVE',
    activated_at = now(),
    permission_id = NULLIF(ready->>'permissionId','')::uuid,
    baseline_id = NULLIF(ready->>'baselineId','')::uuid,
    rota_id = NULLIF(ready->>'rotaId','')::uuid,
    access_id = NULLIF(ready->>'accessId','')::uuid,
    first_planned_window_code = window_code,
    first_planned_on = on_date,
    included_start_at = CASE WHEN coverage_basis = 'INCLUDED' THEN now() ELSE included_start_at END,
    included_end_at = CASE WHEN coverage_basis = 'INCLUDED' THEN now() + interval '30 days' ELSE included_end_at END
    WHERE id = cov.id RETURNING * INTO cov;
  PERFORM admin_private.guard_append_event_v1(
    cov.id, 'ADMIN', p_actor, 'ACTIVATED', ready->>'state', 'ACTIVE', 'Guard activated',
    jsonb_build_object(
      'permissionId', cov.permission_id, 'accessId', cov.access_id, 'accessVersion', ready->'accessVersion',
      'baselineId', cov.baseline_id, 'rotaId', cov.rota_id, 'firstPlannedWindow', window_code,
      'firstPlannedOn', on_date, 'includedStartAt', cov.included_start_at, 'includedEndAt', cov.included_end_at
    )
  );
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Activated Guard coverage', jsonb_build_object('activatedAt', cov.activated_at, 'coverageBasis', cov.coverage_basis));
  RETURN jsonb_build_object(
    'status','success','id', cov.id, 'version', cov.record_version, 'activatedAt', cov.activated_at,
    'includedStartAt', cov.included_start_at, 'includedEndAt', cov.included_end_at,
    'firstPlannedWindow', window_code, 'firstPlannedOn', on_date
  );
END; $$;

CREATE FUNCTION admin_private.guard_record_exception_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cov public.guard_coverages; ready jsonb; exception_id uuid;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  IF cov.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM cov.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  ready := admin_private.guard_coverage_readiness_v1(cov.id);
  exception_id := admin_private.guard_open_exception_v1(
    cov.id, p_actor, ready,
    CASE WHEN (ready->>'billingReady')::boolean THEN 'PAID_NOT_READY' ELSE 'ACTIVATION_BLOCKED' END,
    coalesce(p_payload->>'notes','')
  );
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Recorded a Guard activation exception', jsonb_build_object('exceptionId', exception_id));
  RETURN jsonb_build_object('status','success','id', cov.id, 'exceptionId', exception_id, 'version', cov.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_acknowledge_exception_v1(p_actor uuid, p_request uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row public.guard_activation_exceptions;
BEGIN
  SELECT * INTO row FROM public.guard_activation_exceptions WHERE id = NULLIF(p_payload->>'exceptionId','')::uuid FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF row.status <> 'OPEN' THEN
    RETURN jsonb_build_object('status','success','id', row.coverage_id, 'exceptionId', row.id, 'replay', true);
  END IF;
  UPDATE public.guard_activation_exceptions
    SET status = 'ACKNOWLEDGED', acknowledged_at = now(), acknowledged_by = p_actor
    WHERE id = row.id RETURNING * INTO row;
  PERFORM admin_private.guard_append_event_v1(row.coverage_id, 'ADMIN', p_actor, 'EXCEPTION_ACKNOWLEDGED', NULL, NULL,
    'Activation exception acknowledged', jsonb_build_object('exceptionId', row.id));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', row.coverage_id, p_request, 'guard_coverage',
    'Acknowledged a Guard activation exception', jsonb_build_object('exceptionId', row.id));
  RETURN jsonb_build_object('status','success','id', row.coverage_id, 'exceptionId', row.id);
END; $$;

CREATE FUNCTION admin_private.guard_revoke_permission_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cov public.guard_coverages; perm public.guard_permissions; reason text;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  IF cov.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM cov.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  reason := btrim(coalesce(p_payload->>'reason',''));
  IF char_length(reason) < 10 OR char_length(reason) > 2000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO perm FROM public.guard_permissions WHERE coverage_id = cov.id AND status = 'ACTIVE' FOR UPDATE;
  IF perm.id IS NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
  UPDATE public.guard_permissions
    SET status = 'REVOKED', revoked_at = now(), revoked_by = p_actor, revocation_reason = reason
    WHERE id = perm.id;
  UPDATE public.guard_coverages SET permission_id = NULL WHERE id = cov.id AND state <> 'ACTIVE';
  PERFORM admin_private.guard_append_event_v1(cov.id, 'ADMIN', p_actor, 'PERMISSION_REVOKED', cov.state, cov.state, reason,
    jsonb_build_object('permissionId', perm.id));
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'ADMIN', p_actor);
  SELECT * INTO cov FROM public.guard_coverages WHERE id = cov.id;
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Revoked Guard monitoring permission', jsonb_build_object('permissionId', perm.id));
  RETURN jsonb_build_object('status','success','id', cov.id, 'version', cov.record_version);
END; $$;

CREATE FUNCTION public.admin_guard_command_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; fp text; cached jsonb; result jsonb; payload jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN (
    'identify_location','remove_location','mark_mapping_ready','create_direct_coverage','create_included_offer',
    'issue_permission_action','record_baseline','assign_rota','activate','record_activation_exception',
    'acknowledge_exception','revoke_permission'
  ) OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  payload := p_payload - 'secretHash';
  fp := md5(jsonb_build_array(p_operation, payload, p_version)::text);
  cached := admin_private.guard_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  result := CASE p_operation
    WHEN 'identify_location' THEN admin_private.guard_identify_location_v1(actor, p_request, p_payload)
    WHEN 'remove_location' THEN admin_private.guard_remove_location_v1(actor, p_request, p_payload, p_version)
    WHEN 'mark_mapping_ready' THEN admin_private.guard_mark_mapping_ready_v1(actor, p_request, p_payload, p_version)
    WHEN 'create_direct_coverage' THEN admin_private.guard_create_direct_coverage_v1(actor, p_request, p_payload)
    WHEN 'create_included_offer' THEN admin_private.guard_create_included_offer_v1(actor, p_request, p_payload)
    WHEN 'issue_permission_action' THEN admin_private.guard_issue_permission_action_v1(actor, p_request, p_payload)
    WHEN 'record_baseline' THEN admin_private.guard_record_baseline_v1(actor, p_request, p_payload, p_version)
    WHEN 'assign_rota' THEN admin_private.guard_assign_rota_v1(actor, p_request, p_payload, p_version)
    WHEN 'activate' THEN admin_private.guard_activate_v1(actor, p_request, p_payload, p_version, s)
    WHEN 'record_activation_exception' THEN admin_private.guard_record_exception_v1(actor, p_request, p_payload, p_version)
    WHEN 'acknowledge_exception' THEN admin_private.guard_acknowledge_exception_v1(actor, p_request, p_payload)
    WHEN 'revoke_permission' THEN admin_private.guard_revoke_permission_v1(actor, p_request, p_payload, p_version)
  END;
  IF result IS NULL THEN result := jsonb_build_object('status','invalid'); END IF;
  INSERT INTO admin_private.guard_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_guard_list_v1(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'numberOfLocations', r.number_of_locations,
        'customerId', r.customer_id, 'businessId', r.business_id, 'locationId', r.location_id,
        'customerName', c.full_name, 'businessName', b.display_name, 'locationName', loc.location_name,
        'identifiedCount', (
          SELECT count(*) FROM public.guard_onboarding_locations m
          WHERE m.monitoring_request_id = r.id AND m.status <> 'REMOVED'
        ),
        'stillRequired', greatest(
          r.number_of_locations - (
            SELECT count(*) FROM public.guard_onboarding_locations m
            WHERE m.monitoring_request_id = r.id AND m.status <> 'REMOVED'
          ), 0
        ),
        'createdAt', r.created_at,
        'mappings', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', m.id, 'locationId', m.location_id, 'locationName', ml.location_name,
            'source', m.source, 'status', m.status, 'ordinal', m.ordinal, 'version', m.record_version
          ) ORDER BY m.ordinal)
          FROM public.guard_onboarding_locations m
          JOIN public.locations ml ON ml.id = m.location_id
          WHERE m.monitoring_request_id = r.id AND m.status <> 'REMOVED'
        ), '[]'::jsonb)
      ) ORDER BY r.created_at DESC)
      FROM public.monitoring_requests r
      JOIN public.customers c ON c.id = r.customer_id
      JOIN public.businesses b ON b.id = r.business_id
      JOIN public.locations loc ON loc.id = r.location_id
    ), '[]'::jsonb),
    'coverages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'state', g.state, 'coverageBasis', g.coverage_basis, 'coverageOrigin', g.coverage_origin,
        'customerId', g.customer_id, 'businessId', g.business_id, 'locationId', g.location_id,
        'customerName', c.full_name, 'businessName', b.display_name, 'locationName', loc.location_name,
        'monitoringRequestId', g.monitoring_request_id, 'serviceOrderId', g.service_order_id,
        'sourceRecoveryCaseId', g.source_recovery_case_id, 'sourceManagedOrderId', g.source_managed_order_id,
        'activatedAt', g.activated_at, 'includedStartAt', g.included_start_at, 'includedEndAt', g.included_end_at,
        'version', g.record_version, 'billingState', bill.billing_state, 'entitlementSource', bill.entitlement_source,
        'readiness', admin_private.guard_coverage_readiness_v1(g.id),
        'exceptionId', ex.id, 'exceptionStatus', ex.status
      ) ORDER BY g.created_at DESC)
      FROM public.guard_coverages g
      JOIN public.customers c ON c.id = g.customer_id
      JOIN public.businesses b ON b.id = g.business_id
      JOIN public.locations loc ON loc.id = g.location_id
      JOIN public.guard_billing bill ON bill.coverage_id = g.id
      LEFT JOIN public.guard_activation_exceptions ex ON ex.coverage_id = g.id AND ex.status = 'OPEN'
    ), '[]'::jsonb),
    'guardOrders', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'publicRef', o.public_ref, 'customerId', o.customer_id, 'businessId', o.business_id,
        'locationId', o.location_id, 'monitoringRequestId', o.monitoring_request_id, 'state', o.state,
        'covered', EXISTS (SELECT 1 FROM public.guard_coverages g WHERE g.service_order_id = o.id AND g.state <> 'ENDED')
      ) ORDER BY o.accepted_at DESC)
      FROM public.service_orders o
      WHERE o.service_code = 'RELAUNCH_GUARD' AND o.state = 'ACCEPTED_RECURRING'
    ), '[]'::jsonb),
    'locations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'businessId', l.business_id, 'name', l.location_name, 'country', l.country
      ) ORDER BY l.location_name)
      FROM public.locations l
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.protect_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
    OR NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
    OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
    OR NEW.quote_version_id IS DISTINCT FROM OLD.quote_version_id
    OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
    OR NEW.payment_obligation_id IS DISTINCT FROM OLD.payment_obligation_id
    OR NEW.payment_invoice_id IS DISTINCT FROM OLD.payment_invoice_id
    OR NEW.guard_coverage_id IS DISTINCT FROM OLD.guard_coverage_id
    OR NEW.guard_included_offer_id IS DISTINCT FROM OLD.guard_included_offer_id
    OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.secret_hash IS DISTINCT FROM OLD.secret_hash
    OR NEW.expected_email_snapshot IS DISTINCT FROM OLD.expected_email_snapshot
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Customer action scope fields are immutable'; END IF;
  IF OLD.status = 'OPEN' THEN
    IF NEW.status NOT IN ('OPEN','COMPLETED','DECLINED','REVOKED') THEN
      RAISE EXCEPTION 'Invalid customer action status transition';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Customer action status is terminal';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.validate_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.agreement_versions; auth public.authorization_records; c public.customers; cs public.cases;
  req public.evidence_requests; qv public.quote_versions; ord public.service_orders; ob public.payment_obligations;
  cov public.guard_coverages; off public.guard_included_offers;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO c FROM public.customers WHERE id = NEW.customer_id;
    IF c.id IS NULL OR lower(NEW.expected_email_snapshot) IS DISTINCT FROM lower(c.email) THEN
      RAISE EXCEPTION 'Customer action email snapshot does not match the current customer email';
    END IF;
  END IF;
  IF NEW.kind = 'AGREEMENT_ACCEPTANCE' THEN
    IF NEW.agreement_version_id IS NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Agreement acceptance actions require an agreement version and no authorisation';
    END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = NEW.agreement_version_id;
    IF v.id IS NULL OR v.case_id IS DISTINCT FROM NEW.case_id OR v.customer_id IS DISTINCT FROM NEW.customer_id
      OR v.business_id IS DISTINCT FROM NEW.business_id OR v.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced agreement'; END IF;
  ELSIF NEW.kind = 'AUTHORIZATION_REVOCATION' THEN
    IF NEW.authorization_id IS NULL OR NEW.agreement_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'Authorisation revocation actions require an authorisation and no agreement version';
    END IF;
    SELECT * INTO auth FROM public.authorization_records WHERE id = NEW.authorization_id;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM NEW.case_id OR auth.customer_id IS DISTINCT FROM NEW.customer_id
      OR auth.business_id IS DISTINCT FROM NEW.business_id OR auth.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced authorisation'; END IF;
  ELSIF NEW.kind IN ('CASE_ACCESS','COMMUNICATION_ACCESS') THEN
    IF NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL OR NEW.case_id IS NULL THEN
      RAISE EXCEPTION 'Case access actions require a case and no agreement or authorisation';
    END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NEW.case_id;
    IF cs.id IS NULL OR cs.customer_id IS DISTINCT FROM NEW.customer_id OR cs.business_id IS DISTINCT FROM NEW.business_id
      OR cs.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced case'; END IF;
    IF TG_OP = 'INSERT' AND cs.status IN ('CLOSED','CANCELLED') THEN
      RAISE EXCEPTION 'Case access cannot be created for a closed case';
    END IF;
    IF NEW.kind = 'CASE_ACCESS' AND NEW.evidence_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'Case access actions cannot pin an evidence request';
    END IF;
    IF NEW.kind = 'COMMUNICATION_ACCESS' THEN
      IF NEW.evidence_request_id IS NULL OR NEW.link_key_version IS NULL OR NEW.link_key_version < 1 THEN
        RAISE EXCEPTION 'Communication access actions require an evidence request and link key version';
      END IF;
      SELECT * INTO req FROM public.evidence_requests WHERE id = NEW.evidence_request_id;
      IF req.id IS NULL OR req.case_id IS DISTINCT FROM NEW.case_id OR (TG_OP = 'INSERT' AND req.status <> 'OPEN')
      THEN RAISE EXCEPTION 'Communication access does not match the referenced evidence request'; END IF;
    END IF;
  ELSIF NEW.kind = 'QUOTE_ACCEPTANCE' THEN
    IF NEW.quote_version_id IS NULL OR NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Quote acceptance actions require a quote version and no agreement or authorisation';
    END IF;
    SELECT * INTO qv FROM public.quote_versions WHERE id = NEW.quote_version_id;
    IF qv.id IS NULL OR qv.customer_id IS DISTINCT FROM NEW.customer_id OR qv.business_id IS DISTINCT FROM NEW.business_id
      OR qv.location_id IS DISTINCT FROM NEW.location_id OR qv.case_id IS DISTINCT FROM NEW.case_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced quote version'; END IF;
    IF TG_OP = 'INSERT' AND qv.status <> 'OFFERED' THEN
      RAISE EXCEPTION 'Quote acceptance can only be pinned to an offered quote version';
    END IF;
  ELSIF NEW.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = NEW.service_order_id;
    IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM NEW.customer_id OR ord.business_id IS DISTINCT FROM NEW.business_id
      OR ord.location_id IS DISTINCT FROM NEW.location_id OR ord.case_id IS DISTINCT FROM NEW.case_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced service order'; END IF;
    IF NEW.kind = 'GUIDED_PAYMENT' THEN
      IF ord.payment_model <> 'UPFRONT' THEN RAISE EXCEPTION 'Guided payment actions require an upfront order'; END IF;
      SELECT * INTO ob FROM public.payment_obligations WHERE id = NEW.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.kind <> 'UPFRONT'
      THEN RAISE EXCEPTION 'Guided payment actions require the order upfront obligation'; END IF;
    ELSIF NEW.kind = 'MANAGED_PAYMENT_SETUP' THEN
      IF ord.payment_model <> 'SUCCESS_FEE' THEN RAISE EXCEPTION 'Managed setup actions require a success-fee order'; END IF;
    ELSIF NEW.kind = 'PAYMENT_RECOVERY' THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = NEW.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id
      THEN RAISE EXCEPTION 'Recovery actions require the same obligation'; END IF;
    ELSIF NEW.kind = 'INVOICE_PAYMENT' THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = NEW.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.customer_id IS DISTINCT FROM NEW.customer_id
      THEN RAISE EXCEPTION 'Invoice payment actions require the same obligation'; END IF;
      IF NEW.payment_invoice_id IS NULL THEN RAISE EXCEPTION 'Invoice payment actions require an invoice'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.payment_invoices i
        WHERE i.id = NEW.payment_invoice_id AND i.obligation_id = ob.id AND i.service_order_id = ord.id
          AND i.customer_id = NEW.customer_id
      ) THEN RAISE EXCEPTION 'Invoice payment actions must pin the obligation invoice'; END IF;
    END IF;
  ELSIF NEW.kind = 'GUARD_PERMISSION' THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = NEW.guard_coverage_id;
    IF cov.id IS NULL OR cov.customer_id IS DISTINCT FROM NEW.customer_id OR cov.business_id IS DISTINCT FROM NEW.business_id
      OR cov.location_id IS DISTINCT FROM NEW.location_id OR cov.state IN ('ENDED')
    THEN RAISE EXCEPTION 'Customer action does not match the referenced Guard coverage'; END IF;
    IF NEW.guard_included_offer_id IS NOT NULL THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = NEW.guard_included_offer_id;
      IF off.id IS NULL OR off.coverage_id IS DISTINCT FROM cov.id OR off.customer_id IS DISTINCT FROM NEW.customer_id
        OR off.location_id IS DISTINCT FROM NEW.location_id
      THEN RAISE EXCEPTION 'Customer action does not match the referenced included Guard offer'; END IF;
    ELSIF cov.coverage_basis = 'INCLUDED' THEN
      RAISE EXCEPTION 'Included Guard permission actions require the included offer';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid customer action kind';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_action_eligible_v1(p_action public.customer_actions) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE c public.customers; b public.businesses; loc public.locations; cs public.cases;
  qv public.quote_versions; q public.quotes; ord public.service_orders; ob public.payment_obligations;
  cov public.guard_coverages; off public.guard_included_offers;
BEGIN
  IF p_action.id IS NULL OR p_action.status <> 'OPEN' OR p_action.expires_at <= now() THEN RETURN false; END IF;
  IF lower(p_action.expected_email_snapshot) = 'admin@profilerelaunch.com' THEN RETURN false; END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_action.customer_id;
  IF c.id IS NULL OR lower(c.email) IS DISTINCT FROM lower(p_action.expected_email_snapshot) THEN RETURN false; END IF;
  IF NOT admin_private.contact_verified_v1(c.id, 'email') THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'verified'
  ) THEN RETURN false; END IF;
  SELECT * INTO b FROM public.businesses WHERE id = p_action.business_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF p_action.location_id IS NOT NULL THEN
    SELECT * INTO loc FROM public.locations WHERE id = p_action.location_id;
    IF loc.id IS NULL OR loc.business_id <> p_action.business_id THEN RETURN false; END IF;
  END IF;
  IF p_action.case_id IS NOT NULL THEN
    SELECT * INTO cs FROM public.cases WHERE id = p_action.case_id;
    IF cs.id IS NULL OR cs.customer_id <> p_action.customer_id OR cs.business_id <> p_action.business_id THEN RETURN false; END IF;
    IF p_action.location_id IS NOT NULL AND cs.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF cs.status IN ('CLOSED','CANCELLED') THEN RETURN false; END IF;
  END IF;
  IF p_action.kind = 'AGREEMENT_ACCEPTANCE' AND EXISTS (
    SELECT 1 FROM public.agreement_versions v
    WHERE v.id = p_action.agreement_version_id AND v.agreement_kind = 'CASE_MANAGEMENT_PERMISSION'
  ) AND (cs.id IS NULL OR cs.service_track IS DISTINCT FROM 'MANAGED') THEN
    RETURN false;
  END IF;
  IF p_action.kind = 'QUOTE_ACCEPTANCE' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id;
    SELECT * INTO q FROM public.quotes WHERE id = qv.quote_id;
    IF qv.id IS NULL OR q.id IS NULL OR qv.status <> 'OFFERED' OR q.status <> 'OFFERED' THEN RETURN false; END IF;
    IF qv.valid_until <= now() THEN RETURN false; END IF;
    IF qv.customer_id IS DISTINCT FROM p_action.customer_id OR qv.business_id IS DISTINCT FROM p_action.business_id
      OR qv.location_id IS DISTINCT FROM p_action.location_id OR qv.case_id IS DISTINCT FROM p_action.case_id
    THEN RETURN false; END IF;
  END IF;
  IF p_action.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM p_action.customer_id THEN RETURN false; END IF;
    IF p_action.payment_obligation_id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = p_action.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state = 'VOID' THEN RETURN false; END IF;
    END IF;
    IF p_action.kind = 'INVOICE_PAYMENT' THEN
      IF p_action.payment_invoice_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.payment_invoices i
        WHERE i.id = p_action.payment_invoice_id AND i.obligation_id = p_action.payment_obligation_id
          AND i.status IN ('ISSUED','PAID')
      ) THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_PERMISSION' THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id;
    IF cov.id IS NULL OR cov.state IN ('ENDED') THEN RETURN false; END IF;
    IF cov.customer_id IS DISTINCT FROM p_action.customer_id OR cov.business_id IS DISTINCT FROM p_action.business_id
      OR cov.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF NOT admin_private.guard_location_authorized_v1(cov.customer_id, cov.business_id, cov.location_id) THEN
      RETURN false;
    END IF;
    IF cov.coverage_basis = 'INCLUDED' THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = p_action.guard_included_offer_id;
      IF off.id IS NULL OR off.status NOT IN ('ELIGIBLE','OFFERED') OR off.coverage_id IS DISTINCT FROM cov.id THEN
        RETURN false;
      END IF;
      IF NOT admin_private.included_guard_eligible_v1(
        cov.customer_id, cov.business_id, cov.location_id, cov.source_recovery_case_id, cov.source_managed_order_id
      ) THEN RETURN false; END IF;
    END IF;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.accept_guard_permission_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; off public.guard_included_offers; perm public.guard_permissions; a public.customer_actions;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id FOR UPDATE;
  SELECT * INTO perm FROM public.guard_permissions WHERE coverage_id = cov.id AND status = 'ACTIVE';
  IF perm.id IS NOT NULL THEN
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = coalesce(completed_at, now())
      WHERE id = p_action.id AND status = 'OPEN' RETURNING * INTO a;
    RETURN jsonb_build_object('status','success','actionStatus', coalesce(a.status, p_action.status), 'permissionId', perm.id, 'replay', true);
  END IF;
  IF p_action.guard_included_offer_id IS NOT NULL THEN
    SELECT * INTO off FROM public.guard_included_offers WHERE id = p_action.guard_included_offer_id FOR UPDATE;
  END IF;
  INSERT INTO public.guard_permissions(
    coverage_id, customer_id, business_id, location_id, included_offer_id, permission_version, accepted_text,
    status, accepted_by_auth_user_id, accepted_email_snapshot, customer_action_id
  ) VALUES (
    cov.id, cov.customer_id, cov.business_id, cov.location_id, off.id, 'GUARD_PERMISSION_V1',
    admin_private.guard_permission_text_v1(cov.coverage_basis), 'ACTIVE', p_actor, p_action.expected_email_snapshot, p_action.id
  ) RETURNING * INTO perm;
  IF off.id IS NOT NULL THEN
    UPDATE public.guard_included_offers SET status = 'ACCEPTED', accepted_at = now() WHERE id = off.id AND status IN ('ELIGIBLE','OFFERED');
  END IF;
  UPDATE public.guard_coverages SET permission_id = perm.id WHERE id = cov.id;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id RETURNING * INTO a;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, NULL, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('kind','GUARD_PERMISSION','permissionId', perm.id));
  PERFORM admin_private.guard_append_event_v1(cov.id, 'CUSTOMER', p_actor, 'PERMISSION_RECORDED', cov.state, cov.state,
    'Customer accepted Guard permission', jsonb_build_object('permissionId', perm.id, 'actionId', a.id, 'includedOfferId', off.id));
  PERFORM admin_private.guard_sync_coverage_state_v1(cov.id, 'CUSTOMER', p_actor);
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cov.id, p_request, 'guard_coverage',
    'Customer accepted Guard monitoring permission', jsonb_build_object('actionId', a.id, 'permissionId', perm.id));
  RETURN jsonb_build_object('status','success','actionStatus', a.status, 'permissionId', perm.id);
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_session_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; cs public.cases; b public.businesses; loc public.locations;
  qv public.quote_versions; snap public.quote_discount_snapshots; ord public.service_orders;
  ob public.payment_obligations; consent public.payment_consents; inv public.payment_invoices;
  cov public.guard_coverages; off public.guard_included_offers;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.id IS NULL OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  IF a.agreement_version_id IS NOT NULL THEN SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id; END IF;
  IF a.authorization_id IS NOT NULL THEN SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id; END IF;
  IF a.quote_version_id IS NOT NULL THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id;
    SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = qv.discount_snapshot_id;
  END IF;
  IF a.service_order_id IS NOT NULL THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id;
    SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
    SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id;
    SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = ord.id;
    SELECT * INTO inv FROM public.payment_invoices WHERE id = a.payment_invoice_id;
  END IF;
  IF a.guard_coverage_id IS NOT NULL THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = a.guard_coverage_id;
    SELECT * INTO off FROM public.guard_included_offers WHERE id = a.guard_included_offer_id;
  END IF;
  RETURN jsonb_build_object(
    'actionId', a.id, 'kind', a.kind, 'status', a.status,
    'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
    'caseReference', cs.public_ref, 'businessName', b.display_name, 'locationName', loc.location_name,
    'agreement', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v.id, 'kind', v.agreement_kind, 'title', v.title, 'body', v.body_text, 'scope', v.scope_text, 'versionNumber', v.version_number
    ) END,
    'authorization', CASE WHEN auth.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', auth.id, 'kind', auth.authorization_kind, 'status', auth.status
    ) END,
    'quote', CASE WHEN qv.id IS NULL OR a.quote_version_id IS NULL THEN NULL ELSE jsonb_build_object(
      'versionId', qv.id, 'versionNumber', qv.version_number, 'serviceCode', qv.service_code, 'serviceName', qv.service_name,
      'paymentModel', qv.payment_model, 'scope', qv.scope_text, 'exclusions', qv.exclusions_text,
      'successDefinition', qv.success_definition, 'standardAmountMinor', qv.standard_amount_minor,
      'discountPolicyId', qv.discount_policy_id, 'discountBps', qv.discount_bps, 'discountAmountMinor', qv.discount_amount_minor,
      'discountReason', snap.reason_code, 'quotedSubtotalMinor', qv.quoted_subtotal_minor, 'taxBehaviour', qv.tax_behaviour,
      'taxRateBps', qv.tax_rate_bps, 'taxAmountMinor', qv.tax_amount_minor, 'taxCode', qv.tax_code,
      'taxJurisdiction', qv.tax_jurisdiction, 'totalAmountMinor', qv.total_amount_minor, 'currency', qv.currency,
      'validUntil', qv.valid_until, 'paymentTiming', qv.payment_timing_text, 'termsReference', qv.terms_reference
    ) END,
    'payment', CASE WHEN ord.id IS NULL THEN NULL ELSE jsonb_build_object(
      'orderId', ord.id, 'orderRef', ord.public_ref, 'serviceCode', ord.service_code, 'amountMinor', ord.amount_minor,
      'currency', ord.currency, 'taxBehaviour', ord.tax_behaviour, 'taxAmountMinor', ord.tax_amount_minor,
      'paymentModel', ord.payment_model, 'successDefinition', qv.success_definition,
      'obligationId', ob.id, 'obligationState', ob.state, 'consentId', consent.id,
      'consentText', admin_private.success_fee_consent_text_v1(), 'consentVersion', 'SUCCESS_FEE_CONSENT_V1',
      'invoiceId', inv.id, 'invoiceStatus', inv.status, 'hostedInvoiceUrl', inv.hosted_invoice_url
    ) END,
    'guard', CASE WHEN cov.id IS NULL THEN NULL ELSE jsonb_build_object(
      'coverageId', cov.id, 'coverageBasis', cov.coverage_basis, 'permissionVersion', 'GUARD_PERMISSION_V1',
      'permissionText', admin_private.guard_permission_text_v1(cov.coverage_basis),
      'includedDays', CASE WHEN cov.coverage_basis = 'INCLUDED' THEN 30 ELSE NULL END,
      'includedOfferId', off.id, 'includedOfferStatus', off.status
    ) END
  );
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_command_v1(p_token_hash text, p_request uuid, p_operation text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; fp text; cached jsonb; result jsonb; data jsonb;
  qv public.quote_versions; qu public.quotes; off public.guard_included_offers;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('accept','decline','revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(sess.action_id, p_operation, data)::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation IN ('accept','decline') AND a.kind = 'GUARD_PERMISSION' THEN
    IF p_operation = 'accept' THEN
      IF data->'accepted' IS DISTINCT FROM 'true'::jsonb OR data->>'permissionVersion' IS DISTINCT FROM 'GUARD_PERMISSION_V1' THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      IF a.status = 'COMPLETED' OR EXISTS (
        SELECT 1 FROM public.guard_permissions p WHERE p.coverage_id = a.guard_coverage_id AND p.status = 'ACTIVE'
      ) THEN
        result := admin_private.accept_guard_permission_v1(a, sess.auth_user_id, p_request);
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
        RETURN result;
      END IF;
      IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
      result := admin_private.accept_guard_permission_v1(a, sess.auth_user_id, p_request);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    IF a.guard_included_offer_id IS NOT NULL THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = a.guard_included_offer_id FOR UPDATE;
      IF off.status IN ('ELIGIBLE','OFFERED') THEN
        UPDATE public.guard_included_offers SET status = 'DECLINED', declined_at = now() WHERE id = off.id;
      END IF;
    END IF;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, NULL, 'CUSTOMER', sess.auth_user_id, 'ACTION_DECLINED', jsonb_build_object('kind','GUARD_PERMISSION'));
    PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'GUARD_CHANGED', 'success', a.guard_coverage_id, p_request, 'guard_coverage',
      'Customer declined a Guard permission action', jsonb_build_object('actionId', a.id));
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF p_operation IN ('accept','decline') AND a.kind = 'QUOTE_ACCEPTANCE' THEN
    IF p_operation = 'accept' THEN
      IF data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      IF a.status = 'COMPLETED' OR EXISTS (SELECT 1 FROM public.quote_acceptances WHERE quote_version_id = a.quote_version_id) THEN
        result := admin_private.accept_quote_version_v1(a, sess.auth_user_id, p_request);
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
        RETURN result;
      END IF;
      IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
      result := admin_private.accept_quote_version_v1(a, sess.auth_user_id, p_request);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id FOR UPDATE;
    SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
    UPDATE public.quote_versions SET status = 'DECLINED' WHERE id = qv.id;
    UPDATE public.quotes SET status = 'DECLINED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id;
    UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'CUSTOMER', sess.auth_user_id, 'QUOTE_DECLINED', jsonb_build_object('actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_DECLINED', jsonb_build_object('kind', 'QUOTE_ACCEPTANCE'));
    PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Customer declined a quote', jsonb_build_object('actionId', a.id, 'quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF p_operation IN ('accept','decline') THEN
    IF a.kind <> 'AGREEMENT_ACCEPTANCE' OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id;
    IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF p_operation = 'decline' THEN
      UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
      INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
      VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_DECLINED', jsonb_build_object('kind', v.agreement_kind));
      PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer declined an agreement action',
        jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id));
      result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.authorization_records r
      WHERE r.case_id = a.case_id AND r.authorization_kind = v.agreement_kind AND r.status = 'ACTIVE'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.authorization_records(
      agreement_version_id, case_id, customer_id, business_id, location_id, authorization_kind, status,
      accepted_by_auth_user_id, accepted_email_snapshot, accepted_at, source
    ) VALUES (
      v.id, a.case_id, a.customer_id, a.business_id, a.location_id, v.agreement_kind, 'ACTIVE',
      sess.auth_user_id, a.expected_email_snapshot, now(), 'CUSTOMER_OTP'
    ) RETURNING * INTO auth;
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'AUTHORIZATION_ACCEPTED', jsonb_build_object('source', 'CUSTOMER_OTP', 'actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer accepted an agreement',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'kind', v.agreement_kind));
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationId', auth.id, 'authorizationStatus', auth.status);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF a.kind <> 'AUTHORIZATION_REVOCATION' OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id FOR UPDATE;
  IF auth.id IS NULL OR auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  UPDATE public.authorization_records
    SET status = 'REVOKED', revoked_at = now(), revoked_by = sess.auth_user_id,
        revocation_reason = 'Customer revoked this authorisation through a verified action.'
    WHERE id = auth.id RETURNING * INTO auth;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
  INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
  VALUES (auth.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'AUTHORIZATION_REVOKED', jsonb_build_object('source', 'CUSTOMER_OTP', 'actionId', a.id));
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
  PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer revoked an authorisation',
    jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id));
  result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationStatus', auth.status);
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN (
      'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
      'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
      'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED',
      'PAYMENT_CHANGED','GUARD_CHANGED'
    ))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.admin_guard_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_list_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_coverage_readiness_v1(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_session_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audit_list_v1(text, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_private.guard_set_billing_entitlement_v1(uuid, text, timestamptz, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_guard_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_list_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_coverage_readiness_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_audit_list_v1(text, bigint, text, text) TO service_role;

COMMIT;
