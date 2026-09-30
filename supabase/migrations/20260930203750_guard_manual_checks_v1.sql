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
    )
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
      AND (rating_available IS FALSE OR rating IS NOT NULL)
    )
  ),
  CONSTRAINT guard_check_observation_unavailable CHECK (
    classification <> 'PROFILE_UNAVAILABLE' OR profile_availability = 'UNAVAILABLE'
  ),
  CONSTRAINT guard_check_observation_rating CHECK (
    rating_available IS FALSE OR rating IS NOT NULL
  )
);

CREATE TABLE admin_private.guard_check_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE FUNCTION admin_private.guard_check_schedule_protect_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status = 'APPROVED' AND NEW.status = 'APPROVED' THEN
    IF NEW.timezone IS DISTINCT FROM OLD.timezone
      OR NEW.morning_start IS DISTINCT FROM OLD.morning_start
      OR NEW.morning_end IS DISTINCT FROM OLD.morning_end
      OR NEW.evening_start IS DISTINCT FROM OLD.evening_start
      OR NEW.evening_end IS DISTINCT FROM OLD.evening_end
      OR NEW.checks_per_day IS DISTINCT FROM OLD.checks_per_day
      OR NEW.includes_weekends IS DISTINCT FROM OLD.includes_weekends
      OR NEW.includes_bank_holidays IS DISTINCT FROM OLD.includes_bank_holidays
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    THEN RAISE EXCEPTION 'approved schedule is immutable'; END IF;
  END IF;
  IF OLD.status = 'RETIRED' THEN RAISE EXCEPTION 'retired schedule is immutable'; END IF;
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
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number THEN
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
  cov public.guard_coverages;
  rota public.guard_rota_assignments;
  morning_start timestamptz;
  morning_end timestamptz;
  evening_start timestamptz;
  evening_end timestamptz;
  inserted integer;
  abandoned public.guard_check_attempts;
  obl public.guard_check_obligations;
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
    INSERT INTO public.guard_check_obligations(
      coverage_id, customer_id, business_id, location_id, service_date, window_code,
      schedule_version_id, rota_assignment_id, coverage_basis, timezone,
      local_start, local_end, window_start_utc, window_end_utc
    ) VALUES
      (cov.id, cov.customer_id, cov.business_id, cov.location_id, service, 'MORNING',
       sched.id, rota.id, cov.coverage_basis, sched.timezone,
       sched.morning_start, sched.morning_end, morning_start, morning_end),
      (cov.id, cov.customer_id, cov.business_id, cov.location_id, service, 'EVENING',
       sched.id, rota.id, cov.coverage_basis, sched.timezone,
       sched.evening_start, sched.evening_end, evening_start, evening_end)
    ON CONFLICT (coverage_id, service_date, window_code) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    generated := generated + inserted;
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
      AND window_end_utc <= clock;
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
    'scheduleVersionId', sched.id
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
BEGIN
  reason := btrim(coalesce(p_payload->>'reason', 'coverage_not_active'));
  SELECT * INTO obl FROM public.guard_check_obligations WHERE id = (p_payload->>'obligationId')::uuid FOR UPDATE;
  IF obl.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_version IS DISTINCT FROM obl.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF obl.state = 'COMPLETED' THEN RETURN jsonb_build_object('status','denied','reason','already_completed'); END IF;
  IF obl.state = 'CANCELLED' THEN RETURN jsonb_build_object('status','success','id', obl.id, 'version', obl.record_version); END IF;
  SELECT * INTO cov FROM public.guard_coverages WHERE id = obl.coverage_id;
  IF cov.state = 'ACTIVE' AND obl.state = 'CLAIMED' THEN
    RETURN jsonb_build_object('status','denied','reason','coverage_still_active');
  END IF;
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
  PERFORM admin_private.guard_check_append_event_v1(obl.id, p_actor, 'CANCELLED', 'CLAIMED', 'CANCELLED',
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
  IF p_name IS DISTINCT FROM btrim(p_baseline.displayed_business_name) THEN codes := array_append(codes, 'BUSINESS_NAME_CHANGED'); END IF;
  IF p_reviews IS NOT NULL AND p_baseline.review_count IS NOT NULL AND p_reviews > p_baseline.review_count THEN
    codes := array_append(codes, 'REVIEW_COUNT_INCREASED');
  END IF;
  IF p_reviews IS NOT NULL AND p_baseline.review_count IS NOT NULL AND p_reviews < p_baseline.review_count THEN
    codes := array_append(codes, 'REVIEW_COUNT_DECREASED');
  END IF;
  IF p_rating_available IS TRUE AND p_rating IS NOT NULL AND p_baseline.rating IS NOT NULL AND p_rating IS DISTINCT FROM p_baseline.rating THEN
    codes := array_append(codes, 'RATING_CHANGED');
  END IF;
  IF coalesce(p_latest_ref, '') IS DISTINCT FROM coalesce(p_baseline.latest_review_reference, '')
    OR p_latest_at IS DISTINCT FROM p_baseline.latest_review_at
  THEN
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
  THEN RETURN jsonb_build_object('status','invalid'); END IF;

  IF requested_baseline IS NOT NULL THEN
    SELECT * INTO baseline FROM public.guard_baselines WHERE id = requested_baseline;
    IF baseline.id IS NULL OR baseline.coverage_id <> obl.coverage_id OR baseline.location_id <> obl.location_id THEN
      RETURN jsonb_build_object('status','denied','reason','baseline_location_mismatch');
    END IF;
  ELSE
    SELECT * INTO baseline FROM public.guard_baselines
    WHERE coverage_id = obl.coverage_id AND location_id = obl.location_id AND status = 'VERIFIED';
  END IF;
  IF baseline.id IS NOT NULL AND baseline.status <> 'VERIFIED' THEN
    baseline := NULL;
  END IF;

  codes := admin_private.guard_check_compare_v1(baseline, availability, name, reviews, rating, rating_available, latest_ref, latest_at);
  IF classification = 'HEALTHY' THEN
    IF availability <> 'AVAILABLE' OR location_ok IS NOT TRUE OR char_length(name) < 1 OR reviews IS NULL
      OR baseline.id IS NULL OR char_length(profile_url) < 8 OR (rating_available IS TRUE AND rating IS NULL)
    THEN RETURN jsonb_build_object('status','denied','reason','incomplete_not_healthy'); END IF;
    IF availability = 'UNAVAILABLE' THEN RETURN jsonb_build_object('status','denied','reason','unavailable_not_healthy'); END IF;
    IF baseline.id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','baseline_missing'); END IF;
    IF codes <> '{}'::text[] THEN RETURN jsonb_build_object('status','denied','reason','changes_not_healthy'); END IF;
    comparison := 'COMPARED';
  ELSIF classification = 'PROFILE_UNAVAILABLE' THEN
    IF availability <> 'UNAVAILABLE' THEN RETURN jsonb_build_object('status','invalid'); END IF;
    comparison := CASE WHEN baseline.id IS NULL THEN 'INCOMPLETE' ELSE 'COMPARED' END;
  ELSIF classification = 'CHANGE_DETECTED' THEN
    IF codes = '{}'::text[] THEN RETURN jsonb_build_object('status','invalid'); END IF;
    comparison := CASE WHEN baseline.id IS NULL THEN 'INCOMPLETE' ELSE 'COMPARED' END;
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

CREATE FUNCTION public.admin_guard_check_list_v1(p_token text, p_now timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  clock timestamptz;
  service date;
  sched public.guard_check_schedule_versions;
  actor uuid;
  rows jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  actor := (public.admin_session_v1(p_token)->>'userId')::uuid;
  clock := coalesce(p_now, now());
  service := (timezone('Europe/London', clock))::date;
  sched := admin_private.guard_resolve_schedule_v1(service);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'coverageId', o.coverage_id,
    'locationId', o.location_id,
    'customerName', c.full_name,
    'businessName', b.display_name,
    'locationName', loc.location_name,
    'coverageBasis', o.coverage_basis,
    'serviceDate', o.service_date,
    'windowCode', o.window_code,
    'state', o.state,
    'timezone', o.timezone,
    'localStart', o.local_start,
    'localEnd', o.local_end,
    'windowStartAt', o.window_start_utc,
    'windowEndAt', o.window_end_utc,
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
      WHERE base.coverage_id = o.coverage_id AND base.status = 'VERIFIED'
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
  ) ORDER BY o.service_date, o.window_code, loc.location_name), '[]'::jsonb) INTO rows
  FROM public.guard_check_obligations o
  JOIN public.customers c ON c.id = o.customer_id
  JOIN public.businesses b ON b.id = o.business_id
  JOIN public.locations loc ON loc.id = o.location_id;
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
    'obligations', rows
  );
END; $$;

CREATE FUNCTION public.admin_guard_check_detail_v1(p_token text, p_obligation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  list jsonb;
  row jsonb;
  attempts jsonb;
  observation jsonb;
BEGIN
  list := public.admin_guard_check_list_v1(p_token);
  IF list IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO row
  FROM jsonb_array_elements(list->'obligations') value
  WHERE value->>'id' = p_obligation::text;
  IF row IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
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
  RETURN list || jsonb_build_object('obligation', row, 'attempts', attempts, 'observation', observation);
END; $$;

ALTER TABLE public.guard_check_schedule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_obligation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_check_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guard_check_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guard_check_schedule_versions, public.guard_check_obligations,
  public.guard_check_obligation_events, public.guard_check_attempts, public.guard_check_observations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE admin_private.guard_check_receipts FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_maintain_checks_v1(timestamptz, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_enqueue_daily_checks_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_check_command_v1(text, uuid, text, jsonb, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_check_list_v1(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_check_detail_v1(text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.guard_maintain_checks_v1(timestamptz, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_enqueue_daily_checks_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_check_command_v1(text, uuid, text, jsonb, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_check_list_v1(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_check_detail_v1(text, uuid) TO service_role;

COMMIT;
