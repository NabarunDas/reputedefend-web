BEGIN;

-- Step 10: transactional outbox, durable jobs, leases, retries, dead-letter, heartbeat.

CREATE TABLE admin_private.job_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  topic text NOT NULL,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  last_error text,
  CONSTRAINT job_outbox_event_key_check CHECK (length(btrim(event_key)) BETWEEN 8 AND 200),
  CONSTRAINT job_outbox_topic_check CHECK (topic IN ('SYSTEM_HEALTH_PROBE')),
  CONSTRAINT job_outbox_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT job_outbox_error_len_check CHECK (last_error IS NULL OR length(last_error) <= 500)
);
CREATE INDEX job_outbox_available_idx
  ON admin_private.job_outbox (available_at, id)
  WHERE promoted_at IS NULL;
ALTER TABLE admin_private.job_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.job_outbox FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid UNIQUE REFERENCES admin_private.job_outbox(id) ON DELETE RESTRICT,
  job_type text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  lease_owner text,
  lease_token uuid,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  last_error text,
  replay_count integer NOT NULL DEFAULT 0,
  record_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_type_check CHECK (job_type IN ('SYSTEM_HEALTH_PROBE')),
  CONSTRAINT jobs_status_check CHECK (status IN ('PENDING', 'RUNNING', 'RETRY', 'SUCCEEDED', 'DEAD_LETTER')),
  CONSTRAINT jobs_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT jobs_attempts_check CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 20 AND attempts <= max_attempts + 1),
  CONSTRAINT jobs_replay_check CHECK (replay_count >= 0),
  CONSTRAINT jobs_error_len_check CHECK (last_error IS NULL OR length(last_error) <= 500),
  CONSTRAINT jobs_idempotency_check CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200)
);
CREATE INDEX jobs_claim_ready_idx
  ON admin_private.jobs (scheduled_at, id)
  WHERE status IN ('PENDING', 'RETRY');
CREATE INDEX jobs_claim_expired_idx
  ON admin_private.jobs (lease_expires_at, id)
  WHERE status = 'RUNNING';
CREATE INDEX jobs_status_updated_idx
  ON admin_private.jobs (status, updated_at DESC, id DESC);
CREATE INDEX jobs_dead_letter_idx
  ON admin_private.jobs (dead_lettered_at DESC, id DESC)
  WHERE status = 'DEAD_LETTER';
ALTER TABLE admin_private.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.jobs FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES admin_private.jobs(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  lease_owner text NOT NULL,
  lease_token uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text,
  error_summary text,
  provider_reference text,
  deployment_id text,
  CONSTRAINT job_attempts_number_check CHECK (attempt_number >= 1),
  CONSTRAINT job_attempts_outcome_check CHECK (outcome IS NULL OR outcome IN ('SUCCEEDED', 'RETRY', 'DEAD_LETTER', 'LEASE_EXPIRED')),
  CONSTRAINT job_attempts_error_len_check CHECK (error_summary IS NULL OR length(error_summary) <= 500),
  CONSTRAINT job_attempts_owner_check CHECK (length(btrim(lease_owner)) BETWEEN 1 AND 80),
  UNIQUE (job_id, attempt_number)
);
CREATE INDEX job_attempts_job_started_idx ON admin_private.job_attempts (job_id, started_at);
ALTER TABLE admin_private.job_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.job_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.reject_job_attempt_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.finished_at IS NOT NULL
    OR NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
    OR NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
    OR NEW.lease_token IS DISTINCT FROM OLD.lease_token
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.deployment_id IS DISTINCT FROM OLD.deployment_id
  THEN RAISE EXCEPTION 'job attempts are append-only'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER job_attempts_immutable
  BEFORE UPDATE OR DELETE ON admin_private.job_attempts
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_job_attempt_mutation_v1();
REVOKE ALL ON FUNCTION admin_private.reject_job_attempt_mutation_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.job_worker_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text NOT NULL,
  environment text NOT NULL,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  deployment_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_worker_heartbeats_name_check CHECK (length(btrim(worker_name)) BETWEEN 1 AND 80),
  CONSTRAINT job_worker_heartbeats_env_check CHECK (length(btrim(environment)) BETWEEN 1 AND 32),
  CONSTRAINT job_worker_heartbeats_error_len_check CHECK (last_error IS NULL OR length(last_error) <= 500),
  UNIQUE (worker_name, environment)
);
ALTER TABLE admin_private.job_worker_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.job_worker_heartbeats FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.job_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.job_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.job_command_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.job_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.job_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.job_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.job_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.job_backoff_v1(p_attempts integer)
RETURNS interval LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_attempts <= 1 THEN interval '1 minute'
    WHEN p_attempts = 2 THEN interval '5 minutes'
    WHEN p_attempts = 3 THEN interval '15 minutes'
    ELSE interval '60 minutes'
  END;
$$;
REVOKE ALL ON FUNCTION admin_private.job_backoff_v1(integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.safe_job_error_v1(p_error text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT left(btrim(coalesce(p_error, 'Job failed')), 500);
$$;
REVOKE ALL ON FUNCTION admin_private.safe_job_error_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.enqueue_outbox_v1(
  p_event_key text, p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_available_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE created admin_private.job_outbox;
BEGIN
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 8 AND 200
    OR p_topic IS NULL OR p_topic NOT IN ('SYSTEM_HEALTH_PROBE')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid outbox event'; END IF;
  INSERT INTO admin_private.job_outbox(event_key, topic, aggregate_type, aggregate_id, payload, available_at)
  VALUES (btrim(p_event_key), p_topic, nullif(btrim(coalesce(p_aggregate_type, '')), ''), p_aggregate_id, p_payload, coalesce(p_available_at, now()))
  RETURNING * INTO created;
  RETURN created.id;
END; $$;
REVOKE ALL ON FUNCTION admin_private.enqueue_outbox_v1(text, text, text, uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.finish_job_attempt_v1(p_job uuid, p_lease uuid, p_outcome text, p_error text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE attempt admin_private.job_attempts;
BEGIN
  SELECT * INTO attempt
  FROM admin_private.job_attempts
  WHERE job_id = p_job AND lease_token = p_lease AND finished_at IS NULL
  ORDER BY started_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;
  IF attempt.id IS NULL THEN RETURN; END IF;
  UPDATE admin_private.job_attempts
    SET finished_at = now(), outcome = p_outcome, error_summary = CASE WHEN p_error IS NULL THEN NULL ELSE admin_private.safe_job_error_v1(p_error) END
    WHERE id = attempt.id;
END; $$;
REVOKE ALL ON FUNCTION admin_private.finish_job_attempt_v1(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.job_promote_outbox_v1(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row admin_private.job_outbox; promoted integer := 0; batch integer;
BEGIN
  batch := least(greatest(coalesce(p_limit, 20), 1), 50);
  FOR row IN
    SELECT * FROM admin_private.job_outbox
    WHERE promoted_at IS NULL AND available_at <= now()
    ORDER BY available_at, id
    LIMIT batch
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO admin_private.jobs(
      outbox_id, job_type, idempotency_key, payload, status, scheduled_at
    ) VALUES (
      row.id, row.topic, row.event_key, row.payload, 'PENDING', row.available_at
    )
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox SET promoted_at = now(), last_error = NULL WHERE id = row.id AND promoted_at IS NULL;
    promoted := promoted + 1;
  END LOOP;
  RETURN jsonb_build_object('status', 'success', 'promoted', promoted);
END; $$;

CREATE FUNCTION public.job_claim_batch_v1(
  p_limit integer DEFAULT 10, p_worker text DEFAULT 'admin-jobs', p_lease_seconds integer DEFAULT 120, p_deployment text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row admin_private.jobs; claimed jsonb := '[]'::jsonb; batch integer; owner text; lease integer; token uuid; expired uuid; attempt_no integer;
BEGIN
  owner := btrim(coalesce(p_worker, ''));
  IF length(owner) NOT BETWEEN 1 AND 80 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  batch := least(greatest(coalesce(p_limit, 10), 1), 20);
  lease := least(greatest(coalesce(p_lease_seconds, 120), 30), 600);
  FOR row IN
    SELECT * FROM admin_private.jobs
    WHERE (
      (status IN ('PENDING', 'RETRY') AND scheduled_at <= now())
      OR (status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at < now())
    )
    ORDER BY scheduled_at, id
    LIMIT batch
    FOR UPDATE SKIP LOCKED
  LOOP
    IF row.status = 'RUNNING' THEN
      expired := row.lease_token;
      PERFORM admin_private.finish_job_attempt_v1(row.id, expired, 'LEASE_EXPIRED', 'Lease expired before completion');
    END IF;
    token := gen_random_uuid();
    SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no FROM admin_private.job_attempts a WHERE a.job_id = row.id;
    UPDATE admin_private.jobs
      SET status = 'RUNNING',
          claimed_at = now(),
          lease_expires_at = now() + make_interval(secs => lease),
          lease_owner = owner,
          lease_token = token,
          attempts = row.attempts + 1,
          updated_at = now(),
          record_version = row.record_version + 1
      WHERE id = row.id
      RETURNING * INTO row;
    INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
    VALUES (row.id, attempt_no, owner, token, nullif(left(btrim(coalesce(p_deployment, '')), 80), ''));
    claimed := claimed || jsonb_build_array(jsonb_build_object(
      'jobId', row.id,
      'jobType', row.job_type,
      'idempotencyKey', row.idempotency_key,
      'payload', row.payload,
      'leaseToken', token,
      'attemptNumber', row.attempts,
      'attempts', row.attempts,
      'maxAttempts', row.max_attempts
    ));
  END LOOP;
  RETURN jsonb_build_object('status', 'success', 'jobs', claimed);
END; $$;

CREATE FUNCTION public.job_complete_v1(p_job uuid, p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row admin_private.jobs;
BEGIN
  IF p_job IS NULL OR p_lease IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO row FROM admin_private.jobs WHERE id = p_job FOR UPDATE;
  IF row.id IS NULL OR row.status <> 'RUNNING' OR row.lease_token IS DISTINCT FROM p_lease THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  UPDATE admin_private.jobs
    SET status = 'SUCCEEDED',
        completed_at = now(),
        lease_expires_at = NULL,
        lease_owner = NULL,
        lease_token = NULL,
        last_error = NULL,
        updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND status = 'RUNNING' AND lease_token = p_lease;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  PERFORM admin_private.finish_job_attempt_v1(row.id, p_lease, 'SUCCEEDED', NULL);
  RETURN jsonb_build_object('status', 'success', 'jobId', row.id, 'jobStatus', 'SUCCEEDED');
END; $$;

CREATE FUNCTION public.job_fail_v1(p_job uuid, p_lease uuid, p_error text, p_retryable boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row admin_private.jobs; next_status text; summary text;
BEGIN
  IF p_job IS NULL OR p_lease IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO row FROM admin_private.jobs WHERE id = p_job FOR UPDATE;
  IF row.id IS NULL OR row.status <> 'RUNNING' OR row.lease_token IS DISTINCT FROM p_lease THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  summary := admin_private.safe_job_error_v1(p_error);
  IF coalesce(p_retryable, false) AND row.attempts < row.max_attempts THEN
    next_status := 'RETRY';
    UPDATE admin_private.jobs
      SET status = 'RETRY',
          scheduled_at = now() + admin_private.job_backoff_v1(row.attempts),
          lease_expires_at = NULL,
          lease_owner = NULL,
          lease_token = NULL,
          last_error = summary,
          updated_at = now(),
          record_version = row.record_version + 1
      WHERE id = row.id AND status = 'RUNNING' AND lease_token = p_lease;
    PERFORM admin_private.finish_job_attempt_v1(row.id, p_lease, 'RETRY', summary);
  ELSE
    next_status := 'DEAD_LETTER';
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER',
          dead_lettered_at = now(),
          lease_expires_at = NULL,
          lease_owner = NULL,
          lease_token = NULL,
          last_error = summary,
          updated_at = now(),
          record_version = row.record_version + 1
      WHERE id = row.id AND status = 'RUNNING' AND lease_token = p_lease;
    PERFORM admin_private.finish_job_attempt_v1(row.id, p_lease, 'DEAD_LETTER', summary);
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  RETURN jsonb_build_object('status', 'success', 'jobId', row.id, 'jobStatus', next_status);
END; $$;

CREATE FUNCTION public.job_heartbeat_v1(
  p_worker text, p_environment text, p_phase text, p_error text DEFAULT NULL, p_deployment text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner text; env text; phase text; summary text; deploy text;
BEGIN
  owner := btrim(coalesce(p_worker, ''));
  env := btrim(coalesce(p_environment, ''));
  phase := btrim(coalesce(p_phase, ''));
  IF length(owner) NOT BETWEEN 1 AND 80 OR length(env) NOT BETWEEN 1 AND 32
    OR phase NOT IN ('start', 'complete', 'success', 'error')
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  summary := CASE WHEN p_error IS NULL THEN NULL ELSE admin_private.safe_job_error_v1(p_error) END;
  deploy := nullif(left(btrim(coalesce(p_deployment, '')), 80), '');
  INSERT INTO admin_private.job_worker_heartbeats(worker_name, environment, last_started_at, last_completed_at, last_success_at, last_error, deployment_id, updated_at)
  VALUES (
    owner, env,
    CASE WHEN phase = 'start' THEN now() ELSE NULL END,
    CASE WHEN phase = 'complete' THEN now() ELSE NULL END,
    CASE WHEN phase = 'success' THEN now() ELSE NULL END,
    CASE WHEN phase = 'error' THEN summary ELSE NULL END,
    deploy, now()
  )
  ON CONFLICT (worker_name, environment) DO UPDATE SET
    last_started_at = CASE WHEN phase = 'start' THEN now() ELSE admin_private.job_worker_heartbeats.last_started_at END,
    last_completed_at = CASE WHEN phase = 'complete' THEN now() ELSE admin_private.job_worker_heartbeats.last_completed_at END,
    last_success_at = CASE WHEN phase = 'success' THEN now() ELSE admin_private.job_worker_heartbeats.last_success_at END,
    last_error = CASE WHEN phase = 'error' THEN summary WHEN phase = 'success' THEN NULL ELSE admin_private.job_worker_heartbeats.last_error END,
    deployment_id = coalesce(deploy, admin_private.job_worker_heartbeats.deployment_id),
    updated_at = now();
  RETURN jsonb_build_object('status', 'success');
END; $$;

CREATE FUNCTION public.admin_enqueue_job_probe_v1(p_token text, p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; actor uuid; fp text; cached jsonb; result jsonb; outbox uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array('enqueue_probe', 'SYSTEM_HEALTH_PROBE')::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  outbox := admin_private.enqueue_outbox_v1(
    'system-health-probe:' || p_request::text,
    'SYSTEM_HEALTH_PROBE',
    'admin_probe',
    p_request,
    jsonb_build_object('source', 'ADMIN_PROBE'),
    now()
  );
  result := jsonb_build_object('status', 'success', 'outboxId', outbox, 'jobType', 'SYSTEM_HEALTH_PROBE');
  PERFORM admin_private.write_record_audit_v1(
    actor, 'OPERATIONS_CHANGED', 'success', outbox, p_request, 'job',
    'Queued a system health probe',
    jsonb_build_object('operation', 'enqueue_probe', 'jobType', 'SYSTEM_HEALTH_PROBE')
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_job_replay_v1(
  p_token text, p_request uuid, p_job uuid, p_reason text, p_confirmed boolean, p_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; actor uuid; fp text; cached jsonb; result jsonb; row admin_private.jobs; reason text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    PERFORM admin_private.write_record_audit_v1(actor, 'OPERATIONS_CHANGED', 'reauth_required', p_job, p_request, 'job', 'Dead-letter replay requires a fresh sign-in', jsonb_build_object('operation', 'replay'));
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  reason := btrim(coalesce(p_reason, ''));
  IF p_request IS NULL OR p_job IS NULL OR p_version IS NULL OR coalesce(p_confirmed, false) IS NOT TRUE
    OR length(reason) NOT BETWEEN 10 AND 2000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_job, p_version, 'replay')::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO row FROM admin_private.jobs WHERE id = p_job FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.status = 'SUCCEEDED' OR row.status = 'RUNNING' THEN
    PERFORM admin_private.write_record_audit_v1(actor, 'OPERATIONS_CHANGED', 'denied', row.id, p_request, 'job', reason, jsonb_build_object('operation', 'replay', 'jobStatus', row.status));
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF row.status <> 'DEAD_LETTER' OR row.record_version <> p_version THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  UPDATE admin_private.jobs
    SET status = 'PENDING',
        scheduled_at = now(),
        claimed_at = NULL,
        lease_expires_at = NULL,
        lease_owner = NULL,
        lease_token = NULL,
        attempts = 0,
        dead_lettered_at = NULL,
        last_error = NULL,
        replay_count = row.replay_count + 1,
        record_version = row.record_version + 1,
        updated_at = now()
    WHERE id = row.id AND status = 'DEAD_LETTER' AND record_version = p_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  result := jsonb_build_object(
    'status', 'success', 'jobId', row.id, 'idempotencyKey', row.idempotency_key,
    'replayCount', row.replay_count + 1, 'version', row.record_version + 1
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'OPERATIONS_CHANGED', 'success', row.id, p_request, 'job', reason,
    jsonb_build_object('operation', 'replay', 'jobType', row.job_type, 'replayCount', row.replay_count + 1)
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_job_health_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hb admin_private.job_worker_heartbeats; counts jsonb; jobs jsonb; health text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO hb FROM admin_private.job_worker_heartbeats ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1;
  IF hb.id IS NULL THEN health := 'NEVER_RUN';
  ELSIF coalesce(hb.last_started_at, hb.updated_at) >= now() - interval '10 minutes' THEN health := 'HEALTHY';
  ELSE health := 'LATE';
  END IF;
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'PENDING'),
    'running', count(*) FILTER (WHERE status = 'RUNNING'),
    'retry', count(*) FILTER (WHERE status = 'RETRY'),
    'succeeded', count(*) FILTER (WHERE status = 'SUCCEEDED'),
    'deadLetter', count(*) FILTER (WHERE status = 'DEAD_LETTER')
  ) INTO counts FROM admin_private.jobs;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', j.id,
    'jobType', j.job_type,
    'status', j.status,
    'scheduledAt', j.scheduled_at,
    'attempts', j.attempts,
    'maxAttempts', j.max_attempts,
    'lastError', j.last_error,
    'deadLetteredAt', j.dead_lettered_at,
    'completedAt', j.completed_at,
    'replayCount', j.replay_count,
    'version', j.record_version,
    'summary', CASE j.job_type WHEN 'SYSTEM_HEALTH_PROBE' THEN 'System health probe' ELSE j.job_type END
  ) ORDER BY j.updated_at DESC, j.id DESC), '[]') INTO jobs
  FROM (
    SELECT * FROM admin_private.jobs ORDER BY updated_at DESC, id DESC LIMIT 50
  ) j;
  RETURN jsonb_build_object(
    'heartbeat', CASE WHEN hb.id IS NULL THEN jsonb_build_object(
      'status', health, 'workerName', NULL, 'environment', NULL,
      'lastStartedAt', NULL, 'lastCompletedAt', NULL, 'lastSuccessAt', NULL,
      'lastError', NULL, 'deploymentId', NULL, 'updatedAt', NULL
    ) ELSE jsonb_build_object(
      'status', health,
      'workerName', hb.worker_name,
      'environment', hb.environment,
      'lastStartedAt', hb.last_started_at,
      'lastCompletedAt', hb.last_completed_at,
      'lastSuccessAt', hb.last_success_at,
      'lastError', hb.last_error,
      'deploymentId', hb.deployment_id,
      'updatedAt', hb.updated_at
    ) END,
    'counts', counts,
    'jobs', jobs
  );
END; $$;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED'
));
CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN (
      'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
      'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
      'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED'
    ))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.job_promote_outbox_v1(integer),
  public.job_claim_batch_v1(integer, text, integer, text),
  public.job_complete_v1(uuid, uuid),
  public.job_fail_v1(uuid, uuid, text, boolean),
  public.job_heartbeat_v1(text, text, text, text, text),
  public.admin_enqueue_job_probe_v1(text, uuid),
  public.admin_job_replay_v1(text, uuid, uuid, text, boolean, integer),
  public.admin_job_health_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.job_promote_outbox_v1(integer),
  public.job_claim_batch_v1(integer, text, integer, text),
  public.job_complete_v1(uuid, uuid),
  public.job_fail_v1(uuid, uuid, text, boolean),
  public.job_heartbeat_v1(text, text, text, text, text),
  public.admin_enqueue_job_probe_v1(text, uuid),
  public.admin_job_replay_v1(text, uuid, uuid, text, boolean, integer),
  public.admin_job_health_v1(text)
  TO service_role;

COMMIT;
