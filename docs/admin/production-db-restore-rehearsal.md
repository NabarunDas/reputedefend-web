# SEC-01 production database restore rehearsal (isolated)

## Approved scope

Use scripts/recovery/restore-prod-backup-to-sandbox.sh to restore one reviewed
Production logical database backup from private S3 to an empty, isolated Supabase
recovery project. Never use it against Production or the ordinary DEV project.

Pinned destinations and sources:
- AWS account: 337909767363; backup region: eu-west-2
- Bucket: profilerelaunch-prod-db-backups-euw2-20261005
- Source: cxwwekdzkkjjbiyofrov (Production)
- Target: mguynvowyhupycznwbyd (ProfileRelaunch-Restore, eu-west-1)
- Client: PostgreSQL 17, connecting to the Session pooler on port 5432

The script refuses non-empty destinations and requires an operator to explicitly
confirm the target project ID before making changes. To rerun a rehearsal, arrange
another approved empty recovery project and review an update to the script's pinned
target reference. NEVER disable the empty-target check, run against DEV/PROD, or
automatically delete/reinitialize a populated Supabase project.

This is a *manual* recovery script, not a scheduler, GitHub workflow or application
runtime. It must not contain secrets, SQL dump contents or customer information.
The temporary restored project must remain disconnected from live applications,
email delivery, scheduled jobs and external integrations.

## Prerequisites and usage

1. Select a Production backup ID (UTC YYYYMMDDTHHMMSSZ) within S3's 7-day
   retention and ensure it has a completed marker.
2. Use AWS CloudShell in the approved account with permission to READ backup
   objects. No S3 write/delete permission is required.
3. Install PostgreSQL client 17, AWS CLI, jq, Python 3, tar and sha256sum.
   On Amazon Linux 2023, PostgreSQL 16 and 17 client packages may conflict.
4. Verify the isolated restore project is empty and approved to hold a temporary
   copy of Production data, including Auth records, in Ireland.
5. Obtain the **RESTORE project's** Supabase Connect > Session pooler hostname
   and its database password; enter credentials interactively, not in chat,
   source control, shell history, CI, tickets or terminal tracing.
6. Check out an APPROVED Git commit and review the script. Do not execute
   an unreviewed branch tip fetched at incident time.

From a reviewed checkout:

    bash scripts/recovery/restore-prod-backup-to-sandbox.sh 20261011T183908Z

The sample ID above refers to the historical October 11 rehearsal only. Choose
the approved current recovery point when actually running the utility.

## Safety and verification sequence

1. Verify AWS account, PostgreSQL major version and required local utilities.
2. Download tarball, SHA256, manifest and completion marker to a private temp
   directory and verify archive integrity plus six exact archive members.
3. Check Production source project reference, migration alignment and RPO gap.
4. Copy roles.sql privately and omit exactly one unsupported statement:
   GRANT SET ON PARAMETER "log_min_messages" TO ...;
   The reviewed workaround expects the 15-line SQL roles file and line 13.
   If that file format changes, the utility stops for manual review.
5. Connect via TLS as the pinned restore-project database user. Verify it is
   empty and explicitly ask the operator to acknowledge the target.
6. Restore roles, schema and data inside a single SQL transaction; apply
   migration schema/history in a second transaction. Stop at the first error.
7. Compare resulting migration head to the manifest; report only aggregate
   counts (public tables, RLS-enabled tables, Auth users, Storage metadata,
   migration history records).
8. Delete all temporary backup/SQL files on exit. A private 0600 diagnostic
   log remains in CloudShell until handled under the data retention policy.
   Never paste its raw contents into chat or issues.

A failed second (migration history) transaction can leave the main data restore
committed. Do not rerun blindly or try to clear an unknown database.

## Evidence from the successful 11 October 2026 rehearsal

- Backup ID: 20261011T183908Z
- Source: Production backup in the dedicated private S3 bucket
- Target: ProfileRelaunch-Restore, PostgreSQL 17.11
- Original S3 archive and SHA256: verified, unmodified
- Temporary roles.sql fix: omit a single managed-role logging-parameter grant
- Main roles/schema/data transaction: PASSED
- Separate migration history: PASSED
- Migration head: 20261004223358|data_api_default_privileges_hardening_v1
- Public application tables: 102
- Public tables with row-level security enabled: 102 (independently verified)
- Auth users: 1
- Storage metadata: 0
- Migration history records: 38
- Observed execution elapsed: 61 seconds

These values describe THAT backup and are not hard-coded for later recovery
points. The 61-second database restore is NOT a full disaster-recovery RTO
measurement. The new reusable utility is based on a successfully executed
manual procedure, but this exact checked-in version still needs its own test
against a fresh recovery target before production recovery use.

## Boundaries and closeout

- Database-only logical backups do not include actual Supabase Storage object
  bytes, all external Auth/provider configuration, service keys, evidence bytes,
  DNS or application integration. Reconcile these separately for full recovery.
- The recovery copy includes one Production Auth user. Once evidence collection
  and verification finish, use the approved process to destroy the disposable
  restore project, without touching ordinary DEV or PROD.
- Independently verify that scheduled CodeBuild jobs following the 30-minute
  duplicate-guard deployment produce new completed manifests with the approved
  runner SHA, migration_aligned=true, previous_backup_gap_over_rpo=false and
  successful job status; historical gaps remain recorded.
- Keep SEC-02 Production migration deployment gated until required SEC-01
  backup and recovery assessments are complete. Coordinate a future migration
  with an ApprovedMigrationHead update in the AWS backup runner.
- Agreed recovery objectives: RPO <=4 hours, RTO <=4 hours. Proving a database
  restore is only one part of end-to-end recovery acceptance.

Related docs: production-database-backups.md and
aws-native-production-database-backups.md.
