-- Guard manual checks v1 (Step 17). Additive only.
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / LIVE MONITORING DISABLED
-- Do not apply from this PR. Do not invent an APPROVED production schedule.
-- Do not enable GUARD_CHECKS_ENABLED, GUARD_ACTIVATION_ENABLED, GUARD_SUBSCRIPTIONS_ENABLED or GUARD_REFUNDS_ENABLED.
-- Do not configure Google API. Do not send customer alerts or email.
-- Do not modify already-applied migrations. Do not change Cron.

BEGIN;

ALTER TABLE admin_private.job_outbox DROP CONSTRAINT job_outbox_topic_check;
ALTER TABLE admin_private.job_outbox ADD CONSTRAINT job_outbox_topic_check
  CHECK (topic IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING','MAINTAIN_GUARD_CHECKS'));
ALTER TABLE admin_private.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE admin_private.jobs ADD CONSTRAINT jobs_type_check
  CHECK (job_type IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING','MAINTAIN_GUARD_CHECKS'));

CREATE OR REPLACE FUNCTION admin_private.enqueue_outbox_v1(
  p_event_key text, p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_available_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE created admin_private.job_outbox;
BEGIN
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 8 AND 200
    OR p_topic IS NULL OR p_topic NOT IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING','MAINTAIN_GUARD_CHECKS')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid outbox event'; END IF;
  INSERT INTO admin_private.job_outbox(event_key, topic, aggregate_type, aggregate_id, payload, available_at)
  VALUES (btrim(p_event_key), p_topic, nullif(btrim(coalesce(p_aggregate_type, '')), ''), p_aggregate_id, p_payload, coalesce(p_available_at, now()))
  RETURNING * INTO created;
  RETURN created.id;
END; $$;

CREATE TABLE public.guard_check_schedule_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  timezone text NOT NULL DEFAULT 'Europe/London',
  morning_start time NOT NULL,
  morning_end time NOT NULL,
  evening_start time NOT NULL,
  evening_end time NOT NULL,
  checks_per_day integer NOT NULL DEFAULT 2,
  includes_weekends boolean NOT NULL DEFAULT true,
  includes_bank_holidays boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  retired_at timestamptz,
  retired_by uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  CONSTRAINT guard_check_schedule_range CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT guard_check_schedule_approved_pair CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CONSTRAINT guard_check_schedule_retired_pair CHECK ((retired_at IS NULL) = (retired_by IS NULL)),
  CONSTRAINT guard_check_schedule_draft CHECK (
    status <> 'DRAFT'
    OR (
      approved_at IS NULL
      AND approved_by IS NULL
      AND retired_at IS NULL
      AND retired_by IS NULL
    )
  ),
  CONSTRAINT guard_check_schedule_approved CHECK (
    status <> 'APPROVED'
    OR (
      timezone = 'Europe/London'
      AND checks_per_day = 2
      AND includes_weekends IS TRUE
      AND includes_bank_holidays IS TRUE
      AND morning_start < morning_end
      AND evening_start < evening_end
      AND morning_end <= evening_start
      AND approved_at IS NOT NULL
      AND approved_by IS NOT NULL
      AND retired_at IS NULL
      AND retired_by IS NULL
    )
  ),
  CONSTRAINT guard_check_schedule_retired CHECK (
    status <> 'RETIRED'
    OR (retired_at IS NOT NULL AND retired_by IS NOT NULL)
  )
);

CREATE TABLE public.guard_check_obligations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  service_date date NOT NULL,
  window_code text NOT NULL CHECK (window_code IN ('MORNING','EVENING')),
  schedule_version_id uuid NOT NULL REFERENCES public.guard_check_schedule_versions(id) ON DELETE RESTRICT,
  rota_assignment_id uuid NOT NULL REFERENCES public.guard_rota_assignments(id) ON DELETE RESTRICT,
  coverage_basis text NOT NULL CHECK (coverage_basis IN ('DIRECT_GUARD','INCLUDED')),
  timezone text NOT NULL CHECK (timezone = 'Europe/London'),
  local_start time NOT NULL,
  local_end time NOT NULL,
  window_start_utc timestamptz NOT NULL,
  window_end_utc timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','CLAIMED','COMPLETED','CANCELLED')),
  first_claimed_at timestamptz,
  claimed_by uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  completed_at timestamptz,
  missed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  late boolean NOT NULL DEFAULT false,
  seconds_late integer NOT NULL DEFAULT 0 CHECK (seconds_late >= 0),
  handling_seconds integer,
  queue_wait_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  UNIQUE (coverage_id, service_date, window_code),
  CONSTRAINT guard_check_obligation_window CHECK (local_start < local_end AND window_start_utc < window_end_utc),
  CONSTRAINT guard_check_obligation_late CHECK (
    (late IS FALSE AND seconds_late = 0)
    OR (late IS TRUE AND seconds_late > 0)
  ),
  CONSTRAINT guard_check_obligation_completed CHECK (
    (state = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (state <> 'COMPLETED' AND completed_at IS NULL)
  ),
  CONSTRAINT guard_check_obligation_cancelled CHECK (
    (state = 'CANCELLED' AND cancelled_at IS NOT NULL AND char_length(btrim(cancel_reason)) BETWEEN 3 AND 200)
    OR (state <> 'CANCELLED' AND cancelled_at IS NULL)
  ),
  CONSTRAINT guard_check_obligation_claim CHECK (
    (state = 'CLAIMED' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL)
    OR (state <> 'CLAIMED' AND claimed_by IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL)
  ),
  CONSTRAINT guard_check_obligation_completed_missed CHECK (
    state <> 'COMPLETED'
    OR missed_at IS NULL
    OR (late IS TRUE AND seconds_late > 0)
  )
);

CREATE TABLE public.guard_check_obligation_events (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  obligation_id uuid NOT NULL REFERENCES public.guard_check_obligations(id) ON DELETE RESTRICT,
  actor_id uuid,
  event_type text NOT NULL,
  from_state text,
  to_state text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.guard_check_attempts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.guard_check_obligations(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  actor_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome IN ('COMPLETED','FAILED','ABANDONED')),
  failure_reason text NOT NULL DEFAULT '',
  handling_seconds integer,
  retryable boolean NOT NULL DEFAULT false,
  UNIQUE (obligation_id, attempt_number),
  CONSTRAINT guard_check_attempt_closed CHECK (
    (finished_at IS NULL AND outcome IS NULL)
    OR (finished_at IS NOT NULL AND outcome IS NOT NULL)
  )
);

CREATE TABLE public.guard_check_observations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.guard_check_obligations(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL REFERENCES public.guard_check_attempts(id) ON DELETE RESTRICT,
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  observed_at timestamptz NOT NULL,
  capture_method text NOT NULL CHECK (capture_method = 'MANUAL'),
  profile_availability text NOT NULL CHECK (profile_availability IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')),
  location_identified boolean NOT NULL,
  displayed_business_name text NOT NULL DEFAULT '',
  review_count integer CHECK (review_count IS NULL OR review_count >= 0),
  rating numeric CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  rating_available boolean NOT NULL DEFAULT false,
  latest_review_reference text NOT NULL DEFAULT '',
  latest_review_at timestamptz,
  profile_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  classification text NOT NULL CHECK (classification IN ('HEALTHY','CHANGE_DETECTED','PROFILE_UNAVAILABLE','INCOMPLETE')),
  comparison_status text NOT NULL CHECK (comparison_status IN ('COMPARED','SKIPPED','INCOMPLETE')),
  change_codes text[] NOT NULL DEFAULT '{}'::text[],
  attention_candidate boolean NOT NULL DEFAULT false,
  baseline_id uuid REFERENCES public.guard_baselines(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id),
  UNIQUE (attempt_id),
  CONSTRAINT guard_check_observation_codes CHECK (
    change_codes <@ ARRAY[
      'PROFILE_UNAVAILABLE','BUSINESS_NAME_CHANGED','REVIEW_COUNT_INCREASED','REVIEW_COUNT_DECREASED',
      'RATING_CHANGED','LATEST_REVIEW_CHANGED','BASELINE_MISSING','OBSERVATION_INCOMPLETE'
    ]::text[]
  ),
  CONSTRAINT guard_check_observation_healthy CHECK (
    classification <> 'HEALTHY'
    OR (
      profile_availability = 'AVAILABLE'
      AND location_identified IS TRUE
      AND char_length(btrim(displayed_business_name)) BETWEEN 1 AND 200
      AND review_count IS NOT NULL
      AND baseline_id IS NOT NULL
      AND comparison_status = 'COMPARED'
      AND char_length(btrim(profile_url)) BETWEEN 8 AND 500
      AND (
        (rating_available IS TRUE AND rating IS NOT NULL)
        OR (rating_available IS FALSE AND rating IS NULL)
      )
    )
  ),
  CONSTRAINT guard_check_observation_unavailable CHECK (
    classification <> 'PROFILE_UNAVAILABLE' OR profile_availability = 'UNAVAILABLE'
  ),
  CONSTRAINT guard_check_observation_rating CHECK (
    (rating_available IS TRUE AND rating IS NOT NULL)
    OR (rating_available IS FALSE AND rating IS NULL)
  ),
  CONSTRAINT guard_check_observation_change_detected CHECK (
    classification <> 'CHANGE_DETECTED'
    OR (
      baseline_id IS NOT NULL
      AND comparison_status = 'COMPARED'
      AND change_codes && ARRAY[
        'BUSINESS_NAME_CHANGED','REVIEW_COUNT_INCREASED','REVIEW_COUNT_DECREASED',
        'RATING_CHANGED','LATEST_REVIEW_CHANGED','PROFILE_UNAVAILABLE'
      ]::text[]
    )
  ),
  CONSTRAINT guard_check_observation_available_complete CHECK (
    profile_availability <> 'AVAILABLE'
    OR classification NOT IN ('HEALTHY', 'CHANGE_DETECTED')
    OR (
      location_identified IS TRUE
      AND char_length(btrim(displayed_business_name)) BETWEEN 1 AND 200
      AND review_count IS NOT NULL
      AND baseline_id IS NOT NULL
      AND comparison_status = 'COMPARED'
      AND char_length(btrim(profile_url)) BETWEEN 8 AND 500
      AND (
        (rating_available IS TRUE AND rating IS NOT NULL)
        OR (rating_available IS FALSE AND rating IS NULL)
      )
    )
  )
);

CREATE TABLE admin_private.guard_check_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.guard_check_generation_blockers (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  service_date date NOT NULL,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coverage_id, service_date, reason)
);

CREATE UNIQUE INDEX guard_check_attempts_open_uidx
  ON public.guard_check_attempts (obligation_id)
  WHERE finished_at IS NULL;

CREATE INDEX guard_check_obligations_queue_idx
  ON public.guard_check_obligations (service_date, window_code, state);

CREATE FUNCTION admin_private.guard_check_schedule_overlap_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND EXISTS (
    SELECT 1 FROM public.guard_check_schedule_versions o
    WHERE o.id <> NEW.id
      AND o.status = 'APPROVED'
      AND daterange(o.effective_from, o.effective_to, '[)') && daterange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'overlapping approved schedule';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_check_schedule_overlap
  BEFORE INSERT OR UPDATE ON public.guard_check_schedule_versions
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_schedule_overlap_v1();

CREATE FUNCTION admin_private.guard_check_schedule_facts_changed_v1(
  p_old public.guard_check_schedule_versions, p_new public.guard_check_schedule_versions
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_new.timezone IS DISTINCT FROM p_old.timezone
    OR p_new.morning_start IS DISTINCT FROM p_old.morning_start
    OR p_new.morning_end IS DISTINCT FROM p_old.morning_end
    OR p_new.evening_start IS DISTINCT FROM p_old.evening_start
    OR p_new.evening_end IS DISTINCT FROM p_old.evening_end
    OR p_new.checks_per_day IS DISTINCT FROM p_old.checks_per_day
    OR p_new.includes_weekends IS DISTINCT FROM p_old.includes_weekends
    OR p_new.includes_bank_holidays IS DISTINCT FROM p_old.includes_bank_holidays
    OR p_new.effective_from IS DISTINCT FROM p_old.effective_from
    OR p_new.approved_at IS DISTINCT FROM p_old.approved_at
    OR p_new.approved_by IS DISTINCT FROM p_old.approved_by;
$$;

CREATE FUNCTION admin_private.guard_check_schedule_protect_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status = 'RETIRED' THEN RAISE EXCEPTION 'retired schedule is immutable'; END IF;
  IF OLD.status = 'APPROVED' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'approved schedule cannot return to draft';
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status NOT IN ('DRAFT', 'APPROVED', 'RETIRED') THEN
    RAISE EXCEPTION 'invalid schedule transition';
  END IF;
  IF OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED', 'RETIRED') THEN
    RAISE EXCEPTION 'invalid schedule transition';
  END IF;
  IF OLD.status = 'APPROVED' THEN
    IF admin_private.guard_check_schedule_facts_changed_v1(OLD, NEW) THEN
      RAISE EXCEPTION 'approved schedule is immutable';
    END IF;
    IF NEW.status = 'APPROVED' AND NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
      RAISE EXCEPTION 'approved schedule is immutable';
    END IF;
    IF NEW.status = 'RETIRED' THEN
      IF NEW.effective_to IS NULL OR NEW.effective_to <= NEW.effective_from THEN
        RAISE EXCEPTION 'retired approved schedule requires effective_to after effective_from';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.guard_check_obligations o
        WHERE o.schedule_version_id = NEW.id AND o.service_date >= NEW.effective_to
      ) THEN
        RAISE EXCEPTION 'cannot shorten approved schedule before existing obligations';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_check_schedule_protect
  BEFORE UPDATE ON public.guard_check_schedule_versions
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_schedule_protect_v1();

CREATE FUNCTION admin_private.guard_check_obligation_protect_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.missed_at IS NOT NULL AND NEW.missed_at IS NULL THEN RAISE EXCEPTION 'missed_at is immutable'; END IF;
  IF OLD.late IS TRUE AND NEW.late IS FALSE THEN RAISE EXCEPTION 'late completion cannot become on-time'; END IF;
  IF OLD.seconds_late > 0 AND NEW.seconds_late < OLD.seconds_late THEN RAISE EXCEPTION 'seconds_late is monotonic'; END IF;
  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN RAISE EXCEPTION 'completed_at is immutable'; END IF;
  IF NEW.coverage_id IS DISTINCT FROM OLD.coverage_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.service_date IS DISTINCT FROM OLD.service_date
    OR NEW.window_code IS DISTINCT FROM OLD.window_code
    OR NEW.schedule_version_id IS DISTINCT FROM OLD.schedule_version_id
    OR NEW.rota_assignment_id IS DISTINCT FROM OLD.rota_assignment_id
    OR NEW.window_start_utc IS DISTINCT FROM OLD.window_start_utc
    OR NEW.window_end_utc IS DISTINCT FROM OLD.window_end_utc
  THEN RAISE EXCEPTION 'obligation identity is immutable'; END IF;
  NEW.updated_at := now();
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_check_obligation_protect
  BEFORE UPDATE ON public.guard_check_obligations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_obligation_protect_v1();

CREATE FUNCTION admin_private.guard_check_events_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'check events are immutable';
END; $$;
CREATE TRIGGER guard_check_obligation_events_immutable
  BEFORE UPDATE OR DELETE ON public.guard_check_obligation_events
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_events_immutable_v1();

CREATE FUNCTION admin_private.guard_check_attempts_protect_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'check attempts are immutable'; END IF;
  IF OLD.finished_at IS NOT NULL THEN RAISE EXCEPTION 'closed check attempts are immutable'; END IF;
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
    OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
  THEN
    RAISE EXCEPTION 'attempt identity is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_check_attempts_protect
  BEFORE UPDATE OR DELETE ON public.guard_check_attempts
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_attempts_protect_v1();

CREATE FUNCTION admin_private.guard_check_observations_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'check observations are immutable';
END; $$;
CREATE TRIGGER guard_check_observations_immutable
  BEFORE UPDATE OR DELETE ON public.guard_check_observations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_observations_immutable_v1();

CREATE FUNCTION admin_private.guard_check_obligation_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages;
  rota public.guard_rota_assignments;
  sched public.guard_check_schedule_versions;
  expected_start time;
  expected_end time;
  expected_start_utc timestamptz;
  expected_end_utc timestamptz;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NEW.coverage_id;
  IF cov.id IS NULL THEN RAISE EXCEPTION 'obligation coverage does not exist'; END IF;
  IF NEW.customer_id IS DISTINCT FROM cov.customer_id
    OR NEW.business_id IS DISTINCT FROM cov.business_id
    OR NEW.location_id IS DISTINCT FROM cov.location_id
    OR NEW.coverage_basis IS DISTINCT FROM cov.coverage_basis
  THEN RAISE EXCEPTION 'obligation coverage scope mismatch'; END IF;
  SELECT * INTO rota FROM public.guard_rota_assignments WHERE id = NEW.rota_assignment_id;
  IF rota.id IS NULL OR rota.coverage_id IS DISTINCT FROM NEW.coverage_id THEN
    RAISE EXCEPTION 'obligation rota does not belong to coverage';
  END IF;
  IF TG_OP = 'INSERT' AND rota.status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'obligation rota is not active';
  END IF;
  SELECT * INTO sched FROM public.guard_check_schedule_versions WHERE id = NEW.schedule_version_id;
  IF sched.id IS NULL THEN RAISE EXCEPTION 'obligation schedule does not exist'; END IF;
  IF TG_OP = 'INSERT' AND (
    sched.status IS DISTINCT FROM 'APPROVED'
    OR sched.effective_from > NEW.service_date
    OR (sched.effective_to IS NOT NULL AND NEW.service_date >= sched.effective_to)
  ) THEN
    RAISE EXCEPTION 'obligation schedule is not an approved applicable version';
  END IF;
  IF NEW.timezone IS DISTINCT FROM sched.timezone THEN RAISE EXCEPTION 'obligation timezone mismatch'; END IF;
  IF NEW.window_code = 'MORNING' THEN
    expected_start := sched.morning_start;
    expected_end := sched.morning_end;
  ELSE
    expected_start := sched.evening_start;
    expected_end := sched.evening_end;
  END IF;
  IF NEW.local_start IS DISTINCT FROM expected_start OR NEW.local_end IS DISTINCT FROM expected_end THEN
    RAISE EXCEPTION 'obligation schedule window mismatch';
  END IF;
  expected_start_utc := admin_private.guard_local_window_utc_v1(NEW.service_date, NEW.local_start, NEW.timezone);
  expected_end_utc := admin_private.guard_local_window_utc_v1(NEW.service_date, NEW.local_end, NEW.timezone);
  IF NEW.window_start_utc IS DISTINCT FROM expected_start_utc
    OR NEW.window_end_utc IS DISTINCT FROM expected_end_utc
  THEN RAISE EXCEPTION 'obligation utc window mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_check_obligation_scope
  BEFORE INSERT OR UPDATE ON public.guard_check_obligations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_obligation_scope_v1();

CREATE FUNCTION admin_private.guard_check_observation_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  obl public.guard_check_obligations;
  attempt public.guard_check_attempts;
  baseline public.guard_baselines;
BEGIN
  SELECT * INTO attempt FROM public.guard_check_attempts WHERE id = NEW.attempt_id;
  IF attempt.id IS NULL THEN RAISE EXCEPTION 'observation attempt does not exist'; END IF;
  IF attempt.obligation_id IS DISTINCT FROM NEW.obligation_id THEN
    RAISE EXCEPTION 'observation attempt obligation mismatch';
  END IF;
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = NEW.obligation_id;
  IF obl.id IS NULL THEN RAISE EXCEPTION 'observation obligation does not exist'; END IF;
  IF NEW.coverage_id IS DISTINCT FROM obl.coverage_id THEN RAISE EXCEPTION 'observation coverage mismatch'; END IF;
  IF NEW.location_id IS DISTINCT FROM obl.location_id THEN RAISE EXCEPTION 'observation location mismatch'; END IF;
  IF NEW.baseline_id IS NOT NULL THEN
    SELECT * INTO baseline FROM public.guard_baselines WHERE id = NEW.baseline_id;
    IF baseline.id IS NULL
      OR baseline.coverage_id IS DISTINCT FROM NEW.coverage_id
      OR baseline.location_id IS DISTINCT FROM NEW.location_id
      OR baseline.status IS DISTINCT FROM 'VERIFIED'
      OR baseline.profile_availability IS DISTINCT FROM 'AVAILABLE'
    THEN RAISE EXCEPTION 'observation baseline is not the verified available baseline'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_check_observation_scope
  BEFORE INSERT ON public.guard_check_observations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_check_observation_scope_v1();

CREATE FUNCTION admin_private.guard_coverage_inactive_at_v1(p_cov public.guard_coverages)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_cov.state = 'PAUSED' THEN p_cov.paused_at
    WHEN p_cov.state = 'ENDING' THEN coalesce(p_cov.ending_at, p_cov.paused_at)
    WHEN p_cov.state = 'ENDED' THEN coalesce(p_cov.ended_at, p_cov.ending_at, p_cov.paused_at)
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.guard_check_actual_change_codes_v1(p_codes text[])
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(array_agg(code), ARRAY[]::text[])
  FROM unnest(coalesce(p_codes, ARRAY[]::text[])) AS code
  WHERE code NOT IN ('BASELINE_MISSING', 'OBSERVATION_INCOMPLETE');
$$;

CREATE FUNCTION admin_private.guard_check_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text) RETURNS jsonb
LANGUAGE sql SET search_path='' AS $$
  SELECT result FROM admin_private.guard_check_receipts
  WHERE request_id = p_request AND actor_id = p_actor AND fingerprint = p_fingerprint;
$$;

CREATE FUNCTION admin_private.guard_check_store_receipt_v1(p_request uuid, p_actor uuid, p_fingerprint text, p_result jsonb) RETURNS void
LANGUAGE sql SET search_path='' AS $$
  INSERT INTO admin_private.guard_check_receipts VALUES (p_request, p_actor, p_fingerprint, p_result, now());
$$;

CREATE FUNCTION admin_private.guard_check_append_event_v1(
  p_obligation uuid, p_actor uuid, p_type text, p_from text, p_to text, p_details jsonb
) RETURNS void LANGUAGE sql SET search_path='' AS $$
  INSERT INTO public.guard_check_obligation_events(obligation_id, actor_id, event_type, from_state, to_state, details)
  VALUES (p_obligation, p_actor, p_type, p_from, p_to, coalesce(p_details, '{}'::jsonb));
$$;

CREATE FUNCTION admin_private.guard_check_claim_lease_v1() RETURNS interval
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT interval '2 hours';
$$;

CREATE FUNCTION admin_private.guard_resolve_schedule_v1(p_service_date date)
RETURNS public.guard_check_schedule_versions
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row public.guard_check_schedule_versions;
BEGIN
  SELECT * INTO row
  FROM public.guard_check_schedule_versions
  WHERE status = 'APPROVED'
    AND effective_from <= p_service_date
    AND (effective_to IS NULL OR effective_to > p_service_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  RETURN row;
END; $$;

CREATE FUNCTION admin_private.guard_local_window_utc_v1(p_service_date date, p_local time, p_timezone text)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT ((p_service_date + p_local)::timestamp AT TIME ZONE p_timezone);
$$;

CREATE FUNCTION admin_private.guard_close_open_attempt_v1(
  p_obligation uuid, p_outcome text, p_reason text, p_retryable boolean, p_now timestamptz
) RETURNS public.guard_check_attempts
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE attempt public.guard_check_attempts;
BEGIN
  SELECT * INTO attempt FROM public.guard_check_attempts
  WHERE obligation_id = p_obligation AND finished_at IS NULL
  FOR UPDATE;
  IF attempt.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.guard_check_attempts
    SET finished_at = p_now,
        outcome = p_outcome,
        failure_reason = coalesce(p_reason, ''),
        retryable = coalesce(p_retryable, false),
        handling_seconds = greatest(0, floor(extract(epoch FROM p_now - started_at))::int)
    WHERE id = attempt.id
    RETURNING * INTO attempt;
  RETURN attempt;
END; $$;

CREATE FUNCTION admin_private.guard_check_insert_window_v1(
  p_cov public.guard_coverages,
  p_rota public.guard_rota_assignments,
  p_sched public.guard_check_schedule_versions,
  p_service date,
  p_window text,
  p_local_start time,
  p_local_end time,
  p_start_utc timestamptz,
  p_end_utc timestamptz
) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE inserted integer := 0;
BEGIN
  INSERT INTO public.guard_check_obligations(
    coverage_id, customer_id, business_id, location_id, service_date, window_code,
    schedule_version_id, rota_assignment_id, coverage_basis, timezone,
    local_start, local_end, window_start_utc, window_end_utc
  ) VALUES (
    p_cov.id, p_cov.customer_id, p_cov.business_id, p_cov.location_id, p_service, p_window,
    p_sched.id, p_rota.id, p_cov.coverage_basis, p_sched.timezone,
    p_local_start, p_local_end, p_start_utc, p_end_utc
  ) ON CONFLICT (coverage_id, service_date, window_code) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END; $$;

CREATE FUNCTION public.guard_maintain_checks_v1(p_now timestamptz DEFAULT NULL, p_service_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  clock timestamptz;
  service date;
  sched public.guard_check_schedule_versions;
  generated integer := 0;
  expired integer := 0;
  missed integer := 0;
  cancelled integer := 0;
  blocked integer := 0;
  cov public.guard_coverages;
  rota public.guard_rota_assignments;
  morning_start timestamptz;
  morning_end timestamptz;
  evening_start timestamptz;
  evening_end timestamptz;
  abandoned public.guard_check_attempts;
  obl public.guard_check_obligations;
  inactive_at timestamptz;
  prev_state text;
BEGIN
  clock := coalesce(p_now, now());
  service := coalesce(p_service_date, (timezone('Europe/London', clock))::date);
  sched := admin_private.guard_resolve_schedule_v1(service);
  IF sched.id IS NULL THEN
    RETURN jsonb_build_object('status','denied','reason','schedule_not_configured','serviceDate', service);
  END IF;
  morning_start := admin_private.guard_local_window_utc_v1(service, sched.morning_start, sched.timezone);
  morning_end := admin_private.guard_local_window_utc_v1(service, sched.morning_end, sched.timezone);
  evening_start := admin_private.guard_local_window_utc_v1(service, sched.evening_start, sched.timezone);
  evening_end := admin_private.guard_local_window_utc_v1(service, sched.evening_end, sched.timezone);
  FOR cov IN
    SELECT * FROM public.guard_coverages WHERE state = 'ACTIVE'
  LOOP
    SELECT * INTO rota FROM public.guard_rota_assignments
    WHERE coverage_id = cov.id AND status = 'ACTIVE';
    IF rota.id IS NULL THEN CONTINUE; END IF;
    IF cov.coverage_basis = 'INCLUDED' AND cov.included_end_at IS NULL THEN
      INSERT INTO admin_private.guard_check_generation_blockers(coverage_id, service_date, reason, details)
      VALUES (cov.id, service, 'included_end_missing', jsonb_build_object('coverageId', cov.id, 'serviceDate', service))
      ON CONFLICT (coverage_id, service_date, reason) DO UPDATE
        SET details = excluded.details, created_at = clock;
      blocked := blocked + 1;
      CONTINUE;
    END IF;
    IF cov.coverage_basis <> 'INCLUDED' OR morning_start < cov.included_end_at THEN
      generated := generated + admin_private.guard_check_insert_window_v1(
        cov, rota, sched, service, 'MORNING', sched.morning_start, sched.morning_end, morning_start, morning_end
      );
    END IF;
    IF cov.coverage_basis <> 'INCLUDED' OR evening_start < cov.included_end_at THEN
      generated := generated + admin_private.guard_check_insert_window_v1(
        cov, rota, sched, service, 'EVENING', sched.evening_start, sched.evening_end, evening_start, evening_end
      );
    END IF;
  END LOOP;

  FOR obl IN
    SELECT o.* FROM public.guard_check_obligations o
    JOIN public.guard_coverages g ON g.id = o.coverage_id
    WHERE o.state IN ('PENDING', 'CLAIMED')
      AND g.state <> 'ACTIVE'
      AND admin_private.guard_coverage_inactive_at_v1(g) IS NOT NULL
      AND admin_private.guard_coverage_inactive_at_v1(g) < o.window_start_utc
  LOOP
    prev_state := obl.state;
    IF obl.state = 'CLAIMED' THEN
      PERFORM admin_private.guard_close_open_attempt_v1(obl.id, 'ABANDONED', 'coverage_not_active_before_window', false, clock);
    END IF;
    UPDATE public.guard_check_obligations
      SET state = 'CANCELLED',
          cancelled_at = clock,
          cancel_reason = 'coverage_not_active_before_window',
          claimed_by = NULL,
          claimed_at = NULL,
          claim_expires_at = NULL
      WHERE id = obl.id AND state IN ('PENDING', 'CLAIMED');
    PERFORM admin_private.guard_check_append_event_v1(obl.id, NULL, 'CANCELLED', prev_state, 'CANCELLED',
      jsonb_build_object('reason','coverage_not_active_before_window'));
    cancelled := cancelled + 1;
  END LOOP;

  FOR obl IN
    SELECT * FROM public.guard_check_obligations
    WHERE state = 'CLAIMED' AND claim_expires_at IS NOT NULL AND claim_expires_at <= clock
  LOOP
    abandoned := admin_private.guard_close_open_attempt_v1(obl.id, 'ABANDONED', 'claim_expired', true, clock);
    UPDATE public.guard_check_obligations
      SET state = 'PENDING', claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL
      WHERE id = obl.id;
    PERFORM admin_private.guard_check_append_event_v1(obl.id, NULL, 'CLAIM_EXPIRED', 'CLAIMED', 'PENDING',
      jsonb_build_object('attemptId', abandoned.id));
    expired := expired + 1;
  END LOOP;

  UPDATE public.guard_check_obligations
    SET missed_at = window_end_utc
    WHERE missed_at IS NULL
      AND completed_at IS NULL
      AND state <> 'CANCELLED'
      AND window_end_utc < clock;
  GET DIAGNOSTICS missed = ROW_COUNT;

  FOR obl IN
    SELECT o.* FROM public.guard_check_obligations o
    JOIN public.guard_coverages g ON g.id = o.coverage_id
    WHERE o.state = 'PENDING' AND g.state <> 'ACTIVE'
  LOOP
    UPDATE public.guard_check_obligations
      SET state = 'CANCELLED', cancelled_at = clock, cancel_reason = 'coverage_not_active'
      WHERE id = obl.id AND state = 'PENDING';
    PERFORM admin_private.guard_check_append_event_v1(obl.id, NULL, 'CANCELLED', 'PENDING', 'CANCELLED',
      jsonb_build_object('reason','coverage_not_active'));
    cancelled := cancelled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status','success','serviceDate', service, 'generated', generated,
    'expiredClaims', expired, 'markedMissed', missed, 'cancelled', cancelled,
    'includedEndMissing', blocked, 'scheduleVersionId', sched.id
  );
END; $$;

CREATE FUNCTION public.guard_enqueue_daily_checks_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  service date;
  outbox uuid;
BEGIN
  service := (timezone('Europe/London', now()))::date;
  outbox := admin_private.enqueue_outbox_v1(
    'maintain-guard-checks:' || service::text, 'MAINTAIN_GUARD_CHECKS', 'guard_check', NULL,
    jsonb_build_object('serviceDate', service), now()
  );
  RETURN jsonb_build_object('status','success','serviceDate', service, 'outboxId', outbox, 'duplicate', false);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status','success','serviceDate', service, 'duplicate', true);
END; $$;

CREATE FUNCTION admin_private.guard_check_claim_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  obl public.guard_check_obligations;
  cov public.guard_coverages;
  attempt public.guard_check_attempts;
  next_number integer;
BEGIN
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = (p_payload->>'obligationId')::uuid FOR UPDATE;
  IF obl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM obl.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF p_now < obl.window_start_utc THEN RETURN jsonb_build_object('status','denied','reason','window_not_open'); END IF;
  IF obl.state IN ('COMPLETED','CANCELLED') THEN RETURN jsonb_build_object('status','denied','reason','not_claimable'); END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = obl.coverage_id;
  IF cov.state <> 'ACTIVE' THEN RETURN jsonb_build_object('status','denied','reason','coverage_not_active'); END IF;
  IF obl.state = 'CLAIMED' AND obl.claimed_by = p_actor AND obl.claim_expires_at > p_now THEN
    RETURN jsonb_build_object('status','success','id', obl.id, 'version', obl.record_version, 'attemptId', (
      SELECT id FROM public.guard_check_attempts WHERE obligation_id = obl.id AND finished_at IS NULL
    ));
  END IF;
  IF obl.state = 'CLAIMED' AND obl.claim_expires_at > p_now THEN
    RETURN jsonb_build_object('status','denied','reason','already_claimed');
  END IF;
  IF obl.state = 'CLAIMED' AND obl.claim_expires_at <= p_now THEN
    PERFORM admin_private.guard_close_open_attempt_v1(obl.id, 'ABANDONED', 'claim_expired', true, p_now);
    UPDATE public.guard_check_obligations
      SET state = 'PENDING', claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL
      WHERE id = obl.id;
    SELECT * INTO obl FROM public.guard_check_obligations WHERE id = obl.id;
  END IF;
  SELECT coalesce(max(attempt_number), 0) + 1 INTO next_number FROM public.guard_check_attempts WHERE obligation_id = obl.id;
  UPDATE public.guard_check_obligations
    SET state = 'CLAIMED',
        claimed_by = p_actor,
        claimed_at = p_now,
        claim_expires_at = p_now + admin_private.guard_check_claim_lease_v1(),
        first_claimed_at = coalesce(first_claimed_at, p_now),
        attempt_count = next_number
    WHERE id = obl.id AND state = 'PENDING'
    RETURNING * INTO obl;
  IF obl.id IS NULL THEN
    RETURN jsonb_build_object('status','denied','reason','already_claimed');
  END IF;
  INSERT INTO public.guard_check_attempts(obligation_id, attempt_number, actor_id, started_at)
    VALUES (obl.id, next_number, p_actor, p_now)
    RETURNING * INTO attempt;
  PERFORM admin_private.guard_check_append_event_v1(obl.id, p_actor, 'CLAIMED', 'PENDING', 'CLAIMED',
    jsonb_build_object('attemptId', attempt.id, 'attemptNumber', attempt.attempt_number));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', obl.id, p_request, 'guard_check_obligation',
    'Claimed Guard check', jsonb_build_object('windowCode', obl.window_code, 'serviceDate', obl.service_date));
  RETURN jsonb_build_object('status','success','id', obl.id, 'version', obl.record_version, 'attemptId', attempt.id);
END; $$;

CREATE FUNCTION admin_private.guard_check_release_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  obl public.guard_check_obligations;
  attempt public.guard_check_attempts;
BEGIN
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = (p_payload->>'obligationId')::uuid FOR UPDATE;
  IF obl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM obl.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF obl.state <> 'CLAIMED' OR obl.claimed_by IS DISTINCT FROM p_actor THEN
    RETURN jsonb_build_object('status','denied','reason','not_owner');
  END IF;
  IF obl.claim_expires_at IS NULL OR obl.claim_expires_at <= p_now THEN
    RETURN jsonb_build_object('status','denied','reason','claim_expired');
  END IF;
  attempt := admin_private.guard_close_open_attempt_v1(obl.id, 'ABANDONED', coalesce(p_payload->>'reason','released'), true, p_now);
  UPDATE public.guard_check_obligations
    SET state = 'PENDING', claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL
    WHERE id = obl.id
    RETURNING * INTO obl;
  PERFORM admin_private.guard_check_append_event_v1(obl.id, p_actor, 'RELEASED', 'CLAIMED', 'PENDING',
    jsonb_build_object('attemptId', attempt.id));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', obl.id, p_request, 'guard_check_obligation',
    'Released Guard check claim', jsonb_build_object('attemptId', attempt.id));
  RETURN jsonb_build_object('status','success','id', obl.id, 'version', obl.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_check_fail_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  obl public.guard_check_obligations;
  attempt public.guard_check_attempts;
  reason text;
BEGIN
  reason := btrim(coalesce(p_payload->>'reason', ''));
  IF char_length(reason) NOT BETWEEN 10 AND 200 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = (p_payload->>'obligationId')::uuid FOR UPDATE;
  IF obl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM obl.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF obl.state <> 'CLAIMED' OR obl.claimed_by IS DISTINCT FROM p_actor THEN
    RETURN jsonb_build_object('status','denied','reason','not_owner');
  END IF;
  IF obl.claim_expires_at IS NULL OR obl.claim_expires_at <= p_now THEN
    RETURN jsonb_build_object('status','denied','reason','claim_expired');
  END IF;
  attempt := admin_private.guard_close_open_attempt_v1(obl.id, 'FAILED', reason, true, p_now);
  UPDATE public.guard_check_obligations
    SET state = 'PENDING',
        claimed_by = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        retry_count = retry_count + 1
    WHERE id = obl.id
    RETURNING * INTO obl;
  PERFORM admin_private.guard_check_append_event_v1(obl.id, p_actor, 'FAILED', 'CLAIMED', 'PENDING',
    jsonb_build_object('attemptId', attempt.id, 'reason', reason));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', obl.id, p_request, 'guard_check_obligation',
    'Recorded retryable Guard check failure', jsonb_build_object('attemptId', attempt.id));
  RETURN jsonb_build_object('status','success','id', obl.id, 'version', obl.record_version, 'attemptId', attempt.id);
END; $$;

CREATE FUNCTION admin_private.guard_check_cancel_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  obl public.guard_check_obligations;
  cov public.guard_coverages;
  reason text;
  prev_state text;
BEGIN
  reason := btrim(coalesce(p_payload->>'reason', 'coverage_not_active'));
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = (p_payload->>'obligationId')::uuid FOR UPDATE;
  IF obl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM obl.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF obl.state = 'COMPLETED' THEN RETURN jsonb_build_object('status','denied','reason','already_completed'); END IF;
  IF obl.state = 'CANCELLED' THEN RETURN jsonb_build_object('status','success','id', obl.id, 'version', obl.record_version); END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = obl.coverage_id;
  IF cov.state = 'ACTIVE' THEN
    RETURN jsonb_build_object('status','denied','reason','coverage_still_active');
  END IF;
  prev_state := obl.state;
  IF obl.state = 'CLAIMED' THEN
    PERFORM admin_private.guard_close_open_attempt_v1(obl.id, 'ABANDONED', reason, false, p_now);
  END IF;
  UPDATE public.guard_check_obligations
    SET state = 'CANCELLED',
        cancelled_at = p_now,
        cancel_reason = left(reason, 200),
        claimed_by = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL
    WHERE id = obl.id
    RETURNING * INTO obl;
  PERFORM admin_private.guard_check_append_event_v1(obl.id, p_actor, 'CANCELLED', prev_state, 'CANCELLED',
    jsonb_build_object('reason', reason));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', obl.id, p_request, 'guard_check_obligation',
    'Cancelled Guard check', jsonb_build_object('reason', reason));
  RETURN jsonb_build_object('status','success','id', obl.id, 'version', obl.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_check_compare_v1(
  p_baseline public.guard_baselines,
  p_availability text,
  p_name text,
  p_reviews integer,
  p_rating numeric,
  p_rating_available boolean,
  p_latest_ref text,
  p_latest_at timestamptz
) RETURNS text[] LANGUAGE plpgsql SET search_path='' AS $$
DECLARE codes text[] := ARRAY[]::text[];
BEGIN
  IF p_baseline.id IS NULL THEN
    RETURN ARRAY['BASELINE_MISSING']::text[];
  END IF;
  IF p_availability = 'UNAVAILABLE' THEN codes := array_append(codes, 'PROFILE_UNAVAILABLE'); END IF;
  IF char_length(btrim(coalesce(p_name, ''))) > 0
    AND btrim(p_name) IS DISTINCT FROM btrim(p_baseline.displayed_business_name)
  THEN
    codes := array_append(codes, 'BUSINESS_NAME_CHANGED');
  END IF;
  IF p_reviews IS NOT NULL AND p_baseline.review_count IS NOT NULL AND p_reviews > p_baseline.review_count THEN
    codes := array_append(codes, 'REVIEW_COUNT_INCREASED');
  END IF;
  IF p_reviews IS NOT NULL AND p_baseline.review_count IS NOT NULL AND p_reviews < p_baseline.review_count THEN
    codes := array_append(codes, 'REVIEW_COUNT_DECREASED');
  END IF;
  IF p_rating_available IS TRUE AND p_rating IS NOT NULL AND p_baseline.rating IS NOT NULL AND p_rating IS DISTINCT FROM p_baseline.rating THEN
    codes := array_append(codes, 'RATING_CHANGED');
  END IF;
  IF (
    char_length(btrim(coalesce(p_latest_ref, ''))) > 0
    OR p_latest_at IS NOT NULL
  ) AND (
    btrim(coalesce(p_latest_ref, '')) IS DISTINCT FROM coalesce(p_baseline.latest_review_reference, '')
    OR p_latest_at IS DISTINCT FROM p_baseline.latest_review_at
  ) THEN
    codes := array_append(codes, 'LATEST_REVIEW_CHANGED');
  END IF;
  RETURN codes;
END; $$;

CREATE FUNCTION admin_private.guard_check_complete_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_version integer, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  obl public.guard_check_obligations;
  cov public.guard_coverages;
  attempt public.guard_check_attempts;
  baseline public.guard_baselines;
  classification text;
  availability text;
  location_ok boolean;
  name text;
  reviews integer;
  rating numeric;
  rating_available boolean;
  latest_ref text;
  latest_at timestamptz;
  profile_url text;
  notes text;
  requested_baseline uuid;
  codes text[];
  comparison text;
  available_complete boolean;
  is_late boolean;
  v_seconds_late integer;
  v_handling integer;
  v_queue_wait integer;
  obs public.guard_check_observations;
BEGIN
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = (p_payload->>'obligationId')::uuid FOR UPDATE;
  IF obl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM obl.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF obl.state <> 'CLAIMED' OR obl.claimed_by IS DISTINCT FROM p_actor THEN
    RETURN jsonb_build_object('status','denied','reason','not_owner');
  END IF;
  IF p_now < obl.window_start_utc THEN RETURN jsonb_build_object('status','denied','reason','window_not_open'); END IF;
  IF obl.claim_expires_at IS NULL OR obl.claim_expires_at <= p_now THEN
    RETURN jsonb_build_object('status','denied','reason','claim_expired');
  END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = obl.coverage_id;
  IF cov.state <> 'ACTIVE' THEN RETURN jsonb_build_object('status','denied','reason','coverage_not_active'); END IF;
  IF EXISTS (SELECT 1 FROM public.guard_check_observations WHERE obligation_id = obl.id) THEN
    RETURN jsonb_build_object('status','denied','reason','already_observed');
  END IF;
  SELECT * INTO attempt FROM public.guard_check_attempts
  WHERE obligation_id = obl.id AND finished_at IS NULL AND actor_id = p_actor
  FOR UPDATE;
  IF attempt.id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','no_active_attempt'); END IF;

  classification := p_payload->>'classification';
  availability := p_payload->>'profileAvailability';
  location_ok := (p_payload->>'locationIdentified')::boolean;
  name := btrim(coalesce(p_payload->>'displayedBusinessName', ''));
  reviews := NULLIF(p_payload->>'reviewCount', '')::integer;
  rating := NULLIF(p_payload->>'rating', '')::numeric;
  rating_available := coalesce((p_payload->>'ratingAvailable')::boolean, false);
  latest_ref := btrim(coalesce(p_payload->>'latestReviewReference', ''));
  latest_at := NULLIF(p_payload->>'latestReviewAt', '')::timestamptz;
  profile_url := btrim(coalesce(p_payload->>'profileUrl', ''));
  notes := coalesce(p_payload->>'notes', '');
  requested_baseline := NULLIF(p_payload->>'baselineId', '')::uuid;
  IF classification NOT IN ('HEALTHY','CHANGE_DETECTED','PROFILE_UNAVAILABLE','INCOMPLETE')
    OR availability NOT IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')
    OR location_ok IS NULL
    OR char_length(notes) > 2000
    OR (rating_available IS TRUE AND rating IS NULL)
    OR (rating_available IS FALSE AND rating IS NOT NULL)
  THEN RETURN jsonb_build_object('status','invalid'); END IF;

  SELECT * INTO baseline FROM public.guard_baselines
  WHERE coverage_id = obl.coverage_id AND location_id = obl.location_id AND status = 'VERIFIED';
  IF requested_baseline IS NOT NULL AND (baseline.id IS NULL OR baseline.id IS DISTINCT FROM requested_baseline) THEN
    RETURN jsonb_build_object('status','denied','reason','baseline_location_mismatch');
  END IF;

  available_complete := (
    location_ok IS TRUE
    AND char_length(name) BETWEEN 1 AND 200
    AND reviews IS NOT NULL
    AND baseline.id IS NOT NULL
    AND char_length(profile_url) BETWEEN 8 AND 500
    AND (
      (rating_available IS TRUE AND rating IS NOT NULL)
      OR (rating_available IS FALSE AND rating IS NULL)
    )
  );
  IF classification = 'CHANGE_DETECTED' AND baseline.id IS NULL THEN
    RETURN jsonb_build_object('status','denied','reason','change_requires_baseline');
  END IF;
  IF classification IN ('HEALTHY', 'CHANGE_DETECTED') AND availability = 'AVAILABLE' AND available_complete IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'status','denied',
      'reason', CASE WHEN classification = 'HEALTHY' THEN 'incomplete_not_healthy' ELSE 'incomplete_not_comparable' END
    );
  END IF;

  codes := admin_private.guard_check_compare_v1(baseline, availability, name, reviews, rating, rating_available, latest_ref, latest_at);
  IF classification = 'HEALTHY' THEN
    IF availability <> 'AVAILABLE' OR available_complete IS NOT TRUE THEN
      RETURN jsonb_build_object('status','denied','reason','incomplete_not_healthy'); END IF;
    IF availability = 'UNAVAILABLE' THEN RETURN jsonb_build_object('status','denied','reason','unavailable_not_healthy'); END IF;
    IF baseline.id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','baseline_missing'); END IF;
    IF codes <> '{}'::text[] THEN RETURN jsonb_build_object('status','denied','reason','changes_not_healthy'); END IF;
    comparison := 'COMPARED';
  ELSIF classification = 'PROFILE_UNAVAILABLE' THEN
    IF availability <> 'UNAVAILABLE' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    comparison := CASE WHEN baseline.id IS NULL THEN 'INCOMPLETE' ELSE 'COMPARED' END;
  ELSIF classification = 'CHANGE_DETECTED' THEN
    IF baseline.id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','change_requires_baseline'); END IF;
    codes := admin_private.guard_check_actual_change_codes_v1(codes);
    IF codes = '{}'::text[] THEN RETURN jsonb_build_object('status','denied','reason','change_requires_comparison'); END IF;
    comparison := 'COMPARED';
  ELSE
    IF NOT ('OBSERVATION_INCOMPLETE' = ANY (codes)) THEN codes := array_append(codes, 'OBSERVATION_INCOMPLETE'); END IF;
    comparison := 'INCOMPLETE';
  END IF;

  is_late := p_now > obl.window_end_utc;
  v_seconds_late := CASE WHEN is_late THEN greatest(1, floor(extract(epoch FROM p_now - obl.window_end_utc))::int) ELSE 0 END;
  v_handling := greatest(0, floor(extract(epoch FROM p_now - attempt.started_at))::int);
  v_queue_wait := CASE WHEN obl.first_claimed_at IS NULL THEN NULL
    ELSE greatest(0, floor(extract(epoch FROM obl.first_claimed_at - obl.window_start_utc))::int) END;

  INSERT INTO public.guard_check_observations(
    obligation_id, attempt_id, coverage_id, location_id, observed_at, capture_method,
    profile_availability, location_identified, displayed_business_name, review_count, rating, rating_available,
    latest_review_reference, latest_review_at, profile_url, notes, classification, comparison_status,
    change_codes, attention_candidate, baseline_id
  ) VALUES (
    obl.id, attempt.id, obl.coverage_id, obl.location_id, p_now, 'MANUAL',
    availability, location_ok, name, reviews, rating, rating_available,
    latest_ref, latest_at, profile_url, notes, classification, comparison,
    codes, (classification <> 'HEALTHY' OR codes <> '{}'::text[]), baseline.id
  ) RETURNING * INTO obs;

  UPDATE public.guard_check_attempts
    SET finished_at = p_now, outcome = 'COMPLETED', handling_seconds = v_handling
    WHERE id = attempt.id;
  UPDATE public.guard_check_obligations
    SET state = 'COMPLETED',
        completed_at = p_now,
        claimed_by = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        late = is_late,
        seconds_late = v_seconds_late,
        handling_seconds = v_handling,
        queue_wait_seconds = v_queue_wait,
        missed_at = CASE WHEN is_late THEN coalesce(missed_at, obl.window_end_utc) ELSE missed_at END
    WHERE id = obl.id
    RETURNING * INTO obl;
  PERFORM admin_private.guard_check_append_event_v1(obl.id, p_actor, 'COMPLETED', 'CLAIMED', 'COMPLETED',
    jsonb_build_object('observationId', obs.id, 'classification', classification, 'late', is_late));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', obl.id, p_request, 'guard_check_obligation',
    'Completed Guard check', jsonb_build_object('observationId', obs.id, 'classification', classification, 'late', is_late));
  RETURN jsonb_build_object(
    'status','success','id', obl.id, 'version', obl.record_version,
    'observationId', obs.id, 'late', is_late, 'secondsLate', v_seconds_late, 'handlingSeconds', v_handling
  );
END; $$;

CREATE FUNCTION public.admin_guard_check_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer, p_now timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; fp text; cached jsonb; result jsonb; clock timestamptz;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  clock := coalesce(p_now, now());
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN ('claim','release','fail','complete','cancel')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  fp := md5(jsonb_build_array(p_operation, p_payload, p_version)::text);
  cached := admin_private.guard_check_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  result := CASE p_operation
    WHEN 'claim' THEN admin_private.guard_check_claim_v1(actor, p_request, p_payload, p_version, clock)
    WHEN 'release' THEN admin_private.guard_check_release_v1(actor, p_request, p_payload, p_version, clock)
    WHEN 'fail' THEN admin_private.guard_check_fail_v1(actor, p_request, p_payload, p_version, clock)
    WHEN 'complete' THEN admin_private.guard_check_complete_v1(actor, p_request, p_payload, p_version, clock)
    WHEN 'cancel' THEN admin_private.guard_check_cancel_v1(actor, p_request, p_payload, p_version, clock)
  END;
  IF result IS NULL THEN result := jsonb_build_object('status','invalid'); END IF;
  PERFORM admin_private.guard_check_store_receipt_v1(p_request, actor, fp, result);
  RETURN result;
END; $$;

CREATE FUNCTION admin_private.guard_check_obligation_json_v1(p_id uuid, p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'coverageId', o.coverage_id,
    'locationId', o.location_id,
    'customerName', c.full_name,
    'businessName', b.display_name,
    'locationName', loc.location_name,
    'coverageBasis', o.coverage_basis,
    'coverageState', g.state,
    'serviceDate', o.service_date,
    'windowCode', o.window_code,
    'state', o.state,
    'timezone', o.timezone,
    'localStart', o.local_start,
    'localEnd', o.local_end,
    'windowStartAt', o.window_start_utc,
    'windowEndAt', o.window_end_utc,
    'windowOpen', o.window_start_utc <= p_now,
    'upcoming', o.window_start_utc > p_now AND o.state NOT IN ('COMPLETED', 'CANCELLED'),
    'claimedBy', o.claimed_by,
    'claimedAt', o.claimed_at,
    'claimExpiresAt', o.claim_expires_at,
    'firstClaimedAt', o.first_claimed_at,
    'completedAt', o.completed_at,
    'missedAt', o.missed_at,
    'late', o.late,
    'secondsLate', o.seconds_late,
    'handlingSeconds', o.handling_seconds,
    'queueWaitSeconds', o.queue_wait_seconds,
    'attemptCount', o.attempt_count,
    'retryCount', o.retry_count,
    'version', o.record_version,
    'baselineAvailable', EXISTS (
      SELECT 1 FROM public.guard_baselines base
      WHERE base.coverage_id = o.coverage_id AND base.location_id = o.location_id AND base.status = 'VERIFIED'
    ),
    'previousObservation', (
      SELECT jsonb_build_object(
        'id', prev.id, 'classification', prev.classification, 'observedAt', prev.observed_at,
        'displayedBusinessName', prev.displayed_business_name, 'reviewCount', prev.review_count
      )
      FROM public.guard_check_observations prev
      JOIN public.guard_check_obligations po ON po.id = prev.obligation_id
      WHERE po.coverage_id = o.coverage_id AND po.state = 'COMPLETED' AND po.id <> o.id
      ORDER BY prev.observed_at DESC
      LIMIT 1
    )
  )
  FROM public.guard_check_obligations o
  JOIN public.customers c ON c.id = o.customer_id
  JOIN public.businesses b ON b.id = o.business_id
  JOIN public.locations loc ON loc.id = o.location_id
  JOIN public.guard_coverages g ON g.id = o.coverage_id
  WHERE o.id = p_id;
$$;

CREATE FUNCTION admin_private.guard_check_window_rank_v1(p_window text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_window WHEN 'MORNING' THEN 1 WHEN 'EVENING' THEN 2 ELSE 3 END;
$$;

CREATE FUNCTION admin_private.guard_check_queue_match_v1(
  p_queue text, p_window text, p_service date, p_actor uuid, p_now timestamptz, p_obl public.guard_check_obligations
) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT
    (p_window IS NULL OR p_obl.window_code = p_window)
    AND (
      p_queue IS NULL
      OR p_queue = 'TODAY' AND p_obl.service_date = p_service
      OR p_queue = 'MORNING' AND p_obl.service_date = p_service AND p_obl.window_code = 'MORNING'
        AND p_obl.state NOT IN ('COMPLETED', 'CANCELLED')
      OR p_queue = 'EVENING' AND p_obl.service_date = p_service AND p_obl.window_code = 'EVENING'
        AND p_obl.state NOT IN ('COMPLETED', 'CANCELLED')
      OR p_queue = 'CLAIMED_BY_ME' AND p_obl.state = 'CLAIMED' AND p_obl.claimed_by = p_actor
        AND p_obl.claim_expires_at IS NOT NULL AND p_obl.claim_expires_at > p_now
      OR p_queue = 'RETRY_REQUIRED' AND p_obl.state = 'PENDING' AND p_obl.retry_count > 0
      OR p_queue = 'MISSED' AND p_obl.missed_at IS NOT NULL AND p_obl.state NOT IN ('COMPLETED', 'CANCELLED')
      OR p_queue = 'COMPLETED_TODAY' AND p_obl.state = 'COMPLETED' AND p_obl.completed_at IS NOT NULL
        AND (timezone('Europe/London', p_obl.completed_at))::date = p_service
    );
$$;

CREATE FUNCTION public.admin_guard_check_list_v1(
  p_token text,
  p_now timestamptz DEFAULT NULL,
  p_service_date date DEFAULT NULL,
  p_window text DEFAULT NULL,
  p_queue text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_after uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  clock timestamptz;
  service date;
  sched public.guard_check_schedule_versions;
  actor uuid;
  rows jsonb;
  v_limit integer;
  v_queue text;
  last_id uuid;
  has_more boolean := false;
  cursor_obl public.guard_check_obligations;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  actor := (public.admin_session_v1(p_token)->>'userId')::uuid;
  clock := coalesce(p_now, now());
  service := coalesce(p_service_date, (timezone('Europe/London', clock))::date);
  IF p_window IS NOT NULL AND p_window NOT IN ('MORNING', 'EVENING') THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_window');
  END IF;
  v_queue := coalesce(nullif(btrim(coalesce(p_queue, '')), ''), 'TODAY');
  IF v_queue NOT IN ('TODAY','MORNING','EVENING','CLAIMED_BY_ME','RETRY_REQUIRED','MISSED','COMPLETED_TODAY') THEN
    RETURN jsonb_build_object('status','invalid','reason','invalid_queue');
  END IF;
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
  IF p_after IS NOT NULL THEN
    SELECT * INTO cursor_obl FROM public.guard_check_obligations WHERE id = p_after;
    IF cursor_obl.id IS NULL
      OR NOT admin_private.guard_check_queue_match_v1(v_queue, p_window, service, actor, clock, cursor_obl)
    THEN
      RETURN jsonb_build_object(
        'status','invalid','reason','invalid_cursor','serviceDate', service,
        'timezone','Europe/London','queue', v_queue,'now', clock,
        'obligations','[]'::jsonb,'hasMore', false,'nextCursor', NULL
      );
    END IF;
  END IF;
  sched := admin_private.guard_resolve_schedule_v1(service);
  SELECT coalesce(jsonb_agg(admin_private.guard_check_obligation_json_v1(q.id, clock) ORDER BY q.service_date, q.window_rank, q.location_name, q.id), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT o.id, o.service_date, admin_private.guard_check_window_rank_v1(o.window_code) AS window_rank, loc.location_name
    FROM public.guard_check_obligations o
    JOIN public.locations loc ON loc.id = o.location_id
    WHERE admin_private.guard_check_queue_match_v1(v_queue, p_window, service, actor, clock, o)
      AND (p_after IS NULL OR (o.service_date, admin_private.guard_check_window_rank_v1(o.window_code), loc.location_name, o.id) > (
        SELECT x.service_date, admin_private.guard_check_window_rank_v1(x.window_code), xl.location_name, x.id
        FROM public.guard_check_obligations x
        JOIN public.locations xl ON xl.id = x.location_id
        WHERE x.id = p_after
      ))
    ORDER BY o.service_date, admin_private.guard_check_window_rank_v1(o.window_code), loc.location_name, o.id
    LIMIT v_limit + 1
  ) q;
  IF jsonb_array_length(rows) > v_limit THEN
    has_more := true;
    rows := (
      SELECT coalesce(jsonb_agg(value), '[]'::jsonb)
      FROM jsonb_array_elements(rows) WITH ORDINALITY arr(value, n)
      WHERE n <= v_limit
    );
  END IF;
  last_id := CASE
    WHEN jsonb_array_length(rows) > 0 THEN (rows -> (jsonb_array_length(rows) - 1) ->> 'id')::uuid
    ELSE NULL
  END;
  RETURN jsonb_build_object(
    'serviceDate', service,
    'timezone', 'Europe/London',
    'scheduleConfigured', sched.id IS NOT NULL,
    'scheduleVersionId', sched.id,
    'morningLocalStart', sched.morning_start,
    'morningLocalEnd', sched.morning_end,
    'eveningLocalStart', sched.evening_start,
    'eveningLocalEnd', sched.evening_end,
    'claimedByMe', actor,
    'queue', v_queue,
    'limit', v_limit,
    'hasMore', has_more,
    'nextCursor', CASE WHEN has_more THEN last_id END,
    'now', clock,
    'obligations', rows
  );
END; $$;

CREATE FUNCTION public.admin_guard_check_detail_v1(p_token text, p_obligation uuid, p_now timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  clock timestamptz;
  service date;
  sched public.guard_check_schedule_versions;
  actor uuid;
  row jsonb;
  attempts jsonb;
  observation jsonb;
  obl public.guard_check_obligations;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  actor := (public.admin_session_v1(p_token)->>'userId')::uuid;
  clock := coalesce(p_now, now());
  service := (timezone('Europe/London', clock))::date;
  sched := admin_private.guard_resolve_schedule_v1(service);
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = p_obligation;
  IF obl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  row := admin_private.guard_check_obligation_json_v1(obl.id, clock);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'attemptNumber', a.attempt_number, 'actorId', a.actor_id,
    'startedAt', a.started_at, 'finishedAt', a.finished_at, 'outcome', a.outcome,
    'failureReason', a.failure_reason, 'handlingSeconds', a.handling_seconds, 'retryable', a.retryable
  ) ORDER BY a.attempt_number), '[]'::jsonb) INTO attempts
  FROM public.guard_check_attempts a WHERE a.obligation_id = p_obligation;
  SELECT jsonb_build_object(
    'id', obs.id, 'classification', obs.classification, 'profileAvailability', obs.profile_availability,
    'displayedBusinessName', obs.displayed_business_name, 'reviewCount', obs.review_count,
    'rating', obs.rating, 'ratingAvailable', obs.rating_available, 'changeCodes', to_jsonb(obs.change_codes),
    'comparisonStatus', obs.comparison_status, 'baselineId', obs.baseline_id,
    'observedAt', obs.observed_at, 'notes', obs.notes, 'attentionCandidate', obs.attention_candidate
  ) INTO observation
  FROM public.guard_check_observations obs WHERE obs.obligation_id = p_obligation;
  RETURN jsonb_build_object(
    'serviceDate', service,
    'timezone', 'Europe/London',
    'scheduleConfigured', sched.id IS NOT NULL,
    'scheduleVersionId', sched.id,
    'morningLocalStart', sched.morning_start,
    'morningLocalEnd', sched.morning_end,
    'eveningLocalStart', sched.evening_start,
    'eveningLocalEnd', sched.evening_end,
    'claimedByMe', actor,
    'now', clock,
    'obligation', row,
    'attempts', attempts,
    'observation', observation
  );
END; $$;

ALTER TABLE public.guard_check_schedule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_obligation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guard_check_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guard_check_generation_blockers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guard_check_schedule_versions, public.guard_check_obligations,
  public.guard_check_obligation_events, public.guard_check_attempts, public.guard_check_observations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE admin_private.guard_check_receipts, admin_private.guard_check_generation_blockers
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_maintain_checks_v1(timestamptz, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_enqueue_daily_checks_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_check_command_v1(text, uuid, text, jsonb, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_check_list_v1(text, timestamptz, date, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_check_detail_v1(text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.guard_maintain_checks_v1(timestamptz, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_enqueue_daily_checks_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_check_command_v1(text, uuid, text, jsonb, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_check_list_v1(text, timestamptz, date, text, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_check_detail_v1(text, uuid, timestamptz) TO service_role;

COMMIT;
