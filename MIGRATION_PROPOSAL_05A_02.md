# Migration Proposal: Telloya Phase 05A-02 Database Validation

## Overview

This proposal extends `admin_private.valid_enquiry_v1` to validate the new Telloya Phase 05A-02 enquiry fields (plan tier, Guard add-on, custom requirements, voice preferences, and overage interest) without affecting existing ProfileRelaunch or legacy Telloya enquiries.

**Status:** PROPOSAL ONLY - Do not apply without independent approval

## New Fields to Validate

### Required Fields (when applicable)
- `planTier` (string): Plan selection - "starter" | "professional" | "premium" | "custom"
- `guardInterested` (boolean): Whether Guard add-on is requested
- `overageInterested` (boolean): Whether overage minutes are requested

### Conditional Required Fields
- `guardLocationCount` (number): Required when `guardInterested=true`, range 1-999
- `customMonthlyMinutes` (number): Required when `planTier="custom"`, range 1-1,000,000
- `customPhoneNumbers` (number): Required when `planTier="custom"`, range 1-999
- `customLocations` (number): Required when `planTier="custom"`, range 1-9,999
- `overageMonthlyCapGbp` (number): Required when `overageInterested=true`, range 1-100,000

### Optional Fields
- `customMonthlyCalls` (number): Optional even when `planTier="custom"`, range 1-100,000 if provided
- `customLanguages` (string): Optional, max 5,000 characters
- `customRequirements` (string): Optional, max 5,000 characters
- `voicePreference` (string): Optional, "female" | "male" | "no-preference"
- `voiceAccent` (string): Optional, max 100 characters
- `primaryLanguage` (string): Optional, max 100 characters
- `speakingStyle` (string): Optional, "friendly" | "professional" | "calm" | "no-preference"
- `additionalLanguages` (string): Optional, max 1,000 characters

## Migration SQL

**File:** `supabase/migrations/20261103XXXXXX_telloya_enquiry_validation_v2.sql`

```sql
-- Migration: Extend Telloya enquiry validation for Phase 05A-02 fields
-- Preserves existing ProfileRelaunch and legacy Telloya behavior

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
    -- Required fields: fullName, email, businessName, country, trade, phone, product, details, privacyAccepted
    -- Optional fields: locations, websiteUrl, missedCallProblem, phoneSetup, contactPreference
    -- NEW Phase 05A-02 fields: planTier, guardInterested, guardLocationCount, customMonthlyMinutes, etc.
    
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
    
    -- String field type checks (legacy fields)
    FOREACH k IN ARRAY ARRAY['fullName','email','phone','businessName','country','trade','locations','websiteUrl','product','missedCallProblem','phoneSetup','contactPreference','details','source'] LOOP
      IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;
    
    -- Boolean field checks
    IF jsonb_typeof(p_data->'privacyAccepted') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
    
    -- Phase 05A-02 string fields (optional, but must be string type if present)
    FOREACH k IN ARRAY ARRAY['planTier','customLanguages','customRequirements','voicePreference','voiceAccent','primaryLanguage','speakingStyle','additionalLanguages'] LOOP
      IF p_data->k IS NOT NULL AND jsonb_typeof(p_data->k) IS DISTINCT FROM 'string' THEN 
        RETURN false; 
      END IF;
    END LOOP;
    
    -- Phase 05A-02 boolean fields (optional, but must be boolean type if present)
    FOREACH k IN ARRAY ARRAY['guardInterested','overageInterested'] LOOP
      IF p_data->k IS NOT NULL AND jsonb_typeof(p_data->k) IS DISTINCT FROM 'boolean' THEN 
        RETURN false; 
      END IF;
    END LOOP;
    
    -- Phase 05A-02 numeric fields (optional, but must be number type if present)
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
      OR length(p_data->>'locations')>50
      OR length(p_data->>'product')>64
      OR length(p_data->>'missedCallProblem')>5000
      OR length(p_data->>'phoneSetup')>5000
      OR length(p_data->>'contactPreference')>100
      OR length(btrim(p_data->>'details')) NOT BETWEEN 1 AND 5000 THEN 
      RETURN false; 
    END IF;
    
    -- Phase 05A-02 string length validations (if present)
    IF (p_data->>'planTier' IS NOT NULL AND length(p_data->>'planTier')>20)
      OR (p_data->>'customLanguages' IS NOT NULL AND length(p_data->>'customLanguages')>5000)
      OR (p_data->>'customRequirements' IS NOT NULL AND length(p_data->>'customRequirements')>5000)
      OR (p_data->>'voicePreference' IS NOT NULL AND length(p_data->>'voicePreference')>20)
      OR (p_data->>'voiceAccent' IS NOT NULL AND length(p_data->>'voiceAccent')>100)
      OR (p_data->>'primaryLanguage' IS NOT NULL AND length(p_data->>'primaryLanguage')>100)
      OR (p_data->>'speakingStyle' IS NOT NULL AND length(p_data->>'speakingStyle')>20)
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
    
    -- Legacy product validation (must be exactly telloya or complete)
    IF p_data->>'product' NOT IN ('telloya','complete') THEN
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
    
    -- Plan tier validation (optional, but if present must be valid)
    plan_tier := p_data->>'planTier';
    IF plan_tier IS NOT NULL AND plan_tier NOT IN ('starter','professional','premium','custom') THEN
      RETURN false;
    END IF;
    
    -- Voice preference validation (optional, but if present must be valid)
    value := p_data->>'voicePreference';
    IF value IS NOT NULL AND value<>'' AND value NOT IN ('female','male','no-preference') THEN
      RETURN false;
    END IF;
    
    -- Speaking style validation (optional, but if present must be valid)
    value := p_data->>'speakingStyle';
    IF value IS NOT NULL AND value<>'' AND value NOT IN ('friendly','professional','calm','no-preference') THEN
      RETURN false;
    END IF;
    
    -- Guard interested conditional validation
    guard_interested := COALESCE((p_data->>'guardInterested')::boolean, false);
    IF guard_interested THEN
      -- Guard location count is required when guardInterested is true
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
    -- Existing ProfileRelaunch validation - UNCHANGED
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

-- Security: Function permissions unchanged
-- Note: We do NOT revoke/regrant on admin_private.valid_enquiry_v1
-- Permissions are already correctly set in migration 20261102200000
```

## Regression Test Design

### Test Scope

1. **Legacy ProfileRelaunch Enquiries** (source: homepage, contact, phone)
2. **Legacy Telloya Enquiries** (source: telloya, without Phase 05A-02 fields)
3. **New Telloya Phase 05A-02 Enquiries** (source: telloya, with new fields)

### Test Cases

#### Category 1: ProfileRelaunch Unchanged Behavior

```sql
-- Test 1.1: Valid homepage enquiry (legacy)
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'homepage',
    'fullName', 'John Smith',
    'email', 'john@example.com',
    'phone', '+44 20 1234 5678',
    'businessName', 'Example Business Ltd',
    'country', 'United Kingdom',
    'service', 'relaunch',
    'subject', 'Negative Review',
    'details', 'Need help removing negative reviews',
    'websiteUrl', 'https://example.com',
    'businessProfileUrl', 'https://google.com/business/example',
    'reviewUrl', '',
    'informationAccurate', true,
    'privacyAccepted', true
  ),
  false
) AS should_be_true;

-- Test 1.2: Invalid homepage enquiry - new field rejected
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'homepage',
    'fullName', 'John Smith',
    'email', 'john@example.com',
    'phone', '+44 20 1234 5678',
    'businessName', 'Example Business Ltd',
    'country', 'United Kingdom',
    'service', 'relaunch',
    'subject', 'Negative Review',
    'details', 'Need help removing negative reviews',
    'websiteUrl', 'https://example.com',
    'businessProfileUrl', 'https://google.com/business/example',
    'reviewUrl', '',
    'informationAccurate', true,
    'privacyAccepted', true,
    'planTier', 'premium'  -- Should cause rejection
  ),
  false
) AS should_be_false;
```

#### Category 2: Legacy Telloya Behavior Preserved

```sql
-- Test 2.1: Valid legacy Telloya enquiry (no Phase 05A-02 fields)
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Jane Doe',
    'email', 'jane@example.co.uk',
    'phone', '+44 7700 900123',
    'businessName', 'Jane Plumbing Services',
    'country', 'United Kingdom',
    'trade', 'Plumbing',
    'locations', 'London, Manchester',
    'websiteUrl', 'https://janeplumbing.co.uk',
    'product', 'telloya',
    'missedCallProblem', 'Too busy on-site to answer',
    'phoneSetup', 'Single mobile number',
    'contactPreference', 'email',
    'details', 'Interested in Professional plan',
    'privacyAccepted', true
  ),
  false
) AS should_be_true;

-- Test 2.2: Legacy Telloya with invalid product
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Jane Doe',
    'email', 'jane@example.co.uk',
    'phone', '+44 7700 900123',
    'businessName', 'Jane Plumbing Services',
    'country', 'United Kingdom',
    'trade', 'Plumbing',
    'locations', 'London',
    'product', 'invalid',  -- Should reject
    'details', 'Test',
    'privacyAccepted', true
  ),
  false
) AS should_be_false;
```

#### Category 3: New Phase 05A-02 Fields

```sql
-- Test 3.1: Valid Starter plan with Guard
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Bob Builder',
    'email', 'bob@builder.co.uk',
    'phone', '+44 7700 900456',
    'businessName', 'Bob Builder Ltd',
    'country', 'United Kingdom',
    'trade', 'Construction',
    'locations', 'Birmingham',
    'product', 'telloya',
    'details', 'Plan: Starter, Guard: Yes (3 locations)',
    'privacyAccepted', true,
    'planTier', 'starter',
    'guardInterested', true,
    'guardLocationCount', 3,
    'overageInterested', false
  ),
  false
) AS should_be_true;

-- Test 3.2: Invalid - Guard interested but no location count
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Bob Builder',
    'email', 'bob@builder.co.uk',
    'phone', '+44 7700 900456',
    'businessName', 'Bob Builder Ltd',
    'country', 'United Kingdom',
    'trade', 'Construction',
    'product', 'telloya',
    'details', 'Test',
    'privacyAccepted', true,
    'planTier', 'starter',
    'guardInterested', true,
    -- Missing guardLocationCount
    'overageInterested', false
  ),
  false
) AS should_be_false;

-- Test 3.3: Invalid - Guard location count out of range
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Bob Builder',
    'email', 'bob@builder.co.uk',
    'phone', '+44 7700 900456',
    'businessName', 'Bob Builder Ltd',
    'country', 'United Kingdom',
    'trade', 'Construction',
    'product', 'telloya',
    'details', 'Test',
    'privacyAccepted', true,
    'planTier', 'starter',
    'guardInterested', true,
    'guardLocationCount', 1000,  -- Exceeds max 999
    'overageInterested', false
  ),
  false
) AS should_be_false;

-- Test 3.4: Valid Custom plan with all required fields
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Custom User',
    'email', 'custom@example.com',
    'phone', '+44 7700 900789',
    'businessName', 'Custom Business',
    'country', 'United Kingdom',
    'trade', 'Multi-location retail',
    'product', 'telloya',
    'details', 'Plan: Custom',
    'privacyAccepted', true,
    'planTier', 'custom',
    'guardInterested', false,
    'overageInterested', false,
    'customMonthlyMinutes', 10000,
    'customPhoneNumbers', 5,
    'customLocations', 50,
    'customLanguages', 'English, Polish, Romanian',
    'customRequirements', 'Need integration with existing CRM'
  ),
  false
) AS should_be_true;

-- Test 3.5: Valid Custom plan with optional monthly calls
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Custom User',
    'email', 'custom@example.com',
    'phone', '+44 7700 900789',
    'businessName', 'Custom Business',
    'country', 'United Kingdom',
    'trade', 'Multi-location retail',
    'product', 'telloya',
    'details', 'Plan: Custom',
    'privacyAccepted', true,
    'planTier', 'custom',
    'guardInterested', false,
    'overageInterested', false,
    'customMonthlyMinutes', 10000,
    'customMonthlyCalls', 2000,  -- Optional field
    'customPhoneNumbers', 5,
    'customLocations', 50
  ),
  false
) AS should_be_true;

-- Test 3.6: Invalid Custom plan - missing required customMonthlyMinutes
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Custom User',
    'email', 'custom@example.com',
    'phone', '+44 7700 900789',
    'businessName', 'Custom Business',
    'country', 'United Kingdom',
    'trade', 'Multi-location retail',
    'product', 'telloya',
    'details', 'Plan: Custom',
    'privacyAccepted', true,
    'planTier', 'custom',
    'guardInterested', false,
    'overageInterested', false,
    -- Missing customMonthlyMinutes
    'customPhoneNumbers', 5,
    'customLocations', 50
  ),
  false
) AS should_be_false;

-- Test 3.7: Invalid Custom plan - customMonthlyMinutes out of range
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Custom User',
    'email', 'custom@example.com',
    'phone', '+44 7700 900789',
    'businessName', 'Custom Business',
    'country', 'United Kingdom',
    'trade', 'Multi-location retail',
    'product', 'telloya',
    'details', 'Plan: Custom',
    'privacyAccepted', true,
    'planTier', 'custom',
    'customMonthlyMinutes', 2000000,  -- Exceeds max 1,000,000
    'customPhoneNumbers', 5,
    'customLocations', 50
  ),
  false
) AS should_be_false;

-- Test 3.8: Valid Premium plan with overage
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Premium User',
    'email', 'premium@example.com',
    'phone', '+44 7700 900321',
    'businessName', 'Premium Business',
    'country', 'United Kingdom',
    'trade', 'Consultancy',
    'product', 'telloya',
    'details', 'Plan: Premium, Overage: Yes (£500 cap)',
    'privacyAccepted', true,
    'planTier', 'premium',
    'guardInterested', false,
    'overageInterested', true,
    'overageMonthlyCapGbp', 500
  ),
  false
) AS should_be_true;

-- Test 3.9: Invalid - Overage interested but no cap
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Premium User',
    'email', 'premium@example.com',
    'phone', '+44 7700 900321',
    'businessName', 'Premium Business',
    'country', 'United Kingdom',
    'trade', 'Consultancy',
    'product', 'telloya',
    'details', 'Test',
    'privacyAccepted', true,
    'planTier', 'premium',
    'overageInterested', true
    -- Missing overageMonthlyCapGbp
  ),
  false
) AS should_be_false;

-- Test 3.10: Valid with voice preferences
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Voice User',
    'email', 'voice@example.com',
    'phone', '+44 7700 900654',
    'businessName', 'Voice Business',
    'country', 'United Kingdom',
    'trade', 'Hospitality',
    'product', 'telloya',
    'details', 'Plan: Professional with voice preferences',
    'privacyAccepted', true,
    'planTier', 'professional',
    'guardInterested', false,
    'overageInterested', false,
    'voicePreference', 'female',
    'voiceAccent', 'British Received Pronunciation',
    'primaryLanguage', 'English',
    'speakingStyle', 'friendly',
    'additionalLanguages', 'Spanish, French'
  ),
  false
) AS should_be_true;

-- Test 3.11: Invalid - Invalid voice preference
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Voice User',
    'email', 'voice@example.com',
    'phone', '+44 7700 900654',
    'businessName', 'Voice Business',
    'country', 'United Kingdom',
    'trade', 'Hospitality',
    'product', 'telloya',
    'details', 'Test',
    'privacyAccepted', true,
    'planTier', 'professional',
    'voicePreference', 'robot'  -- Invalid value
  ),
  false
) AS should_be_false;

-- Test 3.12: Invalid - Invalid speaking style
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Voice User',
    'email', 'voice@example.com',
    'phone', '+44 7700 900654',
    'businessName', 'Voice Business',
    'country', 'United Kingdom',
    'trade', 'Hospitality',
    'product', 'telloya',
    'details', 'Test',
    'privacyAccepted', true,
    'planTier', 'professional',
    'speakingStyle', 'aggressive'  -- Invalid value
  ),
  false
) AS should_be_false;

-- Test 3.13: Invalid - Invalid plan tier
SELECT admin_private.valid_enquiry_v1(
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Test User',
    'email', 'test@example.com',
    'phone', '+44 7700 900987',
    'businessName', 'Test Business',
    'country', 'United Kingdom',
    'trade', 'Testing',
    'product', 'telloya',
    'details', 'Test',
    'privacyAccepted', true,
    'planTier', 'enterprise'  -- Invalid value
  ),
  false
) AS should_be_false;
```

### Expected Test Results

All tests should return their expected boolean value (`should_be_true` = `t`, `should_be_false` = `f`).

### Test Execution Strategy

1. **Pre-migration baseline**: Run Category 1 and 2 tests against current production function - all should pass
2. **Post-migration validation**: Run all three categories against new function
3. **Rollback safety**: Document rollback procedure (reapply previous migration version)

## Validation Checklist

- [ ] All new fields are type-checked (string, boolean, number)
- [ ] All new fields have appropriate length/range limits
- [ ] Conditional validation: Guard location count required when `guardInterested=true`
- [ ] Conditional validation: Custom fields required when `planTier="custom"`
- [ ] Conditional validation: Overage cap required when `overageInterested=true`
- [ ] Optional field handling: `customMonthlyCalls` is optional even in Custom plan
- [ ] Legacy Telloya behavior preserved (without Phase 05A-02 fields)
- [ ] ProfileRelaunch behavior completely unchanged
- [ ] Enum validation for `planTier`, `voicePreference`, `speakingStyle`
- [ ] Integer validation for whole number fields
- [ ] Decimal validation for currency fields
- [ ] No changes to function signature or permissions
- [ ] IMMUTABLE function property preserved
- [ ] All test cases documented with expected results

## Risk Assessment

**Low Risk** - This is an additive change that:
1. Preserves all existing validation logic for ProfileRelaunch (unchanged code path)
2. Preserves legacy Telloya validation (new fields are optional, old behavior intact)
3. Only validates new fields when explicitly present in the payload
4. Uses same validation patterns as existing code
5. No changes to function permissions or security model

## Deployment Requirements

1. Apply migration to staging first
2. Run full regression test suite (13 test cases minimum)
3. Verify with real Telloya Phase 05A-02 enquiry payloads
4. Monitor for any failed enquiries in staging
5. After staging validation, apply to production
6. Keep rollback migration ready for 24 hours

## Rollback Procedure

If issues are detected after deployment:

```sql
-- Rollback: Restore previous version
-- Copy the function body from migration 20261102200000_telloya_enquiry_infrastructure_v1.sql
-- Apply as new migration: 20261103XXXXXX_rollback_validation_v2.sql
```

## Approval Required

- [ ] Database Admin approval
- [ ] Security review (enum validation, bounds checking)
- [ ] Staging test results verified
- [ ] Rollback procedure documented and tested

---

**Document Version:** 1.0  
**Created:** 2026-11-03  
**Status:** AWAITING APPROVAL
