-- Migration: Extend Telloya enquiry validation for Phase 05A-02 fields
-- Additive change preserving ProfileRelaunch and legacy Telloya behavior
-- Date: 2026-11-03
-- Status: PROPOSAL - Do not apply without approval

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
  guard_interested boolean;
  overage_interested boolean;
  guard_count numeric;
  custom_minutes numeric;
  custom_calls numeric;
  custom_phones numeric;
  custom_locs numeric;
  overage_cap numeric;
BEGIN
  -- Basic structure validation
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>32768 THEN 
    RETURN false; 
  END IF;
  
  p_source := p_data->>'source';
  
  -- Validate source
  IF p_source IS NULL OR p_source NOT IN ('homepage','contact','phone','telloya') THEN
    RETURN false;
  END IF;
  
  -- Source-specific field validation
  IF p_source = 'telloya' THEN
    -- Telloya enquiry validation (Phase 05A-02 extended)
    -- Required fields: fullName, email, businessName, country, trade, phone, details, privacyAccepted
    -- Legacy required: product (now optional when planTier provided)
    -- NEW Phase 05A-02 fields: planTier, guardInterested, guardLocationCount, etc.
    
    IF (p_data - ARRAY[
      -- Legacy fields
      'fullName','email','phone','businessName','country','trade','locations','websiteUrl',
      'product','missedCallProblem','phoneSetup','contactPreference','details','privacyAccepted','source',
      -- Phase 05A-02 fields
      'planTier','guardInterested','guardLocationCount',
      'customMonthlyMinutes','customMonthlyCalls','customPhoneNumbers','customLocations',
      'customLanguages','customRequirements',
      'voicePreference','voiceAccent','primaryLanguage','speakingStyle','additionalLanguages',
      'overageInterested','overageMonthlyCapGbp'
    ])<>'{}'::jsonb THEN 
      RETURN false; 
    END IF;
    
    -- String field type checks (legacy required fields)
    FOREACH k IN ARRAY ARRAY['fullName','email','phone','businessName','country','trade','details','source'] LOOP
      IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;
    
    -- Legacy optional string fields (if present must be string)
    FOREACH k IN ARRAY ARRAY['locations','websiteUrl','product','missedCallProblem','phoneSetup','contactPreference'] LOOP
      IF p_data->k IS NOT NULL AND jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN 
        RETURN false; 
      END IF;
    END LOOP;
    
    -- Boolean field checks (required)
    IF jsonb_typeof(p_data->'privacyAccepted') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
    
    -- Phase 05A-02 string fields (optional, but must be string type if present)
    FOREACH k IN ARRAY ARRAY['planTier','customLanguages','customRequirements','voicePreference','voiceAccent','primaryLanguage','speakingStyle','additionalLanguages'] LOOP
      IF p_data->k IS NOT NULL AND p_data->>k <> '' AND jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN 
        RETURN false; 
      END IF;
    END LOOP;
    
    -- Phase 05A-02 boolean fields (optional, but must be boolean type if present)
    FOREACH k IN ARRAY ARRAY['guardInterested','overageInterested'] LOOP
      IF p_data->k IS NOT NULL AND jsonb_typeof(p_data->k) IS DISTINCT FROM 'boolean' THEN 
        RETURN false; 
      END IF;
    END LOOP;
    
    -- Phase 05A-02 numeric fields (optional, but must be number type if present and not null)
    FOREACH k IN ARRAY ARRAY['guardLocationCount','customMonthlyMinutes','customMonthlyCalls','customPhoneNumbers','customLocations','overageMonthlyCapGbp'] LOOP
      IF p_data->k IS NOT NULL AND jsonb_typeof(p_data->k) IS DISTINCT FROM 'number' THEN 
        RETURN false; 
      END IF;
    END LOOP;
    
    -- Legacy length validations
    IF length(btrim(p_data->>'fullName')) NOT BETWEEN 1 AND 100 
      OR length(p_data->>'email')>254 
      OR length(p_data->>'phone')>40
      OR length(btrim(p_data->>'businessName')) NOT BETWEEN 1 AND 160
      OR length(p_data->>'country')>80
      OR length(btrim(p_data->>'trade')) NOT BETWEEN 1 AND 100
      OR length(btrim(p_data->>'details')) NOT BETWEEN 1 AND 5000 THEN 
      RETURN false; 
    END IF;
    
    -- Legacy optional field lengths (if present)
    IF (p_data->>'locations' IS NOT NULL AND length(p_data->>'locations')>50)
      OR (p_data->>'product' IS NOT NULL AND length(p_data->>'product')>64)
      OR (p_data->>'missedCallProblem' IS NOT NULL AND length(p_data->>'missedCallProblem')>5000)
      OR (p_data->>'phoneSetup' IS NOT NULL AND length(p_data->>'phoneSetup')>5000)
      OR (p_data->>'contactPreference' IS NOT NULL AND length(p_data->>'contactPreference')>100) THEN
      RETURN false;
    END IF;
    
    -- Phase 05A-02 string length validations (if present and not empty)
    IF (p_data->>'planTier' IS NOT NULL AND p_data->>'planTier' <> '' AND length(p_data->>'planTier')>20)
      OR (p_data->>'customLanguages' IS NOT NULL AND length(p_data->>'customLanguages')>5000)
      OR (p_data->>'customRequirements' IS NOT NULL AND length(p_data->>'customRequirements')>5000)
      OR (p_data->>'voicePreference' IS NOT NULL AND p_data->>'voicePreference' <> '' AND length(p_data->>'voicePreference')>20)
      OR (p_data->>'voiceAccent' IS NOT NULL AND length(p_data->>'voiceAccent')>100)
      OR (p_data->>'primaryLanguage' IS NOT NULL AND length(p_data->>'primaryLanguage')>100)
      OR (p_data->>'speakingStyle' IS NOT NULL AND p_data->>'speakingStyle' <> '' AND length(p_data->>'speakingStyle')>20)
      OR (p_data->>'additionalLanguages' IS NOT NULL AND length(p_data->>'additionalLanguages')>1000) THEN
      RETURN false;
    END IF;
    
    -- Legacy email validation (required)
    IF p_data->>'email'='' OR (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 
      RETURN false; 
    END IF;
    
    -- Legacy phone validation (required for Telloya)
    IF length(btrim(p_data->>'phone'))<7 OR (p_data->>'phone') !~ '^[+]?[\d\s().-]{7,}$' THEN
      RETURN false;
    END IF;
    
    -- Legacy product OR new planTier required
    IF (p_data->>'product' IS NULL OR p_data->>'product' = '') 
       AND (p_data->>'planTier' IS NULL OR p_data->>'planTier' = '') THEN
      RETURN false;
    END IF;
    
    -- Legacy product validation (if provided, must be valid)
    IF p_data->>'product' IS NOT NULL AND p_data->>'product' <> '' 
       AND p_data->>'product' NOT IN ('telloya','complete') THEN
      RETURN false;
    END IF;
    
    -- Legacy privacy acceptance (required)
    IF (p_data->>'privacyAccepted')::boolean <> true THEN
      RETURN false;
    END IF;
    
    -- Legacy website URL validation (optional)
    value := p_data->>'websiteUrl';
    IF length(value)>1000 OR (value<>'' AND value !~ '^https?://[^[:space:]]+$') THEN 
      RETURN false; 
    END IF;
    
    -- Phase 05A-02 validations
    
    -- Plan tier validation (optional, but if present and non-empty must be valid)
    plan_tier := p_data->>'planTier';
    IF plan_tier IS NOT NULL AND plan_tier <> '' 
       AND plan_tier NOT IN ('basic','growth','pro','custom') THEN
      RETURN false;
    END IF;
    
    -- Voice preference validation (optional, if present and non-empty must be valid)
    value := p_data->>'voicePreference';
    IF value IS NOT NULL AND value <> '' 
       AND value NOT IN ('female','male','no-preference') THEN
      RETURN false;
    END IF;
    
    -- Speaking style validation (optional, if present and non-empty must be valid)
    value := p_data->>'speakingStyle';
    IF value IS NOT NULL AND value <> '' 
       AND value NOT IN ('friendly','professional','calm','no-preference') THEN
      RETURN false;
    END IF;
    
    -- Guard interested conditional validation
    guard_interested := COALESCE((p_data->>'guardInterested')::boolean, false);
    IF guard_interested THEN
      -- Guard location count required when guardInterested is true
      IF p_data->'guardLocationCount' IS NULL THEN
        RETURN false;
      END IF;
      
      guard_count := (p_data->>'guardLocationCount')::numeric;
      IF guard_count < 1 OR guard_count > 999 OR guard_count <> floor(guard_count) THEN
        RETURN false;
      END IF;
    END IF;
    
    -- Custom plan conditional validation
    IF plan_tier = 'custom' THEN
      -- Monthly minutes required
      IF p_data->'customMonthlyMinutes' IS NULL THEN
        RETURN false;
      END IF;
      custom_minutes := (p_data->>'customMonthlyMinutes')::numeric;
      IF custom_minutes < 1 OR custom_minutes > 1000000 OR custom_minutes <> floor(custom_minutes) THEN
        RETURN false;
      END IF;
      
      -- Monthly calls optional, but validate if present
      IF p_data->'customMonthlyCalls' IS NOT NULL THEN
        custom_calls := (p_data->>'customMonthlyCalls')::numeric;
        IF custom_calls < 1 OR custom_calls > 100000 OR custom_calls <> floor(custom_calls) THEN
          RETURN false;
        END IF;
      END IF;
      
      -- Phone numbers required
      IF p_data->'customPhoneNumbers' IS NULL THEN
        RETURN false;
      END IF;
      custom_phones := (p_data->>'customPhoneNumbers')::numeric;
      IF custom_phones < 1 OR custom_phones > 999 OR custom_phones <> floor(custom_phones) THEN
        RETURN false;
      END IF;
      
      -- Locations required
      IF p_data->'customLocations' IS NULL THEN
        RETURN false;
      END IF;
      custom_locs := (p_data->>'customLocations')::numeric;
      IF custom_locs < 1 OR custom_locs > 9999 OR custom_locs <> floor(custom_locs) THEN
        RETURN false;
      END IF;
    END IF;
    
    -- Overage interested conditional validation
    overage_interested := COALESCE((p_data->>'overageInterested')::boolean, false);
    IF overage_interested THEN
      -- Overage cap required when overageInterested is true
      IF p_data->'overageMonthlyCapGbp' IS NULL THEN
        RETURN false;
      END IF;
      
      overage_cap := (p_data->>'overageMonthlyCapGbp')::numeric;
      IF overage_cap < 1 OR overage_cap > 100000 THEN
        RETURN false;
      END IF;
    END IF;
    
  ELSE
    -- Existing ProfileRelaunch validation - COMPLETELY UNCHANGED
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
    
    FOREACH k IN ARRAY ARRAY['informationAccurate','privacyAccepted'] LOOP
      IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
    END LOOP;
    
    IF NOT p_manual THEN
      IF (p_data->>'informationAccurate')::boolean<>true OR (p_data->>'privacyAccepted')::boolean<>true THEN 
        RETURN false; 
      END IF;
    END IF;
  END IF;
  
  RETURN true; 
END;
$$;

-- Security: Function permissions unchanged from previous migration
-- This migration only modifies the function body, not its signature or permissions
COMMENT ON FUNCTION admin_private.valid_enquiry_v1(jsonb, boolean) IS 
  'Validates enquiry JSON payloads for ProfileRelaunch and Telloya sources. Extended 2026-11-03 for Telloya Phase 05A-02 fields.';
