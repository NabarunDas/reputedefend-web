# DEV-HISTORY-01 — recover the applied DEV migration statements

This record places seven statements that are already in the DEV ledger
(`profilerelaunch-dev`, `rmzozuiamjcclvtgutgd`) into `supabase/migrations` and
the recovery manifest. It does not execute those statements, insert ledger
rows, or change Production (`cxwwekdzkkjjbiyofrov`).

The observed DEV ledger head is `20261019163645 admin_journey_05_assessment_dev_v1`.
The repository applied-file head is the same version. Production and AWS
`ApprovedMigrationHead` stay `20261014170000 evidence_content_sha256_v1`.

The separate Step 10B proposal `20261019183000` is not part of this chain. It
stays on draft PR #233 and remains unapplied.

## How the statements were recovered

This environment had no DEV database credential, so `schema_migrations.statements`
was not read here. The seven versions, names and character counts come from the
read-only ledger review on PR #233. Each statement below is the git blob whose
timestamp, deployment record, byte or character count, and comment-stripped
logic match that review. The SHA-256 values lock those bytes. A later live read
of the ledger can confirm them. A mismatch is a stop, not a reason to replay.

Comment-stripped comparison drops full-line `--` comments and trailing `--`
comments, then removes whitespace. It is used only where the review said the
live logic matched a document after comments and whitespace. It is not treated
as byte equality.

Headers inside the statements are the text that was applied. Several still say
`UNAPPLIED` or `NOT a migration` because that was the source text at application
time. Those words are historical contents, not the current status, and they are
not edited.

## The seven statements

| Ledger version | Name | Migration file | SHA-256 | Bytes | Chars | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `20261016175917` | `admin_journey_02_dev_intake_review_screening_v1` | `supabase/migrations/20261016175917_admin_journey_02_dev_intake_review_screening_v1.sql` | `147c2475b5ed2b596191b5c7d8c9b124995dc056da9b5a528639c70a943c7382` | 11802 | 11802 | `84c1c490eae9572cb028b2cac8dd538245c20c4f` `docs/admin/proposed-admin-journey-02.sql`, before the comment-only annotation. Comment-stripped equal to the current document. Not byte-equal. |
| `20261017111446` | `admin_journey_03b_evidence_draft_wording_dev_v1` | `supabase/migrations/20261017111446_admin_journey_03b_evidence_draft_wording_dev_v1.sql` | `a35e909f07ad535b5a5a46fe9278d85f99883ca51a3ed89df798f0d734c6b444` | 10491 | 10491 | `9dc714d4de6f09b070de6cbc37c2789f11876980`, byte-equal to `docs/admin/20261016233000_admin_journey_evidence_draft_wording_v1.sql`. Not the 7408-character `docs/admin/proposed-admin-journey-03a-draft-wording.sql`. |
| `20261017113702` | `get_help_legacy_country_match_dev_v1` | `supabase/migrations/20261017113702_get_help_legacy_country_match_dev_v1.sql` | `1bba4beca6371a30e3bae5e07e1fed5d8c55fd02fdd34ae4eb949af5d84ca1f3` | 12909 | 12909 | `fe945768891be45d922ac16f77e4eba60d2bbb60` `docs/customer/proposed-intake-country-key-v1.sql`, before the comment-only annotation. Comment-stripped equal to the current document. Not byte-equal. |
| `20261017145801` | `admin_journey_03c_customer_templates_v2_draft_dev` | `supabase/migrations/20261017145801_admin_journey_03c_customer_templates_v2_draft_dev.sql` | `27fd47e35aa3ffd514b1db495eda57c9459bf0ece5b7ed403f4599698cf8bb5d` | 2690 | 2686 | Byte-equal to `docs/admin/20261017143000_admin_journey_communication_templates_v2.sql` at `4835c33975ffda1a76ae1d083873d7e574581d24`. The applied header still says unapplied. |
| `20261017210826` | `comms_brand_evidence_request_v3_dev` | `supabase/migrations/20261017210826_comms_brand_evidence_request_v3_dev.sql` | `0ad8b518b98836de804978c53f5beba90a8b12a9481787723ee8b9dd02b216a5` | 34443 | 34433 | Byte-equal to `docs/admin/20261017170000_comms_brand_evidence_request_v3.sql` at `4fcb3e2f0c037ef86c44f28a9a61e46d45459757`. 34433 characters because five characters are multibyte. The ledger name is not in the filename. The applied header still says unapplied. |
| `20261017215625` | `admin_template_full_body_preview_dev_v1` | `supabase/migrations/20261017215625_admin_template_full_body_preview_dev_v1.sql` | `498937cfdf285e21d510269640eedf4e0851e15449c41b81e7816d0310e5f689` | 1244 | 1244 | Byte-equal to `docs/admin/proposed-admin-template-full-preview-v1.sql` at `2d1fdbc93fa674bd3524e18380e6ebf561a59085`. |
| `20261019163645` | `admin_journey_05_assessment_dev_v1` | `supabase/migrations/20261019163645_admin_journey_05_assessment_dev_v1.sql` | `59cf85ef08606b940c2387a84b6bb8ba0a823769f605096b7bb7b055c7618c7c` | 20283 | 20283 | `97e64112aaab92e33888b4f0cfca1a84b97a4435` `docs/admin/proposed-admin-journey-05-assessment.sql`, before the later comment annotation. Comment-stripped equal to the current document. Not byte-equal. The applied header still says it is not a migration. |

## What each statement changes

None of these files contains a secret or a customer record.

- `20261016175917` replaces no rows. It adds `admin_case_journey_decision_v1` and `admin_case_journey_intake_v1`, grants execute to `service_role`, and revokes `PUBLIC`, `anon` and `authenticated`.
- `20261017111446` replaces communication functions, including `admin_communication_revise_evidence_draft_v1`. It grants `service_role` and does not send mail.
- `20261017113702` adds `public._intake_country_key` and replaces `create_case_intake_v1`. It does not rewrite customer, business or location rows. The helper is revoked from `PUBLIC` and, where those roles exist, from `anon` and `authenticated`. It is not granted to `service_role`. `CREATE OR REPLACE` keeps the existing `service_role` grant on the intake function.
- `20261017145801` inserts `EVIDENCE_REQUEST` version 2 and `CASE_UPDATE` version 2 as `DRAFT`. It does not approve either row and does not send mail.
- `20261017210826` inserts `EVIDENCE_REQUEST` version 3 as `DRAFT`. It does not set that row to `APPROVED`, does not retire version 2, and does not enable sending, inbound mail or Reply-To. Other inserts in the file sit inside function bodies.
- `20261017215625` replaces `admin_private.template_public_json_v1`. It does not change template rows.
- `20261019163645` creates `public.case_assessments` with row security, revokes table access from `PUBLIC`, `anon`, `authenticated` and `service_role`, and grants the command and read functions to `service_role` only. It does not approve a fee or send mail.

`containsDataChange` is true only for the two template inserts, `20261017145801` and `20261017210826`. Every entry is `appliedToDev: true` and `safeToReplay: false`.

## Isolation

These files are in `supabase/migrations` so a disposable rebuild can reproduce the DEV schema. That location does not authorise a Production apply and does not authorise a second DEV apply.

- Do not replay them on DEV. The ledger already contains these versions.
- Do not apply them to Production. A future Production release needs its own review of the exact statement and its order.
- Do not treat DEV head `20261019163645` as the Production head.
- Disposable PGlite rehearsals apply the chain to a throwaway database. That is not a live apply.
- Draft template rows do not become the live approved template and do not turn sending on.

`pendingMigrations()` is empty on this chain. `20261019183000` is absent from it.
