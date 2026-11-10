-- Executable assertions for the Phase 05A-02 enquiry validator.
-- Not a migration. A failing assertion RAISE EXCEPTION and aborts the script.
-- The runner applies schema migrations first, then this file, on a disposable database.

CREATE SCHEMA IF NOT EXISTS telloya_phase_05a_02_test;

CREATE OR REPLACE FUNCTION telloya_phase_05a_02_test.assert_valid(
  p_name text,
  p_data jsonb,
  p_manual boolean,
  p_expected boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual boolean;
BEGIN
  actual := admin_private.valid_enquiry_v1(p_data, p_manual);
  IF actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'ASSERTION FAILED [%]: expected % but valid_enquiry_v1 returned %', p_name, p_expected, actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION telloya_phase_05a_02_test.telloya(p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'source','telloya',
    'fullName','Jane Doe',
    'email','jane@example.co.uk',
    'phone','+44 7700 900123',
    'businessName','Jane Plumbing',
    'country','United Kingdom',
    'trade','Plumbing',
    'locations','',
    'websiteUrl','',
    'product','telloya',
    'missedCallProblem','',
    'phoneSetup','',
    'contactPreference','',
    'details','Interested in Telloya.',
    'privacyAccepted', true
  ) || p_extra;
$$;

CREATE OR REPLACE FUNCTION telloya_phase_05a_02_test.relaunch(p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'source','homepage',
    'fullName','John Smith',
    'email','john@example.com',
    'phone','+44 20 1234 5678',
    'businessName','Example Business Ltd',
    'country','United Kingdom',
    'service','relaunch',
    'subject','general-question',
    'details','Need help with my business profile.',
    'websiteUrl','',
    'businessProfileUrl','',
    'reviewUrl','',
    'informationAccurate', false,
    'privacyAccepted', false
  ) || p_extra;
$$;

SELECT telloya_phase_05a_02_test.assert_valid(
  'ProfileRelaunch homepage still valid',
  telloya_phase_05a_02_test.relaunch(),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'ProfileRelaunch rejects a Telloya plan field',
  telloya_phase_05a_02_test.relaunch('{"planTier":"basic"}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'ProfileRelaunch manual phone enquiry still valid',
  telloya_phase_05a_02_test.relaunch('{"source":"phone","email":""}'::jsonb),
  true,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'legacy Telloya product-only payload',
  telloya_phase_05a_02_test.telloya('{"guardInterested":false,"overageInterested":false}'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'legacy Telloya with blank planTier',
  telloya_phase_05a_02_test.telloya('{"planTier":"","guardInterested":false,"overageInterested":false}'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'legacy complete product',
  telloya_phase_05a_02_test.telloya('{"product":"complete"}'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'blank product is still rejected',
  telloya_phase_05a_02_test.telloya('{"product":"","planTier":"basic"}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'missing product is still rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic"}'::jsonb) - 'product',
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'basic tier',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic","guardInterested":false,"overageInterested":false}'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'growth tier with overage cap',
  telloya_phase_05a_02_test.telloya('{"planTier":"growth","guardInterested":false,"overageInterested":true,"overageMonthlyCapGbp":100}'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'pro tier with voice preferences',
  telloya_phase_05a_02_test.telloya('{
    "planTier":"pro",
    "guardInterested":false,
    "overageInterested":false,
    "voicePreference":"female",
    "voiceAccent":"British",
    "primaryLanguage":"English",
    "speakingStyle":"professional",
    "additionalLanguages":"Spanish, French"
  }'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'custom tier with optional calls omitted',
  telloya_phase_05a_02_test.telloya('{
    "planTier":"custom",
    "guardInterested":false,
    "overageInterested":false,
    "customMonthlyMinutes":10000,
    "customPhoneNumbers":5,
    "customLocations":10
  }'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'custom tier with calls, Guard and overage',
  telloya_phase_05a_02_test.telloya('{
    "planTier":"custom",
    "guardInterested":true,
    "guardLocationCount":50,
    "customMonthlyMinutes":50000,
    "customMonthlyCalls":5000,
    "customPhoneNumbers":25,
    "customLocations":500,
    "customLanguages":"English, Polish",
    "customRequirements":"CRM integration",
    "overageInterested":true,
    "overageMonthlyCapGbp":500.5
  }'::jsonb),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'retired starter tier is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"starter"}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'professional and premium tiers are rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"professional"}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'unknown plan tier is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"enterprise"}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'Guard count is rejected when supplied and invalid even if Guard is off',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic","guardInterested":false,"guardLocationCount":-1}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'fractional Guard count is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic","guardInterested":true,"guardLocationCount":1.5}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'Guard interest without a count is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic","guardInterested":true}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'Guard count above 999 is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic","guardInterested":true,"guardLocationCount":1000}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'custom minutes supplied on a fixed plan are still bounded',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic","customMonthlyMinutes":999999999}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'custom tier missing minutes is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"custom","customPhoneNumbers":1,"customLocations":1}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'overage cap supplied while interest is off is still bounded',
  telloya_phase_05a_02_test.telloya('{"planTier":"pro","overageInterested":false,"overageMonthlyCapGbp":-1}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'overage interest without a cap is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"pro","overageInterested":true}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'numeric string is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"basic","guardInterested":true,"guardLocationCount":"3"}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'custom languages over 500 characters are rejected',
  telloya_phase_05a_02_test.telloya(jsonb_build_object('planTier','basic','customLanguages', repeat('a', 501))),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'custom requirements over 2000 characters are rejected',
  telloya_phase_05a_02_test.telloya(jsonb_build_object('planTier','custom','customMonthlyMinutes',1000,'customPhoneNumbers',1,'customLocations',1,'customRequirements', repeat('b', 2001))),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'additional languages over 500 characters are rejected',
  telloya_phase_05a_02_test.telloya(jsonb_build_object('planTier','pro','additionalLanguages', repeat('c', 501))),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'details over 5000 characters are rejected',
  telloya_phase_05a_02_test.telloya(jsonb_build_object('details', repeat('d', 5001))),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'payloads over 32768 bytes are rejected',
  jsonb_build_object('source','telloya','details', repeat('e', 40000)),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'unknown top-level key is rejected',
  telloya_phase_05a_02_test.telloya('{"billingAuthorised":true}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'receptionist questions within 2000 characters are accepted',
  telloya_phase_05a_02_test.telloya(jsonb_build_object('receptionistQuestions', repeat('q', 2000))),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'receptionist questions over 2000 characters are rejected',
  telloya_phase_05a_02_test.telloya(jsonb_build_object('receptionistQuestions', repeat('q', 2001))),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'a non-string receptionist question value is rejected',
  telloya_phase_05a_02_test.telloya('{"receptionistQuestions":{"password":"secret"}}'::jsonb),
  false,
  false
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'a Telloya enquiry without receptionist questions remains valid',
  telloya_phase_05a_02_test.telloya(),
  false,
  true
);

SELECT telloya_phase_05a_02_test.assert_valid(
  'invalid voice preference is rejected',
  telloya_phase_05a_02_test.telloya('{"planTier":"pro","voicePreference":"robot"}'::jsonb),
  false,
  false
);

DO $$
DECLARE
  volatility "char";
  config text[];
  args smallint;
BEGIN
  SELECT p.provolatile, p.proconfig, p.pronargs
    INTO volatility, config, args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'admin_private' AND p.proname = 'valid_enquiry_v1';

  IF volatility IS DISTINCT FROM 'i' THEN
    RAISE EXCEPTION 'ASSERTION FAILED [immutable]: volatility is %', volatility;
  END IF;
  IF args IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED [signature]: argument count is %', args;
  END IF;
  IF config IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(config) AS item WHERE item LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'ASSERTION FAILED [search_path]: proconfig is %', config;
  END IF;

  IF has_function_privilege('anon', 'admin_private.valid_enquiry_v1(jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'admin_private.valid_enquiry_v1(jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('service_role', 'admin_private.valid_enquiry_v1(jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED [privileges]: valid_enquiry_v1 execute grant was widened';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.create_general_enquiry_v1(uuid,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED [privileges]: service_role lost create_general_enquiry_v1';
  END IF;

  IF has_function_privilege('anon', 'public.create_general_enquiry_v1(uuid,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_general_enquiry_v1(uuid,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED [privileges]: browser roles can execute create_general_enquiry_v1';
  END IF;
END;
$$;

DO $$
DECLARE
  submission uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  relaunch_key uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  legacy_key uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  modern jsonb := telloya_phase_05a_02_test.telloya('{
    "planTier":"growth",
    "guardInterested":true,
    "guardLocationCount":2,
    "overageInterested":true,
    "overageMonthlyCapGbp":75,
    "voicePreference":"female",
    "details":"Plan tier: growth"
  }'::jsonb);
  legacy jsonb := telloya_phase_05a_02_test.telloya('{"product":"telloya","details":"Historical Telloya enquiry."}'::jsonb);
  relaunch jsonb := telloya_phase_05a_02_test.relaunch('{"source":"contact"}'::jsonb);
  created jsonb;
  repeated jsonb;
  changed jsonb;
  legacy_result jsonb;
  relaunch_result jsonb;
  stored jsonb;
  ref text;
BEGIN
  created := public.create_general_enquiry_v1(submission, modern, false);
  IF created->>'status' IS DISTINCT FROM 'created' THEN
    RAISE EXCEPTION 'ASSERTION FAILED [persist]: expected created, got %', created;
  END IF;
  ref := created->>'enquiryRef';
  IF ref !~ '^TY-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'ASSERTION FAILED [ty-ref]: got %', ref;
  END IF;

  repeated := public.create_general_enquiry_v1(submission, modern, false);
  IF repeated->>'status' IS DISTINCT FROM 'existing' OR repeated->>'enquiryRef' IS DISTINCT FROM ref THEN
    RAISE EXCEPTION 'ASSERTION FAILED [idempotency]: got %', repeated;
  END IF;

  changed := public.create_general_enquiry_v1(submission, modern || jsonb_build_object('trade','Changed'), false);
  IF changed->>'status' IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'ASSERTION FAILED [idempotency conflict]: got %', changed;
  END IF;

  SELECT payload INTO stored FROM public.enquiries WHERE submission_key = submission;
  IF stored->>'planTier' IS DISTINCT FROM 'growth'
     OR (stored->>'guardLocationCount')::int IS DISTINCT FROM 2
     OR stored->>'overageMonthlyCapGbp' IS DISTINCT FROM '75' THEN
    RAISE EXCEPTION 'ASSERTION FAILED [stored json]: %', stored;
  END IF;
  IF (SELECT count(*) FROM public.enquiries WHERE submission_key = submission) <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED [single row]';
  END IF;

  legacy_result := public.create_general_enquiry_v1(legacy_key, legacy, false);
  IF legacy_result->>'status' IS DISTINCT FROM 'created'
     OR legacy_result->>'enquiryRef' !~ '^TY-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'ASSERTION FAILED [legacy persist]: %', legacy_result;
  END IF;

  relaunch_result := public.create_general_enquiry_v1(relaunch_key, relaunch, false);
  IF relaunch_result->>'status' IS DISTINCT FROM 'created' OR relaunch_result->>'enquiryRef' IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED [profilerelaunch persist]: %', relaunch_result;
  END IF;
  IF (SELECT public_ref FROM public.enquiries WHERE submission_key = relaunch_key) IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED [profilerelaunch ref]: ProfileRelaunch received a TY reference';
  END IF;
END;
$$;
