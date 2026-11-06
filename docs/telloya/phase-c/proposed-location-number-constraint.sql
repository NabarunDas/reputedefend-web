-- Proposed constraint for the approved Telloya location and number policy.
-- This file is a proposal. It is not a Supabase migration.
-- Do not copy it into supabase/migrations.
-- Do not apply it to Supabase DEV or Production.
-- Do not mark it appliedToDev. This file must not be applied.
--
-- Gap standard-tier-cap-not-checked-at-approval:
--   prevent_plan_overlap_v1, last replaced in
--   20261105190000_telloya_guard_addon_v1.sql, allows BASIC, GROWTH, and PRO
--   to be approved with any TELLOYA quantity_limit. Offer and begin-setup
--   then honour that stored cap. The approved rule is exactly one location.
--
-- Gap number-correction-keeps-previous-reservation:
--   admin_commercial_record_number_allocation_v1, in
--   20261105200000_admin_commercial_record_number_allocation_v1.sql, inserts a
--   new commercial_provider_number_owners row on correction and leaves the
--   previous E.164 reserved. The comment there says the previous number
--   remains reserved. The approved rule is exactly one receptionist number
--   on a standard subscription, and one number per entitled location on a
--   Custom quotation.
--
-- Applying this proposal would also reject the rehearsal row
-- TELLOYA-TEST-GROWTH-CAP-2 in
-- apps/admin/lib/commercial/telloya-catalogue.fixture.ts. The later change
-- that adds the real migration has to stop approving that row in the same
-- change. Do not exempt TELLOYA-TEST- refs inside the check.
--
-- Merge the fragments below into the current functions. Do not replace
-- prevent_plan_overlap_v1 with a shorter function: the overlap lock has to
-- stay.

BEGIN;

DO $$
BEGIN
  RAISE EXCEPTION 'proposed-location-number-constraint.sql must not be applied';
END $$;

-- Fragment for admin_private.prevent_plan_overlap_v1, in the APPROVED
-- branch, after the Telloya component count check and before the overlap
-- lock:
--
-- SELECT component.quantity_limit INTO telloya_limit
-- FROM public.plan_components component
-- WHERE component.plan_version_id = NEW.id
--   AND component.component_code = 'TELLOYA';
-- IF NEW.product_code = 'TELLOYA'
--   AND NEW.tier_code IN ('BASIC', 'GROWTH', 'PRO')
--   AND telloya_limit IS DISTINCT FROM 1
-- THEN
--   RAISE EXCEPTION 'standard Telloya plan includes exactly one location';
-- END IF;

-- Fragment for admin_commercial_record_number_allocation_v1, after the new
-- allocation row is inserted and before the command returns. previous_e164
-- is the E.164 of the allocation this correction replaces.
--
-- IF previous_e164 IS NOT NULL AND previous_e164 IS DISTINCT FROM chosen_number THEN
--   DELETE FROM admin_private.commercial_provider_number_owners owner
--   WHERE owner.provider = 'telloya_voice'
--     AND owner.e164 = previous_e164
--     AND owner.subscription_id = sub.id
--     AND owner.location_id = chosen_location;
-- END IF;
-- IF (
--   SELECT count(*)
--   FROM admin_private.commercial_provider_number_owners owner
--   WHERE owner.subscription_id = sub.id
--     AND owner.location_id = chosen_location
-- ) > 1 THEN
--   RAISE EXCEPTION 'one receptionist number per entitled location';
-- END IF;

ROLLBACK;
