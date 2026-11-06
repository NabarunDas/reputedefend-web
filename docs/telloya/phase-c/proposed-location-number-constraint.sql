-- Earlier proposal for the Telloya location and number policy.
-- This file is not a Supabase migration.
-- Do not copy it into supabase/migrations.
-- Do not apply it to Supabase DEV or Production.
-- This file must not be applied.
--
-- The location-cap check now lives in
-- supabase/migrations/20261106140000_telloya_standard_location_cap_v1.sql.
-- That migration is not applied to DEV. It raises
-- 'standard Telloya plan includes exactly one location' when BASIC, GROWTH,
-- or PRO is approved with a TELLOYA quantity_limit other than 1.
-- CUSTOM is not limited to one location.
--
-- Do not delete commercial_provider_number_owners when an operator records
-- a replacement number. The previous E.164 stays reserved.
-- number-correction-keeps-previous-reservation is the deliberate state.
-- Releasing a reserved number is described in
-- docs/telloya/phase-c/number-lifecycle.md and is not implemented here.
-- There is no exemption for a TELLOYA-TEST- plan name.

BEGIN;

DO $$
BEGIN
  RAISE EXCEPTION 'proposed-location-number-constraint.sql must not be applied';
END $$;

ROLLBACK;
