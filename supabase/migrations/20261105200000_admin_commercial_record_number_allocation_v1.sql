-- 03A-03-03-02-04 Audited Record Provider and Number Allocation.
-- Forward-only. Not applied to hosted DEV. Do not apply 20261105200000 to DEV.
-- Do not apply 20261105200000 to Production.
-- appliedToDev stays false until a human applies this file.
-- The DEV ledger head remains 20261105120000. Begin setup 20261105130000,
-- confirm preferences 20261105144256, confirm AI configuration
-- 20261105172055, the tier catalogue 20261105180000, and the Guard offer
-- 20261105190000 are also unapplied and earlier.
-- This file does not include those catalogue or Guard changes.
--
-- One Admin command records an existing telephone allocation for one selected
-- location. It does not buy a number, call a provider, create an agent, or
-- turn routing on. OPERATOR_ATTESTED is staff evidence. It is not an
-- independent provider check and it is not proof that the number is routing
-- calls.
--
-- One E.164 number has one owner in this database, across customers,
-- businesses, locations, subscriptions, and both provider environments.
-- An inactive routing row does not release that number. This constraint does
-- not see a separate database, so DEV and Production projects do not enforce
-- uniqueness for each other. The same number keeps its owner when the same
-- location records a later correction. A replaced number stays owned here.

BEGIN;

CREATE TABLE admin_private.commercial_location_allocations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  business_id uuid NOT NULL,
  onboarding_request_id uuid NOT NULL,
  location_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  configuration_id uuid NOT NULL,
  configuration_version integer NOT NULL CHECK (configuration_version >= 1),
  preference_version integer NOT NULL CHECK (preference_version >= 1),
  version integer NOT NULL CHECK (version >= 1),
  provider text NOT NULL CHECK (provider = 'telloya_voice'),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  agent_ref text NOT NULL CHECK (agent_ref ~ '^[A-Za-z0-9_-]{8,128}$'),
  provider_revision text NOT NULL CHECK (char_length(btrim(provider_revision)) BETWEEN 4 AND 128),
  e164 text NOT NULL CHECK (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  allocation_ref text NOT NULL CHECK (allocation_ref ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  verification_basis text NOT NULL CHECK (verification_basis = 'OPERATOR_ATTESTED'),
  attestation text NOT NULL CHECK (char_length(btrim(attestation)) BETWEEN 20 AND 500),
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  request_id uuid NOT NULL UNIQUE,
  UNIQUE (subscription_id, location_id, version)
);

ALTER TABLE admin_private.commercial_location_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_location_allocations FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_location_allocations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_location_allocations
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TABLE admin_private.commercial_provider_number_owners (
  provider text NOT NULL CHECK (provider = 'telloya_voice'),
  e164 text NOT NULL CHECK (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  customer_id uuid NOT NULL,
  business_id uuid NOT NULL,
  location_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  PRIMARY KEY (provider, e164)
);

COMMENT ON TABLE admin_private.commercial_provider_number_owners IS
  'One telephone number has one owner in this database, including while inbound routing is inactive. The primary key does not include environment, so DEV and Production cannot both own the same number here. A separate database is not covered by this constraint.';

ALTER TABLE admin_private.commercial_provider_number_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_provider_number_owners FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.commercial_allocation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  allocation_id uuid NOT NULL REFERENCES admin_private.commercial_location_allocations (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  location_id uuid NOT NULL,
  actor_id uuid,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation = 'record_number_allocation'),
  version integer NOT NULL CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX commercial_allocation_events_request_idx
  ON admin_private.commercial_allocation_events (request_id, operation);

ALTER TABLE admin_private.commercial_allocation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_allocation_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.commercial_allocation_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_allocation_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_allocation_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

ALTER TABLE admin_private.onboarding_request_events
  DROP CONSTRAINT onboarding_request_events_operation_check;

ALTER TABLE admin_private.onboarding_request_events
  ADD CONSTRAINT onboarding_request_events_operation_check CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer',
    'issue_invitation', 'resend_invitation', 'revoke_invitation',
    'begin_setup', 'confirm_preferences', 'confirm_ai_configuration',
    'record_number_allocation'
  ));

CREATE FUNCTION admin_private.commercial_allocation_payload_ok_v1(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  provider jsonb;
  text_value text;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(p_payload) IS DISTINCT FROM ARRAY[
      'allocationVersion', 'businessId', 'configurationVersion', 'customerId', 'locationId',
      'onboardingRequestId', 'onboardingVersion', 'preferenceVersion', 'provider', 'provisionVersion'
    ]
  THEN
    RETURN false;
  END IF;
  provider := p_payload -> 'provider';
  IF jsonb_typeof(provider) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(provider) IS DISTINCT FROM ARRAY[
      'agentRef', 'allocationRef', 'attestation', 'e164', 'environment', 'provider', 'revision', 'staffConfirmed'
    ]
  THEN
    RETURN false;
  END IF;
  IF (p_payload ->> 'locationId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_payload ->> 'preferenceVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'provisionVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'configurationVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'allocationVersion') !~ '^(0|[1-9][0-9]*)$'
    OR (p_payload ->> 'onboardingVersion') !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;
  IF provider ->> 'provider' IS DISTINCT FROM 'telloya_voice'
    OR provider ->> 'environment' NOT IN ('dev', 'production')
  THEN
    RETURN false;
  END IF;
  text_value := provider ->> 'agentRef';
  IF text_value !~ '^[A-Za-z0-9_-]{8,128}$' THEN RETURN false; END IF;
  text_value := provider ->> 'revision';
  IF text_value IS NULL OR btrim(text_value) IS DISTINCT FROM text_value OR char_length(text_value) NOT BETWEEN 4 AND 128 THEN
    RETURN false;
  END IF;
  text_value := provider ->> 'e164';
  IF text_value !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN false; END IF;
  text_value := provider ->> 'allocationRef';
  IF text_value !~ '^[A-Za-z0-9_.:-]{8,128}$' THEN RETURN false; END IF;
  text_value := provider ->> 'attestation';
  IF text_value IS NULL OR btrim(text_value) IS DISTINCT FROM text_value OR char_length(text_value) NOT BETWEEN 20 AND 500 THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(provider -> 'staffConfirmed') IS DISTINCT FROM 'boolean'
    OR (provider ->> 'staffConfirmed') IS DISTINCT FROM 'true'
  THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_allocation_payload_ok_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.commercial_allocation_projection_v1(p_subscription uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH rows AS (
    SELECT location.id AS location_id,
           coalesce(nullif(btrim(location.location_name), ''), 'Selected location') AS location_name,
           alloc.id AS allocation_id,
           alloc.version AS allocation_version,
           alloc.e164,
           alloc.allocation_ref,
           alloc.environment AS allocation_environment,
           alloc.agent_ref AS allocation_agent,
           alloc.verification_basis,
           alloc.attestation,
           alloc.recorded_at,
           config.id AS configuration_id,
           config.version AS configuration_version,
           config.agent_ref AS configuration_agent,
           config.environment AS configuration_environment,
           pref.version AS preference_version,
           provision.record_version AS provision_version,
           CASE
             WHEN alloc.id IS NULL THEN 'needed'
             WHEN pref.id IS NULL
               OR config.id IS NULL
               OR config.preference_version IS DISTINCT FROM pref.version
               OR alloc.configuration_id IS DISTINCT FROM config.id
               OR alloc.configuration_version IS DISTINCT FROM config.version
               OR alloc.agent_ref IS DISTINCT FROM config.agent_ref
               OR alloc.environment IS DISTINCT FROM config.environment
               OR provision.number_allocated_at IS NULL
               OR provision.provider_binding_ref IS NULL
               OR provision.agent_configured_at IS NULL
               OR provision.state = 'PROFILE_REQUIRED'
               THEN 'review'
             ELSE 'recorded'
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
    LEFT JOIN admin_private.commercial_location_preferences pref
      ON pref.subscription_id = sub.id
     AND pref.location_id = location.id
     AND pref.customer_id = sub.customer_id
     AND pref.business_id = sub.business_id
     AND pref.status = 'CONFIRMED'
     AND pref.version = (
       SELECT max(latest.version)
       FROM admin_private.commercial_location_preferences latest
       WHERE latest.subscription_id = pref.subscription_id
         AND latest.location_id = pref.location_id
     )
    LEFT JOIN admin_private.commercial_location_configurations config
      ON config.subscription_id = sub.id
     AND config.location_id = location.id
     AND config.customer_id = sub.customer_id
     AND config.business_id = sub.business_id
     AND config.version = (
       SELECT max(latest.version)
       FROM admin_private.commercial_location_configurations latest
       WHERE latest.subscription_id = config.subscription_id
         AND latest.location_id = config.location_id
     )
    LEFT JOIN admin_private.commercial_location_allocations alloc
      ON alloc.subscription_id = sub.id
     AND alloc.location_id = location.id
     AND alloc.customer_id = sub.customer_id
     AND alloc.business_id = sub.business_id
     AND alloc.version = (
       SELECT max(latest.version)
       FROM admin_private.commercial_location_allocations latest
       WHERE latest.subscription_id = alloc.subscription_id
         AND latest.location_id = alloc.location_id
     )
    WHERE sub.id = p_subscription
  )
  SELECT jsonb_build_object(
    'recordedCount', count(*) FILTER (WHERE status = 'recorded'),
    'reviewCount', count(*) FILTER (WHERE status = 'review'),
    'locationCount', count(*),
    'complete', count(*) > 0 AND count(*) FILTER (WHERE status = 'recorded') = count(*),
    'admin', jsonb_build_object(
      'recordedCount', count(*) FILTER (WHERE status = 'recorded'),
      'reviewCount', count(*) FILTER (WHERE status = 'review'),
      'locationCount', count(*),
      'locations', coalesce(jsonb_agg(jsonb_build_object(
        'locationId', location_id,
        'locationName', location_name,
        'status', status,
        'allocationVersion', coalesce(allocation_version, 0),
        'configurationVersion', coalesce(configuration_version, 0),
        'preferenceVersion', coalesce(preference_version, 0),
        'provisionVersion', coalesce(provision_version, 0),
        'environment', CASE WHEN status = 'needed' THEN NULL ELSE coalesce(allocation_environment, configuration_environment) END,
        'agentRef', CASE WHEN status = 'needed' THEN NULL ELSE coalesce(allocation_agent, configuration_agent) END,
        'e164', CASE WHEN allocation_id IS NULL THEN NULL ELSE e164 END,
        'allocationRef', CASE WHEN allocation_id IS NULL THEN NULL ELSE allocation_ref END,
        'verificationBasis', CASE WHEN allocation_id IS NULL THEN NULL ELSE verification_basis END,
        'attestation', CASE WHEN allocation_id IS NULL THEN NULL ELSE attestation END,
        'recordedAt', CASE WHEN allocation_id IS NULL THEN NULL ELSE recorded_at END
      ) ORDER BY location_name, location_id), '[]'::jsonb)
    ),
    'customer', jsonb_build_object(
      'state', CASE
        WHEN count(*) > 0 AND count(*) FILTER (WHERE status = 'recorded') = count(*) THEN 'recorded'
        WHEN count(*) FILTER (WHERE status = 'review') > 0 THEN 'review'
        WHEN count(*) FILTER (WHERE status = 'recorded') > 0 THEN 'partial'
        ELSE 'needed'
      END,
      'recordedCount', count(*) FILTER (WHERE status = 'recorded'),
      'locationCount', count(*),
      'locations', coalesce(jsonb_agg(jsonb_build_object(
        'locationId', location_id,
        'locationName', location_name,
        'status', status,
        'note', CASE
          WHEN status = 'recorded'
            THEN 'Your receptionist number has been recorded. We''re preparing the forwarding instructions and final service checks.'
          WHEN status = 'review'
            THEN 'The recorded telephone number needs to be checked against the latest configuration. It is not active and forwarding is not ready.'
          ELSE 'A telephone number has not been recorded for this location. Forwarding is not ready and the receptionist cannot answer calls.'
        END
      ) ORDER BY location_name, location_id), '[]'::jsonb)
    )
  )
  INTO result
  FROM rows;
  RETURN coalesce(result, jsonb_build_object(
    'recordedCount', 0,
    'reviewCount', 0,
    'locationCount', 0,
    'complete', false,
    'admin', jsonb_build_object('recordedCount', 0, 'reviewCount', 0, 'locationCount', 0, 'locations', '[]'::jsonb),
    'customer', jsonb_build_object('state', 'needed', 'recordedCount', 0, 'locationCount', 0, 'locations', '[]'::jsonb)
  ));
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_allocation_projection_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

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
      WHEN NOT allocation_complete THEN 'Record provider and number allocation'
      WHEN NOT number_ready THEN 'Record forwarding instructions'
      WHEN NOT test_ready THEN 'Record successful test call'
      WHEN NOT confirmation_ready THEN 'Request customer forwarding confirmation'
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
    ELSIF preferences_complete AND agent_ready AND NOT allocation_complete THEN
      message := 'Your AI receptionist configuration has been recorded. We''re completing the telephone setup and service checks.';
    ELSIF preferences_complete AND agent_ready AND allocation_complete AND NOT number_ready THEN
      message := 'Your receptionist number has been recorded. We''re preparing the forwarding instructions and final service checks.';
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
    'checklist', jsonb_build_array(
      jsonb_build_object('key', 'payment', 'label', 'Payment confirmed', 'state', CASE WHEN financial = 'verified' THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'preferences', 'label', 'Business and service preferences', 'state', CASE WHEN preferences_complete THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'agent', 'label', 'AI receptionist configuration', 'state', CASE WHEN agent_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'number', 'label', 'Telephone number and forwarding', 'state', CASE WHEN number_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'test', 'label', 'Test call and verification', 'state', CASE WHEN test_ready THEN 'complete' ELSE 'planned' END),
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
    (built.item - 'customerName' - 'businessId' - 'plan' - 'monthlyPriceMinor' - 'currency' - 'guardLocationCount' - 'nextAction' - 'preferenceProgress' - 'configurationProgress' - 'allocationProgress')
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
  'Read-only setup handover for the signed-in customer. A recorded telephone number is not active and forwarding is not ready. Provider references, staff attestation, allocation evidence, and telephone numbers stay off this response.';


CREATE FUNCTION public.admin_commercial_record_number_allocation_v1(
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
  env text;
  agent text;
  revision text;
  chosen_number text;
  allocation_evidence text;
  current_allocation integer := 0;
  new_version integer;
  allocation_id uuid;
  claimed integer := 0;
  prior_binding text;
  prior_allocated timestamptz;
  outcome jsonb := NULL;
  handover jsonb;
  allocation_projection jsonb;
  config_projection jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 12000
    OR jsonb_typeof(p_payload -> 'customerId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'customerId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'businessId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'businessId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingRequestId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'onboardingRequestId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingVersion') IS DISTINCT FROM 'number'
    OR NOT admin_private.commercial_allocation_payload_ok_v1(p_payload)
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  fingerprint := md5(jsonb_build_object(
    'operation', 'record_number_allocation',
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
  env := p_payload #>> '{provider,environment}';
  agent := p_payload #>> '{provider,agentRef}';
  revision := p_payload #>> '{provider,revision}';
  chosen_number := p_payload #>> '{provider,e164}';
  allocation_evidence := p_payload #>> '{provider,allocationRef}';

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
    PERFORM 1
    FROM admin_private.commercial_location_configurations config
    WHERE config.subscription_id = sub.id
      AND config.location_id = chosen_location
    FOR UPDATE;
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
      OR provision.state = 'PROFILE_REQUIRED'
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'configuration');
    ELSIF cfg.version IS DISTINCT FROM (p_payload ->> 'configurationVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    ELSIF cfg.provider IS DISTINCT FROM 'telloya_voice'
      OR cfg.agent_ref IS DISTINCT FROM agent
      OR cfg.provider_revision IS DISTINCT FROM revision
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'provider');
    ELSIF cfg.environment IS DISTINCT FROM env THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'environment');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    IF provision.state IS NOT DISTINCT FROM 'LIVE' THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'live');
    ELSIF provision.forwarding_instructed_at IS NOT NULL
      OR provision.provider_test_call_ref IS NOT NULL
      OR provision.agent_test_passed_at IS NOT NULL
      OR provision.customer_confirmed_at IS NOT NULL
      OR provision.live_at IS NOT NULL
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    ELSIF provision.record_version IS DISTINCT FROM (p_payload ->> 'provisionVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    END IF;
  END IF;

  -- Lock the agent and the telephone number before any ownership read.
  -- The number lock does not depend on the customer, business, location, or
  -- environment. It is held until this transaction ends.
  IF outcome IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('telloya-voice-agent:' || agent, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('telloya-voice-number:' || chosen_number, 0));
  END IF;

  IF outcome IS NULL AND (
    EXISTS (
      SELECT 1
      FROM admin_private.commercial_provider_agent_owners owner
      WHERE owner.provider = 'telloya_voice'
        AND owner.agent_ref = agent
        AND (
          owner.customer_id IS DISTINCT FROM sub.customer_id
          OR owner.business_id IS DISTINCT FROM sub.business_id
          OR owner.location_id IS DISTINCT FROM chosen_location
          OR owner.subscription_id IS DISTINCT FROM sub.id
          OR owner.environment IS DISTINCT FROM env
        )
    )
  ) THEN
    outcome := jsonb_build_object(
      'status', 'denied',
      'reason', CASE
        WHEN EXISTS (
          SELECT 1 FROM admin_private.commercial_provider_agent_owners owner
          WHERE owner.provider = 'telloya_voice'
            AND owner.agent_ref = agent
            AND owner.environment IS DISTINCT FROM env
        ) THEN 'environment'
        ELSE 'provider'
      END
    );
  END IF;

  IF outcome IS NULL AND EXISTS (
    SELECT 1
    FROM public.telloya_voice_number_bindings binding
    WHERE binding.inbound_to_number = chosen_number
      AND binding.environment IS DISTINCT FROM env
  ) THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'environment');
  ELSIF outcome IS NULL AND EXISTS (
    SELECT 1
    FROM public.telloya_voice_number_bindings binding
    WHERE binding.inbound_to_number = chosen_number
      AND (
        binding.business_id IS DISTINCT FROM sub.business_id
        OR binding.location_id IS DISTINCT FROM chosen_location
      )
  ) THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'number');
  ELSIF outcome IS NULL AND EXISTS (
    SELECT 1
    FROM public.telloya_voice_number_bindings binding
    WHERE binding.inbound_to_number = chosen_number
      AND binding.environment = env
      AND binding.agent_id IS DISTINCT FROM agent
  ) THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'provider');
  END IF;

  IF outcome IS NULL AND EXISTS (
    SELECT 1
    FROM admin_private.commercial_provider_number_owners owner
    WHERE owner.provider = 'telloya_voice'
      AND owner.e164 = chosen_number
      AND owner.environment IS DISTINCT FROM env
  ) THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'environment');
  ELSIF outcome IS NULL AND EXISTS (
    SELECT 1
    FROM admin_private.commercial_provider_number_owners owner
    WHERE owner.provider = 'telloya_voice'
      AND owner.e164 = chosen_number
      AND (
        owner.customer_id IS DISTINCT FROM sub.customer_id
        OR owner.business_id IS DISTINCT FROM sub.business_id
        OR owner.location_id IS DISTINCT FROM chosen_location
        OR owner.subscription_id IS DISTINCT FROM sub.id
      )
  ) THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'number');
  END IF;

  IF outcome IS NULL THEN
    PERFORM 1
    FROM admin_private.commercial_location_allocations alloc
    WHERE alloc.subscription_id = sub.id
      AND alloc.location_id = chosen_location
    FOR UPDATE;
    SELECT coalesce(max(alloc.version), 0) INTO current_allocation
    FROM admin_private.commercial_location_allocations alloc
    WHERE alloc.subscription_id = sub.id
      AND alloc.location_id = chosen_location;
    IF current_allocation IS DISTINCT FROM (p_payload ->> 'allocationVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    ELSIF current_allocation = 0 AND (
      provision.state IS DISTINCT FROM 'NUMBER_REQUIRED'
      OR provision.number_allocated_at IS NOT NULL
      OR provision.provider_binding_ref IS NOT NULL
    ) THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    ELSIF current_allocation > 0 AND (
      provision.state IS DISTINCT FROM 'FORWARDING_REQUIRED'
      OR provision.number_allocated_at IS NULL
      OR provision.provider_binding_ref IS NULL
    ) THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    new_version := current_allocation + 1;
    prior_binding := provision.provider_binding_ref;
    prior_allocated := provision.number_allocated_at;
    INSERT INTO admin_private.commercial_location_allocations(
      subscription_id, customer_id, business_id, onboarding_request_id, location_id, entitlement_id,
      configuration_id, configuration_version, preference_version, version,
      provider, environment, agent_ref, provider_revision, e164, allocation_ref,
      verification_basis, attestation, recorded_by, request_id
    ) VALUES (
      sub.id, sub.customer_id, sub.business_id, req.id, chosen_location, chosen_entitlement,
      cfg.id, cfg.version, pref.version, new_version,
      'telloya_voice', env, agent, revision, chosen_number, allocation_evidence,
      'OPERATOR_ATTESTED', p_payload #>> '{provider,attestation}', actor, p_request
    ) RETURNING id INTO allocation_id;
    INSERT INTO admin_private.commercial_provider_number_owners (
      provider, e164, environment, customer_id, business_id, location_id, subscription_id
    ) VALUES (
      'telloya_voice', chosen_number, env, sub.customer_id, sub.business_id, chosen_location, sub.id
    )
    ON CONFLICT (provider, e164) DO UPDATE
    SET environment = admin_private.commercial_provider_number_owners.environment
    WHERE admin_private.commercial_provider_number_owners.customer_id = EXCLUDED.customer_id
      AND admin_private.commercial_provider_number_owners.business_id = EXCLUDED.business_id
      AND admin_private.commercial_provider_number_owners.location_id = EXCLUDED.location_id
      AND admin_private.commercial_provider_number_owners.subscription_id = EXCLUDED.subscription_id
      AND admin_private.commercial_provider_number_owners.environment = EXCLUDED.environment;
    GET DIAGNOSTICS claimed = ROW_COUNT;
    IF claimed IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'provider number owner conflict';
    END IF;
    IF current_allocation = 0 THEN
      UPDATE public.service_provisions
      SET state = 'FORWARDING_REQUIRED',
          number_allocated_at = pg_catalog.now(),
          provider_binding_ref = 'alloc:' || allocation_id::text
      WHERE entitlement_id = chosen_entitlement
        AND state = 'NUMBER_REQUIRED'
        AND number_allocated_at IS NULL
        AND provider_binding_ref IS NULL
        AND forwarding_instructed_at IS NULL
        AND provider_test_call_ref IS NULL
        AND agent_test_passed_at IS NULL
        AND customer_confirmed_at IS NULL
        AND live_at IS NULL
        AND agent_configured_at IS NOT NULL;
      GET DIAGNOSTICS claimed = ROW_COUNT;
      IF claimed IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'number allocation changed a later service field';
      END IF;
    END IF;
    SELECT * INTO provision FROM public.service_provisions WHERE entitlement_id = chosen_entitlement;
    IF provision.state IS DISTINCT FROM 'FORWARDING_REQUIRED'
      OR provision.state IS NOT DISTINCT FROM 'LIVE'
      OR provision.number_allocated_at IS NULL
      OR provision.provider_binding_ref IS NULL
      OR provision.provider_binding_ref !~ '^alloc:[0-9a-f-]{36}$'
      OR provision.forwarding_instructed_at IS NOT NULL
      OR provision.provider_test_call_ref IS NOT NULL
      OR provision.agent_test_passed_at IS NOT NULL
      OR provision.customer_confirmed_at IS NOT NULL
      OR provision.live_at IS NOT NULL
      OR provision.agent_configured_at IS NULL
      OR (
        current_allocation > 0
        AND (
          provision.provider_binding_ref IS DISTINCT FROM prior_binding
          OR provision.number_allocated_at IS DISTINCT FROM prior_allocated
        )
      )
    THEN
      RAISE EXCEPTION 'number allocation changed a later service field';
    END IF;
    INSERT INTO admin_private.commercial_allocation_events(
      allocation_id, subscription_id, location_id, actor_id, request_id, operation, version
    ) VALUES (
      allocation_id, sub.id, chosen_location, actor, p_request, 'record_number_allocation', new_version
    );
    PERFORM admin_private.onboarding_event_v1(
      req.id, actor, p_request, 'record_number_allocation', req.state, req.state,
      'Operator-attested telephone allocation recorded. Forwarding and testing are still required.',
      jsonb_build_object(
        'locationId', chosen_location,
        'allocationVersion', new_version,
        'configurationVersion', cfg.version,
        'preferenceVersion', pref.version,
        'environment', env,
        'verificationBasis', 'OPERATOR_ATTESTED'
      )
    );
    allocation_projection := admin_private.commercial_allocation_projection_v1(sub.id);
    config_projection := admin_private.commercial_configuration_projection_v1(sub.id);
    -- A static call of the replaced handover function is not reliable here.
    -- Dynamic SQL resolves the same private function after it is replaced.
    EXECUTE 'SELECT admin_private.commercial_setup_handover_v1($1)'
      INTO handover
      USING sub.id;
    IF handover IS NULL
      OR handover ->> 'operationalStatus' IS DISTINCT FROM 'setup_started'
      OR handover ->> 'customerDisplay' IS DISTINCT FROM 'Setup in progress'
      OR handover ->> 'financialStatus' IS DISTINCT FROM 'verified'
      OR handover -> 'checklist' -> 3 ->> 'state' IS DISTINCT FROM 'planned'
      OR handover -> 'checklist' -> 4 ->> 'state' IS DISTINCT FROM 'planned'
      OR handover -> 'checklist' -> 5 ->> 'state' IS DISTINCT FROM 'planned'
      OR handover -> 'checklist' -> 3 ->> 'label' IS DISTINCT FROM 'Telephone number and forwarding'
      OR (
        coalesce((config_projection ->> 'complete')::boolean, false)
        AND coalesce((allocation_projection ->> 'complete')::boolean, false)
        AND handover ->> 'nextAction' IS DISTINCT FROM 'Record forwarding instructions'
      )
      OR (
        coalesce((config_projection ->> 'complete')::boolean, false)
        AND NOT coalesce((allocation_projection ->> 'complete')::boolean, false)
        AND handover ->> 'nextAction' IS DISTINCT FROM 'Record provider and number allocation'
      )
      OR (
        NOT coalesce((config_projection ->> 'complete')::boolean, false)
        AND handover ->> 'nextAction' IS DISTINCT FROM 'Confirm AI configuration'
      )
    THEN
      RAISE EXCEPTION 'number allocation did not match the setup checklist';
    END IF;
    outcome := jsonb_build_object(
      'status', 'success',
      'reference', handover -> 'reference',
      'locationId', chosen_location,
      'locationName', location_name,
      'allocationVersion', new_version,
      'configurationVersion', cfg.version,
      'preferenceVersion', pref.version,
      'provisionVersion', provision.record_version,
      'environment', env,
      'e164', chosen_number,
      'verificationBasis', 'OPERATOR_ATTESTED',
      'allocationComplete', coalesce((allocation_projection ->> 'complete')::boolean, false),
      'recordedCount', (allocation_projection ->> 'recordedCount')::integer,
      'locationCount', (allocation_projection ->> 'locationCount')::integer,
      'operationalStatus', handover ->> 'operationalStatus',
      'nextAction', handover ->> 'nextAction',
      'provisionState', provision.state,
      'routingActive', false
    );
  END IF;

  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, outcome);
  RETURN outcome;
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb) IS
  'Audited Admin record of an existing telephone allocation for one selected location. Requires begin setup, confirmed preferences, and the latest AI configuration for that location. OPERATOR_ATTESTED is not an independent provider check and does not show that the number is routing calls. Does not buy a number, write a routing binding, enable forwarding, run a test call, enable Guard, change billing, send mail, or move a service to live.';

REVOKE ALL ON FUNCTION public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;

COMMIT;
