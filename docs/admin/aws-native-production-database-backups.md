# AWS-native production database backup scheduler

Status: **LIVE SCHEDULER REMAINS ON THE PREVIOUS TEMPLATE UNTIL THE CUTOVER BELOW IS ACCEPTED**

The scheduled production backup continues to use the CloudFormation stack that is already
deployed. This document describes the reviewed replacement. Do not apply it from a pull
request, and do not create a second schedule.

## Why this exists

The GitHub Actions logical backup itself is healthy, but GitHub scheduled workflow events have
not executed frequently enough to guarantee the agreed **RPO <= 4 hours**. The primary
production scheduler therefore runs on Amazon EventBridge Scheduler.

The existing GitHub workflow remains available only as a manual fallback. Its scheduled
trigger stays disabled. This change does not alter that workflow, the DEV backup stack, the
bucket, the retention, or the recovery objectives.

## Runtime design

```
EventBridge Scheduler (rate 3 hours, one schedule)
        |
        v
AWS CodeBuild  (NO_SOURCE, one concurrent build)
        |
        +-- decodes the reviewed verifier from the buildspec
        +-- fetches exactly ApprovedRunnerCommit
        +-- checks the runner script and CLI lock checksums
        +-- reads the PROD Session Pooler URL from Secrets Manager
        +-- compares the live migration version with ApprovedMigrationHead
        +-- installs Supabase CLI 2.119.0 from the checksummed lockfile
        +-- writes the same logical dump as before
        v
Existing production DB backup S3 bucket
```

A branch name is not an execution source. The build fails closed, and deletes the checkout,
when the commit cannot be fetched or either checksum differs. There is no checkout of
`main` or `HEAD` if that check fails.

The stack still reuses:

- `profilerelaunch-prod-db-backups-euw2-20261005`;
- its existing 7-day lifecycle retention; and
- the same logical backup object layout and completed-marker convention.

No Vercel runtime is involved. No second scheduler is created. The schedule name remains
`profilerelaunch-prod-db-backup-3h`.

## What is approved, and how it changes

Three CloudFormation parameters are the release boundary.

| Parameter | What it pins | When to change it |
| --- | --- | --- |
| `ApprovedRunnerCommit` | The full 40-character lowercase commit that CodeBuild fetches | Only when the backup runner or its CLI lockfile changes, after that commit is reviewed and reachable |
| `ApprovedRunnerScriptSha256` | SHA-256 of `scripts/prod-db-backup-aws.sh` at that commit | In the same update as the runner commit |
| `ApprovedBackupCliLockSha256` | SHA-256 of `infra/aws/backup-cli/package-lock.json` at that commit | In the same update as the runner commit |
| `ApprovedMigrationHead` | Migration id the live database version must match (`<14 digits>_<name>`, no `.sql`) | When a reviewed migration has been applied to production. Leave the runner pin unchanged |

### Runner release

1. Review the runner, verifier, lockfile, and template together.
2. Merge only after review. `ApprovedRunnerCommit` is the **post-merge SHA** on the
   branch GitHub will serve. A squash merge produces a new commit. Do not use the draft
   pull request HEAD, the pre-merge branch tip, or a branch name.
3. At that SHA, compute both checksums:

   ```bash
   git checkout <reviewed-sha>
   sha256sum scripts/prod-db-backup-aws.sh infra/aws/backup-cli/package-lock.json
   ```

4. Update the existing stack with that SHA and both checksums in one change. Do not change
   only the commit, and do not point the commit at `main`.
5. Run the manual acceptance build in the cutover section before treating the release as live.

If the fetched script or lockfile does not match, the build exits 2 and does not dump the
database. That is the fail-closed behaviour.

### Migration-head release

Normal schema migrations do not require a new runner commit. After the migration is applied
to production, update only `ApprovedMigrationHead` to the migration filename without `.sql`.

The runner compares the live `supabase_migrations.schema_migrations` version with the
version prefix of that parameter. It does not treat the newest file in the checkout as the
expected head, so an immutable runner does not freeze an old head inside the script.

If the parameter is left behind, behaviour stays the same as today: the backup is uploaded
and verified, then the build exits 1 because `migration_aligned` is false. The completed
marker remains. That exit is the drift alarm. It is not a skipped backup and it does not
become a silent success. Include the parameter update in the same reviewed migration release
so the alarm is not left on permanently.

## Dependency execution

CodeBuild no longer runs `npx --yes supabase@2.119.0`. The runner executes:

```bash
npm ci --ignore-scripts --omit=dev --prefix infra/aws/backup-cli
```

`infra/aws/backup-cli/package-lock.json` is the reviewed bill of materials. npm checks each
package integrity hash while installing. The npm package `supabase@2.119.0` has no install
script. Its platform binary is the optional package `@supabase/cli-linux-x64@2.119.0`, which
also has no install script. The runner then executes that binary directly and exits 2 if
the installed package version is not `2.119.0` or the linux-x64 binary is missing. The
upstream shim does not download a replacement binary when the optional package is absent.

Residual risk, to be tested in a later isolated change: the build still downloads those
locked packages from the npm registry, and the Supabase CLI still starts `pg_dump` with the
`postgres:17-alpine` tag rather than an image digest. The next change is to vendor the
linux-x64 tarball for an offline `npm ci` and to pin the `pg_dump` image digest recorded
from an accepted production build. Do not combine that with a runner-pin rollout.

## Credentials

`SUPABASE_DB_URL` is injected by CodeBuild from Secrets Manager and is not a plaintext
environment variable in the template. The runner parses it, writes mode-0600 libpq
variables for the migration-head `psql`, unsets the URL, and redacts the URL and password
from captured command output before that output can reach the build log. The manifest,
checksum, and SQL uploads do not contain the URL.

`psql` receives `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`. It does not
receive the URL as an argument.

Residual risk: Supabase CLI 2.119.0 `db dump` has no libpq-env or pgpass connection. Each
dump still passes `--db-url` for the duration of that process, so the URL is in that
process's arguments. The runner does not echo it and does not enable shell tracing. The
next isolated change is to adopt a reviewed CLI or dump path that accepts a `PGPASSFILE`
without putting the URL in `argv`, then re-check restore compatibility. `PGPASSWORD` alone
does not replace `--db-url` for this CLI.

Fixture mode (`BACKUP_RUNNER_ALLOW_FIXTURE=1`) exists for local tests and accepts only
`postgresql://fixture:...@127.0.0.1:5432/postgres`. The CloudFormation project does not set
it. Fixture mode refuses the production pooler URL shape.

## Privileged execution

`PrivilegedMode` stays `true`. CodeBuild's `aws/codebuild/standard:7.0` image starts the
Docker daemon in privileged mode, the migration-head query runs
`docker run postgres:17-alpine`, and Supabase CLI 2.119.0 runs `pg_dump` inside a
container. Disabling privileged mode would change the dump path that already restores.
Treat privileged mode as a residual risk for a later isolated change: prove a
non-privileged project copy produces the same five SQL files and the same restore steps,
then switch the live project only after that acceptance. Do not turn it off in this
rollout.

## One manual secret is required

Create an AWS Secrets Manager secret in `eu-west-2` only if it does not already exist.
This rollout does not rotate it.

- Name: `profilerelaunch/prod/supabase-db-url`
- Secret type: Other type of secret
- Value: the full production Supabase **Session Pooler** URL on port 5432.

Store the connection string as the entire secret value, not as JSON. Use the same
percent-encoded password form already proven by the current backup.

Do not put the URL into CloudFormation parameters, CodeBuild plaintext variables, GitHub
comments, or documentation.

Copy the resulting secret ARN.

## Deploy the stack

Template:

`infra/aws/prod-db-backup-aws-native.yaml`

Stack name, already in use:

`profilerelaunch-prod-db-backup-aws-native`

Region:

`eu-west-2`

Parameters:

- `BackupBucketName`: keep `profilerelaunch-prod-db-backups-euw2-20261005`
- `ProdSupabaseDbUrlSecretArn`: the existing Secrets Manager secret ARN
- `RepositoryCloneUrl`: keep the default public repository URL
- `ApprovedRunnerCommit`: the reviewed 40-character SHA. There is no default.
- `ApprovedRunnerScriptSha256`: checksum of `scripts/prod-db-backup-aws.sh` at that SHA
- `ApprovedBackupCliLockSha256`: checksum of `infra/aws/backup-cli/package-lock.json` at that SHA
- `ApprovedMigrationHead`: the migration id production is expected to be on. The template default is the current repository head and is independent of the runner SHA.
- `ScheduleExpression`: keep `rate(3 hours)`
- `ScheduleState`: keep `ENABLED`

The stack creates named IAM roles and requires acknowledgement of
`CAPABILITY_NAMED_IAM`.

## What the stack creates

These logical resource names stay the same, so a stack update changes the existing
project and schedule in place:

- private CodeBuild project `ProfileRelaunchProdDbBackupAwsNative`;
- CodeBuild IAM role scoped to the existing backup bucket and the single DB URL secret;
- EventBridge Scheduler IAM role scoped only to starting that CodeBuild project;
- EventBridge Scheduler schedule `profilerelaunch-prod-db-backup-3h`;
- CloudWatch Logs group with 14-day retention.

The CodeBuild project allows one concurrent build only. Scheduler retries are configured
(`MaximumRetryAttempts` 3, `MaximumEventAgeInSeconds` 3600, flexible window off), and the
backup runner skips a duplicate full dump if the previous verified backup is under two
hours old. A non-zero build remains the failure signal. This rollout does not add another
notification service.

## Production cutover and rollback

Do this only after the runner commit has been reviewed. Until `update-stack` finishes,
the existing schedule keeps running the previous buildspec.

### 1. Current-state snapshot and rollback prerequisites

```bash
aws cloudformation get-template \
  --region eu-west-2 \
  --stack-name profilerelaunch-prod-db-backup-aws-native \
  --query TemplateBody \
  --output text > /tmp/profilerelaunch-prod-db-backup-aws-native.previous-template

aws cloudformation describe-stacks \
  --region eu-west-2 \
  --stack-name profilerelaunch-prod-db-backup-aws-native \
  --query 'Stacks[0].Parameters' \
  --output json > /tmp/profilerelaunch-prod-db-backup-aws-native.previous-parameters.json

aws s3api list-objects-v2 \
  --region eu-west-2 \
  --bucket profilerelaunch-prod-db-backups-euw2-20261005 \
  --prefix completed/ \
  --query 'sort_by(Contents,&LastModified)[-1].[Key,LastModified]' \
  --output text
```

Record the schedule state (`ENABLED`), the latest completed-marker key, and its time.
Confirm a restorable completed marker exists before changing the project. Do not delete
the stack, the schedule, the bucket, or any backup object. Do not disable the schedule
in order to deploy.

### 2. CloudFormation changes

The update replaces the CodeBuild buildspec and environment parameters on the existing
project. It removes `RepositoryBranch`. It adds `ApprovedRunnerCommit`,
`ApprovedRunnerScriptSha256`, `ApprovedBackupCliLockSha256`, and `ApprovedMigrationHead`.
The bucket, secret ARN, schedule name, three-hour rate, retry policy, log group, and IAM
role names stay the same.

### 3. Safe application sequence

Apply the update shortly after a successful scheduled backup, while that completed marker
is still inside the four-hour RPO. Leave `ScheduleState=ENABLED`.

`ApprovedRunnerCommit` must be the post-merge SHA. The draft pull request HEAD is not
that commit when the pull request is squash-merged.

```bash
aws cloudformation update-stack \
  --region eu-west-2 \
  --stack-name profilerelaunch-prod-db-backup-aws-native \
  --template-body file://infra/aws/prod-db-backup-aws-native.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=BackupBucketName,UsePreviousValue=true \
    ParameterKey=ProdSupabaseDbUrlSecretArn,UsePreviousValue=true \
    ParameterKey=RepositoryCloneUrl,UsePreviousValue=true \
    ParameterKey=ScheduleExpression,UsePreviousValue=true \
    ParameterKey=ScheduleState,ParameterValue=ENABLED \
    ParameterKey=ApprovedRunnerCommit,ParameterValue=<reviewed-40-hex-sha> \
    ParameterKey=ApprovedRunnerScriptSha256,ParameterValue=<sha256-of-scripts/prod-db-backup-aws.sh> \
    ParameterKey=ApprovedBackupCliLockSha256,ParameterValue=<sha256-of-infra/aws/backup-cli/package-lock.json> \
    ParameterKey=ApprovedMigrationHead,ParameterValue=20261004223358_data_api_default_privileges_hardening_v1
```

Wait until the stack is `UPDATE_COMPLETE`. If the update fails, CloudFormation rolls the
stack back to the previous template. Do not start a second stack while that is in progress.

### 4. Manual CodeBuild acceptance test

Start the build only when the newest `completed/` object is **at least 2 hours old**. A
newer marker makes the duplicate guard exit 0 without dumping, which does not prove the
new runner. If the marker is already older than 4 hours, the build can still upload a
valid backup and then exit 1 because of that gap.

```bash
aws codebuild start-build \
  --region eu-west-2 \
  --project-name ProfileRelaunchProdDbBackupAwsNative
```

There is still one project and one schedule.

### 5. Verified completed marker and artifact integrity

Require a new backup id in the log. In the existing bucket, require all of:

- `backups/YYYY/MM/DD/<backup-id>/profilerelaunch-prod-db-<backup-id>.tar.gz`
- `backups/YYYY/MM/DD/<backup-id>/profilerelaunch-prod-db-<backup-id>.tar.gz.sha256`
- `backups/YYYY/MM/DD/<backup-id>/manifest.json`
- `completed/<backup-id>.json`

Download the archive and checksum. The checksum file is the hex digest only. It must equal
`sha256sum` of the archive. The archive must contain `roles.sql`, `schema.sql`, `data.sql`,
`history_schema.sql`, `history_data.sql`, and `manifest.json`. The completed marker must
match the manifest. Confirm the build log does not contain the database URL or password.

### 6. Migration-head verification

`manifest.json` must show `migration_aligned: true`, `repo_migration_head` equal to
`ApprovedMigrationHead`, and `database_migration_head` starting with that migration's
14-digit version. `runner_script_sha256` and `backup_cli_lock_sha256` must equal the
parameters just deployed. Extra manifest keys are ignored by the existing restore steps.

### 7. Failed-run response

- Exit 0 and the log says no full backup is required: the duplicate guard ran. Wait until
  the marker is at least 2 hours old and start one more acceptance build.
- Exit 0 with a new backup id and `Migration head aligned: true`: acceptance passed.
  Leave the schedule enabled.
- Exit 1 after the log says the backup was uploaded and verified: the artifact and
  completed marker are kept. Read the manifest. A previous gap over 4 hours is the
  existing RPO alarm, not a lost backup. `migration_aligned: false` means this update is
  not accepted. Change only `ApprovedMigrationHead` if production was intentionally
  migrated; otherwise roll back.
- Exit 2, or a failed build before upload: no new completed marker. The previous marker
  remains the recovery point. Roll back if the new runner caused the failure.

### 8. Rollback without losing backup coverage

Do not delete the stack. Update it back to the saved template and the saved parameters,
including `RepositoryBranch=main` and `ScheduleState=ENABLED`. Keep the same bucket and
secret ARN. The schedule target stays the same project, so coverage continues on the
previously proven buildspec. Objects already written by the new runner remain valid
restore points; their layout matches the previous format.

```bash
aws cloudformation update-stack \
  --region eu-west-2 \
  --stack-name profilerelaunch-prod-db-backup-aws-native \
  --template-body file:///tmp/profilerelaunch-prod-db-backup-aws-native.previous-template \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters file:///tmp/profilerelaunch-prod-db-backup-aws-native.previous-parameters.json
```

If `update-stack` rejects the saved parameter file because it is a JSON array, pass each
saved key with `ParameterKey=...,ParameterValue=...` from that file. Do not omit
`ScheduleState`. After rollback, start one manual build only if the newest completed
marker is at least 2 hours old, and require a succeeded build or a understood policy exit.

## Acceptance

After the stack update reaches `UPDATE_COMPLETE` and the manual build is accepted:

1. Open CodeBuild > `ProfileRelaunchProdDbBackupAwsNative`.
2. Confirm that build reached `SUCCEEDED`, or exit 1 only for a known previous >4-hour gap
   after a verified upload.
3. Confirm the build log reports a backup ID and migration alignment `true` when the gap
   alarm is not the reason for a non-zero exit.
4. Confirm the existing S3 bucket received the new backup objects and a new
   `completed/<backup-id>.json` marker, and that the checksum matches.
5. Leave the EventBridge schedule enabled.
6. Keep the GitHub workflow as manual `workflow_dispatch` fallback only.

A build that uploads a valid backup but then reports a previous >4-hour gap is evidence
that the previous recovery interval breached policy; it does not mean the new backup was
lost.
