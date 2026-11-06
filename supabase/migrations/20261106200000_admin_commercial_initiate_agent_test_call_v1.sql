-- Forward-only. Do not apply 20261106200000 to hosted DEV. Do not apply 20261106200000 to Production.
-- 20261106120000 and 20261106140000 are already applied on hosted DEV and must not be replayed.
-- Opens one controlled web conversation for one selected location.
-- The server claims provider creation once, then records the call id from its own create response.
-- A browser-typed call id is rejected and is not a binding.
-- The intent is written before the provider call exists. Its attempt state changes only on the attempt row.
-- The binding is a separate immutable row for that same request, actor, agent, and version.
-- Connection tokens and ICE credentials are not stored on an attempt, a binding, or a command receipt.
-- An uncertain provider response stays REQUIRES_RECONCILIATION and cannot open another call.
-- COMPLETED is recorded only from provider evidence that the web call ended or was cancelled.
-- A completed attempt leaves the active-location slot. An ongoing or uncertain attempt does not.
-- This does not place a telephone call, buy a number, enable forwarding, write a routing binding, or move a service to live.
-- A passed conversation still requires the later verification command.
-- An unrecognised stored revision cannot open a call.

ALTER TABLE admin_private.commercial_agent_test_intents
  ADD COLUMN initiation_request_id uuid;

COMMENT ON COLUMN admin_private.commercial_agent_test_intents.initiation_request_id IS
  'Idempotency key of the server command that created this intent. It is not a provider call id.';

CREATE UNIQUE INDEX commercial_agent_test_intents_request_uidx
  ON admin_private.commercial_agent_test_intents (initiation_request_id);

CREATE TABLE admin_private.commercial_agent_test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL UNIQUE REFERENCES admin_private.commercial_agent_test_intents (id) ON DELETE RESTRICT,
  initiation_request_id uuid NOT NULL UNIQUE,
  subscription_id uuid NOT NULL,
  location_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN (
    'INTENT_RECORDED',
    'CREATION_IN_PROGRESS',
    'PROVIDER_CREATED',
    'BOUND',
    'REQUIRES_RECONCILIATION',
    'FAILED_BEFORE_CREATION',
    'COMPLETED'
  )),
  reason text,
  provider_call_id text CHECK (provider_call_id IS NULL OR provider_call_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  transport text CHECK (transport IS NULL OR transport = 'gateway'),
  echoed_agent_ref text,
  echoed_agent_version integer,
  provider_echoed_agent boolean NOT NULL DEFAULT false,
  provider_echoed_version boolean NOT NULL DEFAULT false,
  creation_claimed_at timestamptz,
  completed_at timestamptz,
  completion_basis text CHECK (completion_basis IS NULL OR completion_basis IN ('provider_ended', 'provider_cancelled')),
  max_duration_seconds integer NOT NULL DEFAULT 600 CHECK (max_duration_seconds = 600),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (
    (state = 'COMPLETED' AND completed_at IS NOT NULL AND completion_basis IS NOT NULL)
    OR (state <> 'COMPLETED' AND completed_at IS NULL AND completion_basis IS NULL)
  )
);

COMMENT ON TABLE admin_private.commercial_agent_test_attempts IS
  'Durable non-secret state for one controlled web-call attempt. Provider creation can be claimed once. A connection token and ICE credentials are not stored.';

CREATE UNIQUE INDEX commercial_agent_test_attempts_active_location_uidx
  ON admin_private.commercial_agent_test_attempts (subscription_id, location_id)
  WHERE state IN (
    'INTENT_RECORDED',
    'CREATION_IN_PROGRESS',
    'PROVIDER_CREATED',
    'BOUND',
    'REQUIRES_RECONCILIATION'
  );

ALTER TABLE admin_private.commercial_agent_test_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_agent_test_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.commercial_agent_test_context_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 8000
  THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) AS key
    WHERE key NOT IN (
      'customerId', 'businessId', 'onboardingRequestId', 'onboardingVersion', 'locationId',
      'preferenceVersion', 'provisionVersion', 'configurationVersion', 'allocationId',
      'allocationVersion', 'instructionId', 'instructionVersion', 'confirmedCharge'
    )
  ) THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF (p_payload -> 'confirmedCharge') IS DISTINCT FROM 'true'::jsonb
    OR (p_payload ->> 'customerId') IS NULL
    OR (p_payload ->> 'customerId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_payload ->> 'businessId') IS NULL
    OR (p_payload ->> 'businessId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_payload ->> 'onboardingRequestId') IS NULL
    OR (p_payload ->> 'onboardingRequestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_payload ->> 'locationId') IS NULL
    OR (p_payload ->> 'locationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_payload ->> 'allocationId') IS NULL
    OR (p_payload ->> 'allocationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_payload ->> 'instructionId') IS NULL
    OR (p_payload ->> 'instructionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'onboardingVersion') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_payload -> 'preferenceVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'preferenceVersion') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_payload -> 'provisionVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'provisionVersion') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_payload -> 'configurationVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'configurationVersion') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_payload -> 'allocationVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'allocationVersion') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_payload -> 'instructionVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'instructionVersion') !~ '^[1-9][0-9]*$'
  THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_agent_test_context_v1(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.commercial_agent_test_attempt_status_v1(
  p_attempt admin_private.commercial_agent_test_attempts
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  intent admin_private.commercial_agent_test_intents;
  stored_version integer;
  visible text;
  outcome jsonb;
  confirmed_agent boolean := false;
  confirmed_version boolean := false;
BEGIN
  SELECT * INTO intent
  FROM admin_private.commercial_agent_test_intents recorded
  WHERE recorded.id = p_attempt.intent_id;
  stored_version := admin_private.commercial_agent_test_revision_number_v1(intent.provider_revision);
  IF p_attempt.state = 'CREATION_IN_PROGRESS'
    AND (
      p_attempt.creation_claimed_at IS NULL
      OR p_attempt.creation_claimed_at <= pg_catalog.clock_timestamp() - interval '30 seconds'
    )
  THEN
    UPDATE admin_private.commercial_agent_test_attempts attempt
    SET state = 'REQUIRES_RECONCILIATION',
        reason = 'stale_claim',
        updated_at = pg_catalog.clock_timestamp()
    WHERE attempt.id = p_attempt.id
      AND attempt.state = 'CREATION_IN_PROGRESS';
    p_attempt.state := 'REQUIRES_RECONCILIATION';
    p_attempt.reason := 'stale_claim';
  END IF;
  visible := CASE p_attempt.state
    WHEN 'INTENT_RECORDED' THEN 'prepared'
    WHEN 'CREATION_IN_PROGRESS' THEN 'creation'
    WHEN 'PROVIDER_CREATED' THEN 'provider_created'
    WHEN 'BOUND' THEN 'bound'
    WHEN 'REQUIRES_RECONCILIATION' THEN 'reconciliation'
    WHEN 'COMPLETED' THEN 'completed'
    ELSE 'failed'
  END;
  IF p_attempt.state = 'BOUND' AND p_attempt.provider_echoed_agent AND p_attempt.echoed_agent_ref = intent.agent_ref THEN
    confirmed_agent := true;
  END IF;
  IF p_attempt.state = 'BOUND' AND p_attempt.provider_echoed_version AND p_attempt.echoed_agent_version = stored_version THEN
    confirmed_version := true;
  END IF;
  outcome := jsonb_build_object(
    'status', visible,
    'attemptState', p_attempt.state,
    'reason', p_attempt.reason,
    'intentId', intent.id,
    'sessionRef', intent.test_session_ref,
    'agentRef', intent.agent_ref,
    'agentVersion', stored_version,
    'environment', intent.environment,
    'configurationId', intent.configuration_id,
    'configurationVersion', intent.configuration_version,
    'providerConfirmedAgent', confirmed_agent,
    'providerConfirmedVersion', confirmed_version,
    'forwardingVerified', false,
    'testPassed', false,
    'maxDurationSeconds', p_attempt.max_duration_seconds
  );
  IF p_attempt.provider_call_id IS NOT NULL THEN
    outcome := outcome || jsonb_build_object('callId', p_attempt.provider_call_id);
  END IF;
  RETURN outcome;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_agent_test_attempt_status_v1(admin_private.commercial_agent_test_attempts)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_commercial_prepare_agent_test_call_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
  p_environment text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  intent admin_private.commercial_agent_test_intents;
  attempt admin_private.commercial_agent_test_attempts;
  cfg admin_private.commercial_location_configurations;
  preflight jsonb;
  stored_version integer;
  opened_at timestamptz;
  session_ref text;
  chosen_location uuid;
  actor_attempts bigint;
  location_attempts bigint;
  outcome jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_environment IS NULL OR p_environment NOT IN ('dev', 'production')
    OR (admin_private.commercial_agent_test_context_v1(p_payload) ->> 'ok') IS DISTINCT FROM 'true'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  chosen_location := (p_payload ->> 'locationId')::uuid;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'initiate-agent-test-call:' || p_subscription::text || ':' || chosen_location::text, 0
  ));

  SELECT * INTO attempt
  FROM admin_private.commercial_agent_test_attempts recorded
  WHERE recorded.initiation_request_id = p_request;
  IF attempt.id IS NOT NULL THEN
    IF attempt.actor_id IS DISTINCT FROM actor
      OR attempt.subscription_id IS DISTINCT FROM p_subscription
      OR attempt.location_id IS DISTINCT FROM chosen_location
    THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    outcome := admin_private.commercial_agent_test_attempt_status_v1(attempt);
    IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
      RETURN jsonb_build_object('status', 'reauth_required');
    END IF;
    RETURN outcome;
  END IF;

  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.commercial_agent_test_attempts active
    WHERE active.subscription_id = p_subscription
      AND active.location_id = chosen_location
      AND active.state IN (
        'INTENT_RECORDED',
        'CREATION_IN_PROGRESS',
        'PROVIDER_CREATED',
        'BOUND',
        'REQUIRES_RECONCILIATION'
      )
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'active');
  END IF;

  preflight := public.admin_commercial_agent_test_preflight_v1(
    p_token,
    p_subscription,
    p_version,
    (p_payload ->> 'customerId')::uuid,
    (p_payload ->> 'businessId')::uuid,
    chosen_location,
    p_environment,
    (p_payload ->> 'onboardingRequestId')::uuid,
    (p_payload ->> 'onboardingVersion')::integer,
    (p_payload ->> 'preferenceVersion')::integer,
    (p_payload ->> 'configurationVersion')::integer,
    (p_payload ->> 'allocationId')::uuid,
    (p_payload ->> 'allocationVersion')::integer,
    (p_payload ->> 'instructionId')::uuid,
    (p_payload ->> 'instructionVersion')::integer,
    (p_payload ->> 'provisionVersion')::integer
  );
  IF (preflight ->> 'status') IS DISTINCT FROM 'eligible' THEN
    RETURN preflight;
  END IF;

  SELECT count(*) INTO actor_attempts
  FROM admin_private.commercial_agent_test_attempts prior
  WHERE prior.actor_id = actor
    AND prior.created_at > pg_catalog.clock_timestamp() - interval '60 minutes';
  SELECT count(*) INTO location_attempts
  FROM admin_private.commercial_agent_test_attempts prior
  WHERE prior.subscription_id = p_subscription
    AND prior.location_id = chosen_location
    AND prior.created_at > pg_catalog.clock_timestamp() - interval '24 hours';
  IF actor_attempts >= 8 OR location_attempts >= 3 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'rate');
  END IF;

  SELECT * INTO cfg
  FROM admin_private.commercial_location_configurations config
  WHERE config.subscription_id = p_subscription
    AND config.location_id = chosen_location
  ORDER BY config.version DESC
  LIMIT 1;
  IF cfg.id IS NULL OR cfg.version IS DISTINCT FROM (p_payload ->> 'configurationVersion')::integer THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  IF cfg.environment IS DISTINCT FROM p_environment THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'environment');
  END IF;
  stored_version := admin_private.commercial_agent_test_revision_number_v1(cfg.provider_revision);
  IF stored_version IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'revision');
  END IF;

  opened_at := pg_catalog.clock_timestamp();
  session_ref := 'TS-' || pg_catalog.to_char(opened_at AT TIME ZONE 'UTC', 'YY')
    || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO admin_private.commercial_agent_test_intents(
    subscription_id, customer_id, business_id, entitlement_id, location_id, actor_id,
    configuration_id, configuration_version, agent_ref, provider_revision, environment,
    window_starts_at, window_ends_at, test_session_ref, created_at, initiation_request_id
  ) VALUES (
    p_subscription, cfg.customer_id, cfg.business_id, cfg.entitlement_id, chosen_location, actor,
    cfg.id, cfg.version, cfg.agent_ref, cfg.provider_revision, cfg.environment,
    opened_at, opened_at + interval '30 minutes', session_ref, opened_at, p_request
  ) RETURNING * INTO intent;
  INSERT INTO admin_private.commercial_agent_test_attempts(
    intent_id, initiation_request_id, subscription_id, location_id, actor_id, state, created_at, updated_at
  ) VALUES (
    intent.id, p_request, p_subscription, chosen_location, actor, 'INTENT_RECORDED', opened_at, opened_at
  ) RETURNING * INTO attempt;
  RETURN admin_private.commercial_agent_test_attempt_status_v1(attempt);
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_prepare_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Records one pre-authorised test intent before a provider call exists. A repeated key returns the durable attempt state and does not open another attempt. It does not accept a call id, place a telephone call, or advance the service.';

REVOKE ALL ON FUNCTION public.admin_commercial_prepare_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_prepare_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  TO service_role;

CREATE FUNCTION public.admin_commercial_claim_agent_test_creation_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
  p_environment text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  attempt admin_private.commercial_agent_test_attempts;
  claimed admin_private.commercial_agent_test_attempts;
  chosen_location uuid;
  snapshot jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_environment IS NULL OR p_environment NOT IN ('dev', 'production')
    OR (admin_private.commercial_agent_test_context_v1(p_payload) ->> 'ok') IS DISTINCT FROM 'true'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  chosen_location := (p_payload ->> 'locationId')::uuid;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  SELECT * INTO attempt
  FROM admin_private.commercial_agent_test_attempts recorded
  WHERE recorded.initiation_request_id = p_request
  FOR UPDATE;
  IF attempt.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'intent');
  END IF;
  IF attempt.actor_id IS DISTINCT FROM actor
    OR attempt.subscription_id IS DISTINCT FROM p_subscription
    OR attempt.location_id IS DISTINCT FROM chosen_location
  THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF attempt.state = 'INTENT_RECORDED' THEN
    UPDATE admin_private.commercial_agent_test_attempts recorded
    SET state = 'CREATION_IN_PROGRESS',
        creation_claimed_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE recorded.id = attempt.id
      AND recorded.state = 'INTENT_RECORDED'
    RETURNING * INTO claimed;
    IF claimed.id IS NULL THEN
      SELECT * INTO attempt
      FROM admin_private.commercial_agent_test_attempts recorded
      WHERE recorded.id = attempt.id;
      RETURN admin_private.commercial_agent_test_attempt_status_v1(attempt);
    END IF;
    snapshot := admin_private.commercial_agent_test_attempt_status_v1(claimed);
    RETURN jsonb_build_object(
      'status', 'claimed',
      'attemptState', 'CREATION_IN_PROGRESS',
      'agentRef', snapshot ->> 'agentRef',
      'agentVersion', snapshot -> 'agentVersion'
    );
  END IF;
  RETURN admin_private.commercial_agent_test_attempt_status_v1(attempt);
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_claim_agent_test_creation_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Claims provider creation once for an intent that has not contacted the provider. A repeated claim does not become claimed again.';

REVOKE ALL ON FUNCTION public.admin_commercial_claim_agent_test_creation_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_claim_agent_test_creation_v1(text, uuid, uuid, integer, text, jsonb)
  TO service_role;

CREATE FUNCTION public.admin_commercial_record_agent_test_creation_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
  p_environment text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  attempt admin_private.commercial_agent_test_attempts;
  stored admin_private.commercial_agent_test_attempts;
  outcome text;
  echoed_agent text;
  echoed_version integer;
  echoed_agent_present boolean;
  echoed_version_present boolean;
  created_ok boolean;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_environment IS NULL OR p_environment NOT IN ('dev', 'production')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) AS key
    WHERE key NOT IN (
      'outcome', 'providerCallId', 'transport', 'echoedAgentId', 'echoedAgentVersion'
    )
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  outcome := p_payload ->> 'outcome';
  IF outcome IS NULL OR outcome NOT IN ('rejected', 'uncertain', 'created') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  SELECT * INTO attempt
  FROM admin_private.commercial_agent_test_attempts recorded
  WHERE recorded.initiation_request_id = p_request
  FOR UPDATE;
  IF attempt.id IS NULL OR attempt.actor_id IS DISTINCT FROM actor
    OR attempt.subscription_id IS DISTINCT FROM p_subscription
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'intent');
  END IF;
  IF attempt.state IS DISTINCT FROM 'CREATION_IN_PROGRESS' THEN
    RETURN admin_private.commercial_agent_test_attempt_status_v1(attempt);
  END IF;

  IF outcome = 'rejected' THEN
    IF p_payload ? 'providerCallId' AND (p_payload -> 'providerCallId') IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    UPDATE admin_private.commercial_agent_test_attempts recorded
    SET state = 'FAILED_BEFORE_CREATION',
        reason = 'rejected',
        provider_call_id = NULL,
        updated_at = pg_catalog.clock_timestamp()
    WHERE recorded.id = attempt.id
      AND recorded.state = 'CREATION_IN_PROGRESS'
    RETURNING * INTO stored;
  ELSIF outcome = 'uncertain' THEN
    IF p_payload ? 'providerCallId'
      AND (p_payload -> 'providerCallId') IS DISTINCT FROM 'null'::jsonb
      AND (
        (p_payload ->> 'providerCallId') IS NULL
        OR (p_payload ->> 'providerCallId') !~ '^[A-Za-z0-9_-]{8,128}$'
      )
    THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    UPDATE admin_private.commercial_agent_test_attempts recorded
    SET state = 'REQUIRES_RECONCILIATION',
        reason = 'uncertain',
        provider_call_id = CASE
          WHEN (p_payload -> 'providerCallId') IS NOT DISTINCT FROM 'null'::jsonb THEN NULL
          WHEN NOT (p_payload ? 'providerCallId') THEN NULL
          ELSE p_payload ->> 'providerCallId'
        END,
        updated_at = pg_catalog.clock_timestamp()
    WHERE recorded.id = attempt.id
      AND recorded.state = 'CREATION_IN_PROGRESS'
    RETURNING * INTO stored;
  ELSE
    echoed_agent_present := false;
    echoed_version_present := false;
    IF p_payload ? 'echoedAgentId' AND (p_payload -> 'echoedAgentId') IS DISTINCT FROM 'null'::jsonb THEN
      echoed_agent_present := true;
    END IF;
    IF p_payload ? 'echoedAgentVersion' AND (p_payload -> 'echoedAgentVersion') IS DISTINCT FROM 'null'::jsonb THEN
      echoed_version_present := true;
    END IF;
    created_ok := false;
    IF (p_payload ->> 'providerCallId') ~ '^[A-Za-z0-9_-]{8,128}$'
      AND (p_payload ->> 'transport') = 'gateway'
      AND (NOT echoed_agent_present OR (p_payload ->> 'echoedAgentId') ~ '^[A-Za-z0-9_-]{8,128}$')
      AND (NOT echoed_version_present OR (p_payload ->> 'echoedAgentVersion') ~ '^[0-9]{1,9}$')
    THEN
      created_ok := true;
    END IF;
    IF NOT created_ok THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    echoed_agent := CASE WHEN echoed_agent_present THEN p_payload ->> 'echoedAgentId' ELSE NULL END;
    echoed_version := CASE WHEN echoed_version_present THEN (p_payload ->> 'echoedAgentVersion')::integer ELSE NULL END;
    UPDATE admin_private.commercial_agent_test_attempts recorded
    SET state = 'PROVIDER_CREATED',
        reason = 'created',
        provider_call_id = p_payload ->> 'providerCallId',
        transport = 'gateway',
        echoed_agent_ref = echoed_agent,
        echoed_agent_version = echoed_version,
        provider_echoed_agent = echoed_agent_present,
        provider_echoed_version = echoed_version_present,
        updated_at = pg_catalog.clock_timestamp()
    WHERE recorded.id = attempt.id
      AND recorded.state = 'CREATION_IN_PROGRESS'
    RETURNING * INTO stored;
  END IF;
  IF stored.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  RETURN jsonb_build_object('status', 'recorded', 'attemptState', stored.state, 'reason', stored.reason);
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_record_agent_test_creation_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Records the one claimed provider attempt as rejected, uncertain, or created. It does not invent a call id and does not bind a typed reference.';

REVOKE ALL ON FUNCTION public.admin_commercial_record_agent_test_creation_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_record_agent_test_creation_v1(text, uuid, uuid, integer, text, jsonb)
  TO service_role;

CREATE FUNCTION public.admin_commercial_bind_agent_test_call_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
  p_environment text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fingerprint text;
  receipt admin_private.commercial_command_receipts;
  intent admin_private.commercial_agent_test_intents;
  attempt admin_private.commercial_agent_test_attempts;
  binding admin_private.commercial_agent_test_bindings;
  cfg admin_private.commercial_location_configurations;
  preflight jsonb;
  stored_version integer;
  current_version integer;
  provision_state text;
  confirmed_agent boolean;
  confirmed_version boolean;
  outcome jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_environment IS NULL OR p_environment NOT IN ('dev', 'production')
    OR (admin_private.commercial_agent_test_context_v1(p_payload) ->> 'ok') IS DISTINCT FROM 'true'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;

  fingerprint := pg_catalog.md5(jsonb_build_object(
    'operation', 'bind_agent_test_call',
    'subscription', p_subscription,
    'version', p_version,
    'environment', p_environment,
    'request', p_request
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  SELECT * INTO receipt FROM admin_private.commercial_command_receipts WHERE request_id = p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.fingerprint = fingerprint THEN
      RETURN receipt.response;
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  SELECT * INTO attempt
  FROM admin_private.commercial_agent_test_attempts recorded
  WHERE recorded.initiation_request_id = p_request
  FOR UPDATE;
  IF attempt.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'intent');
  END IF;
  SELECT * INTO intent
  FROM admin_private.commercial_agent_test_intents recorded
  WHERE recorded.id = attempt.intent_id;
  IF intent.id IS NULL
    OR attempt.actor_id IS DISTINCT FROM actor
    OR intent.actor_id IS DISTINCT FROM actor
    OR intent.subscription_id IS DISTINCT FROM p_subscription
    OR intent.location_id IS DISTINCT FROM (p_payload ->> 'locationId')::uuid
    OR intent.environment IS DISTINCT FROM p_environment
    OR intent.configuration_version IS DISTINCT FROM (p_payload ->> 'configurationVersion')::integer
    OR intent.customer_id IS DISTINCT FROM (p_payload ->> 'customerId')::uuid
    OR intent.business_id IS DISTINCT FROM (p_payload ->> 'businessId')::uuid
  THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF attempt.state IS DISTINCT FROM 'PROVIDER_CREATED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'attempt', 'attemptState', attempt.state);
  END IF;
  IF attempt.provider_call_id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'attempt');
  END IF;
  IF pg_catalog.clock_timestamp() > intent.window_ends_at OR pg_catalog.clock_timestamp() < intent.window_starts_at THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'window');
  END IF;

  preflight := public.admin_commercial_agent_test_preflight_v1(
    p_token,
    p_subscription,
    p_version,
    (p_payload ->> 'customerId')::uuid,
    (p_payload ->> 'businessId')::uuid,
    (p_payload ->> 'locationId')::uuid,
    p_environment,
    (p_payload ->> 'onboardingRequestId')::uuid,
    (p_payload ->> 'onboardingVersion')::integer,
    (p_payload ->> 'preferenceVersion')::integer,
    (p_payload ->> 'configurationVersion')::integer,
    (p_payload ->> 'allocationId')::uuid,
    (p_payload ->> 'allocationVersion')::integer,
    (p_payload ->> 'instructionId')::uuid,
    (p_payload ->> 'instructionVersion')::integer,
    (p_payload ->> 'provisionVersion')::integer
  );
  IF (preflight ->> 'status') IS DISTINCT FROM 'eligible' THEN
    RETURN preflight;
  END IF;

  SELECT * INTO cfg
  FROM admin_private.commercial_location_configurations config
  WHERE config.subscription_id = intent.subscription_id
    AND config.location_id = intent.location_id
  ORDER BY config.version DESC
  LIMIT 1;
  stored_version := admin_private.commercial_agent_test_revision_number_v1(intent.provider_revision);
  current_version := admin_private.commercial_agent_test_revision_number_v1(cfg.provider_revision);
  IF cfg.id IS NULL
    OR cfg.id IS DISTINCT FROM intent.configuration_id
    OR cfg.version IS DISTINCT FROM intent.configuration_version
    OR cfg.agent_ref IS DISTINCT FROM intent.agent_ref
    OR cfg.environment IS DISTINCT FROM intent.environment
  THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  IF stored_version IS NULL OR current_version IS DISTINCT FROM stored_version THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'revision');
  END IF;
  IF attempt.provider_echoed_agent AND attempt.echoed_agent_ref IS DISTINCT FROM intent.agent_ref THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'agent', 'providerConfirmedAgent', false);
  END IF;
  IF attempt.provider_echoed_version AND attempt.echoed_agent_version IS DISTINCT FROM stored_version THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'revision', 'providerConfirmedVersion', false);
  END IF;
  confirmed_agent := false;
  confirmed_version := false;
  IF attempt.provider_echoed_agent AND attempt.echoed_agent_ref = intent.agent_ref THEN
    confirmed_agent := true;
  END IF;
  IF attempt.provider_echoed_version AND attempt.echoed_agent_version = stored_version THEN
    confirmed_version := true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM admin_private.commercial_agent_test_bindings existing
    WHERE existing.provider_call_id = attempt.provider_call_id
      AND existing.intent_id IS DISTINCT FROM intent.id
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'call');
  END IF;
  INSERT INTO admin_private.commercial_agent_test_bindings(intent_id, provider_call_id, bound_at)
  VALUES (intent.id, attempt.provider_call_id, pg_catalog.clock_timestamp())
  RETURNING * INTO binding;
  UPDATE admin_private.commercial_agent_test_attempts recorded
  SET state = 'BOUND',
      reason = 'bound',
      updated_at = pg_catalog.clock_timestamp()
  WHERE recorded.id = attempt.id
    AND recorded.state = 'PROVIDER_CREATED';

  SELECT provision.state INTO provision_state
  FROM public.service_provisions provision
  WHERE provision.entitlement_id = intent.entitlement_id;
  outcome := jsonb_build_object(
    'status', 'success',
    'attemptState', 'BOUND',
    'intentId', intent.id,
    'bindingId', binding.id,
    'sessionRef', intent.test_session_ref,
    'callId', binding.provider_call_id,
    'agentRef', intent.agent_ref,
    'agentVersion', stored_version,
    'providerConfirmedAgent', confirmed_agent,
    'providerConfirmedVersion', confirmed_version,
    'provisionState', provision_state,
    'forwardingVerified', false,
    'testPassed', false,
    'maxDurationSeconds', 600
  );
  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, outcome);
  RETURN outcome;
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_bind_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Binds the stored provider call id for this attempt after rechecking the session, subscription, location, agent, and test window. A typed call id is not accepted. It does not place a telephone call, enable forwarding, or move a service to live.';

REVOKE ALL ON FUNCTION public.admin_commercial_bind_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_bind_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  TO service_role;

CREATE FUNCTION public.admin_commercial_authorize_agent_test_cancel_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
  p_environment text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  attempt admin_private.commercial_agent_test_attempts;
  intent admin_private.commercial_agent_test_intents;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_environment IS NULL OR p_environment NOT IN ('dev', 'production')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 8000
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) AS key
    WHERE key NOT IN (
      'customerId', 'businessId', 'onboardingRequestId', 'onboardingVersion', 'locationId',
      'preferenceVersion', 'provisionVersion', 'configurationVersion', 'allocationId',
      'allocationVersion', 'instructionId', 'instructionVersion', 'confirmedCharge', 'providerCallId'
    )
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF (admin_private.commercial_agent_test_context_v1(p_payload - 'providerCallId') ->> 'ok') IS DISTINCT FROM 'true'
    OR (p_payload ->> 'providerCallId') IS NULL
    OR (p_payload ->> 'providerCallId') !~ '^[A-Za-z0-9_-]{8,128}$'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  SELECT * INTO attempt
  FROM admin_private.commercial_agent_test_attempts recorded
  WHERE recorded.initiation_request_id = p_request
  FOR UPDATE;
  IF attempt.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'attempt');
  END IF;
  SELECT * INTO intent
  FROM admin_private.commercial_agent_test_intents recorded
  WHERE recorded.id = attempt.intent_id;
  IF intent.id IS NULL
    OR attempt.actor_id IS DISTINCT FROM actor
    OR intent.actor_id IS DISTINCT FROM actor
    OR attempt.subscription_id IS DISTINCT FROM p_subscription
    OR intent.subscription_id IS DISTINCT FROM p_subscription
    OR attempt.location_id IS DISTINCT FROM (p_payload ->> 'locationId')::uuid
    OR intent.location_id IS DISTINCT FROM (p_payload ->> 'locationId')::uuid
    OR intent.environment IS DISTINCT FROM p_environment
  THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF attempt.provider_call_id IS DISTINCT FROM (p_payload ->> 'providerCallId') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'call');
  END IF;
  IF attempt.state = 'COMPLETED' THEN
    RETURN jsonb_build_object('status', 'completed', 'attemptState', 'COMPLETED', 'callId', attempt.provider_call_id, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  IF attempt.state = 'REQUIRES_RECONCILIATION' THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'attemptState', 'REQUIRES_RECONCILIATION', 'callId', attempt.provider_call_id, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  IF attempt.state IN ('BOUND', 'PROVIDER_CREATED') THEN
    RETURN jsonb_build_object('status', 'authorized', 'attemptState', attempt.state, 'callId', attempt.provider_call_id, 'environment', intent.environment, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  RETURN jsonb_build_object('status', 'denied', 'reason', 'attempt', 'attemptState', attempt.state);
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_authorize_agent_test_cancel_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Authorises cancellation only for the stored provider call on this controlled attempt. A different call id is rejected and does not stop anything. It does not mark the attempt ended.';

REVOKE ALL ON FUNCTION public.admin_commercial_authorize_agent_test_cancel_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_authorize_agent_test_cancel_v1(text, uuid, uuid, integer, text, jsonb)
  TO service_role;

CREATE FUNCTION public.admin_commercial_settle_agent_test_call_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
  p_environment text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  attempt admin_private.commercial_agent_test_attempts;
  intent admin_private.commercial_agent_test_intents;
  stored admin_private.commercial_agent_test_attempts;
  settlement text;
  basis text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_environment IS NULL OR p_environment NOT IN ('dev', 'production')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 8000
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) AS key
    WHERE key NOT IN ('outcome', 'providerCallId', 'callType', 'callStatus', 'locationId')
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  settlement := p_payload ->> 'outcome';
  IF settlement IS NULL OR settlement NOT IN ('ended', 'cancelled', 'uncertain', 'ongoing', 'telephone')
    OR (p_payload ->> 'providerCallId') IS NULL
    OR (p_payload ->> 'providerCallId') !~ '^[A-Za-z0-9_-]{8,128}$'
    OR (p_payload ->> 'locationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  SELECT * INTO attempt
  FROM admin_private.commercial_agent_test_attempts recorded
  WHERE recorded.initiation_request_id = p_request
  FOR UPDATE;
  IF attempt.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'attempt');
  END IF;
  SELECT * INTO intent
  FROM admin_private.commercial_agent_test_intents recorded
  WHERE recorded.id = attempt.intent_id;
  IF intent.id IS NULL
    OR attempt.actor_id IS DISTINCT FROM actor
    OR intent.subscription_id IS DISTINCT FROM p_subscription
    OR attempt.location_id IS DISTINCT FROM (p_payload ->> 'locationId')::uuid
    OR intent.environment IS DISTINCT FROM p_environment
  THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF attempt.provider_call_id IS DISTINCT FROM (p_payload ->> 'providerCallId') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'call');
  END IF;
  IF attempt.state = 'COMPLETED' THEN
    RETURN jsonb_build_object('status', 'completed', 'attemptState', 'COMPLETED', 'callId', attempt.provider_call_id, 'completionBasis', attempt.completion_basis, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  IF attempt.state NOT IN ('BOUND', 'PROVIDER_CREATED', 'REQUIRES_RECONCILIATION') THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'attempt', 'attemptState', attempt.state);
  END IF;
  IF (p_payload ->> 'callType') = 'phone_call' OR settlement = 'telephone' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'route', 'attemptState', attempt.state, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  IF settlement = 'ongoing' THEN
    RETURN jsonb_build_object('status', 'ongoing', 'attemptState', attempt.state, 'callId', attempt.provider_call_id, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  IF settlement = 'uncertain' THEN
    UPDATE admin_private.commercial_agent_test_attempts recorded
    SET state = 'REQUIRES_RECONCILIATION',
        reason = 'cancellation_uncertain',
        updated_at = pg_catalog.clock_timestamp()
    WHERE recorded.id = attempt.id
      AND recorded.state IN ('BOUND', 'PROVIDER_CREATED', 'REQUIRES_RECONCILIATION')
    RETURNING * INTO stored;
    IF stored.id IS NULL THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'reconciliation', 'attemptState', 'REQUIRES_RECONCILIATION', 'callId', stored.provider_call_id, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  basis := NULL;
  IF settlement = 'ended' AND (p_payload ->> 'callType') = 'web_call' AND (p_payload ->> 'callStatus') = 'ended' THEN
    basis := 'provider_ended';
  END IF;
  IF settlement = 'cancelled' AND (p_payload ->> 'callType') = 'web_call' THEN
    basis := 'provider_cancelled';
  END IF;
  IF basis IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'open', 'attemptState', attempt.state, 'forwardingVerified', false, 'testPassed', false);
  END IF;
  UPDATE admin_private.commercial_agent_test_attempts recorded
  SET state = 'COMPLETED',
      reason = basis,
      completion_basis = basis,
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  WHERE recorded.id = attempt.id
    AND recorded.state IN ('BOUND', 'PROVIDER_CREATED', 'REQUIRES_RECONCILIATION')
  RETURNING * INTO stored;
  IF stored.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  RETURN jsonb_build_object(
    'status', 'completed',
    'attemptState', 'COMPLETED',
    'callId', stored.provider_call_id,
    'completionBasis', stored.completion_basis,
    'forwardingVerified', false,
    'testPassed', false
  );
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_settle_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Completes a controlled attempt only after provider evidence that the matching web call ended or was cancelled. An uncertain cancellation stays in reconciliation. A telephone route is not changed. Closing a browser does not complete an attempt.';

REVOKE ALL ON FUNCTION public.admin_commercial_settle_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_settle_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  TO service_role;
