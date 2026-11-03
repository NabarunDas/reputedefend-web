-- Executable regression tests for Telloya Phase 05A-02 validation extension
-- Run with: psql -f this_file.sql
-- Creates isolated test schema, runs tests, reports results

BEGIN;

-- Create test schema
CREATE SCHEMA IF NOT EXISTS test_validation;
SET search_path = test_validation, public;

-- Create minimal admin_private schema for testing
CREATE SCHEMA IF NOT EXISTS admin_private;

-- Load the validation function (from migration file)
\i 20261103200518_telloya_enquiry_phase_05a_02_validation.sql

-- Test results tracking
CREATE TABLE test_results (
  test_name text PRIMARY KEY,
  expected boolean,
  actual boolean,
  passed boolean GENERATED ALWAYS AS (expected = actual) STORED
);

-- Helper function to run a test
CREATE OR REPLACE FUNCTION run_test(
  p_name text,
  p_data jsonb,
  p_manual boolean,
  p_expected boolean
) RETURNS void AS $$
BEGIN
  INSERT INTO test_results (test_name, expected, actual)
  VALUES (
    p_name,
    p_expected,
    admin_private.valid_enquiry_v1(p_data, p_manual)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CATEGORY 1: ProfileRelaunch Unchanged Behavior
-- ============================================================================

SELECT run_test(
  'ProfileRelaunch: Valid homepage enquiry',
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
  false,
  true
);

SELECT run_test(
  'ProfileRelaunch: Rejects new Telloya field',
  jsonb_build_object(
    'source', 'homepage',
    'fullName', 'John Smith',
    'email', 'john@example.com',
    'phone', '+44 20 1234 5678',
    'businessName', 'Example Business Ltd',
    'country', 'United Kingdom',
    'service', 'relaunch',
    'subject', 'Negative Review',
    'details', 'Need help',
    'websiteUrl', 'https://example.com',
    'businessProfileUrl', '',
    'reviewUrl', '',
    'informationAccurate', true,
    'privacyAccepted', true,
    'planTier', 'basic'
  ),
  false,
  false
);

-- ============================================================================
-- CATEGORY 2: Legacy Telloya Preserved
-- ============================================================================

SELECT run_test(
  'Legacy Telloya: Product-only enquiry',
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
    'missedCallProblem', 'Too busy on-site',
    'phoneSetup', 'Single mobile',
    'contactPreference', 'email',
    'details', 'Interested in service',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Legacy Telloya: Invalid product',
  jsonb_build_object(
    'source', 'telloya',
    'fullName', 'Test User',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test Business',
    'country', 'UK',
    'trade', 'Testing',
    'product', 'invalid',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  false
);

-- ============================================================================
-- CATEGORY 3: Phase 05A-02 Basic Tier
-- ============================================================================

SELECT run_test(
  'Basic tier: Valid without add-ons',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'basic',
    'guardInterested', false,
    'overageInterested', false,
    'fullName', 'Bob Builder',
    'email', 'bob@builder.co.uk',
    'phone', '+44 7700 900456',
    'businessName', 'Bob Builder Ltd',
    'country', 'United Kingdom',
    'trade', 'Construction',
    'details', 'Basic plan enquiry',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Basic tier: Valid with Guard',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'basic',
    'guardInterested', true,
    'guardLocationCount', 3,
    'overageInterested', false,
    'fullName', 'Bob Builder',
    'email', 'bob@builder.co.uk',
    'phone', '+44 7700 900456',
    'businessName', 'Bob Builder Ltd',
    'country', 'UK',
    'trade', 'Construction',
    'details', 'Basic with Guard',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Basic tier: Guard interested but no count',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'basic',
    'guardInterested', true,
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  false
);

-- ============================================================================
-- CATEGORY 4: Phase 05A-02 Growth Tier
-- ============================================================================

SELECT run_test(
  'Growth tier: Valid with overage',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'growth',
    'guardInterested', false,
    'overageInterested', true,
    'overageMonthlyCapGbp', 100,
    'fullName', 'Growth User',
    'email', 'growth@example.com',
    'phone', '+44 7700 900111',
    'businessName', 'Growth Business',
    'country', 'UK',
    'trade', 'Retail',
    'details', 'Growth plan',
    'privacyAccepted', true
  ),
  false,
  true
);

-- ============================================================================
-- CATEGORY 5: Phase 05A-02 Pro Tier
-- ============================================================================

SELECT run_test(
  'Pro tier: Valid with voice preferences',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'pro',
    'guardInterested', false,
    'overageInterested', false,
    'voicePreference', 'female',
    'voiceAccent', 'British',
    'primaryLanguage', 'English',
    'speakingStyle', 'professional',
    'additionalLanguages', 'Spanish',
    'fullName', 'Pro User',
    'email', 'pro@example.com',
    'phone', '+44 7700 900222',
    'businessName', 'Pro Business',
    'country', 'UK',
    'trade', 'Consultancy',
    'details', 'Pro plan',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Pro tier: Invalid voice preference',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'pro',
    'voicePreference', 'robot',
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  false
);

-- ============================================================================
-- CATEGORY 6: Phase 05A-02 Custom Tier
-- ============================================================================

SELECT run_test(
  'Custom tier: Valid with all requirements',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'custom',
    'guardInterested', true,
    'guardLocationCount', 50,
    'customMonthlyMinutes', 50000,
    'customMonthlyCalls', 5000,
    'customPhoneNumbers', 25,
    'customLocations', 500,
    'customLanguages', 'English, Polish',
    'customRequirements', 'CRM integration',
    'overageInterested', true,
    'overageMonthlyCapGbp', 500,
    'fullName', 'Custom User',
    'email', 'custom@example.com',
    'phone', '+44 7700 900333',
    'businessName', 'Custom Business',
    'country', 'UK',
    'trade', 'Enterprise',
    'details', 'Custom plan',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Custom tier: Valid without optional monthly calls',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'custom',
    'guardInterested', false,
    'customMonthlyMinutes', 10000,
    'customPhoneNumbers', 5,
    'customLocations', 10,
    'overageInterested', false,
    'fullName', 'Custom User',
    'email', 'custom@example.com',
    'phone', '+44 7700 900444',
    'businessName', 'Custom Business',
    'country', 'UK',
    'trade', 'Business',
    'details', 'Custom',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Custom tier: Missing required minutes',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'custom',
    'customPhoneNumbers', 5,
    'customLocations', 10,
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  false
);

-- ============================================================================
-- CATEGORY 7: Invalid Plan Tier
-- ============================================================================

SELECT run_test(
  'Invalid plan tier',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'enterprise',
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  false
);

-- ============================================================================
-- CATEGORY 8: Backward Compatibility
-- ============================================================================

SELECT run_test(
  'Backward compat: Both product and planTier',
  jsonb_build_object(
    'source', 'telloya',
    'product', 'telloya',
    'planTier', 'basic',
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Backward compat: Empty planTier with product',
  jsonb_build_object(
    'source', 'telloya',
    'product', 'telloya',
    'planTier', '',
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  true
);

-- ============================================================================
-- CATEGORY 9: Numeric Bounds Validation
-- ============================================================================

SELECT run_test(
  'Guard count: Below minimum',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'basic',
    'guardInterested', true,
    'guardLocationCount', 0,
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  false
);

SELECT run_test(
  'Guard count: Above maximum',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'basic',
    'guardInterested', true,
    'guardLocationCount', 1000,
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  false
);

SELECT run_test(
  'Overage cap: At minimum',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'basic',
    'overageInterested', true,
    'overageMonthlyCapGbp', 1,
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  true
);

SELECT run_test(
  'Overage cap: At maximum',
  jsonb_build_object(
    'source', 'telloya',
    'planTier', 'basic',
    'overageInterested', true,
    'overageMonthlyCapGbp', 100000,
    'fullName', 'Test',
    'email', 'test@example.com',
    'phone', '+44 7700 900000',
    'businessName', 'Test',
    'country', 'UK',
    'trade', 'Test',
    'details', 'Test',
    'privacyAccepted', true
  ),
  false,
  true
);

-- ============================================================================
-- Results Summary
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'Test Results Summary'
\echo '========================================='

SELECT 
  COUNT(*) FILTER (WHERE passed) as passed_tests,
  COUNT(*) FILTER (WHERE NOT passed) as failed_tests,
  COUNT(*) as total_tests
FROM test_results;

\echo ''
\echo 'Failed Tests (if any):'
SELECT test_name, expected, actual
FROM test_results
WHERE NOT passed
ORDER BY test_name;

\echo ''
\echo 'All Tests:'
SELECT 
  test_name,
  CASE WHEN passed THEN '✓ PASS' ELSE '✗ FAIL' END as result
FROM test_results
ORDER BY test_name;

-- Rollback to clean up test schema
ROLLBACK;

\echo ''
\echo 'Test run complete. All changes rolled back.'
