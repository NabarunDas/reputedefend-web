-- Forward-only. Do not apply 20261106200000 to hosted DEV. Do not apply 20261106200000 to Production.
-- Opens a controlled web conversation for one selected location.
-- The server records the provider call id from its own create response.
-- A browser-typed call id is rejected and is not a binding.
-- The intent is written before the provider call exists.
-- The binding is a separate immutable row for that same request, actor, agent, and version.
-- This does not place a telephone call, buy a number, enable forwarding, write a routing binding, or move a service to live.
-- A passed conversation still requires the later verification command.
-- An unrecognised stored revision cannot open a call.
-- 20261106120000 and 20261106200000 must not be applied to hosted DEV or Production.

ALTER TABLE admin_private.commercial_agent_test_intents
  ADD COLUMN initiation_request_id uuid;

COMMENT ON COLUMN admin_private.commercial_agent_test_intents.initiation_request_id IS
  'Idempotency key of the server command that created this intent. It is not a provider call id.';

CREATE UNIQUE INDEX commercial_agent_test_intents_request_uidx
  ON admin_private.commercial_agent_test_intents (initiation_request_id);

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
  binding admin_private.commercial_agent_test_bindings;
  cfg admin_private.commercial_location_configurations;
  preflight jsonb;
  stored_version integer;
  opened_at timestamptz;
  session_ref text;
  chosen_customer uuid;
  chosen_business uuid;
  chosen_onboarding uuid;
  chosen_location uuid;
  chosen_allocation uuid;
  chosen_instruction uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
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
      'allocationVersion', 'instructionId', 'instructionVersion'
    )
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF (p_payload ->> 'customerId') IS NULL
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
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  chosen_customer := (p_payload ->> 'customerId')::uuid;
  chosen_business := (p_payload ->> 'businessId')::uuid;
  chosen_onboarding := (p_payload ->> 'onboardingRequestId')::uuid;
  chosen_location := (p_payload ->> 'locationId')::uuid;
  chosen_allocation := (p_payload ->> 'allocationId')::uuid;
  chosen_instruction := (p_payload ->> 'instructionId')::uuid;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'initiate-agent-test-call:' || p_subscription::text || ':' || chosen_location::text, 0
  ));

  SELECT * INTO intent
  FROM admin_private.commercial_agent_test_intents recorded
  WHERE recorded.initiation_request_id = p_request;
  IF intent.id IS NOT NULL THEN
    IF intent.actor_id IS DISTINCT FROM actor
      OR intent.subscription_id IS DISTINCT FROM p_subscription
      OR intent.customer_id IS DISTINCT FROM chosen_customer
      OR intent.business_id IS DISTINCT FROM chosen_business
      OR intent.location_id IS DISTINCT FROM chosen_location
      OR intent.environment IS DISTINCT FROM p_environment
      OR intent.configuration_version IS DISTINCT FROM (p_payload ->> 'configurationVersion')::integer
    THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    stored_version := admin_private.commercial_agent_test_revision_number_v1(intent.provider_revision);
    SELECT * INTO binding
    FROM admin_private.commercial_agent_test_bindings recorded_binding
    WHERE recorded_binding.intent_id = intent.id;
    IF binding.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'bound',
        'intentId', intent.id,
        'bindingId', binding.id,
        'sessionRef', intent.test_session_ref,
        'callId', binding.provider_call_id,
        'agentRef', intent.agent_ref,
        'agentVersion', stored_version,
        'environment', intent.environment,
        'forwardingVerified', false,
        'testPassed', false
      );
    END IF;
    RETURN jsonb_build_object(
      'status', 'prepared',
      'intentId', intent.id,
      'sessionRef', intent.test_session_ref,
      'agentRef', intent.agent_ref,
      'agentVersion', stored_version,
      'environment', intent.environment,
      'configurationId', intent.configuration_id,
      'configurationVersion', intent.configuration_version
    );
  END IF;

  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;

  preflight := public.admin_commercial_agent_test_preflight_v1(
    p_token,
    p_subscription,
    p_version,
    chosen_customer,
    chosen_business,
    chosen_location,
    p_environment,
    chosen_onboarding,
    (p_payload ->> 'onboardingVersion')::integer,
    (p_payload ->> 'preferenceVersion')::integer,
    (p_payload ->> 'configurationVersion')::integer,
    chosen_allocation,
    (p_payload ->> 'allocationVersion')::integer,
    chosen_instruction,
    (p_payload ->> 'instructionVersion')::integer,
    (p_payload ->> 'provisionVersion')::integer
  );
  IF (preflight ->> 'status') IS DISTINCT FROM 'eligible' THEN
    RETURN preflight;
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

  RETURN jsonb_build_object(
    'status', 'prepared',
    'intentId', intent.id,
    'sessionRef', intent.test_session_ref,
    'agentRef', intent.agent_ref,
    'agentVersion', stored_version,
    'environment', intent.environment,
    'configurationId', intent.configuration_id,
    'configurationVersion', intent.configuration_version
  );
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_prepare_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Records a pre-authorised test intent for one location before a provider call exists. It does not accept a call id, place a telephone call, or advance the service.';

REVOKE ALL ON FUNCTION public.admin_commercial_prepare_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_prepare_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
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
  binding admin_private.commercial_agent_test_bindings;
  stored_version integer;
  reported_version integer;
  reported_configuration integer;
  chosen_location uuid;
  provision_state text;
  outcome jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
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
      'allocationVersion', 'instructionId', 'instructionVersion',
      'providerCallId', 'reportedAgentId', 'reportedAgentVersion', 'callType'
    )
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF (p_payload ->> 'locationId') IS NULL
    OR (p_payload ->> 'locationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_payload ->> 'providerCallId') IS NULL
    OR (p_payload ->> 'providerCallId') !~ '^[A-Za-z0-9_-]{8,128}$'
    OR (p_payload ->> 'reportedAgentId') IS NULL
    OR (p_payload ->> 'reportedAgentId') !~ '^[A-Za-z0-9_-]{8,128}$'
    OR (p_payload ->> 'callType') IS DISTINCT FROM 'web_call'
    OR jsonb_typeof(p_payload -> 'reportedAgentVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'reportedAgentVersion') !~ '^[0-9]{1,9}$'
    OR jsonb_typeof(p_payload -> 'configurationVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'configurationVersion') !~ '^[1-9][0-9]*$'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  chosen_location := (p_payload ->> 'locationId')::uuid;
  reported_version := (p_payload ->> 'reportedAgentVersion')::integer;
  reported_configuration := (p_payload ->> 'configurationVersion')::integer;

  fingerprint := pg_catalog.md5(jsonb_build_object(
    'operation', 'bind_agent_test_call',
    'subscription', p_subscription,
    'version', p_version,
    'environment', p_environment,
    'payload', p_payload
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 0));
  SELECT * INTO receipt FROM admin_private.commercial_command_receipts WHERE request_id = p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.fingerprint = fingerprint THEN
      RETURN receipt.response;
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;

  SELECT * INTO intent
  FROM admin_private.commercial_agent_test_intents recorded
  WHERE recorded.initiation_request_id = p_request;
  IF intent.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'intent');
  END IF;
  IF intent.actor_id IS DISTINCT FROM actor
    OR intent.subscription_id IS DISTINCT FROM p_subscription
    OR intent.location_id IS DISTINCT FROM chosen_location
    OR intent.environment IS DISTINCT FROM p_environment
    OR intent.agent_ref IS DISTINCT FROM (p_payload ->> 'reportedAgentId')
    OR intent.configuration_version IS DISTINCT FROM reported_configuration
  THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  stored_version := admin_private.commercial_agent_test_revision_number_v1(intent.provider_revision);
  IF stored_version IS NULL OR reported_version IS DISTINCT FROM stored_version THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'revision');
  END IF;
  IF pg_catalog.clock_timestamp() > intent.window_ends_at THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'window');
  END IF;

  SELECT * INTO binding
  FROM admin_private.commercial_agent_test_bindings recorded_binding
  WHERE recorded_binding.intent_id = intent.id;
  IF binding.id IS NOT NULL AND binding.provider_call_id IS DISTINCT FROM (p_payload ->> 'providerCallId') THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'call');
  END IF;
  IF binding.id IS NULL AND EXISTS (
    SELECT 1 FROM admin_private.commercial_agent_test_bindings existing
    WHERE existing.provider_call_id = (p_payload ->> 'providerCallId')
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'call');
  END IF;
  IF binding.id IS NULL THEN
    INSERT INTO admin_private.commercial_agent_test_bindings(intent_id, provider_call_id, bound_at)
    VALUES (intent.id, p_payload ->> 'providerCallId', pg_catalog.clock_timestamp())
    RETURNING * INTO binding;
  END IF;

  SELECT provision.state INTO provision_state
  FROM public.service_provisions provision
  WHERE provision.entitlement_id = intent.entitlement_id;
  outcome := jsonb_build_object(
    'status', 'success',
    'intentId', intent.id,
    'bindingId', binding.id,
    'sessionRef', intent.test_session_ref,
    'callId', binding.provider_call_id,
    'agentRef', intent.agent_ref,
    'agentVersion', stored_version,
    'provisionState', provision_state,
    'forwardingVerified', false,
    'testPassed', false
  );
  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, outcome);
  RETURN outcome;
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_bind_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb) IS
  'Binds the provider call id returned to the server for the intent created by the same request. It does not accept a browser-typed reference as proof, place a telephone call, enable forwarding, or move a service to live.';

REVOKE ALL ON FUNCTION public.admin_commercial_bind_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_bind_agent_test_call_v1(text, uuid, uuid, integer, text, jsonb)
  TO service_role;
