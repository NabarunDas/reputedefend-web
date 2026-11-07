# Telloya Phase C commercial readiness

Status: the seven commercial migrations below were applied once to Supabase DEV project `profilerelaunch-dev`. This repository records that ledger. It does not apply SQL, seed catalogue rows, approve agreements, or change Production. The catalogue proposal for owner review is `docs/telloya/phase-c/catalogue-proposal.md`. The `TELLOYA-TEST-` fixture in this rehearsal is not that proposal and is not customer terms.

Verified DEV head: `20261106200000_admin_commercial_initiate_agent_test_call_v1`. The verified ledger has 115 entries. The previous ledger had 114 entries and ended at `20261106140000_telloya_standard_location_cap_v1`. The ledger before that had 112 entries and ended at `20261106003939_admin_commercial_record_forwarding_instructions_v1`. The ledger before that had 105 entries and ended at `20261105120000_telloya_voice_persistence_v1`. The repository has 118 migration files. Three foundation files are present in the repository and in the live schema, and absent from the live ledger: `20260915120000_core_data_foundation_v1`, `20260915193000_case_intake_transaction_v1`, and `20260916000000_relaunch_guard_data_foundation_v1` (issue #190). Do not replay them and do not invent ledger rows for them. `pendingMigrations()` is empty. `20261106200000` was applied once to DEV. Do not replay it. Do not apply it to Production. The live ledger is 115 because those three foundation files stay omitted: 118 repository files minus that gap of three.

The Technical Architect applied the seven commercial files through forwarding instructions under their canonical versions. The stored SQL matches each GitHub file SHA-256. Each manifest entry is `appliedToDev: true`, `containsDataChange: false`, and `safeToReplay: false`. Do not replay them. Do not apply them to Production. `20261106120000_admin_commercial_verify_agent_test_call_v1.sql` and `20261106140000_telloya_standard_location_cap_v1.sql` are also applied on DEV, in that order, with the same three flags. Do not replay them. Do not apply either file to Production. The test-call file replaces handover functions. The location-cap file replaces `prevent_plan_overlap_v1`. The unapplied initiation file records a pre-authorised intent and binds the call id from the provider response. None of them deletes a number-owner row.

## 1. Migration order and dependencies

These seven files were applied in this order. A later file replaces functions installed by an earlier one. Applying the tier catalogue after the Guard file would drop Guard pricing. Do not replay the chain.

| Order | File | Depends on | What it adds |
| --- | --- | --- | --- |
| 1 | `20261105130000_admin_commercial_begin_setup_v1.sql` | Paid subscription, acceptance, checkout preparation, and payment evidence already on DEV through `20261104220000` | Begin-setup command and setup events. It does not confirm preferences, buy a number, or go live. |
| 2 | `20261105144256_admin_commercial_confirm_preferences_v1.sql` | Begin setup, including the `PROFILE_REQUIRED` provision state | Preference tables and confirm-preferences. Replaces the setup handover. |
| 3 | `20261105172055_admin_commercial_confirm_ai_configuration_v1.sql` | The preference tables from file 2 | Operator-attested AI configuration and the agent-owner lock. Replaces handover and confirm-preferences. `OPERATOR_ATTESTED` is not a provider check. |
| 4 | `20261105180000_telloya_tier_catalogue_v1.sql` | `plan_versions`, `plan_components`, and `commercial_plan_conditions` from the applied commercial foundation | Nullable `plan_versions.tier_code`. Replaces the commercial command and the Admin onboarding read. Inserts no plan, agreement, or price. |
| 5 | `20261105190000_telloya_guard_addon_v1.sql` | `tier_code` from file 4 | `admin_private.commercial_offer_guard_locations`. Replaces plan overlap, the billable amount, the commercial command, acceptance, and settlement. Guard is £9.99 per confirmed location. Enquiry interest is not a charge. |
| 6 | `20261105200000_admin_commercial_record_number_allocation_v1.sql` | Begin-setup events and the configuration tables from files 1 and 3. It stays after file 5 because handover reads the accepted Guard quantity | Operator-attested number allocation. Replaces handover and the voice-binding guard. A recorded number does not enable forwarding, does not turn routing on, and is not live. |
| 7 | `20261106003939_admin_commercial_record_forwarding_instructions_v1.sql` | The number allocation from file 6. Merged PR #431. It stays after that file and does not include the earlier six | Operator-attested forwarding instructions. A draft stays inside Admin. Sharing shows the approved text and assigned number, sets `forwarding_instructed_at`, and may move `FORWARDING_REQUIRED` to `TEST_REQUIRED`. Sharing does not enable forwarding, place a test call, or move the service to live. |

Repository checksums of the files applied to DEV. The SQL files were not edited for this record. Do not replay them.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `20261105130000_admin_commercial_begin_setup_v1.sql` | 20,224 | `2bce1b9f7e9c1f02de6a83c32b6d9d522851860fbb3076f3315a138897baf078` |
| `20261105144256_admin_commercial_confirm_preferences_v1.sql` | 66,885 | `894ae6c17786f5226ad797ad00617fb512ba3a6afd09bdd3092197e547a0f688` |
| `20261105172055_admin_commercial_confirm_ai_configuration_v1.sql` | 90,349 | `f034c3e1eaf902db517e73778a5b3efa6a1f1d0af319aa207b6c4424b0c64521` |
| `20261105180000_telloya_tier_catalogue_v1.sql` | 48,771 | `5ffe1f6495be87f9db3b83751a04af35e2899770a21c7241de49afa24bf48f67` |
| `20261105190000_telloya_guard_addon_v1.sql` | 124,261 | `32e57743c4e036875d7dcd948cd472a5b92b7871d211e63e0078541e0cc1eb67` |
| `20261105200000_admin_commercial_record_number_allocation_v1.sql` | 73,483 | `4b6ab6b1f383c3bfbc0b2b3a7b2ba907c37eed836294edca86661d7fe70a1dbe` |
| `20261106003939_admin_commercial_record_forwarding_instructions_v1.sql` | 64,845 | `64cd1aceb6aa66cd8ab1bac56758b189103a0b7b9bbb813a709a0f3d3981abda` |

PR #431 is merged on `develop` at `e415922e2f50d2336a80fa2046d678c3cb198663`. Its forwarding-instructions file is the current DEV ledger head. The checksum above is the GitHub file that the hosted statement matches.

## 2. Local rehearsal

Both rehearsals used in-process PGlite. Neither opened a connection to hosted DEV or Production.

- Clean schema: `telloya-commercial-readiness.database.test.ts` applies the repository chain from empty and finds begin setup, confirm preferences, confirm AI configuration, `plan_versions.tier_code`, `commercial_offer_guard_locations`, record-number allocation, and record-forwarding instructions. The commercial command body is the Guard version, so file 5 replaced file 4.
- Upgrade from the Step 10 checkpoint `20260929183214`: `upgrade.database.test.ts` applies the unseen tail in order. The seven commercial files are applied on DEV and are not safe to replay. The current repository head and DEV head are `20261106003939`.
- Recovery manifest: `manifest.test.ts` and `readiness.test.ts` agree that the DEV head and the repository head are `20261106003939`. Any file after that head stays pending.

Payment preparation leaves the Stripe product, price, and checkout session empty. Number allocation is a separate command and does not enable forwarding. Recording or sharing forwarding instructions is also separate: sharing can move a provision to `TEST_REQUIRED` and does not make it `LIVE`. Guard monitoring does not start from payment, begin setup, or forwarding instructions.

Reconciliation run on 6 November 2026, 12:25 UK: the commercial readiness rehearsal passed 5 tests. Upgrade, manifest, history, release readiness, forwarding-instruction, number-allocation, and setup-queue tests passed 156 tests. The customer handover view passed 8 tests.

## 3. Fixture coverage

`apps/admin/lib/commercial/telloya-catalogue.fixture.ts` is idempotent. A second and third install do not add rows or change an approved plan version. It is for the isolated test database only.

| Table | What the fixture stores |
| --- | --- |
| `product_catalogue` | Telloya and Complete, both left `DRAFT`. No Complete plan is inserted. |
| `plan_versions` | Basic, Growth, Pro, and one Custom quotation. Growth has two versions. |
| `plan_components` | One Telloya `LOCATION` component per plan. Caps are 1, except one Growth plan at 2. |
| `commercial_plan_conditions` | Published minute and price schedule, Guard unit £9.99, overage £0.25. Custom has no included minutes and no Guard unit. |
| `commercial_agreement_versions` | One approved row per plan. The body starts with “TEST ONLY. This is not a legal agreement and it is not approved for a customer.” |

Published amounts used by the rehearsal: Basic £49 / 120 minutes, Growth £79 / 300 minutes, Pro £120 / 500 minutes, Guard £9.99 per confirmed location, overage £0.25 per minute. The Custom row is a test quotation of £150 for one location. That amount is not an approved customer price.

Journey covered in the same test:

- Growth with Guard interest and no Admin-confirmed Guard location stays £79. No Guard location row is stored.
- Growth plus one confirmed Guard location is £88.99. A £79 acceptance is rejected. Checkout preparation copies £88.99 and leaves the Stripe price empty.
- Growth plus two confirmed Guard locations is £98.98.
- The same submission key returns the same offer. A stale onboarding version conflicts.
- A second customer cannot read the offer or the paid handover. A location from another business is rejected.
- Enquiry overage interest and a £40 cap are stored as interest. Acceptance records `overage_opt_in = false` and no cap.
- Custom for one location is offerable at the test quotation. Custom and Growth for one location are not offerable when the customer has two locations. The customer is not moved to another cap.
- Payment preparation does not verify the handover and does not create an entitlement. Begin setup before settlement is denied for payment.
- Local settlement of the £79 acceptance marks the handover verified and `not_started`. Entitlements stay at zero until a separate begin-setup call. That call creates one `PROFILE_REQUIRED` Telloya provision. It does not allocate a number, record forwarding instructions, create a Guard entitlement, start Guard monitoring, or move the service to live.
- `cases`, `paid_service_acceptances`, `guard_subscriptions`, and `commercial_forwarding_instructions` stay empty. Checkout rows stay `livemode = false`. No provision is `LIVE` and none has `forwarding_instructed_at` set.

## 4. Owner decisions still required

- The location and number policy is approved in `docs/telloya/phase-c/catalogue-proposal.md`: one operating location and one receptionist number on Basic, Growth and Pro. The cap-2 Growth row stays `DRAFT`. Approving it is rejected. `20261106140000` is applied on hosted DEV and must not be replayed. The same one-location check applies to a Complete bundle on Basic, Growth or Pro. A Custom cap of 2 is a separate quotation and is not limited to one location. A number correction keeps the previous E.164 reserved. Do not delete that owner row. The retirement states are in `docs/telloya/phase-c/number-lifecycle.md`. Do not approve an unlimited cap by leaving the component off a plan: an approved Telloya plan requires the component.
- The legal agreement text. The fixture text must not be copied into hosted DEV.
- Tax behaviour. The rehearsal uses `NOT_APPLICABLE` so a price can be accepted. That is not a tax decision.
- Whether any Custom quotation is offered, and at what amount. £150 is a test figure.
- The customer’s overage cap, which is still chosen at acceptance and is not authorised by the enquiry.
- Production stays at `20261014170000`. The seven files are already on DEV and must not be replayed there or applied to Production.

## 5. Later DEV steps

The seven files are already applied. Do not apply them again.

1. Read the DEV migration ledger. Stop unless the newest version is `20261106200000` and the count is 115. Stop if Production is not still `20261014170000`.
2. Compare each of the seven stored statements with the SHA-256 above. Stop if a stored statement differs. Do not edit the SQL and do not replay it.
3. `20261106120000_admin_commercial_verify_agent_test_call_v1.sql`, `20261106140000_telloya_standard_location_cap_v1.sql` and `20261106200000_admin_commercial_initiate_agent_test_call_v1.sql` are applied. Do not replay them. Do not apply them to Production. `pendingMigrations()` is empty.
4. Do not insert `product_catalogue`, `plan_versions`, `plan_components`, `commercial_plan_conditions`, or `commercial_agreement_versions` until the agreement text, tax behaviour, and Custom amount are approved. The location and number policy is approved in the catalogue proposal. That approval is not a hosted seed.
5. Leave `TELLOYA_ENQUIRY_ENABLED`, `TELLOYA_LAUNCHED`, `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED`, `ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED`, `ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED`, `ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED`, `ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED`, `ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED`, `ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED`, `ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED`, and `CUSTOMER_COMMERCIAL_SETUP_HANDOVER_READ_ENABLED` false.
6. Do not create Stripe products, prices, customers, or payment objects. Do not call Retell or change telephone routing.

## 6. Blockers to a real DEV end-to-end test

- No approved hosted plan or agreement exists. The location and number policy is approved in the catalogue proposal and is not a hosted seed. The test agreement is not customer terms.
- Tax treatment and any Custom price are undecided.
- Stripe prices for a combined Telloya and Guard total do not exist, and this record must not create them.
- Public enquiries stay off.
- Begin setup, preferences, AI configuration, number allocation, and forwarding instructions stay separate gated commands. Their migrations are on DEV. Settlement does not run them, and their flags stay off.
- Sharing forwarding instructions does not enable forwarding or make the service live.
- Guard monitoring, a live agent, and telephone routing do not start from payment, begin setup, number allocation, or forwarding instructions.
- The three foundation files missing from the DEV ledger remain a known history gap. Do not repair that gap.
