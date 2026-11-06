# 03A-03-03-02-05 Record forwarding instructions

`20261106003939_admin_commercial_record_forwarding_instructions_v1.sql` was applied once to hosted DEV and is the verified ledger head. The verified DEV ledger contains 112 entries and ends at `20261106003939`. Begin setup `20261105130000`, confirm preferences `20261105144256`, confirm AI configuration `20261105172055`, the tier catalogue `20261105180000`, the Guard offer `20261105190000`, and number allocation `20261105200000` are applied earlier. Do not replay them. Do not apply `20261106003939` to Production. `pendingMigrations()` contains `20261106120000_admin_commercial_verify_agent_test_call_v1.sql` and then `20261106140000_telloya_standard_location_cap_v1.sql`. Do not apply either file to DEV or Production.

`public.admin_commercial_record_forwarding_instructions_v1(text, uuid, uuid, integer, jsonb)` records one location-specific instruction version. It runs only after Begin Setup, confirmed preferences for every selected location, a current AI configuration, and the current authoritative telephone allocation for that location. It is service-role only. The Admin route also requires `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED` and `ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED`. Both default off. The database does not read either flag.

The provider environment is the server lane from `VERCEL_ENV`. A browser-supplied environment that differs is rejected before the database call. The database still checks that the submitted environment matches the recorded allocation.

Instructions are append-only. `DRAFT` stays inside Admin. `SHARED` is the version shown in the verified Customer Portal for that business and location. A later change appends a new version. The portal shows the current shared version. A draft cannot replace a shared version.

Sharing sets `forwarding_instructed_at` and moves that provision from `FORWARDING_REQUIRED` to `TEST_REQUIRED` on the first share. A later shared version keeps the original timestamp and the authoritative allocation reference. The timestamp means the instructions were shared. It does not mean the customer or the telephone provider has enabled forwarding. The command does not set a test-call reference, a test outcome, `agent_test_passed_at`, `customer_confirmed_at`, or `live_at`, and it does not set `LIVE`.

The instruction uses a structured forwarding mode: unanswered, busy, unreachable, or all three. A known telephone provider can be named. The text does not include carrier dialling codes. Every version must include: “Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection.” The assigned number is copied from the allocation row. The text must name that number and must not include provider agent references or internal evidence.

A corrected allocation leaves an older draft in review. Sharing is refused until the instruction names the current allocation. `OPERATOR_ATTESTED` means a staff member prepared the notes. It is not proof that forwarding is enabled.

The Customer Portal shows the assigned number, the forwarding method, and the approved notes only after the instructions are shared, and only for the signed-in customer’s business and location. It does not show provider agent references, staff attestation, or an action that enables forwarding.
