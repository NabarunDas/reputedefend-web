-- Forward-only. Do not apply 20261106120000 to DEV. Do not apply 20261106120000 to Production.
-- Records a controlled direct agent conversation test for one selected location.
-- A passed conversation is not proof that telephone forwarding or a live inbound route was verified.
-- It does not place a call, buy a number, write a routing binding, enable forwarding, or move a service to live.
-- A provider call lookup cannot prove that a call was a controlled staff test.
-- A typed call id and caller-editable provider metadata are not trusted correlation.
-- VERIFIED_PASSED requires a server-bound test intent for the same call, agent, version, environment, and location.
-- This command does not create a provider call and does not bind a typed call id.
-- 20261106120000 must not be applied to hosted DEV or Production.


CREATE TABLE admin_private.commercial_agent_test_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  business_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  location_id uuid NOT NULL,
  configuration_id uuid NOT NULL,
  configuration_version integer NOT NULL CHECK (configuration_version >= 1),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  agent_ref text NOT NULL CHECK (agent_ref ~ '^[A-Za-z0-9_-]{8,128}$'),
  allocation_id uuid NOT NULL,
  allocation_version integer NOT NULL CHECK (allocation_version >= 1),
  instruction_id uuid NOT NULL,
  instruction_version integer NOT NULL CHECK (instruction_version >= 1),
  provider_call_id text NOT NULL CHECK (provider_call_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  test_intent_id uuid,
  test_session_ref text,
  test_scope text NOT NULL CHECK (test_scope = 'AGENT_DIRECT'),
  outcome text NOT NULL CHECK (outcome IN ('PENDING_VERIFICATION', 'VERIFIED_PASSED', 'VERIFIED_FAILED', 'REQUIRES_REVIEW')),
  provider_status text NOT NULL CHECK (provider_status IN ('retrieved', 'not_found', 'unavailable', 'incomplete')),
  call_status text CHECK (call_status IS NULL OR call_status IN ('ended', 'error', 'ongoing', 'registered', 'unknown')),
  started_at timestamptz,
  ended_at timestamptz,
  qa jsonb NOT NULL,
  verified_at timestamptz,
  verifier_id uuid,
  evidence_source text NOT NULL CHECK (evidence_source IN ('PROVIDER_RETRIEVAL', 'PROVIDER_UNAVAILABLE')),
  attestation text NOT NULL CHECK (char_length(btrim(attestation)) BETWEEN 20 AND 500),
  request_id uuid NOT NULL UNIQUE,
  version integer NOT NULL CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (subscription_id, location_id, version),
  CONSTRAINT commercial_agent_test_evidence_verified CHECK (
    (outcome IN ('VERIFIED_PASSED', 'VERIFIED_FAILED') AND verified_at IS NOT NULL AND verifier_id IS NOT NULL)
    OR (outcome IN ('PENDING_VERIFICATION', 'REQUIRES_REVIEW') AND verified_at IS NULL)
  ),
  CONSTRAINT commercial_agent_test_evidence_controlled CHECK (
    outcome IS DISTINCT FROM 'VERIFIED_PASSED'
    OR (test_intent_id IS NOT NULL AND test_session_ref IS NOT NULL)
  )
);

CREATE UNIQUE INDEX commercial_agent_test_passed_call_idx
  ON admin_private.commercial_agent_test_evidence (provider_call_id)
  WHERE outcome = 'VERIFIED_PASSED';

COMMENT ON TABLE admin_private.commercial_agent_test_evidence IS
  'Append-only direct agent conversation tests. A passed row is not proof that telephone forwarding was verified. Recordings and transcripts are not stored here.';

ALTER TABLE admin_private.commercial_agent_test_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_agent_test_evidence FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_agent_test_evidence_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_agent_test_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TABLE admin_private.commercial_agent_test_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES admin_private.commercial_agent_test_evidence (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  location_id uuid NOT NULL,
  actor_id uuid,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation = 'verify_agent_test_call'),
  outcome text NOT NULL CHECK (outcome IN ('PENDING_VERIFICATION', 'VERIFIED_PASSED', 'VERIFIED_FAILED', 'REQUIRES_REVIEW')),
  version integer NOT NULL CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX commercial_agent_test_events_request_idx
  ON admin_private.commercial_agent_test_events (request_id, operation);

ALTER TABLE admin_private.commercial_agent_test_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_agent_test_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.commercial_agent_test_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_agent_test_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_agent_test_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

ALTER TABLE admin_private.onboarding_request_events
  DROP CONSTRAINT onboarding_request_events_operation_check;

ALTER TABLE admin_private.onboarding_request_events
  ADD CONSTRAINT onboarding_request_events_operation_check CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer',
    'issue_invitation', 'resend_invitation', 'revoke_invitation',
    'begin_setup', 'confirm_preferences', 'confirm_ai_configuration',
    'record_number_allocation', 'record_forwarding_instructions', 'verify_agent_test_call'
  ));

CREATE FUNCTION admin_private.commercial_agent_test_payload_ok_v1(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  evidence jsonb;
  qa jsonb;
  text_value text;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(p_payload) IS DISTINCT FROM ARRAY[
      'allocationId', 'allocationVersion', 'businessId', 'configurationVersion', 'customerId',
      'evidence', 'instructionId', 'instructionVersion', 'locationId', 'onboardingRequestId',
      'onboardingVersion', 'preferenceVersion', 'provisionVersion', 'qa'
    ]
  THEN
    RETURN false;
  END IF;
  evidence := p_payload -> 'evidence';
  qa := p_payload -> 'qa';
  IF jsonb_typeof(evidence) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(evidence) IS DISTINCT FROM ARRAY[
      'agentId', 'agentVersion', 'agentVersionQuality', 'availability', 'callId', 'callStatus', 'callType',
      'disconnectionReason', 'endedAt', 'environment', 'providerError', 'startedAt', 'testScope'
    ]
    OR jsonb_typeof(qa) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(qa) IS DISTINCT FROM ARRAY[
      'attestation', 'avoidsUnsupportedPromises', 'businessHours', 'callbackWindows', 'callerIdentity',
      'conclusion', 'enquiryDetails', 'escalation', 'greeting', 'languageVoice', 'staffConfirmed'
    ]
  THEN
    RETURN false;
  END IF;
  IF (p_payload ->> 'locationId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_payload ->> 'allocationId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_payload ->> 'instructionId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_payload ->> 'preferenceVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'provisionVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'configurationVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'allocationVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'instructionVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'onboardingVersion') !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;
  IF evidence ->> 'availability' NOT IN ('retrieved', 'not_found', 'unavailable', 'incomplete')
    OR evidence ->> 'environment' NOT IN ('dev', 'production')
    OR evidence ->> 'testScope' IS DISTINCT FROM 'AGENT_DIRECT'
    OR (evidence ->> 'callId') !~ '^[A-Za-z0-9_-]{8,128}$'
    OR jsonb_typeof(evidence -> 'providerError') IS DISTINCT FROM 'boolean'
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(evidence -> 'agentId') = 'null' THEN
    NULL;
  ELSIF (evidence ->> 'agentId') !~ '^[A-Za-z0-9_-]{8,128}$' THEN
    RETURN false;
  END IF;
  IF evidence ->> 'agentVersionQuality' = 'present' THEN
    IF jsonb_typeof(evidence -> 'agentVersion') = 'number' THEN
      IF (evidence #>> '{agentVersion}') !~ '^[0-9]{1,9}$' THEN
        RETURN false;
      END IF;
    ELSIF jsonb_typeof(evidence -> 'agentVersion') = 'string' THEN
      IF (evidence ->> 'agentVersion') !~ '^[A-Za-z0-9._-]{1,128}$' THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  ELSIF evidence ->> 'agentVersionQuality' IN ('missing', 'malformed') THEN
    IF jsonb_typeof(evidence -> 'agentVersion') IS DISTINCT FROM 'null' THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;
  IF jsonb_typeof(evidence -> 'callStatus') = 'null' THEN
    NULL;
  ELSIF evidence ->> 'callStatus' NOT IN ('ended', 'error', 'ongoing', 'registered', 'unknown') THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(evidence -> 'callType') = 'null' THEN
    NULL;
  ELSIF evidence ->> 'callType' NOT IN ('web_call', 'phone_call', 'unknown') THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(evidence -> 'disconnectionReason') = 'null' THEN
    NULL;
  ELSIF (evidence ->> 'disconnectionReason') !~ '^[a-z0-9_]{1,64}$' THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(evidence -> 'startedAt') = 'null' THEN
    NULL;
  ELSIF (evidence ->> 'startedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(evidence -> 'endedAt') = 'null' THEN
    NULL;
  ELSIF (evidence ->> 'endedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RETURN false;
  END IF;
  FOREACH text_value IN ARRAY ARRAY[
    'avoidsUnsupportedPromises', 'businessHours', 'callbackWindows', 'callerIdentity',
    'conclusion', 'enquiryDetails', 'escalation', 'greeting', 'languageVoice', 'staffConfirmed'
  ]
  LOOP
    IF jsonb_typeof(qa -> text_value) IS DISTINCT FROM 'boolean' THEN
      RETURN false;
    END IF;
  END LOOP;
  IF (qa ->> 'staffConfirmed') IS DISTINCT FROM 'true' THEN
    RETURN false;
  END IF;
  text_value := qa ->> 'attestation';
  IF text_value IS NULL OR btrim(text_value) IS DISTINCT FROM text_value OR char_length(text_value) NOT BETWEEN 20 AND 500 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION admin_private.commercial_agent_test_projection_v1(p_subscription uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  passed_note text := 'Your AI receptionist has passed its conversation test. We still need to confirm the final telephone connection before your service can go live.';
BEGIN
  WITH rows AS (
    SELECT location.id AS location_id,
           coalesce(nullif(btrim(location.location_name), ''), 'Selected location') AS location_name,
           config.version AS configuration_version,
           config.agent_ref,
           config.environment AS config_environment,
           pref.version AS preference_version,
           provision.record_version AS provision_version,
           alloc.id AS allocation_id,
           alloc.version AS allocation_version,
           alloc.e164,
           instruction.id AS instruction_id,
           instruction.version AS instruction_version,
           instruction.status AS instruction_status,
           evidence.version AS evidence_version,
           evidence.outcome AS evidence_outcome,
           evidence.provider_call_id,
           CASE
             WHEN evidence.outcome = 'VERIFIED_PASSED'
               AND provision.provider_test_outcome = 'PASSED'
               AND provision.provider_test_call_ref = evidence.provider_call_id
               AND provision.agent_test_passed_at IS NOT NULL
               AND provision.state = 'AWAITING_CONFIRMATION'
               THEN 'passed'
             WHEN evidence.outcome = 'VERIFIED_FAILED' THEN 'failed'
             WHEN evidence.outcome = 'REQUIRES_REVIEW' THEN 'review'
             WHEN evidence.outcome = 'PENDING_VERIFICATION' THEN 'pending'
             ELSE 'needed'
           END AS status
    FROM public.commercial_subscriptions sub
    JOIN public.onboarding_requests request
      ON request.commercial_subscription_id = sub.id
     AND request.customer_id = sub.customer_id
     AND request.business_id = sub.business_id
    JOIN admin_private.onboarding_request_locations selected
      ON selected.onboarding_request_id = request.id
    JOIN public.locations location
      ON location.id = selected.location_id
     AND location.business_id = sub.business_id
    LEFT JOIN public.product_entitlements entitlement
      ON entitlement.location_id = location.id
     AND entitlement.business_id = sub.business_id
     AND entitlement.commercial_subscription_id = sub.id
     AND entitlement.component_code = 'TELLOYA'
     AND entitlement.state IN ('PENDING', 'ELIGIBLE')
    LEFT JOIN public.service_provisions provision
      ON provision.entitlement_id = entitlement.id
     AND provision.location_id = location.id
     AND provision.business_id = sub.business_id
    LEFT JOIN LATERAL (
      SELECT preference.version
      FROM admin_private.commercial_location_preferences preference
      WHERE preference.subscription_id = sub.id
        AND preference.location_id = location.id
        AND preference.status = 'CONFIRMED'
      ORDER BY preference.version DESC
      LIMIT 1
    ) pref ON true
    LEFT JOIN LATERAL (
      SELECT config.version, config.agent_ref, config.environment
      FROM admin_private.commercial_location_configurations config
      WHERE config.subscription_id = sub.id
        AND config.location_id = location.id
      ORDER BY config.version DESC
      LIMIT 1
    ) config ON true
    LEFT JOIN LATERAL (
      SELECT candidate.id, candidate.version, candidate.e164
      FROM admin_private.commercial_location_allocations candidate
      WHERE candidate.subscription_id = sub.id
        AND candidate.location_id = location.id
        AND provision.provider_binding_ref = 'alloc:' || candidate.id::text
      ORDER BY candidate.version DESC
      LIMIT 1
    ) alloc ON true
    LEFT JOIN LATERAL (
      SELECT instruction.id, instruction.version, instruction.status
      FROM admin_private.commercial_forwarding_instructions instruction
      WHERE instruction.subscription_id = sub.id
        AND instruction.location_id = location.id
      ORDER BY instruction.version DESC
      LIMIT 1
    ) instruction ON true
    LEFT JOIN LATERAL (
      SELECT recorded.version, recorded.outcome, recorded.provider_call_id
      FROM admin_private.commercial_agent_test_evidence recorded
      WHERE recorded.subscription_id = sub.id
        AND recorded.location_id = location.id
      ORDER BY recorded.version DESC
      LIMIT 1
    ) evidence ON true
    WHERE sub.id = p_subscription
  )
  SELECT jsonb_build_object(
    'passedCount', count(*) FILTER (WHERE status = 'passed'),
    'reviewCount', count(*) FILTER (WHERE status = 'review'),
    'failedCount', count(*) FILTER (WHERE status = 'failed'),
    'pendingCount', count(*) FILTER (WHERE status = 'pending'),
    'locationCount', count(*),
    'admin', jsonb_build_object(
      'passedCount', count(*) FILTER (WHERE status = 'passed'),
      'reviewCount', count(*) FILTER (WHERE status = 'review'),
      'failedCount', count(*) FILTER (WHERE status = 'failed'),
      'pendingCount', count(*) FILTER (WHERE status = 'pending'),
      'locationCount', count(*),
      'locations', coalesce(jsonb_agg(jsonb_build_object(
        'locationId', location_id,
        'locationName', location_name,
        'status', status,
        'configurationVersion', coalesce(configuration_version, 0),
        'preferenceVersion', coalesce(preference_version, 0),
        'provisionVersion', coalesce(provision_version, 0),
        'allocationId', allocation_id,
        'allocationVersion', coalesce(allocation_version, 0),
        'e164', e164,
        'agentRef', agent_ref,
        'environment', config_environment,
        'instructionId', CASE WHEN instruction_status = 'SHARED' THEN instruction_id ELSE NULL END,
        'instructionVersion', CASE WHEN instruction_status = 'SHARED' THEN instruction_version ELSE 0 END,
        'evidenceVersion', coalesce(evidence_version, 0),
        'latestOutcome', evidence_outcome,
        'providerCallId', provider_call_id
      ) ORDER BY location_name), '[]'::jsonb)
    ),
    'customer', jsonb_build_object(
      'state', CASE
        WHEN count(*) > 0 AND count(*) FILTER (WHERE status = 'passed') = count(*) THEN 'passed'
        WHEN count(*) FILTER (WHERE status = 'failed') > 0 THEN 'failed'
        WHEN count(*) FILTER (WHERE status = 'review') > 0 THEN 'review'
        WHEN count(*) FILTER (WHERE status = 'pending') > 0 THEN 'pending'
        ELSE 'needed'
      END,
      'passedCount', count(*) FILTER (WHERE status = 'passed'),
      'locationCount', count(*),
      'locations', coalesce(jsonb_agg(jsonb_build_object(
        'locationId', location_id,
        'locationName', location_name,
        'status', status,
        'note', CASE
          WHEN status = 'passed' THEN passed_note
          WHEN status = 'failed' THEN 'The conversation test did not pass. Telephone forwarding has not been checked, and the receptionist is not answering calls.'
          WHEN status = 'review' THEN 'The conversation test needs another check. Telephone forwarding has not been checked.'
          WHEN status = 'pending' THEN 'The conversation test is still being checked. Telephone forwarding has not been checked.'
          ELSE 'The conversation test has not been recorded. Telephone forwarding has not been checked.'
        END
      ) ORDER BY location_name), '[]'::jsonb)
    )
  )
  INTO result
  FROM rows;
  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION admin_private.commercial_setup_handover_v1(p_subscription uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  sub public.commercial_subscriptions;
  acceptance public.commercial_offer_acceptances;
  preparation_id uuid;
  preparation_acceptance uuid;
  preparation_customer uuid;
  preparation_business uuid;
  preparation_amount integer;
  preparation_currency char(3);
  preparation_cadence text;
  membership text;
  business_name text;
  customer_name text;
  evidence_count integer := 0;
  matching_count integer := 0;
  confirmed_at timestamptz;
  telloya_locations jsonb := '[]'::jsonb;
  guard_locations jsonb := '[]'::jsonb;
  provision_count integer := 0;
  provision_states text[] := ARRAY[]::text[];
  agent_ready boolean := false;
  number_ready boolean := false;
  test_ready boolean := false;
  confirmation_ready boolean := false;
  locations_covered boolean := false;
  live_ready boolean := false;
  verified boolean := false;
  financial text;
  operational text;
  preferences_complete boolean;
  confirmed_locations integer := 0;
  required_locations integer := 0;
  remaining_names text := '';
  preference_progress jsonb := '{"confirmedCount":0,"locationCount":0,"locations":[]}'::jsonb;
  service_preferences jsonb := '{"state":"needed","confirmedCount":0,"locationCount":0,"locations":[]}'::jsonb;
  projection jsonb;
  config_projection jsonb;
  configuration_progress jsonb := '{"recordedCount":0,"reviewCount":0,"locationCount":0,"locations":[]}'::jsonb;
  service_configuration jsonb := '{"state":"needed","recordedCount":0,"locationCount":0,"locations":[]}'::jsonb;
  allocation_projection jsonb;
  allocation_complete boolean := false;
  allocation_progress jsonb := '{"recordedCount":0,"locationCount":0,"locations":[]}'::jsonb;
  service_allocation jsonb := '{"state":"needed","recordedCount":0,"locationCount":0,"locations":[]}'::jsonb;
  forwarding_projection jsonb;
  forwarding_progress jsonb := '{"sharedCount":0,"reviewCount":0,"locationCount":0,"locations":[]}'::jsonb;
  service_forwarding jsonb := '{"state":"needed","sharedCount":0,"locationCount":0,"locations":[]}'::jsonb;
  test_projection jsonb;
  test_progress jsonb := '{"passedCount":0,"reviewCount":0,"failedCount":0,"pendingCount":0,"locationCount":0,"locations":[]}'::jsonb;
  service_test jsonb := '{"state":"needed","passedCount":0,"locationCount":0,"locations":[]}'::jsonb;
  guard_assignment text;
  display text;
  message text;
  next_action text;
BEGIN
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_subscription;
  IF sub.id IS NULL OR sub.grant_kind <> 'BILLABLE' OR sub.plan_family <> 'VOICE' THEN
    RETURN NULL;
  END IF;
  IF sub.state IN ('DRAFT', 'OFFERED', 'CANCELED', 'ENDED') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO acceptance FROM public.commercial_offer_acceptances WHERE subscription_id = sub.id;
  IF acceptance.id IS NULL
    OR acceptance.customer_id IS DISTINCT FROM sub.customer_id
    OR acceptance.business_id IS DISTINCT FROM sub.business_id
    OR acceptance.plan_version_id IS DISTINCT FROM sub.plan_version_id
    OR acceptance.product_code NOT IN ('TELLOYA', 'COMPLETE')
    OR acceptance.currency <> 'GBP'
    OR acceptance.cadence <> 'MONTH'
  THEN
    RETURN NULL;
  END IF;

  SELECT status INTO membership
  FROM public.business_memberships
  WHERE customer_id = sub.customer_id AND business_id = sub.business_id;
  IF membership IS DISTINCT FROM 'verified' THEN
    RETURN NULL;
  END IF;

  SELECT display_name INTO business_name FROM public.businesses WHERE id = sub.business_id;
  SELECT full_name INTO customer_name FROM public.customers WHERE id = sub.customer_id;

  SELECT id, acceptance_id, customer_id, business_id, amount_minor, currency, cadence
  INTO preparation_id, preparation_acceptance, preparation_customer, preparation_business,
       preparation_amount, preparation_currency, preparation_cadence
  FROM public.commercial_checkout_preparations
  WHERE subscription_id = sub.id;

  -- One evidence row must be the subscription's recorded period. A stale,
  -- renewal, or otherwise unrelated row is not proof of that period.
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE amount_minor = acceptance.amount_minor
             AND currency = 'GBP'
             AND sub.current_period_start IS NOT NULL
             AND sub.current_period_end IS NOT NULL
             AND period_start = sub.current_period_start
             AND period_end = sub.current_period_end
         )::integer,
         min(created_at) FILTER (
           WHERE amount_minor = acceptance.amount_minor
             AND currency = 'GBP'
             AND sub.current_period_start IS NOT NULL
             AND sub.current_period_end IS NOT NULL
             AND period_start = sub.current_period_start
             AND period_end = sub.current_period_end
         )
  INTO evidence_count, matching_count, confirmed_at
  FROM public.commercial_payment_evidence
  WHERE subscription_id = sub.id;

  verified := sub.state = 'ACTIVE'
    AND sub.amount_minor = acceptance.amount_minor
    AND sub.currency = 'GBP'
    AND sub.current_period_start IS NOT NULL
    AND sub.current_period_end IS NOT NULL
    AND sub.current_period_end > sub.current_period_start
    AND evidence_count = 1
    AND matching_count = 1
    AND preparation_id IS NOT NULL
    AND preparation_acceptance = acceptance.id
    AND preparation_customer = sub.customer_id
    AND preparation_business = sub.business_id
    AND preparation_amount = acceptance.amount_minor
    AND preparation_currency = 'GBP'
    AND preparation_cadence = 'MONTH';
  IF sub.state = 'PAYMENT_PENDING' THEN
    financial := 'awaiting_payment';
  ELSIF verified THEN
    financial := 'verified';
  ELSE
    financial := 'unverified';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'locationId', chosen.id,
    'locationName', COALESCE(NULLIF(pg_catalog.btrim(chosen.location_name), ''), 'Selected location')
  ) ORDER BY chosen.id), '[]'::jsonb)
  INTO telloya_locations
  FROM (
    SELECT DISTINCT location.id, location.location_name
    FROM public.onboarding_requests request
    JOIN admin_private.onboarding_request_locations selected
      ON selected.onboarding_request_id = request.id
    JOIN public.locations location
      ON location.id = selected.location_id
     AND location.business_id = sub.business_id
    WHERE request.commercial_subscription_id = sub.id
      AND request.customer_id = sub.customer_id
      AND request.business_id = sub.business_id
  ) chosen;

  -- Selected onboarding locations are not Guard assignments. Name a Guard
  -- location only from an open bundle allocation for this subscription.
  IF acceptance.guard_quantity > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'locationId', location.id,
      'locationName', COALESCE(NULLIF(pg_catalog.btrim(location.location_name), ''), 'Selected location')
    ) ORDER BY location.id), '[]'::jsonb)
    INTO guard_locations
    FROM public.bundle_guard_allocations allocation
    JOIN public.locations location
      ON location.id = allocation.location_id
     AND location.business_id = allocation.business_id
    WHERE allocation.subscription_id = sub.id
      AND allocation.customer_id = sub.customer_id
      AND allocation.business_id = sub.business_id
      AND allocation.component_code = 'GUARD'
      AND allocation.state IN ('RESERVED', 'PREVIEW');
  END IF;
  guard_assignment := CASE
    WHEN acceptance.guard_quantity = 0 THEN 'not_applicable'
    WHEN jsonb_array_length(guard_locations) = 0 THEN 'pending_confirmation'
    ELSE 'recorded'
  END;

  SELECT count(*)::integer,
         COALESCE(array_agg(provision.state), ARRAY[]::text[]),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.agent_configured_at IS NOT NULL
         ), false),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.provider_binding_ref IS NOT NULL
           AND pg_catalog.btrim(provision.provider_binding_ref) <> ''
           AND provision.number_allocated_at IS NOT NULL
           AND provision.forwarding_instructed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.provider_test_call_ref IS NOT NULL
           AND pg_catalog.btrim(provision.provider_test_call_ref) <> ''
           AND provision.provider_test_outcome = 'PASSED'
           AND provision.agent_test_passed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.customer_confirmed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(provision.state IS NOT DISTINCT FROM 'LIVE' AND provision.live_at IS NOT NULL), false)
  INTO provision_count, provision_states, agent_ready, number_ready, test_ready, confirmation_ready, live_ready
  FROM public.product_entitlements entitlement
  JOIN public.service_provisions provision ON provision.entitlement_id = entitlement.id
  WHERE entitlement.commercial_subscription_id = sub.id
    AND entitlement.business_id = sub.business_id
    AND entitlement.component_code = 'TELLOYA'
    AND entitlement.state IN ('PENDING', 'ELIGIBLE');

  IF provision_count = 0 OR provision_states <@ ARRAY['NOT_STARTED']::text[] THEN
    operational := 'not_started';
  ELSIF provision_states <@ ARRAY['LIVE']::text[] AND live_ready THEN
    operational := 'active';
  ELSIF provision_states <@ ARRAY['READY_FOR_PROVIDER_VERIFICATION']::text[] THEN
    operational := 'awaiting_verification';
  ELSE
    operational := 'setup_started';
  END IF;

  SELECT provision_count > 0 AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(telloya_locations) AS selected(location)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.product_entitlements entitlement
      JOIN public.service_provisions provision ON provision.entitlement_id = entitlement.id
      WHERE entitlement.commercial_subscription_id = sub.id
        AND entitlement.business_id = sub.business_id
        AND entitlement.component_code = 'TELLOYA'
        AND entitlement.state IN ('PENDING', 'ELIGIBLE')
        AND entitlement.location_id = (selected.location ->> 'locationId')::uuid
        AND provision.business_id = entitlement.business_id
        AND provision.location_id = entitlement.location_id
    )
  ) INTO locations_covered;

  -- Authoritative confirmed preference rows complete this step. A DRAFT row,
  -- a selected location, payment, or PROFILE_REQUIRED does not.
  -- A READY provision state does not fill any missing check below.
  preferences_complete := false;
  projection := admin_private.commercial_preference_projection_v1(sub.id);
  confirmed_locations := coalesce((projection ->> 'confirmedCount')::integer, 0);
  required_locations := coalesce((projection ->> 'locationCount')::integer, 0);
  remaining_names := coalesce(projection ->> 'remainingNames', '');
  preference_progress := coalesce(projection -> 'progress', preference_progress);
  service_preferences := coalesce(projection -> 'customer', service_preferences);
  IF financial = 'verified'
    AND operational IN ('setup_started', 'awaiting_verification')
    AND required_locations > 0
    AND confirmed_locations = required_locations
  THEN
    preferences_complete := true;
  END IF;
  config_projection := admin_private.commercial_configuration_projection_v1(sub.id);
  configuration_progress := coalesce(config_projection -> 'admin', configuration_progress);
  service_configuration := coalesce(config_projection -> 'customer', service_configuration);
  agent_ready := coalesce((config_projection ->> 'complete')::boolean, false);
  allocation_projection := admin_private.commercial_allocation_projection_v1(sub.id);
  allocation_complete := coalesce((allocation_projection ->> 'complete')::boolean, false);
  allocation_progress := coalesce(allocation_projection -> 'admin', allocation_progress);
  service_allocation := coalesce(allocation_projection -> 'customer', service_allocation);
  forwarding_projection := admin_private.commercial_forwarding_projection_v1(sub.id);
  forwarding_progress := coalesce(forwarding_projection -> 'admin', forwarding_progress);
  service_forwarding := coalesce(forwarding_projection -> 'customer', service_forwarding);
  test_projection := admin_private.commercial_agent_test_projection_v1(sub.id);
  test_progress := coalesce(test_projection -> 'admin', test_progress);
  service_test := coalesce(test_projection -> 'customer', service_test);

  IF financial = 'verified' AND operational = 'not_started' THEN
    display := 'Payment received — setup pending';
    message := 'Your subscription payment has been confirmed. We''re preparing your service and will guide you through the remaining setup steps.';
    next_action := 'Begin setup';
  ELSIF financial = 'verified' AND operational IN ('setup_started', 'awaiting_verification') THEN
    display := CASE
      WHEN operational = 'awaiting_verification' THEN 'Awaiting final verification'
      ELSE 'Setup in progress'
    END;
    message := NULL;
    next_action := CASE
      WHEN NOT preferences_complete THEN 'Confirm business preferences'
      WHEN NOT locations_covered THEN 'Begin setup'
      WHEN NOT agent_ready THEN 'Confirm AI configuration'
      WHEN NOT number_ready AND NOT allocation_complete THEN 'Record provider and number allocation'
      WHEN NOT number_ready THEN 'Record forwarding instructions'
      WHEN NOT test_ready THEN 'Verify AI receptionist test call'
      WHEN NOT confirmation_ready THEN 'Confirm readiness for the final telephone connection'
      WHEN operational = 'awaiting_verification' THEN 'Approve activation'
      ELSE 'Confirm business preferences'
    END;
    IF NOT preferences_complete AND remaining_names <> '' THEN
      message := 'Business preferences are still needed for ' || remaining_names || '.';
    END IF;
    IF preferences_complete AND NOT agent_ready AND coalesce(config_projection ->> 'reviewNames', '') <> '' THEN
      message := 'The AI configuration needs review for ' || (config_projection ->> 'reviewNames') || '.';
    ELSIF preferences_complete AND NOT agent_ready AND coalesce(config_projection ->> 'neededNames', '') <> '' THEN
      message := 'AI configuration is still needed for ' || (config_projection ->> 'neededNames') || '.';
    ELSIF preferences_complete AND agent_ready AND NOT allocation_complete AND NOT number_ready THEN
      message := 'Your AI receptionist configuration has been recorded. We''re completing the telephone setup and service checks.';
    ELSIF preferences_complete AND agent_ready AND NOT number_ready THEN
      message := 'Your receptionist number has been recorded. We''re preparing the forwarding instructions and final service checks.';
    ELSIF preferences_complete AND agent_ready AND number_ready AND NOT test_ready THEN
      message := 'Instructions ready — service testing pending. Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection.';
    ELSIF preferences_complete AND agent_ready AND number_ready AND test_ready AND NOT confirmation_ready THEN
      message := 'Your AI receptionist has passed its conversation test. We still need to confirm the final telephone connection before your service can go live.';
    END IF;
  ELSIF financial = 'verified' AND operational = 'active' THEN
    display := 'Service active';
    message := NULL;
    next_action := NULL;
  ELSE
    display := 'Payment pending';
    message := NULL;
    next_action := NULL;
    confirmed_at := NULL;
  END IF;

  RETURN jsonb_build_object(
    'reference', sub.public_ref,
    'customerName', customer_name,
    'businessId', sub.business_id,
    'businessName', business_name,
    'product', CASE acceptance.product_code WHEN 'COMPLETE' THEN 'Complete' ELSE 'Telloya' END,
    'plan', acceptance.plan_tier,
    'monthlyPriceMinor', acceptance.amount_minor,
    'currency', 'GBP',
    'locations', telloya_locations,
    'guardLocationCount', acceptance.guard_quantity,
    'guard', jsonb_build_object(
      'included', acceptance.guard_quantity > 0,
      'status', CASE WHEN acceptance.guard_quantity > 0 THEN 'pending_setup' ELSE 'not_subscribed' END,
      'quantity', acceptance.guard_quantity,
      'monitoringActive', false,
      'assignment', guard_assignment,
      'locations', guard_locations
    ),
    'financialStatus', financial,
    'paymentScope', CASE WHEN financial = 'verified' THEN 'initial_settlement' ELSE NULL END,
    'periodStart', CASE WHEN financial = 'verified' THEN sub.current_period_start ELSE NULL END,
    'periodEnd', CASE WHEN financial = 'verified' THEN sub.current_period_end ELSE NULL END,
    'operationalStatus', operational,
    'customerDisplay', display,
    'message', message,
    'paymentConfirmedAt', CASE WHEN financial = 'verified' THEN confirmed_at ELSE NULL END,
    'nextAction', next_action,
    'preferenceProgress', preference_progress,
    'servicePreferences', service_preferences,
    'configurationProgress', configuration_progress,
    'serviceConfiguration', service_configuration,
    'allocationProgress', allocation_progress,
    'serviceAllocation', service_allocation,
    'forwardingProgress', forwarding_progress,
    'serviceForwarding', service_forwarding,
    'testProgress', test_progress,
    'serviceTest', service_test,
    'checklist', jsonb_build_array(
      jsonb_build_object('key', 'payment', 'label', 'Payment confirmed', 'state', CASE WHEN financial = 'verified' THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'preferences', 'label', 'Business and service preferences', 'state', CASE WHEN preferences_complete THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'agent', 'label', 'AI receptionist configuration', 'state', CASE WHEN agent_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'number', 'label', 'Telephone number and forwarding', 'state', CASE WHEN number_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'test', 'label', 'AI receptionist test call', 'state', CASE WHEN test_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'activation', 'label', 'Service activation', 'state', CASE WHEN live_ready THEN 'complete' ELSE 'planned' END)
    )
  );
END;
$$;




REVOKE ALL ON FUNCTION admin_private.commercial_setup_handover_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_portal_setup_handover_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess jsonb;
  customer uuid;
  subscriptions jsonb;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  SELECT COALESCE(jsonb_agg(
    (built.item - 'customerName' - 'businessId' - 'plan' - 'monthlyPriceMinor' - 'currency' - 'guardLocationCount' - 'nextAction' - 'preferenceProgress' - 'configurationProgress' - 'allocationProgress' - 'forwardingProgress' - 'testProgress')
    ORDER BY built.item ->> 'reference'
  ), '[]'::jsonb)
  INTO subscriptions
  FROM (
    SELECT admin_private.commercial_setup_handover_v1(subscription.id) AS item
    FROM public.commercial_subscriptions subscription
    WHERE subscription.customer_id = customer
      AND subscription.grant_kind = 'BILLABLE'
      AND subscription.state IN ('ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE')
  ) built
  WHERE built.item IS NOT NULL;
  RETURN jsonb_build_object('subscriptions', subscriptions);
END;
$$;



REVOKE ALL ON FUNCTION public.customer_portal_setup_handover_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_setup_handover_v1(text) TO service_role;

COMMENT ON FUNCTION public.customer_portal_setup_handover_v1(text) IS
  'Read-only setup handover for the signed-in customer. A telephone number appears only after forwarding instructions are SHARED for that location. Shared instructions say not to enable forwarding yet. Provider agent references, staff attestation, and internal allocation evidence stay off this response.';





CREATE TABLE admin_private.commercial_agent_test_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  business_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  location_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  configuration_id uuid NOT NULL,
  configuration_version integer NOT NULL CHECK (configuration_version >= 1),
  agent_ref text NOT NULL CHECK (agent_ref ~ '^[A-Za-z0-9_-]{8,128}$'),
  provider_revision text NOT NULL CHECK (char_length(provider_revision) BETWEEN 1 AND 128),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  window_starts_at timestamptz NOT NULL,
  window_ends_at timestamptz NOT NULL,
  test_session_ref text NOT NULL UNIQUE CHECK (test_session_ref ~ '^TS-[0-9]{2}-[A-F0-9]{8}$'),
  provider_call_id text CHECK (provider_call_id IS NULL OR provider_call_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  correlation text NOT NULL CHECK (correlation IN ('UNBOUND', 'SERVER_BOUND')),
  bound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (window_ends_at > window_starts_at),
  CHECK (
    (correlation = 'UNBOUND' AND provider_call_id IS NULL AND bound_at IS NULL)
    OR (correlation = 'SERVER_BOUND' AND provider_call_id IS NOT NULL AND bound_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX commercial_agent_test_intent_call_idx
  ON admin_private.commercial_agent_test_intents (provider_call_id)
  WHERE provider_call_id IS NOT NULL;

COMMENT ON TABLE admin_private.commercial_agent_test_intents IS
  'Location-scoped controlled-test intent. SERVER_BOUND is written only by a server workflow that already knows the provider call id. A typed call id is not trusted correlation. The verification HTTP command does not bind a call and does not create a provider call.';

ALTER TABLE admin_private.commercial_agent_test_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_agent_test_intents FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_agent_test_intents_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_agent_test_intents
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE FUNCTION public.admin_commercial_agent_test_preflight_v1(
  p_token text,
  p_subscription uuid,
  p_version integer,
  p_customer uuid,
  p_business uuid,
  p_location uuid,
  p_environment text,
  p_onboarding uuid,
  p_onboarding_version integer,
  p_preference_version integer,
  p_configuration_version integer,
  p_allocation uuid,
  p_allocation_version integer,
  p_instruction uuid,
  p_instruction_version integer,
  p_provision_version integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.admin_sessions;
  sub public.commercial_subscriptions;
  req public.onboarding_requests;
  membership text;
  chosen_entitlement uuid;
  provision public.service_provisions;
  preference_version integer;
  configuration_version integer;
  configuration_environment text;
  allocation_version integer;
  instruction_version integer;
BEGIN
  IF p_token IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_customer IS NULL OR p_business IS NULL OR p_location IS NULL
    OR p_environment IS NULL OR p_environment NOT IN ('dev', 'production')
    OR p_onboarding IS NULL OR p_onboarding_version IS NULL OR p_onboarding_version < 1
    OR p_preference_version IS NULL OR p_preference_version < 1
    OR p_configuration_version IS NULL OR p_configuration_version < 1
    OR p_allocation IS NULL OR p_allocation_version IS NULL OR p_allocation_version < 1
    OR p_instruction IS NULL OR p_instruction_version IS NULL OR p_instruction_version < 1
    OR p_provision_version IS NULL OR p_provision_version < 1
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO s
  FROM public.admin_sessions session
  WHERE session.token_hash = p_token
    AND session.auth_user_id = public.admin_identity_id_v1()
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now()
    AND session.last_seen_at > pg_catalog.now() - interval '30 minutes';
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF s.created_at < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_subscription;
  IF sub.id IS NULL OR sub.grant_kind IS DISTINCT FROM 'BILLABLE' OR sub.plan_family IS DISTINCT FROM 'VOICE' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'subscription');
  END IF;
  IF sub.customer_id IS DISTINCT FROM p_customer OR sub.business_id IS DISTINCT FROM p_business THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'customer');
  END IF;
  IF sub.record_version IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  IF sub.state IN ('CANCELED', 'ENDED') OR sub.canceled_at IS NOT NULL OR sub.state IS DISTINCT FROM 'ACTIVE' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'inactive');
  END IF;
  IF sub.current_period_end IS NULL OR sub.current_period_end <= pg_catalog.now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'expired');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_payment_evidence evidence
    WHERE evidence.subscription_id = sub.id
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'payment');
  END IF;
  SELECT status INTO membership
  FROM public.business_memberships
  WHERE customer_id = sub.customer_id AND business_id = sub.business_id;
  IF membership IS DISTINCT FROM 'verified' THEN
    RETURN jsonb_build_object(
      'status', 'denied',
      'reason', CASE WHEN membership = 'revoked' THEN 'revoked' ELSE 'membership' END
    );
  END IF;
  SELECT * INTO req
  FROM public.onboarding_requests request
  WHERE request.id = p_onboarding
    AND request.commercial_subscription_id = sub.id
    AND request.customer_id = sub.customer_id
    AND request.business_id = sub.business_id;
  IF req.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'customer');
  END IF;
  IF req.record_version IS DISTINCT FROM p_onboarding_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  IF req.state IS DISTINCT FROM 'PROVISIONING' OR NOT EXISTS (
    SELECT 1 FROM admin_private.onboarding_request_locations selected
    WHERE selected.onboarding_request_id = req.id
      AND selected.location_id = p_location
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'location');
  END IF;
  SELECT entitlement.id INTO chosen_entitlement
  FROM public.product_entitlements entitlement
  JOIN public.service_provisions provision_row
    ON provision_row.entitlement_id = entitlement.id
   AND provision_row.location_id = entitlement.location_id
   AND provision_row.business_id = entitlement.business_id
  WHERE entitlement.location_id = p_location
    AND entitlement.business_id = sub.business_id
    AND entitlement.commercial_subscription_id = sub.id
    AND entitlement.component_code = 'TELLOYA'
    AND entitlement.state IN ('PENDING', 'ELIGIBLE');
  IF chosen_entitlement IS NOT NULL THEN
    SELECT * INTO provision FROM public.service_provisions WHERE entitlement_id = chosen_entitlement;
  END IF;
  IF chosen_entitlement IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'setup');
  END IF;
  IF provision.state IS DISTINCT FROM 'TEST_REQUIRED'
    OR provision.forwarding_instructed_at IS NULL
    OR provision.provider_test_call_ref IS NOT NULL
    OR provision.agent_test_passed_at IS NOT NULL
    OR provision.customer_confirmed_at IS NOT NULL
    OR provision.live_at IS NOT NULL
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'setup');
  END IF;
  IF provision.record_version IS DISTINCT FROM p_provision_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  SELECT preference.version INTO preference_version
  FROM admin_private.commercial_location_preferences preference
  WHERE preference.subscription_id = sub.id
    AND preference.location_id = p_location
    AND preference.status = 'CONFIRMED'
    AND preference.version = (
      SELECT max(latest.version)
      FROM admin_private.commercial_location_preferences latest
      WHERE latest.subscription_id = preference.subscription_id
        AND latest.location_id = preference.location_id
    );
  IF preference_version IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'preferences');
  END IF;
  IF preference_version IS DISTINCT FROM p_preference_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  SELECT config.version, config.environment
  INTO configuration_version, configuration_environment
  FROM admin_private.commercial_location_configurations config
  WHERE config.subscription_id = sub.id
    AND config.location_id = p_location
  ORDER BY config.version DESC
  LIMIT 1;
  IF configuration_version IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'configuration');
  END IF;
  IF configuration_version IS DISTINCT FROM p_configuration_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  IF configuration_environment IS DISTINCT FROM p_environment THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'environment');
  END IF;
  SELECT candidate.version INTO allocation_version
  FROM admin_private.commercial_location_allocations candidate
  WHERE candidate.id = p_allocation
    AND candidate.subscription_id = sub.id
    AND candidate.location_id = p_location
    AND candidate.business_id = sub.business_id
    AND provision.provider_binding_ref = 'alloc:' || candidate.id::text
    AND candidate.version = (
      SELECT max(latest.version)
      FROM admin_private.commercial_location_allocations latest
      WHERE latest.subscription_id = candidate.subscription_id
        AND latest.location_id = candidate.location_id
    );
  IF allocation_version IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'allocation');
  END IF;
  IF allocation_version IS DISTINCT FROM p_allocation_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  SELECT instruction.version INTO instruction_version
  FROM admin_private.commercial_forwarding_instructions instruction
  WHERE instruction.id = p_instruction
    AND instruction.subscription_id = sub.id
    AND instruction.location_id = p_location
    AND instruction.status = 'SHARED'
    AND instruction.allocation_id = p_allocation
    AND instruction.version = (
      SELECT max(latest.version)
      FROM admin_private.commercial_forwarding_instructions latest
      WHERE latest.subscription_id = instruction.subscription_id
        AND latest.location_id = instruction.location_id
    );
  IF instruction_version IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'setup');
  END IF;
  IF instruction_version IS DISTINCT FROM p_instruction_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  RETURN jsonb_build_object('status', 'eligible');
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_agent_test_preflight_v1(text, uuid, integer, uuid, uuid, uuid, text, uuid, integer, integer, integer, uuid, integer, uuid, integer, integer) IS
  'Read-only eligibility check before a provider call lookup. It does not place a call, bind a call id, or advance a service. The audited verification command rechecks every condition.';

REVOKE ALL ON FUNCTION public.admin_commercial_agent_test_preflight_v1(text, uuid, integer, uuid, uuid, uuid, text, uuid, integer, integer, integer, uuid, integer, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_agent_test_preflight_v1(text, uuid, integer, uuid, uuid, uuid, text, uuid, integer, integer, integer, uuid, integer, uuid, integer, integer)
  TO service_role;

CREATE FUNCTION admin_private.commercial_agent_test_trust_call_v1(
  p_token text,
  p_subscription uuid,
  p_location uuid,
  p_call_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.admin_sessions;
  cfg admin_private.commercial_location_configurations;
  provision public.service_provisions;
  session_ref text;
  intent_id uuid;
BEGIN
  IF p_call_id IS NULL OR p_call_id !~ '^[A-Za-z0-9_-]{8,128}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO s FROM public.admin_sessions session
  WHERE session.token_hash = p_token
    AND session.auth_user_id = public.admin_identity_id_v1()
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now()
    AND session.created_at >= pg_catalog.now() - interval '30 minutes';
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  SELECT * INTO cfg
  FROM admin_private.commercial_location_configurations config
  WHERE config.subscription_id = p_subscription
    AND config.location_id = p_location
  ORDER BY config.version DESC
  LIMIT 1;
  IF cfg.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'setup');
  END IF;
  SELECT * INTO provision
  FROM public.service_provisions service
  WHERE service.location_id = p_location
    AND service.business_id = cfg.business_id
    AND service.entitlement_id = cfg.entitlement_id;
  IF NOT FOUND OR provision.entitlement_id IS NULL OR provision.state IS DISTINCT FROM 'TEST_REQUIRED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'setup');
  END IF;
  session_ref := 'TS-' || to_char(pg_catalog.now(), 'YY') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  INSERT INTO admin_private.commercial_agent_test_intents(
    subscription_id, customer_id, business_id, entitlement_id, location_id, actor_id,
    configuration_id, configuration_version, agent_ref, provider_revision, environment,
    window_starts_at, window_ends_at, test_session_ref, provider_call_id, correlation, bound_at
  ) VALUES (
    cfg.subscription_id, cfg.customer_id, cfg.business_id, cfg.entitlement_id, cfg.location_id, s.auth_user_id,
    cfg.id, cfg.version, cfg.agent_ref, cfg.provider_revision, cfg.environment,
    pg_catalog.now() - interval '15 minutes', pg_catalog.now() + interval '20 minutes',
    session_ref, p_call_id, 'SERVER_BOUND', pg_catalog.now()
  ) RETURNING id INTO intent_id;
  RETURN jsonb_build_object('status', 'bound', 'testSessionRef', session_ref, 'intentId', intent_id);
END;
$$;

COMMENT ON FUNCTION admin_private.commercial_agent_test_trust_call_v1(text, uuid, uuid, text) IS
  'Records a server-bound controlled-test intent. The Admin verification HTTP command does not call this function. A provider call lookup cannot supply this correlation, and a typed call id is not accepted here from that command.';

REVOKE ALL ON FUNCTION admin_private.commercial_agent_test_trust_call_v1(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_private.commercial_agent_test_trust_call_v1(text, uuid, uuid, text)
  TO service_role;

CREATE FUNCTION public.admin_commercial_verify_agent_test_call_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
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
  sub public.commercial_subscriptions;
  req public.onboarding_requests;
  acceptance public.commercial_offer_acceptances;
  membership text;
  preparation_id uuid;
  preparation_acceptance uuid;
  preparation_customer uuid;
  preparation_business uuid;
  preparation_amount integer;
  preparation_currency char(3);
  preparation_cadence text;
  evidence_count integer := 0;
  matching_count integer := 0;
  telloya_quantity integer;
  plan_limit integer;
  raw_locations integer;
  owned_locations integer;
  preference_projection jsonb;
  chosen_location uuid;
  location_name text;
  business_name text;
  chosen_entitlement uuid;
  provision public.service_provisions;
  pref admin_private.commercial_location_preferences;
  cfg admin_private.commercial_location_configurations;
  alloc admin_private.commercial_location_allocations;
  current_instruction integer := 0;
  shared_count integer := 0;
  new_version integer;
  instruction_id uuid;
  claimed integer := 0;
  sharing text;
  mode text;
  env text;
  instruction_text text;
  prior_allocated timestamptz;
  prior_binding text;
  prior_forwarding timestamptz;
  shared_instruction admin_private.commercial_forwarding_instructions;
  recorded_outcome text;
  provider_status text;
  evidence_source text;
  call_reference text;
  evidence_version integer;
  evidence_id uuid;
  started_at timestamptz;
  ended_at timestamptz;
  qa_passed boolean := false;
  prior_configured timestamptz;
  intent_id uuid;
  intent_ref text;
  version_text text;
  controlled boolean := false;
  outcome jsonb := NULL;
  handover jsonb;
  forwarding_projection jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 16000
    OR jsonb_typeof(p_payload -> 'customerId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'customerId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'businessId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'businessId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingRequestId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'onboardingRequestId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingVersion') IS DISTINCT FROM 'number'
    OR NOT admin_private.commercial_agent_test_payload_ok_v1(p_payload)
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  fingerprint := md5(jsonb_build_object(
    'operation', 'verify_agent_test_call',
    'subscription', p_subscription,
    'version', p_version,
    'payload', p_payload
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
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

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'record-number-allocation:' || p_subscription::text || ':' || (p_payload ->> 'locationId'), 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'record-forwarding-instructions:' || p_subscription::text || ':' || (p_payload ->> 'locationId'), 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'verify-agent-test-call:' || p_subscription::text || ':' || (p_payload ->> 'locationId'), 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'verify-agent-test-call:call:' || coalesce(p_payload #>> '{evidence,callId}', ''), 0
  ));
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF sub.id IS NULL OR sub.grant_kind IS DISTINCT FROM 'BILLABLE' OR sub.plan_family IS DISTINCT FROM 'VOICE' THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'subscription');
  ELSIF sub.customer_id IS DISTINCT FROM (p_payload ->> 'customerId')::uuid
    OR sub.business_id IS DISTINCT FROM (p_payload ->> 'businessId')::uuid
  THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'customer');
  ELSIF sub.record_version IS DISTINCT FROM p_version THEN
    outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO req
    FROM public.onboarding_requests
    WHERE id = (p_payload ->> 'onboardingRequestId')::uuid
    FOR UPDATE;
    IF req.id IS NULL
      OR req.commercial_subscription_id IS DISTINCT FROM sub.id
      OR req.customer_id IS DISTINCT FROM sub.customer_id
      OR req.business_id IS DISTINCT FROM sub.business_id
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'customer');
    ELSIF req.state IN ('CLOSED', 'DECLINED') THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'closed');
    ELSIF req.state IS DISTINCT FROM 'PROVISIONING' THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    ELSIF req.record_version IS DISTINCT FROM (p_payload ->> 'onboardingVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    ELSIF NOT EXISTS (
      SELECT 1 FROM admin_private.commercial_setup_events event
      WHERE event.subscription_id = sub.id
        AND event.onboarding_request_id = req.id
        AND event.operation = 'begin_setup'
    ) THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT status INTO membership
    FROM public.business_memberships
    WHERE customer_id = sub.customer_id AND business_id = sub.business_id;
    IF membership IS DISTINCT FROM 'verified' THEN
      outcome := jsonb_build_object(
        'status', 'denied',
        'reason', CASE WHEN membership = 'revoked' THEN 'revoked' ELSE 'membership' END
      );
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO acceptance FROM public.commercial_offer_acceptances WHERE subscription_id = sub.id;
    IF acceptance.id IS NULL
      OR acceptance.customer_id IS DISTINCT FROM sub.customer_id
      OR acceptance.business_id IS DISTINCT FROM sub.business_id
      OR acceptance.plan_version_id IS DISTINCT FROM sub.plan_version_id
      OR acceptance.product_code NOT IN ('TELLOYA', 'COMPLETE')
      OR acceptance.currency <> 'GBP'
      OR acceptance.cadence <> 'MONTH'
      OR acceptance.amount_minor IS DISTINCT FROM sub.amount_minor
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'acceptance');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT id, acceptance_id, customer_id, business_id, amount_minor, currency, cadence
    INTO preparation_id, preparation_acceptance, preparation_customer, preparation_business,
         preparation_amount, preparation_currency, preparation_cadence
    FROM public.commercial_checkout_preparations
    WHERE subscription_id = sub.id;
    SELECT count(*)::integer,
           count(*) FILTER (
             WHERE amount_minor = acceptance.amount_minor
               AND currency = 'GBP'
               AND period_start = sub.current_period_start
               AND period_end = sub.current_period_end
           )::integer
    INTO evidence_count, matching_count
    FROM public.commercial_payment_evidence
    WHERE subscription_id = sub.id;
    IF sub.state IN ('CANCELED', 'ENDED') OR sub.canceled_at IS NOT NULL THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'inactive');
    ELSIF sub.current_period_end IS NOT NULL AND sub.current_period_end <= pg_catalog.now() THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'expired');
    ELSIF sub.state IS DISTINCT FROM 'ACTIVE'
      OR sub.amount_minor IS DISTINCT FROM acceptance.amount_minor
      OR sub.currency IS DISTINCT FROM 'GBP'
      OR sub.current_period_start IS NULL
      OR sub.current_period_end IS NULL
      OR sub.current_period_end <= sub.current_period_start
      OR evidence_count IS DISTINCT FROM 1
      OR matching_count IS DISTINCT FROM 1
      OR preparation_id IS NULL
      OR preparation_acceptance IS DISTINCT FROM acceptance.id
      OR preparation_customer IS DISTINCT FROM sub.customer_id
      OR preparation_business IS DISTINCT FROM sub.business_id
      OR preparation_amount IS DISTINCT FROM acceptance.amount_minor
      OR preparation_currency IS DISTINCT FROM 'GBP'
      OR preparation_cadence IS DISTINCT FROM 'MONTH'
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'payment');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    PERFORM 1
    FROM public.commercial_subscription_items item
    WHERE item.subscription_id = sub.id
    ORDER BY item.component_code
    FOR UPDATE;
    SELECT item.quantity INTO telloya_quantity
    FROM public.commercial_subscription_items item
    WHERE item.subscription_id = sub.id AND item.component_code = 'TELLOYA';
    SELECT component.quantity_limit INTO plan_limit
    FROM public.plan_components component
    WHERE component.plan_version_id = sub.plan_version_id
      AND component.component_code = 'TELLOYA';
    SELECT count(*)::integer INTO raw_locations
    FROM admin_private.onboarding_request_locations selected
    WHERE selected.onboarding_request_id = req.id;
    SELECT count(*)::integer INTO owned_locations
    FROM admin_private.onboarding_request_locations selected
    JOIN public.locations location
      ON location.id = selected.location_id
     AND location.business_id = sub.business_id
    WHERE selected.onboarding_request_id = req.id;
    IF raw_locations IS DISTINCT FROM owned_locations THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'location');
    ELSIF telloya_quantity IS NULL
      OR plan_limit IS NULL
      OR owned_locations IS DISTINCT FROM telloya_quantity
      OR telloya_quantity IS DISTINCT FROM plan_limit
      OR owned_locations < 1
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'quantities');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    preference_projection := admin_private.commercial_preference_projection_v1(sub.id);
    IF coalesce((preference_projection ->> 'complete')::boolean, false) IS NOT TRUE THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'preferences');
    END IF;
  END IF;

  chosen_location := (p_payload ->> 'locationId')::uuid;
  env := p_payload #>> '{evidence,environment}';
  sharing := 'SHARED';
  mode := 'UNANSWERED';
  instruction_text := repeat('x', 200);

  IF outcome IS NULL THEN
    SELECT coalesce(nullif(btrim(location.location_name), ''), 'Selected location'),
           business.display_name
    INTO location_name, business_name
    FROM admin_private.onboarding_request_locations selected
    JOIN public.locations location
      ON location.id = selected.location_id
     AND location.business_id = sub.business_id
    JOIN public.businesses business ON business.id = location.business_id
    WHERE selected.onboarding_request_id = req.id
      AND selected.location_id = chosen_location;
    IF location_name IS NULL OR business_name IS NULL THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'location');
    ELSE
      SELECT entitlement.id
      INTO chosen_entitlement
      FROM public.product_entitlements entitlement
      JOIN public.service_provisions provision_row
        ON provision_row.entitlement_id = entitlement.id
       AND provision_row.business_id = entitlement.business_id
       AND provision_row.location_id = entitlement.location_id
      WHERE entitlement.location_id = chosen_location
        AND entitlement.business_id = sub.business_id
        AND entitlement.commercial_subscription_id = sub.id
        AND entitlement.component_code = 'TELLOYA'
        AND entitlement.source_kind = 'COMMERCIAL_SUBSCRIPTION'
        AND entitlement.state IN ('PENDING', 'ELIGIBLE')
      FOR UPDATE OF provision_row;
      IF chosen_entitlement IS NULL THEN
        outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
      ELSE
        SELECT * INTO provision
        FROM public.service_provisions
        WHERE entitlement_id = chosen_entitlement
        FOR UPDATE;
      END IF;
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO pref
    FROM admin_private.commercial_location_preferences preference
    WHERE preference.subscription_id = sub.id
      AND preference.location_id = chosen_location
      AND preference.customer_id = sub.customer_id
      AND preference.business_id = sub.business_id
      AND preference.onboarding_request_id = req.id
      AND preference.entitlement_id = chosen_entitlement
      AND preference.status = 'CONFIRMED'
      AND preference.version = (
        SELECT max(latest.version)
        FROM admin_private.commercial_location_preferences latest
        WHERE latest.subscription_id = preference.subscription_id
          AND latest.location_id = preference.location_id
      )
    FOR UPDATE;
    IF pref.id IS NULL THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'preferences');
    ELSIF pref.version IS DISTINCT FROM (p_payload ->> 'preferenceVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO cfg
    FROM admin_private.commercial_location_configurations config
    WHERE config.subscription_id = sub.id
      AND config.location_id = chosen_location
      AND config.customer_id = sub.customer_id
      AND config.business_id = sub.business_id
    ORDER BY config.version DESC
    LIMIT 1;
    IF cfg.id IS NULL
      OR cfg.preference_id IS DISTINCT FROM pref.id
      OR cfg.preference_version IS DISTINCT FROM pref.version
      OR cfg.entitlement_id IS DISTINCT FROM chosen_entitlement
      OR provision.agent_configured_at IS NULL
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'configuration');
    ELSIF cfg.version IS DISTINCT FROM (p_payload ->> 'configurationVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    ELSIF cfg.environment IS DISTINCT FROM env THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'environment');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO alloc
    FROM admin_private.commercial_location_allocations candidate
    WHERE candidate.entitlement_id = chosen_entitlement
      AND candidate.location_id = chosen_location
      AND candidate.business_id = sub.business_id
      AND candidate.subscription_id = sub.id
      AND candidate.customer_id = sub.customer_id
      AND candidate.id = (
        CASE
          WHEN provision.provider_binding_ref ~ '^alloc:[0-9a-f-]{36}$'
          THEN pg_catalog.substr(provision.provider_binding_ref, 7)::uuid
          ELSE NULL
        END
      )
      AND candidate.version = (
        SELECT max(latest.version)
        FROM admin_private.commercial_location_allocations latest
        WHERE latest.subscription_id = candidate.subscription_id
          AND latest.location_id = candidate.location_id
      );
    IF alloc.id IS NULL
      OR alloc.id IS DISTINCT FROM (p_payload ->> 'allocationId')::uuid
      OR alloc.e164 IS NULL
      OR provision.number_allocated_at IS NULL
      OR provision.provider_binding_ref IS DISTINCT FROM ('alloc:' || alloc.id::text)
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'allocation');
    ELSIF alloc.version IS DISTINCT FROM (p_payload ->> 'allocationVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    ELSIF alloc.environment IS DISTINCT FROM env THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'environment');
    ELSIF alloc.agent_ref IS DISTINCT FROM cfg.agent_ref THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'provider');
    ELSIF provision.record_version IS DISTINCT FROM (p_payload ->> 'provisionVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    ELSIF provision.provider_test_call_ref IS NOT NULL
      OR provision.agent_test_passed_at IS NOT NULL
      OR provision.customer_confirmed_at IS NOT NULL
      OR provision.live_at IS NOT NULL
      OR provision.state IS NOT DISTINCT FROM 'LIVE'
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    ELSIF provision.state IS DISTINCT FROM 'TEST_REQUIRED'
      OR provision.forwarding_instructed_at IS NULL
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO shared_instruction
    FROM admin_private.commercial_forwarding_instructions instruction
    WHERE instruction.subscription_id = sub.id
      AND instruction.location_id = chosen_location
      AND instruction.id = (p_payload ->> 'instructionId')::uuid
      AND instruction.status = 'SHARED'
      AND instruction.shared_at IS NOT NULL
      AND instruction.allocation_id = alloc.id
      AND instruction.allocation_version = alloc.version
      AND instruction.configuration_version = cfg.version
      AND instruction.preference_version = pref.version
      AND instruction.version = (
        SELECT max(candidate.version)
        FROM admin_private.commercial_forwarding_instructions candidate
        WHERE candidate.subscription_id = instruction.subscription_id
          AND candidate.location_id = instruction.location_id
      );
    IF shared_instruction.id IS NULL THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    ELSIF shared_instruction.version IS DISTINCT FROM (p_payload ->> 'instructionVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    ELSIF provision.provider_test_outcome IS NOT NULL THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    call_reference := p_payload #>> '{evidence,callId}';
    PERFORM 1
    FROM admin_private.commercial_agent_test_evidence recorded
    WHERE recorded.provider_call_id = call_reference
    FOR UPDATE;
    IF EXISTS (
      SELECT 1
      FROM admin_private.commercial_agent_test_evidence recorded
      WHERE recorded.provider_call_id = call_reference
        AND (
          recorded.location_id IS DISTINCT FROM chosen_location
          OR recorded.business_id IS DISTINCT FROM sub.business_id
          OR recorded.subscription_id IS DISTINCT FROM sub.id
          OR recorded.outcome IN ('VERIFIED_PASSED', 'VERIFIED_FAILED')
        )
    ) THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'call');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    IF p_payload #>> '{evidence,availability}' = 'unavailable' THEN
      recorded_outcome := 'REQUIRES_REVIEW';
      provider_status := 'unavailable';
      evidence_source := 'PROVIDER_UNAVAILABLE';
    ELSIF p_payload #>> '{evidence,availability}' = 'not_found' THEN
      recorded_outcome := 'REQUIRES_REVIEW';
      provider_status := 'not_found';
      evidence_source := 'PROVIDER_RETRIEVAL';
    ELSIF p_payload #>> '{evidence,availability}' = 'incomplete' THEN
      recorded_outcome := 'PENDING_VERIFICATION';
      provider_status := 'incomplete';
      evidence_source := 'PROVIDER_RETRIEVAL';
    ELSIF p_payload #>> '{evidence,availability}' IS DISTINCT FROM 'retrieved' THEN
      recorded_outcome := 'REQUIRES_REVIEW';
      provider_status := 'incomplete';
      evidence_source := 'PROVIDER_RETRIEVAL';
    ELSIF p_payload #>> '{evidence,environment}' IS DISTINCT FROM cfg.environment
      OR alloc.environment IS DISTINCT FROM cfg.environment
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'environment');
    ELSIF p_payload #>> '{evidence,callType}' IS DISTINCT FROM 'web_call'
      OR p_payload #>> '{evidence,testScope}' IS DISTINCT FROM 'AGENT_DIRECT'
    THEN
      recorded_outcome := 'REQUIRES_REVIEW';
      provider_status := 'retrieved';
      evidence_source := 'PROVIDER_RETRIEVAL';
    ELSIF p_payload #>> '{evidence,agentId}' IS DISTINCT FROM cfg.agent_ref THEN
      recorded_outcome := 'VERIFIED_FAILED';
      provider_status := 'retrieved';
      evidence_source := 'PROVIDER_RETRIEVAL';
    ELSIF p_payload #>> '{evidence,agentVersionQuality}' IS DISTINCT FROM 'present'
      OR jsonb_typeof(p_payload #> '{evidence,agentVersion}') NOT IN ('number', 'string')
    THEN
      recorded_outcome := 'REQUIRES_REVIEW';
      provider_status := 'retrieved';
      evidence_source := 'PROVIDER_RETRIEVAL';
    ELSE
      provider_status := 'retrieved';
      evidence_source := 'PROVIDER_RETRIEVAL';
      version_text := p_payload #>> '{evidence,agentVersion}';
      IF version_text IS DISTINCT FROM cfg.provider_revision THEN
        recorded_outcome := 'VERIFIED_FAILED';
      ELSIF (p_payload #>> '{evidence,providerError}') IS DISTINCT FROM 'false'
        OR p_payload #>> '{evidence,callStatus}' = 'error'
        OR coalesce(p_payload #>> '{evidence,disconnectionReason}', '') ~ '^error'
      THEN
        recorded_outcome := 'VERIFIED_FAILED';
      ELSE
        IF jsonb_typeof(p_payload #> '{evidence,startedAt}') = 'string' THEN
          started_at := (p_payload #>> '{evidence,startedAt}')::timestamptz;
        END IF;
        IF jsonb_typeof(p_payload #> '{evidence,endedAt}') = 'string' THEN
          ended_at := (p_payload #>> '{evidence,endedAt}')::timestamptz;
        END IF;
        SELECT intent.id, intent.test_session_ref
        INTO intent_id, intent_ref
        FROM admin_private.commercial_agent_test_intents intent
        WHERE intent.subscription_id = sub.id
          AND intent.location_id = chosen_location
          AND intent.business_id = sub.business_id
          AND intent.customer_id = sub.customer_id
          AND intent.entitlement_id = chosen_entitlement
          AND intent.actor_id = actor
          AND intent.configuration_id = cfg.id
          AND intent.configuration_version = cfg.version
          AND intent.agent_ref = cfg.agent_ref
          AND intent.provider_revision = cfg.provider_revision
          AND intent.environment = cfg.environment
          AND intent.correlation = 'SERVER_BOUND'
          AND intent.provider_call_id = call_reference
          AND intent.window_starts_at <= coalesce(started_at, pg_catalog.now())
          AND intent.window_ends_at >= coalesce(started_at, pg_catalog.now())
        ORDER BY intent.bound_at DESC
        LIMIT 1
        FOR UPDATE;
        controlled := intent_id IS NOT NULL;
        IF p_payload #>> '{evidence,callStatus}' IN ('registered', 'ongoing') THEN
          IF started_at IS NOT NULL AND (
            started_at < provision.agent_configured_at
            OR started_at > pg_catalog.now() + interval '2 minutes'
          ) THEN
            recorded_outcome := 'REQUIRES_REVIEW';
            ended_at := NULL;
          ELSIF NOT controlled THEN
            recorded_outcome := 'REQUIRES_REVIEW';
            ended_at := NULL;
          ELSE
            recorded_outcome := 'PENDING_VERIFICATION';
            ended_at := NULL;
          END IF;
        ELSIF p_payload #>> '{evidence,callStatus}' IS DISTINCT FROM 'ended'
          OR started_at IS NULL
          OR ended_at IS NULL
          OR started_at < provision.agent_configured_at
          OR ended_at <= started_at
          OR ended_at > pg_catalog.now() + interval '2 minutes'
        THEN
          recorded_outcome := 'REQUIRES_REVIEW';
        ELSIF NOT controlled THEN
          recorded_outcome := 'REQUIRES_REVIEW';
        ELSE
          qa_passed := (p_payload #>> '{qa,greeting}') = 'true'
            AND (p_payload #>> '{qa,languageVoice}') = 'true'
            AND (p_payload #>> '{qa,callerIdentity}') = 'true'
            AND (p_payload #>> '{qa,enquiryDetails}') = 'true'
            AND (p_payload #>> '{qa,callbackWindows}') = 'true'
            AND (p_payload #>> '{qa,businessHours}') = 'true'
            AND (p_payload #>> '{qa,escalation}') = 'true'
            AND (p_payload #>> '{qa,avoidsUnsupportedPromises}') = 'true'
            AND (p_payload #>> '{qa,conclusion}') = 'true'
            AND (p_payload #>> '{qa,staffConfirmed}') = 'true';
          recorded_outcome := CASE WHEN qa_passed THEN 'VERIFIED_PASSED' ELSE 'VERIFIED_FAILED' END;
        END IF;
      END IF;
    END IF;
  END IF;

  IF outcome IS NULL AND recorded_outcome IS NOT NULL THEN
    prior_allocated := provision.number_allocated_at;
    prior_binding := provision.provider_binding_ref;
    prior_forwarding := provision.forwarding_instructed_at;
    prior_configured := provision.agent_configured_at;
    SELECT coalesce(max(recorded.version), 0) + 1 INTO evidence_version
    FROM admin_private.commercial_agent_test_evidence recorded
    WHERE recorded.subscription_id = sub.id
      AND recorded.location_id = chosen_location;
    INSERT INTO admin_private.commercial_agent_test_evidence(
      subscription_id, customer_id, business_id, entitlement_id, location_id,
      configuration_id, configuration_version, environment, agent_ref,
      allocation_id, allocation_version, instruction_id, instruction_version,
      provider_call_id, test_intent_id, test_session_ref, test_scope, outcome, provider_status, call_status,
      started_at, ended_at, qa, verified_at, verifier_id, evidence_source,
      attestation, request_id, version
    ) VALUES (
      sub.id, sub.customer_id, sub.business_id, chosen_entitlement, chosen_location,
      cfg.id, cfg.version, cfg.environment, cfg.agent_ref,
      alloc.id, alloc.version, shared_instruction.id, shared_instruction.version,
      call_reference,
      CASE WHEN recorded_outcome = 'VERIFIED_PASSED' THEN intent_id ELSE NULL END,
      CASE WHEN recorded_outcome = 'VERIFIED_PASSED' THEN intent_ref ELSE NULL END,
      'AGENT_DIRECT', recorded_outcome, provider_status,
      CASE WHEN jsonb_typeof(p_payload #> '{evidence,callStatus}') = 'null' THEN NULL ELSE p_payload #>> '{evidence,callStatus}' END,
      started_at, ended_at,
      jsonb_build_object(
        'greeting', (p_payload #>> '{qa,greeting}')::boolean,
        'languageVoice', (p_payload #>> '{qa,languageVoice}')::boolean,
        'callerIdentity', (p_payload #>> '{qa,callerIdentity}')::boolean,
        'enquiryDetails', (p_payload #>> '{qa,enquiryDetails}')::boolean,
        'callbackWindows', (p_payload #>> '{qa,callbackWindows}')::boolean,
        'businessHours', (p_payload #>> '{qa,businessHours}')::boolean,
        'escalation', (p_payload #>> '{qa,escalation}')::boolean,
        'avoidsUnsupportedPromises', (p_payload #>> '{qa,avoidsUnsupportedPromises}')::boolean,
        'conclusion', (p_payload #>> '{qa,conclusion}')::boolean,
        'staffConfirmed', true
      ),
      CASE WHEN recorded_outcome IN ('VERIFIED_PASSED', 'VERIFIED_FAILED') THEN pg_catalog.now() ELSE NULL END,
      actor, evidence_source, p_payload #>> '{qa,attestation}', p_request, evidence_version
    ) RETURNING id INTO evidence_id;
    IF recorded_outcome = 'VERIFIED_PASSED' THEN
      UPDATE public.service_provisions
      SET state = 'AWAITING_CONFIRMATION',
          provider_test_call_ref = call_reference,
          provider_test_outcome = 'PASSED',
          agent_test_passed_at = pg_catalog.now()
      WHERE entitlement_id = chosen_entitlement
        AND state = 'TEST_REQUIRED'
        AND forwarding_instructed_at IS NOT DISTINCT FROM prior_forwarding
        AND number_allocated_at IS NOT DISTINCT FROM prior_allocated
        AND provider_binding_ref IS NOT DISTINCT FROM prior_binding
        AND agent_configured_at IS NOT DISTINCT FROM prior_configured
        AND provider_test_call_ref IS NULL
        AND provider_test_outcome IS NULL
        AND agent_test_passed_at IS NULL
        AND customer_confirmed_at IS NULL
        AND live_at IS NULL;
      GET DIAGNOSTICS claimed = ROW_COUNT;
      IF claimed IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'agent test changed a later service field';
      END IF;
    END IF;
    SELECT * INTO provision FROM public.service_provisions WHERE entitlement_id = chosen_entitlement;
    IF provision.number_allocated_at IS DISTINCT FROM prior_allocated
      OR provision.provider_binding_ref IS DISTINCT FROM prior_binding
      OR provision.forwarding_instructed_at IS DISTINCT FROM prior_forwarding
      OR provision.agent_configured_at IS DISTINCT FROM prior_configured
      OR provision.customer_confirmed_at IS NOT NULL
      OR provision.live_at IS NOT NULL
      OR provision.state IS NOT DISTINCT FROM 'LIVE'
      OR (
        recorded_outcome = 'VERIFIED_PASSED'
        AND (
          provision.state IS DISTINCT FROM 'AWAITING_CONFIRMATION'
          OR provision.provider_test_outcome IS DISTINCT FROM 'PASSED'
          OR provision.provider_test_call_ref IS DISTINCT FROM call_reference
          OR provision.agent_test_passed_at IS NULL
        )
      )
      OR (
        recorded_outcome IS DISTINCT FROM 'VERIFIED_PASSED'
        AND (
          provision.state IS DISTINCT FROM 'TEST_REQUIRED'
          OR provision.provider_test_call_ref IS NOT NULL
          OR provision.provider_test_outcome IS NOT NULL
          OR provision.agent_test_passed_at IS NOT NULL
        )
      )
    THEN
      RAISE EXCEPTION 'agent test changed a later service field';
    END IF;
    INSERT INTO admin_private.commercial_agent_test_events(
      evidence_id, subscription_id, location_id, actor_id, request_id, operation, outcome, version
    ) VALUES (
      evidence_id, sub.id, chosen_location, actor, p_request, 'verify_agent_test_call', recorded_outcome, evidence_version
    );
    PERFORM admin_private.onboarding_event_v1(
      req.id, actor, p_request, 'verify_agent_test_call', req.state, req.state,
      'Agent conversation test recorded. A passed conversation does not verify telephone forwarding.',
      jsonb_build_object(
        'locationId', chosen_location,
        'evidenceOutcome', recorded_outcome,
        'evidenceVersion', evidence_version,
        'testScope', 'AGENT_DIRECT'
      )
    );
    EXECUTE 'SELECT admin_private.commercial_setup_handover_v1($1)'
      INTO handover
      USING sub.id;
    IF handover IS NULL THEN
      RAISE EXCEPTION 'agent test did not match the setup checklist';
    END IF;
    outcome := jsonb_build_object(
      'status', 'success',
      'evidenceOutcome', recorded_outcome,
      'evidenceVersion', evidence_version,
      'providerStatus', provider_status,
      'provisionState', provision.state,
      'testPassed', provision.agent_test_passed_at IS NOT NULL,
      'routingActive', false,
      'forwardingVerified', false,
      'locationId', chosen_location,
      'nextAction', handover ->> 'nextAction'
    );
  END IF;

  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, outcome);
  RETURN outcome;
END;
$$;


COMMENT ON FUNCTION public.admin_commercial_verify_agent_test_call_v1(text, uuid, uuid, integer, jsonb) IS
  'Audited Admin record of a controlled direct agent conversation test for one selected location. A pass requires a server-bound test intent, the current agent version, a finished call with a valid duration, and completed staff QA. A provider lookup cannot prove the call was a controlled staff test. A typed call id is not bound here. A passed conversation may move TEST_REQUIRED to AWAITING_CONFIRMATION. It does not verify telephone forwarding, write a routing binding, place a call, or move a service to live.';

REVOKE ALL ON FUNCTION public.admin_commercial_verify_agent_test_call_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_verify_agent_test_call_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;
