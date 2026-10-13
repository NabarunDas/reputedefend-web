# SEC-01: 12 October 2026 backup gap and connectivity hardening

## Verified incident evidence

After the AWS-native stack update on 11 October 2026 at 18:52:49 UTC,
scheduled backups continued every three hours. During post-release acceptance:

| UTC time | AWS CodeBuild build | Verified result |
| --- | --- | --- |
| 2026-10-11 21:39 | Backup completion marker | Healthy, previous gap 10,756 seconds |
| 2026-10-12 00:38 | fb8ca1f6-31d4-4e11-a02d-fb9d8a875bcb | **FAILED** in BUILD before backup upload; PostgreSQL connection check failed; exit 2 |
| 2026-10-12 03:38 | 81cec51e-a263-4ae3-be8d-c11f856db0fc | Database connected, valid completed backup 20261012T033908Z uploaded, build then exited 1 under RPO policy |
| 2026-10-12 03:39 | Backup completion marker | Migration aligned; recorded previous gap 21,555 seconds (about six hours) |

The second failed build did **not** mean a second backup was missing.
The completed S3 marker remained valid; the nonzero status correctly recorded
the earlier four-hour RPO breach. No change to the policy failure condition
is authorised by this hardening.

The diagnostic classified the first failure as POSTGRES_CONNECT_FAILED.
It did not distinguish network, pooler, Docker startup or credentials as the
proximate cause; do not claim confirmed Supabase service outage.

At the 13 October read-only check, the deployed scheduler remained
ENABLED at rate(3 hours), 11 of the 13 post-deployment builds had succeeded,
and the newest backup was 93 minutes old. Later completed markers showed
migration alignment and no additional >4h gaps within the sampled period.
The **historical breach is retained**, not retroactively erased.

## Targeted correction

Update only the reviewed Production backup runner
(`scripts/prod-db-backup-aws.sh`) to retry the **initial, read-only PostgreSQL
migration-head/connectivity probe** up to three times with 15s then 30s pauses.
No full CodeBuild retry is enabled, no retry occurs after a completed S3
backup, and a third failure remains a hard exit 2. A malformed/ambiguous
migration-head response still fails immediately.

Avoid setting CloudFormation `AutoRetryLimit: 1` on the whole CodeBuild
project without further design: the existing runner returns nonzero **after**
uploading a valid backup if migration/RPO policy failed. An automatic job retry
can encounter the 30-minute duplicate guard, exit zero with no backup, and
make the latest job appear green despite the earlier policy failure.
Keeping retry scoped to the initial connectivity probe preserves that signal.

The tests simulate (a) a single failed connection then successful completion,
(b) all three failed attempts with no uploaded objects, and (c) existing
migration policy failure after a verified upload. Docker and sleep are stubbed
only in unit tests; the Production runner uses real 15s/30s backoffs.

## Controlled release and acceptance

**Do not use the PR-head SHA** as `ApprovedRunnerCommit` in AWS if merging by
squash. Once tests and review pass, record the **post-merge SHA** from main and
the SHA-256 of the runner at that SHA. Only then update the **existing**
CloudFormation stack `profilerelaunch-prod-db-backup-aws-native` in
`eu-west-2`. Preserve the other parameters:

- `BackupBucketName`
- `ProdSupabaseDbUrlSecretArn`
- `RepositoryCloneUrl`
- `ApprovedBackupCliLockSha256`
- `ApprovedMigrationHead`
- `ScheduleExpression=rate(3 hours)`
- `ScheduleState=ENABLED`

Keep the existing CodeBuild project, schedule, bucket, keys and secret. Do not
rotate credentials, create a second schedule or disable the current one.
Review a CloudFormation change set before execution, ensure only the expected
CodeBuild configuration changes, and deploy immediately after a valid backup
while within the RPO window.

Post-release acceptance:
1. Confirm stack UPDATE_COMPLETE and original scheduler ENABLED at 3h.
2. Verify CodeBuild still pins the reviewed post-merge commit and checksum.
3. Require the next genuine scheduled backup to succeed and upload a new
   completed marker with aligned migration and no fresh policy gap.
4. Verify archive and manifest integrity; retain the old incident evidence.
5. If the new runner fails, do not blindly retry or overwrite. Diagnose first,
   then use the reviewed rollback to the previously pinned runner if required.
6. Continue to assess the full RTO objective, recovery project data cleanup,
   Storage/evidence recovery and end-to-end service testing separately.

This is a hardening measure, not proof the root connectivity fault can never
recur or proof of continued RPO compliance. The four-hour RPO remains a
monitored operational objective.
