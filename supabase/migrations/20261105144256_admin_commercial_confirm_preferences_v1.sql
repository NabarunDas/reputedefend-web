-- 03A-03-03-02-02 Audited Confirm Business Preferences.
-- supabase migration new admin_commercial_confirm_preferences_v1 created
-- this file at 20261105144256. That stamp is later than
-- 20261105130000_admin_commercial_begin_setup_v1.sql, so it is kept.
-- Forward-only. Not applied to DEV. Do not apply 20261105144256 to DEV.
-- Do not apply 20261105144256 to Production.
-- appliedToDev stays false until a human applies this file.
-- The DEV ledger head remains 20261105120000. Begin setup 20261105130000
-- is also unapplied and earlier in this chain.
--
-- One Admin command records a customer-confirmed preference for one selected
-- Telloya location after Begin Setup. A form entry is not confirmation.
-- Confirmed rows are append-only. A correction inserts the next version and
-- leaves the earlier confirmed version in place. A DRAFT row is not
-- confirmation and does not complete the checklist. PROFILE_REQUIRED does
-- not complete it either.
--
-- Hours are local wall-clock values plus an IANA timezone. They are not
-- converted to a single UTC offset. No provider voice identifier is stored.
-- The command does not call a telephone provider, buy or allocate a number,
-- configure an AI agent, enable forwarding, answer calls, enable Guard
-- monitoring, change a price, enable overage, send mail, or move a
-- provision to live.

BEGIN;

CREATE FUNCTION admin_private.commercial_json_keys_v1(p_value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[])
  FROM jsonb_object_keys(p_value) AS object_key(key);
$$;

CREATE FUNCTION admin_private.commercial_clock_minutes_v1(p_clock text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_clock ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      THEN split_part(p_clock, ':', 1)::integer * 60 + split_part(p_clock, ':', 2)::integer
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.commercial_opening_hours_ok_v1(p_hours jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  day_row jsonb;
  break_row jsonb;
  seen text[] := ARRAY[]::text[];
  expected text[] := ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  day_name text;
  opens integer;
  closes integer;
  break_starts integer;
  break_ends integer;
  break_count integer;
BEGIN
  IF jsonb_typeof(p_hours) IS DISTINCT FROM 'array' OR jsonb_array_length(p_hours) <> 7 THEN
    RETURN false;
  END IF;
  FOR day_row IN SELECT value FROM jsonb_array_elements(p_hours) AS element(value)
  LOOP
    IF jsonb_typeof(day_row) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF admin_private.commercial_json_keys_v1(day_row) IS DISTINCT FROM ARRAY['breaks', 'closed', 'closes', 'day', 'opens'] THEN
      RETURN false;
    END IF;
    day_name := day_row ->> 'day';
    IF day_name <> ALL (expected) OR day_name = ANY (seen) THEN RETURN false; END IF;
    seen := seen || day_name;
    IF jsonb_typeof(day_row -> 'closed') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
    IF jsonb_typeof(day_row -> 'breaks') IS DISTINCT FROM 'array' OR jsonb_array_length(day_row -> 'breaks') > 3 THEN
      RETURN false;
    END IF;
    break_count := jsonb_array_length(day_row -> 'breaks');
    IF (day_row ->> 'closed')::boolean THEN
      IF jsonb_typeof(day_row -> 'opens') IS DISTINCT FROM 'null'
        OR jsonb_typeof(day_row -> 'closes') IS DISTINCT FROM 'null'
        OR break_count <> 0
      THEN
        RETURN false;
      END IF;
    ELSE
      opens := admin_private.commercial_clock_minutes_v1(day_row ->> 'opens');
      closes := admin_private.commercial_clock_minutes_v1(day_row ->> 'closes');
      IF opens IS NULL OR closes IS NULL OR opens = closes THEN RETURN false; END IF;
      FOR break_row IN SELECT value FROM jsonb_array_elements(day_row -> 'breaks') AS element(value)
      LOOP
        IF jsonb_typeof(break_row) IS DISTINCT FROM 'object'
          OR admin_private.commercial_json_keys_v1(break_row) IS DISTINCT FROM ARRAY['ends', 'starts']
        THEN
          RETURN false;
        END IF;
        break_starts := admin_private.commercial_clock_minutes_v1(break_row ->> 'starts');
        break_ends := admin_private.commercial_clock_minutes_v1(break_row ->> 'ends');
        IF break_starts IS NULL OR break_ends IS NULL OR break_ends <= break_starts THEN
          RETURN false;
        END IF;
        IF closes > opens THEN
          IF break_starts < opens OR break_ends > closes THEN RETURN false; END IF;
        ELSIF NOT (
          (break_starts >= opens AND break_ends <= 24 * 60)
          OR (break_starts >= 0 AND break_ends <= closes)
        ) OR (break_starts < closes AND break_ends > opens) THEN
          RETURN false;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN seen @> expected AND expected @> seen;
END;
$$;

CREATE FUNCTION admin_private.commercial_preference_payload_ok_v1(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  prefs jsonb;
  confirmation jsonb;
  window_row jsonb;
  detail jsonb;
  language text;
  seen text[] := ARRAY[]::text[];
  text_value text;
  spoken text;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(p_payload) IS DISTINCT FROM ARRAY[
      'businessId', 'confirmation', 'customerId', 'locationId',
      'onboardingRequestId', 'onboardingVersion', 'preferenceVersion', 'preferences'
    ]
  THEN
    RETURN false;
  END IF;
  prefs := p_payload -> 'preferences';
  confirmation := p_payload -> 'confirmation';
  IF jsonb_typeof(prefs) IS DISTINCT FROM 'object'
    OR jsonb_typeof(confirmation) IS DISTINCT FROM 'object'
    OR admin_private.commercial_json_keys_v1(prefs) IS DISTINCT FROM ARRAY[
      'accent', 'additionalLanguages', 'callbackInstructions', 'callbackWindows',
      'directContactRules', 'enquiryDetails', 'exceptionalHours', 'greeting',
      'openingHours', 'outOfHours', 'pronunciationNotes', 'specialInstructions',
      'spokenLanguage', 'timezone', 'urgentRules', 'voicePresentation'
    ]
    OR admin_private.commercial_json_keys_v1(confirmation) IS DISTINCT FROM ARRAY[
      'attestation', 'communicationId', 'customerConfirmedAt', 'messageId', 'source'
    ]
  THEN
    RETURN false;
  END IF;
  IF (p_payload ->> 'locationId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_payload ->> 'preferenceVersion') !~ '^(0|[1-9][0-9]*)$'
    OR NOT admin_private.commercial_opening_hours_ok_v1(prefs -> 'openingHours')
  THEN
    RETURN false;
  END IF;
  text_value := prefs ->> 'timezone';
  IF text_value !~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)+$'
    OR char_length(text_value) > 80
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = text_value)
  THEN
    RETURN false;
  END IF;
  IF prefs ->> 'voicePresentation' NOT IN ('female', 'male', 'no_preference') THEN
    RETURN false;
  END IF;
  FOREACH text_value IN ARRAY ARRAY[
    prefs ->> 'exceptionalHours', prefs ->> 'outOfHours', prefs ->> 'greeting',
    prefs ->> 'callbackInstructions', prefs ->> 'urgentRules', prefs ->> 'directContactRules',
    prefs ->> 'accent'
  ]
  LOOP
    IF text_value IS NULL OR btrim(text_value) IS DISTINCT FROM text_value THEN
      RETURN false;
    END IF;
  END LOOP;
  IF char_length(prefs ->> 'exceptionalHours') NOT BETWEEN 10 AND 400
    OR char_length(prefs ->> 'outOfHours') NOT BETWEEN 10 AND 800
    OR char_length(prefs ->> 'greeting') NOT BETWEEN 10 AND 400
    OR char_length(prefs ->> 'callbackInstructions') NOT BETWEEN 10 AND 800
    OR char_length(prefs ->> 'urgentRules') NOT BETWEEN 10 AND 800
    OR char_length(prefs ->> 'directContactRules') NOT BETWEEN 10 AND 800
    OR char_length(prefs ->> 'accent') NOT BETWEEN 2 AND 40
    OR prefs ->> 'accent' ~* 'voice_'
    OR prefs ->> 'accent' !~ '[[:alpha:]]'
  THEN
    RETURN false;
  END IF;
  spoken := prefs ->> 'spokenLanguage';
  IF spoken !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN RETURN false; END IF;
  IF jsonb_typeof(prefs -> 'additionalLanguages') IS DISTINCT FROM 'array'
    OR jsonb_array_length(prefs -> 'additionalLanguages') > 4
    OR jsonb_typeof(prefs -> 'enquiryDetails') IS DISTINCT FROM 'array'
    OR jsonb_array_length(prefs -> 'enquiryDetails') NOT BETWEEN 1 AND 8
    OR jsonb_typeof(prefs -> 'callbackWindows') IS DISTINCT FROM 'array'
    OR jsonb_array_length(prefs -> 'callbackWindows') > 14
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(prefs -> 'additionalLanguages') AS element(value)
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
    )
  THEN
    RETURN false;
  END IF;
  FOR language IN SELECT value FROM jsonb_array_elements_text(prefs -> 'additionalLanguages') AS element(value)
  LOOP
    IF language !~ '^[a-z]{2}(-[A-Z]{2})?$' OR language = spoken OR language = ANY (seen) THEN
      RETURN false;
    END IF;
    seen := seen || language;
  END LOOP;
  seen := ARRAY[]::text[];
  FOR detail IN SELECT value FROM jsonb_array_elements(prefs -> 'enquiryDetails') AS element(value)
  LOOP
    IF jsonb_typeof(detail) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    text_value := detail #>> '{}';
    IF text_value IS NULL OR btrim(text_value) IS DISTINCT FROM text_value
      OR char_length(text_value) NOT BETWEEN 3 AND 80 OR text_value = ANY (seen)
    THEN
      RETURN false;
    END IF;
    seen := seen || text_value;
  END LOOP;
  seen := ARRAY[]::text[];
  FOR window_row IN SELECT value FROM jsonb_array_elements(prefs -> 'callbackWindows') AS element(value)
  LOOP
    IF jsonb_typeof(window_row) IS DISTINCT FROM 'object'
      OR admin_private.commercial_json_keys_v1(window_row) IS DISTINCT FROM ARRAY['day', 'ends', 'starts']
      OR window_row ->> 'day' <> ALL (ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    THEN
      RETURN false;
    END IF;
    IF admin_private.commercial_clock_minutes_v1(window_row ->> 'starts') IS NULL
      OR admin_private.commercial_clock_minutes_v1(window_row ->> 'ends') IS NULL
      OR admin_private.commercial_clock_minutes_v1(window_row ->> 'ends')
        <= admin_private.commercial_clock_minutes_v1(window_row ->> 'starts')
    THEN
      RETURN false;
    END IF;
    text_value := (window_row ->> 'day') || ' ' || (window_row ->> 'starts');
    IF text_value = ANY (seen) THEN RETURN false; END IF;
    seen := seen || text_value;
  END LOOP;
  IF jsonb_typeof(prefs -> 'pronunciationNotes') = 'string' THEN
    text_value := prefs ->> 'pronunciationNotes';
    IF btrim(text_value) IS DISTINCT FROM text_value OR char_length(text_value) NOT BETWEEN 1 AND 400 THEN
      RETURN false;
    END IF;
  ELSIF jsonb_typeof(prefs -> 'pronunciationNotes') IS DISTINCT FROM 'null' THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(prefs -> 'specialInstructions') = 'string' THEN
    text_value := prefs ->> 'specialInstructions';
    IF btrim(text_value) IS DISTINCT FROM text_value OR char_length(text_value) NOT BETWEEN 1 AND 1000 THEN
      RETURN false;
    END IF;
  ELSIF jsonb_typeof(prefs -> 'specialInstructions') IS DISTINCT FROM 'null' THEN
    RETURN false;
  END IF;
  IF confirmation ->> 'source' = 'recorded_email' THEN
    IF jsonb_typeof(confirmation -> 'communicationId') IS DISTINCT FROM 'string'
      OR (confirmation ->> 'communicationId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      OR jsonb_typeof(confirmation -> 'messageId') IS DISTINCT FROM 'null'
      OR jsonb_typeof(confirmation -> 'attestation') IS DISTINCT FROM 'null'
    THEN
      RETURN false;
    END IF;
  ELSIF confirmation ->> 'source' = 'recorded_message' THEN
    IF jsonb_typeof(confirmation -> 'messageId') IS DISTINCT FROM 'string'
      OR (confirmation ->> 'messageId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      OR jsonb_typeof(confirmation -> 'communicationId') IS DISTINCT FROM 'null'
      OR jsonb_typeof(confirmation -> 'attestation') IS DISTINCT FROM 'null'
    THEN
      RETURN false;
    END IF;
  ELSIF confirmation ->> 'source' = 'telephone' THEN
    text_value := confirmation ->> 'attestation';
    IF jsonb_typeof(confirmation -> 'communicationId') IS DISTINCT FROM 'null'
      OR jsonb_typeof(confirmation -> 'messageId') IS DISTINCT FROM 'null'
      OR jsonb_typeof(confirmation -> 'attestation') IS DISTINCT FROM 'string'
      OR text_value IS NULL
      OR btrim(text_value) IS DISTINCT FROM text_value
      OR char_length(text_value) NOT BETWEEN 20 AND 500
    THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;
  text_value := confirmation ->> 'customerConfirmedAt';
  IF text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION admin_private.commercial_hours_summary_v1(p_hours jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  ordered text[] := ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  labels text[] := ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  index integer;
  day_row jsonb;
  break_row jsonb;
  breaks text;
  parts text[] := ARRAY[]::text[];
BEGIN
  FOR index IN 1..7 LOOP
    SELECT value INTO day_row
    FROM jsonb_array_elements(p_hours) AS element(value)
    WHERE value ->> 'day' = ordered[index];
    IF (day_row ->> 'closed')::boolean THEN
      parts := parts || (labels[index] || ' closed');
    ELSE
      breaks := '';
      FOR break_row IN SELECT value FROM jsonb_array_elements(day_row -> 'breaks') AS element(value)
      LOOP
        breaks := breaks || CASE WHEN breaks = '' THEN '' ELSE ', ' END
          || (break_row ->> 'starts') || '–' || (break_row ->> 'ends');
      END LOOP;
      parts := parts || (
        labels[index] || ' ' || (day_row ->> 'opens') || '–' || (day_row ->> 'closes')
        || CASE WHEN breaks = '' THEN '' ELSE ' (break ' || breaks || ')' END
      );
    END IF;
  END LOOP;
  RETURN array_to_string(parts, '; ');
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_json_keys_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_clock_minutes_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_opening_hours_ok_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_preference_payload_ok_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_hours_summary_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE admin_private.commercial_location_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements (id) ON DELETE RESTRICT,
  CONSTRAINT commercial_location_preferences_provision_fk
    FOREIGN KEY (entitlement_id) REFERENCES public.service_provisions (entitlement_id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED')),
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
  confirmation_source text,
  communication_id uuid REFERENCES public.communications (id) ON DELETE RESTRICT,
  message_id uuid REFERENCES public.conversation_messages (id) ON DELETE RESTRICT,
  attestation text,
  customer_confirmed_at timestamptz,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  request_id uuid NOT NULL UNIQUE,
  CONSTRAINT commercial_location_preferences_version_key UNIQUE (subscription_id, location_id, version),
  CONSTRAINT commercial_location_preferences_hours_check CHECK (admin_private.commercial_opening_hours_ok_v1(opening_hours)),
  CONSTRAINT commercial_location_preferences_timezone_check CHECK (
    timezone ~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)+$' AND char_length(timezone) <= 80
  ),
  CONSTRAINT commercial_location_preferences_copy_check CHECK (
    char_length(exceptional_hours) BETWEEN 10 AND 400
    AND char_length(out_of_hours) BETWEEN 10 AND 800
    AND char_length(greeting) BETWEEN 10 AND 400
    AND char_length(callback_instructions) BETWEEN 10 AND 800
    AND char_length(urgent_rules) BETWEEN 10 AND 800
    AND char_length(direct_contact_rules) BETWEEN 10 AND 800
    AND char_length(accent) BETWEEN 2 AND 40
    AND accent !~* 'voice_'
    AND spoken_language ~ '^[a-z]{2}(-[A-Z]{2})?$'
  ),
  CONSTRAINT commercial_location_preferences_confirmation_check CHECK (
    (
      status = 'DRAFT'
      AND confirmation_source IS NULL
      AND communication_id IS NULL
      AND message_id IS NULL
      AND attestation IS NULL
      AND customer_confirmed_at IS NULL
    )
    OR (
      status = 'CONFIRMED'
      AND customer_confirmed_at IS NOT NULL
      AND (
        (
          confirmation_source = 'recorded_email'
          AND communication_id IS NOT NULL
          AND message_id IS NULL
          AND attestation IS NULL
        )
        OR (
          confirmation_source = 'recorded_message'
          AND message_id IS NOT NULL
          AND communication_id IS NULL
          AND attestation IS NULL
        )
        OR (
          confirmation_source = 'telephone'
          AND communication_id IS NULL
          AND message_id IS NULL
          AND attestation IS NOT NULL
          AND char_length(attestation) BETWEEN 20 AND 500
        )
      )
    )
  )
);

CREATE INDEX commercial_location_preferences_current_idx
  ON admin_private.commercial_location_preferences (subscription_id, location_id, version DESC);

ALTER TABLE admin_private.commercial_location_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_location_preferences FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_location_preferences_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_location_preferences
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TABLE admin_private.commercial_preference_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  preference_id uuid NOT NULL REFERENCES admin_private.commercial_location_preferences (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  location_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  operation text NOT NULL CHECK (operation = 'confirm_preferences'),
  version integer NOT NULL CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE admin_private.commercial_preference_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_preference_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.commercial_preference_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_preference_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_preference_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

ALTER TABLE admin_private.onboarding_request_events
  DROP CONSTRAINT onboarding_request_events_operation_check;

ALTER TABLE admin_private.onboarding_request_events
  ADD CONSTRAINT onboarding_request_events_operation_check CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer',
    'issue_invitation', 'resend_invitation', 'revoke_invitation',
    'begin_setup', 'confirm_preferences'
  ));

CREATE FUNCTION admin_private.commercial_preference_projection_v1(p_subscription uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  location_count integer := 0;
  confirmed_count integer := 0;
  remaining text := '';
  progress jsonb := '[]'::jsonb;
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

  SELECT count(*)::integer INTO confirmed_count
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
  JOIN admin_private.commercial_location_preferences pref
    ON pref.subscription_id = sub.id
   AND pref.customer_id = sub.customer_id
   AND pref.business_id = sub.business_id
   AND pref.location_id = location.id
   AND pref.status = 'CONFIRMED'
   AND pref.version = (
     SELECT max(latest.version)
     FROM admin_private.commercial_location_preferences latest
     WHERE latest.subscription_id = pref.subscription_id
       AND latest.location_id = pref.location_id
   )
  WHERE sub.id = p_subscription;

  SELECT coalesce(string_agg(location.location_name, ', ' ORDER BY location.location_name), '')
  INTO remaining
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
  WHERE sub.id = p_subscription
    AND NOT EXISTS (
      SELECT 1
      FROM admin_private.commercial_location_preferences pref
      WHERE pref.subscription_id = sub.id
        AND pref.location_id = location.id
        AND pref.status = 'CONFIRMED'
        AND pref.version = (
          SELECT max(latest.version)
          FROM admin_private.commercial_location_preferences latest
          WHERE latest.subscription_id = pref.subscription_id
            AND latest.location_id = pref.location_id
        )
    );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'locationId', location.id,
    'locationName', coalesce(nullif(btrim(location.location_name), ''), 'Selected location'),
    'confirmed', pref.id IS NOT NULL,
    'version', coalesce(pref.version, 0)
  ) ORDER BY location.location_name, location.id), '[]'::jsonb)
  INTO progress
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
  LEFT JOIN admin_private.commercial_location_preferences pref
    ON pref.subscription_id = sub.id
   AND pref.location_id = location.id
   AND pref.status = 'CONFIRMED'
   AND pref.version = (
     SELECT max(latest.version)
     FROM admin_private.commercial_location_preferences latest
     WHERE latest.subscription_id = pref.subscription_id
       AND latest.location_id = pref.location_id
   )
  WHERE sub.id = p_subscription;

  SELECT coalesce(jsonb_agg(
    CASE WHEN pref.id IS NULL THEN jsonb_build_object(
      'locationId', location.id,
      'locationName', coalesce(nullif(btrim(location.location_name), ''), 'Selected location'),
      'status', 'needed'
    ) ELSE jsonb_build_object(
      'locationId', location.id,
      'locationName', coalesce(nullif(btrim(location.location_name), ''), 'Selected location'),
      'status', 'recorded',
      'timezone', pref.timezone,
      'hoursSummary', admin_private.commercial_hours_summary_v1(pref.opening_hours),
      'exceptionalHours', pref.exceptional_hours,
      'outOfHours', pref.out_of_hours,
      'greeting', pref.greeting,
      'enquiryDetails', pref.enquiry_details,
      'callbackInstructions', pref.callback_instructions,
      'callbackWindows', pref.callback_windows,
      'urgentRules', pref.urgent_rules,
      'directContactRules', pref.direct_contact_rules,
      'specialInstructions', pref.special_instructions,
      'spokenLanguage', pref.spoken_language,
      'additionalLanguages', pref.additional_languages,
      'voicePresentation', CASE pref.voice_presentation
        WHEN 'female' THEN 'Female'
        WHEN 'male' THEN 'Male'
        ELSE 'No preference'
      END,
      'accent', pref.accent,
      'pronunciationNotes', pref.pronunciation_notes,
      'customerConfirmedAt', pref.customer_confirmed_at,
      'recordedBy', 'Your setup team',
      'note', 'Recorded by your setup team from your confirmation. You will still confirm the service before it is activated. The receptionist is not configured or active.'
    ) END
    ORDER BY location.location_name, location.id
  ), '[]'::jsonb)
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
  LEFT JOIN admin_private.commercial_location_preferences pref
    ON pref.subscription_id = sub.id
   AND pref.location_id = location.id
   AND pref.status = 'CONFIRMED'
   AND pref.version = (
     SELECT max(latest.version)
     FROM admin_private.commercial_location_preferences latest
     WHERE latest.subscription_id = pref.subscription_id
       AND latest.location_id = pref.location_id
   )
  WHERE sub.id = p_subscription;

  state := CASE
    WHEN location_count > 0 AND confirmed_count = location_count THEN 'complete'
    WHEN confirmed_count > 0 THEN 'partial'
    ELSE 'needed'
  END;
  RETURN jsonb_build_object(
    'confirmedCount', confirmed_count,
    'locationCount', location_count,
    'complete', location_count > 0 AND confirmed_count = location_count,
    'remainingNames', remaining,
    'progress', jsonb_build_object(
      'confirmedCount', confirmed_count,
      'locationCount', location_count,
      'locations', progress
    ),
    'customer', jsonb_build_object(
      'state', state,
      'confirmedCount', confirmed_count,
      'locationCount', location_count,
      'locations', customer_locations
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_preference_projection_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

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
    (built.item - 'customerName' - 'businessId' - 'plan' - 'monthlyPriceMinor' - 'currency' - 'guardLocationCount' - 'nextAction' - 'preferenceProgress')
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

COMMENT ON FUNCTION public.customer_portal_setup_handover_v1(text) IS
  'Read-only setup handover for the signed-in customer. Verified payment is the initial settlement for the recorded period. Confirmed business preferences are shown by location without staff notes or evidence identifiers. Recording a preference does not configure or activate the receptionist.';

REVOKE ALL ON FUNCTION public.customer_portal_setup_handover_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_setup_handover_v1(text) TO service_role;

CREATE FUNCTION public.admin_commercial_confirm_preferences_v1(
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
      ELSIF chosen_entitlement IS NULL OR provision_state IS DISTINCT FROM 'PROFILE_REQUIRED' THEN
        outcome := jsonb_build_object('status', 'denied', 'reason', 'setup');
      END IF;
    END IF;
  END IF;

  IF outcome IS NULL THEN
    source := p_payload #>> '{confirmation,source}';
    IF source = 'recorded_email' AND NOT EXISTS (
      SELECT 1
      FROM public.communications communication
      JOIN public.conversations conversation ON conversation.id = communication.conversation_id
      WHERE communication.id = (p_payload #>> '{confirmation,communicationId}')::uuid
        AND conversation.customer_id = sub.customer_id
        AND (conversation.business_id IS NULL OR conversation.business_id = sub.business_id)
        AND communication.channel = 'EMAIL'
        AND communication.direction = 'INBOUND'
        AND communication.status = 'SENT'
    ) THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'provenance');
    ELSIF source = 'recorded_message' AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_messages message
      JOIN public.conversations conversation ON conversation.id = message.conversation_id
      WHERE message.id = (p_payload #>> '{confirmation,messageId}')::uuid
        AND message.kind = 'INBOUND_EMAIL'
        AND message.import_status = 'IMPORTED'
        AND conversation.customer_id = sub.customer_id
        AND (conversation.business_id IS NULL OR conversation.business_id = sub.business_id)
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
      CASE WHEN source = 'telephone' THEN p_payload #>> '{confirmation,attestation}' ELSE NULL END,
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

COMMENT ON FUNCTION public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb) IS
  'Audited Admin confirmation of customer business and voice preferences for one selected location. Requires begin setup, a verified paid subscription, and an explicit confirmation source. Does not call a provider, allocate a number, enable Guard, change billing, send mail, or move a service to live.';

REVOKE ALL ON FUNCTION public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;

COMMIT;
