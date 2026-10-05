import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(
  new URL("../../../../.github/workflows/prod-db-backup.yml", import.meta.url),
  "utf8",
)
const cloudFormation = readFileSync(
  new URL("../../../../infra/aws/prod-db-backup.yaml", import.meta.url),
  "utf8",
)
const runbook = readFileSync(
  new URL("../../../../docs/admin/production-database-backups.md", import.meta.url),
  "utf8",
)

describe("production database backup policy", () => {
  it("runs inside the four-hour RPO with a three-hour cadence", () => {
    expect(workflow).toContain('cron: "17 */3 * * *"')
    expect(workflow).toContain("age_seconds > 14400")
    expect(runbook).toContain("RPO: <= 4 hours")
    expect(runbook).toContain("RTO: <= 4 hours")
  })

  it("uses short-lived AWS identity and never GitHub artifacts", () => {
    expect(workflow).toContain("id-token: write")
    expect(workflow).toContain("aws-actions/configure-aws-credentials@v6.3.0")
    expect(workflow).not.toContain("upload-artifact")
    expect(workflow).not.toContain("AWS_ACCESS_KEY_ID")
    expect(workflow).not.toContain("AWS_SECRET_ACCESS_KEY")
  })

  it("uses the supported Supabase logical backup shape and preserves migration history", () => {
    expect(workflow).toContain("supabase/setup-cli@v1")
    expect(workflow).toContain("version: 2.119.0")
    expect(workflow).toContain("--role-only")
    expect(workflow).toContain("--data-only")
    expect(workflow).toContain("--schema supabase_migrations")
    expect(workflow).toContain("history_schema.sql")
    expect(workflow).toContain("history_data.sql")
  })

  it("keeps backups private, encrypted and short-lived without workflow delete rights", () => {
    expect(cloudFormation).toContain("BlockPublicAcls: true")
    expect(cloudFormation).toContain("RestrictPublicBuckets: true")
    expect(cloudFormation).toContain("SSEAlgorithm: AES256")
    expect(cloudFormation).toContain("ExpirationInDays: 7")
    expect(cloudFormation).toContain("s3:PutObject")
    expect(cloudFormation).toContain("s3:GetObject")
    expect(cloudFormation).not.toContain("s3:DeleteObject")
    expect(cloudFormation).not.toContain('Action: "s3:*"\n                Resource: !Sub')
  })

  it("limits GitHub OIDC assumption to this repository main branch", () => {
    expect(cloudFormation).toContain("token.actions.githubusercontent.com:aud: sts.amazonaws.com")
    expect(cloudFormation).toContain(
      'token.actions.githubusercontent.com:sub: !Sub "repo:${GitHubOwner}/${GitHubRepository}:ref:refs/heads/${GitHubBranch}"',
    )
  })
})
