# AWS-native production database backup scheduler

Status: **SOURCE READY / AWS DEPLOYMENT REQUIRED**

## Why this exists

The GitHub Actions logical backup itself is healthy, but GitHub scheduled workflow events have
not executed frequently enough to guarantee the agreed **RPO <= 4 hours**. The primary
production scheduler therefore moves to Amazon EventBridge Scheduler.

The existing GitHub workflow remains available as a manual fallback until the AWS-native
path is proven, after which its scheduled trigger can be disabled.

## Runtime design

```
EventBridge Scheduler (rate 3 hours)
        |
        v
AWS CodeBuild
        |
        +-- clones public main branch
        +-- reads PROD Supabase Session Pooler URL from Secrets Manager
        +-- creates Supabase logical dump
        +-- verifies migration head
        +-- packages + SHA-256 checks
        +-- uploads and verifies objects
        v
Existing production DB backup S3 bucket
```

The stack reuses:

- `profilerelaunch-prod-db-backups-euw2-20261005`;
- its existing 7-day lifecycle retention; and
- the same logical backup object layout and completed-marker convention.

No Vercel runtime is involved.

## One manual secret is required

Create an AWS Secrets Manager secret in `eu-west-2`:

- Name: `profilerelaunch/prod/supabase-db-url`
- Secret type: Other type of secret
- Value: the full production Supabase **Session Pooler** URL on port 5432.

Store the connection string as the entire secret value, not as JSON. Use the same
percent-encoded password form already proven by the GitHub backup workflow.

Do not put the URL into CloudFormation parameters, CodeBuild plaintext variables, GitHub
comments, or documentation.

Copy the resulting secret ARN.

## Deploy the stack

Template:

`infra/aws/prod-db-backup-aws-native.yaml`

Recommended stack name:

`profilerelaunch-prod-db-backup-aws-native`

Region:

`eu-west-2`

Parameters:

- `BackupBucketName`: keep `profilerelaunch-prod-db-backups-euw2-20261005`
- `ProdSupabaseDbUrlSecretArn`: paste the Secrets Manager secret ARN
- `RepositoryCloneUrl`: keep the default public repository URL
- `RepositoryBranch`: keep `main`
- `ScheduleExpression`: keep `rate(3 hours)`
- `ScheduleState`: keep `ENABLED`

The stack creates named IAM roles and requires acknowledgement of
`CAPABILITY_NAMED_IAM`.

## What the stack creates

- private CodeBuild project `ProfileRelaunchProdDbBackupAwsNative`;
- CodeBuild IAM role scoped to the existing backup bucket and the single DB URL secret;
- EventBridge Scheduler IAM role scoped only to starting that CodeBuild project;
- EventBridge Scheduler schedule `profilerelaunch-prod-db-backup-3h`;
- CloudWatch Logs group with 14-day retention.

The CodeBuild project allows one concurrent build only. Scheduler retries are configured,
and the backup runner skips a duplicate full dump if the previous verified backup is under
two hours old.

## Acceptance

After CloudFormation reaches `CREATE_COMPLETE`:

1. Open CodeBuild > `ProfileRelaunchProdDbBackupAwsNative`.
2. Choose **Start build** once manually.
3. Require the build to reach `SUCCEEDED`.
4. Confirm the build log reports a backup ID and migration alignment `true`.
5. Confirm the existing S3 bucket receives the new backup objects and a new
   `completed/<backup-id>.json` marker.
6. Leave the EventBridge schedule enabled.
7. After the first successful EventBridge-triggered build, disable the GitHub scheduled
   backup trigger while preserving manual `workflow_dispatch` fallback.

A build that uploads a valid backup but then reports a previous >4-hour gap is evidence
that the previous recovery interval breached policy; it does not mean the new backup was
lost.
