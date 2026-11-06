# Telloya Phase C-01 commercial readiness

Status: local rehearsal only. Hosted DEV and Production were not changed.

Observed DEV head, from the recovery manifest and not from a new hosted query: `20261105120000_telloya_voice_persistence_v1`. The verified ledger has 105 entries. The repository has 114 migration files. Three foundation files are present in the repository and in the live schema, and absent from that 105-row ledger: `20260915120000_core_data_foundation_v1`, `20260915193000_case_intake_transaction_v1`, and `20260916000000_relaunch_guard_data_foundation_v1` (issue #190). Do not replay them and do not invent ledger rows for them.

`pendingMigrations()` is exactly these six files. Each has `appliedToDev: false`, `containsDataChange: false`, and `safeToReplay: false`.

## 1. Migration order and dependencies

Apply only in this order. A later file replaces functions installed by an earlier one. Applying the tier catalogue after the Guard file would drop Guard pricing.

| Order | File | Depends on | What it adds |
| --- | --- | --- | --- |
| 1 | `20261105130000_admin_commercial_begin_setup_v1.sql` | Paid subscription, acceptance, checkout preparation, and payment evidence already on DEV through `20261104220000` | Begin-setup command and setup events. It does not confirm preferences, buy a number, or go live. |
| 2 | `20261105144256_admin_commercial_confirm_preferences_v1.sql` | Begin setup, including the `PROFILE_REQUIRED` provision state | Preference tables and confirm-preferences. Replaces the setup handover. |
| 3 | `20261105172055_admin_commercial_confirm_ai_configuration_v1.sql` | The preference tables from file 2 | Operator-attested AI configuration and the agent-owner lock. Replaces handover and confirm-preferences. `OPERATOR_ATTESTED` is not a provider check. |
| 4 | `20261105180000_telloya_tier_catalogue_v1.sql` | `plan_versions`, `plan_components`, and `commercial_plan_conditions` from the applied commercial foundation | Nullable `plan_versions.tier_code`. Replaces the commercial command and the Admin onboarding read. Inserts no plan, agreement, or price. |
| 5 | `20261105190000_telloya_guard_addon_v1.sql` | `tier_code` from file 4 | `admin_private.commercial_offer_guard_locations`. Replaces plan overlap, the billable amount, the commercial command, acceptance, and settlement. Guard is £9.99 per confirmed location. Enquiry interest is not a charge. |
| 6 | `20261105200000_admin_commercial_record_number_allocation_v1.sql` | Begin-setup events and the configuration tables from files 1 and 3. It stays after file 5 because handover reads the accepted Guard quantity | Operator-attested number allocation. Replaces handover and the voice-binding guard. A recorded number is not routing and not live. |

Repository checksums for a later hosted apply. Compare the file bytes before applying. Do not edit the files.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `20261105130000_admin_commercial_begin_setup_v1.sql` | 20,224 | `2bce1b9f7e9c1f02de6a83c32b6d9d522851860fbb3076f3315a138897baf078` |
| `20261105144256_admin_commercial_confirm_preferences_v1.sql` | 66,885 | `894ae6c17786f5226ad797ad00617fb512ba3a6afd09bdd3092197e547a0f688` |
| `20261105172055_admin_commercial_confirm_ai_configuration_v1.sql` | 90,349 | `f034c3e1eaf902db517e73778a5b3efa6a1f1d0af319aa207b6c4424b0c64521` |
| `20261105180000_telloya_tier_catalogue_v1.sql` | 48,771 | `5ffe1f6495be87f9db3b83751a04af35e2899770a21c7241de49afa24bf48f67` |
| `20261105190000_telloya_guard_addon_v1.sql` | 124,261 | `32e57743c4e036875d7dcd948cd472a5b92b7871d211e63e0078541e0cc1eb67` |
| `20261105200000_admin_commercial_record_number_allocation_v1.sql` | 73,483 | `4b6ab6b1f383c3bfbc0b2b3a7b2ba907c37eed836294edca86661d7fe70a1dbe` |

Open PR #431 adds `20261106003939_admin_commercial_record_forwarding_instructions_v1.sql` on `cursor/record-forwarding-instructions-3eec`. That file is not in this chain. Do not merge or edit that branch from this work.

## 2. Local rehearsal

Both rehearsals used in-process PGlite. Neither opened a connection to hosted DEV or Production.

- Clean schema: `telloya-commercial-readiness.database.test.ts` applies the repository chain from empty and finds begin setup, confirm preferences, confirm AI configuration, `plan_versions.tier_code`, `commercial_offer_guard_locations`, and record-number allocation. The commercial command body is the Guard version, so file 5 replaced file 4.
- Upgrade from the Step 10 checkpoint `20260929183214`: `upgrade.database.test.ts` applies the unseen tail in order and still records the six files as not applied to DEV and not safe to replay. The tail ends at `20261105200000`.
- Recovery manifest: `manifest.test.ts` and `readiness.test.ts` agree that the DEV head is `20261105120000` and the repository head is `20261105200000`.

On 6 November 2026 those three files passed: the readiness rehearsal (5 tests), and the upgrade, manifest, and release-readiness files together (56 tests).

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
- Local settlement of the £79 acceptance marks the handover verified and `not_started`. Entitlements stay at zero until a separate begin-setup call. That call creates one `PROFILE_REQUIRED` Telloya provision. It does not allocate a number, create a Guard entitlement, start Guard monitoring, or move the service to live.
- `cases`, `paid_service_acceptances`, and `guard_subscriptions` stay empty. Checkout rows stay `livemode = false`.

## 4. Owner decisions still required

- How many Telloya locations each tier includes. The schema stores that as `plan_components.quantity_limit`. One current approved version is allowed for each tier and cap. The rehearsal caps are not a decision that a plan includes one location, two locations, or an unlimited number. Do not approve an unlimited cap by leaving the component off a plan: an approved Telloya plan requires the component.
- The legal agreement text. The fixture text must not be copied into hosted DEV.
- Tax behaviour. The rehearsal uses `NOT_APPLICABLE` so a price can be accepted. That is not a tax decision.
- Whether any Custom quotation is offered, and at what amount. £150 is a test figure.
- The customer’s overage cap, which is still chosen at acceptance and is not authorised by the enquiry.
- Approval to apply the six files to hosted DEV. Production stays at `20261014170000`.

## 5. Later DEV steps

Do not run these until the owner approves the apply. This phase did not.

1. Read the DEV migration ledger. Stop unless the newest version is `20261105120000` and the count is 105. Stop if Production is not still `20261014170000`.
2. Compare each of the six files with the SHA-256 above. Apply them one at a time, in the table order, without editing the SQL.
3. After each file, confirm its manifest probe exists and that no commercial catalogue row was inserted.
4. Do not insert `product_catalogue`, `plan_versions`, `plan_components`, `commercial_plan_conditions`, or `commercial_agreement_versions` until the location caps, agreement text, tax behaviour, and Custom amount are approved.
5. Leave `TELLOYA_ENQUIRY_ENABLED`, `TELLOYA_LAUNCHED`, `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED`, `ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED`, `ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED`, `ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED`, `ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED`, and `CUSTOMER_COMMERCIAL_SETUP_HANDOVER_READ_ENABLED` false.
6. Do not create Stripe products, prices, customers, or payment objects. Do not call Retell or change telephone routing.

## 6. Blockers to a real DEV end-to-end test

- The six migrations are not on hosted DEV.
- No approved hosted plan, agreement, or location cap exists. The test agreement is not that approval.
- Tax treatment and any Custom price are undecided.
- Stripe prices for a combined Telloya and Guard total do not exist, and this phase must not create them.
- Public enquiries stay off.
- Begin setup, preferences, AI configuration, and number allocation stay separate gated commands. Settlement does not run them.
- Forwarding instructions are only on open PR #431. A DEV test cannot record forwarding until that migration is reviewed and applied on its own.
- Guard monitoring, a live agent, and telephone routing do not start from payment or from begin setup.
- The three foundation files missing from the DEV ledger remain a known history gap. Do not repair that gap while applying this tail.
