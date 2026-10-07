import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const stack = readFileSync(
  new URL("../../../../infra/aws/prod-db-backup-aws-native.yaml", import.meta.url),
  "utf8",
)
const runner = readFileSync(
  new URL("../../../../scripts/prod-db-backup-aws.sh", import.meta.url),
  "utf8",
)

describe("AWS-native production database backup policy", () => {
  it("uses EventBridge Scheduler every three hours with retries", () => {
    expect(stack).toContain("AWS::Scheduler::Schedule")
    expect(stack).toContain("Default: rate(3 hours)")
    expect(stack).toContain("MaximumRetryAttempts: 3")
    expect(stack).toContain("MaximumEventAgeInSeconds: 3600")
    expect(stack).toContain("FlexibleTimeWindow:")
    expect(stack).toContain('Mode: "OFF"')
  })

  it("runs a single private CodeBuild project and retrieves the DB URL from Secrets Manager", () => {
    expect(stack).toContain("AWS::CodeBuild::Project")
    expect(stack).toContain("ConcurrentBuildLimit: 1")
    expect(stack).toContain("Type: SECRETS_MANAGER")
    expect(stack).toContain("ProdSupabaseDbUrlSecretArn")
    expect(stack).toContain("Visibility: PRIVATE")
    expect(stack).toContain("PrivilegedMode: true")
  })

  it("keeps the CodeBuild role scoped to the existing backup bucket and secret", () => {
    expect(stack).toContain("s3:GetBucketLocation")
    expect(stack).toContain("s3:ListBucket")
    expect(stack).toContain("s3:GetObject")
    expect(stack).toContain("s3:PutObject")
    expect(stack).toContain("secretsmanager:GetSecretValue")
    expect(stack).not.toContain("s3:DeleteObject")
    expect(stack).not.toContain('Action: "s3:*"')
  })

  it("preserves the logical backup, migration and RPO guardrails", () => {
    expect(runner).toContain('npx --yes "supabase@${CLI_VERSION}"')
    expect(runner).toContain("--role-only")
    expect(runner).toContain("--data-only")
    expect(runner).toContain("--schema supabase_migrations")
    expect(runner).toContain("RPO_SECONDS=14400")
    expect(runner).toContain("migration_aligned")
    expect(runner).toContain('completed/${backup_id}.json')
    expect(runner).toContain("sha256sum")
  })

  it("uses a duplicate guard so scheduler retries do not create duplicate full dumps", () => {
    expect(runner).toContain("DUPLICATE_GUARD_SECONDS=7200")
    expect(runner).toContain("No full backup is required for this invocation.")
  })
})
