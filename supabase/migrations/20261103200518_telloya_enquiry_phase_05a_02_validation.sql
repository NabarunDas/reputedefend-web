-- Telloya Phase 05A-02: extend enquiry JSON validation for typed plan fields.
-- Additive CREATE OR REPLACE of admin_private.valid_enquiry_v1 only.
-- Does not edit 20261102200000, does not change the function signature,
-- volatility, search_path, or grants, and does not replace create_general_enquiry_v1.
--
-- Plan tiers: basic, growth, pro, custom.
-- Text limits match the application: customLanguages 500, customRequirements 2000,
-- additionalLanguages 500, voiceAccent 100, primaryLanguage 100.
-- Every supplied optional field is checked, including when its add-on is not selected.
-- The ProfileRelaunch branch below is the applied 20261102200000 branch, unchanged.

CREATE OR REPLACE FUNCTION admin_private.valid_enquiry_v1(p_data jsonb, p_manual boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path=''
AS $$
DECLARE
  k text;
  value text;
  p_source text;
  plan_tier text;
  guard_interested boolean := false;
  overage_interested boolean := false;
  n numeric;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>32768 THEN
    RETURN false;
  END IF;

  p_source := p_data->>'source';

  IF p_source IS NULL OR p_source NOT IN ('homepage','contact','phone','telloya') THEN
    RETURN false;
  END IF;

  IF p_source = 'telloya' THEN
    -- Original Telloya keys stay required. Phase 05A-02 keys are optional additions.
    IF (p_data - ARRAY[
      'fullName','email','phone','businessName','country','trade','locations','websiteUrl',
      'product','missedCallProblem','phoneSetup','contactPreference','details','privacyAccepted','source',
      'planTier','guardInterested','guardLocationCount',
      'customMonthlyMinutes','customMonthlyCalls','customPhoneNumbers','customLocations',
      'customLanguages','customRequirements',
      'voicePreference','voiceAccent','primaryLanguage','speakingStyle','additionalLanguages',
      'overageInterested','overageMonthlyCapGbp'
    ])<>'{}'::jsonb THEN
      RETURN false;
    END IF;

    FOREACH k IN ARRAY ARRAY['fullName','email','phone','businessName','country','trade','locations','websiteUrl','product','missedCallProblem','phoneSetup','contactPreference','details','source'] LOOP
      IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;

    IF jsonb_typeof(p_data->'privacyAccepted') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;

    IF length(btrim(p_data->>'fullName')) NOT BETWEEN 1 AND 100
      OR length(p_data->>'email')>254
      OR length(p_data->>'phone')>40
      OR length(btrim(p_data->>'businessName')) NOT BETWEEN 1 AND 160
      OR length(p_data->>'country')>80
      OR length(btrim(p_data->>'trade')) NOT BETWEEN 1 AND 100
      OR length(p_data->>'locations')>50
      OR length(p_data->>'product')>64
      OR length(p_data->>'missedCallProblem')>5000
      OR length(p_data->>'phoneSetup')>5000
      OR length(p_data->>'contactPreference')>100
      OR length(btrim(p_data->>'details')) NOT BETWEEN 1 AND 5000 THEN
      RETURN false;
    END IF;

    IF p_data->>'email'='' OR (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RETURN false;
    END IF;

    IF length(btrim(p_data->>'phone'))<7 OR (p_data->>'phone') !~ '^[+]?[\d\s().-]{7,}$' THEN
      RETURN false;
    END IF;

    -- Original product contract. Modern payloads send telloya; legacy may send complete.
    IF p_data->>'product' NOT IN ('telloya','complete') THEN
      RETURN false;
    END IF;

    IF (p_data->>'privacyAccepted')::boolean <> true THEN
      RETURN false;
    END IF;

    value := p_data->>'websiteUrl';
    IF length(value)>1000 OR (value<>'' AND value !~ '^https?://[^[:space:]]+$') THEN
      RETURN false;
    END IF;

    -- planTier may be absent or blank on a historical product-only payload.
    IF p_data ? 'planTier' THEN
      IF jsonb_typeof(p_data->'planTier') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      plan_tier := p_data->>'planTier';
      IF plan_tier <> '' AND plan_tier NOT IN ('basic','growth','pro','custom') THEN
        RETURN false;
      END IF;
      IF plan_tier = '' THEN
        plan_tier := NULL;
      END IF;
    END IF;

    IF p_data ? 'guardInterested' THEN
      IF jsonb_typeof(p_data->'guardInterested') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
      guard_interested := (p_data->>'guardInterested')::boolean;
    END IF;

    IF p_data ? 'overageInterested' THEN
      IF jsonb_typeof(p_data->'overageInterested') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
      overage_interested := (p_data->>'overageInterested')::boolean;
    END IF;

    -- Bounds apply whenever the key is supplied, even if the add-on is not selected.
    IF p_data ? 'guardLocationCount' THEN
      IF jsonb_typeof(p_data->'guardLocationCount') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (p_data->>'guardLocationCount')::numeric;
      IF n < 1 OR n > 999 OR n <> trunc(n) THEN RETURN false; END IF;
    ELSIF guard_interested THEN
      RETURN false;
    END IF;

    IF p_data ? 'customMonthlyMinutes' THEN
      IF jsonb_typeof(p_data->'customMonthlyMinutes') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (p_data->>'customMonthlyMinutes')::numeric;
      IF n < 1 OR n > 1000000 OR n <> trunc(n) THEN RETURN false; END IF;
    ELSIF plan_tier = 'custom' THEN
      RETURN false;
    END IF;

    IF p_data ? 'customMonthlyCalls' THEN
      IF jsonb_typeof(p_data->'customMonthlyCalls') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (p_data->>'customMonthlyCalls')::numeric;
      IF n < 1 OR n > 100000 OR n <> trunc(n) THEN RETURN false; END IF;
    END IF;

    IF p_data ? 'customPhoneNumbers' THEN
      IF jsonb_typeof(p_data->'customPhoneNumbers') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (p_data->>'customPhoneNumbers')::numeric;
      IF n < 1 OR n > 999 OR n <> trunc(n) THEN RETURN false; END IF;
    ELSIF plan_tier = 'custom' THEN
      RETURN false;
    END IF;

    IF p_data ? 'customLocations' THEN
      IF jsonb_typeof(p_data->'customLocations') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (p_data->>'customLocations')::numeric;
      IF n < 1 OR n > 9999 OR n <> trunc(n) THEN RETURN false; END IF;
    ELSIF plan_tier = 'custom' THEN
      RETURN false;
    END IF;

    IF p_data ? 'overageMonthlyCapGbp' THEN
      IF jsonb_typeof(p_data->'overageMonthlyCapGbp') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (p_data->>'overageMonthlyCapGbp')::numeric;
      IF n < 1 OR n > 100000 THEN RETURN false; END IF;
    ELSIF overage_interested THEN
      RETURN false;
    END IF;

    IF p_data ? 'customLanguages' THEN
      IF jsonb_typeof(p_data->'customLanguages') IS DISTINCT FROM 'string' OR length(p_data->>'customLanguages') > 500 THEN
        RETURN false;
      END IF;
    END IF;

    IF p_data ? 'customRequirements' THEN
      IF jsonb_typeof(p_data->'customRequirements') IS DISTINCT FROM 'string' OR length(p_data->>'customRequirements') > 2000 THEN
        RETURN false;
      END IF;
    END IF;

    IF p_data ? 'additionalLanguages' THEN
      IF jsonb_typeof(p_data->'additionalLanguages') IS DISTINCT FROM 'string' OR length(p_data->>'additionalLanguages') > 500 THEN
        RETURN false;
      END IF;
    END IF;

    IF p_data ? 'voiceAccent' THEN
      IF jsonb_typeof(p_data->'voiceAccent') IS DISTINCT FROM 'string' OR length(p_data->>'voiceAccent') > 100 THEN
        RETURN false;
      END IF;
    END IF;

    IF p_data ? 'primaryLanguage' THEN
      IF jsonb_typeof(p_data->'primaryLanguage') IS DISTINCT FROM 'string' OR length(p_data->>'primaryLanguage') > 100 THEN
        RETURN false;
      END IF;
    END IF;

    IF p_data ? 'voicePreference' THEN
      IF jsonb_typeof(p_data->'voicePreference') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      value := p_data->>'voicePreference';
      IF value <> '' AND value NOT IN ('female','male','no-preference') THEN RETURN false; END IF;
    END IF;

    IF p_data ? 'speakingStyle' THEN
      IF jsonb_typeof(p_data->'speakingStyle') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      value := p_data->>'speakingStyle';
      IF value <> '' AND value NOT IN ('friendly','professional','calm','no-preference') THEN RETURN false; END IF;
    END IF;

  ELSE
    -- Existing ProfileRelaunch validation - unchanged from 20261102200000
    IF (p_data - ARRAY['fullName','email','phone','businessName','country','service','subject','details','websiteUrl','businessProfileUrl','reviewUrl','informationAccurate','privacyAccepted','source'])<>'{}'::jsonb THEN
      RETURN false;
    END IF;

    FOREACH k IN ARRAY ARRAY['fullName','email','phone','businessName','country','service','subject','details','websiteUrl','businessProfileUrl','reviewUrl','source'] LOOP
      IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;

    IF length(btrim(p_data->>'fullName')) NOT BETWEEN 1 AND 100
      OR length(p_data->>'email')>254
      OR length(p_data->>'phone')>40
      OR length(btrim(p_data->>'details')) NOT BETWEEN 1 AND 5000
      OR length(p_data->>'businessName')>160
      OR length(p_data->>'country')>80
      OR length(p_data->>'subject')>64
      OR length(p_data->>'service')>64 THEN
      RETURN false;
    END IF;

    IF p_manual THEN
      IF p_source<>'phone' OR (p_data->>'email'='' AND length(btrim(p_data->>'phone'))<7) THEN
        RETURN false;
      END IF;
    ELSE
      IF p_source NOT IN ('homepage','contact') OR p_data->>'email'='' THEN
        RETURN false;
      END IF;
    END IF;

    IF p_data->>'email'<>'' AND (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RETURN false;
    END IF;

    FOREACH k IN ARRAY ARRAY['websiteUrl','businessProfileUrl','reviewUrl'] LOOP
      value := p_data->>k;
      IF length(value)>1000 OR (value<>'' AND value !~ '^https?://[^[:space:]]+$') THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION admin_private.valid_enquiry_v1(jsonb, boolean) IS
  'Validates enquiry JSON. Telloya branch extended 2026-11-03 for Phase 05A-02 fields. Signature, search_path, volatility and grants are unchanged.';
