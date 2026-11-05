-- 03A-03-03-02-03 Audited Confirm AI Configuration.
-- supabase migration new admin_commercial_confirm_ai_configuration_v1 created
-- this file at 20261105172055. That stamp is later than
-- 20261105144256_admin_commercial_confirm_preferences_v1.sql.
-- Forward-only. Not applied to DEV. Do not apply 20261105172055 to DEV.
-- Do not apply 20261105172055 to Production.
-- appliedToDev stays false until a human applies this file.
-- The DEV ledger head remains 20261105120000. Begin setup 20261105130000
-- and confirm preferences 20261105144256 are also unapplied and earlier.
--
-- One Admin command records an operator-attested provider configuration for
-- one selected location after every selected location has a confirmed
-- preference. The row is tied to that preference version. A later preference
-- confirmation makes the previous configuration require review and clears
-- agent_configured_at. This command does not call a provider, buy a number,
-- enable forwarding, run a test call, enable Guard, change billing, send
-- mail, or move a service to live. OPERATOR_ATTESTED is not an independent
-- provider check. No provider voice catalogue is stored.

BEGIN;

CREATE TABLE admin_private.commercial_location_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements (id) ON DELETE RESTRICT,
  CONSTRAINT commercial_location_configurations_provision_fk
    FOREIGN KEY (entitlement_id) REFERENCES public.service_provisions (entitlement_id) ON DELETE RESTRICT,
  preference_id uuid NOT NULL REFERENCES admin_private.commercial_location_preferences (id) ON DELETE RESTRICT,
  preference_version integer NOT NULL CHECK (preference_version >= 1),
  version integer NOT NULL CHECK (version >= 1),
  business_name text NOT NULL,
  location_name text NOT NULL,
  timezone text NOT NULL,
  opening_hours jsonb NOT NULL,
  exceptional_hours text NOT NULL,
  out_of_hours text NOT NULL,
  greeting text NOT NULL,
  enquiry_details jsonb NOT NULL,
  callback_instructions text NOT NULL,
  callback_windows jsonb NOT NULL,
  urgent_rules text NOT NULL,
  direct_contact_rules text NOT NULL,
  special_instructions text,
  voice_presentation text NOT NULL CHECK (voice_presentation IN ('female', 'male', 'no_preference')),
  accent text NOT NULL,
  spoken_language text NOT NULL,
  additional_languages jsonb NOT NULL,
  pronunciation_notes text,
  provider text NOT NULL CHECK (provider = 'telloya_voice'),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  agent_ref text NOT NULL CHECK (agent_ref ~ '^[A-Za-z0-9_-]{8,128}$'),
  provider_revision text NOT NULL CHECK (char_length(provider_revision) BETWEEN 4 AND 128),
  configuration_fingerprint text NOT NULL CHECK (configuration_fingerprint ~ '^[a-f0-9]{32}$'),
  chosen_voice text NOT NULL CHECK (char_length(btrim(chosen_voice)) BETWEEN 1 AND 80 AND chosen_voice = btrim(chosen_voice)),
  chosen_language text NOT NULL CHECK (char_length(btrim(chosen_language)) BETWEEN 1 AND 40 AND chosen_language = btrim(chosen_language)),
  verification_basis text NOT NULL CHECK (verification_basis = 'OPERATOR_ATTESTED'),
  attestation text NOT NULL CHECK (char_length(attestation) BETWEEN 20 AND 500 AND attestation = btrim(attestation)),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  request_id uuid NOT NULL UNIQUE,
  CONSTRAINT commercial_location_configurations_version_key UNIQUE (subscription_id, location_id, version),
  CONSTRAINT commercial_location_configurations_hours_check CHECK (admin_private.commercial_opening_hours_ok_v1(opening_hours)),
  CONSTRAINT commercial_location_configurations_preference_link CHECK (
    preference_version >= 1
  )
);

CREATE INDEX commercial_location_configurations_agent_idx
  ON admin_private.commercial_location_configurations (environment, agent_ref);

ALTER TABLE admin_private.commercial_location_configurations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_location_configurations FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_location_configurations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_location_configurations
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TABLE admin_private.commercial_configuration_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  configuration_id uuid NOT NULL REFERENCES admin_private.commercial_location_configurations (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  location_id uuid NOT NULL,
  actor_id uuid,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('confirm_ai_configuration', 'preferences_superseded')),
  version integer NOT NULL CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX commercial_configuration_events_request_idx
  ON admin_private.commercial_configuration_events (request_id, operation);

ALTER TABLE admin_private.commercial_configuration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_configuration_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.commercial_configuration_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_configuration_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_configuration_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

ALTER TABLE admin_private.onboarding_request_events
  DROP CONSTRAINT onboarding_request_events_operation_check;

ALTER TABLE admin_private.onboarding_request_events
  ADD CONSTRAINT onboarding_request_events_operation_check CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer',
    'issue_invitation', 'resend_invitation', 'revoke_invitation',
    'begin_setup', 'confirm_preferences', 'confirm_ai_configuration'
  ));

CREATE FUNCTION admin_private.commercial_configuration_payload_ok_v1(p_payload jsonb)
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
      'businessId', 'configurationVersion', 'customerId', 'locationId',
      'onboardingRequestId', 'onboardingVersion', 'preferenceVersion', 'provider', 'provisionVersion'
    ]
  THEN
    RETURN false;
  END IF;
  provider := p_payload -> 'provider';
  IF jsonb_typeof(provider) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(provider) IS DISTINCT FROM ARRAY[
      'agentRef', 'attestation', 'chosenLanguage', 'chosenVoice', 'environment', 'provider', 'revision', 'staffConfirmed'
    ]
  THEN
    RETURN false;
  END IF;
  IF (p_payload ->> 'locationId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_payload ->> 'preferenceVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'provisionVersion') !~ '^[1-9][0-9]*$'
    OR (p_payload ->> 'configurationVersion') !~ '^(0|[1-9][0-9]*)$'
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
  text_value := provider ->> 'chosenVoice';
  IF text_value IS NULL OR btrim(text_value) IS DISTINCT FROM text_value OR char_length(text_value) NOT BETWEEN 1 AND 80 THEN
    RETURN false;
  END IF;
  text_value := provider ->> 'chosenLanguage';
  IF text_value IS NULL OR btrim(text_value) IS DISTINCT FROM text_value OR char_length(text_value) NOT BETWEEN 1 AND 40 THEN
    RETURN false;
  END IF;
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

REVOKE ALL ON FUNCTION admin_private.commercial_configuration_payload_ok_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.commercial_preferences_supersede_configuration_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  latest admin_private.commercial_location_configurations;
  provision public.service_provisions;
BEGIN
  IF NEW.status IS DISTINCT FROM 'CONFIRMED' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO latest
  FROM admin_private.commercial_location_configurations config
  WHERE config.subscription_id = NEW.subscription_id
    AND config.location_id = NEW.location_id
    AND config.customer_id = NEW.customer_id
    AND config.business_id = NEW.business_id
  ORDER BY config.version DESC
  LIMIT 1;
  IF latest.id IS NULL OR latest.preference_version = NEW.version THEN
    RETURN NEW;
  END IF;
  SELECT * INTO provision
  FROM public.service_provisions
  WHERE entitlement_id = latest.entitlement_id
  FOR UPDATE;
  IF provision.entitlement_id IS NOT NULL
    AND provision.state IN ('PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED')
    AND (
      provision.state IS DISTINCT FROM 'PROFILE_REQUIRED'
      OR provision.agent_configured_at IS NOT NULL
    )
  THEN
    UPDATE public.service_provisions
    SET state = 'PROFILE_REQUIRED',
        agent_configured_at = NULL
    WHERE entitlement_id = provision.entitlement_id
      AND state IN ('PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED');
  END IF;
  INSERT INTO admin_private.commercial_configuration_events(
    configuration_id, subscription_id, location_id, actor_id, request_id, operation, version
  ) VALUES (
    latest.id, latest.subscription_id, latest.location_id, NEW.recorded_by, NEW.request_id,
    'preferences_superseded', latest.version
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_preferences_supersede_configuration_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_preferences_supersede_configuration
  AFTER INSERT ON admin_private.commercial_location_preferences
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_preferences_supersede_configuration_v1();


CREATE FUNCTION admin_private.commercial_configuration_projection_v1(p_subscription uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  location_count integer := 0;
  recorded_count integer := 0;
  review_count integer := 0;
  needed_names text := '';
  review_names text := '';
  admin_locations jsonb := '[]'::jsonb;
  customer_locations jsonb := '[]'::jsonb;
  state text;
BEGIN
  SELECT count(*)::integer INTO location_count
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
  WHERE sub.id = p_subscription;

  WITH rows AS (
    SELECT location.id AS location_id,
           coalesce(nullif(btrim(location.location_name), ''), 'Selected location') AS location_name,
           pref.id AS preference_id,
           pref.version AS preference_version,
           config.id AS configuration_id,
           config.version AS configuration_version,
           provision.record_version AS provision_version,
           provision.state AS provision_state,
           provision.agent_configured_at,
           CASE
             WHEN pref.id IS NULL OR config.id IS NULL THEN 'needed'
             WHEN config.preference_version IS DISTINCT FROM pref.version
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
    WHERE sub.id = p_subscription
  )
  SELECT
    count(*) FILTER (WHERE status = 'recorded')::integer,
    count(*) FILTER (WHERE status = 'review')::integer,
    coalesce(string_agg(location_name, ', ' ORDER BY location_name) FILTER (WHERE status = 'needed'), ''),
    coalesce(string_agg(location_name, ', ' ORDER BY location_name) FILTER (WHERE status = 'review'), '')
  INTO recorded_count, review_count, needed_names, review_names
  FROM rows;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'locationId', location.id,
    'locationName', coalesce(nullif(btrim(location.location_name), ''), 'Selected location'),
    'status', CASE
      WHEN pref.id IS NULL OR config.id IS NULL THEN 'needed'
      WHEN config.preference_version IS DISTINCT FROM pref.version
        OR provision.agent_configured_at IS NULL
        OR provision.state = 'PROFILE_REQUIRED' THEN 'review'
      ELSE 'recorded'
    END,
    'configurationVersion', coalesce(config.version, 0),
    'preferenceVersion', coalesce(pref.version, 0),
    'provisionVersion', coalesce(provision.record_version, 0),
    'timezone', pref.timezone,
    'hoursSummary', CASE WHEN pref.id IS NULL THEN NULL ELSE admin_private.commercial_hours_summary_v1(pref.opening_hours) END,
    'greeting', pref.greeting,
    'exceptionalHours', pref.exceptional_hours,
    'outOfHours', pref.out_of_hours,
    'enquiryDetails', pref.enquiry_details,
    'callbackInstructions', pref.callback_instructions,
    'callbackWindows', pref.callback_windows,
    'urgentRules', pref.urgent_rules,
    'directContactRules', pref.direct_contact_rules,
    'specialInstructions', pref.special_instructions,
    'voicePresentation', pref.voice_presentation,
    'accent', pref.accent,
    'spokenLanguage', pref.spoken_language,
    'additionalLanguages', pref.additional_languages,
    'pronunciationNotes', pref.pronunciation_notes,
    'provider', config.provider,
    'environment', config.environment,
    'agentRef', config.agent_ref,
    'providerRevision', config.provider_revision,
    'chosenVoice', config.chosen_voice,
    'chosenLanguage', config.chosen_language,
    'verificationBasis', config.verification_basis,
    'attestation', config.attestation
  ) ORDER BY location.location_name, location.id), '[]'::jsonb)
  INTO admin_locations
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
  LEFT JOIN admin_private.commercial_location_preferences pref
    ON pref.subscription_id = sub.id
   AND pref.location_id = location.id
   AND pref.status = 'CONFIRMED'
   AND pref.version = (
     SELECT max(latest.version) FROM admin_private.commercial_location_preferences latest
     WHERE latest.subscription_id = pref.subscription_id AND latest.location_id = pref.location_id
   )
  LEFT JOIN admin_private.commercial_location_configurations config
    ON config.subscription_id = sub.id
   AND config.location_id = location.id
   AND config.version = (
     SELECT max(latest.version) FROM admin_private.commercial_location_configurations latest
     WHERE latest.subscription_id = config.subscription_id AND latest.location_id = config.location_id
   )
  WHERE sub.id = p_subscription;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'locationId', location.id,
    'locationName', coalesce(nullif(btrim(location.location_name), ''), 'Selected location'),
    'status', CASE
      WHEN pref.id IS NULL OR config.id IS NULL THEN 'needed'
      WHEN config.preference_version IS DISTINCT FROM pref.version
        OR provision.agent_configured_at IS NULL
        OR provision.state = 'PROFILE_REQUIRED' THEN 'review'
      ELSE 'recorded'
    END,
    'note', CASE
      WHEN pref.id IS NOT NULL AND config.id IS NOT NULL
        AND config.preference_version = pref.version
        AND provision.agent_configured_at IS NOT NULL
        AND provision.state IS DISTINCT FROM 'PROFILE_REQUIRED'
        THEN 'Your AI receptionist configuration has been recorded. We''re completing the telephone setup and service checks.'
      WHEN config.id IS NOT NULL
        THEN 'Your confirmed preferences changed after the configuration was recorded. The setup team needs to review it. The receptionist is not answering calls.'
      ELSE 'The AI receptionist configuration for this location has not been recorded. It cannot answer calls.'
    END
  ) ORDER BY location.location_name, location.id), '[]'::jsonb)
  INTO customer_locations
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
  LEFT JOIN admin_private.commercial_location_preferences pref
    ON pref.subscription_id = sub.id
   AND pref.location_id = location.id
   AND pref.status = 'CONFIRMED'
   AND pref.version = (
     SELECT max(latest.version) FROM admin_private.commercial_location_preferences latest
     WHERE latest.subscription_id = pref.subscription_id AND latest.location_id = pref.location_id
   )
  LEFT JOIN admin_private.commercial_location_configurations config
    ON config.subscription_id = sub.id
   AND config.location_id = location.id
   AND config.version = (
     SELECT max(latest.version) FROM admin_private.commercial_location_configurations latest
     WHERE latest.subscription_id = config.subscription_id AND latest.location_id = config.location_id
   )
  WHERE sub.id = p_subscription;

  state := CASE
    WHEN location_count > 0 AND recorded_count = location_count THEN 'recorded'
    WHEN review_count > 0 THEN 'review'
    WHEN recorded_count > 0 THEN 'partial'
    ELSE 'needed'
  END;
  RETURN jsonb_build_object(
    'recordedCount', recorded_count,
    'reviewCount', review_count,
    'locationCount', location_count,
    'complete', location_count > 0 AND recorded_count = location_count,
    'neededNames', needed_names,
    'reviewNames', review_names,
    'admin', jsonb_build_object(
      'recordedCount', recorded_count,
      'reviewCount', review_count,
      'locationCount', location_count,
      'locations', admin_locations
    ),
    'customer', jsonb_build_object(
      'state', state,
      'recordedCount', recorded_count,
      'locationCount', location_count,
      'locations', customer_locations
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_configuration_projection_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

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
         COALESCE(bool_and(provision.state = 'LIVE' AND provision.live_at IS NOT NULL), false)
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
      WHEN NOT number_ready THEN 'Record provider and number allocation'
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
    ELSIF preferences_complete AND agent_ready AND NOT number_ready THEN
      message := 'Your AI receptionist configuration has been recorded. We''re completing the telephone setup and service checks.';
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
    (built.item - 'customerName' - 'businessId' - 'plan' - 'monthlyPriceMinor' - 'currency' - 'guardLocationCount' - 'nextAction' - 'preferenceProgress' - 'configurationProgress')
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


ALTER TABLE admin_private.commercial_location_configurations
  ADD CONSTRAINT commercial_location_configurations_copy_check CHECK (
    timezone ~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)+$'
    AND char_length(timezone) <= 80
    AND char_length(business_name) BETWEEN 1 AND 200
    AND char_length(location_name) BETWEEN 1 AND 200
    AND char_length(exceptional_hours) BETWEEN 10 AND 400
    AND char_length(out_of_hours) BETWEEN 10 AND 800
    AND char_length(greeting) BETWEEN 10 AND 400
    AND char_length(callback_instructions) BETWEEN 10 AND 800
    AND char_length(urgent_rules) BETWEEN 10 AND 800
    AND char_length(direct_contact_rules) BETWEEN 10 AND 800
    AND char_length(accent) BETWEEN 2 AND 40
    AND accent !~* 'voice_'
    AND spoken_language ~ '^[a-z]{2}(-[A-Z]{2})?$'
  );

CREATE FUNCTION public.admin_commercial_confirm_ai_configuration_v1(
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
  raw_locations integer := 0;
  owned_locations integer := 0;
  chosen_location uuid;
  chosen_entitlement uuid;
  location_name text;
  business_name text;
  provision public.service_provisions;
  pref admin_private.commercial_location_preferences;
  current_version integer := 0;
  new_version integer;
  env text;
  agent text;
  revision text;
  chosen_voice text;
  chosen_language text;
  configuration_fingerprint text;
  configuration_id uuid;
  handover jsonb;
  preference_projection jsonb;
  config_projection jsonb;
  outcome jsonb := NULL;
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
    OR NOT admin_private.commercial_configuration_payload_ok_v1(p_payload)
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  fingerprint := md5(jsonb_build_object(
    'operation', 'confirm_ai_configuration',
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
    'confirm-ai-configuration:' || p_subscription::text || ':' || (p_payload ->> 'locationId'), 0
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
    IF provision.state = 'LIVE' THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'live');
    ELSIF provision.state NOT IN ('PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED')
      OR provision.number_allocated_at IS NOT NULL
      OR provision.forwarding_instructed_at IS NOT NULL
      OR provision.agent_test_passed_at IS NOT NULL
      OR provision.customer_confirmed_at IS NOT NULL
      OR provision.live_at IS NOT NULL
      OR provision.provider_binding_ref IS NOT NULL
      OR provision.provider_test_call_ref IS NOT NULL
      OR provision.record_version IS DISTINCT FROM (p_payload ->> 'provisionVersion')::integer
    THEN
      outcome := jsonb_build_object(
        'status', CASE
          WHEN provision.record_version IS DISTINCT FROM (p_payload ->> 'provisionVersion')::integer
            AND provision.state IN ('PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED')
            AND provision.number_allocated_at IS NULL
          THEN 'conflict'
          ELSE 'denied'
        END,
        'reason', CASE
          WHEN provision.record_version IS DISTINCT FROM (p_payload ->> 'provisionVersion')::integer
            AND provision.state IN ('PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED')
            AND provision.number_allocated_at IS NULL
          THEN 'version'
          ELSE 'setup'
        END
      );
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
    SELECT coalesce(max(config.version), 0) INTO current_version
    FROM admin_private.commercial_location_configurations config
    WHERE config.subscription_id = sub.id
      AND config.location_id = chosen_location;
    IF current_version IS DISTINCT FROM (p_payload ->> 'configurationVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    END IF;
  END IF;

  env := p_payload #>> '{provider,environment}';
  agent := p_payload #>> '{provider,agentRef}';
  revision := p_payload #>> '{provider,revision}';
  chosen_voice := p_payload #>> '{provider,chosenVoice}';
  chosen_language := p_payload #>> '{provider,chosenLanguage}';
  IF outcome IS NULL AND (
    EXISTS (
      SELECT 1
      FROM admin_private.commercial_location_configurations config
      WHERE config.agent_ref = agent
        AND config.environment IS DISTINCT FROM env
    ) OR EXISTS (
      SELECT 1
      FROM public.telloya_voice_number_bindings binding
      WHERE binding.agent_id = agent
        AND binding.environment IS DISTINCT FROM env
    )
  ) THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'environment');
  ELSIF outcome IS NULL AND (
    EXISTS (
      SELECT 1
      FROM admin_private.commercial_location_configurations config
      WHERE config.agent_ref = agent
        AND config.environment = env
        AND (
          config.location_id IS DISTINCT FROM chosen_location
          OR config.business_id IS DISTINCT FROM sub.business_id
          OR config.customer_id IS DISTINCT FROM sub.customer_id
        )
    ) OR EXISTS (
      SELECT 1
      FROM public.telloya_voice_number_bindings binding
      WHERE binding.agent_id = agent
        AND binding.environment = env
        AND (
          binding.location_id IS DISTINCT FROM chosen_location
          OR binding.business_id IS DISTINCT FROM sub.business_id
        )
    )
  ) THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'provider');
  END IF;

  IF outcome IS NULL THEN
    new_version := current_version + 1;
    configuration_fingerprint := md5(concat_ws('|',
      pref.id::text, pref.version::text, env, agent, revision, chosen_voice, chosen_language
    ));
    INSERT INTO admin_private.commercial_location_configurations(
      subscription_id, customer_id, business_id, onboarding_request_id, location_id, entitlement_id,
      preference_id, preference_version, version,
      business_name, location_name, timezone, opening_hours, exceptional_hours, out_of_hours, greeting,
      enquiry_details, callback_instructions, callback_windows, urgent_rules, direct_contact_rules, special_instructions,
      voice_presentation, accent, spoken_language, additional_languages, pronunciation_notes,
      provider, environment, agent_ref, provider_revision, configuration_fingerprint,
      chosen_voice, chosen_language, verification_basis, attestation, recorded_by, request_id
    ) VALUES (
      sub.id, sub.customer_id, sub.business_id, req.id, chosen_location, chosen_entitlement,
      pref.id, pref.version, new_version,
      business_name, location_name, pref.timezone, pref.opening_hours, pref.exceptional_hours, pref.out_of_hours, pref.greeting,
      pref.enquiry_details, pref.callback_instructions, pref.callback_windows, pref.urgent_rules, pref.direct_contact_rules, pref.special_instructions,
      pref.voice_presentation, pref.accent, pref.spoken_language, pref.additional_languages, pref.pronunciation_notes,
      'telloya_voice', env, agent, revision, configuration_fingerprint,
      chosen_voice, chosen_language, 'OPERATOR_ATTESTED', p_payload #>> '{provider,attestation}', actor, p_request
    ) RETURNING id INTO configuration_id;
    UPDATE public.service_provisions
    SET state = 'NUMBER_REQUIRED',
        agent_configured_at = pg_catalog.now(),
        profile_ready_at = coalesce(profile_ready_at, pg_catalog.now())
    WHERE entitlement_id = chosen_entitlement
      AND state IN ('PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED')
      AND number_allocated_at IS NULL
      AND forwarding_instructed_at IS NULL
      AND agent_test_passed_at IS NULL
      AND customer_confirmed_at IS NULL
      AND live_at IS NULL;
    SELECT * INTO provision FROM public.service_provisions WHERE entitlement_id = chosen_entitlement;
    IF provision.state IS DISTINCT FROM 'NUMBER_REQUIRED'
      OR provision.agent_configured_at IS NULL
      OR provision.profile_ready_at IS NULL
      OR provision.number_allocated_at IS NOT NULL
      OR provision.forwarding_instructed_at IS NOT NULL
      OR provision.agent_test_passed_at IS NOT NULL
      OR provision.customer_confirmed_at IS NOT NULL
      OR provision.live_at IS NOT NULL
      OR provision.provider_binding_ref IS NOT NULL
      OR provision.provider_test_call_ref IS NOT NULL
    THEN
      RAISE EXCEPTION 'confirm ai configuration changed a later service field';
    END IF;
    INSERT INTO admin_private.commercial_configuration_events(
      configuration_id, subscription_id, location_id, actor_id, request_id, operation, version
    ) VALUES (
      configuration_id, sub.id, chosen_location, actor, p_request, 'confirm_ai_configuration', new_version
    );
    PERFORM admin_private.onboarding_event_v1(
      req.id, actor, p_request, 'confirm_ai_configuration', req.state, req.state,
      'Operator-attested provider configuration recorded. Testing is still required.',
      jsonb_build_object(
        'locationId', chosen_location,
        'configurationVersion', new_version,
        'preferenceVersion', pref.version,
        'environment', env,
        'verificationBasis', 'OPERATOR_ATTESTED'
      )
    );
    config_projection := admin_private.commercial_configuration_projection_v1(sub.id);
    handover := admin_private.commercial_setup_handover_v1(sub.id);
    IF handover IS NULL
      OR handover ->> 'operationalStatus' IS DISTINCT FROM 'setup_started'
      OR handover ->> 'customerDisplay' IS DISTINCT FROM 'Setup in progress'
      OR handover ->> 'financialStatus' IS DISTINCT FROM 'verified'
      OR handover -> 'checklist' -> 1 ->> 'state' IS DISTINCT FROM 'complete'
      OR handover -> 'checklist' -> 3 ->> 'state' IS DISTINCT FROM 'planned'
      OR handover -> 'checklist' -> 4 ->> 'state' IS DISTINCT FROM 'planned'
      OR handover -> 'checklist' -> 5 ->> 'state' IS DISTINCT FROM 'planned'
      OR sub.record_version IS DISTINCT FROM p_version
      OR (
        coalesce((config_projection ->> 'complete')::boolean, false)
        AND (
          handover ->> 'nextAction' IS DISTINCT FROM 'Record provider and number allocation'
          OR handover -> 'checklist' -> 2 ->> 'state' IS DISTINCT FROM 'complete'
        )
      )
      OR (
        NOT coalesce((config_projection ->> 'complete')::boolean, false)
        AND (
          handover ->> 'nextAction' IS DISTINCT FROM 'Confirm AI configuration'
          OR handover -> 'checklist' -> 2 ->> 'state' IS DISTINCT FROM 'planned'
        )
      )
    THEN
      RAISE EXCEPTION 'confirm ai configuration did not match the setup checklist';
    END IF;
    outcome := jsonb_build_object(
      'status', 'success',
      'reference', handover -> 'reference',
      'locationId', chosen_location,
      'locationName', location_name,
      'configurationVersion', new_version,
      'preferenceVersion', pref.version,
      'provisionVersion', provision.record_version,
      'environment', env,
      'verificationBasis', 'OPERATOR_ATTESTED',
      'configurationComplete', coalesce((config_projection ->> 'complete')::boolean, false),
      'recordedCount', (config_projection ->> 'recordedCount')::integer,
      'reviewCount', (config_projection ->> 'reviewCount')::integer,
      'locationCount', (config_projection ->> 'locationCount')::integer,
      'operationalStatus', handover ->> 'operationalStatus',
      'nextAction', handover ->> 'nextAction',
      'provisionState', provision.state
    );
  END IF;

  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, outcome);
  RETURN outcome;
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb) IS
  'Audited Admin record of an operator-attested provider configuration for one selected location. Requires begin setup, confirmed preferences for every selected location, and the latest preference for this location. OPERATOR_ATTESTED is not an independent provider check. Does not call a provider, allocate a number, enable forwarding, run a test call, enable Guard, change billing, send mail, or move a service to live.';

REVOKE ALL ON FUNCTION public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.customer_portal_setup_handover_v1(text) IS
  'Read-only setup handover for the signed-in customer. A recorded AI configuration is not a live or tested receptionist. Provider references, staff attestation, and configuration fingerprints stay off this response.';






-- A later confirmed preference is allowed while the location is still in
-- profile, agent, or number preparation and no later service evidence exists.
-- The supersede trigger returns that provision to PROFILE_REQUIRED and clears
-- agent_configured_at. Number allocation, forwarding, testing, and activation
-- stay blocked.

CREATE OR REPLACE FUNCTION public.admin_commercial_confirm_preferences_v1(
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
  raw_locations integer := 0;
  owned_locations integer := 0;
  chosen_location uuid;
  chosen_entitlement uuid;
  location_name text;
  provision_state text;
  current_version integer := 0;
  new_version integer;
  confirmed_at timestamptz;
  source text;
  handover jsonb;
  projection jsonb;
  outcome jsonb := NULL;
  preference_id uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 24000
    OR jsonb_typeof(p_payload -> 'customerId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'customerId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'businessId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'businessId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingRequestId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'onboardingRequestId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'onboardingVersion') !~ '^[1-9][0-9]*$'
    OR NOT admin_private.commercial_preference_payload_ok_v1(p_payload)
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  BEGIN
    confirmed_at := (p_payload #>> '{confirmation,customerConfirmedAt}')::timestamptz;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN jsonb_build_object('status', 'invalid');
  END;
  IF confirmed_at IS NULL
    OR confirmed_at > pg_catalog.now()
    OR confirmed_at < pg_catalog.now() - interval '400 days'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  fingerprint := md5(jsonb_build_object(
    'operation', 'confirm_preferences',
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

  PERFORM pg_advisory_xact_lock(hashtextextended('confirm-preferences:' || p_subscription::text || ':' || (p_payload ->> 'locationId'), 0));
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

  chosen_location := (p_payload ->> 'locationId')::uuid;
  IF outcome IS NULL THEN
    SELECT location.location_name INTO location_name
    FROM admin_private.onboarding_request_locations selected
    JOIN public.locations location
      ON location.id = selected.location_id
     AND location.business_id = sub.business_id
    WHERE selected.onboarding_request_id = req.id
      AND selected.location_id = chosen_location;
    IF location_name IS NULL THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'location');
    ELSE
      SELECT entitlement.id, provision.state
      INTO chosen_entitlement, provision_state
      FROM public.product_entitlements entitlement
      JOIN public.service_provisions provision
        ON provision.entitlement_id = entitlement.id
       AND provision.business_id = entitlement.business_id
       AND provision.location_id = entitlement.location_id
      WHERE entitlement.location_id = chosen_location
        AND entitlement.business_id = sub.business_id
        AND entitlement.commercial_subscription_id = sub.id
        AND entitlement.component_code = 'TELLOYA'
        AND entitlement.source_kind = 'COMMERCIAL_SUBSCRIPTION'
        AND entitlement.state IN ('PENDING', 'ELIGIBLE')
      FOR UPDATE OF provision;
      IF provision_state = 'LIVE' THEN
        outcome := jsonb_build_object('status', 'denied', 'reason', 'live');
      ELSIF chosen_entitlement IS NULL
        OR provision_state NOT IN ('PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED')
        OR EXISTS (
          SELECT 1
          FROM public.service_provisions later
          WHERE later.entitlement_id = chosen_entitlement
            AND (
              later.number_allocated_at IS NOT NULL
              OR later.forwarding_instructed_at IS NOT NULL
              OR later.agent_test_passed_at IS NOT NULL
              OR later.customer_confirmed_at IS NOT NULL
              OR later.live_at IS NOT NULL
              OR later.provider_binding_ref IS NOT NULL
              OR later.provider_test_call_ref IS NOT NULL
            )
        )
      THEN
        outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
      END IF;
    END IF;
  END IF;

  IF outcome IS NULL THEN
    source := p_payload #>> '{confirmation,source}';
    IF source = 'recorded_email' AND NOT EXISTS (
      SELECT 1
      FROM public.communications communication
      JOIN public.customers customer ON customer.id = sub.customer_id
      JOIN public.conversations conversation ON conversation.id = communication.conversation_id
      WHERE communication.id = (p_payload #>> '{confirmation,communicationId}')::uuid
        AND communication.customer_id = sub.customer_id
        AND communication.business_id = sub.business_id
        AND communication.channel = 'EMAIL'
        AND communication.direction = 'INBOUND'
        AND communication.status = 'SENT'
        AND communication.sender_address IS NOT NULL
        AND lower(communication.sender_address) = lower(customer.email)
        AND admin_private.contact_verified_v1(sub.customer_id, 'email')
        AND communication.case_id IS NOT NULL
        AND communication.case_id = conversation.case_id
        AND conversation.customer_id = communication.customer_id
        AND conversation.business_id = communication.business_id
        AND conversation.state IS DISTINCT FROM 'UNMATCHED'
        AND (conversation.location_id IS NULL OR conversation.location_id = chosen_location)
        AND EXISTS (
          SELECT 1
          FROM public.cases evidence_case
          WHERE evidence_case.id = communication.case_id
            AND evidence_case.customer_id = communication.customer_id
            AND evidence_case.business_id = communication.business_id
            AND (evidence_case.location_id IS NULL OR evidence_case.location_id = chosen_location)
        )
    ) THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'provenance');
    ELSIF source = 'recorded_message' AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_messages message
      JOIN public.conversations conversation ON conversation.id = message.conversation_id
      JOIN public.customers customer ON customer.id = sub.customer_id
      WHERE message.id = (p_payload #>> '{confirmation,messageId}')::uuid
        AND message.kind = 'INBOUND_EMAIL'
        AND message.import_status = 'IMPORTED'
        AND message.sender_match = 'MATCHES_VERIFIED_CONTACT'
        AND message.loop_class = 'NONE'
        AND message.auto_submitted IS NULL
        AND message.sender_address IS NOT NULL
        AND lower(message.sender_address) = lower(customer.email)
        AND admin_private.contact_verified_v1(sub.customer_id, 'email')
        AND conversation.customer_id = sub.customer_id
        AND conversation.business_id = sub.business_id
        AND conversation.state IS DISTINCT FROM 'UNMATCHED'
        AND conversation.case_id IS NOT NULL
        AND (conversation.location_id IS NULL OR conversation.location_id = chosen_location)
        AND EXISTS (
          SELECT 1
          FROM public.cases evidence_case
          WHERE evidence_case.id = conversation.case_id
            AND evidence_case.customer_id = conversation.customer_id
            AND evidence_case.business_id = conversation.business_id
            AND (evidence_case.location_id IS NULL OR evidence_case.location_id = chosen_location)
        )
    ) THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'provenance');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    PERFORM 1
    FROM admin_private.commercial_location_preferences pref
    WHERE pref.subscription_id = sub.id
      AND pref.location_id = chosen_location
    FOR UPDATE;
    SELECT coalesce(max(pref.version), 0) INTO current_version
    FROM admin_private.commercial_location_preferences pref
    WHERE pref.subscription_id = sub.id
      AND pref.location_id = chosen_location;
    IF current_version IS DISTINCT FROM (p_payload ->> 'preferenceVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    new_version := current_version + 1;
    INSERT INTO admin_private.commercial_location_preferences(
      subscription_id, customer_id, business_id, onboarding_request_id, location_id,
      entitlement_id, version, status, timezone, opening_hours,
      exceptional_hours, out_of_hours, greeting, enquiry_details, callback_instructions,
      callback_windows, urgent_rules, direct_contact_rules, special_instructions,
      voice_presentation, accent, spoken_language, additional_languages, pronunciation_notes,
      confirmation_source, communication_id, message_id, attestation, customer_confirmed_at,
      recorded_by, request_id
    ) VALUES (
      sub.id, sub.customer_id, sub.business_id, req.id, chosen_location,
      chosen_entitlement, new_version, 'CONFIRMED',
      p_payload #>> '{preferences,timezone}',
      p_payload #> '{preferences,openingHours}',
      p_payload #>> '{preferences,exceptionalHours}',
      p_payload #>> '{preferences,outOfHours}',
      p_payload #>> '{preferences,greeting}',
      p_payload #> '{preferences,enquiryDetails}',
      p_payload #>> '{preferences,callbackInstructions}',
      p_payload #> '{preferences,callbackWindows}',
      p_payload #>> '{preferences,urgentRules}',
      p_payload #>> '{preferences,directContactRules}',
      CASE WHEN jsonb_typeof(p_payload #> '{preferences,specialInstructions}') = 'null' THEN NULL
        ELSE p_payload #>> '{preferences,specialInstructions}' END,
      p_payload #>> '{preferences,voicePresentation}',
      p_payload #>> '{preferences,accent}',
      p_payload #>> '{preferences,spokenLanguage}',
      p_payload #> '{preferences,additionalLanguages}',
      CASE WHEN jsonb_typeof(p_payload #> '{preferences,pronunciationNotes}') = 'null' THEN NULL
        ELSE p_payload #>> '{preferences,pronunciationNotes}' END,
      source,
      CASE WHEN source = 'recorded_email' THEN (p_payload #>> '{confirmation,communicationId}')::uuid ELSE NULL END,
      CASE WHEN source = 'recorded_message' THEN (p_payload #>> '{confirmation,messageId}')::uuid ELSE NULL END,
      p_payload #>> '{confirmation,attestation}',
      confirmed_at, actor, p_request
    ) RETURNING id INTO preference_id;
    INSERT INTO admin_private.commercial_preference_events(
      preference_id, subscription_id, location_id, actor_id, request_id, operation, version
    ) VALUES (
      preference_id, sub.id, chosen_location, actor, p_request, 'confirm_preferences', new_version
    );
    PERFORM admin_private.onboarding_event_v1(
      req.id, actor, p_request, 'confirm_preferences', req.state, req.state,
      'Customer confirmed business preferences',
      jsonb_build_object(
        'locationId', chosen_location,
        'preferenceVersion', new_version,
        'confirmationSource', source
      )
    );
    projection := admin_private.commercial_preference_projection_v1(sub.id);
    handover := admin_private.commercial_setup_handover_v1(sub.id);
    IF handover IS NULL
      OR handover ->> 'operationalStatus' IS DISTINCT FROM 'setup_started'
      OR handover ->> 'customerDisplay' IS DISTINCT FROM 'Setup in progress'
      OR handover ->> 'financialStatus' IS DISTINCT FROM 'verified'
      OR (projection ->> 'complete')::boolean IS DISTINCT FROM (
        handover -> 'checklist' -> 1 ->> 'state' = 'complete'
      )
      OR (
        (projection ->> 'complete')::boolean
        AND handover ->> 'nextAction' IS DISTINCT FROM 'Confirm AI configuration'
      )
      OR (
        NOT (projection ->> 'complete')::boolean
        AND handover ->> 'nextAction' IS DISTINCT FROM 'Confirm business preferences'
      )
    THEN
      RAISE EXCEPTION 'confirm preferences did not match the setup checklist';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.service_provisions provision
      WHERE provision.entitlement_id = chosen_entitlement
        AND provision.state IS DISTINCT FROM 'PROFILE_REQUIRED'
    ) THEN
      RAISE EXCEPTION 'confirm preferences changed the service provision';
    END IF;
    outcome := jsonb_build_object(
      'status', 'success',
      'reference', handover -> 'reference',
      'locationId', chosen_location,
      'locationName', location_name,
      'preferenceVersion', new_version,
      'confirmationSource', source,
      'customerConfirmedAt', confirmed_at,
      'timezone', p_payload #>> '{preferences,timezone}',
      'voicePresentation', p_payload #>> '{preferences,voicePresentation}',
      'spokenLanguage', p_payload #>> '{preferences,spokenLanguage}',
      'preferencesComplete', (projection ->> 'complete')::boolean,
      'confirmedCount', (projection ->> 'confirmedCount')::integer,
      'locationCount', (projection ->> 'locationCount')::integer,
      'remainingLocations', projection ->> 'remainingNames',
      'operationalStatus', handover ->> 'operationalStatus',
      'nextAction', handover ->> 'nextAction',
      'provisionState', 'PROFILE_REQUIRED'
    );
  END IF;

  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, outcome);
  RETURN outcome;
END;
$$;


COMMIT;
