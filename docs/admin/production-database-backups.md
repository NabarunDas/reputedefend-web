# Production database backups

Status: **SOURCE READY / AWS BOOTSTRAP AND FIRST LIVE BACKUP REQUIRED**

## Recovery objectives

ProfileRelaunch launch recovery objectives are:

- **RPO: <= 4 hours**
- **RTO: <= 4 hours**

Supabase Pro provides a daily managed database backup with seven days of retention. The
daily copy remains the platform recovery path. It is not frequent enough by itself to
meet the four-hour RPO, so ProfileRelaunch also takes an independent logical backup every
three hours and keeps those copies for seven days.

The three-hour schedule intentionally leaves one hour of margin rather than scheduling
exactly on the RPO boundary.

## Backup design

`.github/workflows/prod-db-backup.yml` runs at minute 17 every three hours and can also
be started manually. It:

1. stays skipped on scheduled runs until `DB_BACKUP_ENABLED=true`; manual dispatch remains
   available for bootstrap;
2. assumes a dedicated AWS IAM role using GitHub OIDC;
3. checks the age of the most recent completed-backup marker and records a policy failure
   if the previous successful backup is more than four hours old;
4. uses Supabase CLI 2.119.0 to export roles, schema and data using Supabase's supported
   logical-backup path;
5. separately exports the `supabase_migrations` schema and data so migration history is
   recoverable;
6. records the repository and live database migration heads in a manifest;
7. packages the SQL and manifest into a gzip archive;
8. writes a SHA-256 checksum;
9. uploads the archive, checksum and manifest to private S3 with SSE-S3 encryption;
10. verifies all three S3 objects exist;
11. writes a small `completed/<backup-id>.json` marker only after verification; and
12. fails the workflow after preserving the completed backup if the database migration head differs from the
    repository or if the previous successful backup gap exceeded four hours.

The backup is never uploaded as a GitHub Actions artifact and is never committed to the
repository.

Object layout:

```
s3://<bucket>/backups/YYYY/MM/DD/<backup-id>/
  profilerelaunch-prod-db-<backup-id>.tar.gz
  profilerelaunch-prod-db-<backup-id>.tar.gz.sha256
  manifest.json

s3://<bucket>/completed/<backup-id>.json
```

## Retention and cost position

The dedicated S3 bucket expires backup objects after seven days. There is no incremental
chain and no Glacier tier: at the current business scale a complete compressed logical
backup every three hours is simpler to restore and materially cheaper to operate than
PITR. Supabase's own seven-day daily backups remain unchanged.

## AWS bootstrap

The repository contains `infra/aws/prod-db-backup.yaml`. Deploy it once in the AWS
account used by ProfileRelaunch, in `eu-west-2`.

The stack creates:

- a private S3 bucket;
- SSE-S3 default encryption;
- all four S3 Block Public Access controls;
- a seven-day lifecycle expiry;
- a bucket policy denying non-TLS access;
- a GitHub OIDC provider if the account does not already have one; and
- a GitHub Actions role scoped to this repository's `main` branch with only
  `ListBucket`, `GetBucketLocation`, `PutObject` and `GetObject` for the backup
  prefix.

The role has **no `DeleteObject` permission**. The lifecycle service, not the workflow,
removes expired backups.

If the AWS account already has the GitHub OIDC provider
`token.actions.githubusercontent.com`, supply its ARN to
`ExistingGitHubOidcProviderArn` instead of creating a second provider.

### CloudFormation parameters

- `BackupBucketName`: choose a globally unique name, for example
  `profilerelaunch-prod-db-backups-<account-id>`.
- `GitHubOwner`: `NabarunDas`.
- `GitHubRepository`: `reputedefend-web`.
- `GitHubBranch`: `main`.
- `ExistingGitHubOidcProviderArn`: blank unless one already exists.

The stack requires acknowledgement of IAM resource creation.

## GitHub configuration

After the stack succeeds, use its Outputs to configure the repository.

Repository **secret**:

- `PROD_SUPABASE_DB_URL` — the production Supabase **Session pooler** connection string
  including the percent-encoded database password. Do not use a transaction-pooler URL.

Repository **variables**:

- `AWS_DB_BACKUP_BUCKET` — stack output `BackupBucketName`.
- `AWS_DB_BACKUP_ROLE_ARN` — stack output `BackupRoleArn`.
- `AWS_DB_BACKUP_REGION` — `eu-west-2`.
- `DB_BACKUP_ENABLED` — leave absent/false until the first manual backup succeeds; then set to `true` to activate the three-hour schedule.

The AWS role ARN and bucket name are identifiers rather than credentials; the database URL
is a secret.

No static AWS access key is used. GitHub requests a short-lived OIDC token and AWS permits
only the configured repository and `main` branch to assume the role.

## First-live-backup acceptance

After AWS and GitHub configuration:

1. manually dispatch **Production database backup** from GitHub Actions;
2. require a green workflow;
3. confirm the S3 prefix contains the archive, checksum and manifest;
4. inspect `manifest.json`: `migration_aligned` must be `true`;
5. record the backup timestamp;
6. set repository variable `DB_BACKUP_ENABLED=true`; and
7. confirm the next scheduled run executes rather than skips.

A backup that is uploaded but followed by a red policy step is **not** accepted as a
healthy recovery state until the reported migration drift or >4-hour gap is understood.

## Restore use

Step 22B restores one of these copies into a throwaway Supabase project, never over
production. Before restore:

1. download the archive, checksum and manifest from S3;
2. verify the archive SHA-256 exactly;
3. extract `roles.sql`, `schema.sql`, `data.sql`, `history_schema.sql` and
   `history_data.sql`;
4. create a fresh recovery target;
5. restore roles/schema/data using the current Supabase restore procedure;
6. restore migration history separately;
7. verify the restored migration head and recovery fingerprint;
8. reconcile evidence metadata against the independent AWS evidence-object inventory; and
9. measure incident declaration to usable service against the <=4h RTO target.

The logical dump includes database data such as Supabase Auth user records, but it does not
restore external configuration such as Auth settings/API keys or evidence bytes. Those
remain explicit Step 22B reconciliation work.
